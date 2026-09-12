export interface OAuthClientRow {
  client_id: string;
  client_name: string;
  redirect_uris: string;
  token_endpoint_auth_method: string;
}

export interface AuthCodeRow {
  code: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  expires_at: string;
  used: number;
}

export interface TokenRow {
  access_token_hash: string;
  refresh_token_hash: string;
  client_id: string;
  expires_at: string;
  revoked: number;
}

export interface MachineRow {
  machine_id: string;
  agent_token_hash: string | null;
  last_seen_at: string | null;
}

export interface WorkspaceRow {
  id: number;
  machine_id: string;
  name: string;
  root_path: string;
}

export interface PairingCodeRow {
  code: string;
  machine_id: string;
  workspace_root: string;
  expires_at: string;
  approved: number;
  /** Hash of the token the CLI generated locally — the Gateway never sees the plaintext. */
  agent_token_hash: string;
}

/** Thin typed wrapper over the D1 binding — no ORM, just the queries this Gateway needs. */
export class Db {
  constructor(private readonly d1: D1Database) {}

  async insertClient(row: Omit<OAuthClientRow, never>): Promise<void> {
    await this.d1
      .prepare(
        `INSERT INTO oauth_clients (client_id, client_name, redirect_uris, token_endpoint_auth_method)
         VALUES (?, ?, ?, ?)`,
      )
      .bind(row.client_id, row.client_name, row.redirect_uris, row.token_endpoint_auth_method)
      .run();
  }

  getClient(clientId: string): Promise<OAuthClientRow | null> {
    return this.d1
      .prepare(`SELECT * FROM oauth_clients WHERE client_id = ?`)
      .bind(clientId)
      .first<OAuthClientRow>();
  }

  async insertAuthCode(row: AuthCodeRow): Promise<void> {
    await this.d1
      .prepare(
        `INSERT INTO oauth_authorization_codes
           (code, client_id, redirect_uri, code_challenge, code_challenge_method, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(row.code, row.client_id, row.redirect_uri, row.code_challenge, row.code_challenge_method, row.expires_at)
      .run();
  }

  getAuthCode(code: string): Promise<AuthCodeRow | null> {
    return this.d1
      .prepare(`SELECT * FROM oauth_authorization_codes WHERE code = ?`)
      .bind(code)
      .first<AuthCodeRow>();
  }

  async markAuthCodeUsed(code: string): Promise<void> {
    await this.d1.prepare(`UPDATE oauth_authorization_codes SET used = 1 WHERE code = ?`).bind(code).run();
  }

  async insertToken(row: TokenRow): Promise<void> {
    await this.d1
      .prepare(
        `INSERT INTO oauth_tokens (access_token_hash, refresh_token_hash, client_id, expires_at)
         VALUES (?, ?, ?, ?)`,
      )
      .bind(row.access_token_hash, row.refresh_token_hash, row.client_id, row.expires_at)
      .run();
  }

  getTokenByAccessHash(hash: string): Promise<TokenRow | null> {
    return this.d1
      .prepare(`SELECT * FROM oauth_tokens WHERE access_token_hash = ? AND revoked = 0`)
      .bind(hash)
      .first<TokenRow>();
  }

  getTokenByRefreshHash(hash: string): Promise<TokenRow | null> {
    return this.d1
      .prepare(`SELECT * FROM oauth_tokens WHERE refresh_token_hash = ? AND revoked = 0`)
      .bind(hash)
      .first<TokenRow>();
  }

  async revokeToken(accessTokenHash: string): Promise<void> {
    await this.d1
      .prepare(`UPDATE oauth_tokens SET revoked = 1 WHERE access_token_hash = ?`)
      .bind(accessTokenHash)
      .run();
  }

  async upsertMachine(machineId: string): Promise<void> {
    await this.d1
      .prepare(
        `INSERT INTO machines (machine_id) VALUES (?)
         ON CONFLICT(machine_id) DO NOTHING`,
      )
      .bind(machineId)
      .run();
  }

  async setMachineAgentTokenHash(machineId: string, agentTokenHash: string): Promise<void> {
    await this.d1
      .prepare(`UPDATE machines SET agent_token_hash = ? WHERE machine_id = ?`)
      .bind(agentTokenHash, machineId)
      .run();
  }

  async touchMachine(machineId: string): Promise<void> {
    await this.d1
      .prepare(`UPDATE machines SET last_seen_at = datetime('now') WHERE machine_id = ?`)
      .bind(machineId)
      .run();
  }

  getMachine(machineId: string): Promise<MachineRow | null> {
    return this.d1.prepare(`SELECT * FROM machines WHERE machine_id = ?`).bind(machineId).first<MachineRow>();
  }

  getMachineByAgentTokenHash(hash: string): Promise<MachineRow | null> {
    return this.d1
      .prepare(`SELECT * FROM machines WHERE agent_token_hash = ?`)
      .bind(hash)
      .first<MachineRow>();
  }

  async listMachines(): Promise<MachineRow[]> {
    const res = await this.d1.prepare(`SELECT * FROM machines`).all<MachineRow>();
    return res.results ?? [];
  }

  async upsertWorkspace(machineId: string, name: string, rootPath: string): Promise<void> {
    await this.d1
      .prepare(
        `INSERT INTO workspaces (machine_id, name, root_path) VALUES (?, ?, ?)
         ON CONFLICT(machine_id, name) DO UPDATE SET root_path = excluded.root_path`,
      )
      .bind(machineId, name, rootPath)
      .run();
  }

  /** Removes workspace rows for `machineId` whose name isn't in `keepNames` —
   * called after the agent reports its current set, so stale entries (from a
   * workspace root that's no longer paired, or a deleted .code-agent.json)
   * don't linger in workspaces_list pointing at something that no longer
   * resolves. */
  async pruneWorkspaces(machineId: string, keepNames: string[]): Promise<void> {
    if (keepNames.length === 0) {
      await this.d1.prepare(`DELETE FROM workspaces WHERE machine_id = ?`).bind(machineId).run();
      return;
    }
    const placeholders = keepNames.map(() => "?").join(", ");
    await this.d1
      .prepare(`DELETE FROM workspaces WHERE machine_id = ? AND name NOT IN (${placeholders})`)
      .bind(machineId, ...keepNames)
      .run();
  }

  async listWorkspaces(machineId: string): Promise<WorkspaceRow[]> {
    const res = await this.d1
      .prepare(`SELECT * FROM workspaces WHERE machine_id = ?`)
      .bind(machineId)
      .all<WorkspaceRow>();
    return res.results ?? [];
  }

  async insertPairingCode(row: Omit<PairingCodeRow, "approved">): Promise<void> {
    await this.d1
      .prepare(
        `INSERT INTO pairing_codes (code, machine_id, workspace_root, expires_at, agent_token_hash)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(row.code, row.machine_id, row.workspace_root, row.expires_at, row.agent_token_hash)
      .run();
  }

  getPairingCode(code: string): Promise<PairingCodeRow | null> {
    return this.d1.prepare(`SELECT * FROM pairing_codes WHERE code = ?`).bind(code).first<PairingCodeRow>();
  }

  async approvePairingCode(code: string): Promise<void> {
    await this.d1.prepare(`UPDATE pairing_codes SET approved = 1 WHERE code = ?`).bind(code).run();
  }
}

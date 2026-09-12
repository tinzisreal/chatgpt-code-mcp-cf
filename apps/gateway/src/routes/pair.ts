import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../env.js";
import { Db } from "../db/client.js";
import { randomToken, timingSafeEqual } from "../lib/crypto.js";
import { escapeHtml } from "../lib/html.js";

export const pairRoutes = new Hono<{ Bindings: Env }>();

const PAIRING_CODE_TTL_SECONDS = 15 * 60;

const StartBody = z.object({
  machineId: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9._-]+$/, "machineId must be alphanumeric plus . _ -"),
  workspaceRoot: z.string().min(1),
  // sha256 hex digest of a token the CLI generated locally — the Gateway never
  // learns the plaintext, so a compromised Gateway can't mint working tokens.
  agentTokenHash: z.string().regex(/^[a-f0-9]{64}$/),
});

pairRoutes.post("/pair/start", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = StartBody.safeParse(body);
  if (!parsed.success) return c.json({ error: "invalid_request", details: parsed.error.message }, 400);

  const db = new Db(c.env.DB);
  await db.upsertMachine(parsed.data.machineId);

  const code = randomToken(16);
  const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_SECONDS * 1000).toISOString();
  await db.insertPairingCode({
    code,
    machine_id: parsed.data.machineId,
    workspace_root: parsed.data.workspaceRoot,
    expires_at: expiresAt,
    agent_token_hash: parsed.data.agentTokenHash,
  });

  return c.json({
    code,
    approveUrl: `${c.env.GATEWAY_BASE_URL}/pair/approve/${code}`,
    expiresInSeconds: PAIRING_CODE_TTL_SECONDS,
    pollIntervalSeconds: 3,
  });
});

pairRoutes.get("/pair/status/:code", async (c) => {
  const db = new Db(c.env.DB);
  const row = await db.getPairingCode(c.req.param("code"));
  if (!row) return c.json({ error: "not_found" }, 404);
  const expired = new Date(row.expires_at).getTime() < Date.now();
  return c.json({ approved: Boolean(row.approved), expired });
});

pairRoutes.get("/pair/approve/:code", async (c) => {
  const db = new Db(c.env.DB);
  const row = await db.getPairingCode(c.req.param("code"));
  if (!row) return c.text("pairing code not found", 404);
  if (new Date(row.expires_at).getTime() < Date.now()) return c.text("pairing code expired", 410);
  if (row.approved) return c.text("already approved", 200);

  const html = `<!doctype html>
<html><body style="font-family: system-ui; max-width: 480px; margin: 4rem auto;">
  <h2>Pair machine "${escapeHtml(row.machine_id)}"?</h2>
  <p>Workspace root: <code>${escapeHtml(row.workspace_root)}</code></p>
  <form method="post" action="/pair/approve/${escapeHtml(row.code)}">
    <label>Owner secret<br/><input type="password" name="owner_secret" autofocus /></label><br/><br/>
    <button type="submit">Approve</button>
  </form>
</body></html>`;
  return c.html(html);
});

pairRoutes.post("/pair/approve/:code", async (c) => {
  const form = await c.req.parseBody();
  if (!timingSafeEqual(String(form.owner_secret ?? ""), c.env.OWNER_SECRET)) {
    return c.text("forbidden: invalid owner secret", 403);
  }

  const db = new Db(c.env.DB);
  const row = await db.getPairingCode(c.req.param("code"));
  if (!row) return c.text("pairing code not found", 404);
  if (new Date(row.expires_at).getTime() < Date.now()) return c.text("pairing code expired", 410);

  await db.setMachineAgentTokenHash(row.machine_id, row.agent_token_hash);
  await db.approvePairingCode(row.code);

  return c.html(`<!doctype html><html><body style="font-family: system-ui; max-width: 480px; margin: 4rem auto;">
    <h2>Approved</h2><p>Machine "${escapeHtml(row.machine_id)}" is now paired. You can close this tab.</p>
  </body></html>`);
});

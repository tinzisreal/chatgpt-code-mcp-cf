export interface Env {
  DB: D1Database;
  MACHINE_SESSIONS: DurableObjectNamespace;
  /** Sole secret gating who can approve OAuth authorize / pairing-approve requests. */
  OWNER_SECRET: string;
  /** Public base URL of this Worker, e.g. https://chatgpt-code-mcp.<account>.workers.dev */
  GATEWAY_BASE_URL: string;
}

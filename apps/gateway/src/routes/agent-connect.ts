import { Hono, type Context } from "hono";
import { z } from "zod";
import type { Env } from "../env.js";
import { Db } from "../db/client.js";
import { sha256Hex } from "../lib/crypto.js";
import { machineConnectStub } from "../lib/relay.js";

export const agentConnectRoutes = new Hono<{ Bindings: Env }>();

/** Resolves the bearer agent token to the machine it belongs to, or null. */
async function authenticateAgent(c: Context<{ Bindings: Env }>): Promise<{ machineId: string } | null> {
  const auth = c.req.header("authorization") ?? "";
  const match = /^Bearer (.+)$/.exec(auth);
  if (!match) return null;
  const hash = await sha256Hex(match[1]);
  const db = new Db(c.env.DB);
  const machine = await db.getMachineByAgentTokenHash(hash);
  if (!machine) return null;
  return { machineId: machine.machine_id };
}

agentConnectRoutes.get("/agent/connect", async (c) => {
  const auth = await authenticateAgent(c);
  if (!auth) return c.text("unauthorized", 401);
  if (c.req.header("Upgrade") !== "websocket") return c.text("expected websocket upgrade", 426);

  const db = new Db(c.env.DB);
  await db.touchMachine(auth.machineId);

  const stub = machineConnectStub(c.env, auth.machineId);
  // Forward the ORIGINAL Request (via the two-arg Request constructor, which
  // clones it while overriding the URL) rather than building a fresh
  // fetch(url, {headers}) call — the latter drops the internal WebSocket
  // upgrade association Cloudflare attaches to the incoming Request at the
  // edge, which silently cancels the upgrade to the Durable Object.
  return stub.fetch(new Request("https://machine-session/connect", c.req.raw));
});

const WorkspacesBody = z.object({
  workspaces: z.array(z.object({ name: z.string().min(1), root: z.string().min(1) })),
});

/** Called by the agent right after `start` connects, to report which local
 * directories under its workspaceRoot have a .code-agent.json. */
agentConnectRoutes.post("/agent/workspaces", async (c) => {
  const auth = await authenticateAgent(c);
  if (!auth) return c.text("unauthorized", 401);

  const body = await c.req.json().catch(() => null);
  const parsed = WorkspacesBody.safeParse(body);
  if (!parsed.success) return c.json({ error: "invalid_request" }, 400);

  const db = new Db(c.env.DB);
  for (const ws of parsed.data.workspaces) {
    await db.upsertWorkspace(auth.machineId, ws.name, ws.root);
  }
  await db.pruneWorkspaces(
    auth.machineId,
    parsed.data.workspaces.map((w) => w.name),
  );
  return c.json({ ok: true });
});

import WebSocket from "ws";
import { isRpcRequest, type RpcResponse } from "@chatgpt-code-mcp/protocol";
import { loadConfig } from "../config.js";
import { discoverWorkspaces } from "../workspaces.js";
import { runTool } from "../tools/index.js";
import { RpcError } from "../rpc-error.js";
import type { ToolContext } from "../tools/context.js";

const MAX_BACKOFF_MS = 30_000;

async function reportWorkspaces(gatewayUrl: string, agentToken: string, ctx: ToolContext) {
  const workspaces = [...ctx.workspaces.values()].map((w) => ({ name: w.name, root: w.root }));
  const res = await fetch(`${gatewayUrl}/agent/workspaces`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${agentToken}` },
    body: JSON.stringify({ workspaces }),
  });
  if (!res.ok) {
    console.error(`[code-agent] failed to report workspaces: ${res.status} ${await res.text()}`);
  } else {
    console.log(`[code-agent] reported ${workspaces.length} workspace(s): ${workspaces.map((w) => w.name).join(", ") || "(none)"}`);
  }
}

function connect(gatewayUrl: string, agentToken: string, ctx: ToolContext, backoffMs: number) {
  const wsUrl = `${gatewayUrl.replace(/^http/, "ws")}/agent/connect`;
  const socket = new WebSocket(wsUrl, { headers: { authorization: `Bearer ${agentToken}` } });

  socket.on("open", () => {
    console.log(`[code-agent] connected to ${gatewayUrl}`);
    backoffMs = 1000;
  });

  socket.on("message", async (data) => {
    let msg: unknown;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (!isRpcRequest(msg)) return;

    let response: RpcResponse;
    try {
      const result = await runTool(ctx, msg.method, msg.params);
      response = { type: "response", id: msg.id, ok: true, result };
    } catch (err) {
      if (err instanceof RpcError) {
        response = { type: "response", id: msg.id, ok: false, error: { code: err.code, message: err.message } };
      } else {
        response = {
          type: "response",
          id: msg.id,
          ok: false,
          error: { code: "INTERNAL_ERROR", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }
    socket.send(JSON.stringify(response));
  });

  const reconnect = () => {
    const next = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
    setTimeout(() => connect(gatewayUrl, agentToken, ctx, next), backoffMs);
  };
  socket.on("close", (code, reasonBuf) => {
    const reason = reasonBuf.toString() || "(no reason)";
    console.log(`[code-agent] disconnected: code=${code} reason=${reason}, reconnecting in ${backoffMs}ms`);
    reconnect();
  });
  socket.on("error", (err) => console.error(`[code-agent] websocket error: ${err.stack ?? err.message}`));
  socket.on("unexpected-response", (_req, res) => {
    console.error(`[code-agent] unexpected response during handshake: ${res.statusCode} ${res.statusMessage}`);
  });
}

export async function start(): Promise<void> {
  const config = await loadConfig();
  if (!config) {
    console.error('No local config found. Run "code-agent pair" first.');
    process.exitCode = 1;
    return;
  }

  const discovered = await discoverWorkspaces(config.workspaceRoots);
  const ctx: ToolContext = { workspaces: new Map(discovered.map((w) => [w.name, w])) };

  await reportWorkspaces(config.gatewayUrl, config.agentToken, ctx);
  connect(config.gatewayUrl, config.agentToken, ctx, 1000);
}

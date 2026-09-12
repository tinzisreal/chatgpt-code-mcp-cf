import { Hono } from "hono";
import type { Env } from "../env.js";
import { Db } from "../db/client.js";
import { resolveAccessToken } from "../oauth/token.js";
import { toolDefs, toolDefToMcp } from "./tool-registry.js";

export const mcpRoutes = new Hono<{ Bindings: Env }>();

const PROTOCOL_VERSION = "2025-03-26";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: unknown;
}

function rpcResult(id: JsonRpcRequest["id"], result: unknown) {
  return { jsonrpc: "2.0" as const, id, result };
}

function rpcError(id: JsonRpcRequest["id"], code: number, message: string) {
  return { jsonrpc: "2.0" as const, id, error: { code, message } };
}

mcpRoutes.post("/mcp", async (c) => {
  const auth = c.req.header("authorization") ?? "";
  const match = /^Bearer (.+)$/.exec(auth);
  if (!match) {
    c.header(
      "WWW-Authenticate",
      `Bearer resource_metadata="${c.env.GATEWAY_BASE_URL}/.well-known/oauth-protected-resource"`,
    );
    return c.text("unauthorized", 401);
  }

  const db = new Db(c.env.DB);
  const token = await resolveAccessToken(db, match[1]);
  if (!token) {
    c.header(
      "WWW-Authenticate",
      `Bearer error="invalid_token", resource_metadata="${c.env.GATEWAY_BASE_URL}/.well-known/oauth-protected-resource"`,
    );
    return c.text("unauthorized", 401);
  }

  const body = (await c.req.json().catch(() => null)) as JsonRpcRequest | JsonRpcRequest[] | null;
  if (!body) return c.json(rpcError(null, -32700, "parse error"), 400);

  const messages = Array.isArray(body) ? body : [body];
  const responses = [];
  for (const msg of messages) {
    const result = await handleMessage(c.env, msg);
    if (result) responses.push(result);
  }

  if (responses.length === 0) return c.body(null, 202);
  return c.json(Array.isArray(body) ? responses : responses[0]);
});

async function handleMessage(env: Env, msg: JsonRpcRequest) {
  const isNotification = msg.id === undefined;

  switch (msg.method) {
    case "initialize": {
      const result = {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "chatgpt-code-mcp-gateway", version: "0.1.0" },
      };
      return isNotification ? null : rpcResult(msg.id, result);
    }

    case "notifications/initialized":
    case "notifications/cancelled":
      return null;

    case "ping":
      return isNotification ? null : rpcResult(msg.id, {});

    case "tools/list": {
      return isNotification ? null : rpcResult(msg.id, { tools: toolDefs.map(toolDefToMcp) });
    }

    case "tools/call": {
      const params = (msg.params ?? {}) as { name?: string; arguments?: unknown };
      const def = toolDefs.find((t) => t.name === params.name);
      if (!def) {
        return isNotification ? null : rpcError(msg.id, -32602, `unknown tool: ${params.name}`);
      }
      const result = await def.handler(env, params.arguments ?? {});
      return isNotification ? null : rpcResult(msg.id, result);
    }

    default:
      return isNotification ? null : rpcError(msg.id, -32601, `method not found: ${msg.method}`);
  }
}

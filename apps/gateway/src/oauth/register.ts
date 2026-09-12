import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../env.js";
import { Db } from "../db/client.js";
import { randomToken } from "../lib/crypto.js";

export const registerRoutes = new Hono<{ Bindings: Env }>();

const RegisterRequest = z.object({
  redirect_uris: z.array(z.string().url()).min(1),
  client_name: z.string().min(1).max(200).default("MCP client"),
  token_endpoint_auth_method: z.literal("none").default("none"),
});

/** RFC 7591 — Dynamic Client Registration. Public clients only (PKCE, no secret). */
registerRoutes.post("/oauth/register", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = RegisterRequest.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_client_metadata", error_description: parsed.error.message }, 400);
  }

  const clientId = randomToken(16);
  const db = new Db(c.env.DB);
  await db.insertClient({
    client_id: clientId,
    client_name: parsed.data.client_name,
    redirect_uris: JSON.stringify(parsed.data.redirect_uris),
    token_endpoint_auth_method: "none",
  });

  return c.json(
    {
      client_id: clientId,
      client_name: parsed.data.client_name,
      redirect_uris: parsed.data.redirect_uris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
    201,
  );
});

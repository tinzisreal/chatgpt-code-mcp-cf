import { Hono } from "hono";
import type { Env } from "../env.js";

export const metadataRoutes = new Hono<{ Bindings: Env }>();

/** RFC 8414 — Authorization Server Metadata. */
metadataRoutes.get("/.well-known/oauth-authorization-server", (c) => {
  const base = c.env.GATEWAY_BASE_URL;
  return c.json({
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
  });
});

/** RFC 9728 — Protected Resource Metadata, discovered from a 401 on /mcp. */
metadataRoutes.get("/.well-known/oauth-protected-resource", (c) => {
  const base = c.env.GATEWAY_BASE_URL;
  return c.json({
    resource: `${base}/mcp`,
    authorization_servers: [base],
  });
});

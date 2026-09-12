import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../env.js";
import { Db } from "../db/client.js";
import { randomToken, timingSafeEqual } from "../lib/crypto.js";
import { escapeHtml } from "../lib/html.js";

export const authorizeRoutes = new Hono<{ Bindings: Env }>();

const AuthorizeQuery = z.object({
  response_type: z.literal("code"),
  client_id: z.string().min(1),
  redirect_uri: z.string().url(),
  code_challenge: z.string().min(43).max(128),
  code_challenge_method: z.literal("S256"),
  state: z.string().optional().default(""),
});

const AUTH_CODE_TTL_SECONDS = 5 * 60;

authorizeRoutes.get("/oauth/authorize", async (c) => {
  const parsed = AuthorizeQuery.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
  if (!parsed.success) return c.text(`invalid_request: ${parsed.error.message}`, 400);
  const data = parsed.data;

  const db = new Db(c.env.DB);
  const client = await db.getClient(data.client_id);
  if (!client) return c.text("invalid_client", 400);

  const registeredRedirects: string[] = JSON.parse(client.redirect_uris);
  if (!registeredRedirects.includes(data.redirect_uri)) {
    return c.text("redirect_uri_mismatch", 400);
  }

  const html = `<!doctype html>
<html><body style="font-family: system-ui; max-width: 480px; margin: 4rem auto;">
  <h2>Approve ${escapeHtml(client.client_name)}?</h2>
  <p>This app is requesting access to your chatgpt-code-mcp Gateway.</p>
  <form method="post" action="/oauth/authorize">
    <input type="hidden" name="client_id" value="${escapeHtml(data.client_id)}" />
    <input type="hidden" name="redirect_uri" value="${escapeHtml(data.redirect_uri)}" />
    <input type="hidden" name="code_challenge" value="${escapeHtml(data.code_challenge)}" />
    <input type="hidden" name="code_challenge_method" value="${escapeHtml(data.code_challenge_method)}" />
    <input type="hidden" name="state" value="${escapeHtml(data.state)}" />
    <label>Owner secret<br/><input type="password" name="owner_secret" autofocus /></label><br/><br/>
    <button type="submit">Approve</button>
  </form>
</body></html>`;
  return c.html(html);
});

authorizeRoutes.post("/oauth/authorize", async (c) => {
  const form = await c.req.parseBody();
  const ownerSecret = String(form.owner_secret ?? "");
  if (!timingSafeEqual(ownerSecret, c.env.OWNER_SECRET)) {
    return c.text("forbidden: invalid owner secret", 403);
  }

  const parsed = AuthorizeQuery.safeParse({
    response_type: "code",
    client_id: form.client_id,
    redirect_uri: form.redirect_uri,
    code_challenge: form.code_challenge,
    code_challenge_method: form.code_challenge_method,
    state: form.state,
  });
  if (!parsed.success) return c.text(`invalid_request: ${parsed.error.message}`, 400);

  const db = new Db(c.env.DB);
  const client = await db.getClient(parsed.data.client_id);
  if (!client) return c.text("invalid_client", 400);
  const registeredRedirects: string[] = JSON.parse(client.redirect_uris);
  if (!registeredRedirects.includes(parsed.data.redirect_uri)) {
    return c.text("redirect_uri_mismatch", 400);
  }

  const code = randomToken(24);
  const expiresAt = new Date(Date.now() + AUTH_CODE_TTL_SECONDS * 1000).toISOString();
  await db.insertAuthCode({
    code,
    client_id: parsed.data.client_id,
    redirect_uri: parsed.data.redirect_uri,
    code_challenge: parsed.data.code_challenge,
    code_challenge_method: parsed.data.code_challenge_method,
    expires_at: expiresAt,
    used: 0,
  });

  const redirect = new URL(parsed.data.redirect_uri);
  redirect.searchParams.set("code", code);
  if (parsed.data.state) redirect.searchParams.set("state", parsed.data.state);
  return c.redirect(redirect.toString(), 302);
});

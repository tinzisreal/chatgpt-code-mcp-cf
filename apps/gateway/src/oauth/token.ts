import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../env.js";
import { Db } from "../db/client.js";
import { pkceS256, randomToken, sha256Hex, timingSafeEqual } from "../lib/crypto.js";

export const tokenRoutes = new Hono<{ Bindings: Env }>();

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60; // 1h
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 90; // 90d

const AuthCodeGrant = z.object({
  grant_type: z.literal("authorization_code"),
  code: z.string().min(1),
  redirect_uri: z.string().url(),
  client_id: z.string().min(1),
  code_verifier: z.string().min(43).max(128),
});

const RefreshGrant = z.object({
  grant_type: z.literal("refresh_token"),
  refresh_token: z.string().min(1),
  client_id: z.string().min(1),
});

async function issueTokenPair(db: Db, clientId: string) {
  const accessToken = randomToken(32);
  const refreshToken = randomToken(32);
  const accessHash = await sha256Hex(accessToken);
  const refreshHash = await sha256Hex(refreshToken);
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000).toISOString();

  await db.insertToken({
    access_token_hash: accessHash,
    refresh_token_hash: refreshHash,
    client_id: clientId,
    expires_at: expiresAt,
    revoked: 0,
  });

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: "Bearer" as const,
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
  };
}

tokenRoutes.post("/oauth/token", async (c) => {
  const form = await c.req.parseBody();
  const db = new Db(c.env.DB);

  if (form.grant_type === "authorization_code") {
    const parsed = AuthCodeGrant.safeParse(form);
    if (!parsed.success) return c.json({ error: "invalid_request" }, 400);

    const authCode = await db.getAuthCode(parsed.data.code);
    if (!authCode || authCode.used) return c.json({ error: "invalid_grant" }, 400);
    if (new Date(authCode.expires_at).getTime() < Date.now()) {
      return c.json({ error: "invalid_grant", error_description: "code expired" }, 400);
    }
    if (authCode.client_id !== parsed.data.client_id || authCode.redirect_uri !== parsed.data.redirect_uri) {
      return c.json({ error: "invalid_grant" }, 400);
    }

    const computedChallenge = await pkceS256(parsed.data.code_verifier);
    if (!timingSafeEqual(computedChallenge, authCode.code_challenge)) {
      return c.json({ error: "invalid_grant", error_description: "PKCE verification failed" }, 400);
    }

    await db.markAuthCodeUsed(authCode.code);
    const tokens = await issueTokenPair(db, authCode.client_id);
    return c.json(tokens);
  }

  if (form.grant_type === "refresh_token") {
    const parsed = RefreshGrant.safeParse(form);
    if (!parsed.success) return c.json({ error: "invalid_request" }, 400);

    const refreshHash = await sha256Hex(parsed.data.refresh_token);
    const existing = await db.getTokenByRefreshHash(refreshHash);
    if (!existing || existing.client_id !== parsed.data.client_id) {
      return c.json({ error: "invalid_grant" }, 400);
    }

    await db.revokeToken(existing.access_token_hash);
    const tokens = await issueTokenPair(db, existing.client_id);
    return c.json(tokens);
  }

  return c.json({ error: "unsupported_grant_type" }, 400);
});

/** Resolves a Bearer access token to its owning client, or null if invalid/expired/revoked. */
export async function resolveAccessToken(db: Db, bearerToken: string): Promise<{ clientId: string } | null> {
  const hash = await sha256Hex(bearerToken);
  const token = await db.getTokenByAccessHash(hash);
  if (!token) return null;
  if (token.revoked) return null;
  if (new Date(token.expires_at).getTime() < Date.now()) return null;
  return { clientId: token.client_id };
}

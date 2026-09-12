# Phase 2 — Gateway Skeleton + OAuth 2.1

## Context

See [plan.md](plan.md). This is the first half of the Gateway: it makes the
Worker deployable and gives ChatGPT something it can actually add as a
connector, before any relay/tool logic exists.

## Requirements

- Cloudflare Worker (Hono) with D1 binding.
- D1 schema: `oauth_clients`, `oauth_tokens`, `machines`, `workspaces`,
  `pairing_codes`.
- OAuth 2.1 endpoints per MCP connector requirements:
  - `POST /oauth/register` — Dynamic Client Registration (RFC 7591).
  - `GET /oauth/authorize` — PKCE authorization code flow, simple
    approve/deny HTML page (no real user accounts needed for a personal
    Gateway — a single-owner check via a login secret is enough).
  - `POST /oauth/token` — code exchange + refresh.
  - `.well-known/oauth-authorization-server` metadata document.
- `wrangler.toml` with D1 binding, Durable Object binding placeholder for
  Phase 3.

## Files to create

```text
apps/gateway/
  wrangler.toml
  package.json
  src/index.ts              # Hono app entry
  src/oauth/register.ts
  src/oauth/authorize.ts
  src/oauth/token.ts
  src/oauth/metadata.ts
  src/db/schema.sql
  src/db/client.ts           # thin D1 query helpers
```

## Steps

1. `wrangler d1 create chatgpt-code-mcp` (confirm with user before running —
   creates a real Cloudflare resource).
2. Write `schema.sql`, apply via `wrangler d1 execute`.
3. Implement DCR, authorize, token, metadata routes.
4. Add a single-owner login secret (env var `OWNER_SECRET`) checked on the
   `/oauth/authorize` approve page — enough for a personal Gateway; no
   multi-tenant user system needed at this scope.

## Tests / Validation

- `wrangler dev` locally; register a test client with `curl`, run the full
  authorize→token exchange manually, confirm a bearer token is issued.
- Reject requests missing PKCE `code_verifier`.

## Risks

- Creating real Cloudflare resources (D1 database, Worker) — **confirm with
  user before running any `wrangler d1 create` / `wrangler deploy`.**
- Rollback: `wrangler d1 delete`, delete the Worker from the dashboard.

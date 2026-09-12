# Phase 6 — Deploy + End-to-End Validation

## Context

See [plan.md](plan.md). Proves the whole system against the actual sample
repo (`MCP-CHATGPT-TO-WEB`), using real ChatGPT — this is the phase that
fulfills the original request.

## Requirements

- Gateway deployed to Cloudflare (real `wrangler deploy`, real D1 database).
- `code-agent` paired against the deployed Gateway with `--workspace-root`
  pointing at the parent of `MCP-CHATGPT-TO-WEB`.
- ChatGPT connector added via Settings → Connectors → Developer mode using
  `https://<gateway>/mcp`.
- Every demo prompt from the sample README's "Các tool bạn có thể demo"
  section run for real, including the `greet` function edit + `pnpm test`.

## Steps

1. **Confirm with user before deploying** — this creates a real, internet-
   reachable Cloudflare Worker with an OAuth-protected but public endpoint.
2. `wrangler deploy` the Gateway.
3. Run `code-agent pair` from the user's machine, approve via the printed
   URL.
4. `code-agent start`, leave running.
5. Add the connector in ChatGPT, complete OAuth.
6. Walk through each demo prompt from the sample README, verify output.
7. Write a short report in `reports/e2e-2026-XX-XX.md`: what passed, what
   didn't, any deviations from the plan.

## Tests / Validation

- All 12 tools exercised at least once through real ChatGPT, not just the
  local test harnesses from earlier phases.
- Confirm a blocked-path request (e.g. asking ChatGPT to read a fake
  `.env`) is refused by the agent's sandbox, not silently allowed.

## Risks

- Public endpoint exposure — mitigated by OAuth 2.1 + single-owner
  authorize check from Phase 2, but flag to user that anyone who completes
  the OAuth flow with a stolen `OWNER_SECRET` gets full tool access to every
  paired workspace. Recommend rotating `OWNER_SECRET` if ever suspected
  leaked.
- Rollback: `wrangler delete` the Worker, revoke D1 database, delete local
  agent config.

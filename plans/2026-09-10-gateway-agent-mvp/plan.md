---
status: implemented
created: 2026-09-10
updated: 2026-09-10
---

# Plan: ChatGPT Code MCP — Gateway + Agent MVP

## Goal

Build the real `chatgpt-code-mcp` project referenced by the sample repo
(`D:/LearningPesonal/repo git/MCP-CHATGPT-TO-WEB`), so ChatGPT (Developer Mode
connector) can pair with a local machine and use MCP tools
(`machines_list`, `workspaces_list`, `directory_list`, `file_read`,
`code_search`, `file_apply_patch`, `file_create`, `file_delete`, `file_move`,
`git_status`, `git_diff`, `test_run`) against a sandboxed local workspace.

No official/public source exists for this project (verified via GitHub +
web search on 2026-09-10) — this is a from-scratch build.

## Architecture

```text
ChatGPT (Developer Mode connector)
   │  HTTPS, OAuth 2.1 (DCR + PKCE), MCP Streamable HTTP
   ▼
apps/gateway  — Cloudflare Worker + Durable Objects + D1
   │  WebSocket (agent holds the inbound connection)
   ▼
apps/agent    — Node.js CLI running on the user's machine
   │  sandboxed by <workspace>/.code-agent.json
   ▼
target workspace repo (e.g. MCP-CHATGPT-TO-WEB)
```

## Decisions (confirmed with user)

- Hosting: **Cloudflare Workers + Durable Objects** (free tier: 100k req/day,
  313k GB-s/day — sufficient for personal use).
- Auth: **OAuth 2.1 with Dynamic Client Registration + PKCE** — required so
  the Gateway can be added as a real ChatGPT connector (Settings → Connectors
  → Developer mode), not just a CLI-testable bearer-token server.
- Scope: multi-machine, multi-workspace, matching the sample README's tool
  table.
- Location: new sibling project, `chatgpt-code-mcp/` next to the sample repo.
  The sample repo stays untouched as the demo workspace.

## Stack

- pnpm workspaces monorepo, TypeScript everywhere, Node.js 22+.
- Gateway: Hono (router) on Cloudflare Workers, Durable Objects for
  per-machine WebSocket sessions, D1 (SQLite) for OAuth clients/tokens,
  machines, workspaces, pairing codes.
- Agent: plain Node.js CLI (no framework), `ws` for the WebSocket client,
  `simple-git` or shelling out to `git`, ripgrep (`rg`) for `code_search`.
- Shared: `packages/protocol` — TypeScript types for the Gateway↔Agent RPC
  envelope and the MCP tool schemas, imported by both apps.

## Phases

| Phase | File | Summary |
|---|---|---|
| 1 | [phase-01-monorepo-scaffold.md](phase-01-monorepo-scaffold.md) | pnpm workspace, shared protocol types, tooling |
| 2 | [phase-02-gateway-oauth.md](phase-02-gateway-oauth.md) | Cloudflare Worker skeleton, D1 schema, OAuth 2.1 + DCR |
| 3 | [phase-03-gateway-relay.md](phase-03-gateway-relay.md) | Durable Object relay, agent WebSocket endpoint, pairing flow |
| 4 | [phase-04-mcp-tools.md](phase-04-mcp-tools.md) | MCP `/mcp` Streamable HTTP endpoint + tool handlers |
| 5 | [phase-05-code-agent-cli.md](phase-05-code-agent-cli.md) | `code-agent` CLI: pair/start/status/workspaces + tool executors |
| 6 | [phase-06-e2e-deploy.md](phase-06-e2e-deploy.md) | Deploy to Cloudflare, pair the sample repo, validate every tool from real ChatGPT |

## Dependencies

Phase 1 blocks all others. Phase 2 blocks 3 blocks 4 (gateway chain).
Phase 5 depends on the protocol types from Phase 1 and the relay contract
from Phase 3. Phase 6 depends on everything.

## Acceptance Criteria

- `pnpm start -- pair --machine-id my-pc --gateway <URL> --workspace-root <path>`
  succeeds against the deployed Gateway.
- ChatGPT, connected via Settings → Connectors → Developer mode, can run
  every demo prompt listed in the sample repo's README against the
  `chatgpt-code-mcp-sample` workspace, including a real `file_apply_patch`
  edit and `test_run`.
- `.code-agent.json` allow/blockedPaths are enforced — a blocked path
  request is rejected by the agent, not just by convention.
- OAuth tokens and agent pairing tokens are never logged or persisted in
  plaintext beyond D1/local config.

## Reports

Phase completion notes go in `reports/`.

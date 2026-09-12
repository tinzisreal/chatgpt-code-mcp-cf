# Phase 5 — `code-agent` CLI

## Context

See [plan.md](plan.md). This is `apps/agent`, the process the user runs
locally. It must match the CLI surface already documented in the sample
repo's README exactly: `pair`, `start`, `status`, `workspaces`.

## Requirements

- `pair --machine-id <id> --gateway <url> --workspace-root <path>`:
  calls `POST /pair/start`, prints the approve URL, polls until approved,
  saves `{ machineId, gatewayUrl, agentToken, workspaceRoot }` to a local
  config file (outside the repo, e.g. `~/.config/chatgpt-code-mcp/agent.json`
  — **never inside a workspace directory**).
- `start`: opens the WebSocket to `/agent/connect`, handles reconnect with
  backoff, dispatches incoming RPC requests to tool executors.
- `status` / `workspaces`: read local config + query Gateway for connection
  state.
- Tool executors, one per MCP tool from Phase 4, each:
  - resolves the target path against `workspaceRoot` + the specific
    workspace's `.code-agent.json`,
  - rejects (before touching the filesystem) any path matching
    `blockedPaths` or not matching `allowedPaths`,
  - `file_apply_patch` requires a SHA-256 precondition (matches README) to
    avoid clobbering concurrent edits.
  - `code_search` shells out to `rg` (already a stated requirement in the
    sample README).
  - `test_run` only runs the command whitelisted in that workspace's
    `.code-agent.json` `commands.test` — never an arbitrary shell string
    from the request.

## Files to create

```text
apps/agent/
  package.json
  src/cli.ts                 # arg parsing, subcommand dispatch
  src/commands/pair.ts
  src/commands/start.ts
  src/commands/status.ts
  src/commands/workspaces.ts
  src/config.ts               # local config read/write
  src/sandbox.ts               # allow/blockedPaths + workspace resolution
  src/tools/*.ts               # one file per tool executor
```

## Steps

1. Implement `config.ts` + `sandbox.ts` first — every tool executor depends
   on path validation being correct before it touches disk.
2. Implement `pair`/`status`/`workspaces` against the Phase 3 endpoints.
3. Implement `start` (WebSocket client + dispatch loop).
4. Implement tool executors one by one, reusing `packages/protocol` schemas
   for input validation.

## Tests / Validation

- Unit tests for `sandbox.ts`: a path inside `allowedPaths` passes, a path
  matching `blockedPaths` (e.g. `.env`) is rejected even if it also matches
  an allow pattern.
- Integration test: run `start` against a local `wrangler dev` Gateway,
  drive every tool executor against the sample repo, assert results match
  the sample README's demo prompts.

## Risks

- `file_apply_patch` writing outside `workspaceRoot` via `../` traversal —
  resolve and canonicalize paths before the allow/blocked check, not after.
- Rollback: this app only touches the workspace repos it's paired to;
  uninstalling is just deleting the local config file.

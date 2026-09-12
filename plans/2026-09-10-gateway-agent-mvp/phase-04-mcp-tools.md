# Phase 4 — MCP Streamable HTTP Endpoint + Tool Handlers

## Context

See [plan.md](plan.md). This is the piece ChatGPT actually talks to:
`https://<gateway>/mcp`. It wraps the Phase 3 relay behind the MCP tool
contract.

## Requirements

- `/mcp` implements MCP Streamable HTTP transport (JSON-RPC over POST,
  optional SSE stream for server-initiated messages) and validates the
  OAuth bearer token from Phase 2 on every request.
- Register the 12 tools from the sample README, each handler:
  1. validates params against the shared schema in `packages/protocol`,
  2. resolves the target machine/workspace from params,
  3. calls `MachineSession.dispatch(...)` (Phase 3),
  4. maps the agent's response (or timeout/error) to an MCP tool result.
- `machines_list` / `workspaces_list` read directly from D1 (no agent round
  trip needed).

## Files to create

```text
apps/gateway/
  src/mcp/server.ts          # Streamable HTTP handler
  src/mcp/tools/machines-list.ts
  src/mcp/tools/workspaces-list.ts
  src/mcp/tools/directory-list.ts
  src/mcp/tools/file-read.ts
  src/mcp/tools/code-search.ts
  src/mcp/tools/file-apply-patch.ts
  src/mcp/tools/file-create.ts
  src/mcp/tools/file-delete.ts
  src/mcp/tools/file-move.ts
  src/mcp/tools/git-status.ts
  src/mcp/tools/git-diff.ts
  src/mcp/tools/test-run.ts
```

## Steps

1. Wire the MCP SDK's Streamable HTTP server (check Workers compatibility;
   fall back to a hand-rolled JSON-RPC handler over the same transport
   contract if the official SDK assumes a Node-only runtime).
2. Implement each tool handler as a thin adapter over `dispatch()`.
3. Enforce the OAuth bearer check before any tool call reaches Phase 3.

## Tests / Validation

- Use an MCP-compatible CLI client (or a small test script using the MCP
  TypeScript SDK) to list tools and call each one against a locally running
  fake agent from Phase 3's test harness.
- Confirm a request with an invalid/expired token is rejected before it
  reaches the relay.

## Risks

- MCP SDK Node-runtime assumptions may not run unmodified on Workers —
  budget time in this phase to hand-roll the transport if needed; flag to
  user if this changes the estimated effort materially.

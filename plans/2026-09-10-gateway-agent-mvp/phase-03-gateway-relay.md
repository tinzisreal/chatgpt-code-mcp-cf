# Phase 3 — Durable Object Relay + Pairing

## Context

See [plan.md](plan.md). This is the reverse-tunnel core: the agent (behind
NAT) opens an outbound WebSocket to the Gateway and keeps it open; the
Gateway routes MCP tool calls to the right agent by `machine-id` over that
same socket.

## Requirements

- `MachineSession` Durable Object (one instance per `machine-id`):
  - Accepts the agent's WebSocket (`GET /agent/connect` upgrade, bearer =
    agent token issued during pairing).
  - Tracks pending RPC requests by id with a timeout (e.g. 30s), resolves
    them when the agent replies.
  - Exposes an internal `dispatch(method, params)` used by Phase 4's tool
    handlers.
- Pairing flow:
  - `POST /pair/start` (called by `code-agent pair`) — creates a
    short-lived pairing code + machine row, returns a URL for the user to
    open and approve.
  - `GET /pair/approve/:code` — human-facing approve page (reuses the
    owner-secret check from Phase 2).
  - On approval, issue a long-lived agent token stored in the agent's local
    config (never in Git).

## Files to create

```text
apps/gateway/
  wrangler.toml              # add Durable Object binding
  src/do/machine-session.ts
  src/routes/pair.ts
  src/routes/agent-connect.ts
```

## Steps

1. Add `MachineSession` DO class, bind it in `wrangler.toml`.
2. Implement `/pair/start` + `/pair/approve/:code` + agent token issuance.
3. Implement `/agent/connect` WebSocket upgrade, validate agent token,
   forward to the correct DO instance by `machine-id`.
4. Implement request/response correlation inside the DO (map of
   `requestId -> resolve fn`, timeout cleanup).

## Tests / Validation

- Simulate an agent with a plain `wscat`/`ws` script: connect, respond to a
  fake `dispatch()` call, confirm round-trip works end-to-end locally via
  `wrangler dev`.
- Confirm a dispatch to an offline machine times out cleanly (no hung
  requests).

## Risks

- Durable Object billing is wall-clock based while the WebSocket is open —
  acceptable at personal scale (see plan.md free-tier numbers), but note it
  in the root README so the user isn't surprised later.
- Rollback: remove the DO binding and routes; no destructive external state
  besides the D1 rows already covered by Phase 2's rollback.

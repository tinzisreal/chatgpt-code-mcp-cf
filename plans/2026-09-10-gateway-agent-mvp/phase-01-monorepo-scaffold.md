# Phase 1 — Monorepo Scaffold

## Context

See [plan.md](plan.md). This phase creates the empty skeleton every later
phase builds inside. Nothing user-facing yet.

## Requirements

- pnpm workspace with `apps/gateway`, `apps/agent`, `packages/protocol`.
- Shared TypeScript config, ESLint/Prettier optional (skip unless repo needs
  it — keep this minimal).
- `packages/protocol` exports:
  - `RpcRequest` / `RpcResponse` envelope types for Gateway↔Agent messages
    (id, method, params / id, result, error).
  - MCP tool name + Zod (or plain TS) param/result schemas for all 12 tools
    listed in plan.md.

## Files to create

```text
chatgpt-code-mcp/
  package.json                # workspace root, pnpm-workspace.yaml
  pnpm-workspace.yaml
  tsconfig.base.json
  apps/gateway/package.json   # empty placeholder, filled in phase 2
  apps/agent/package.json     # empty placeholder, filled in phase 5
  packages/protocol/package.json
  packages/protocol/src/rpc.ts
  packages/protocol/src/tools.ts
  packages/protocol/src/index.ts
  README.md                   # project root README, mirrors sample's "Project chính" description
```

## Steps

1. `pnpm init` at root, add `pnpm-workspace.yaml` listing `apps/*` and
   `packages/*`.
2. Scaffold `packages/protocol` with the RPC envelope and tool schema types.
3. Add root `tsconfig.base.json` (strict mode, ES2022 target, NodeNext
   modules) referenced by each app's `tsconfig.json`.
4. Write root `README.md` explaining the two apps and pointing back at the
   sample repo for the demo workspace.

## Tests / Validation

- `pnpm install` succeeds at root.
- `pnpm -r build` runs (even if only `protocol` has real code yet).

## Risks

- None — pure scaffolding, fully reversible (delete the directory).

import { RpcError } from "../rpc-error.js";
import type { DiscoveredWorkspace } from "../workspaces.js";
import { WHOLE_MACHINE_ROOT } from "../sandbox.js";

export interface ToolContext {
  workspaces: Map<string, DiscoveredWorkspace>;
}

export function resolveWorkspace(ctx: ToolContext, name: string): DiscoveredWorkspace {
  const ws = ctx.workspaces.get(name);
  if (!ws) {
    const valid = [...ctx.workspaces.keys()];
    const validList = valid.length > 0 ? valid.join(", ") : "(none — agent has no workspaces configured)";
    throw new RpcError(
      "NOT_FOUND",
      `unknown workspace: "${name}". The "workspace" param must be a workspace NAME from workspaces_list, not a filesystem path. Valid workspace names for this machine: ${validList}.`,
    );
  }
  return ws;
}

/** Like resolveWorkspace, but rejects the synthetic "computer" workspace —
 * for tools (git_status, git_diff, test_run) that need a single directory
 * as their working directory, which "computer" doesn't have one of. */
export function resolveDirectoryWorkspace(ctx: ToolContext, name: string): DiscoveredWorkspace {
  const ws = resolveWorkspace(ctx, name);
  if (ws.root === WHOLE_MACHINE_ROOT) {
    throw new RpcError(
      "INVALID_PARAMS",
      `workspace "computer" has no single directory, so this tool can't run in it. Use a drive/folder-specific workspace instead (see workspaces_list).`,
    );
  }
  return ws;
}

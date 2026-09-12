import type { GitDiffParams, GitDiffResult } from "@chatgpt-code-mcp/protocol";
import { resolveSafePath } from "../sandbox.js";
import { resolveDirectoryWorkspace, type ToolContext } from "./context.js";
import { runFile } from "../lib/exec.js";
import { RpcError } from "../rpc-error.js";
import type { z } from "zod";

export async function gitDiff(
  ctx: ToolContext,
  params: z.infer<typeof GitDiffParams>,
): Promise<z.infer<typeof GitDiffResult>> {
  const ws = resolveDirectoryWorkspace(ctx, params.workspace);
  const args = ["diff"];
  if (params.path) {
    resolveSafePath(ws.root, params.path, ws.config, { requireAllowed: false });
    args.push("--", params.path);
  }
  const res = await runFile("git", args, ws.root);
  if (res.exitCode !== 0) {
    throw new RpcError("INTERNAL_ERROR", `git diff failed: ${res.stderr}`);
  }
  return { diff: res.stdout };
}

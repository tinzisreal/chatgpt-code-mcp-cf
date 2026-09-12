import type { GitStatusParams, GitStatusResult } from "@chatgpt-code-mcp/protocol";
import { resolveDirectoryWorkspace, type ToolContext } from "./context.js";
import { runFile } from "../lib/exec.js";
import { RpcError } from "../rpc-error.js";
import type { z } from "zod";

export async function gitStatus(
  ctx: ToolContext,
  params: z.infer<typeof GitStatusParams>,
): Promise<z.infer<typeof GitStatusResult>> {
  const ws = resolveDirectoryWorkspace(ctx, params.workspace);
  const res = await runFile("git", ["status", "--porcelain=v1", "-b"], ws.root);
  if (res.exitCode !== 0) {
    throw new RpcError("INTERNAL_ERROR", `git status failed: ${res.stderr}`);
  }
  return { status: res.stdout };
}

import type { TestRunParams, TestRunResult } from "@chatgpt-code-mcp/protocol";
import { resolveWorkspace, type ToolContext } from "./context.js";
import { runWhitelistedShellCommand } from "../lib/exec.js";
import { RpcError } from "../rpc-error.js";
import type { z } from "zod";

export async function testRun(
  ctx: ToolContext,
  params: z.infer<typeof TestRunParams>,
): Promise<z.infer<typeof TestRunResult>> {
  const ws = resolveWorkspace(ctx, params.workspace);
  const command = ws.config.commands.test;
  if (!command) {
    throw new RpcError("COMMAND_NOT_WHITELISTED", `workspace "${ws.name}" has no commands.test configured`);
  }
  // Safe: `command` comes only from this workspace's own .code-agent.json,
  // never from the RPC request (TestRunParams carries no command field).
  const res = await runWhitelistedShellCommand(command, ws.root);
  return res;
}

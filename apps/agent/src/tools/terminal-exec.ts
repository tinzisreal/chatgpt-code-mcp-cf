import { homedir } from "node:os";
import type { TerminalExecParams, TerminalExecResult } from "@chatgpt-code-mcp/protocol";
import { resolveSafePath, WHOLE_MACHINE_ROOT } from "../sandbox.js";
import { resolveWorkspace, type ToolContext } from "./context.js";
import { runShellCommand } from "../lib/exec.js";
import { RpcError } from "../rpc-error.js";
import type { z } from "zod";

/** Kill switch: set TERMINAL_EXEC_DISABLED=1 in the agent's environment to
 * refuse every terminal_exec call without restarting or re-pairing. */
function terminalExecDisabled(): boolean {
  const v = process.env.TERMINAL_EXEC_DISABLED;
  return v === "1" || v === "true";
}

/**
 * HIGH RISK: executes an arbitrary shell command on the real host OS.
 *
 * `cwd` is resolved through the same traversal guard every other tool uses
 * (can't start outside the workspace root), but that is the ONLY boundary
 * left once this runs — the command itself is a real shell and can read,
 * write, or delete anything the OS user running `code-agent` can touch,
 * including files this workspace's allowedPaths/blockedPaths would
 * otherwise block. This tool only exists because the user explicitly
 * confirmed they understand and accept that tradeoff.
 */
export async function terminalExec(
  ctx: ToolContext,
  params: z.infer<typeof TerminalExecParams>,
): Promise<z.infer<typeof TerminalExecResult>> {
  if (terminalExecDisabled()) {
    throw new RpcError(
      "PATH_NOT_ALLOWED",
      "terminal_exec is disabled on this machine (TERMINAL_EXEC_DISABLED is set).",
    );
  }

  const ws = resolveWorkspace(ctx, params.workspace);

  let cwd: string;
  if (params.cwd) {
    cwd = resolveSafePath(ws.root, params.cwd, ws.config, { requireAllowed: false });
  } else if (ws.root === WHOLE_MACHINE_ROOT) {
    // "computer" has no single root to default to — fall back to the user's
    // home directory, same as a normal terminal would open into.
    cwd = homedir();
  } else {
    cwd = ws.root;
  }

  // Audit: terminal_exec bypasses every path/command guard, so every
  // invocation is logged for the machine operator to review.
  console.warn(
    `[audit] terminal_exec workspace=${params.workspace} cwd=${cwd} command=${JSON.stringify(params.command)}`,
  );

  return runShellCommand(params.command, cwd, params.timeoutMs);
}

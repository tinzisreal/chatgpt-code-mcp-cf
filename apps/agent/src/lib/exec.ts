import { execFile as execFileCb, exec as execCb } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);
const exec = promisify(execCb);

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** Process exit codes are numbers; spawn failures (e.g. binary not found) set
 * `.code` to a string like "ENOENT" instead — map those to -1 so callers can
 * tell "ran and failed" (positive exit code) apart from "never ran". */
function toExitCode(code: unknown): number {
  return typeof code === "number" ? code : -1;
}

/** Runs an argv array (no shell) — safe for args derived from RPC params. */
export async function runFile(file: string, args: string[], cwd: string): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execFile(file, args, { cwd, maxBuffer: 16 * 1024 * 1024 });
    return { exitCode: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code?: unknown; stdout?: string; stderr?: string; message: string };
    return { exitCode: toExitCode(e.code), stdout: e.stdout ?? "", stderr: e.stderr ?? e.message };
  }
}

/** Runs a shell command string — only ever call this with a command that
 * came from the workspace's own .code-agent.json `commands` whitelist,
 * never with anything derived from an RPC request's parameters. */
export async function runWhitelistedShellCommand(command: string, cwd: string): Promise<ExecResult> {
  return runShellCommand(command, cwd);
}

/** Runs an arbitrary shell command string with no whitelist — used only by
 * terminal_exec, which the user explicitly opted into with full awareness
 * that it bypasses every other tool's path/command sandbox. */
export async function runShellCommand(command: string, cwd: string, timeoutMs = 120_000): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await exec(command, { cwd, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 });
    return { exitCode: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code?: unknown; stdout?: string; stderr?: string; message: string };
    return { exitCode: toExitCode(e.code), stdout: e.stdout ?? "", stderr: e.stderr ?? e.message };
  }
}

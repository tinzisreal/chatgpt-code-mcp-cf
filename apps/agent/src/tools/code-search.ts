import type { CodeSearchParams, CodeSearchResult } from "@chatgpt-code-mcp/protocol";
import { resolveWorkspace, type ToolContext } from "./context.js";
import { runFile } from "../lib/exec.js";
import { RpcError } from "../rpc-error.js";
import type { z } from "zod";

const VIMGREP_LINE = /^(.+?):(\d+):(\d+):(.*)$/;

export async function codeSearch(
  ctx: ToolContext,
  params: z.infer<typeof CodeSearchParams>,
): Promise<z.infer<typeof CodeSearchResult>> {
  const ws = resolveWorkspace(ctx, params.workspace);
  const args = ["--vimgrep", "--no-messages"];
  for (const glob of params.globs ?? []) args.push("-g", glob);
  args.push("--", params.query, ".");

  const res = await runFile("rg", args, ws.root);
  // rg exits 1 when there are simply no matches — not an error. exitCode -1
  // means rg itself couldn't be spawned (e.g. not installed).
  if (res.exitCode > 1 || res.exitCode === -1) {
    throw new RpcError("INTERNAL_ERROR", `code search failed: ${res.stderr || res.stdout}`);
  }

  const matches = res.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => VIMGREP_LINE.exec(line))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ path: m[1], line: Number(m[2]), text: m[4] }));

  return { matches };
}

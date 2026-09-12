import type { CodeSearchParams, CodeSearchResult } from "@chatgpt-code-mcp/protocol";
import { resolveWorkspace, type ToolContext } from "./context.js";
import { runFile } from "../lib/exec.js";
import { RpcError } from "../rpc-error.js";
import { WHOLE_MACHINE_ROOT, isRelPathAllowed } from "../sandbox.js";
import type { z } from "zod";

const VIMGREP_LINE = /^(.+?):(\d+):(\d+):(.*)$/;

export async function codeSearch(
  ctx: ToolContext,
  params: z.infer<typeof CodeSearchParams>,
): Promise<z.infer<typeof CodeSearchResult>> {
  const ws = resolveWorkspace(ctx, params.workspace);

  // The synthetic "computer" workspace has no single directory to search
  // (root is the "*" sentinel, not a real path) — reject it like git tools do.
  if (ws.root === WHOLE_MACHINE_ROOT) {
    throw new RpcError(
      "INVALID_PARAMS",
      'workspace "computer" cannot be code-searched — use a drive/folder-specific workspace (see workspaces_list).',
    );
  }

  const args = ["--vimgrep", "--no-messages"];
  // Enforce the workspace blocklist at the ripgrep level so secret files are
  // never even opened (defense in depth on top of the post-filter below).
  for (const blocked of ws.config.blockedPaths) args.push("-g", `!${blocked}`);
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
    .map((m) => ({ path: m[1], line: Number(m[2]), text: m[4] }))
    // Final safety net: drop any match whose path the sandbox would block or
    // disallow, in case a glob/rg edge case slips past the -g excludes.
    .filter((m) => isRelPathAllowed(m.path, ws.config));

  return { matches };
}

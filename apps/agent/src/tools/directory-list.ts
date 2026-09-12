import { readdir } from "node:fs/promises";
import type { DirectoryListParams, DirectoryListResult } from "@chatgpt-code-mcp/protocol";
import { resolveSafePath } from "../sandbox.js";
import { resolveWorkspace, type ToolContext } from "./context.js";
import type { z } from "zod";

export async function directoryList(
  ctx: ToolContext,
  params: z.infer<typeof DirectoryListParams>,
): Promise<z.infer<typeof DirectoryListResult>> {
  const ws = resolveWorkspace(ctx, params.workspace);
  const abs = resolveSafePath(ws.root, params.path, ws.config, { requireAllowed: false });
  const entries = await readdir(abs, { withFileTypes: true });
  return {
    entries: entries.map((e) => ({
      name: e.name,
      type: e.isDirectory() ? ("directory" as const) : ("file" as const),
    })),
  };
}

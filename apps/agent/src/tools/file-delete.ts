import { rm } from "node:fs/promises";
import type { FileDeleteParams, FileDeleteResult } from "@chatgpt-code-mcp/protocol";
import { resolveSafePath } from "../sandbox.js";
import { resolveWorkspace, type ToolContext } from "./context.js";
import { RpcError } from "../rpc-error.js";
import type { z } from "zod";

export async function fileDelete(
  ctx: ToolContext,
  params: z.infer<typeof FileDeleteParams>,
): Promise<z.infer<typeof FileDeleteResult>> {
  const ws = resolveWorkspace(ctx, params.workspace);
  const abs = resolveSafePath(ws.root, params.path, ws.config);

  try {
    await rm(abs);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new RpcError("NOT_FOUND", `file does not exist: ${params.path}`);
    }
    throw err;
  }

  return { deleted: true };
}

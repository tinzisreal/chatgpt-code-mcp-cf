import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FileCreateParams, FileCreateResult } from "@chatgpt-code-mcp/protocol";
import { resolveSafePath } from "../sandbox.js";
import { resolveWorkspace, type ToolContext } from "./context.js";
import { sha256Hex } from "../lib/hash.js";
import { RpcError } from "../rpc-error.js";
import type { z } from "zod";

export async function fileCreate(
  ctx: ToolContext,
  params: z.infer<typeof FileCreateParams>,
): Promise<z.infer<typeof FileCreateResult>> {
  const ws = resolveWorkspace(ctx, params.workspace);
  const abs = resolveSafePath(ws.root, params.path, ws.config);

  await mkdir(path.dirname(abs), { recursive: true });
  try {
    await writeFile(abs, params.content, { encoding: "utf8", flag: "wx" });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      throw new RpcError("PRECONDITION_FAILED", `file already exists, use file_apply_patch to modify it: ${params.path}`);
    }
    throw err;
  }

  return { sha256: sha256Hex(params.content) };
}

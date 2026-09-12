import { readFile, writeFile } from "node:fs/promises";
import type { FileApplyPatchParams, FileApplyPatchResult } from "@chatgpt-code-mcp/protocol";
import { resolveSafePath } from "../sandbox.js";
import { resolveWorkspace, type ToolContext } from "./context.js";
import { sha256Hex } from "../lib/hash.js";
import { RpcError } from "../rpc-error.js";
import type { z } from "zod";

export async function fileApplyPatch(
  ctx: ToolContext,
  params: z.infer<typeof FileApplyPatchParams>,
): Promise<z.infer<typeof FileApplyPatchResult>> {
  const ws = resolveWorkspace(ctx, params.workspace);
  const abs = resolveSafePath(ws.root, params.path, ws.config);

  let current: string;
  try {
    current = await readFile(abs, "utf8");
  } catch {
    throw new RpcError("NOT_FOUND", `file does not exist: ${params.path}`);
  }

  const currentSha = sha256Hex(current);
  if (currentSha !== params.expectedSha256) {
    throw new RpcError(
      "PRECONDITION_FAILED",
      `expectedSha256 mismatch (file changed since it was last read): expected ${params.expectedSha256}, got ${currentSha}`,
    );
  }

  await writeFile(abs, params.newContent, "utf8");
  return { sha256: sha256Hex(params.newContent) };
}

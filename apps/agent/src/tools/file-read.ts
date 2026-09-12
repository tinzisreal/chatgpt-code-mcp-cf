import { readFile } from "node:fs/promises";
import type { FileReadParams, FileReadResult } from "@chatgpt-code-mcp/protocol";
import { resolveSafePath } from "../sandbox.js";
import { resolveWorkspace, type ToolContext } from "./context.js";
import { sha256Hex } from "../lib/hash.js";
import type { z } from "zod";

/** Same heuristic git/grep use: a NUL byte in the first few KB means "not text". */
function looksBinary(buf: Buffer): boolean {
  const sample = buf.subarray(0, 8000);
  return sample.includes(0);
}

export async function fileRead(
  ctx: ToolContext,
  params: z.infer<typeof FileReadParams>,
): Promise<z.infer<typeof FileReadResult>> {
  const ws = resolveWorkspace(ctx, params.workspace);
  const abs = resolveSafePath(ws.root, params.path, ws.config);
  const buffer = await readFile(abs);

  if (looksBinary(buffer)) {
    return {
      content: "",
      sha256: sha256Hex(buffer),
      isBinary: true,
      sizeBytes: buffer.byteLength,
    };
  }

  const content = buffer.toString("utf8");
  return { content, sha256: sha256Hex(buffer), isBinary: false, sizeBytes: buffer.byteLength };
}

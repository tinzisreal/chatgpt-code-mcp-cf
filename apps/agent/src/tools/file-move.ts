import { mkdir, rename, access, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import type { FileMoveParams, FileMoveResult } from "@chatgpt-code-mcp/protocol";
import { resolveSafePath } from "../sandbox.js";
import { resolveWorkspace, type ToolContext } from "./context.js";
import { RpcError } from "../rpc-error.js";
import type { z } from "zod";

export async function fileMove(
  ctx: ToolContext,
  params: z.infer<typeof FileMoveParams>,
): Promise<z.infer<typeof FileMoveResult>> {
  const fromWs = resolveWorkspace(ctx, params.fromWorkspace);
  const toWs = resolveWorkspace(ctx, params.toWorkspace);
  const fromAbs = resolveSafePath(fromWs.root, params.fromPath, fromWs.config);
  const toAbs = resolveSafePath(toWs.root, params.toPath, toWs.config);

  try {
    await access(fromAbs);
  } catch {
    throw new RpcError("NOT_FOUND", `source file does not exist: ${params.fromPath}`);
  }
  try {
    await access(toAbs);
    throw new RpcError("PRECONDITION_FAILED", `destination already exists: ${params.toPath}`);
  } catch (err) {
    if (err instanceof RpcError) throw err;
    // ENOENT from access() is the expected/good case here.
  }

  await mkdir(path.dirname(toAbs), { recursive: true });
  try {
    await rename(fromAbs, toAbs);
  } catch (err) {
    // rename() can't cross drives/devices (EXDEV) — e.g. moving from a C:\
    // workspace to a D:\ workspace. Fall back to a binary-safe copy+delete.
    if ((err as NodeJS.ErrnoException).code !== "EXDEV") throw err;
    const data = await readFile(fromAbs);
    await writeFile(toAbs, data);
    await rm(fromAbs);
  }

  return { moved: true };
}

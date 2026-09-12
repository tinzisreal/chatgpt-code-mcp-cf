import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import type { FileCreateXlsxParams, FileCreateXlsxResult } from "@chatgpt-code-mcp/protocol";
import { resolveSafePath } from "../sandbox.js";
import { resolveWorkspace, type ToolContext } from "./context.js";
import { sha256Hex } from "../lib/hash.js";
import { RpcError } from "../rpc-error.js";
import type { z } from "zod";

export async function fileCreateXlsx(
  ctx: ToolContext,
  params: z.infer<typeof FileCreateXlsxParams>,
): Promise<z.infer<typeof FileCreateXlsxResult>> {
  const ws = resolveWorkspace(ctx, params.workspace);
  const abs = resolveSafePath(ws.root, params.path, ws.config);

  const workbook = new ExcelJS.Workbook();
  for (const sheet of params.sheets) {
    const worksheet = workbook.addWorksheet(sheet.name);
    worksheet.addRows(sheet.rows);
  }
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

  await mkdir(path.dirname(abs), { recursive: true });
  try {
    await writeFile(abs, buffer, { flag: "wx" });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      throw new RpcError("PRECONDITION_FAILED", `file already exists: ${params.path}`);
    }
    throw err;
  }

  return { sha256: sha256Hex(buffer) };
}

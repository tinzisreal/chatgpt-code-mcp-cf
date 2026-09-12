import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun } from "docx";
import type { FileCreateDocxParams, FileCreateDocxResult } from "@chatgpt-code-mcp/protocol";
import { resolveSafePath } from "../sandbox.js";
import { resolveWorkspace, type ToolContext } from "./context.js";
import { sha256Hex } from "../lib/hash.js";
import { RpcError } from "../rpc-error.js";
import type { z } from "zod";

const HEADING_LEVEL = {
  h1: HeadingLevel.HEADING_1,
  h2: HeadingLevel.HEADING_2,
  h3: HeadingLevel.HEADING_3,
} as const;

function buildChildren(params: z.infer<typeof FileCreateDocxParams>) {
  const children: (Paragraph | Table)[] = [];

  if (params.title) {
    children.push(new Paragraph({ text: params.title, heading: HeadingLevel.TITLE }));
  }

  for (const block of params.blocks) {
    if (block.type === "paragraph") {
      children.push(
        new Paragraph({
          heading: block.heading ? HEADING_LEVEL[block.heading] : undefined,
          children: [new TextRun({ text: block.text, bold: block.bold })],
        }),
      );
    } else {
      children.push(
        new Table({
          rows: block.rows.map(
            (row) =>
              new TableRow({
                children: row.map((cellText) => new TableCell({ children: [new Paragraph(cellText)] })),
              }),
          ),
        }),
      );
    }
  }

  return children;
}

export async function fileCreateDocx(
  ctx: ToolContext,
  params: z.infer<typeof FileCreateDocxParams>,
): Promise<z.infer<typeof FileCreateDocxResult>> {
  const ws = resolveWorkspace(ctx, params.workspace);
  const abs = resolveSafePath(ws.root, params.path, ws.config);

  const doc = new Document({ sections: [{ children: buildChildren(params) }] });
  const buffer = await Packer.toBuffer(doc);

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

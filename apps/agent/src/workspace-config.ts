import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const CodeAgentConfigSchema = z.object({
  name: z.string(),
  allowedPaths: z.array(z.string()).default([]),
  blockedPaths: z.array(z.string()).default([]),
  commands: z
    .object({
      test: z.string().optional(),
      build: z.string().optional(),
    })
    .default({}),
});

export type CodeAgentConfig = z.infer<typeof CodeAgentConfigSchema>;

export async function readWorkspaceConfig(workspaceRoot: string): Promise<CodeAgentConfig> {
  const raw = await readFile(path.join(workspaceRoot, ".code-agent.json"), "utf8");
  // Strip a UTF-8 BOM — common when the file was saved by Notepad or
  // PowerShell's `Set-Content -Encoding utf8`, and JSON.parse rejects it.
  const withoutBom = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  return CodeAgentConfigSchema.parse(JSON.parse(withoutBom));
}

/** True if `dir` contains a `.code-agent.json` (i.e. is a workspace root). */
export async function hasWorkspaceConfig(dir: string): Promise<boolean> {
  try {
    await readFile(path.join(dir, ".code-agent.json"), "utf8");
    return true;
  } catch {
    return false;
  }
}

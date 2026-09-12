import { z } from "zod";

/**
 * One schema pair per MCP tool exposed by the Gateway (apps/gateway/src/mcp/tools/*)
 * and executed by the agent (apps/agent/src/tools/*). Both sides import from here so
 * the wire contract can't drift between them.
 */

const workspaceTarget = {
  machineId: z.string().min(1).describe("Machine ID from machines_list, e.g. \"my-pc-prod\"."),
  workspace: z
    .string()
    .min(1)
    .describe(
      'Workspace NAME from workspaces_list (e.g. "desktop"), NOT a filesystem path. Call workspaces_list first if unsure — passing a raw path here always fails with NOT_FOUND. Use "computer" for whole-machine access spanning any drive — its path/fromPath/toPath must then be an ABSOLUTE path with drive letter (e.g. "D:\\project\\file.txt") instead of a path relative to a workspace root. "computer" has no single directory, so git_status/git_diff/test_run reject it — use a drive/folder-specific workspace for those.',
    ),
};

export const MachinesListParams = z.object({});
export const MachinesListResult = z.object({
  machines: z.array(
    z.object({
      machineId: z.string(),
      online: z.boolean(),
      lastSeenAt: z.string().nullable(),
    }),
  ),
});

export const WorkspacesListParams = z.object({ machineId: z.string().min(1) });
export const WorkspacesListResult = z.object({
  workspaces: z.array(
    z.object({
      name: z.string(),
      root: z.string(),
    }),
  ),
});

export const DirectoryListParams = z.object({
  ...workspaceTarget,
  path: z.string().default("."),
});
export const DirectoryListResult = z.object({
  entries: z.array(
    z.object({
      name: z.string(),
      type: z.enum(["file", "directory"]),
    }),
  ),
});

export const FileReadParams = z.object({
  ...workspaceTarget,
  path: z.string().min(1),
});
export const FileReadResult = z.object({
  content: z.string(),
  sha256: z.string(),
  /** True if the file looks binary (e.g. .docx, .xlsx) — content is "" in that
   * case; use sizeBytes/sha256 to verify it instead of reading it as text. */
  isBinary: z.boolean().optional(),
  sizeBytes: z.number().optional(),
});

export const CodeSearchParams = z.object({
  ...workspaceTarget,
  query: z.string().min(1),
  globs: z.array(z.string()).optional(),
});
export const CodeSearchResult = z.object({
  matches: z.array(
    z.object({
      path: z.string(),
      line: z.number(),
      text: z.string(),
    }),
  ),
});

export const FileApplyPatchParams = z.object({
  ...workspaceTarget,
  path: z.string().min(1),
  expectedSha256: z.string().length(64),
  newContent: z.string(),
});
export const FileApplyPatchResult = z.object({
  sha256: z.string(),
});

export const FileCreateParams = z.object({
  ...workspaceTarget,
  path: z.string().min(1),
  content: z.string(),
});
export const FileCreateResult = z.object({ sha256: z.string() });

export const FileDeleteParams = z.object({
  ...workspaceTarget,
  path: z.string().min(1),
});
export const FileDeleteResult = z.object({ deleted: z.literal(true) });

export const FileMoveParams = z.object({
  machineId: z.string().min(1).describe("Machine ID from machines_list, e.g. \"my-pc-prod\"."),
  fromWorkspace: z.string().min(1).describe("Workspace NAME (from workspaces_list) the source file is in."),
  fromPath: z.string().min(1).describe('Relative to fromWorkspace, or absolute if fromWorkspace is "computer".'),
  toWorkspace: z
    .string()
    .min(1)
    .describe(
      "Workspace NAME (from workspaces_list) the destination is in — can be a DIFFERENT workspace than fromWorkspace (e.g. moving from \"desktop\" to a workspace on another drive); this works across drives, not just within one workspace.",
    ),
  toPath: z.string().min(1).describe('Relative to toWorkspace, or absolute if toWorkspace is "computer".'),
});
export const FileMoveResult = z.object({ moved: z.literal(true) });

export const GitStatusParams = z.object({ ...workspaceTarget });
export const GitStatusResult = z.object({ status: z.string() });

export const GitDiffParams = z.object({
  ...workspaceTarget,
  path: z.string().optional(),
});
export const GitDiffResult = z.object({ diff: z.string() });

export const TestRunParams = z.object({ ...workspaceTarget });
export const TestRunResult = z.object({
  exitCode: z.number(),
  stdout: z.string(),
  stderr: z.string(),
});

const DocxParagraphBlock = z.object({
  type: z.literal("paragraph"),
  text: z.string(),
  heading: z.enum(["h1", "h2", "h3"]).optional(),
  bold: z.boolean().optional(),
});
const DocxTableBlock = z.object({
  type: z.literal("table"),
  rows: z.array(z.array(z.string())).min(1),
});
const DocxBlock = z.discriminatedUnion("type", [DocxParagraphBlock, DocxTableBlock]);

export const FileCreateDocxParams = z.object({
  ...workspaceTarget,
  path: z.string().min(1),
  title: z.string().optional(),
  blocks: z.array(DocxBlock).min(1),
});
export const FileCreateDocxResult = z.object({ sha256: z.string() });

const XlsxCellValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export const FileCreateXlsxParams = z.object({
  ...workspaceTarget,
  path: z.string().min(1),
  sheets: z
    .array(
      z.object({
        name: z.string().min(1),
        rows: z.array(z.array(XlsxCellValue)),
      }),
    )
    .min(1),
});
export const FileCreateXlsxResult = z.object({ sha256: z.string() });

/**
 * HIGH RISK: runs an arbitrary shell command directly on the paired host
 * machine. Unlike every other tool here, this has no path/command whitelist
 * — `cwd` is validated to stay inside the workspace, but the command itself
 * can read/write/delete anything the OS user running code-agent can touch.
 * Only enabled because the user explicitly confirmed this tradeoff.
 */
export const TerminalExecParams = z.object({
  ...workspaceTarget,
  command: z.string().min(1),
  cwd: z.string().optional(),
  timeoutMs: z.number().int().positive().max(600_000).optional(),
});
export const TerminalExecResult = z.object({
  exitCode: z.number(),
  stdout: z.string(),
  stderr: z.string(),
});

export const ToolSchemas = {
  machines_list: { params: MachinesListParams, result: MachinesListResult },
  workspaces_list: { params: WorkspacesListParams, result: WorkspacesListResult },
  directory_list: { params: DirectoryListParams, result: DirectoryListResult },
  file_read: { params: FileReadParams, result: FileReadResult },
  code_search: { params: CodeSearchParams, result: CodeSearchResult },
  file_apply_patch: { params: FileApplyPatchParams, result: FileApplyPatchResult },
  file_create: { params: FileCreateParams, result: FileCreateResult },
  file_delete: { params: FileDeleteParams, result: FileDeleteResult },
  file_move: { params: FileMoveParams, result: FileMoveResult },
  git_status: { params: GitStatusParams, result: GitStatusResult },
  git_diff: { params: GitDiffParams, result: GitDiffResult },
  test_run: { params: TestRunParams, result: TestRunResult },
  file_create_docx: { params: FileCreateDocxParams, result: FileCreateDocxResult },
  file_create_xlsx: { params: FileCreateXlsxParams, result: FileCreateXlsxResult },
  terminal_exec: { params: TerminalExecParams, result: TerminalExecResult },
} as const;

export type ToolName = keyof typeof ToolSchemas;

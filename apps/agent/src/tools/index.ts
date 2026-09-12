import { ToolSchemas, type ToolName } from "@chatgpt-code-mcp/protocol";
import { RpcError } from "../rpc-error.js";
import type { ToolContext } from "./context.js";
import { directoryList } from "./directory-list.js";
import { fileRead } from "./file-read.js";
import { codeSearch } from "./code-search.js";
import { fileApplyPatch } from "./file-apply-patch.js";
import { fileCreate } from "./file-create.js";
import { fileDelete } from "./file-delete.js";
import { fileMove } from "./file-move.js";
import { gitStatus } from "./git-status.js";
import { gitDiff } from "./git-diff.js";
import { testRun } from "./test-run.js";
import { fileCreateDocx } from "./file-create-docx.js";
import { fileCreateXlsx } from "./file-create-xlsx.js";
import { terminalExec } from "./terminal-exec.js";

type AgentToolName = Exclude<ToolName, "machines_list" | "workspaces_list">;

const handlers: Record<AgentToolName, (ctx: ToolContext, params: never) => Promise<unknown>> = {
  directory_list: directoryList,
  file_read: fileRead,
  code_search: codeSearch,
  file_apply_patch: fileApplyPatch,
  file_create: fileCreate,
  file_delete: fileDelete,
  file_move: fileMove,
  git_status: gitStatus,
  git_diff: gitDiff,
  test_run: testRun,
  file_create_docx: fileCreateDocx,
  file_create_xlsx: fileCreateXlsx,
  terminal_exec: terminalExec,
};

export async function runTool(ctx: ToolContext, method: string, rawParams: unknown): Promise<unknown> {
  const handler = (handlers as Record<string, (ctx: ToolContext, params: unknown) => Promise<unknown>>)[method];
  if (!handler) throw new RpcError("INVALID_PARAMS", `unknown tool: ${method}`);

  const schema = ToolSchemas[method as AgentToolName];
  const parsed = schema.params.safeParse(rawParams);
  if (!parsed.success) {
    throw new RpcError("INVALID_PARAMS", `invalid params for ${method}: ${parsed.error.message}`);
  }

  return handler(ctx, parsed.data as never);
}

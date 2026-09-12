import { zodToJsonSchema } from "zod-to-json-schema";
import { ToolSchemas, type ToolName } from "@chatgpt-code-mcp/protocol";
import type { Env } from "../env.js";
import { Db } from "../db/client.js";
import { dispatchToMachine, isMachineOnline } from "../lib/relay.js";

export interface McpToolContent {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export interface ToolDef {
  name: ToolName;
  description: string;
  handler: (env: Env, args: unknown) => Promise<McpToolContent>;
}

function ok(value: unknown): McpToolContent {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

function fail(message: string): McpToolContent {
  return { content: [{ type: "text", text: message }], isError: true };
}

/**
 * How long the Gateway waits for the agent to answer, per tool. Must exceed
 * the agent-side execution timeout, otherwise a long build/test/command
 * returns TIMEOUT to ChatGPT at the DO's 30s default while it keeps running on
 * the host (side effects happen, reply is dropped). Margin added for overhead.
 */
function dispatchTimeoutFor(name: ToolName, params: unknown): number | undefined {
  if (name === "terminal_exec") {
    const requested = (params as { timeoutMs?: number }).timeoutMs ?? 120_000;
    return requested + 15_000;
  }
  if (name === "test_run") return 195_000; // agent test default 120s + headroom
  return undefined; // quick file/git ops: DO's 30s default is plenty
}

/** Every tool except machines_list/workspaces_list follows the same shape:
 * validate params, forward to the agent over the relay, map the RPC result. */
function relayTool(name: Exclude<ToolName, "machines_list" | "workspaces_list">, description: string): ToolDef {
  return {
    name,
    description,
    async handler(env, args) {
      const schema = ToolSchemas[name];
      const parsed = schema.params.safeParse(args);
      if (!parsed.success) return fail(`invalid_params: ${parsed.error.message}`);

      const machineId = (parsed.data as { machineId: string }).machineId;
      const res = await dispatchToMachine(env, machineId, name, parsed.data, dispatchTimeoutFor(name, parsed.data));
      if (!res.ok) return fail(`${res.error.code}: ${res.error.message}`);
      return ok(res.result);
    },
  };
}

const machinesListTool: ToolDef = {
  name: "machines_list",
  description: "List agent machines known to this Gateway and whether each is currently online.",
  async handler(env) {
    const db = new Db(env.DB);
    const rows = await db.listMachines();
    const onlineFlags = await Promise.all(rows.map((r) => isMachineOnline(env, r.machine_id)));
    return ok({
      machines: rows.map((r, i) => ({
        machineId: r.machine_id,
        online: onlineFlags[i],
        lastSeenAt: r.last_seen_at,
      })),
    });
  },
};

const workspacesListTool: ToolDef = {
  name: "workspaces_list",
  description:
    "List workspaces exposed by a given machine, each with its real filesystem root. Multiple workspaces can overlap (e.g. a broad drive-wide one and a narrower one nested inside it) — when the user names a specific real-world location (\"Desktop\", \"Documents\"), pick the single workspace whose name/root matches that location and write there ONCE. Do not write the same file to multiple workspaces as a hedge against ambiguity.",
  async handler(env, args) {
    const parsed = ToolSchemas.workspaces_list.params.safeParse(args);
    if (!parsed.success) return fail(`invalid_params: ${parsed.error.message}`);
    const db = new Db(env.DB);
    const rows = await db.listWorkspaces(parsed.data.machineId);
    return ok({ workspaces: rows.map((r) => ({ name: r.name, root: r.root_path })) });
  },
};

export const toolDefs: ToolDef[] = [
  machinesListTool,
  workspacesListTool,
  relayTool("directory_list", "List files and directories at a path inside a workspace."),
  relayTool(
    "file_read",
    "Read a file's content and its SHA-256 hash. For binary files (isBinary: true, e.g. .docx/.xlsx/images), content is empty — that is expected, not corruption; verify via sha256/sizeBytes instead of reading binary files as text.",
  ),
  relayTool("code_search", "Search code in a workspace using ripgrep."),
  relayTool(
    "file_apply_patch",
    "Overwrite a file's content, guarded by an expectedSha256 precondition to avoid clobbering concurrent edits.",
  ),
  relayTool("file_create", "Create a new file with the given content."),
  relayTool("file_delete", "Delete a file."),
  relayTool(
    "file_move",
    "Move/rename a file, or move it between two DIFFERENT workspaces (e.g. across drives) by setting fromWorkspace/toWorkspace to different names — falls back to copy+delete automatically when the move crosses drives.",
  ),
  relayTool("git_status", "Show `git status` for a workspace."),
  relayTool("git_diff", "Show `git diff` for a workspace, optionally scoped to one path."),
  relayTool("test_run", "Run the whitelisted test command configured in the workspace's .code-agent.json."),
  relayTool(
    "file_create_docx",
    "Create a real .docx Word document from structured content (title, headings, paragraphs, tables).",
  ),
  relayTool(
    "file_create_xlsx",
    "Create a real .xlsx Excel workbook from structured sheet data (sheet name + rows of cells).",
  ),
  relayTool(
    "terminal_exec",
    "Run an arbitrary shell command directly on the paired machine's real OS, inside the workspace directory (or a cwd within it). HIGH RISK: no command whitelist — only use when the user has explicitly asked for shell/terminal access.",
  ),
];

export function toolDefToMcp(def: ToolDef) {
  const schema = ToolSchemas[def.name];
  return {
    name: def.name,
    description: def.description,
    inputSchema: zodToJsonSchema(schema.params, { target: "jsonSchema7" }),
  };
}

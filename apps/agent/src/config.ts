import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export interface AgentConfig {
  machineId: string;
  gatewayUrl: string;
  /** Plaintext token — the Gateway only ever stores its SHA-256 hash. */
  agentToken: string;
  /** One or more roots to scan for workspaces (e.g. separate drives/profile dirs). */
  workspaceRoots: string[];
}

const CONFIG_DIR = path.join(homedir(), ".config", "chatgpt-code-mcp");
const CONFIG_PATH = path.join(CONFIG_DIR, "agent.json");

export async function loadConfig(): Promise<AgentConfig | null> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf8");
    return JSON.parse(raw) as AgentConfig;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function saveConfig(config: AgentConfig): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 });
}

export function configPath(): string {
  return CONFIG_PATH;
}

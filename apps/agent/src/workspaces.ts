import { readdir } from "node:fs/promises";
import path from "node:path";
import { hasWorkspaceConfig, readWorkspaceConfig, type CodeAgentConfig } from "./workspace-config.js";
import { WHOLE_MACHINE_ROOT } from "./sandbox.js";

export interface DiscoveredWorkspace {
  name: string;
  root: string;
  config: CodeAgentConfig;
}

/** Blocks that apply regardless of which drive/path an absolute path under
 * the "computer" workspace resolves to — same categories as every other
 * workspace's default config, just glob-anchored to match anywhere. */
const WHOLE_MACHINE_CONFIG: CodeAgentConfig = {
  name: "computer",
  allowedPaths: ["**"],
  blockedPaths: [
    "**/.env*",
    "**/secrets/**",
    "**/*.key",
    "**/*.pem",
    "**/node_modules/**",
    "**/.git/**",
    "**/.ssh/**",
  ],
  commands: {},
};

/** A workspace is either a root itself (if it has .code-agent.json) or any
 * immediate subdirectory of it that has one — matches how the sample repo's
 * README describes pairing a folder that *contains* workspaces. Scans every
 * paired root (e.g. separate drives/profile dirs) and merges the results;
 * later roots don't override earlier ones if two workspaces share a name. */
export async function discoverWorkspaces(workspaceRoots: string[]): Promise<DiscoveredWorkspace[]> {
  const found: DiscoveredWorkspace[] = [];
  const seenNames = new Set<string>();

  const addIfNew = (candidate: DiscoveredWorkspace) => {
    if (seenNames.has(candidate.name)) return;
    seenNames.add(candidate.name);
    found.push(candidate);
  };

  // Synthetic whole-machine workspace, always available once any root is
  // paired — accepts absolute paths on any drive instead of being anchored
  // to one directory. Registered first so a real .code-agent.json named
  // "computer" (if one ever exists) would take precedence via addIfNew.
  if (workspaceRoots.length > 0) {
    addIfNew({ name: "computer", root: WHOLE_MACHINE_ROOT, config: WHOLE_MACHINE_CONFIG });
  }

  for (const workspaceRoot of workspaceRoots) {
    if (await hasWorkspaceConfig(workspaceRoot)) {
      const config = await readWorkspaceConfig(workspaceRoot);
      addIfNew({ name: config.name, root: workspaceRoot, config });
    }

    let entries;
    try {
      entries = await readdir(workspaceRoot, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const dir = path.join(workspaceRoot, entry.name);
      if (await hasWorkspaceConfig(dir)) {
        const config = await readWorkspaceConfig(dir);
        addIfNew({ name: config.name, root: dir, config });
      }
    }
  }

  return found;
}

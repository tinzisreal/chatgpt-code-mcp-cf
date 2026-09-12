import { loadConfig } from "../config.js";
import { discoverWorkspaces } from "../workspaces.js";

export async function workspaces(): Promise<void> {
  const config = await loadConfig();
  if (!config) {
    console.log('Not paired. Run "code-agent pair" first.');
    return;
  }
  const found = await discoverWorkspaces(config.workspaceRoots);
  if (found.length === 0) {
    console.log(`No workspaces found under ${config.workspaceRoots.join(", ")} (looking for .code-agent.json).`);
    return;
  }
  for (const w of found) {
    console.log(`${w.name}\t${w.root}`);
  }
}

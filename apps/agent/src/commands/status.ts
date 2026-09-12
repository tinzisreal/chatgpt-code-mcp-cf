import { loadConfig, configPath } from "../config.js";

export async function status(): Promise<void> {
  const config = await loadConfig();
  if (!config) {
    console.log(`Not paired. Config file: ${configPath()} (not found)`);
    console.log('Run "code-agent pair --machine-id <id> --gateway <url> --workspace-root <path>" first.');
    return;
  }
  console.log(`Machine ID:      ${config.machineId}`);
  console.log(`Gateway:         ${config.gatewayUrl}`);
  console.log(`Workspace roots: ${config.workspaceRoots.join(", ")}`);
  console.log(`Config file:     ${configPath()}`);
}

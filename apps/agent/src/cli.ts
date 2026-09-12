#!/usr/bin/env node
import { parseArgs } from "node:util";
import { pair } from "./commands/pair.js";
import { start } from "./commands/start.js";
import { status } from "./commands/status.js";
import { workspaces } from "./commands/workspaces.js";

async function main() {
  const [command, ...rest] = process.argv.slice(2);

  switch (command) {
    case "pair": {
      const { values } = parseArgs({
        args: rest,
        options: {
          "machine-id": { type: "string" },
          gateway: { type: "string" },
          "workspace-root": { type: "string", multiple: true },
        },
      });
      const workspaceRoots = values["workspace-root"] ?? [];
      if (!values["machine-id"] || !values.gateway || workspaceRoots.length === 0) {
        console.error(
          "Usage: code-agent pair --machine-id <id> --gateway <url> --workspace-root <path> [--workspace-root <path> ...]",
        );
        process.exitCode = 1;
        return;
      }
      await pair({
        machineId: values["machine-id"],
        gateway: values.gateway,
        workspaceRoots,
      });
      return;
    }
    case "start":
      await start();
      return;
    case "status":
      await status();
      return;
    case "workspaces":
      await workspaces();
      return;
    default:
      console.error("Usage: code-agent <pair|start|status|workspaces> [options]");
      process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});

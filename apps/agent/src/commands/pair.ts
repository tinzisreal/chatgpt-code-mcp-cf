import { saveConfig } from "../config.js";
import { randomToken } from "../lib/token.js";
import { sha256Hex } from "../lib/hash.js";

export interface PairArgs {
  machineId: string;
  gateway: string;
  workspaceRoots: string[];
}

interface PairStartResponse {
  code: string;
  approveUrl: string;
  expiresInSeconds: number;
  pollIntervalSeconds: number;
}

interface PairStatusResponse {
  approved: boolean;
  expired: boolean;
}

export async function pair(args: PairArgs): Promise<void> {
  const gatewayUrl = args.gateway.replace(/\/$/, "");
  const agentToken = randomToken(32);
  const agentTokenHash = sha256Hex(agentToken);

  const startRes = await fetch(`${gatewayUrl}/pair/start`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      machineId: args.machineId,
      workspaceRoot: args.workspaceRoots.join("; "),
      agentTokenHash,
    }),
  });
  if (!startRes.ok) {
    throw new Error(`pair/start failed: ${startRes.status} ${await startRes.text()}`);
  }
  const start = (await startRes.json()) as PairStartResponse;

  console.log(`Open this URL to approve pairing:\n\n  ${start.approveUrl}\n`);
  console.log(`Waiting for approval (expires in ${start.expiresInSeconds}s)...`);

  const deadline = Date.now() + start.expiresInSeconds * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, start.pollIntervalSeconds * 1000));
    const statusRes = await fetch(`${gatewayUrl}/pair/status/${start.code}`);
    if (!statusRes.ok) continue;
    const status = (await statusRes.json()) as PairStatusResponse;
    if (status.expired) throw new Error("pairing code expired before it was approved");
    if (status.approved) {
      await saveConfig({
        machineId: args.machineId,
        gatewayUrl,
        agentToken,
        workspaceRoots: args.workspaceRoots,
      });
      console.log(`Paired as "${args.machineId}". Run "code-agent start" to connect.`);
      return;
    }
  }
  throw new Error("pairing timed out waiting for approval");
}

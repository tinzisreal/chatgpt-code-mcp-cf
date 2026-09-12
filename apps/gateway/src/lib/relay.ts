import type { RpcResponse } from "@chatgpt-code-mcp/protocol";
import type { Env } from "../env.js";

function stubFor(env: Env, machineId: string) {
  const id = env.MACHINE_SESSIONS.idFromName(machineId);
  return env.MACHINE_SESSIONS.get(id);
}

export async function dispatchToMachine(
  env: Env,
  machineId: string,
  method: string,
  params: unknown,
  timeoutMs?: number,
): Promise<RpcResponse> {
  const stub = stubFor(env, machineId);
  const res = await stub.fetch("https://machine-session/dispatch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ method, params, timeoutMs }),
  });
  return (await res.json()) as RpcResponse;
}

export async function isMachineOnline(env: Env, machineId: string): Promise<boolean> {
  const stub = stubFor(env, machineId);
  const res = await stub.fetch("https://machine-session/online");
  const body = (await res.json()) as { online: boolean };
  return body.online;
}

export function machineConnectStub(env: Env, machineId: string) {
  return stubFor(env, machineId);
}

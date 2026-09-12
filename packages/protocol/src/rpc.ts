/**
 * Envelope for every message exchanged over the Gateway <-> Agent WebSocket
 * (apps/gateway's MachineSession Durable Object <-> apps/agent's `start` command).
 */

export interface RpcRequest<TParams = unknown> {
  type: "request";
  id: string;
  method: string;
  params: TParams;
}

export interface RpcResponseOk<TResult = unknown> {
  type: "response";
  id: string;
  ok: true;
  result: TResult;
}

export interface RpcResponseErr {
  type: "response";
  id: string;
  ok: false;
  error: {
    code: RpcErrorCode;
    message: string;
  };
}

export type RpcResponse<TResult = unknown> = RpcResponseOk<TResult> | RpcResponseErr;

export type RpcErrorCode =
  | "PATH_NOT_ALLOWED"
  | "PRECONDITION_FAILED"
  | "NOT_FOUND"
  | "COMMAND_NOT_WHITELISTED"
  | "TIMEOUT"
  | "AGENT_OFFLINE"
  | "INVALID_PARAMS"
  | "INTERNAL_ERROR";

export function isRpcRequest(msg: unknown): msg is RpcRequest {
  return (
    typeof msg === "object" &&
    msg !== null &&
    (msg as Record<string, unknown>).type === "request"
  );
}

export function isRpcResponse(msg: unknown): msg is RpcResponse {
  return (
    typeof msg === "object" &&
    msg !== null &&
    (msg as Record<string, unknown>).type === "response"
  );
}

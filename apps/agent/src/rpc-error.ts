import type { RpcErrorCode } from "@chatgpt-code-mcp/protocol";

export class RpcError extends Error {
  constructor(
    public readonly code: RpcErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RpcError";
  }
}

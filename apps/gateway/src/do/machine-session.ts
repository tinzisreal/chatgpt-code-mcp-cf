import { isRpcResponse, type RpcErrorCode, type RpcRequest, type RpcResponse } from "@chatgpt-code-mcp/protocol";

interface PendingCall {
  resolve: (r: RpcResponse) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

interface SocketAttachment {
  connectedAt: number;
}

const DEFAULT_DISPATCH_TIMEOUT_MS = 30_000;

/**
 * One Durable Object instance per machine-id (named via idFromName). Holds the
 * agent's inbound WebSocket connection and relays MCP tool calls to it,
 * correlating requests/responses by id with a timeout.
 *
 * Uses the WebSocket Hibernation API (`state.acceptWebSocket` /
 * `getWebSockets`, `webSocketMessage`/`webSocketClose`/`webSocketError`
 * lifecycle methods) instead of the classic `server.accept()` pattern —
 * a non-hibernating DO gets evicted whenever it's idle (nothing actively
 * running), which silently drops the agent's WebSocket even though nothing
 * was wrong. Hibernation lets Cloudflare's edge hold the socket open across
 * eviction and re-wake this DO on the next message/dispatch.
 *
 * Does NOT synchronously `.close()` a prior socket when a new one connects —
 * empirically, doing so inside the same handleConnect() invocation that also
 * calls acceptWebSocket() raced and killed the brand-new connection itself
 * (visible as an endless reconnect loop with close reason "replaced by new
 * connection" applied to the socket that had just opened). Instead, each
 * accepted socket is tagged with a connectedAt attachment, and dispatch/online
 * always pick the most recently connected one — correct even if an old,
 * already-dead socket briefly lingers in getWebSockets() until Cloudflare
 * notices it's gone.
 */
export class MachineSession {
  private readonly pending = new Map<string, PendingCall>();

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: unknown,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/connect") {
      return this.handleConnect(request);
    }
    if (url.pathname === "/dispatch" && request.method === "POST") {
      return this.handleDispatch(request);
    }
    if (url.pathname === "/online" && request.method === "GET") {
      return Response.json({ online: this.activeSocket() !== null });
    }
    return new Response("not found", { status: 404 });
  }

  /** The most recently connected socket, or null if none are registered. */
  private activeSocket(): WebSocket | null {
    const sockets = this.state.getWebSockets();
    if (sockets.length === 0) return null;
    let newest = sockets[0];
    let newestAt = (newest.deserializeAttachment() as SocketAttachment | null)?.connectedAt ?? 0;
    for (const ws of sockets.slice(1)) {
      const at = (ws.deserializeAttachment() as SocketAttachment | null)?.connectedAt ?? 0;
      if (at > newestAt) {
        newest = ws;
        newestAt = at;
      }
    }
    return newest;
  }

  private handleConnect(request: Request): Response {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket upgrade", { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    this.state.acceptWebSocket(server);
    server.serializeAttachment({ connectedAt: Date.now() } satisfies SocketAttachment);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (ws !== this.activeSocket()) return; // ignore messages from a superseded connection

    let msg: unknown;
    try {
      msg = JSON.parse(typeof message === "string" ? message : "");
    } catch {
      return;
    }
    if (!isRpcResponse(msg)) return;
    const pendingCall = this.pending.get(msg.id);
    if (!pendingCall) return;
    clearTimeout(pendingCall.timeoutId);
    this.pending.delete(msg.id);
    pendingCall.resolve(msg);
  }

  async webSocketClose(ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): Promise<void> {
    if (ws === this.activeSocket()) {
      this.failAllPending("AGENT_OFFLINE", "agent disconnected");
    }
  }

  async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    if (ws === this.activeSocket()) {
      this.failAllPending("AGENT_OFFLINE", "agent disconnected");
    }
  }

  private failAllPending(code: RpcErrorCode, message: string) {
    for (const [id, call] of this.pending) {
      clearTimeout(call.timeoutId);
      call.resolve({ type: "response", id, ok: false, error: { code, message } });
    }
    this.pending.clear();
  }

  private async handleDispatch(request: Request): Promise<Response> {
    const body = (await request.json()) as { method: string; params: unknown; timeoutMs?: number };

    const ws = this.activeSocket();
    if (!ws) {
      const offline: RpcResponse = {
        type: "response",
        id: "",
        ok: false,
        error: { code: "AGENT_OFFLINE", message: "agent is not connected" },
      };
      return Response.json(offline);
    }

    const id = crypto.randomUUID();
    const req: RpcRequest = { type: "request", id, method: body.method, params: body.params };

    const result = await new Promise<RpcResponse>((resolve) => {
      const timeoutId = setTimeout(() => {
        this.pending.delete(id);
        resolve({
          type: "response",
          id,
          ok: false,
          error: { code: "TIMEOUT", message: "agent did not respond in time" },
        });
      }, body.timeoutMs ?? DEFAULT_DISPATCH_TIMEOUT_MS);

      this.pending.set(id, { resolve, timeoutId });
      ws.send(JSON.stringify(req));
    });

    return Response.json(result);
  }
}

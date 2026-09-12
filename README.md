# chatgpt-code-mcp

Project chính đứng sau repo mẫu [`chatgpt-code-mcp-sample`](../MCP-CHATGPT-TO-WEB) —
cung cấp Gateway (MCP server ChatGPT kết nối tới) và `code-agent` (chạy trên máy bạn,
thao tác lên workspace local).

## Cấu trúc

```text
apps/gateway/     Cloudflare Worker — OAuth 2.1, Durable Object relay, MCP endpoint
apps/agent/       code-agent CLI — pair/start/status/workspaces, thực thi tool trên workspace local
packages/protocol/ Types dùng chung giữa gateway và agent (RPC envelope, tool schemas)
```

## Kiến trúc

```text
ChatGPT (Developer Mode connector)
   │  HTTPS, OAuth 2.1 (DCR + PKCE), MCP Streamable HTTP
   ▼
apps/gateway  (Cloudflare Worker + Durable Objects + D1)
   │  WebSocket (agent giữ kết nối inbound)
   ▼
apps/agent    (Node.js CLI chạy trên máy bạn)
   │  sandbox theo <workspace>/.code-agent.json
   ▼
workspace repo mục tiêu (vd. chatgpt-code-mcp-sample)
```

## Phát triển

```bash
pnpm install
pnpm --filter @chatgpt-code-mcp/gateway dev   # wrangler dev, local
pnpm --filter @chatgpt-code-mcp/agent build
```

Xem `plans/2026-09-10-gateway-agent-mvp/plan.md` để biết chi tiết từng phase.

## Bảo mật

- `OWNER_SECRET` (biến môi trường của Worker) là bí mật duy nhất kiểm soát ai được
  approve OAuth authorize / pairing request. Không commit vào Git, không log ra console.
- Agent token và OAuth token được lưu cục bộ tại `~/.config/chatgpt-code-mcp/agent.json`,
  không bao giờ trong thư mục workspace.

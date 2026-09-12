# chatgpt-code-mcp — Hướng dẫn sử dụng

Tài liệu này dành cho người vận hành (bạn) — cách khởi động, danh sách tool
đầy đủ, ví dụ gọi tool, và từ điển thuật ngữ. Xem `README.md` để biết kiến
trúc tổng quan, xem `plans/2026-09-10-gateway-agent-mvp/` để biết chi tiết
thiết kế từng phase.

## 1. Trạng thái hệ thống hiện tại

| Thành phần | Giá trị |
|---|---|
| Gateway (production) | `https://chatgpt-code-mcp.tuanhai362005t.workers.dev` |
| MCP endpoint (dán vào ChatGPT connector) | `https://chatgpt-code-mcp.tuanhai362005t.workers.dev/mcp` |
| Machine ID | `my-pc-prod` |
| Workspace roots đã pair | `D:\`, `C:\Users\Admin` |
| Workspaces hiện có | **`computer`** — workspace tổng hợp duy nhất, không neo thư mục nào, nhận đường dẫn tuyệt đối bất kỳ trên `C:\` hoặc `D:\` (xem mục 4) |
| Repo Gateway/agent | https://github.com/HelloWorld3605/chatgpt-code-mcp |
| Repo sample workspace | https://github.com/HelloWorld3605/MCP-CHATGPT-TO-WEB |
| CI/CD | GitHub Actions — typecheck mọi push/PR; auto-deploy Gateway khi `apps/gateway` hoặc `packages/protocol` đổi trên nhánh `master` |

## 2. Khởi động / kết nối lại agent

Agent (`code-agent`) là process chạy nền trên máy bạn, giữ kết nối WebSocket
tới Gateway. **Không phải service Windows** — tắt máy/đóng terminal là nó
dừng, cần bật lại thủ công.

```powershell
powershell -File "D:\LearningPesonal\repo git\chatgpt-code-mcp\apps\agent\start-agent.ps1"
```

Chạy lệnh này khi:
- Vừa khởi động lại máy.
- ChatGPT báo lỗi `AGENT_OFFLINE`.
- Vừa đổi `.code-agent.json` hoặc code của agent (cần nạp lại).

Kiểm tra agent có đang chạy không:

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'cli.ts start' }
```

## 3. Pair máy mới / đổi workspace root

```powershell
cd "D:\LearningPesonal\repo git\chatgpt-code-mcp\apps\agent"
pnpm exec tsx src/cli.ts pair --machine-id <id> --gateway https://chatgpt-code-mcp.tuanhai362005t.workers.dev --workspace-root "D:\" --workspace-root "C:\Users\Admin"
```

- `--workspace-root` có thể lặp lại nhiều lần — mỗi root được quét độc lập
  để tìm workspace (thư mục có `.code-agent.json`).
- Lệnh in ra 1 URL — mở URL đó, nhập **owner secret** để phê duyệt pairing.
- Sau khi approve, chạy lại `start-agent.ps1`.

Các lệnh CLI khác:

```
code-agent status       # xem machine ID, gateway, workspace roots đã pair
code-agent workspaces   # liệt kê workspace phát hiện được (không cần chạy start)
```

## 4. Workspace `computer` và cách thêm workspace theo thư mục

### `computer` — workspace mặc định, dùng cho hầu hết mọi việc

Không nằm ở file nào trên đĩa — được sinh thẳng trong code agent
(`apps/agent/src/workspaces.ts`), tự động có mặt miễn là đã pair ít nhất 1
`--workspace-root`. Khi gọi tool với `workspace: "computer"`, tham số
`path`/`fromPath`/`toPath` phải là **đường dẫn tuyệt đối có ổ đĩa**
(`D:\project\file.txt`, `C:\Users\Admin\Desktop\x.docx`...), không phải
đường dẫn tương đối.

Giới hạn của `computer`:
- **Không hỗ trợ** `git_status`, `git_diff`, `test_run` — các tool này cần
  1 thư mục cụ thể làm cwd, mà `computer` không neo vào thư mục nào.
- Vẫn tôn trọng `blockedPaths` mặc định (`.env*`, `.git/**`, `secrets/**`,
  `*.key`, `*.pem`, `.ssh/**`, `node_modules/**`) trên **toàn bộ máy**, bất
  kể đường dẫn nằm ở ổ nào.

### Thêm workspace riêng cho 1 thư mục/project cụ thể

Cần khi muốn `git_status`/`git_diff`/`test_run` hoạt động đúng cho 1 repo,
hoặc muốn giới hạn quyền hẹp hơn `computer` cho 1 khu vực nào đó. Tạo file
`.code-agent.json` ngay trong thư mục đó:

```json
{
  "name": "ten-workspace",
  "allowedPaths": ["**"],
  "blockedPaths": [".env*", "secrets/**", "**/*.key", "**/*.pem", "**/.git/**"],
  "commands": { "test": "pnpm test" }
}
```

- Thư mục này phải là chính 1 `--workspace-root` đã pair, hoặc thư mục con
  **trực tiếp** (1 cấp) của 1 root đó — không quét sâu hơn.
- `commands.test`: lệnh duy nhất `test_run` được phép chạy trong workspace
  này — không nhận lệnh tùy ý từ ChatGPT.
- `allowedPaths`/`blockedPaths` chỉ áp dụng cho tool file (`file_read`,
  `file_create`,...) — **không** áp dụng cho `terminal_exec` (mục 6).
- Sau khi thêm/sửa, restart agent (mục 2) để nạp lại.

## 5. Danh sách tool đầy đủ

Tất cả tool nhận `machineId` + `workspace` (trừ `machines_list`). Gọi qua
ChatGPT bằng cách gõ `@chatgpt-code-mcp` trong chat rồi mô tả yêu cầu — mô
hình tự chọn tool và tham số.

| Tool | Tham số chính | Mô tả |
|---|---|---|
| `machines_list` | *(không)* | Liệt kê máy đã pair + trạng thái online |
| `workspaces_list` | `machineId` | Liệt kê workspace của 1 máy |
| `directory_list` | `path` (mặc định `.`) | Liệt kê file/thư mục |
| `file_read` | `path` | Đọc file — trả `content`, `sha256`; nếu file binary (`.docx`, `.xlsx`,...) trả `isBinary:true`, `content` rỗng |
| `code_search` | `query`, `globs?` | Tìm code bằng ripgrep |
| `file_apply_patch` | `path`, `expectedSha256`, `newContent` | Ghi đè file đã tồn tại — bắt buộc đúng SHA-256 hiện tại (chống ghi đè nhầm) |
| `file_create` | `path`, `content` | Tạo file text mới (lỗi nếu đã tồn tại) |
| `file_delete` | `path` | Xóa file |
| `file_move` | `fromPath`, `toPath` | Đổi tên/di chuyển file |
| `git_status` | *(không)* | `git status --porcelain -b` |
| `git_diff` | `path?` | `git diff`, có thể giới hạn 1 file |
| `test_run` | *(không)* | Chạy `commands.test` trong `.code-agent.json` |
| `file_create_docx` | `path`, `title?`, `blocks[]` | Tạo file `.docx` **thật** (dùng thư viện `docx`) — `blocks` là mảng đoạn văn/heading/bảng |
| `file_create_xlsx` | `path`, `sheets[]` | Tạo file `.xlsx` **thật** (dùng thư viện `exceljs`) — `sheets` là mảng `{name, rows}` |
| `terminal_exec` | `command`, `cwd?`, `timeoutMs?` | **Chạy lệnh shell bất kỳ trên máy thật** — xem cảnh báo mục 6 |

### Ví dụ `file_create_docx` (workspace `computer` → path tuyệt đối)

```json
{
  "machineId": "my-pc-prod",
  "workspace": "computer",
  "path": "C:\\Users\\Admin\\Desktop\\bao-cao.docx",
  "title": "Báo cáo demo",
  "blocks": [
    { "type": "paragraph", "text": "Giới thiệu", "heading": "h1" },
    { "type": "paragraph", "text": "Nội dung đoạn văn." },
    { "type": "table", "rows": [["Cột 1", "Cột 2"], ["A", "B"]] }
  ]
}
```

### Ví dụ `file_create_xlsx`

```json
{
  "machineId": "my-pc-prod",
  "workspace": "computer",
  "path": "D:\\LearningPesonal\\du-lieu.xlsx",
  "sheets": [{ "name": "Sheet1", "rows": [["Tên", "Điểm"], ["A", 9]] }]
}
```

### Ví dụ `file_move` giữa 2 workspace (không cần `terminal_exec`)

```json
{
  "machineId": "my-pc-prod",
  "fromWorkspace": "computer",
  "fromPath": "C:\\Users\\Admin\\Desktop\\x.docx",
  "toWorkspace": "computer",
  "toPath": "D:\\LearningPesonal\\docs\\x.docx"
}
```

## 6. `terminal_exec` — đọc kỹ trước khi dùng

`terminal_exec` chạy lệnh shell **thật** trên máy bạn, dưới quyền user
Windows hiện tại (`admin-pc\admin`). Đã verify thật: có thể đọc/liệt kê
**bất kỳ ổ đĩa nào** (kể cả `C:\`), không bị giới hạn bởi
`allowedPaths`/`blockedPaths` hay workspace nào — tham số `cwd` chỉ quyết
định thư mục bắt đầu, không phải ranh giới bảo mật.

Chỉ tồn tại vì bạn đã xác nhận rõ ràng chấp nhận rủi ro này. Muốn thu hồi:
xóa entry `terminal_exec` khỏi `apps/gateway/src/mcp/tool-registry.ts` +
`apps/agent/src/tools/index.ts`, deploy lại (CD tự chạy khi push).

## 7. Từ điển thuật ngữ

| Thuật ngữ | Nghĩa |
|---|---|
| **Gateway** | Cloudflare Worker — nơi ChatGPT kết nối tới (`/mcp`), xử lý OAuth, relay lệnh tới agent |
| **code-agent** | Process Node.js chạy trên máy bạn, giữ kết nối WebSocket, thực thi tool thật |
| **Workspace** | Một thư mục có `.code-agent.json` — đơn vị sandbox nhỏ nhất cho các tool file |
| **Workspace root** | Thư mục gốc agent quét để tìm workspace (vd. `D:\`, `C:\Users\Admin`) — pair bằng `--workspace-root`, có thể nhiều root |
| **Machine ID** | Tên định danh máy khi pair (vd. `my-pc-prod`) — dùng trong mọi tool call |
| **OWNER_SECRET** | Mật khẩu duy nhất kiểm soát ai được approve OAuth/pairing — chỉ bạn biết, không commit vào Git |
| **Pairing** | Quy trình `code-agent pair` → mở URL approve → nhập OWNER_SECRET → agent nhận token hoạt động |
| **DCR** | Dynamic Client Registration — ChatGPT tự đăng ký client OAuth với Gateway (không cần bạn tạo thủ công) |
| **PKCE** | Cơ chế OAuth chống đánh cắp authorization code, chuẩn bắt buộc cho public client như ChatGPT |
| **allowedPaths / blockedPaths** | Glob pattern trong `.code-agent.json` kiểm soát tool file được đụng path nào — **không áp dụng cho `terminal_exec`** |
| **computer** | Workspace tổng hợp, không neo thư mục — nhận đường dẫn tuyệt đối trên mọi ổ đĩa. Không hỗ trợ git/test_run. Định nghĩa trong code (`workspaces.ts`), không phải file JSON |
| **Developer mode** | Chế độ trong ChatGPT Settings cho phép thêm MCP connector tự host/chưa xác minh |
| **workers.dev** | Subdomain miễn phí Cloudflare cấp cho Worker — URL Gateway hiện dùng dạng này |

## 8. Xử lý sự cố thường gặp

| Triệu chứng | Nguyên nhân | Cách xử lý |
|---|---|---|
| ChatGPT báo `AGENT_OFFLINE` | Agent không chạy | Chạy lại `start-agent.ps1` (mục 2) |
| ChatGPT nói "chưa có tool này / chỉ có thao tác cơ bản" dù bạn biết đã thêm | Thread chat đang cache `tools/list` cũ | Mở **đoạn chat mới**, hoặc bấm "Làm mới" trong Settings → Plugin → chatgpt-code-mcp |
| File `.docx`/`.xlsx` "trông như hỏng" khi ChatGPT tự đọc lại | `file_read` trả `isBinary:true` đúng thiết kế — không phải lỗi. Nếu ChatGPT tạo ra file vài byte rác, nó đã dùng nhầm `file_create` thay vì `file_create_docx`/`file_create_xlsx` (dấu hiệu của cache tool cũ ở trên) | Xác nhận bằng `file <path>` + `unzip -t <path>` ngoài MCP; nếu thật sự hỏng, mở chat mới rồi yêu cầu lại đúng tool |
| Tạo file "trên Desktop" nhưng dùng workspace `computer` mà quên ghi path tuyệt đối | `computer` không có thư mục mặc định | Luôn ghi đủ `C:\Users\Admin\Desktop\...` khi dùng workspace `computer` |
| `git_status`/`git_diff`/`test_run` báo lỗi "computer has no single directory" | Đúng thiết kế — các tool này cần 1 workspace neo vào thư mục cụ thể | Tạo workspace riêng cho repo đó (mục 4), không dùng `computer` |
| Deploy CI/CD fail với lỗi Cloudflare Authentication | `CLOUDFLARE_API_TOKEN` (GitHub Secret) thiếu quyền | Sửa token trên dash.cloudflare.com, thêm quyền Account → Workers Scripts → Edit + D1 → Edit |
| Agent crash ngay khi start, lỗi `Unexpected token 'ï»¿'` | File `.code-agent.json` bị lưu kèm UTF-8 BOM (thường do PowerShell `Set-Content -Encoding utf8` hoặc Notepad) | Đã vá tự động strip BOM khi đọc (từ commit `2ebfa4c`) — chỉ cần đảm bảo agent đang chạy bản mới nhất |
| Không tạo/sửa được `.code-agent.json` ngay tại `C:\` hoặc `C:\Users` | Windows khóa ghi ở gốc ổ hệ thống và thư mục `C:\Users` cho mọi tài khoản, kể cả admin — không phải giới hạn từ MCP | Dùng thư mục con ghi được, vd. `C:\Users\<tên bạn>`, làm workspace root |

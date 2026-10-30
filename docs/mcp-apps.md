# MCP Apps 接入状态

更新：2026-10-23。当前为协议适配与基础宿主实现，完整升级尚未验收完成。

## 版本与实现

- 核心协议请求路径：`2026-07-28`，以 `server/discover` 探测；旧服务器走 MCP Python SDK 的初始化流程，保留 AgentScope 的 MCP 1.x 依赖约束。
- Apps 稳定协议：`2026-01-26`。
- 官方 Apps SDK 最新稳定版核查为 `2.0.3`。由于当前环境无法解析 npm 官方域名，**尚未安装该 SDK**，package.json 与锁文件没有加入未安装的依赖。当前前端为自主实现的有限宿主，尚未替换为官方 AppBridge。

后端在 `service/mcp_protocol.py` 实现新旧协议请求，在 `service/mcp_apps.py` 将工具注册进既有 AgentScope 工具权限流程。结构化结果和 UI 专用 `_meta` 保存在 metadata，模型只接收公开内容。App 专用工具不会注册给模型。

会话工具结果关联 App ID，宿主按 ID 请求后端读取同一连接器的 `ui://` HTML 资源。服务端检查用户、原始会话、连接器启用状态与当前资源范围。HTML 使用不含 `allow-same-origin` 的 iframe 和资源声明派生的 CSP；不向 iframe 传递用户凭证。App 工具调用在宿主显示参数，用户确认后调用同一服务器上允许 App 访问的工具，执行前持久化审计记录，连接失败不自动重试。

## 已支持的基础路径

- 新协议 JSON 与请求级 SSE 响应；协议版本、方法、名称和工具参数 HTTP 头。
- 旧 Streamable HTTP 初始化及显式 `sse` 或 `/sse` 地址兼容模式。
- 工具列表分页、工具 UI 元数据、旧扁平 resourceUri 归一化、model/app 可见性分离。
- HTML 文本和 base64 资源；`text/html;profile=mcp-app` 类型校验。
- Apps 初始化、完整输入/结果通知、尺寸调整、关闭和重新加载、文本结果回退。
- 只声明当前支持的 Host 能力 `serverTools`。不支持的方法返回 JSON-RPC 错误。

## 验证

```sh
DATABASE_URL='' .venv/bin/python -m unittest tests.test_console tests.test_mcp_apps -q
npm run typecheck
npx eslint app/McpApp.tsx app/AssistantConversation.tsx --quiet
npm run build
```

测试使用临时 SQLite；真实旧协议握手测试需要允许本地回环监听。当前 43 个测试通过，含新增 10 个协议与权限测试。前端类型检查、相关文件 ESLint、生产构建通过。

## 部署和剩余验收

PostgreSQL 部署需先运行 `supabase/migrations/202610230001_mcp_app_results.sql`。本次未修改线上数据库。

恢复 npm 网络访问后安装并锁定官方 SDK 及 peer 依赖，将基础宿主替换为官方 AppBridge，完成官方 1.x/2.x View 的浏览器互通和 CSP 验证后再将此升级标记为完成。安装目标：

```sh
npm install @modelcontextprotocol/ext-apps@2.0.3 @modelcontextprotocol/client@^2.0.0 zod@^4.2.0
```

以下能力尚未实现或验收：OAuth/API Key 配置、App 资源读取代理与消息/模型上下文更新、MRTR 补充输入交互、Tasks 扩展、订阅及通用旧 HTTP+SSE 自动端点发现。当前不声明这些可选能力；收到 `input_required` 会保留原始结果并提示操作未完成。第三方插件未做真实联调，当前宿主不可视为任意 MCP App 的完整兼容保证。

官方依据：[MCP 核心规范](https://modelcontextprotocol.io/specification/2026-07-28)、[Apps 稳定规范](https://github.com/modelcontextprotocol/ext-apps/blob/v2.0.3/specification/2026-01-26/apps.mdx)、[SDK 发布记录](https://github.com/modelcontextprotocol/ext-apps/releases/tag/v2.0.3)。

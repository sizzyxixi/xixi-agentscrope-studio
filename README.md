# AgentScope Studio

一个面向 AgentScope 的执行控制台，采用 QwenPaw 风格界面，保留 XIXI 品牌与真实 AgentScope 服务。

- New task：创建新会话，与主 Agent 对话。
- Session list：左侧展示并切换历史会话。
- 能力市场：技能、工作流与连接器统一入口，支持 Skills 编辑与启停、真实 Streamable HTTP MCP 连接测试与 Toolkit 挂载。
- 知识与记忆：个人资料导入、编辑、检索，长期偏好持久化与对话上下文注入。
- 工作流：多步骤顺序执行，确认后继续、后台运行记录与停止。
- 定时任务：任务列表/运行记录双 Tab、六个电商模板、智能体与真实模型选择、间隔/单次/每天/每周/每双周/每月/每年和截止日期；需要 Python 服务在线。
- 个人中心：用户名/密码登录注册、模型接入设置和消息渠道；钉钉 Stream、飞书 WebSocket 文本对话及授权控制。
- 主 Agent Loop：验证多会话、流式事件、人类确认、工具调用、State 回写。

当前 Web UI 使用 `/api/agent/stream` 代理到 `service/` 下的真实 Python AgentScope runtime。
如果没有配置模型密钥，界面会显示“AgentScope 服务已接入但模型未配置”，不会再伪造回答。
后端会使用本地 SQLite 保存真实会话状态、消息、工具写入计划和运行事件；轻量 RAG 只检索项目中真实存在的 Markdown 文档。Web UI 启动时会优先读取后端真实 sessions，服务离线时才退回设备本地缓存。

账号系统为本地用户名/密码：用户名至少 4 位英文/数字且唯一，密码至少 6 位。模型设置支持多条配置、连通性测试、编辑、删除和默认模型切换。当前支持 Kimi、DeepSeek、豆包/火山方舟、OpenAI、Anthropic、Qwen/DashScope、Gemini、Ollama 与通用 OpenAI-compatible 接口。

主 Agent 会把用户和助手消息真实写入 SQLite。当后端重启、切换模型或重新打开历史会话时，AgentScope `AgentState` 会从这些消息恢复对话上下文。

## 本地运行

```bash
npm install
npm run dev
```

另开一个终端启动 AgentScope 服务：

```bash
.venv/bin/pip install -r service/requirements.txt
npm run agent:dev
```

打开：

```text
http://localhost:3000/
```

AgentScope service 默认监听 `http://127.0.0.1:8790`。模型 API Key 可直接在 Web UI 的「个人中心 → 模型设置」中保存。

验证：

```bash
npm test
npm run typecheck
npm run lint
npm run test:service
```

## 当前项目结构

```text
app/
  AgentWorkbench.tsx          # Web UI 主控制台
  api/agent/stream/route.ts   # Web UI 到 AgentScope service 的流式代理
  page.tsx
  layout.tsx
  globals.css

service/
  main.py                     # FastAPI AgentScope 服务
  runtime.py                  # 真实 AgentScope Agent / Toolkit / 权限确认适配
  store.py                    # SQLite StateStore + 本地 Markdown 检索
  requirements.txt

docs/
  ARCHITECTURE.md             # 架构与下一步
```

## QwenPaw 风格改造

完整能力说明、参考源码与许可、运行限制及验证记录见 [QWENPAW_ADAPTATION.md](docs/QWENPAW_ADAPTATION.md)。

当前已补齐原有的插件、工作流、知识库、记忆和定时任务占位入口；支持账号隔离、资源导入导出、浅色/深色主题和移动端布局。

## 后续扩展

1. 多 Agent Team / Worker 编排。
2. 向量检索、摘要记忆和 PDF / Office 解析。
3. MCP 认证、市场安装与渠道集成。
4. 分布式调度、密钥管理与沙箱。

## 消息渠道

在个人中心的「远程助理」中配置钉钉或飞书机器人。支持智能体与模型绑定、MCP 选择、凭证加密、访问授权、连接诊断与网页工具确认后的回传。配置采用居中弹窗，高级选项默认收起；卡片和弹窗提供平台官方教程。接入步骤和验证范围见 [远程助理接入说明](docs/消息渠道接入说明.md)。

## 技能市场

内置 Anthropic 的 pdf、docx、xlsx、pptx、frontend-design、mcp-builder 六个完整技能包，支持市场查看、账号启停与会话按需读取主指令及引用文件。详见 [技能市场与会话调用](docs/技能市场与会话调用.md)。

## 每轮 Token 用量

AI 回复底部展示 `Token 消耗：12,480`，悬停查看输入／输出数量。按一次用户提交汇总本轮全部模型调用和上下文压缩，同轮工具审批恢复继续累加，不按流式片段重复计数。服务端保存实际模型 usage 与消息关联，刷新后可恢复；旧消息不补估算，供应商未返回用量或运行中断时标记未返回／统计不完整。搜索等按次计费的工具不混入 Token 数量。

## 智能体

能力市场首位「智能体」支持创建、编辑、启停和卡片发起对话。创建弹窗可配置头像、简介、角色指令，以及执行轮次和上下文压缩阈值。聊天框上方可搜索并切换智能体；已有消息时切换会开启新会话，原会话保留。智能体绑定和创建时的配置快照按账号持久化，停用或删除不会删除历史消息。

创建和编辑智能体时可多选内置工具、MCP 连接器和已安装技能，配置数量不限。每轮对话最多显式指定 3 个技能和 3 个 MCP，且只能从智能体配置范围内选择；内置工具按勾选结果注册，技能读取工具自动保留。自建智能体缺少绑定字段时按空范围处理；已有会话保留原配置快照，新建会话使用最新配置。

## 网页搜索

内置 `web_search` 使用 [DeepSeek 官方 Search API](https://api-docs.deepseek.com/zh-cn/api/search/)，支持站点、语言和日期搜索语法，返回标题、链接、摘要及可选正文。默认返回 5 条，支持 1～50 条；查询词最多 128 个字符。搜索与对话模型独立，默认助手可调用，自建智能体需勾选“网页搜索”后新建会话。

在当前账号的“个人中心 → 模型设置”添加 DeepSeek 官方配置即可提供搜索凭据。优先使用当前会话选中的 DeepSeek 官方配置，其次使用默认 DeepSeek 官方配置；当前使用其他模型时，若本账号仅有一份官方 DeepSeek 配置，也可使用。多份配置且没有明确选择时提示设为默认或在会话选择，不自行决定计费账号。每次调用重新校验配置归属和凭据，不使用其他用户或服务端环境中的共享 Key，不将代理接口的凭据发往官方搜索端点。

搜索固定请求 `https://api.deepseek.com/v1/tools/search`，不接受模型传入的 API Key 或服务地址，不自动重试计费请求。搜索结果按不可信资料处理，来源使用真实返回链接；错误、余额不足和限流如实反馈。响应最多 2 MB，返回文本总量受限，截断会明确标记。搜索按 DeepSeek 官方接口计费，详见 [官方指南](https://api-docs.deepseek.com/zh-cn/guides/search/)。

## 网页读取

内置 `web_fetch` 可读取给定公开 HTTP/HTTPS 网页的标题与正文，并返回最终来源链接；长文本支持分页。默认助手可直接使用，自建智能体需勾选“读取网页”，配置修改后在新会话生效。仅允许标准端口，校验 DNS 与每次重定向并连接已校验 IP，禁止本机、内网及保留地址；不携带账号凭据或 Cookie，不执行 JavaScript。单次响应上限 2 MB，总超时 25 秒；不提供搜索、登录页面访问或二进制下载。

## 知识库

知识库页面分为「我的知识库」「官方知识库」。个人库支持多库管理、启停、上传或编辑资料、索引状态与重试、检索测试及独立 Embedding 配置；官方库只展示中英文名称和用途，面向所有登录用户的会话提供检索，不提供用户侧原文接口。内置「商品内容规范」中英文资料；原有个人资料迁入个人库。

底层使用 AgentScope 原生解析器、ApproxTokenChunker、Embedding、KnowledgeBase 和 QdrantStore，会话自动检索和 search_documents 统一走向量检索。默认本地持久化，无需 Docker；可通过环境变量切换 Qdrant Cloud。平台 Embedding 需配置后才能真正建立和查询索引；未配置会显示待配置，不用关键词结果替代。配置示例、权限边界及免费云端组合见 [知识库接入方案](docs/知识库接入方案.md)。

## 部署检查与数据库状态

- 使用 `npm ci` 安装前端依赖，运行 `npm run build`、`npm run typecheck`、`npm run lint`，以及 `node --test tests/*.test.mjs` 检查生产构建和界面逻辑。
- Python 服务使用 `service/requirements.txt` 安装依赖，运行 `npm run test:service`。生产启动应使用 `python -m uvicorn service.main:app --host 0.0.0.0 --port 8790`，不要开启 `--reload`。
- 前端 API 代理通过 `AGENTSCOPE_SERVICE_URL` 访问 Python 服务；前后端分开部署时不能保留指向另一台机器的 localhost 地址。
- 当前运行数据库仍是 SQLite；为 `AGENTSCOPE_STATE_DB` 指向的目录配置持久化盘并备份。文件加密密钥、渠道加密密钥和知识库向量目录也需要持久保存或配置稳定的服务端环境变量。
- Supabase `agentscope` schema 已按当前功能补齐为 30 张表、196 个字段；迁移文件和连接状态见 [supabase/README.md](supabase/README.md)。云端建表不代表应用已经切换到 PostgreSQL。
- PostgreSQL 数据访问层、连接池及受限服务账号尚未接入；不要仅设置 `DATABASE_URL` 就认为迁移完成。本地用户、聊天记录、token、模型密钥和知识库资料没有自动上传。
- 服务端密钥只放在忽略的 `.env` 或部署平台的 Secret 管理中。不要上传本地运行状态、数据库、虚拟环境或本机 `.codex/config.toml`。
- PDF.js 静态资源在 `predev` / `prebuild` 时从锁定依赖复制生成，无需提交生成文件。
- 定时任务和渠道连接目前随 Python 进程启动，部署阶段先使用单个服务进程；横向扩容前需要解决重复调度与渠道连接协调。

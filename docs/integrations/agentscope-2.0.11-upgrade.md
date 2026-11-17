# AgentScope 2.0.11 升级与平台智能体配置

日期：2026-11-12。

## 版本与来源

AgentScope 从 `2.0.4.post1` 升级到正式版 `2.0.11`，MCP Python SDK 从 `1.28.1` 升级到 `2.3.0`。官方 [v2.0.11 发布记录](https://github.com/agentscope-ai/agentscope/releases/tag/v2.0.11) 包含 MCP 2.x 支持。没有采用文档站当前跳转的开发版。

官方 Web UI 来自同一发布标签下的 `examples/web_ui/frontend`，代码保存在 `vendor/agentscope-web-ui`，上游提交与接入修改记录见 `UPSTREAM.json`。页面、智能体编辑表单、字段 schema 均使用官方实现；宿主只接入登录、同源代理和路径前缀。

`service/requirements.lock` 锁定本次验证的全部 Python 依赖。Railway 后端按此文件安装，Docker 构建和本地升级使用同一组合。Gemini、Ollama 在新版本中是可选模型依赖，已显式保留 `model-gemini`、`model-ollama` extras，另安装官方 Service 和 SQL storage extras。

## 管理入口与权限

入口为 `/agentscope-admin/chat`。管理员在官方界面的智能体选择器中新增、编辑智能体。已有用户端「智能体」页面只对管理员显示「服务管理」入口。

管理员登录名禁止普通用户自行注册或通过修改个人资料占用；管理员登录名也不能通过个人资料改名。管理员仍使用现有账号系统；允许管理的登录名由 `AGENTSCOPE_PLATFORM_ADMIN_USERS` 指定，多个名字以逗号分隔。初始化命令：

```bash
.venv/bin/python scripts/setup-platform-admin.py
```

命令通过隐藏输入读取密码，不把密码写入源码、命令参数或配置文件。账号已存在时只验证密码，不重置已有账号。后台使用独立登录会话；所有官方 API（包括文档和 schema）均需有效管理员 Bearer token。上游示例中的 `X-User-ID` 不能用来冒充平台配置所有者。

## 数据与即时生效规则

官方 `create_app` 与 `AsyncSQLAlchemyStorage` 挂载在现有 Python 服务的 `/agentscope-service`。显式接入子应用 lifespan，确保表结构和迁移完成后才接受请求。

- PostgreSQL：复用现有 `DATABASE_URL`，官方表放在独立的 `agentscope_config` schema；原 `agentscope` 业务表和用户账号保持原存储方式。
- SQLite：在原状态数据库同目录创建 `agentscope-service.sqlite3`。
- 首次启动导入主助手与 9 个既有平台智能体，保留 ID、提示词、封面、头像、双语信息及工具配置。平台配置的固定所有者为 `xixi-platform`。
- `platform-catalog-v1` 标记完成后不重复播种。重启不覆盖后台编辑，不复活后台已删除的智能体；主助手允许编辑，禁止删除。
- 市场直接读取官方存储中已提交的定义，没有发布副本，没有发布、上架或下架步骤。后台新建立即成为用户可选的公共智能体。
- 市场通过同源事件、页面聚焦和可见页面每 15 秒刷新；普通用户无法写公共配置。
- 新会话使用最新配置；已有对话在下一次正常执行前刷新平台名称、提示词及完整 context/ReAct 配置，保留对话历史和用户选择的资源。正在执行的请求以及待确认操作继续使用原配置，下一轮再更新。
- 个人创建的智能体仍归个人所有，保持原快照规则。用户的个人模型密钥、MCP 凭据与技能不导入公共空间，也不因迁移暴露给其他账号。

后台简介取官方 `Chat Config → Invite Config → Invite Description` 字段。旧版封面和双语元数据保留在迁移元数据表；官方原生表单没有新增自定义封面编辑器。后台更名或改简介后，不再以旧英文名称/简介覆盖新内容。

## 兼容性影响与边界

| 范围 | 影响与处理 |
| --- | --- |
| MCP 2.x 请求 | 新 SDK 的 ClientRequest 是联合类型，初始化请求也不再保证有 `.root`；适配层同时接受两种请求形态，通过 TypeAdapter 校验。 |
| MCP 工具结果 | 通用 Result 默认可能丢弃未知字段。WireResult 显式保留 content、structuredContent（含 null/标量）和 `_meta`，避免 Apps UI 数据丢失。 |
| 已有 MCP Apps / 飞书 | 保留协议协商、Apps capability 注入、脱敏、重连及禁止自动重放有副作用调用；真实 HTTP wire 回归通过。 |
| DeepSeek / OpenAI 模型测试 | 新 SDK 已在构造阶段创建 HTTP 客户端。测试改为通过 `client.with_options(http_client=...)` 注入模拟传输，生产模型配置逻辑不需要因此修改。 |
| Agent 配置 | 使用官方嵌套 `chat_config`，完整应用 context/ReAct 参数。保留现有 SSE 中断语义。 |
| 存储与连接 | PostgreSQL 使用小连接池、预检查、连接回收、语句及空闲事务超时；首次导入可在部分完成后继续。初始化只写新 schema 和所请求的新管理员账号。 |
| 定时任务与渠道 | 客户端既有 runtime 继续负责；嵌入的官方服务关闭 scheduler/channel worker，防止同一实例重复执行。官方知识库使用独立索引 worker，仅处理官方 SQL 存储内的文档。 |
| 官方界面的其他模块 | 凭据、MCP Hub、Skill Hub、工作区、官方聊天/团队属于官方服务空间；本次公共市场同步范围是智能体定义及 context/ReAct 设置。它们不会自动替换用户端原有个人资源系统，Invite/团队开关也不把既有用户聊天改造成官方团队会话。 |
| 管理页部署 | 构建时打包官方静态资源，同时内嵌 HTML shell，兼容本地 Workers 预览和 Next.js 部署；同源代理保留流式响应、上传 body 和官方 collection route 斜杠。 |

官方管理服务的消息总线为进程内实现，配置定义持久化在 SQL。当前部署仍为单 worker；如增加多副本，需要另行配置分布式消息总线并确定唯一调度节点。

## 验证与回滚

已执行 Python 全量回归：333 项通过，覆盖原有模型、MCP Apps、飞书、流式事件、会话、文件、定时任务与权限。新增 9 项官方服务集成测试使用真实 SQLite 和官方 ASGI API，验证 10 个智能体迁移、直接新增/修改、跨账号隔离、伪造身份拒绝、删除不复活、下一轮真实 SDK 缓存刷新、待确认操作保持原配置、空提示词同步及管理员登录名保留。前端类型检查、变更文件 ESLint、官方 UI 构建、Vinext 项目构建和 Railway 使用的 Next.js standalone 生产构建通过。

本地升级前的依赖快照保存在忽略目录 `.local-tools/agentscope-before-upgrade.freeze`。回滚应同时恢复本次 Python 代码和依赖，不能仅降级 MCP。旧业务表未被重写，回退旧代码会重新使用旧静态市场；新 schema 可保留以便再次升级，勿删除其中的后台编辑。

本次已在当前实际 PostgreSQL 中确认管理员账号存在、平台智能体为 10 个、一次性迁移标记完成；浏览器已用所请求的管理员账号登录官方界面，并验证原始配置读取与保存。

线上生效需部署新前后端并配置 `AGENTSCOPE_PLATFORM_ADMIN_USERS=admin`。前端构建会自动打包官方 UI；首次本地 `npm run dev` 也会先构建该界面。新版本首次启动需要数据库账号具有创建 `agentscope_config` schema 和表的权限，之后按已创建表运行。


## 2026-11-12：官方知识库接入修复

官方聊天页初始化会请求知识库列表；仅挂载 create_app 而不传 knowledge_base_manager 会返回 503，并弹出 Knowledge base feature is disabled。这是实际缺失的服务配置，不能靠隐藏通知解决。

已按同版本官方 agent_service 示例接入 CollectionPerKbManager，元数据使用现有官方 SQL 存储；向量和原文件分别持久化于状态数据库目录下的 official-knowledge/vectors 和 official-knowledge/blobs。启用官方文档索引 worker，支持 TXT/Markdown、PDF、Word、Excel、PowerPoint 解析。它与原有个人知识库使用不同目录和记录，不迁移或混用个人文档、密钥及索引。创建和检索知识库仍需管理员在官方后台配置真实的 Embedding 模型凭据。

文件预览接口兼容现有 Bearer 管理员认证；浏览器原生预览仅接受官方签名校验通过、未过期、绑定当前文件和平台所有者的临时令牌。客户端传入 X-User-ID 不会改变身份，预览令牌不能用于读智能体配置、修改数据或访问其他文件。

新增集成回归验证知识库发现接口、创建、重启后保留集合与元数据、删除、普通用户拒绝，以及真实文档上传/读取与挂载路径下的签名预览。测试使用独立临时数据库与本地向量目录，不调用真实 Embedding 服务。

本次修复验收：333 项后端测试全部通过；实际 PostgreSQL 环境下知识库列表、Embedding 模型列表、分块器 schema 接口均返回 200。浏览器已刷新并验证官方聊天页及知识库页不再出现未启用通知。前端 3000 与后端 8790 保持在线，8000 服务未操作。

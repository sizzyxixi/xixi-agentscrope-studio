# Railway 部署

目标项目：<https://railway.com/project/e70c78c2-26b8-4607-8a38-57f7bef1db79>。
使用现有 Supabase PostgreSQL 与 Storage，保留数据库、文件及加密密钥。

## 服务布局

同一 Railway 项目、同一环境中部署两个服务，源码根目录均为代码仓库根目录。

| 服务 | Dockerfile | 端口 | 健康检查 | 网络 |
| --- | --- | --- | --- | --- |
| 现有 `xixi-agentscrope-studio`（Web） | `deploy/railway/Dockerfile.web` | 8080 | `/api/console/health` | 生成 Railway 公网域名 |
| 新建 `backend`（Python） | `deploy/railway/Dockerfile.backend` | 8790 | `/health` | 使用私网域名 |

Railway 当前 API 已拒绝设置旧 `railway.json` / `railway.toml` 配置路径；本项目直接在
服务设置中配置 `dockerfilePath`、健康检查和 300 秒启动超时。API 的构建器枚举为
`RAILPACK`，存在指定 Dockerfile 时使用 Docker 构建。不要将配置文件中曾支持的
`DOCKERFILE` 枚举直接传给 GraphQL API。后续需要声明式管理时使用新 IaC。

Web 的 `AGENTSCOPE_SERVICE_URL=http://backend.railway.internal:8790`。
所有浏览器请求经 Web 的同源 API 代理，流式响应沿用现有 SSE 实现。
不要使用当前本机开发命令部署：Web 使用 Next.js standalone，Python 使用单个
Uvicorn worker，无 reload。AgentScope 固定为已通过回归验证的 `2.0.11`，MCP SDK 为 `2.3.0`，完整依赖使用 `service/requirements.lock`。平台管理接入说明见 [升级评估](integrations/agentscope-2.0.11-upgrade.md)。

## 数据、密钥与持久化

后端环境变量参考 `deploy/railway/backend.env.example`，Web 参考 `web.env.example`。
将本地 `.env` 中的以下**原值**设置为 Railway 后端变量：

- `DATABASE_URL`：现有 Supabase 连接，保留 TLS 配置。
- `SUPABASE_URL`、`SUPABASE_STORAGE_BUCKET`、`SUPABASE_SECRET_KEY`
  （或已有的 `SUPABASE_SERVICE_ROLE_KEY`）。
- `AGENTSCOPE_FILE_KEY`、`AGENTSCOPE_KNOWLEDGE_KEY`、`AGENTSCOPE_CHANNEL_KEY`。
- 如已使用个人 MCP 加密凭据，再复用 `AGENTSCOPE_MCP_KEY`。
- 账号模型通过 `@environment` 引用密钥时，再复制其对应的
  `AGENTSCOPE_MODEL_API_KEY_<模型ID大写>`，以及确实使用的 Embedding、Qdrant 配置。

不要重新生成已有加密密钥，否则现有加密内容无法读取。不要将服务端变量放进 Web
的 `NEXT_PUBLIC_*` 变量或镜像。`.dockerignore` 与 `.railwayignore` 排除了本地
密钥、运行数据、依赖、Git 元数据以及约 4.8 GB 的 `.local-tools` 缓存。

为 backend 挂载 `/data` Volume。`AGENTSCOPE_STATE_DB=/data/state.sqlite3` 只提供本地
工作目录，业务数据仍由 `DATABASE_URL` 指向的 PostgreSQL 保存。Volume 保存本地
Qdrant 向量索引及模型缓存；使用已有云端 Qdrant 时应同步相同连接配置。
已有知识库若使用本地向量索引，首次启用云端索引前还需要迁移索引或重建；仅复用
PostgreSQL 不会自动复制本地向量文件。

## 上线顺序与后台任务

首次验收设置 `AGENTSCOPE_SERVERLESS=1`，保持此前 Vercel 演示模式：
对话、登录及文件读写可用，自动定时任务、消息渠道长连接及知识库后台索引保持关闭。
本地后端目前也连接现有 Supabase；不能同时开启两套调度器。

确认后台任务由 Railway 接管后，先协调停止本地及其他环境的调度实例，再将云端
`AGENTSCOPE_SERVERLESS=0`。只运行一个 backend 副本、一个 worker；现有审批及运行状态
部分保存在进程内，不能直接通过多副本扩容。

先部署 backend 并通过 `/health`，再部署 Web。先用 Railway 自动域名验收登录、
历史会话、现有文件下载和一次真实流式对话，再考虑绑定自定义域名。
本次不需要自动重跑数据库迁移、搬运本地 SQLite 或改变现有 Supabase 数据。

## 验证

```sh
.venv/bin/python scripts/railway-preflight.py --check-cloud
npm run build:railway
npm run typecheck
```

有 Docker 环境时，再执行：

```sh
docker build -f deploy/railway/Dockerfile.web -t agentscope-web .
docker build -f deploy/railway/Dockerfile.backend -t agentscope-backend .
```

后端镜像包含 OCR、音视频依赖、FFmpeg 和中文字体，首次构建较大。
Whisper 模型仍在首次使用时下载。Office 到 PDF 等转换另需 LibreOffice，当前镜像
未安装该可选引擎，相关操作会按现有逻辑明确提示不可用。

## 官方依据

- [Railway Dockerfiles](https://docs.railway.com/builds/dockerfiles)
- [Railway Infrastructure as Code](https://docs.railway.com/infrastructure-as-code)
- [Railway Private Networking](https://docs.railway.com/networking/private-networking)
- [Railway Volumes](https://docs.railway.com/volumes)

2026-11-10 本地验证结果：

- `npm run build:railway` 成功，生成 standalone 生产包。
- standalone 临时服务首页、`/api/console/health`、PDF.js worker 均返回 HTTP 200。
- Supabase 只读检查通过：31 张业务表，现有存储桶 HTTP 200，三项原有密钥格式有效。
- Railway Linux 容器构建已验证通过，前后端部署最终均为 `SUCCESS`。
- 当前未配置 `AGENTSCOPE_MCP_KEY`，个人 MCP 凭据功能仍需补齐该配置。

Railway 已完成的准备：CLI 已登录并关联指定 production 环境；复用现有 Web 服务，
已创建 `backend` 服务（`ac7b61d7-b44a-4023-ab2d-bf0e5f616e92`）及其
`/data` 持久化卷。Supabase 配置和三项原加密密钥已在用户明确授权后写入 backend 的服务端变量；
未写入源码、命令行参数或部署日志。
Web 已生成 HTTPS 域名：<https://xixi-agentscrope-studio-production.up.railway.app>。
源码通过 CLI 上传，未推送 GitHub。后端已通过 Railway 健康检查。
云端构建修复包括：Vite 配置允许缺少本地 `.openai/hosting.json`，后端绑定
`0.0.0.0` 以支持当前项目的 IPv4 健康探测和私网连接。
前后端最终均为 `SUCCESS`，公网验收已通过：

- 首页、JS、CSS 和 PDF.js worker：HTTP 200。
- `/api/console/health`：HTTP 200，确认连接现有 PostgreSQL。
- 未登录访问 `/api/auth/me`：HTTP 401，鉴权正常。
- 后端部署：`8f567e68-8700-4ee3-8d36-2d40d1f5ca91`。
- 前端部署：`cb7c6f5b-d919-4d81-a36b-a0e7db246153`。

本次没有新建测试账号或调用付费模型，登录后的完整业务操作尚未逐项验收。
CLI 本次安装在 `/private/tmp/agentscope-railway-bin/railway`；临时目录清理后
可按官方文档重新安装，Railway 登录凭据使用标准配置目录。


## 自定义域名 xixi.rest

2026-11-10 已完成绑定，HTTPS 证书为 VALID；首页、后端健康接口及 PDF.js worker
通过实际 HTTPS 请求验收。生产访问地址为 <https://xixi.rest>，Railway 自动域名仍保留。

Spaceship DNS：

| 类型 | 主机 | 值 | TTL |
| --- | --- | --- | --- |
| CNAME（根域自动 flatten） | @ | 8clko4b3.up.railway.app | 300 秒 |
| TXT | _railway-verify | railway-verify=1810adc1bbb3fc7dfc89322f49aa5b094a329dc7c9870892159cbe23268b142a | 300 秒 |

原根域 A 记录为 `216.198.79.1`，本次只替换这条网站解析并添加 Railway 验证记录；
名称服务器继续使用 Spaceship。自定义域名 ID：`469713c9-7008-4e90-99c3-58fa6b350c68`。

现有 SQL 运维文件中的 `/internal/files/cleanup` 是旧 Vercel 重写入口，当前 Railway
Web 尚未迁移该运维路由和独立清理凭据。本次域名绑定不启用或执行历史文件删除任务。

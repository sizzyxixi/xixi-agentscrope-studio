# 阿里云 ECS 数据库与应用部署

## Web 正式发布（2026-11-17）

当前发布沿用入口 <http://47.86.15.93/>。商品库、草稿箱及素材交互更新只替换 Web 容器；后端、数据库、代理和独立业务应用保持运行。商品导入、认领、预刊登与直接刊登仍按已确认范围提供前端状态交互，未新增真实平台刊登接口。

发布前执行类型检查、lint、前端测试、`npm run test:service` 和 `npm run build:railway`。后端测试通过临时 SQLite 数据库运行，禁止读取开发环境 `.env` 中的数据库与模型凭据。

从待发布 Git 提交创建独立源码目录，使用 `package-source.py` 打包，再上传并解压到 `/opt/moonclaw/releases/<版本>/source`。不要直接打包带有未审阅改动的工作区。服务器执行：

```sh
python3 /opt/moonclaw/releases/<版本>/source/deploy/ecs/release-web.py \
  /opt/moonclaw/releases/<版本>/source --commit <完整Git提交SHA>
```

脚本构建镜像，在临时容器验证首页、商品库、素材库、店铺经营及健康检查，再备份数据库与原 Compose，最后仅更新 Web。切换后的登录、权限隔离和文件上传下载检查失败时自动恢复原 Web 镜像。测试不会调用收费模型，临时账号与文件会清理。

版本目录的 `release.json` 记录 Git 提交和原镜像，`previous-compose.yml` 保存回滚配置；公网 `/release.json` 仅包含版本、提交 SHA 与构建时间。保留旧镜像和备份，不在发布过程中清理持久化数据。

手动回滚时，将对应版本的 `previous-compose.yml` 恢复到 `/opt/moonclaw/app/compose.ecs.yml`，然后在应用目录执行 `docker compose -f compose.ecs.yml up -d --no-deps web`。不要运行初始化脚本或重建数据库。

## 当前应用部署（2026-11-12）

- 验收入口：<http://47.86.15.93/>。按用户要求暂不切换 `xixi.rest`，当前为 HTTP 验收环境。
- 应用目录：`/opt/moonclaw/app`，Compose：`compose.ecs.yml`，项目名 `agentscope-ecs`。
- 前后端镜像版本：`20261112-ecs-01`；Python 依赖锁定 AgentScope 2.0.11。
- Web：Next.js standalone；后端：FastAPI + AgentScope，单副本、单 worker、持久运行模式。
- Caddy 代理发布 HTTP 80。安全组新增仅 TCP 80 公网访问规则，操作已获得用户确认；数据库 5432 不开放公网。
- 数据库保留 `agentscope` 下 33 张业务表，新增 `agentscope_config` 下 14 张官方配置表，共 47 张。
- 新增结构来自 `generated/agentscope-config.sql`，由锁定版本的 SQLAlchemy 模型生成；没有导入旧 Supabase 账号、会话、文件或配置。
- 业务账号仍无数据库 CREATE、建角色和超级用户权限。官方配置 schema 和表由该角色拥有；启动前先检查 schema 是否存在，避免无必要的 CREATE SCHEMA 权限检查。
- 后端环境文件：`/opt/moonclaw/config/backend.env`，0600；DATABASE_URL 使用 Docker 网络名 `postgres`。
- 文件、个人/官方知识库索引、缓存：`/opt/moonclaw/app-data` 持久挂载到后端 `/data`；文件使用本地加密存储。
- 平台管理员 `sizzy` 已按用户明确授权创建。初始凭据位于服务器 `/opt/moonclaw/config/initial-admin.json`，0600；不写入 Git 或聊天。
- 模型、Embedding、MCP 和渠道配置属于新环境的后续配置，本次未迁移旧配置、未调用收费模型。

### 操作命令

服务器终端：

```sh
cd /opt/moonclaw/app
docker compose -f compose.ecs.yml ps
docker compose -f compose.ecs.yml logs --tail 100 backend web proxy
python3 deploy/ecs/smoke-app.py
```

`smoke-app.py --restart` 会重启后端以验证持久化；应在无正在运行的业务任务时执行。脚本使用私有初始管理员凭据，创建并清理一次性普通用户、会话和文件。

本机打包当前代码：

```sh
python3 deploy/ecs/package-source.py /tmp/moonclaw-ecs-app.tar.gz
```

打包包含未提交源码和必需的 `worker-configuration.d.ts`，排除本地凭据、运行数据、依赖缓存及用户文件。容器镜像构建仍使用现有 Railway Dockerfile，ECS Compose 覆盖后端启动命令以支持本地存储。

### 验证记录

- 本地 TypeScript 类型检查通过；平台配置相关 9 项测试通过。
- Linux 前后端生产镜像均构建成功。
- 公网首页及 `/api/console/health` 返回 HTTP 200，后端报告 `postgresql`、`persistent`、`2.0.11`。
- 管理员登录、官方配置 API、普通账号注册和权限隔离通过。
- 会话写入、文件上传/下载、管理员无法读取其他用户私有文件通过。
- 后端实际重启后，原登录令牌和上传文件仍可读取；测试记录已清理。
- 已生成包含两个 schema 的部署后备份：`agentscope-20261112T081505Z.dump`。
- 验收未产生收费模型调用；自动化浏览器对裸 IP 页面返回客户端拦截，页面视觉未通过该浏览器工具验收。

## 初次数据库安装（历史记录，2026-11-12）

- 实例：`i-j6cafjqd3bes5gl45200`，香港 `cn-hongkong`，2 vCPU / 4 GiB。
- 系统：CentOS 7.9；已有 Docker 26.1.4 / Compose 2.27.1。
- PostgreSQL 17.11，容器 `moonclaw-db-postgres-1`，重启策略 `unless-stopped`；Docker 已开机自启。
- 数据库 `agentscope`，业务 schema `agentscope`，六份源码迁移对应的 33 张业务表。
- 应用账号 `agentscope_app`：无超级用户、建库、建角色及 BYPASSRLS 权限。
- 33 张表均启用 RLS；专用 `backend_access` 策略允许后端账号读写，业务租户隔离继续由现有 Python 后端执行。数据库凭据仅供后端使用。
- 仅发布 `127.0.0.1:5432`，当前适用于同机后端连接。

原 Supabase 数据库、文件和本地项目 `.env` 均未改动。新库包含迁移内置模板及新环境初始化记录，不含原线上用户与会话数据。

## 服务器目录

`/opt/moonclaw/database/` 权限 0700，包含：

| 路径 | 用途 |
| --- | --- |
| `compose.yml` | PostgreSQL 容器配置 |
| `pgdata/` | 持久化数据；请勿清空 |
| `database.env` | 管理员初始化配置，0600 |
| `backend-database.env` | 实际后端 DATABASE_URL，0600 |
| `app.pgpass` | 验证用应用账号密码文件，0600 |
| `backup-database.sh` | 手动备份脚本，0700 |
| `backups/` | 自定义格式备份和 SHA-256 校验文件；当前为同机备份 |

密码在服务器生成，未写入仓库或聊天。不要直接打印或分享上述凭据文件。

## 后端接入

将服务器 `backend-database.env` 中的 DATABASE_URL 通过服务端环境配置注入 Python 后端。示意值：

```dotenv
DATABASE_URL=postgresql://agentscope_app:REDACTED@127.0.0.1:5432/agentscope?sslmode=disable
```

这个地址仅用于同机回环连接。跨主机连接需要单独配置私网与 TLS；不要直接把主机改成公网 IP。后端在容器内时应设计专用共享 Docker 网络，使用数据库服务地址，不能直接使用容器自身的 127.0.0.1。

现有 `deploy/railway/start-backend.sh` 仍要求 Supabase Storage 的变量，不能直接作为纯本地存储的启动脚本。当前文件存储支持 Supabase 和本地加密文件；阿里云 OSS 需要新增适配。知识库当前支持 Qdrant 本地持久化，无需额外部署向量数据库；需为向量目录配置持久化和 Embedding。

迁移旧业务时需同步数据、文件及原加密密钥，并验证后再切换连接。当前应用已部署；旧数据按用户要求不迁移。

## 检查与备份

在 ECS 上运行：

```sh
cd /opt/moonclaw/database
docker compose ps
docker compose exec -T postgres pg_isready -U postgres -d agentscope < /dev/null
./backup-database.sh
```

已完成 TCP 密码认证、应用账号读取、事务内写入和回滚；测试用户残留为 0。首份备份为 `agentscope-20261112T054620Z.dump`，已实际恢复到独立临时库并验证 33 张表；随后已清理该临时库。

尚未配置自动定期备份和异地备份。正式上线应补充调度、保留策略和异地存储。

## 新实例初始化

仅在新的 Linux 实例上使用，需已有 Docker Compose 和 Python 3.6+。打包 `compose.yml`、`setup-database.py` 与六份 `supabase/migrations/*.sql`，将迁移文件放在脚本同目录的 `migrations/`，以 root 执行脚本。脚本会拒绝覆盖已有数据或重复应用迁移。

原迁移中的 Supabase 浏览器角色授权撤销语句已适配为普通 PostgreSQL；保留 PUBLIC 权限撤销及 RLS，再为独立后端账号设置明确策略。

CentOS Linux 7 已于 2024-06-30 结束支持。正式长期运行前，应另行安排受支持系统的迁移；本次未重装操作系统。依据：https://www.centos.org/centos-linux/

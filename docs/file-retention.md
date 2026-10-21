# 会话文件保留与清理

用户上传文件保留 3 天，AI 产物保留 7 天，历史文件同样适用。分别按上传成功、首次成功交付时间起算；更新版本不续期。到期即拒绝访问并显示“文件不存在。”，保留消息和文件卡片。清理覆盖该文件所有版本，使用各版本记录中的存储类型，不影响公共素材、知识库和其他存储对象。

常驻 FastAPI 服务启动后每 60 秒扫描，先在同一数据库事务中撤销访问并写入持久清理队列，再删除 Supabase / 本地对象。失败下轮重试；重复触发安全。一次处理最多 20 个文件，积压分批处理。实际物理删除晚于失效时间，取决于扫描和重试延迟。

## 历史迁移与手动运维

在项目环境运行（使用服务端数据库及 Supabase 密钥，禁止放到浏览器）：

```sh
.venv/bin/python -m service.file_maintenance
.venv/bin/python -m service.file_maintenance --apply
```

第一条只输出数量；第二条回算历史到期时间并清理一批超期对象。重复执行直至 expired 为 0、pending 为 0；pending 非零需检查存储服务后重试。不会延长已有更早的到期时间。

## Serverless 必须配置独立调度

Serverless 不运行常驻 maintenance 循环。发布代码后，在后端设置足够随机的 `FILE_CLEANUP_SECRET`，由可信外部调度器每分钟向后端服务地址发送：

```http
POST /internal/files/cleanup
Authorization: Bearer <FILE_CLEANUP_SECRET>
```

入口未配置密钥时默认拒绝访问，不接受普通用户登录令牌；返回值只有汇总数量。密钥放在调度器的机密配置中，不能写进仓库。可通过 Supabase Cron 调用部署的 Edge Function，在 Function 的服务端环境中读取清理密钥并调用后端，避免把高权限存储密钥放进调度 SQL。

当前生产部署采用 Supabase Cron：将同一份 `FILE_CLEANUP_SECRET` 写入 Vault 的 `xixi_file_cleanup_secret`，再执行 `supabase/ops/file_cleanup_schedule.sql`。每分钟检查一次，仅在存在超期文件或待清理队列时通过受保护的后端入口执行清理。HTTP 队列表禁止浏览器角色读取，任务 SQL 不包含密钥正文。

部署验收须核对 Cron 的执行记录和 pending 数量。未执行调度 SQL 的 Serverless 实例不能保证定时物理删除。

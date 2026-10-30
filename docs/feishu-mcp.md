# 飞书个人 MCP 连接器

本项目通过飞书平台生成的个人 MCP 服务地址连接远程工具。实现使用现有 MCP Python 依赖，无需新增 npm 包；本次未创建真实飞书服务或访问用户文档。

## 使用

1. 打开[飞书 MCP 平台](https://open.feishu.cn/page/mcp)，创建个人 MCP 服务、选择需要的工具并完成飞书授权。
2. 在项目「能力市场 → 连接器」点击「接入飞书」。
3. 粘贴平台提供的完整 `https://mcp.feishu.cn/…` 服务地址并保存。默认不启用。
4. 点击「测试连接」确认工具列表，然后启用。新一轮会话可选择该连接器，写入操作沿用现有工具确认流程。
5. 授权失效时在飞书平台重新授权或生成新地址，再编辑连接器替换地址。编辑时留空会保留原地址。

支持以用户实际授权范围为准，不预设固定工具清单，也不保证飞书个人服务提供 MCP Apps 交互界面。飞书机器人消息渠道与此连接器分别配置。

## 存储与部署

个人服务地址属于授权凭证。后端用 Fernet 加密保存在 `mcp_connector_secrets`，公开资源配置只保留 provider 和已配置状态。列表、编辑及保存接口均不回传原始地址。运行时仅在服务器连接边界解密；飞书请求异常不回显地址，HTTP 客户端常用日志中的飞书链接被脱敏。

本地 SQLite 未设置 `AGENTSCOPE_MCP_KEY` 时，在状态数据库旁创建权限为 `0600` 的 `mcp.key`，需与数据库一起妥善备份。

PostgreSQL 部署需先应用 `supabase/migrations/202610230002_mcp_connector_secrets.sql`，并配置稳定的 `AGENTSCOPE_MCP_KEY`。可通过 `python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'` 在自己的终端生成。密钥不随部署更换；丢失后须重新填写个人地址。本次未执行线上迁移。

## 验证

```sh
DATABASE_URL='' .venv/bin/python -m unittest tests.test_feishu_mcp tests.test_console -q
npm run typecheck
npx eslint app/StudioConsole.tsx --quiet
npm run build
```

新增测试覆盖加密存储、公开数据脱敏、权限隔离、编辑保留与替换、删除清理、地址校验、日志脱敏及旧协议识别。真实飞书连接仍需用户在设置中填写有效服务地址后联调。

参考：[飞书 MCP 概述](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/mcp_integration/mcp_introduction?lang=zh-CN)、[个人调用远程 MCP 服务](https://open.feishu.cn/document/mcp_open_tools/end-user-call-remote-mcp-server?lang=zh-CN)、[官方 MCP 工具列表](https://open.feishu.cn/document/mcp_open_tools/supported-tools?lang=zh-CN)。

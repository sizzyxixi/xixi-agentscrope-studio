# AgentScope Service

这是 Web UI 后面的真实 AgentScope 运行时。当前第一版已经把 `/api/agent/stream`
代理到本服务，服务内使用 AgentScope `Agent`、`Toolkit`、`FunctionTool`、
流式事件和权限确认事件。

- 多会话
- 流式事件
- 人类确认
- 工具调用
- SQLite session state 与消息记录
- 本地 Markdown 文档检索
- Loop 与 State 回写

## 本地启动

```bash
python -m venv .venv
.venv/bin/pip install -r service/requirements.txt
npm run agent:dev
```

如果使用 DashScope / Qwen：

```bash
AGENTSCOPE_PROVIDER=dashscope DASHSCOPE_API_KEY=... npm run agent:dev
```

## 当前能力

Main 智能体为「MoonClaw 助手」，默认加载 [身份与规则](personas/main/agents.md)、[用户画像规则](personas/main/user.md)，仅由程序判断当前账号首次普通对话时按需加载 [首次引导](personas/main/bootstrap.md)。引导状态按账号持久化，后台任务与审批恢复跳过，不全局删除共享文件；真实用户资料仍通过账号隔离的长期记忆与确认流程保存。CLI、文件生成、管家转交等实际执行能力需要对应工具接入。接入边界与验收场景见 [人设说明](personas/main/README.md)。

1. 初始化真实 AgentScope 主 Agent。
2. 挂载 `workspace_write_plan` 工具。
3. 工具调用默认触发 AgentScope 权限确认，Web UI 点击确认后继续执行。
4. 使用本地 SQLite 保存 sessions、messages、plans、runtime events。
5. 轻量 RAG 只索引真实存在的 Markdown 文档：`README.md`、`docs/*.md`、`service/README.md`。
6. 提供真实 sessions API，供 Web UI 恢复后端会话。
7. 本地用户名/密码注册登录，以及多模型设置。支持 Kimi、DeepSeek、豆包、OpenAI、Anthropic、Qwen、Gemini、Ollama 和 OpenAI-compatible。
8. 模型配置支持真实连通性测试、编辑、删除与默认切换。
9. 从 SQLite 历史消息恢复 AgentScope `AgentState`，支持后端重启后继续对话。

## 控制台扩展

`capabilities.py` 提供按用户隔离的 SQLite 资源管理、Skills/记忆上下文、个人文档检索、真实 HTTP MCP 客户端、顺序工作流和后台调度。FastAPI lifespan 启停调度器与后台任务。

新增 `/console/resources`、`/console/runs`、`/console/status`、`/console/project-docs` 和会话管理接口。所有接口要求登录；资源、模型和会话访问校验账号归属。

Agent Toolkit 增加 `search_documents` 和需要权限确认的 `save_memory`。工作流遇到确认点暂停，确认后继续后续步骤，拒绝后停止。

运行与边界说明见 `docs/QWENPAW_ADAPTATION.md`。测试：`npm run test:service`。

## 消息渠道

`channels.py` 管理账号隔离的绑定、授权、会话、持久化消息与发送记录；`channel_worker.py` 在独立进程中运行官方 SDK，事件持久化后才确认接收；`channel_platforms.py` 负责令牌和平台发送。配置入口位于个人中心，操作步骤见 [接入说明](../docs/消息渠道接入说明.md)。

普通会话在「新建任务」聊天框通过「＋ → 技能」选择最多 3 个技能，并随 stream 请求的 skill_ids 保存到 execution_scopes。新建任务默认不选，已发送会话可恢复选择；消息渠道不提供技能选择入口。

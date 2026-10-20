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

在个人中心的「消息渠道」中配置钉钉或飞书机器人。支持智能体与模型绑定、MCP 选择、凭证加密、访问授权、连接诊断与网页工具确认后的回传。接入步骤和验证范围见 [消息渠道接入说明](docs/消息渠道接入说明.md)。

## 技能市场

内置 Anthropic 的 pdf、docx、xlsx、pptx、frontend-design、mcp-builder 六个完整技能包，支持市场查看、账号启停与会话按需读取主指令及引用文件。详见 [技能市场与会话调用](docs/技能市场与会话调用.md)。

## 智能体

能力市场首位「智能体」支持创建、编辑、启停和卡片发起对话。创建弹窗可配置头像、简介、角色指令，以及执行轮次和上下文压缩阈值。聊天框上方可搜索并切换智能体；已有消息时切换会开启新会话，原会话保留。智能体绑定和创建时的配置快照按账号持久化，停用或删除不会删除历史消息。

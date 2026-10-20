# QwenPaw 风格控制台改造

更新日期：2026-09-30。

## 官方项目与开源许可

QwenPaw 是 AgentScope 团队的开源个人 Agent 应用，包含 React 控制台、Python 后端和渠道等模块，并非只有前端。

- 官方仓库：https://github.com/agentscope-ai/QwenPaw
- 本地参考源码：`upstream/QwenPaw`
- 本次下载提交：`c3e572c1d886d6405c33942354b74287bbd5ed21`，2026-09-30 10:39:16 +08:00。
- 许可：Apache License 2.0。副本见 `docs/licenses/QwenPaw-APACHE-2.0.txt`。
- 界面参考：`console/src/styles/tokens.css`、`console/src/layouts/Sidebar.tsx`、`console/src/layouts/registry/builtinMenu.ts`。

界面最初参考官方暖色背景、卡片与分组导航，当前品牌主题色已统一为 #490CF2，重新实现适用于当前 React 19 / vinext 项目的界面。保留 XIXI 品牌和现有 AgentScope 服务接口。没有将 QwenPaw 的 React 18 / Ant Design 控制台直接覆盖当前项目，也没有启动 QwenPaw 后端。本项目 CSS 中的配色参考来源已标注。

## 已接通的能力

| 模块 | 实际行为 |
| --- | --- |
| 对话 | SSE 流式回答、Markdown、代码块、表格、复制、停止、工具确认；Enter 发送，Shift+Enter 换行 |
| 会话 | 搜索、切换、重命名、导出 Markdown、删除；后端操作校验归属，浏览器缓存按账号区分 |
| Skills | 创建、编辑、导入文本、导出、启停；启用指令加入当前账号的每轮 Agent 上下文 |
| MCP | 保存 Streamable HTTP 地址、真实连接测试、显示发现的工具、启停；启用服务挂载到真实 AgentScope Toolkit |
| 知识库 | 导入/编辑 Markdown、文本、CSV、JSON，关键词检索；查看共享项目文档，导入个人可编辑副本 |
| 记忆 | 创建、编辑、导入、导出、启停；启用内容加入上下文；Agent 可请求调用 `save_memory` 保存偏好 |
| 工作流 | 1–10 个提示词步骤，按顺序在同一会话运行；保留运行快照，工具确认后继续下一步；拒绝或错误停止后续步骤 |
| 定时任务 | 任务列表/运行记录双 Tab；六个电商提示词模板；选择智能体、真实 LLM 模型及各最多 3 个技能/MCP；间隔、单次、每天、每周、每双周、每月、每年及有效期，兼容原每小时任务；到期创建真实会话，可立即执行 |
| 运行记录 | 运行中、等待确认、完成、失败、中断；打开会话查看结果；后台会话轮询更新，可停止正在运行的任务 |
| 模型 | 保留原有九类提供方配置、连接测试、编辑、删除、默认切换；账号只能使用自己的模型配置 |
| 概览与备份 | 当前账号资源、会话、消息统计，服务状态和最近运行；导出/导入资源 JSON，导入副本默认停用 |
| 主题与布局 | 浅色/深色主题持久化、手机抽屉导航，卡片、表格与编辑器适配窄屏 |

资源与运行记录存入现有 SQLite 的 `console_resources` 和 `console_runs`，采用新增表/列迁移。现有模型密钥、账号和会话继续使用原数据结构。改造前的源文件备份在 `outputs/pre-qwenpaw-upgrade/`。

## 本地运行

```bash
npm install
npm run dev
```

另开终端：

```bash
.venv/bin/pip install -r service/requirements.txt
npm run agent:dev
```

打开 http://127.0.0.1:3000，登录后在模型设置保存默认模型，再配置资料、技能、MCP 或任务。

运行环境依旧使用现有安装的 AgentScope `2.0.4.post1`；前一轮下载的官方主分支源码在 `upstream/agentscope`，并未作为运行依赖安装。

## 下拉组件

全站表单下拉采用 assistant-ui 官方注册表的 `select` 组件；对话与定时任务的模型选择采用独立的 `elements-model-selector`，支持搜索真实账号模型，不需要引入或替换 AgentScope 对话运行时。其 Popover、Command 以及菜单使用官方依赖的 shadcn/Radix 基础组件，沿用 #490CF2 与现有浅色/深色语义色。

源码保存在 `components/ui/`、`components/assistant-ui/`，业务统一通过 `components/SelectField.tsx` 使用。来源：<https://r.assistant-ui.com/select.json>、<https://r.assistant-ui.com/elements-model-selector.json>、<https://www.assistant-ui.com/elements/model-selector>。MIT 许可见 `docs/licenses/assistant-ui-MIT.txt` 与 `docs/licenses/shadcn-ui-MIT.txt`。上游工具中 ref 同步调整到 effect，以适配本项目 React lint；任务表单在捕获阶段判断弹层，避免同一次 Esc 同时关闭下拉和编辑器。

## 当前边界

- 定时任务附件仅做文件选择、标签展示与移除，暂不上传、保存文件或参与执行。
- 店铺选择支持多选、失效禁选和账号归属校验。店铺来源是授权连接器写入的 `shop` 资源，普通资源 CRUD 不可创建授权记录；当前没有店铺授权连接器，因此真实账号显示待接入空状态。店铺授权不能由模板或选择标签代替。
- 可在任务表单创建账号私有智能体，角色指令在后台执行时生效；模型、角色及工具选择随运行快照固定，确认后继续执行仍使用原模型。

- MCP 当前支持无需额外认证的 Streamable HTTP 服务；未接入 stdio、SSE、OAuth 或自定义认证头。
- 文本资源单项限 500 KB；Skill 限 24000 字符、记忆限 16000 字符；上下文总量有上限。知识检索为真实关键词检索，不是向量检索。PDF、Office、音视频解析尚未接入。
- 工作流是同一个 Agent 的顺序步骤，不等同于 AgentScope `TeamPipeline` 多 Agent 并行编排。每次后台运行最多 10 分钟；超过时间记录为失败。
- 调度器运行在 Python 服务内，每 5 秒检查一次。服务离线期间不会执行；恢复后对过期任务补跑一次，重复任务推进到下一次未来时间。采用单服务实例；未接入分布式队列或多 worker 调度。
- 服务重启会将运行/等待确认中的后台任务标记为中断；AgentScope 进程内的确认点不能跨重启恢复。
- 资源备份不包含模型密钥、用户密码、会话和运行记录；导入以新副本追加，全部默认停用。
- 飞书、钉钉等渠道、实时语音、QwenPaw Local 模型、插件市场安装与沙箱管理是 QwenPaw 的独立后端能力，本次未迁移这些模块。

## 验证

```bash
npm test
npm run typecheck
npm run lint
npm run test:service
```

后端 19 项测试使用临时 SQLite 数据库，覆盖资源隔离、持久化、上下文注入、SDK 工具挂载、顺序执行、运行快照、确认暂停/继续、拒绝停止、定时触发、后台停止、取消释放锁与 API 归属校验。

浏览器验收使用临时测试数据库：验证登录、Skill 创建、MCP 地址保存与连接测试、概览、手机导航。通过临时本地 FastMCP 服务发现 `add` 工具，并用真实 AgentScope MCP 适配器调用 `add(2, 3)` 得到 `5`。没有调用真实付费模型；云模型端到端执行仍需用户配置密钥后验证。

官方 Cloudflare 声明由 `npm run typegen` 生成，配置 `worker/wrangler.types.jsonc` 仅用于类型生成，实际运行绑定仍由现有 `vite.config.ts` 管理。

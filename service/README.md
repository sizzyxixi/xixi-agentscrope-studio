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

普通会话在「新建任务」聊天框通过「＋」每轮最多指定 3 个技能和 3 个 MCP，随 stream 请求的 skill_ids／mcp_ids 保存该轮选择。下一轮未指定时清空，审批恢复保留。智能体配置不限数量，每轮选择不扩大配置白名单；所有智能体统一注入技能选用策略：用户指定优先，多个相似候选或指定与任务完全不匹配时先询问用户。

## 会话文件：能力匹配与部署

本轮对应《AI文件生成与处理能力需求文档.md》《文件预览及操作需求文档.md》。

| 需求 | 复用 / 接入 | 已实现的边界 |
| --- | --- | --- |
| PDF / Word / PPT / Excel 读取 | AgentScope `PDFParser`、`WordParser`、`PPTParser`、`ExcelParser` | 账号和会话授权后读取；大内容分页返回，明确实际处理范围 |
| 图片 / 扫描 PDF | RapidOCR（ONNX Runtime） | 图片文字及最多 20 个扫描页面；低置信结果注明不确定。不是凭 OCR 声称理解图像含义 |
| 图片送视觉模型 | AgentScope `ImageParser` | 设置 `AGENTSCOPE_FILE_VISION_INPUT=true` 后，把 512px 预览作为实际图片块发送；需所选模型支持多模态 |
| 音视频提取 / 转换 | faster-whisper、imageio-ffmpeg 提供的 FFmpeg | 转录；视频最多抽 6 帧 OCR；输出 MP3 / WAV / MP4 / WebM。Whisper 首次使用下载权重，离线部署应设置本地模型目录 |
| 真实文件生成 | python-docx、openpyxl、python-pptx、ReportLab、Pillow、标准库 | 文本、代码、结构化数据、DOCX、XLSX、PPTX、PDF、基础图形 / 图片合成 / GIF、ZIP 和文件夹。Word / Excel / PPT 支持引用会话图片；PPT 支持基础图表 |
| 表格筛选与统计 | pandas，封装在 `read_file(analysis_json=...)` | 单次最多分析前 10,000 行；结果展示最多 500 行；返回实际统计范围，不把抽样统计当作全量。无缓存公式不编造结果 |
| Office 及旧格式转换 | LibreOffice CLI（可配置 `AGENTSCOPE_SOFFICE`） | DOC / ODT / RTF → DOCX、PPT / ODP → PPTX、XLS / ODS → XLSX、DOCX / PPTX → PDF；保留源文件。不存在引擎时明确失败 |
| 浏览器预览 | PDF.js、docx-preview、Shiki，assistant-ui Markdown | PDF 翻页、缩放与文字搜索；Word 基础只读版式；PPT 转静态 PDF；多工作表；文本 / 代码高亮；Markdown 原文切换；媒体播放器和图片缩放拖动 |
| HTML / SVG | sandbox iframe + CSP；defusedxml + resvg | HTML 禁用脚本、远程资源及表单；同会话授权的图片 / CSS 可内联。SVG 拒绝脚本、外部引用，光栅化失败降级为转义源码 |
| 上传 / 引用 / 文件产物 | assistant-ui AttachmentAdapter、AttachmentPrimitive、ComposerPrimitive、TriggerPopover；Radix Tabs / Dialog / AlertDialog（沿用 assistant-ui 的组件基础） | `+` 首位上传、文件夹选择、普通文件拖拽 / 粘贴、上传及移除状态；`@` 搜索与键盘选择；按文件 ID 引用；用户原件保留在用户气泡，右侧只列 AI 产物 |
| 版本 / 生命周期 | SQLite 文件注册表、不可变对象版本、文件交付关系表 | 覆盖 AI 产物须带版本；用户原件修改生成衍生文件；另存使用新 ID；更新不续期；历史卡片保持入口；30 天后服务端停止读取、引用和下载 |
| 删除 / 下载 / 刷新 | 鉴权文件 API、版本校验、清理重试队列 | 二次确认；版本变化须重新确认；下载最新原格式；关闭侧栏不改变输入；页签、宽度、展示模式和排序按账号 / 会话保存 |

### Supabase 存储配置

已预置项目 `https://bmfppeqixqhinyklhbzo.supabase.co` 和桶 `xixi-agentscope-studio`。当前工作区未发现上传凭据，因此本轮**没有声称真实云端上传已验收**。

1. 将 `.env.example` 复制为项目根目录 `.env`，填写服务端 `SUPABASE_SECRET_KEY`（`sb_secret_...`），或旧版 `SUPABASE_SERVICE_ROLE_KEY`。Python 服务启动时读取此文件；也可直接使用部署环境变量。不要使用 publishable / anon key，不要把服务端密钥写进前端或提交到仓库。

模型配置的 `api_key` 为 `@environment` 时，服务端从 `AGENTSCOPE_MODEL_API_KEY_<大写模型配置ID>` 读取真实密钥。变量只对应该账号已有的模型配置，聊天与 DeepSeek 搜索均通过账号权限检查后解析；缺少变量时拒绝使用，不回退到共享密钥。列表接口只返回配置状态。修改模型时留空密钥可保留此绑定；填写新密钥仍沿用原有数据库保存方式。部署到其他环境时需在该环境配置同名 Secret，修改本地 `.env` 后需重启 Python 服务。
2. 设置 `AGENTSCOPE_FILE_STORAGE=supabase` 并重启 `npm run agent:dev`。只有存储桶确认写入成功后才提交文件记录、发送产物事件。云存储失败时不会悄悄回退成本地并声称上传成功。
3. 设置并备份稳定的 `AGENTSCOPE_FILE_KEY`（32 字节 URL-safe Base64）；未设置时会创建 `service/state/file-storage.key`。数据库、此密钥和本地对象应一起备份。缺少原密钥无法恢复历史文件。
4. 该桶为公开读。会话文件仅以分块 AES-GCM 密文写入 `conversation-files/<user>/<file>/<version>.enc`，文件名和原文不写入公开对象路径。浏览器不接收存储管理密钥，也不使用公开明文 URL。预览与下载经当前账号鉴权后由服务端解密。
5. 原有 `assert/` Logo 等公开资源不受影响。新式 secret key 仅放在 `apikey` 请求头；旧式 service_role JWT 同时使用 Bearer 头，符合 Supabase 官方 API key 约定。

不配置 Supabase 时，使用 `service/state/objects/` 中的加密持久对象，解析临时目录清理及服务重启不会删除原件。云端部署必须保留数据库和解密密钥，或恢复其备份，不能只保留存储桶。

### 限制及未部署项

- 常规单文件预览 / 解析上限 32 MB；超量内容按能力截断、抽样或显示统一缺省页并保留下载。ZIP 处理限制解压后 256 MB、1000 项、10 层，拒绝越级目录、符号链接和加密包。上传与处理限制分别管理。图像尺寸最多 4096×4096，GIF 最多 60 帧且总像素不超过 6400 万；单次最多使用 20 个、各不超过 32 MB 的图片素材。
- Office 和 PDF 是基础布局，不承诺复杂对象 / 原始版式还原；XLSX 预览优先使用缓存值，缺少时显示原公式与“未计算”，未接自动公式重算。PDF → DOCX、PSD 等未支持方向明确失败。
- HTML 脚本执行、任意外网浏览器和复杂网页交互不在该文件预览实现中。音视频播放取决于浏览器解码能力；不支持时保留原件下载。
- 创意图片、语音合成和视频生成仍依赖单独的模型接入；本轮图片生成是图形绘制、素材合成和简单动画，不伪装成创意生图模型。
- 30 天访问失效已执行。**物理冷存储迁移未接入**：Supabase 标准桶仍保存密文；如需深度存储，需要另配归档目标和迁移任务。更新文件不会延长有效期。
- 文件 API / 工具、权限、版本、失效及存储失败用隔离临时数据库测试；端到端验收用确定性模型事件替代付费模型，实际上传、文件生成、格式检查、加密保存和产物交付均执行真实实现。

参考：[assistant-ui 附件适配器](https://www.assistant-ui.com/docs/guides/attachments)、[PDF.js](https://mozilla.github.io/pdf.js/)、[docx-preview](https://github.com/VolodymyrBaydalka/docxjs)、[resvg-py](https://github.com/baseplate-admin/resvg-py)、[Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)。

PDF.js Worker、CMap 和标准字体会在 `npm run dev` / `npm run build` 前同步到 `public/pdfjs/`，避免升级包后 Worker 版本不一致；也可运行 `npm run files:assets` 手动同步。

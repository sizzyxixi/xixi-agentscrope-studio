# MoonClaw 核心行为评测

本评测验证四份核心规则在真实 AgentScope Main 运行时的行为。40 个场景、41 轮输入，数据均为合成，不读取真实账号画像、店铺或会话。场景覆盖首次引导、持续画像、授权变化、经营引导、商品刊登、能力推荐及交互边界。

本次运行结论见[2026-10-23 评测复核报告](./review-2026-10-23.md)，包含完整集、重复采样、实际问题及校准边界。

根据结果调整后的最新结论见[调整与复测](./retest-2026-10-23.md)。

## 文件

| 文件 | 用途 |
| --- | --- |
| [cases.md](./cases.md) | 供产品评审阅读的输入与预期表 |
| [cases.jsonl](./cases.jsonl) | 可执行用例，包括前置画像、状态快照、用户输入、预期和结构断言 |
| [cases-v2.md](./cases-v2.md)／[cases-v2.jsonl](./cases-v2.jsonl) | 推荐的新版本；仅纠正 CAP-03 的矛盾预期及强化 GUD-02 的整条回复限制，原文件保留 |
| [执行脚本](../../scripts/eval_moonclaw.py) | 创建隔离账号、调用真实模型、处理测试确认点、记录证据并评分 |

`profile` 是测试账号的原有记忆；`context` 是每轮提供的测试平台快照；`turns` 可包含多轮输入及状态变化。`criteria` 只给评分器，不进入被测助手上下文。`memory` 定义是否应创建、合并更新、保持不变、允许可选更新，或模拟拒绝／失败。`preserve` 用于检查更新后没有丢失关键事实。

## 执行

从项目根目录运行，使用项目 `.venv`。只读本地配置数据库里唯一的默认模型，使用其中凭据请求对应 API；不将凭据写入评测产物。真实模型执行会产生 API 用量，核心提示词和合成资料会发送到配置的模型服务商。本次 DeepSeek 运行已获得用户明确授权；改用其他目的地前需重新核对授权范围。

```bash
# 仅校验数据集，不请求模型
.venv/bin/python scripts/eval_moonclaw.py --output output/moonclaw-eval/unused --dry-run

# 完整真实评测，输出目录必须尚不存在
.venv/bin/python scripts/eval_moonclaw.py --output output/moonclaw-eval/new-run --concurrency 4

# 使用修正后的标准；不与旧版本的百分比直接混比
.venv/bin/python scripts/eval_moonclaw.py --dataset evals/moonclaw/cases-v2.jsonl --output output/moonclaw-eval/new-v2-run --concurrency 4

# 对关键样本多次采样；每次均保留结果
.venv/bin/python scripts/eval_moonclaw.py --output output/moonclaw-eval/repeat-run --case PRO-03 --case AUT-01 --repeat 3
```

可用 `--model-db /absolute/path/to/local.sqlite3` 指定包含唯一默认模型的本地配置库。不会读取远程生产数据库，也不会加载 `.env` 中的业务连接或搜索凭据。默认单场景最多 180 秒，可用 `--timeout` 调整。`--no-judge` 仅执行结构断言，成功状态标为 `ungraded`，不能视为语义通过。

每个场景建立独立临时 SQLite、测试用户与会话，复用真实 Main 装配、记忆工具、审批和上下文刷新逻辑。模型配置只复制到临时测试账号，场景完成后清理。保存确认仅允许测试库内的 `save_memory`／`save_user_profile`；其他需要确认的工具一律拒绝。网页、外部商品和真实业务写工具未开放，不触发生产动作。

新增专用画像工具后，结构断言检查的是最终记录名称与前后真实 ID；不要求模型给无 ID 参数的专用工具传入 ID。原 40 个场景的输入与预期保持不变，[补充反例](./regression-cases.md)单独运行，不混入原集前后通过率。

## 判定与证据

1. 结构断言：调用与保存是否实际发生、是否保持同一记忆 ID、是否保留原事实、拒绝／失败后数据是否未变、是否出现越界工具调用或不应有的建议按钮。
2. 语义判定：沿用同一模型、独立会话作为按标准分类的裁判，逐条输出 pass、原因与证据。输出缺项或调用失败记为 error，不能计入通过。
3. 人工复核：检查未通过样本及通过样本的实际回复，区分产品缺陷、自动裁判误判和评测条件不清楚。本次执行人的复核结论应另存 review.md，不覆盖 results.jsonl 中原始判定。

每次运行生成 `metadata.json`、`cases.jsonl`、`results.jsonl`、`report.md`。元数据保留核心文件与数据集 SHA256；结果保留实际回复、工具参数／结果、审批决定、前后画像及逐条判定。输出目录不可覆盖，避免只保留有利结果。正式复跑应保持前置条件与标准不变；变更用例或提示词后单独记录版本。

## 本次边界

- 这是提示词行为与现有记忆链路评测，不是 UI 或全部产品功能验收。面板状态、智能体市场目录、授权事件与结构化画像主数据由测试注入。
- 不证明真实表单已回填后端、授权回调已接通、事件幂等已实现、页面已跳转，或后台会主动推送变化。
- 裁判与被测模型相同，存在共同盲点；单次采样不足以给出稳定性保证。关键失败场景应复测，并用人工复核校准。
- `usage_actor_only` 只记运行时实际返回的被测助手 token 用量；裁判用量未计入，不据此推断总费用。

方法参考：[OpenAI Evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices)。

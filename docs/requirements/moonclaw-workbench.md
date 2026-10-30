# MoonClaw 跨境经营工作台需求与数据字典

- 文档版本：v1.0
- 整理日期：2026-10-22
- 适用范围：新建任务中的 MoonClaw 工作台、画像收集、能力推荐、会话分流、商品管理、刊登及连接器引导。
- 交付性质：产品需求与建议数据模型；不代表已经接入后台、执行数据库迁移或完成真实平台能力。
- 当前实施边界：先完成前端交互 Demo；画像、商品、店铺和连接状态使用本地数据，会话复用平台会话过程页。

## 1. 需求结论与范围

### 1.1 已确认的产品规则

| 编号 | 已确认要求 | 产品含义 |
| --- | --- | --- |
| R01 | 切换不同智能体，工作台有差异 | MoonClaw 展示跨境卖家工作台；其他智能体保留各自首页 |
| R02 | 新用户先收集画像 | 收集阶段只显示收集面板，不显示对话输入框，不混排首页能力 |
| R03 | 经营阶段分流 | 筹备开店、已经开店、规模运营；另设“其他”直接进入会话 |
| R04 | 筹备开店收集目标信息 | 目标经营平台多选、目标市场、目标经营类型；平台支持热门标识 |
| R05 | 已经开店／规模运营收集现有信息 | 经营平台多选、市场、经营类型、主营类目 |
| R06 | 筹备用户可以咨询 | “帮我看看应该怎么选”携带已填信息新建会话，后续可继续补全画像 |
| R07 | 确认画像后进入个性化首页 | 使用 MasterGo 参考中的横幅、主输入框、快捷功能、专家卡片和案例结构 |
| R08 | 按经营平台推荐已有智能体 | 初始推荐只展示所选平台匹配的现有专家；“查看全部”可主动浏览其他专家 |
| R09 | 对话进入独立会话过程页 | “其他”、咨询、专家对话及首页对话入口均不在首页内展开模拟聊天面板 |
| R10 | 核心快捷功能 | 刊登、选品、经营分析；参考设计另有快速指引、营销创意、市场调研、客户运营入口 |
| R11 | 刊登支持多种商品来源 | 商品池、西之月商品 SKU／链接、外部商品链接、外部商品系统 |
| R12 | 外部系统不默认等于领星 | 先询问商品维护在哪里；再引导到能力市场 → 连接器配置对应 ERP 项目，或进入连接咨询会话 |
| R13 | 刊登目标店铺有授权分支 | 未授权显示支持连接的平台；已授权可选平台与类型、具体店铺；支持新增连接 |
| R14 | 刊登配置分层 | 基础项直接展示，更多个性化配置默认收起；支持批次设置与单 SKU 特殊要求 |
| R15 | 平台新增商品管理 | 导入、维护商品及 SKU；从商品池选择商品用于刊登 |
| R16 | 画像可调整，可模拟新用户 | 画像调整后更新推荐；“模拟新用户”重新进入收集流程，不删除商品、店铺或历史会话 |

### 1.2 需求状态与优先级说明

| 标记 | 定义 |
| --- | --- |
| 已确认 | 来自本轮沟通确认的业务行为 |
| 设计建议 | 为使功能可实现、可维护而补充的字段或规则，需产品／研发评审后确定 |
| Demo 已有 | 当前前端已有相应演示，不能据此推断生产接口、真实授权或真实执行已完成 |
| P0 | 本轮主流程及前端交互需要覆盖 |
| P1 | 生产接入或下一阶段增强，不要求本轮全部实现 |

本轮不要求接入真实 ERP、完成真实店铺授权、采集实时经营数据、调用模型生成经营结论或真实发布商品。后台服务能够启动，不等于这些业务能力已经接通。

## 2. 用户动线与页面规则

### 2.1 用户状态与页面去向

| 当前状态／操作 | 页面去向 | 显示输入框 | 保存规则 |
| --- | --- | --- | --- |
| 新用户，无已确认画像 | 经营阶段收集面板 | 否 | 可保存草稿，不标记画像完成 |
| 选择筹备开店 | 目标平台、市场、经营类型表单 | 否 | 校验通过并确认后保存正式画像 |
| 选择已经开店或规模运营 | 经营平台、市场、经营类型、主营类目表单 | 否 | 校验通过并确认后保存正式画像 |
| 经营阶段选择“其他” | 新建独立会话，进入会话过程页 | 是，会话页输入框 | 不强制补完电商画像，不标记已完成 |
| 点击“直接开始对话” | 新建独立会话，进入会话过程页 | 是 | 与“其他”分流一致 |
| 点击“帮我看看应该怎么选” | 新建咨询会话，带入画像草稿 | 是 | 草稿保留；咨询结束不自动将模型建议当作确认结果 |
| 确认完整画像 | MasterGo 样式的个性化首页 | 是，首页主输入框 | 保存画像版本，重新计算匹配结果 |
| 点击专家、案例或咨询类快捷入口 | 新建独立会话，进入会话过程页 | 是 | 携带画像和入口上下文 |
| 点击刊登 | 刊登配置流程 | 配置页不依赖对话输入 | 保存商品选择和配置草稿 |
| 点击修改画像 | 收集面板，回填原值 | 否 | 取消恢复已确认值；确认后更新版本 |
| 点击模拟新用户 | 空白画像收集面板 | 否 | 只重置 Demo 画像，不清空其他资产 |

“确认完整画像进入首页”和“直接开始对话”是两条独立出口，不允许通过跳过必填校验伪造已完成画像。

### 2.2 首页结构与推荐规则

| 首页模块 | 内容与交互 | 数据依据 |
| --- | --- | --- |
| 顶部工具 | 经营画像、模拟新用户；参考设计中的桌面端与优惠展示 | 用户操作状态；下载、积分、优惠当前只做演示 |
| 升级横幅 | 使用 MasterGo 对应视觉资产 | 静态设计资产，不承担画像判断 |
| 主输入框 | 输入需求后新建会话；可携带资料上下文 | 当前画像、用户输入、主动选择的资料 |
| 快捷功能 | 快速指引、选品开发、商品刊登、经营分析、营销创意、市场调研、客户运营 | 当前首期入口；真实执行需另查能力状态 |
| 匹配专家 | 只展示所选平台对应且市场中实际存在、启用的专家 | 平台 ID、智能体目录及映射关系 |
| 查看全部 | 展示市场中其他可用专家，属于用户主动扩大范围 | 智能体目录；不再声称全部与画像匹配 |
| 使用案例 | 经营分析报告、领英推广帖、热门榜单机会挖掘 | 案例模板；点击发起会话，不冒充用户真实经营结果 |
| 商品与连接入口 | 商品池、连接商品系统 | 商品池数量、连接状态；不与平台画像混用 |

推荐规则：

1. 平台是首期硬匹配维度；市场、经营阶段、经营类型和类目可作为排序与会话上下文。
2. 类目、市场的进一步排序属于设计建议，当前 Demo 没有实现精确推荐算法。
3. 没有匹配专家时展示明确空态，保留通用快捷功能和 MoonClaw 对话入口，不用其他平台专家冒充匹配结果。
4. 智能体停用、删除或用户无权限时，不进入可推荐集合。
5. 平台热门标识使用可维护配置；不能将 Demo 固定标识表述为实时市场排名。
6. 画像选择了某平台，只表示经营意向或经营现状，不表示已连接店铺、已授权 ERP 或平台支持真实刊登。

### 2.3 经营阶段与能力组织建议

下表的字段和分流已确认；快捷能力优先顺序为设计建议，不是当前 Demo 已有的动态排序。

| 经营阶段 | 必填画像 | 优先帮助目标 | 建议优先入口 | 专家推荐规则 |
| --- | --- | --- | --- | --- |
| 筹备开店 | 目标平台、目标市场、目标经营类型 | 缩小入局方向、梳理开店准备 | 快速指引、选品开发、市场调研 | 所选目标平台对应专家 |
| 已经开店 | 平台、市场、经营类型、主营类目 | 上新、选品及日常优化 | 商品刊登、选品开发、经营分析 | 已经营平台对应专家 |
| 规模运营 | 平台、市场、经营类型、主营类目 | 多店协同、批量处理及优化 | 经营分析、商品刊登、客户运营 | 已经营平台对应专家；不因此自动授权多店操作 |
| 其他 | 无强制电商画像 | 自由描述需求 | 直接进入新会话 | 当前不生成电商个性化首页 |

## 3. 场景与功能建设表

“新增／调整”描述目标功能；“Demo 现状”说明已有演示；最后一列列出生产接入工作。

| 场景 ID | 场景与触发 | 需要新增／调整的功能 | 页面结果／关键校验 | Demo 现状 | 后续生产接入 | 优先级 |
| --- | --- | --- | --- | --- | --- | --- |
| S01 | 新建任务选择 MoonClaw | 按智能体分配首页；判定画像状态 | 未完成进入收集，已完成进入首页；其他智能体不被覆盖 | 已有主智能体分流 | 智能体与工作台模板配置 | P0 |
| S02 | 新用户首次进入 | 独立画像面板、分步状态 | 不出现底部聊天输入框；未确认不能进入个性化首页 | 已有 | 账号画像查询与草稿存储 | P0 |
| S03 | 筹备开店 | 目标平台多选、市场、经营类型、热门标签 | 必填校验；不强制主营类目 | 已有 | 平台及热门配置管理 | P0 |
| S04 | 已经开店／规模运营 | 现有经营信息与主营类目字段 | 主营类目必填；其他字段按规则校验 | 已有 | 类目字典与画像接口 | P0 |
| S05 | 经营阶段选择其他 | 直接新建会话 | 不进入第二步表单，不展示首页聊天面板 | 已有独立会话演示 | 会话创建与来源记录 | P0 |
| S06 | 不知道平台／市场怎么选 | 咨询入口、草稿携带、返回补全 | 进入独立会话；模型建议需用户确认后才写正式画像 | 已有入口与草稿；不自动采纳模型建议 | 结构化建议回填、确认写入 | P0／P1 |
| S07 | 确认画像 | 保存、版本更新、切换首页 | 所有条件必填通过；首页保持 MasterGo 结构 | 本地保存已有 | 服务端保存与多端一致性 | P0 |
| S08 | 有匹配专家 | 平台—智能体映射、专家卡片、对话按钮 | 只展示匹配且实际可用的专家 | 静态目录匹配已有 | 查询真实目录、启用状态和权限 | P0 |
| S09 | 无匹配专家 | 空态与通用对话入口 | 不伪造该平台专属专家 | 已有 | 真实能力状态判断 | P0 |
| S10 | 点击专家／案例／咨询快捷入口 | 复用会话过程页、绑定上下文 | 新会话可在列表找到；首页不内嵌模拟聊天面板 | 已有本地会话与演示回复 | 真实会话持久化与运行服务 | P0 |
| S11 | 修改画像 | 回填、取消、重新确认 | 取消不覆盖旧值；确认后刷新推荐 | 已有 | 乐观版本校验、变更记录 | P0／P1 |
| S12 | 模拟新用户 | 清空 Demo 画像、重新收集 | 不删除商品、店铺、连接器或历史会话 | 已有 | 仅测试环境保留入口 | P0 |
| S13 | 商品池刊登 | 多选商品及 SKU、带入刊登 | 至少一个 SKU；回退保留选择 | 已有 | 商品池读取、权限与有效性验证 | P0 |
| S14 | 西之月 SKU／链接刊登 | 输入解析、商品核对与规格选择 | 不存在或资料缺失时提示；不能直接当真实商品成功 | 占位商品演示 | 西之月货品查询与规格解析 | P0／P1 |
| S15 | 外部商品链接刊登 | 链接输入、解析、商品确认 | URL 格式有效；解析失败可改链接，不丢失其他项 | 格式校验与占位演示 | 合法来源解析、图片与 SKU 提取 | P0／P1 |
| S16 | 商品维护在外部系统 | 先问系统位置，展示对应连接方案 | 不固定为领星；其他系统允许填写名称 | 已有 | 连接器目录、系统能力识别 | P0 |
| S17 | ERP 尚未连接 | 跳能力市场 → 连接器 → 配置项目 | 返回刊登后保留商品来源与配置 | 本地连接页模拟该路径 | 真实连接器路由、回跳参数及授权 | P0／P1 |
| S18 | ERP 连接有疑问 | “如何连接我的某 ERP”会话入口 | 系统名称与刊登上下文带入新会话 | 已有 | 对应连接教程及可用工具 | P0／P1 |
| S19 | ERP 已连接／失效 | 商品读取、重连、状态反馈 | 仅可用连接进入选择；失效需恢复连接 | 已连接状态与模拟商品已有；失效未完整模拟 | 连接检查、分页读取及失效处理 | P0／P1 |
| S20 | 没有已授权店铺 | 支持平台列表、授权、返回 | 仅显示真实支持连接的平台；返回继续当前刊登 | 可添加模拟店铺 | 平台授权及店铺同步 | P0／P1 |
| S21 | 已有店铺 | 平台＋类型分组、具体店铺选择 | 当前用户有权限；站点信息可辨认；可连接新店铺 | 本地平铺选择已有，完整分组待补 | 店铺目录、分组和权限 | P0 |
| S22 | 设置刊登参数 | 发布方式、折叠高级项、SKU 覆盖 | 按平台与店铺能力显示；库存与价格校验 | 通用参数演示已有，尚未动态适配 | 能力配置 schema、平台校验 | P0／P1 |
| S23 | 核对及创建任务 | 摘要、配置快照、任务结果 | 展示来源、店铺、SKU、统一项和例外；区分演示与真实执行 | 已有模拟结果 | 幂等创建、运行状态、失败原因和结果链接 | P0／P1 |
| S24 | 维护商品池 | 新增、编辑、搜索、CSV 导入、模板 | 必填、数值、重复 SKU 校验；选择商品刊登 | 单行 SKU、整批 CSV 导入已有 | 商品库持久化、SPU／SKU、分批错误反馈 | P0／P1 |
| S25 | 连接、解析或执行中断 | 草稿恢复与明确反馈 | 不清空已填内容；不将失败或部分成功显示成全成功 | 部分回退保留已有；完整中断恢复未实现 | 持久化草稿、重试与任务查询 | P1 |

## 4. 用户画像字段设计

本节及后续数据字典是建议的业务字段设计。字段名用于约定接口与存储语义，不要求直接替换当前 Demo 的 TypeScript 字段。

### 4.1 设计原则

- 画像描述卖家经营情况，不保存店铺令牌、ERP 密钥或实时经营指标。
- 筹备和经营用户共用平台、市场、经营类型字段，界面按阶段切换“目标／现有”文案；首期不维护两套易冲突字段。
- 展示标签与稳定代码分开保存；平台改名不改变已有记录的语义。
- 画像草稿与已确认画像分开；只有用户确认的值参与正式推荐。
- “其他”是一条允许自由咨询的分流，不要求补完电商字段，也不伪装成经营阶段明确的卖家。
- 首期建议按账号保存一份主画像；若后续一个团队管理多个经营主体，再扩展主体画像。归属范围需在生产评审确认。

### 4.2 画像核心数据字典：`seller_profile`

条件必填指点击“确认画像”时必填；草稿允许暂缺。

| 字段 | 中文名称 | 建议类型 | 必填条件／默认值 | 取值与校验 | 使用场景 |
| --- | --- | --- | --- | --- | --- |
| `id` | 画像 ID | UUID | 系统生成 | 唯一、不可由用户编辑 | 查询、修改、会话关联 |
| `owner_user_id` | 所属用户 ID | UUID | 系统写入 | 复用现有账号 ID；服务端按当前账号判定 | 账号隔离 |
| `stage_code` | 经营阶段 | enum / null | 首次分流选择；初始 null | `preparing`、`operating`、`scaling`、`other` | 表单分流与上下文 |
| `platform_codes` | 目标／经营平台 | string[] | 前三种阶段至少 1 项；默认 [] | 去重，必须来自平台字典；允许多选 | 专家匹配 |
| `market_codes` | 目标／经营市场 | string[] | 前三种阶段至少 1 项；默认 [] | 使用市场字典代码，区分区域与国家 | 市场上下文与后续排序 |
| `business_model_code` | 经营类型 | enum / null | 前三种阶段必选；初始 null | `premium` 精品、`curated` 精铺、`mass_listing` 铺货、`undecided` 还不确定 | 引导与经营策略 |
| `primary_category_codes` | 主营类目 | string[] | operating／scaling 至少 1 项；preparing 可选 | 建议结构化类目，可多选；这是对当前自由文本输入的升级建议 | 类目上下文 |
| `category_other_text` | 其他类目说明 | string / null | 类目选择 other 时必填 | 建议 1–100 字；不作为类目 ID | 覆盖字典外类目 |
| `collection_status` | 收集状态 | enum | 默认 `not_started` | `not_started`、`in_progress`、`completed`、`deferred` | 判断进入收集页还是首页 |
| `schema_version` | 字段结构版本 | integer | 系统维护；首版 1 | 字段结构变化时升级，不等于用户每次修改版本 | 数据兼容 |
| `revision` | 画像修改版本 | integer | 默认 0 | 每次确认保存递增；提交修改需匹配旧版本 | 防止多端覆盖、会话快照 |
| `confirmed_at` | 最近确认时间 | datetime / null | completed 时写入 | 未确认草稿为 null | 判断正式画像 |
| `created_at` / `updated_at` | 创建／修改时间 | datetime | 系统写入 | 服务端统一时间，界面按用户时区显示 | 审计与同步 |

类型与产品选择建议：经营类型首期单选，与当前 Demo 一致；主营类目建议支持多选，但需确认后再升级界面。预算、团队人数、GMV、员工数、店铺数量不作为首次画像必填项。

### 4.3 条件必填与特殊取值

| 情况 | 数据规则 | 页面行为 |
| --- | --- | --- |
| 筹备开店 | stage=preparing；平台、市场、经营类型完整即可 | 不要求主营类目；保留选择咨询入口 |
| 已经开店 | stage=operating；平台、市场、经营类型、主营类目完整 | 校验通过才能确认 |
| 规模运营 | stage=scaling；同已经开店 | 不因为选择规模运营就推断具体 GMV 或店铺数量 |
| 其他 | stage=other；status=deferred，其他字段可以为空 | 直接新建会话；不进入个性化电商首页 |
| 经营类型不确定 | business_model_code=undecided | 视为明确选择，不等于漏填；会话可继续帮助判断 |
| 未选择经营类型 | business_model_code=null | 确认时提示缺项 |
| 存在画像草稿 | status=in_progress | 恢复已填字段，不等于正式画像完成 |
| 模型给出画像建议 | 只写待确认建议／草稿 | 用户确认后才更新正式画像 |
| 修改后取消 | 正式画像保持旧 revision | 回到原首页与原推荐 |

### 4.4 画像草稿：`seller_profile_draft`

| 字段 | 类型 | 规则 |
| --- | --- | --- |
| `id`、`owner_user_id` | UUID | 草稿身份与归属 |
| `base_profile_revision` | integer / null | 修改已有画像时记录基准版本 |
| `values` | object | 与核心业务字段同结构，但允许缺项；不包含授权凭据 |
| `current_step` | enum | `stage`、`business_details` |
| `source` | enum | `form`、`conversation`；会话建议仍需确认 |
| `source_session_id` | string / null | 从咨询会话生成草稿时关联会话 |
| `updated_at` | datetime | 用于恢复最近编辑状态 |

### 4.5 画像扩展字段：不在首次强制收集

| 建议字段 | 类型 | 建议收集时机 | 用途 |
| --- | --- | --- | --- |
| `current_goal_codes` | string[] | 首次选择快捷功能或咨询时 | 找产品、开店、上新、经营诊断等需求优先级 |
| `supply_source_code` | enum | 选品或刊登时 | 自有货品、西之月、外部采购等来源偏好 |
| `preferred_product_system` | string / null | 选择外部系统商品时 | 记住商品维护位置；不代表已经授权 |
| `preferred_language` | string / null | 复用账号设置，或生成内容前确认 | 内容语言；不由市场自动推断为唯一语言 |
| `budget_amount` / `budget_currency` | decimal / ISO currency | 筹备咨询确有需要时 | 入局建议；不从“规模运营”推断预算 |

## 5. 基础字典与能力映射

### 5.1 平台字典：`commerce_platform`

下表整理用户提出的平台范围，只证明可作为画像候选；不代表均有可用专家、连接器或刊登接口。

| 建议代码 | 展示名称 | 别名／说明 |
| --- | --- | --- |
| `tiktok_shop` | TikTok Shop | tk；与现有目录中的 TikTok 自运营店铺管家映射 |
| `temu` | Temu | — |
| `wildberries` | Wildberries | WB |
| `ozon` | Ozon | — |
| `yandex` | Yandex | 具体业务产品范围待确认 |
| `shopee` | Shopee | — |
| `lazada` | Lazada | — |
| `1688` | 1688 | 用户范围包含该平台，不因跨境定位而删除 |
| `aliexpress` | 速卖通 | AliExpress |
| `shein` | SHEIN | — |
| `mercado_libre` | 美客多 | Mercado Libre |
| `amazon` | 亚马逊 | Amazon |
| `shopify` | Shopify | 独立站平台 |
| `joom` | Joom | — |
| `qoo10` | Qoo10 | — |
| `amag` | amag | 保留用户原文；正式名称、别名和覆盖范围待确认，不擅自更名 |

平台配置字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `code`、`display_name`、`aliases` | string、string、string[] | 稳定标识、名称和搜索别名 |
| `profile_selectable` | boolean | 是否允许用于画像；不代表业务工具已支持 |
| `connector_ids` | string[] | 对应连接器目录 ID；空数组表示尚无映射 |
| `store_type_codes` | string[] | 平台支持的店铺类型字典；不能跨平台直接复用所有选项 |
| `is_hot`、`hot_label` | boolean、string / null | 产品配置的热门标记 |
| `hot_market_codes` | string[] | 热门标识的适用市场；为空时为通用配置 |
| `sort_order`、`enabled` | integer、boolean | 展示排序与启用状态 |

### 5.2 市场、经营类型与类目字典

| 字典 | 核心字段 | 初始取值／约束 |
| --- | --- | --- |
| `market` | code、name、level、parent_code、enabled | level=region／country；区域如 `region:sea`、`region:north_america`、`region:europe`、`region:russia_cis`、`region:latin_america`、`region:middle_east`、`region:japan_korea`；国家如 `country:CN`、`country:ID` |
| `business_model` | code、name、description、sort_order | premium 精品、curated 精铺、mass_listing 铺货、undecided 还不确定；文案提供简短解释 |
| `seller_category` | code、name、parent_code、enabled | 建议统一经营类目树；首期可由运营维护。不是某平台刊登类目的直接替代 |
| `platform_store_type` | code、platform_code、name、locality、management_mode | 如本土自运营、跨境自运营、半托管等实际平台类型，由平台配置限定 |

选择“东南亚”不会自动选择印尼店铺，也不自动表示用户经营所有东南亚国家；刊登时仍需选择明确站点和店铺。

### 5.3 现有专家映射参考

以下来自当前项目的官方专家预设与 Demo 目录；生产环境须实时验证账号可见性、启用状态和资源是否存在。

| 平台代码 | 当前专家名称 | 当前预设 ID |
| --- | --- | --- |
| amazon | 亚马逊选品专员 | official-amazon |
| shopee | Shopee 本土店铺运营管家 | official-shopee |
| temu | Temu 半托店铺运营管家 | official-temu |
| lazada | Lazada 店铺运营管家 | official-lazada |
| shein | Shein 半托店铺运营管家 | official-shein |
| tiktok_shop | TikTok 自运营店铺管家 | official-tiktok |
| wildberries | Wildberries 店铺运营管家 | official-wildberries |
| 1688 | 1688 店铺运营管家 | official-1688 |
| aliexpress | Aliexpress 店铺运营管家 | official-aliexpress |

Ozon、Yandex、美客多、Shopify、Joom、Qoo10、amag 在当前这组官方预设中没有专属专家映射；不能因此推断整个平台绝无其他资源。

### 5.4 能力定义与推荐规则数据字典

| 对象 | 字段 | 类型 | 说明 |
| --- | --- | --- | --- |
| `workbench_template` | agent_id、template_code、enabled | string、string、boolean | 智能体对应的工作台模板；MoonClaw 使用 seller_workbench |
| `capability` | code、name、entry_type | string、string、enum | 稳定能力 ID；入口为 conversation／listing／products／connector |
| `capability` | supported_platform_codes、supported_store_type_codes | string[] | 真实能力适用范围；不是画像候选范围 |
| `capability` | availability | enum | demo／available／unavailable；展示、连接和执行不可混为一种“支持” |
| `capability` | required_resources | object[] | 所需商品、店铺、连接器等依赖及缺失时引导 |
| `agent_platform_mapping` | agent_id、platform_code、enabled | string、string、boolean | 平台与专家的多对多映射 |
| `recommendation_rule` | match、target_ids、priority、enabled | object、string[]、integer、boolean | 匹配条件、推荐对象、排序与开关；类目／市场排序为后续建议 |
| `recommendation_result` | profile_revision、items、generated_at | integer、object[]、datetime | 记录基于哪个版本推荐；items 含目标 ID、原因、可用状态 |

## 6. 商品管理数据字典

### 6.1 对象划分

| 对象 | 含义 | 与刊登的关系 |
| --- | --- | --- |
| 商品 SPU：`product` | 一组规格共用的基础商品资料 | 一个商品可以被多次刊登到不同店铺 |
| 商品 SKU：`product_sku` | 具体颜色、尺寸等规格及对应价格、库存 | 刊登实际选择的最小规格单位 |
| 来源映射：`product_source_mapping` | 本地商品与西之月、链接、ERP 商品的对应关系 | 允许追溯来源，避免跨系统同名 SKU 混淆 |
| 导入批次：`product_import_batch` | 一次文件导入及逐行处理结果 | 便于提示错误和重新处理 |

当前 Demo 一行代表一个商品 SKU，尚未实现完整 SPU／SKU 层级；下面是生产建模建议。

### 6.2 商品与 SKU 字段

| 对象 | 字段 | 类型 | 必填／校验 | 说明 |
| --- | --- | --- | --- | --- |
| product | id、owner_user_id | UUID | 系统写入 | 商品身份与归属 |
| product | title | string | 必填，建议 1–200 字 | 基础标题，不绑定某平台语言 |
| product | category_code | string / null | 按商品管理要求选填 | 经营类目；刊登平台类目另行映射 |
| product | description | string / null | 可选 | 基础描述 |
| product | images、videos | asset reference[] | 可选；真实刊登依平台要求校验 | 使用平台文件／资源引用，不将临时链接当永久文件 |
| product | source_type | enum | 必填 | manual／file_import／westmoon／external_link／external_system |
| product | status | enum | 默认 draft | draft／active／archived；归档不删除既有刊登快照 |
| product | revision | integer | 修改时递增 | 刊登任务记录使用的商品版本 |
| product_sku | id、product_id | UUID | 系统写入／有效关联 | 一个商品包含一个或多个 SKU |
| product_sku | sku_code | string | 必填，建议 1–100 字 | 同账号管理范围内建议唯一；外部来源另有独立标识 |
| product_sku | attributes | object | 单规格可为空 | 如颜色、尺寸；不把全部规格塞进商品名称 |
| product_sku | reference_price | decimal / null | 非负数 | 商品基础参考价，不是所有目标店铺最终售价 |
| product_sku | currency | ISO currency / null | 有价格时应明确 | 生产必须明确币种；当前 Demo 的价格尚未区分币种 |
| product_sku | stock_quantity | integer / null | 非负整数 | 0 表示无库存；null 表示未维护／未知，不可混同 |
| product_sku | weight、dimensions | structured object / null | 平台需要时必填 | 数值需与单位共同保存 |
| source_mapping | source_system、connection_id | string、UUID / null | 依来源判定 | 如西之月或某 ERP 项目 |
| source_mapping | external_product_id、external_sku_id、source_url | string / null | 至少有可追溯来源 | 外部 ID 与平台本地 ID 分开 |
| source_mapping | last_synced_at、sync_status | datetime / null、enum | 系统写入 | 未同步／成功／失败；不宣称当前示例已同步 |

商品资料与刊登配置分开维护：为某店修改标题、价格或图片，不应默认覆盖商品池的基础资料。

### 6.3 导入规则与批次字段

| 字段／规则 | 建议设计 | 当前 Demo 差异 |
| --- | --- | --- |
| 最小导入列 | name、sku、price、stock；生产增加 currency 或批次明确币种 | 已支持前四列和 CSV 模板，未明确币种 |
| 文件范围 | 首期 CSV；文件大小与最大行数需评审后配置 | 已支持 CSV，生产上限待定 |
| `batch_id`、`owner_user_id` | 导入批次及归属 | 当前无持久化批次 |
| `total_count`、`success_count`、`failed_count` | 数量统计 | 当前成功后显示导入数量 |
| `row_errors` | 行号、字段、错误码、错误原因 | 当前报首个错误，未提供完整错误文件 |
| 重复处理 | 默认提示重复；覆盖／跳过策略需明确选择 | 当前发现重复 SKU 拒绝该批次 |
| 资料维护 | 支持新增、编辑、搜索、选择刊登 | 已有；批量编辑为后续增强 |

## 7. 连接器与店铺数据字典

### 7.1 外部商品系统连接：`connector_connection`

| 字段 | 类型 | 必填／规则 | 说明 |
| --- | --- | --- | --- |
| id、owner_user_id | UUID | 系统写入 | 项目身份及归属 |
| connector_id | string | 必填，引用连接器目录 | 实际工具类型，不以“领星”字符串代替项目 ID |
| system_name | string | 必填 | 领星、店小秘、马帮或其他系统名称 |
| project_name | string | 必填 | 用户自定义项目名；与系统名分开 |
| status | enum | 默认 disconnected | disconnected／connecting／connected／expired／error／disabled |
| capability_codes | string[] | 系统根据实际工具返回 | 例如读取商品；连接成功不代表有发布权限 |
| credential_ref | secret reference / null | 真实接入时由凭据服务维护 | 不放入画像、普通会话上下文或前端本地存储 |
| last_checked_at、last_synced_at | datetime / null | 系统写入 | 分别表示连接检查与商品同步时间 |
| error_code、error_message | string / null | 失败时填写 | 面向用户说明恢复方式，不回显密钥 |

### 7.2 店铺：`commerce_shop`

| 字段 | 类型 | 必填／规则 | 说明 |
| --- | --- | --- | --- |
| id、owner_user_id | UUID | 系统写入 | 店铺身份及账号隔离 |
| platform_code | string | 必填，平台字典有效 | 决定平台能力与分组 |
| external_shop_id | string | 真实连接后必填 | 平台侧店铺标识，不使用展示名称作为唯一键 |
| shop_name | string | 必填 | 用于选择与摘要 |
| site_code、country_code | string / null | 平台有站点时必填 | 如明确国家站点；不能只填泛区域 |
| store_type_code | string / null | 按平台要求 | 页面一级分组使用的实际平台店铺类型 |
| locality | enum / null | 有对应概念时填写 | local 本土／cross_border 跨境 |
| management_mode | enum / null | 有对应概念时填写 | self_managed 自运营／semi_managed 半托管／fully_managed 全托管 |
| auth_status | enum | 必填 | unconnected／authorizing／authorized／expired／revoked／error |
| connection_id | UUID / null | 来自连接项目时引用 | 可追溯授权来源 |
| publish_capability | enum | 系统检测 | demo／supported／unsupported／unknown |
| default_currency、default_language | string / null | 平台返回或用户配置 | 刊登默认配置，允许按任务核对 |
| authorized_at、expires_at | datetime / null | 授权结果决定 | 不能仅凭画像推断授权有效 |

**概念区别：** 精品／精铺／铺货属于卖家的经营策略；本土／跨境属于店铺地域属性；自运营／半托管／全托管属于运营管理模式。当前 Demo 将部分店铺选项放在同一选择器中仅用于演示，生产应通过平台店铺类型配置组合，避免把“本土店”和“半托管”当成必然互斥的属性。

### 7.3 跨页返回上下文

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `origin` | enum | workbench／listing／products，确定返回位置 |
| `draft_id` | UUID / null | 定位尚未完成的刊登草稿 |
| `source_type` | enum / null | 返回时恢复商品来源 |
| `selected_item_refs` | object[] | 恢复已选商品与 SKU |
| `return_step` | enum | source／shop_config／review |

生产回跳使用项目内可识别的目的地和草稿 ID，不直接信任任意外部返回 URL。

## 8. 刊登任务与配置数据字典

### 8.1 标准流程

选择来源 → 选择／核对商品与 SKU → 选择目标平台、类型和店铺 → 基础配置 → 按需展开更多配置 → 核对任务 → 创建任务 → 查看结果。

首期建议一轮任务选择一个目标店铺，可包含多个 SKU；多店批量投放为待确认扩展，不把已有多店资源默认全部选中。当前 Demo 的 10 项上限只对 SKU／链接输入分支生效；生产应统一各来源的上限，具体阈值待确认。

### 8.2 任务主表：`listing_task`

| 字段 | 类型 | 必填／校验 | 说明 |
| --- | --- | --- | --- |
| id、owner_user_id | UUID | 系统生成 | 任务身份与归属 |
| execution_mode | enum | demo／live | 演示成功不能写成真实发布成功 |
| source_type | enum | product_pool／westmoon／external_link／external_system | 本轮商品来源 |
| source_connection_id | UUID / null | 外部系统来源必需 | 指向已连接且具备商品读取权限的项目 |
| target_shop_id | UUID | 提交前必填 | 有权限、授权有效、真实能力可用 |
| profile_revision | integer / null | 系统记录 | 发起时的画像版本，仅作为上下文 |
| status | enum | 系统维护 | draft／validating／needs_input／ready／running／partial_success／succeeded／failed／cancelled |
| batch_config | object | 核对后冻结 | 批次统一配置，字段见下表 |
| request_key | string | 同一提交重试复用 | 防重复创建真实任务；Demo 当前未接入生产幂等 |
| session_id、run_id | string / null | 创建运行后关联 | 任务与独立执行会话／运行记录的关系 |
| created_at、submitted_at、finished_at | datetime / null | 系统写入 | 区分草稿、提交与完成时间 |

### 8.3 批次配置：`batch_config`

| 字段 | 类型 | 默认／校验 | 说明与 Demo 差异 |
| --- | --- | --- | --- |
| publish_mode | enum | 建议默认 draft | draft 未上架／publish 正常发布；与店铺真实支持范围核对 |
| ai_title_enabled | boolean | Demo 默认 true | 开启生成标题；关闭时沿用可用来源内容，缺失需提示 |
| ai_images_enabled | boolean | Demo 默认 true | 开启图片处理；图片张数、语言与类型由平台策略决定，不一律固定 9 张 |
| ai_description_enabled | boolean | Demo 默认 true | 描述结构与语言按目标平台和市场适配 |
| upload_video_enabled | boolean | Demo 默认 true | 无视频素材时给出跳过结果，不伪造上传成功 |
| auto_category_attributes | boolean | 当前参考方案固定 true | 逐 SKU 匹配平台类目和属性；生成后仍需核对 |
| missing_qualification_policy | enum | 建议默认 require_input | require_input 提示补充／use_verified_asset 使用已核验资料；不能凭空编造证书或注册号 |
| preorder_enabled | boolean | 默认 false | 按店铺和类目验证是否支持 |
| preorder_days | integer / null | 开启且平台要求时必填 | 范围由平台规则决定；Demo 尚未提供天数字段 |
| content_language | string / null | 由目标店铺推导并允许核对 | 不只凭画像区域猜测语言 |
| platform_schema_version | string / null | 系统记录 | 记录本轮使用的平台配置规则版本 |

### 8.4 任务商品：`listing_task_item`

| 字段 | 类型 | 规则 |
| --- | --- | --- |
| id、task_id | UUID | 一个任务包含多个任务商品／规格项 |
| product_id、sku_id | UUID / null | 本地商品池引用；外部来源解析后也应建立明确引用 |
| source_ref | object | 外部系统、商品 ID、SKU ID 或来源链接 |
| source_snapshot | object | 提交时冻结来源商品版本及选定资料，避免后续商品编辑改变已提交任务 |
| overrides | object | 仅包含主动覆盖字段；未填写表示继承批次或商品默认值 |
| overrides.title | string | 指定标题，按目标平台长度等要求校验 |
| overrides.price、overrides.currency | decimal、string | 非负价格与明确币种；0 与未填写不混同 |
| overrides.stock | integer | 非负整数；0 有明确业务含义 |
| overrides.bundle_items | object[] | 多件装／组合装建议结构化为 sku_id＋quantity；quantity 为正整数，不只保存一段自由文本 |
| status | enum | pending／running／needs_input／succeeded／failed／skipped |
| external_listing_id、result_url | string / null | 真实平台返回的结果，不为 Demo 编造真实链接 |
| error_code、error_message | string / null | 逐项错误原因；支持区分整批失败与部分成功 |

### 8.5 结果展示与恢复规则

| 情况 | 必须呈现的结果 |
| --- | --- |
| 模拟任务完成 | 明确是演示结果，未连接真实店铺，未执行真实发布 |
| 真实保存未上架 | 目标店铺、商品范围、草稿结果；不称为已正式上架 |
| 部分 SKU 失败 | 成功数、失败数、各项原因；不把整批标记为全成功 |
| 连接失效 | 保留草稿，引导重新连接；完成后返回原步骤 |
| 必填属性／资质缺失 | 标记需补充，提供对应字段；不自动伪造缺失资料 |
| 重复点击提交 | 同一 request_key 返回同一任务，不重复发布 |
| 返回修改 | 保留已选商品与配置；修改后重新核对 |

## 9. 会话来源与上下文数据字典

### 9.1 会话进入方式

| 入口 | 会话标题建议 | 必须携带的上下文 | 页面要求 |
| --- | --- | --- | --- |
| 经营阶段其他／直接开始对话 | 新的经营会话 | entry=other；已有草稿可选携带，不强制补全 | 新建独立会话，进入过程页，支持继续输入 |
| 选择咨询指引 | 开店选择指引 | 画像草稿、待帮助选择的字段、草稿 ID | 不在首页内追加聊天面板 |
| 匹配专家卡片 | 目标专家名称 | 专家 ID、已确认画像、发起意图 | 会话显示正确专家身份 |
| 首页输入框 | 用户需求生成的标题 | 用户输入、画像版本、主动选择的资料 | 将发起内容带入新会话 |
| ERP 连接咨询 | 连接商品系统 | 系统名称、来源、刊登草稿 ID | 可返回连接或刊登流程 |
| 案例与咨询类快捷功能 | 对应案例或功能名称 | 模板意图、画像；不包含虚构实绩 | 独立会话，示例与真实数据有明确区分 |

### 9.2 建议字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| session_id、owner_user_id | existing ID | 复用平台会话对象，不另建首页聊天数据体系 |
| agent_id | string | 精确绑定实际可用智能体；无专属专家时使用 MoonClaw |
| entry_code | enum | other／profile_guidance／expert／home_prompt／capability／case／connector_help |
| execution_mode | enum | demo／live；当前实现使用 Session.demo 布尔标记，生产可统一命名 |
| profile_snapshot | object / null | 用户确认的必要字段和 revision；不包含连接凭据 |
| draft_profile_id、listing_draft_id | ID / null | 咨询与刊登恢复需要时关联 |
| capability_code、case_id | string / null | 对应功能或案例入口 |
| initial_prompt | string / null | 用户输入或清晰标注的入口模板内容 |
| attachment_refs | asset reference[] | 用户主动选择并实际可用的资料；Demo 当前只记录首页附件文件名，不等于文件已上传 |
| return_destination | enum / null | workbench／profile／listing／connector，支持继续原流程 |

画像是会话上下文，不是权限凭据。真实会话续聊仍应遵循平台认证与模型配置；Demo 可以用本地回复演示流程，但不能宣称已调用后台或获取经营数据。

## 10. 实施拆分与 Demo 差距

| 模块 | 当前前端 Demo | 生产目标／新增工作 | 是否需要新增后台能力 |
| --- | --- | --- | --- |
| 画像 | 本地保存、草稿、条件字段、新用户重置 | 正式字段模型、账号存储、多端一致性、版本校验 | 是 |
| 首页 | MasterGo 视觉结构、快捷入口、匹配专家、案例 | 对接真实智能体目录与能力状态；运营配置化 | 接入现有目录并补配置 |
| 对话 | 复用正常会话页，本地创建与回复 | 持久化、真实运行、准确的专家绑定与恢复上下文 | 复用并扩展现有会话服务 |
| 商品管理 | 示例 SKU、新增、编辑、搜索、CSV 导入 | SPU／SKU 商品库、币种、资源文件、来源映射、导入批次 | 是 |
| ERP | 选择系统、配置项目、模拟连接返回 | 连接器目录、真实授权、连接检查、商品读取 | 需连接器能力与接口 |
| 店铺 | 模拟添加及平铺选择 | 真实授权、站点、平台类型分组、有效性和权限 | 是／复用连接基础设施 |
| 刊登 | 四类来源、配置、摘要、模拟任务 | 来源解析、动态 schema、真实校验、幂等任务、逐项结果 | 是 |
| 热门平台 | 固定示例标签 | 可维护的热门配置与适用市场 | 建议运营配置接口 |
| 桌面端／积分优惠 | 设计展示与演示提示 | 另立下载、计费与优惠需求 | 不纳入本轮经营工作台验收 |

## 11. 验收清单

| 编号 | 验收场景 | 通过标准 |
| --- | --- | --- |
| A01 | 未确认画像进入 MoonClaw | 只显示收集面板，无首页主输入框和底部聊天框 |
| A02 | 筹备开店 | 平台可多选，市场、经营类型必选，主营类目不强制 |
| A03 | 已经开店／规模运营 | 平台、市场、经营类型、主营类目缺任一项不可确认 |
| A04 | 选择其他 | 直接生成独立会话，列表可找到；不进入画像第二步或首页内聊天 |
| A05 | 咨询后补全 | 会话带入已填信息，返回后草稿可恢复；未确认建议不写正式画像 |
| A06 | 画像确认 | 进入参考设计结构的首页，且实际推荐与所选平台一致 |
| A07 | 无匹配专家 | 显示空态与通用入口，不出现伪造匹配结果 |
| A08 | 专家／案例对话 | 新建会话进入过程页，身份和上下文正确，可继续输入 |
| A09 | 修改／取消画像 | 修改后更新匹配；取消保留原值和原匹配 |
| A10 | 模拟新用户 | 回到空白收集面板，商品等其他资产未删除 |
| A11 | 四种商品来源 | 每种均可进入对应分支；占位解析不能表述成真实商品已读取 |
| A12 | 外部系统连接 | 先问维护系统；未连接可去配置／咨询；返回不丢失草稿 |
| A13 | 店铺状态 | 无授权可连接，有授权可选，失效有恢复路径；生产需验证权限 |
| A14 | 刊登配置 | 基础项可见，高级项默认收起，SKU 覆盖在摘要中准确呈现 |
| A15 | 商品管理 | 可新增编辑，CSV 错误与重复有反馈，所选 SKU 能进入刊登 |
| A16 | 执行结果 | 演示与真实清晰区分；生产需覆盖全成功、部分成功、失败和需补充 |
| A17 | 切换智能体 | 其他智能体保持各自工作台；MoonClaw 不覆盖所有智能体首页 |

## 12. 待确认决策

| 决策项 | 本文建议 | 原因／影响 |
| --- | --- | --- |
| 画像归属 | 首期每账号一份主画像 | 若实际面向团队多主体，需改为主体画像并增加切换 |
| 主营类目 | 结构化类目多选，允许其他说明 | 当前 Demo 是自由文本；需产品确认类目字典粒度 |
| 经营类型 | 首期画像单选 | 同一用户不同平台策略不同的场景后续再支持，不直接扩展首屏复杂度 |
| 市场粒度 | 首屏区域选择，任务前明确国家／站点 | 当前 Demo 以区域为主，无法直接代表某个刊登站点 |
| amag 与 Yandex | 保留原名，确认正式产品范围 | 避免错误平台映射 |
| 热门标签 | 按市场可维护配置 | 未确认数据来源前不宣称实时热门排名 |
| 一轮刊登范围 | 一个目标店铺、多个 SKU | 多店批量发品涉及目标差异和任务拆分，需另行确认 |
| 批次上限 | 统一各来源上限，阈值待定 | 当前 Demo 的 10 项不是所有来源统一限制 |
| 导入重复策略 | 默认报错；覆盖／跳过需显式选择 | 避免意外覆盖商品资料 |
| 商品同步关系 | 显式定义来源、同步方向和冲突规则 | 不默认连接 ERP 后自动双向同步或自动覆盖商品池 |
| 咨询结果回填 | 结构化建议＋用户确认 | 当前 Demo 仅保留草稿，不自动抽取对话结论 |
| 实际刊登能力清单 | 逐平台、店铺类型、市场确认 | 画像可选平台和现有专家目录均不能替代执行支持清单 |

## 13. 参考与现状依据

- 需求依据：本聊天中确认的用户动线、画像字段、独立会话分流及商品管理要求；以用户后续修正为准。
- [MasterGo 首页参考](https://mastergo.com/goto/X2K4W1zc?page_id=1:91840&layer_id=1:015553&file=207655792930144)：画像确认后的视觉结构。
- [Shopee 刊登配置参考](https://pages.chiu.top/shopee-listing/)：批次设置和 SKU 例外配置的参考；其原始页面限制不自动扩展为所有平台通用规则。
- 当前 Demo：[画像及刊登组件](../../app/moonclaw/MoonClawWorkbench.tsx)、[个性化首页](../../app/moonclaw/MoonClawHome.tsx)、[工作台及会话衔接](../../app/AgentWorkbench.tsx)。
- 当前目录依据：[官方专家预设](../../service/agent_catalog.py)。本文未执行真实平台授权或经营能力验证。

## 14. 2026-10-23 补充：持续画像与核心文件方案

详见 [用户画像持续更新与智能体核心文件设计](./moonclaw-profile-lifecycle.md)。

本次补充提出以下评审建议，尚未替换前文已确认口径或修改 Demo 实现：

- “已经开店”建议改为“起步经营”，配文“已开店，正在小规模试水”。
- “随便看看／其他”作为跳过收集的动作，与实际经营阶段分开。
- 数据库作为画像主数据；每用户 USER.md 作为可生成的数据摘要；共享 user.md 继续负责画像规则。
- 表单、会话和店铺授权事件使用同一画像更新入口，保留字段来源、业务范围、版本和变化事件。
- 多平台可以处在不同阶段；新增 TikTok 筹备意向不能覆盖原有 Amazon 的规模运营状态。
- 授权先更新店铺连接事实；经营阶段需有明确声明或受控业务证据，不能将授权直接等同为规模运营。
- 既有三份核心规则继续分工；建议增加业务引导规则，并由程序刷新每轮最新画像和变化摘要。

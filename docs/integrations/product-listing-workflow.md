# 商品库刊登清单接入边界

本次经确认仅实现前端状态和交互。`product-listing-service.ts` 的默认适配器使用定时进度及本地回执，不调用 AI、ERP 或市场刊登 API。不得将本地测试结果解释为真实商品已上架。

## UI 和数据归属

- 全部：原商品库，仍为 SPU → SKU；认领和刊登不移除原商品。
- 待刊登／已刊登：每行唯一键为 `(productId, skuId, shopId)`，无子级。
- 认领创建预刊登任务；多店铺彼此独立，同一 SKU／店铺去重。
- 详情移除准备刊登入口；查看刊登信息打开平台智能体对话，绑定任务、SKU 和店铺。
- 直接刊登和对话刊登共用 `publish()`，共用成功回执校验和列表归属。
- `products.status`、`products.claim_status` 和 `products_sku.claim_status` 不承载刊登流程；任务独立保存于当前账号的 IndexedDB 工作区 `listingTasks`。

## 真实服务适配器

通过 `configureProductListingAdapter()` 替换默认适配器，实现 `ProductListingAdapter`：

1. `prepare(task, source, onProgress, signal)`：提交／恢复 AI 预刊登任务，按服务端真实阶段回写进度，返回该 SKU 在目标店铺的刊登资料。源价格不推断为刊登价，币种无值不补造。平台必填属性需要由真实平台 schema 提供。
2. `publish(task, requestId, signal)`：发送刊登请求，服务端校验账号、SKU 和店铺授权；使用 requestId 做幂等及中断核对，失败抛出错误。
3. 成功回执必须具有严格布尔 `success: true`、匹配 requestId、非空 receiptId 和有效 acceptedAt。仅 HTTP 200 或仅任务受理不能自动视为最终刊登成功，需由业务接口契约明确。
4. 智能体服务回调通过 `acceptReceipt(taskId, receipt, 'agent')` 进入同一回执校验。实际会话由后端建立，返回任务绑定和签名回执，不能信任 LLM 自然语言声称的“成功”。
5. 平台草稿／在售／下架均可作为附加 platformState 留存；不影响本方「已刊登」定义，不在列表冒充平台上架结果。

刷新前未完成的准备任务继续执行；中断的发布任务恢复为结果待确认，保留原幂等键。真实接入时应先查询该请求结果再重试，避免产生重复发布。浏览器本地状态不能代替服务端任务、并发控制、授权或跨设备持久化。

## 验证范围

`tests/product-listing.test.mjs` 覆盖整组／选定 SKU 与多店铺拆分、任务去重、删除过滤、模糊搜索、历史认领兼容、来源值保留、成功回执、平台状态边界及中断恢复。页面验证覆盖详情移除按钮、单层列表、状态记录、图片预览、平台对话和两种刊登入口。

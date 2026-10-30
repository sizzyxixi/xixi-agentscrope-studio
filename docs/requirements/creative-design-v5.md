# 创作空间视觉与交互调整 v5

## 设计方向

参考即梦当前首页的浅色留白、集中输入、作品主导的视觉层级，结合现有五大场景与商品创作链路。继续作为本地前端 Demo，不新增生成或商品后端。

- 创作首页：主标题、图片／视频切换、单一创作面板、场景与工具导航、照片模板卡片。
- 输入面板：保留描述、上传、商品／素材引用及生成操作。画幅、清晰度、数量、模型、平台、站点与语言集中到「创作设置」。
- 引用商品使用独立可操作的 Chip，资料查看和移除拥有独立键盘操作入口。
- 模板采用本地摄影素材，预览后应用；应用后回到输入区，创建产物后滚动到结果区域。
- 商品、素材、导入、归档与会话页面统一字号、间距、圆角、层级和反馈。
- 小屏使用顶部导航入口、可滑动场景工具、双列模板和自适应弹窗。

## HeroUI

新增 StudioControls 适配层，使用当前安装的 HeroUI 3.2.6：Button、Input、TextArea、Select + ListBox、Checkbox、Label、Form。弹窗由 Modal 管理 Portal、焦点、Escape、滚动锁定与焦点恢复；商品引用使用 Chip；状态反馈复用已有 HeroUI Toast。

创作、探索、商品、素材，以及侧栏入口不再直接渲染原生 button、select、textarea 或 dialog。文件上传仍由 HeroUI Input 承载浏览器文件选择能力。

沿用业务状态和归档模型。历史 Agent 与知识库功能仍保持其服务接入，不新增后台行为。

## 图片来源

本地参考摄影来自 Unsplash 图片 CDN，仅用于模板及商品档案示例，不作为模型生成结果：

- skincare.jpg：https://images.unsplash.com/photo-1608571423902-eed4a5ad8108
- perfume.jpg：https://images.unsplash.com/photo-1541643600914-78b084683601
- bottle.jpg：https://images.unsplash.com/photo-1602143407151-7111542de6e8
- watch.jpg：https://images.unsplash.com/photo-1523275335684-37898b6baf30
- interior.jpg：https://images.unsplash.com/photo-1600210492486-724fe5c67fb0
- coffee.jpg：https://images.unsplash.com/photo-1447933601403-0c6688de566e
- mug.jpg：https://images.unsplash.com/photo-1514228742587-6b1558fcca3d
- speaker.jpg：https://images.unsplash.com/photo-1608043152269-423dbba4e7e1

真实创作产物仍使用带 DEMO 标记的本地 SVG，视频仍是分镜占位；未宣称模型生成效果。

## 验证

类型检查、修改文件 ESLint、生产构建；桌面检查创作面板、模板、HeroUI 设置弹窗及选择器；验证商品与 SKU 引用、模板应用及本地生成；390px 宽度检查导航与探索页，并恢复浏览器默认尺寸。

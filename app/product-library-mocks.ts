import type { Association, CreativeJob, Media, Product } from "./commerce-demo-data";
import { productSignature } from "./product-readiness";

// Fixtures use existing local photographs. All business facts and workflow states are simulated.
const catalog: { product: Product; image: string; checked?: boolean; output?: boolean }[] = [
  { image: "/creative/mug.jpg", checked: true, output: true, product: {
    id: "p-cup", name: "北欧哑光陶瓷马克杯", code: "CUP-001", brand: "HOMENKUR", category: "家居 / 水具", source: "1688 链接采集",
    selling: "圆润杯身，宽口易清洗，舒适弧形手柄；适合咖啡、茶饮与日常饮水。", material: "陶瓷，哑光釉面", dimensions: "杯口直径 8.5 × 高 10 cm", audience: "居家办公与咖啡爱好者", packaging: "单杯独立瓦楞盒，内置缓冲衬垫",
    creativeBrief: { useCase: "晨间咖啡、办公桌面、居家下午茶", restrictions: "保留原杯型与手柄，不增加印花；套装图需明确杯子数量。" },
    skus: [
      { id: "s-white", code: "CUP-W350", name: "奶油白 · 单杯", color: "奶油白", spec: "350 ml / 1 只", dimensions: "8.5 × 8.5 × 10 cm", packagingDimensions: "12 × 12 × 14 cm", profile: "奶油白哑光釉面，圆弧杯底与单侧手柄。", craftsmanship: "一体成型杯身，釉面均匀；杯口和手柄连接处需保留。", selling: "宽口便于清洗，适合日常咖啡与茶饮。" },
      { id: "s-cup-pair", code: "CUP-W350-2", name: "奶油白 · 双杯装", color: "奶油白", spec: "350 ml × 2 只", dimensions: "单只 8.5 × 8.5 × 10 cm", packagingDimensions: "24 × 12 × 14 cm", selling: "双杯组合，适合家庭使用；参考图为单只商品，组合图需呈现两只。" },
    ],
  } },
  { image: "/creative/bottle.jpg", checked: true, output: true, product: {
    id: "mock-p-bottle", name: "山野系列不锈钢随行水瓶", code: "BOT-2608", brand: "TRAILDAY", category: "户外 / 随行水具", source: "ERP 货盘",
    selling: "旋拧式瓶盖，直筒瓶身，便于随身携带；磨砂表面，日常通勤与户外使用。", material: "不锈钢瓶身，PP 瓶盖", dimensions: "直径 7.2 × 高 24 cm", audience: "通勤、轻徒步与露营人群", packaging: "牛皮纸盒，单瓶装",
    creativeBrief: { useCase: "城市通勤、短途徒步、营地桌面", restrictions: "保留森林绿瓶身，不添加未经验证的保温时长。" },
    skus: [{ id: "mock-s-bottle", code: "BOT-GRN-500", name: "森林绿 500 ml", color: "森林绿", spec: "500 ml", dimensions: "7.2 × 7.2 × 24 cm", packagingDimensions: "9 × 9 × 27 cm", profile: "森林绿磨砂直筒瓶身，同色旋拧盖。", craftsmanship: "瓶盖与瓶身之间保留原有接缝和密封结构。" }],
  } },
  { image: "/creative/skincare.jpg", output: true, product: {
    id: "p-skin", name: "BOTANIC 日常护理系列", code: "SKIN-001", brand: "BOTANIC", category: "美妆 / 身体护理", source: "商城商品同步",
    selling: "日常护理场景，简约包装，适合浴室与梳妆台陈列。具体成分与功效待品牌资料核实。", material: "包装材质待核实", dimensions: "", audience: "注重日常护理与简约生活的人群", packaging: "包装清单待补充",
    creativeBrief: { useCase: "浴室置物架、日常护理", restrictions: "不新增成分与疗效宣称；不根据系列陈列图推断单品规格。" },
    skus: [{ id: "s-skin", code: "SKIN-SET-01", name: "护理系列展示组", color: "以包装参考图为准", spec: "组合清单待核实" }],
  } },
  { image: "/creative/speaker.jpg", checked: true, output: true, product: {
    id: "p-audio", name: "JBL 便携蓝牙音箱", code: "AUDIO-001", brand: "JBL", category: "数码 / 音频设备", source: "ERP 货盘",
    selling: "横置圆柱造型，织物包覆外壳，适合居家聆听与工作桌面。", material: "织物外壳，ABS 底座", dimensions: "18 × 8 × 10 cm", audience: "居家办公与音乐爱好者", packaging: "彩盒，含音箱及充电线",
    creativeBrief: { useCase: "居家工作桌、客厅边桌", restrictions: "不添加未确认的续航、防水等级与音质参数。" },
    skus: [{ id: "s-audio", code: "AUDIO-G", name: "曜石黑标准装", color: "曜石黑", spec: "标准款 / 1 台", dimensions: "18 × 8 × 10 cm", packagingDimensions: "22 × 12 × 14 cm", profile: "保留织物纹理、按键位置与原有产品比例。" }],
  } },
  { image: "/creative/watch.jpg", output: true, product: {
    id: "mock-p-watch", name: "极简圆屏智能腕表", code: "WAT-2610", brand: "MOMENT", category: "数码 / 智能穿戴", source: "Excel 导入",
    selling: "圆形表盘，硅胶表带，简洁日常搭配。", material: "金属表壳，硅胶表带", dimensions: "表盘直径 42 mm", audience: "偏好简约穿搭的年轻人群", packaging: "腕表与充电配件独立盒装",
    creativeBrief: { useCase: "办公通勤、日常穿搭", restrictions: "屏幕功能、健康监测与防水等级尚未确认，不生成相关文案。" },
    skus: [{ id: "mock-s-watch", code: "WAT-WHT-42", name: "云雾白 42 mm", color: "云雾白", spec: "42 mm / 硅胶表带", dimensions: "表盘直径 42 mm", packagingDimensions: "16 × 9 × 5 cm" }],
  } },
  { image: "/creative/coffee.jpg", checked: true, product: {
    id: "mock-p-coffee", name: "日常手冲咖啡豆", code: "COF-1026", brand: "DAYBREAK", category: "食品 / 咖啡", source: "商城商品同步",
    selling: "整豆包装，适合手冲研磨；烘焙批次、产地与配料信息以商家确认资料为准。", material: "咖啡豆，复合包装袋", dimensions: "袋装 12 × 7 × 20 cm", audience: "家庭手冲咖啡爱好者", packaging: "250 g 袋装；具体标签资料需补传",
    creativeBrief: { useCase: "家庭咖啡角、手冲准备过程", restrictions: "当前照片仅供豆粒外观参考，包装及食品标签展示需补充真实图片。" },
    skus: [{ id: "mock-s-coffee", code: "COF-BEAN-250", name: "咖啡豆 250 g", color: "深棕色", spec: "250 g / 袋", dimensions: "12 × 7 × 20 cm", packagingDimensions: "15 × 10 × 23 cm" }],
  } },
  { image: "/creative/interior.jpg", product: {
    id: "mock-p-home", name: "原木客厅家具搭配方案", code: "HOME-2611", brand: "WOODFORM", category: "家具 / 客厅家具", source: "图采建档",
    selling: "原木色与浅色织物搭配，适合自然简约客厅；单品清单待确认。", material: "", dimensions: "", audience: "小户型与自然风格家居人群", packaging: "拆装包装，尺寸待供应商提供",
    creativeBrief: { useCase: "客厅空间与家具搭配概念", restrictions: "当前仅有空间参考，不作为单品事实图；补齐单品照片与尺寸后再生成刊登图。" },
    skus: [{ id: "mock-s-home", code: "HOME-SET-01", name: "客厅搭配方案", color: "原木色 / 米白", spec: "清单待确认" }],
  } },
];

export const productSeed: Product[] = catalog.map(({ product, checked }, index) => ({
  ...product, mock: true, externalId: `ERP-${String(5170 + index).padStart(6, "0")}`,
  updatedAt: `2026-10-${String(30 - index).padStart(2, "0")}T08:30:00Z`,
  ...(checked ? { confirmedSnapshot: productSignature(product) } : {}),
}));

export const mediaSeed: Media[] = catalog.flatMap(({ product, image, output }, index) => [
  { id: `mock-ref-${product.id}`, name: `${product.name} · 商品参考`, url: image, type: "image" as const, source: "商品资料", createdAt: productSeed[index].updatedAt!, space: "enterprise" as const },
  ...(output ? [{ id: `mock-output-${product.id}`, name: `${product.name} · 刊登视觉`, url: image, type: "image" as const, source: "商品创作", createdAt: "2026-10-30T09:20:00Z", jobId: `mock-job-${product.id}`, space: "enterprise" as const, version: 1 }] : []),
]);

export const associationSeed: Association[] = catalog.flatMap(({ product, output }, index) => [
  { id: `mock-link-ref-${product.id}`, mediaId: `mock-ref-${product.id}`, productId: product.id, skuIds: [product.skus[0].id], platform: "通用", site: "通用", language: "无文字", usage: "商品外观参考", collection: "商品原始资料", status: "已采用", location: "参考素材", version: 1 },
  ...(output ? [{ id: `mock-link-output-${product.id}`, mediaId: `mock-output-${product.id}`, productId: product.id, skuIds: [product.skus[0].id], platform: index % 2 ? "TikTok Shop" : "Amazon", site: "美国站", language: "英语", usage: "主视觉", collection: "秋季上新 · 首轮方案", status: index < 2 ? "已采用" : "草稿", location: "商品图", version: 1 }] : []),
]);

export const productJobSeed: CreativeJob[] = catalog.filter(item => item.output).map(({ product }, index) => ({
  id: `mock-job-${product.id}`, title: `${product.name} · 秋季上新方案`, mode: "image", scene: "电商设计", tool: "平台套图", prompt: `围绕${product.name}准备商品刊登视觉，保留商品外观与材质。`,
  productIds: [product.id], skuIds: [product.skus[0].id], snapshot: [structuredClone(productSeed.find(p => p.id === product.id)!)], referenceIds: [`mock-ref-${product.id}`],
  platform: index % 2 ? "TikTok Shop" : "Amazon", site: "美国站", language: "英语", ratio: "1:1", quality: "1K", amount: "1", template: "秋季上新", fields: { mock: "true" }, mediaIds: [`mock-output-${product.id}`], createdAt: "2026-10-30T09:20:00Z",
  messages: [{ role: "user", text: "准备美国站上新主视觉，保持商品外观一致。" }, { role: "assistant", text: "已整理本次上新视觉，可查看图片并归档到商品。", mediaIds: [`mock-output-${product.id}`] }],
}));

export const productMockVersion = 2;

type MockWorkspace = { productMockVersion?: number; products?: Product[]; media?: Media[]; links?: Association[]; jobs?: CreativeJob[] };

// Upgrade untouched legacy fixtures once; never replace user edits or resurrect later deletions.
export function mergeProductMocks<T extends MockWorkspace>(saved: T, legacy: Product[]) {
  if ((saved.productMockVersion ?? 0) >= productMockVersion) return saved;
  const products = [...(saved.products ?? [])];
  const replaced = new Set<string>();
  for (const fixture of productSeed) {
    const index = products.findIndex(product => product.id === fixture.id);
    const old = legacy.find(product => product.id === fixture.id);
    if (index < 0) { products.push(structuredClone(fixture)); replaced.add(fixture.id); }
    else if (old && JSON.stringify({ ...products[index], confirmedSnapshot: undefined }) === JSON.stringify({ ...old, confirmedSnapshot: undefined })) { products[index] = structuredClone(fixture); replaced.add(fixture.id); }
  }
  const media = [...(saved.media ?? [])];
  const links = [...(saved.links ?? [])];
  const jobs = [...(saved.jobs ?? [])];
  for (const link of associationSeed.filter(link => replaced.has(link.productId))) {
    if (!links.some(existing => existing.id === link.id)) links.push(structuredClone(link));
    const fixture = mediaSeed.find(media => media.id === link.mediaId)!;
    if (!media.some(existing => existing.id === fixture.id)) media.push(structuredClone(fixture));
  }
  for (const job of productJobSeed.filter(job => replaced.has(job.productIds[0]))) {
    if (!jobs.some(existing => existing.id === job.id)) jobs.push(structuredClone(job));
  }
  // Remove only untouched original seed references for replaced fixtures.
  const legacyIds = new Set(legacy.flatMap((product, index) => replaced.has(product.id) ? [`ref-link-${index}`] : []));
  return { ...saved, productMockVersion, products, media, links: links.filter(link => !legacyIds.has(link.id)), jobs };
}

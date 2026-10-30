import type { Association, Media, Product } from "./commerce-demo-data";

export type ProductGoal = "listing" | "video" | "pod" | "packaging";
export const productGoals: { id: ProductGoal; title: string; description: string; output: string }[] = [
  { id: "listing", title: "商品刊登套图", description: "把商品资料变成一套可用的主图、卖点图与场景图", output: "主图 · 卖点图 · 场景图" },
  { id: "video", title: "商品展示视频", description: "围绕真实商品与目标人群，规划卖点和镜头", output: "脚本分镜 · 展示视频" },
  { id: "pod", title: "POD 个性化定制", description: "明确载体、定制区域和限制，再开始图案与效果设计", output: "图案方案 · 商品贴图预览" },
  { id: "packaging", title: "包装概念设计", description: "基于真实尺寸与包装资料探索视觉方案", output: "包装概念 · 效果预览" },
];
export function productSignature(product: Product) {
  const { name, code, brand, category, selling, material, dimensions, audience, packaging, skus, creativeBrief } = product;
  return JSON.stringify({ name, code, brand, category, selling, material, dimensions, audience, packaging, skus, creativeBrief });
}
export function productReferences(product: Product, links: Association[], media: Media[], skuId?: string) {
  const ids = new Set(links.filter(link => link.productId === product.id && link.location === "参考素材" && link.status !== "已归档" && (!skuId || !link.skuIds.length || link.skuIds.includes(skuId))).map(link => link.mediaId));
  return media.filter(item => ids.has(item.id) && item.type === "image" && !item.placeholder);
}
export function productChecks(product: Product, links: Association[], media: Media[], goal: ProductGoal, skuId?: string) {
  const sku = product.skus.find(item => item.id === skuId);
  const refs = productReferences(product, links, media, skuId);
  const checks = [
    { label: "商品名称与编码", done: !!product.name.trim() && !!product.code.trim(), tab: "基础资料" },
    { label: "商品材质与核心卖点", done: !!product.material.trim() && !!(sku?.selling || product.selling).trim(), tab: "基础资料" },
    { label: "可用参考图片", done: refs.length > 0, tab: "参考素材" },
    { label: "SKU 颜色与规格", done: sku ? !!sku.color.trim() && !!sku.spec.trim() : product.skus.length > 0 && product.skus.every(item => !!item.color.trim() && !!item.spec.trim()), tab: "SKU 档案" },
  ];
  if (goal === "video") checks.push({ label: "目标人群与使用场景", done: !!product.audience.trim() && !!product.creativeBrief?.useCase?.trim(), tab: "创作概览" });
  if (goal === "pod") checks.push({ label: "定制区域与设计限制", done: !!product.creativeBrief?.customArea?.trim() && !!product.creativeBrief?.restrictions?.trim(), tab: "创作概览" });
  if (goal === "packaging") checks.push({ label: "商品尺寸与包装说明", done: !!(sku?.dimensions || product.dimensions).trim() && !!product.packaging.trim(), tab: "基础资料" });
  checks.push({ label: "商品事实已人工核对", done: product.confirmedSnapshot === productSignature(product), tab: "创作概览" });
  return checks;
}

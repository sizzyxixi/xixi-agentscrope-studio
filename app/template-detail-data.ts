import type { DemoTemplate } from "./commerce-demo-data";

const categoryImages: Record<string, string[]> = {
  美妆: ["/creative/generated/fragrance-v1.webp", "/creative/generated/perfume-santal-v1.jpg", "/creative/skincare.jpg", "/creative/perfume.jpg", "/creative/scenes/store-v1.jpg"],
  家具: ["/creative/generated/interior-v1.webp", "/creative/interior.jpg"],
};
const platformSites: Record<string, string> = {
  Amazon: "美国站", "TikTok Shop": "美国站", eBay: "美国站", Shopify: "美国", Shopee: "马来西亚站", Temu: "美国站",
};

// Frontend template fixtures; replace with template metadata when the catalog is connected.
export function templateDetailData(template: DemoTemplate) {
  const isCommerceSet = template.scene === "电商设计" && template.tool === "平台套图";
  const isProductImage = template.category !== "服务" && (template.scene === "电商设计" || template.scene === "新品开发" || template.tool === "商品贴图预览");
  const images = [...new Set([template.cover, ...(categoryImages[template.category] ?? [])])];
  const platform = template.platforms.includes("Amazon") ? "Amazon" : template.platforms[0];
  const isWide = /横幅|首页/.test(template.tool);
  return {
    gallery: template.structure.map((label, index) => ({ label, url: images[index % images.length] })),
    target: isCommerceSet ? { platform, site: platformSites[platform] ?? "通用" } : null,
    category: isProductImage ? template.category : null,
    dimensions: isWide ? "2048 × 1152 px" : "2048 × 2048 px",
    ratio: isWide ? "16:9" : "1:1",
    resolution: "2K",
    model: "image2.5",
  };
}

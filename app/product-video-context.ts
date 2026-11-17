import type { Association, Media, Product } from './commerce-demo-data';
import { productTitle } from './product-fields';

/** Carry the chosen product and only its applicable images into the video composer. */
export function productVideoContext(product: Product, skuIds: string[], links: Association[], availableMedia: Media[]) {
  if (product.deleted_at) throw new Error('商品已不可用，请返回商品库刷新。');
  if (skuIds.some(id => !product.skus.some(sku => sku.id === id))) throw new Error('SKU 已变更，请刷新后重试。');
  const selected = [...new Set(skuIds)];
  const mediaIds = availableMedia.filter(item => item.type === 'image' && item.url && !item.placeholder && links.some(link => link.productId === product.id && link.mediaId === item.id && link.status !== '已归档' && (!link.skuIds.length || link.skuIds.some(id => selected.includes(id))))).map(item => item.id);
  return {
    productIds: [product.id], skuIds: selected, mediaIds: [...new Set(mediaIds)],
    prompt: `为「${productTitle(product)}」创作商品展示视频，保留商品外观、颜色和规格，突出使用场景与细节。`,
  };
}

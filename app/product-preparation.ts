import type { Association, Media, Product } from './commerce-demo-data';
import { productTitle, productCode } from './product-fields';
import { skuCode, skuDimensions, skuPrice, skuSpec, skuWeightUnit, validSkuDecimal } from './sku-fields';
import { productAssets } from './product-images';

export type PreparationIssue = { key: string; label: string; tab: '基础资料' | 'SKU 档案' | '素材'; skuId?: string };
const positive = (value?: string) => !!value && Number.isFinite(Number(value)) && Number(value) > 0;
export const validDimensions = (value?: string) => !!value && value.replace(/\s*cm\s*$/i, '').split(/\s*[×x*]\s*/).length === 3 && value.replace(/\s*cm\s*$/i, '').split(/\s*[×x*]\s*/).every(positive);

/** Operational checks, not marketplace approval. Missing data never blocks saving a draft. */
export function productPreparation(product: Product, links: Association[], media: Media[], skuId?: string) {
  const issues: PreparationIssue[] = [];
  if (!productTitle(product).trim()) issues.push({ key: 'title', label: '商品标题', tab: '基础资料' });
  if (!productCode(product).trim()) issues.push({ key: 'code', label: '商品编码', tab: '基础资料' });
  const skus = skuId ? product.skus.filter(sku => sku.id === skuId) : product.skus;
  if (!skus.length) issues.push({ key: 'sku', label: 'SKU 档案', tab: 'SKU 档案' });
  for (const sku of skus) {
    for (const [key, label, done] of [
      ['code', 'SKU 货号', !!skuCode(sku).trim()], ['spec', '规格', !!skuSpec(sku).trim()],
      ['price', '价格', validSkuDecimal(skuPrice(sku))],
      ['weight', '重量', positive(sku.weight)], ['unit', '重量单位', ['g', 'kg'].includes(skuWeightUnit(sku))], ['dimensions', '产品尺寸', skuDimensions(sku).every(value => validSkuDecimal(value, 10, 2, true))],
    ] as const) if (!done) issues.push({ key: `${sku.id}-${key}`, label: `${skuCode(sku) || 'SKU'} · ${label}`, tab: 'SKU 档案', skuId: sku.id });
  }
  const assets = productAssets(product.id, links, media, skuId);
  const imageCount = assets.filter(item => item.media.type === 'image').length;
  const videoCount = assets.filter(item => item.media.type === 'video').length;
  const materialIssues: PreparationIssue[] = [];
  for (const sku of skus) {
    if (!productAssets(product.id, links, media, sku.id).some(item => item.media.type === 'image')) materialIssues.push({ key: `${sku.id}-images`, label: `${skuCode(sku)} · 图片`, tab: '素材', skuId: sku.id });
  }
  return { issues, materialIssues, imageCount, videoCount, complete: !issues.length, materialsReady: !!skus.length && !materialIssues.length };
}

export function reconcileProductSkus(product: Product, links: Association[]) {
  const ids = new Set(product.skus.map(sku => sku.id));
  const listingClaims = product.listingClaims?.flatMap(claim => !claim.skuIds ? [claim] : claim.skuIds.some(id => ids.has(id)) ? [{ ...claim, skuIds: claim.skuIds.filter(id => ids.has(id)) }] : []);
  const listingDrafts = product.listingDrafts?.flatMap(draft => {
    const claim = listingClaims?.find(item => item.shopId === draft.shopId);
    const skuIds = draft.skuIds.filter(id => ids.has(id) && claim && (!claim.skuIds || claim.skuIds.includes(id)));
    if (!skuIds.length) return [];
    const changed = skuIds.length !== draft.skuIds.length;
    return [{ ...draft, skuIds, prices: Object.fromEntries(Object.entries(draft.prices).filter(([id]) => ids.has(id))), mediaIds: draft.mediaIds.filter(id => links.some(link => link.productId === product.id && link.mediaId === id && link.status !== '已归档' && (!link.skuIds.length || link.skuIds.some(id => skuIds.includes(id))))), ...(changed ? { exportedAt: undefined } : {}) }];
  });
  return { product: { ...product, listingClaims, listingDrafts }, links: links.flatMap(link => {
    if (link.productId !== product.id || !link.skuIds.length) return [link];
    const skuIds = link.skuIds.filter(id => ids.has(id));
    return skuIds.length ? [{ ...link, skuIds }] : [];
  }) };
}

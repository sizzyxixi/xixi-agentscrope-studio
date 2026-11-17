import { strToU8, zipSync } from 'fflate';
import type { Association, Media, Product } from './commerce-demo-data';
import type { ListingShop } from './listing-shops';
import { productPreparation } from './product-preparation';
import { productAssets } from './product-images';
import { skuCode, validSkuDecimal } from './sku-fields';
import { claimSkuIds } from './product-management';

export type ListingDraft = { shopId: string; title: string; description: string; language: string; currency: string; prices: Record<string, string>; skuIds: string[]; mediaIds: string[]; updatedAt: string; exportedAt?: string };
export function listingAssets(productId: string, links: Association[], media: Media[], skuIds: string[]) {
  return [...new Map(skuIds.flatMap(id => productAssets(productId, links, media, id)).map(item => [item.media.id, item])).values()];
}
export function listingDraftIssues(product: Product, draft: ListingDraft, links: Association[], media: Media[]) {
  const issues: string[] = [];
  if (!draft.title.trim()) issues.push('刊登标题');
  if (!draft.description.trim()) issues.push('商品描述');
  if (!draft.currency) issues.push('价格币种');
  if (!draft.language) issues.push('文案语言');
  if (draft.language === '英语' && /[\u3400-\u9fff]/.test(draft.title + draft.description)) issues.push('英文文案待核对');
  if (!draft.skuIds.length || draft.skuIds.some(id => !product.skus.some(sku => sku.id === id))) issues.push('有效 SKU');
  const selected = { ...product, skus: product.skus.filter(sku => draft.skuIds.includes(sku.id)).map(sku => ({ ...sku, price: draft.prices[sku.id] ?? '' })) };
  const eligible = new Set(listingAssets(product.id, links, media, draft.skuIds).map(item => item.media.id));
  const assets = media.filter(item => draft.mediaIds.includes(item.id) && eligible.has(item.id) && !item.placeholder && item.url);
  if (assets.length !== draft.mediaIds.length) issues.push('部分素材已失效');
  const preparation = productPreparation(selected, links, assets);
  for (const sku of selected.skus) if (!validSkuDecimal(draft.prices[sku.id] || '')) issues.push(`${skuCode(sku)} · 刊登价格`);
  issues.push(...preparation.issues.filter(issue => !issue.key.endsWith('-price')).map(issue => issue.label), ...preparation.materialIssues.map(issue => issue.label));
  return [...new Set(issues)];
}
const safe = (value: string) => value.replace(/[\\/:*?"<>|]/g, '_').slice(0, 90);
/** Fetch original files, then build one complete package. A failed fetch never produces a success file. */
export async function createListingPackage(product: Product, draft: ListingDraft, shop: ListingShop, links: Association[], media: Media[]) {
  const claim = product.listingClaims?.find(item => item.shopId === draft.shopId);
  if (product.deleted_at || shop.id !== draft.shopId || !claim || !draft.skuIds.length || draft.skuIds.some(id => !claimSkuIds(product, claim).includes(id))) throw new Error('商品或认领范围已变更，请重新打开刊登资料。');
  const eligible = new Set(listingAssets(product.id, links, media, draft.skuIds).map(item => item.media.id));
  const selected = media.filter(item => draft.mediaIds.includes(item.id) && eligible.has(item.id) && !item.placeholder && item.url);
  if (selected.length !== draft.mediaIds.length) throw new Error('部分素材已失效，请重新选择后导出。');
  const missing = listingDraftIssues(product, draft, links, media);
  const manifest = { schemaVersion: 1, exportedAt: new Date().toISOString(), state: missing.length ? 'incomplete' : 'prepared', missing, productId: product.id, code: product.code, shop: { id: shop.id, name: shop.name, platform: shop.platform, market: shop.site }, listing: draft, skus: product.skus.filter(sku => draft.skuIds.includes(sku.id)).map(sku => ({ ...sku, listing_price: draft.prices[sku.id] || '', listing_currency: draft.currency })), assets: [] as { id: string; name: string; file: string; skuIds: string[]; usage: string }[] };
  const files: Record<string, Uint8Array> = {};
  for (const [index, item] of selected.entries()) {
    const response = await fetch(item.url);
    if (!response.ok) throw new Error(`「${item.name}」下载失败，请重试。`);
    const ext = item.type === 'video' ? 'mp4' : response.headers.get('content-type')?.includes('png') ? 'png' : response.headers.get('content-type')?.includes('webp') ? 'webp' : 'jpg';
    const name = `assets/${String(index + 1).padStart(2, '0')}-${safe(item.name)}${/\.[a-z0-9]{2,5}$/i.test(item.name) ? '' : `.${ext}`}`;
    files[name] = new Uint8Array(await response.arrayBuffer());
    const related = links.filter(link => link.productId === product.id && link.mediaId === item.id && link.status !== '已归档');
    manifest.assets.push({ id: item.id, name: item.name, file: name, skuIds: [...new Set(related.flatMap(link => link.skuIds.length ? link.skuIds : draft.skuIds))].filter(id => draft.skuIds.includes(id)), usage: related.map(link => link.usage).join('、') });
  }
  files['刊登资料.json'] = strToU8(JSON.stringify(manifest, null, 2));
  files['商品文案.txt'] = strToU8(`${draft.title}\n\n${draft.description}\n\n${shop.platform} / ${shop.site} / ${draft.language}\n币种：${draft.currency || '未设置'}\n${missing.length ? `待补充：\n${missing.join('\n')}` : '资料准备完成，请按平台类目要求完成最终核对。'}`);
  return new Blob([new Uint8Array(zipSync(files))], { type: 'application/zip' });
}

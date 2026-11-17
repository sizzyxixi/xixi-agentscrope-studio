import type { Association, CreativeJob, Media, Product } from './commerce-demo-data';

export type ContentVersion = {
  id: string; name: string; platform: string; site: string; language: string; shop: string;
  skuIds: string[]; title: string; description: string; selling: string;
  mediaIds: string[]; revision: number; sourceSignature: string;
  state: 'draft' | 'selected'; createdAt: string;
  deliveries: { id: string; at: string; kind: 'export' | 'erp-demo'; revision: number; mediaIds: string[]; shop: string }[];
};
export type ProductActivity = { id: string; at: string; title: string; detail: string };

/** Restore only records created by the old deterministic SKU splitter. Never merge by title. */
export function restoreSpuCatalog(products: Product[], links: Association[]) {
  // Upgrade the former built-in import fixture without changing merchant records.
  products = products.map(record => {
    // Retire the old UI-only flag without losing the product or its relationships.
    const p = { ...record } as Product & { archived?: boolean };
    delete p.archived;
    if (p.name !== '陶瓷随行杯 · 导入示例' || !/^DEMO-CUP-\d+$/.test(p.code)) return p;
    const code = `CUP-${p.code.split('-').pop()!.padStart(3, '0')}`;
    return { ...p, name: '陶瓷随行杯', code, skus: p.skus.map(sku => ({ ...sku, code: sku.code.replace(p.code, code) })) };
  });
  const parents = new Map(products.map(p => [p.id, p]));
  const children = products.filter(p => {
    const [base, suffix] = p.id.split('--');
    return suffix && parents.has(base) && p.skus.length === 1 && p.skus[0].id === suffix;
  });
  const ids = new Map(children.map(p => [p.id, p.id.split('--')[0]]));
  return {
    products: products.filter(p => !ids.has(p.id)).map(p => {
      const siblings = children.filter(child => ids.get(child.id) === p.id);
      if (!siblings.length) return p;
      const skus = [...p.skus, ...siblings.flatMap(child => child.skus)];
      const first = p.skus[0];
      const suffix = ` · ${first?.name || [first?.color, first?.spec].filter(Boolean).join(' ') || first?.code}`;
      return { ...p, name: p.name.endsWith(suffix) ? p.name.slice(0, -suffix.length) : p.name,
        skus: skus.filter((sku, i) => skus.findIndex(s => s.id === sku.id) === i), confirmedSnapshot: undefined };
    }),
    links: links.map(link => ids.has(link.productId) ? { ...link, productId: ids.get(link.productId)! } : link),
  };
}

export function skuLinks(links: Association[], productId: string, skuId?: string) {
  return links.filter(l => l.productId === productId && (!skuId || !l.skuIds.length || l.skuIds.includes(skuId)));
}

export function deliveryIssues(version: ContentVersion, product: Product, media: Media[], unavailableIds: string[]) {
  const issues: string[] = [];
  if (product.deleted_at) issues.push('商品已删除，请重新选择');
  if (!version.skuIds.length || version.skuIds.some(id => !product.skus.some(s => s.id === id))) issues.push('请选择有效 SKU');
  if (!version.title.trim()) issues.push('请填写渠道商品标题');
  if (!version.mediaIds.length) issues.push('请至少选用一份素材');
  if (version.mediaIds.some(id => unavailableIds.includes(id) || !media.some(m => m.id === id && !m.placeholder && m.url))) issues.push('部分素材已失效或被删除，请重新选择');
  return issues;
}

export function outputAssociations(job: Pick<CreativeJob, 'id' | 'productIds' | 'skuIds' | 'platform' | 'site' | 'language' | 'tool' | 'mode' | 'template'>, mediaIds: string[], products: Product[]): Association[] {
  return job.productIds.flatMap(id => {
    const p = products.find(p => p.id === id || id.startsWith(`${p.id}--`));
    if (!p) return [];
    const skuIds = p.skus.filter(sku => job.skuIds.includes(sku.id)).map(sku => sku.id);
    // A multi-SKU task with no explicit scope cannot silently become a shared asset.
    if (!skuIds.length && p.skus.length !== 1) return [];
    return mediaIds.map(mediaId => ({ id: `output-link-${job.id}-${p.id}-${mediaId}`, mediaId, productId: p.id,
      skuIds: skuIds.length ? skuIds : [p.skus[0].id], platform: job.platform, site: job.site, language: job.language,
      usage: job.tool, collection: job.template, status: '草稿', location: job.mode === 'video' ? '视频' : '商品图', version: 1 }));
  });
}

/** Legacy claims without a SKU scope apply to all current variants. */
export function claimSkuIds(product: Product, claim: NonNullable<Product['listingClaims']>[number]) {
  return product.skus.filter(sku => !claim.skuIds || claim.skuIds.includes(sku.id)).map(sku => sku.id);
}

/** Merge explicit SKU scopes per shop; claiming never publishes or splits the SPU. */
export function claimProduct(product: Product, shop: { id: string; name: string; site: string; platform?: string; authorized: boolean }, at: string, requestedIds = product.skus.map(sku => sku.id)): Product {
  if (product.deleted_at || !shop.authorized || !requestedIds.length || requestedIds.some(id => !product.skus.some(sku => sku.id === id))) return product;
  const existing = product.listingClaims?.find(claim => claim.shopId === shop.id);
  const previous = existing ? claimSkuIds(product, existing) : [];
  const added = requestedIds.filter(id => !previous.includes(id));
  if (!added.length) return product;
  const skuIds = product.skus.filter(sku => previous.includes(sku.id) || requestedIds.includes(sku.id)).map(sku => sku.id);
  const claim = { shopId: shop.id, shopName: shop.name, site: shop.site, platform: shop.platform, claimedAt: at, skuIds };
  return { ...product, listingClaims: existing ? product.listingClaims!.map(item => item.shopId === shop.id ? claim : item) : [...(product.listingClaims || []), claim],
    activity: [{ id: `claim-${shop.id}-${at}`, at, title: '认领到店铺', detail: `${shop.name} · ${shop.site} · 新增 ${new Set(added).size} 个 SKU · 待刊登` }, ...(product.activity || [])] };
}

export type ProductSelection = Record<string, 'all' | string[]>;
export function selectedProductScopes(products: Product[], selection: ProductSelection) {
  return products.flatMap(product => {
    const selected = selection[product.id];
    if (!selected) return [];
    const skuIds = product.skus.filter(sku => selected === 'all' || selected.includes(sku.id)).map(sku => sku.id);
    if (selected !== 'all' && !skuIds.length) return [];
    return [{ product, skuIds, full: selected === 'all' || skuIds.length === product.skus.length }];
  });
}

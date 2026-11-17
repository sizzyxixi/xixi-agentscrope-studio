import type { Association, Media, Product } from './commerce-demo-data';

/** One source file, multiple products; repeated scope selections merge without copying files. */
export function associateMaterial(links: Association[], product: Product, media: Media, skuIds: string[], usage: string, id: string, displayName?: string): Association[] {
  if (product.deleted_at) throw new Error('商品已删除，请选择其他商品。');
  if (!media.url || media.placeholder || !['image', 'video'].includes(media.type)) throw new Error('素材已不可用，请选择有效的图片或视频。');
  if (skuIds.some(skuId => !product.skus.some(sku => sku.id === skuId))) throw new Error('所选 SKU 已变更，请重新选择。');
  if (!usage.trim()) throw new Error('请选择素材场景。');
  const name = displayName?.trim();
  if (displayName !== undefined && !name) throw new Error('请填写素材名称。');
  const normalizedUsage = media.type === 'video' ? '商品视频' : usage.trim();
  const location = media.type === 'video' ? '视频' : '商品图';
  const genericImage = media.type === 'image' && normalizedUsage === '商品图片';
  const existing = links.filter(link => link.productId === product.id && link.mediaId === media.id && (genericImage || link.location === location) && (media.type === 'video' || genericImage || link.usage === normalizedUsage));
  // An explicit common scope wins; keep archived scopes from silently joining a new active scope.
  const active = existing.filter(link => link.status !== '已归档');
  const common = !skuIds.length || active.some(link => !link.skuIds.length);
  const scope = common ? [] : product.skus.filter(sku => skuIds.includes(sku.id) || active.some(link => link.skuIds.includes(sku.id))).map(sku => sku.id);
  const first = active[0] || existing[0];
  if (existing.length === 1 && first.status !== '已归档' && first.usage === normalizedUsage && first.skuIds.length === scope.length && first.skuIds.every(skuId => scope.includes(skuId)) && (name === undefined || first.displayName === name)) return links;
  const next: Association = first ? { ...first, usage: normalizedUsage, ...(name !== undefined ? { displayName: name } : {}), skuIds: scope, status: first.status === '已归档' ? '草稿' : first.status, version: first.version + 1 } : {
    id, mediaId: media.id, productId: product.id, skuIds: scope, usage: normalizedUsage, ...(name !== undefined ? { displayName: name } : {}), location,
    platform: '通用', site: '通用', language: '无文字', collection: '', status: '草稿', version: 1,
  };
  const replaced = new Set(existing.map(link => link.id));
  return [...links.filter(link => !replaced.has(link.id)), next];
}

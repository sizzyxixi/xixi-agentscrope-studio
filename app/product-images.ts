import type { Association, Media } from './commerce-demo-data';

export const imageScenes = ['主图', '详情图', '平铺图', '细节图', '成份图', '其他图片'] as const;
export type ImageScene = typeof imageScenes[number];

export function imageScene(link: Association): ImageScene {
  if (/成[份分]/.test(link.usage)) return '成份图';
  if (/平铺/.test(link.usage)) return '平铺图';
  if (/细节/.test(link.usage)) return '细节图';
  if (/详情/.test(link.usage)) return '详情图';
  if (/主图|主视图|主视觉/.test(link.usage)) return '主图';
  return '其他图片';
}

/** Keep image-only, available associations in the selected product/SKU scope. */
export function productImages(productId: string, links: Association[], media: Media[], skuId = '', scene = '全部') {
  const images = new Map(media.filter(item => item.type === 'image' && !item.placeholder && item.url).map(item => [item.id, item]));
  const seen = new Set<string>();
  return links.flatMap(link => {
    const item = images.get(link.mediaId);
    if (link.productId !== productId || link.status === '已归档' || !item || skuId && link.skuIds.length && !link.skuIds.includes(skuId) || scene !== '全部' && imageScene(link) !== scene || seen.has(link.mediaId)) return [];
    seen.add(link.mediaId);
    return [{ link, media: item, name: link.displayName?.trim() || item.name, scene: imageScene(link) }];
  });
}

export const materialScenes = [...imageScenes, '视频'] as const;
export type MaterialScene = typeof materialScenes[number];

/** The product gallery includes linked videos as well as images, using the same SKU scope. */
export function productAssets(productId: string, links: Association[], media: Media[], skuId = '', scene = '全部') {
  const assets = new Map(media.filter(item => ['image', 'video'].includes(item.type) && !item.placeholder && item.url).map(item => [item.id, item]));
  const seen = new Set<string>();
  return links.flatMap(link => {
    const item = assets.get(link.mediaId);
    const category: MaterialScene = item?.type === 'video' ? '视频' : imageScene(link);
    if (link.productId !== productId || link.status === '已归档' || !item || skuId && link.skuIds.length && !link.skuIds.includes(skuId) || scene !== '全部' && category !== scene || seen.has(link.mediaId)) return [];
    seen.add(link.mediaId);
    return [{ link, media: item, name: link.displayName?.trim() || item.name, scene: category }];
  });
}

export type ProductMaterialKind = 'all' | 'image' | 'video';
export type ProductMaterialItem = { link: Association; media: Media; name: string };
export type ProductMaterialGroup = { id: string; skuId?: string; items: ProductMaterialItem[] };

/** Only available, populated groups are shown; common files appear once in SPU. */
export function productMaterialGroups(product: { id: string; skus: { id: string }[] }, links: Association[], media: Media[], kind: ProductMaterialKind = 'all', scope = 'all'): ProductMaterialGroup[] {
  const available = new Map(media.filter(item => !item.placeholder && item.url && ['image', 'video'].includes(item.type) && (kind === 'all' || item.type === kind)).map(item => [item.id, item]));
  return [{ id: 'spu' }, ...product.skus.map(sku => ({ id: `sku:${sku.id}`, skuId: sku.id }))]
    .filter(group => scope === 'all' || group.id === scope)
    .map(group => {
      const seen = new Set<string>();
      const items = links.flatMap(link => {
        const item = available.get(link.mediaId);
        if (!item || link.productId !== product.id || link.status === '已归档' || ('skuId' in group ? !link.skuIds.includes(group.skuId) : !!link.skuIds.length) || seen.has(item.id)) return [];
        seen.add(item.id);
        return [{ link, media: item, name: link.displayName?.trim() || item.name }];
      });
      return { ...group, items };
    }).filter(group => group.items.length > 0);
}

export const publicationMessageStart = '【商品库刊登资料】';
export const publicationMessageEnd = '【商品库刊登资料结束】';
export const publicationImageUrl = (value: unknown) => typeof value === 'string' && /^(https?:\/\/|\/(?!\/))/.test(value) ? value : '';
export type PublicationMessagePreview = {
  text: string;
  shop: { name: string; platform: string; site: string };
  products: { name: string; image: string; codes: string[] }[];
};

/** Recover cards from persisted message content; ordinary/malformed messages remain untouched. */
export function readPublicationMessage(content: string): PublicationMessagePreview | null {
  const start = content.indexOf(publicationMessageStart + '\n');
  const end = content.indexOf('\n' + publicationMessageEnd, start);
  if (start < 0 || end < 0) return null;
  try {
    const data = JSON.parse(content.slice(start + publicationMessageStart.length + 1, end));
    const shop = data?.shop;
    if (data?.version !== 1 || !shop || !['name', 'platform', 'site'].every(key => typeof shop[key] === 'string') || !Array.isArray(data.products) || !data.products.length) return null;
    const products = [];
    for (const item of data.products) {
      if (!item || !Array.isArray(item.skus) || !item.skus.length || item.skus.some((sku: unknown) => !sku || typeof sku !== 'object' || !('sku_code' in sku) || typeof sku.sku_code !== 'string')) return null;
      const name = item.cn_title || item.title || item.spu_code;
      if (typeof name !== 'string') return null;
      products.push({ name, image: publicationImageUrl(item.image), codes: item.skus.map((sku: { sku_code: string }) => sku.sku_code) });
    }
    return { text: content.slice(end + publicationMessageEnd.length + 1).trim(), shop: { name: shop.name, platform: shop.platform, site: shop.site }, products };
  } catch { return null; }
}

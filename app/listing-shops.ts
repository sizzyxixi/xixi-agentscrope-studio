import type { Product } from './commerce-demo-data';
export type ListingShop = { id: string; name: string; platform: string; site: string; currency: string; active: boolean };
export const shopPlatforms = ['Amazon', 'eBay', 'TikTok Shop', 'Shopify', '其他'];
export const listingCurrencies = ['USD', 'EUR', 'GBP', 'CNY', 'JPY', 'CAD', 'AUD'];
/** Historical claims retain their named target; a target record is not an authorization receipt. */
export function availableListingShops(configured: ListingShop[], products: Product[]): ListingShop[] {
  const shops = new Map(configured.map(shop => [shop.id, shop]));
  for (const product of products) for (const claim of product.listingClaims || []) if (!shops.has(claim.shopId)) {
    shops.set(claim.shopId, { id: claim.shopId, name: claim.shopName, site: claim.site, currency: '', platform: shopPlatforms.find(platform => claim.shopName.toLowerCase().startsWith(platform.toLowerCase())) || '其他', active: true });
  }
  return [...shops.values()];
}

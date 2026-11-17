import type { Product } from './commerce-demo-data';
import type { ListingShop } from './listing-shops';
import { claimProduct, claimSkuIds } from './product-management';
export type ClaimScope = { productId: string; skuIds: string[] };
export type ClaimShop = ListingShop & { authorized: boolean; expiresAt?: string; presentationMock?: true };
export type ShopResource = { id: string; name: string; enabled: boolean; config?: { platform?: string; country?: string; site?: string; currency?: string; authorization_status?: string; expires_at?: string } };
export const claimPlatforms = ['Amazon', 'eBay', 'TikTok Shop', 'Shopify', 'Lazada', 'Shopee', 'AliExpress', 'Walmart', 'Temu', '其他'];
export function isClaimShopAuthorized(shop: ClaimShop, now = Date.now()) {
  return shop.active && shop.authorized === true && (!shop.expiresAt || Number.isFinite(Date.parse(shop.expiresAt)) && Date.parse(shop.expiresAt) > now);
}
/** Connector-owned authorization is read from the service, never inferred from local target records or claim history. */
export function claimShopsFromResources(resources: ShopResource[], now = Date.now()): ClaimShop[] {
  return resources.map(item => ({ id: item.id, name: item.name, platform: claimPlatforms.find(platform => platform.toLowerCase().replace(/[\s_-]/g, '') === item.config?.platform?.trim().toLowerCase().replace(/[\s_-]/g, '')) || item.config?.platform?.trim() || '其他', site: item.config?.site || item.config?.country || '', currency: item.config?.currency || '', active: item.enabled === true, authorized: item.config?.authorization_status === 'authorized', expiresAt: item.config?.expires_at })).filter(shop => isClaimShopAuthorized(shop, now));
}
export function resolveClaimScopes(products: Product[], scopes: ClaimScope[]) {
  const grouped = new Map<string, Set<string>>();
  for (const scope of scopes) { const ids = grouped.get(scope.productId) || new Set<string>(); scope.skuIds.forEach(id => ids.add(id)); grouped.set(scope.productId, ids); }
  return products.flatMap(product => {
    const selected = grouped.get(product.id);
    if (!selected || product.deleted_at) return [];
    const skuIds = product.skus.filter(sku => !sku.deleted_at && selected.has(sku.id)).map(sku => sku.id);
    return skuIds.length ? [{ product, skuIds }] : [];
  });
}
export function remainingShopClaims(products: Product[], scopes: ClaimScope[], shopId: string) {
  return resolveClaimScopes(products, scopes).reduce((count, { product, skuIds }) => {
    const claim = product.listingClaims?.find(item => item.shopId === shopId);
    const existing = claim ? claimSkuIds(product, claim) : [];
    return count + skuIds.filter(id => !existing.includes(id)).length;
  }, 0);
}
export function filteredClaimShops(shops: ClaimShop[], platform: string, query = '') {
  const search = query.trim().toLocaleLowerCase();
  return shops.filter(shop => isClaimShopAuthorized(shop) && (!platform || shop.platform === platform) && shop.name.toLocaleLowerCase().includes(search));
}
export function authorizedClaimPlatforms(shops: ClaimShop[]) {
  const available = [...new Set(shops.filter(shop => isClaimShopAuthorized(shop)).map(shop => shop.platform).filter(Boolean))];
  return [...claimPlatforms.filter(platform => available.includes(platform)), ...available.filter(platform => !claimPlatforms.includes(platform)).sort()];
}
export function claimShopPage(shops: ClaimShop[], platform: string, query: string, page: number, pageSize = 6) {
  const rows = filteredClaimShops(shops, platform, query);
  const size = Number.isFinite(pageSize) && pageSize >= 1 ? Math.floor(pageSize) : 6;
  const pageCount = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(pageCount, Math.max(1, Number.isFinite(page) ? Math.floor(page) : 1));
  return { items: rows.slice((current - 1) * size, current * size), total: rows.length, page: current, pageCount, pageSize: size };
}
/** Validate every target before applying the multi-shop operation; duplicate existing SKU claims are skipped. */
export function claimProductsToShops(products: Product[], scopes: ClaimScope[], shops: ClaimShop[], platform: string, at: string) {
  const targets = [...new Map(shops.map(shop => [shop.id, shop])).values()];
  if (!targets.length || targets.some(shop => (platform && shop.platform !== platform) || !isClaimShopAuthorized(shop))) throw new Error('所选店铺不可认领，请刷新授权店铺后重试。');
  const resolved = resolveClaimScopes(products, scopes);
  if (!resolved.length) throw new Error('所选商品或 SKU 已不可用，请重新选择。');
  const count = targets.reduce((count, shop) => count + remainingShopClaims(products, scopes, shop.id), 0);
  if (!count) throw new Error('所选 SKU 已认领到这些店铺。');
  return { count, products: products.map(product => { const scope = resolved.find(item => item.product.id === product.id); return scope ? targets.reduce((next, shop) => claimProduct(next, shop, at, scope.skuIds), product) : product; }) };
}

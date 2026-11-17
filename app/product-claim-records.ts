import type { Product } from './commerce-demo-data';
import type { ListingShop } from './listing-shops';
import { availableListingShops } from './listing-shops';
import { claimSkuIds } from './product-management';
import type { ListingAgentContext, ProductListingTask } from './product-listing';
import { skuCode } from './sku-fields';
export type SkuClaimRecord = { id: string; platform: string; shopName: string; site: string; skuId: string; claimedAt: string; draft?: ListingAgentContext };

export function skuClaimRecords(product: Product, skuId: string, shops: ListingShop[], tasks: ProductListingTask[]): SkuClaimRecord[] {
  const sku = product.skus.find(sku => sku.id === skuId && !sku.deleted_at);
  if (!sku || product.deleted_at) return [];
  const targets = availableListingShops(shops, [product]);
  return (product.listingClaims || []).filter(claim => claimSkuIds(product, claim).includes(skuId)).map(claim => {
    const task = tasks.find(task => !task.presentationMock && task.productId === product.id && task.skuId === skuId && task.shopId === claim.shopId);
    const shop = targets.find(shop => shop.id === claim.shopId);
    const platform = claim.platform || task?.platform || shop?.platform || '';
    return { id: claim.shopId, platform, shopName: claim.shopName || shop?.name || '', site: claim.site || shop?.site || '',
      skuId: sku.sku_id === undefined || sku.sku_id === null ? '' : String(sku.sku_id), claimedAt: task?.createdAt || claim.claimedAt,
      ...(task?.information ? { draft: { taskId: task.id, platform, skuCode: skuCode(sku), shopName: claim.shopName } } : {}),
    };
  });
}

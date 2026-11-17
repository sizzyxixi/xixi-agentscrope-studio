import type { Product } from './commerce-demo-data';
import { listingSourceInformation, listingTaskId, type ProductListingTask } from './product-listing';

const targets = [
  { productId: 'p-cup', skuId: 's-white', shopId: 'mock-listing-amazon-us', shopName: 'HOMENKUR 美国店', platform: 'Amazon', site: 'US' },
  { productId: 'mock-p-bottle', skuId: 'mock-s-bottle', shopId: 'mock-listing-lazada-sg', shopName: 'TRAILDAY 户外精选店', platform: 'Lazada', site: 'SG' },
  { productId: 'p-audio', skuId: 's-audio', shopId: 'mock-listing-shopee-my', shopName: '数码生活旗舰店', platform: 'Shopee', site: 'MY' },
  { productId: 'p-skin', skuId: 's-skin', shopId: 'mock-listing-lazada-th', shopName: 'BOTANIC 泰国旗舰店', platform: 'Lazada', site: 'TH' },
];

/** Presentation-only jobs reference existing fixture SKUs; never create products or shop authorizations. */
export function withListingMocks(tasks: ProductListingTask[], products: Product[], now: string): ProductListingTask[] {
  const additions = targets.flatMap(target => {
    const product = products.find(product => product.id === target.productId && !product.deleted_at);
    if (!product?.skus.some(sku => sku.id === target.skuId && !sku.deleted_at)) return [];
    const id = listingTaskId(target.productId, target.skuId, target.shopId);
    if (tasks.some(task => task.id === id)) return [];
    return [{ ...target, id, presentationMock: true as const, status: (['waiting', 'preparing', 'ready', 'ready'] as const)[targets.indexOf(target)], progress: [0, 45, 100, 100][targets.indexOf(target)],
      message: ['尚未开始准备预刊登信息', '正在为目标店铺准备刊登信息', '预刊登信息已准备完成', '预刊登信息已准备完成'][targets.indexOf(target)], createdAt: now, updatedAt: now,
      information: listingSourceInformation(product, target.skuId),
      records: [], messages: [],
    }];
  });
  return [...tasks, ...additions];
}

/** Frozen presentation states must not become persisted publishing requests. */
export const listingTasksForStorage = (tasks: ProductListingTask[]) => tasks.filter(task => !task.presentationMock);

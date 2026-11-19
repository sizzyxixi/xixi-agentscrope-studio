import type { Product } from './commerce-demo-data';
import { isClaimShopAuthorized, resolveClaimScopes, type ClaimScope, type ClaimShop } from './product-claim';
import { productDisplayId, productFieldValues, productIngredient, productEfficacy, productSourceUrl, type ProductFieldValues } from './product-fields';
import { skuFieldValues, type SkuFieldValues } from './sku-fields';
import { publicationImageUrl, publicationMessageStart, publicationMessageEnd } from './product-publication-message';

export type PublicationProduct = {
  id: string;
  businessId: string;
  image: string;
  fields: ProductFieldValues & { ingredient: string; efficacy: string; source_url: string };
  skus: ({ id: string } & SkuFieldValues)[];
};
export type ProductPublicationContext = {
  shop: Pick<ClaimShop, 'id' | 'name' | 'platform' | 'site' | 'currency'>;
  products: PublicationProduct[];
};

export function publicationAgentId(platform: string) {
  const ids: Record<string, string> = { amazon: 'official-amazon', shopee: 'official-shopee', temu: 'official-temu', lazada: 'official-lazada', tiktok: 'official-tiktok', 'tiktok shop': 'official-tiktok', aliexpress: 'official-aliexpress', ebay: 'official-ebay', shopify: 'official-shopify', walmart: 'official-walmart' };
  return ids[platform.toLowerCase()] || `official-${platform.toLowerCase().replace(/\s+/g, '-')}`;
}

/** Resolve current records before handing off; never broaden a partial SKU selection. */
export function createProductPublicationContext(products: Product[], scopes: ClaimScope[], shop: ClaimShop, cover?: (product: Product, skuId: string) => string): ProductPublicationContext {
  if (!isClaimShopAuthorized(shop)) throw new Error('所选店铺授权已失效，请重新选择。');
  const expected = new Set(scopes.flatMap(scope => scope.skuIds.map(id => JSON.stringify([scope.productId, id]))));
  const resolved = resolveClaimScopes(products, scopes);
  if (!expected.size || resolved.reduce((count, item) => count + item.skuIds.length, 0) !== expected.size) throw new Error('所选商品或 SKU 已变化，请返回列表重新选择。');
  return {
    shop: { id: shop.id, name: shop.name, platform: shop.platform, site: shop.site, currency: shop.currency },
    products: resolved.map(({ product, skuIds }) => ({
      id: product.id, businessId: productDisplayId(product), fields: { ...structuredClone(productFieldValues(product)), ingredient: productIngredient(product), efficacy: productEfficacy(product), source_url: productSourceUrl(product) },
      image: cover?.(product, skuIds[0]) || product.main_image || '',
      skus: product.skus.filter(sku => skuIds.includes(sku.id)).map(sku => ({ id: sku.id, ...skuFieldValues(sku) })),
    })),
  };
}

export const publicationProductName = (product: PublicationProduct) => product.fields.cn_title || product.fields.title || product.fields.spu_code;
export const publicationSkuCount = (context: ProductPublicationContext) => context.products.reduce((count, product) => count + product.skus.length, 0);
export const publicationPrompt = (context: ProductPublicationContext) => `将这批商品刊登到「${context.shop.name}」店铺。`;

/** Supply selected facts to the normal conversation, without images, local IDs or workflow state. */
export function publicationProductMessage(context: ProductPublicationContext) {
  const records = context.products.map(product => ({
    products_id: product.businessId || undefined,
    ...product.fields,
    image: publicationImageUrl(product.image) || undefined,
    skus: product.skus.map(sku => Object.fromEntries(Object.entries(sku).filter(([key]) => key !== 'id'))),
  }));
  return `关联商品：${context.products.length} 个商品 / ${publicationSkuCount(context)} 个 SKU\n${publicationMessageStart}\n${JSON.stringify({ version: 1, shop: context.shop, products: records }, null, 2)}\n${publicationMessageEnd}\n\n`;
}

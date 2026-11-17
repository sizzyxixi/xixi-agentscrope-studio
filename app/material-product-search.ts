import type { Product } from './commerce-demo-data';
import { productCode, productDisplayId, productFieldValues, productTitle } from './product-fields';
import { skuCode, skuSpec } from './sku-fields';

const normalize = (value: string) => value.normalize('NFKC').toLowerCase();

/** Empty searches intentionally reveal no catalog rows. Search only active products and SKUs. */
export function materialProductSuggestions(products: Product[], query: string) {
  const tokens = normalize(query).trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const matches = (value: string) => tokens.every(token => normalize(value).includes(token));
  return products.flatMap(product => {
    if (product.deleted_at) return [];
    const skus = product.skus.filter(sku => !sku.deleted_at);
    const skuText = (sku: typeof skus[number]) => `${skuCode(sku)} ${sku.source_sku_code || ''} ${skuSpec(sku)}`;
    const values = productFieldValues(product);
    const text = `${productTitle(product)} ${values.title} ${productDisplayId(product)} ${productCode(product)} ${values.brand_name} ${skus.map(skuText).join(' ')}`;
    return matches(text) ? [{ product, matchedSkuIds: skus.filter(sku => matches(skuText(sku))).map(sku => sku.id) }] : [];
  });
}

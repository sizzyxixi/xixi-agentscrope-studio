import type { Association, Product } from './commerce-demo-data';

// Keep source SKU IDs and file entities stable while giving each SKU its own product record.
export function splitSkuProducts(products: Product[], links: Association[]) {
  const split = new Map(products.filter(p => p.skus.length > 1).map(p => [p.id, p]));
  return {
    products: products.flatMap(p => p.skus.length <= 1 ? [p] : p.skus.map((sku, index) => ({
      ...structuredClone(p), id: index === 0 ? p.id : `${p.id}--${sku.id}`, code: sku.code,
      name: `${p.name} · ${sku.name || [sku.color, sku.spec].filter(Boolean).join(' ') || sku.code}`,
      dimensions: sku.dimensions || p.dimensions, selling: sku.selling || p.selling,
      skus: [{ ...sku }], confirmedSnapshot: undefined,
    }))),
    links: links.flatMap(link => {
      const p = split.get(link.productId);
      if (!p) return [link];
      return p.skus.flatMap((sku, index) => link.skuIds.length && !link.skuIds.includes(sku.id) ? [] : [{
        ...link, id: `${link.id}--${sku.id}`, productId: index === 0 ? p.id : `${p.id}--${sku.id}`, skuIds: [sku.id],
      }]);
    }),
  };
}

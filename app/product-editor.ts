import type { Association, Product, Sku } from './commerce-demo-data';
import { applyProductFields, productCode, type ProductFieldValues } from './product-fields';
import { applySkuFields, skuCode, skuFieldErrors, skuFieldValues } from './sku-fields';
import { claimSkuIds } from './product-management';
import { reconcileProductSkus } from './product-preparation';

/** Remove exactly one SKU and prune only its claim/material scopes. Shared assets remain intact. */
export function removeProductSku(product: Product, skuId: string, links: Association[]) {
  if (!product.skus.some(sku => sku.id === skuId)) throw new Error('SKU 已不存在，请刷新后重试。');
  const listingClaims = product.listingClaims?.flatMap(claim => {
    const skuIds = claimSkuIds(product, claim).filter(id => id !== skuId);
    return skuIds.length ? [{ ...claim, skuIds }] : [];
  });
  return reconcileProductSkus({ ...product, skus: product.skus.filter(sku => sku.id !== skuId), listingClaims }, links);
}

/** Only existing SPU/SKU fields are editable; keep the latest workflow and ownership metadata. */
export function saveProductDraft(product: Product, skus: Sku[], values: ProductFieldValues, products: Product[], now: string, isNew = false) {
  if (!(values.cn_title.trim() || values.title.trim()) || !values.spu_code.trim() || (isNew && !skus.length) || skus.some(sku => !skuCode(sku).trim())) throw new Error('请补齐商品标题、父商品编码和每个 SKU 货号。');
  const codes = skus.map(sku => skuCode(sku).trim());
  if (new Set(codes).size !== codes.length || products.some(p => p.id !== product.id && !p.deleted_at && (productCode(p) === values.spu_code.trim() || p.skus.some(sku => !sku.deleted_at && codes.includes(skuCode(sku).trim()))))) throw new Error('父商品编码或 SKU 货号重复，请检查。');
  for (const sku of skus) {
    const errors = skuFieldErrors(skuFieldValues(sku));
    if (errors.length) throw new Error(`${skuCode(sku)}：${errors.join('；')}`);
  }
  const saved = applyProductFields(product, values);
  return { ...saved, updatedAt: now, updated_at: now, ...(isNew ? { created_at: now } : {}),
    skus: skus.map(sku => ({ ...applySkuFields(product.skus.find(current => current.id === sku.id) || sku, skuFieldValues(sku)), updated_at: now })),
    activity: [{ id: `save-${now}`, at: now, title: '保存商品资料', detail: '商品资料已更新' }, ...(product.activity || [])],
  };
}

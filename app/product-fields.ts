import type { Product } from './commerce-demo-data';

/** Existing products columns only. IDs stay strings at the UI boundary to preserve BIGINT precision. */
export type ProductsRow = {
  id: string; customer_id: number; customer_uid: string; products_id: string;
  title: string | null; cn_title: string | null; description: string | null; cn_description: string | null;
  attributes: unknown; variables: unknown; extend: unknown; detail_synced_at: string | null;
  brand_id: number | null; brand_name: string | null; video: string | null;
  category_id: number | null; category_name: string | null; main_image: string | null; images: string | null;
  source_type: string; status: number | null; claim_status: number; remarks: string | null;
  target_user: string | null; keyword: string | null; supply_source: string; operate_platform: string; ai_choose: number;
  created_at: string | null; updated_at: string | null; deleted_at: string | null;
  source_product_id: string | null; spu_code: string | null; source_url: string | null;
  ingredient: string | null; efficacy: string | null; last_gathered_at: string | null; last_gather_batch_no: string | null;
};
export type ProductDatabaseFields = Partial<Omit<ProductsRow, 'id'>>;
export const editableProductFields = ['title', 'cn_title', 'description', 'cn_description', 'brand_name', 'category_name', 'spu_code', 'supply_source', 'remarks', 'target_user', 'keyword'] as const;
export type ProductFieldValues = Record<typeof editableProductFields[number], string>;
const text = (value: unknown) => typeof value === 'string' ? value : '';
const own = (product: Product, key: keyof ProductsRow, legacy?: string) => key in product ? text(product[key as keyof Product]) : legacy || '';
export const productTitle = (p: Product) => 'cn_title' in p || 'title' in p ? text(p.cn_title).trim() || text(p.title).trim() : p.name;
export const productCode = (p: Product) => own(p, 'spu_code', p.code);
/** The internal primary key is never a fallback for the customer-facing product ID. */
export const productDisplayId = (p: Product) => p.products_id === null || p.products_id === undefined ? '' : String(p.products_id).trim();
export const productIngredient = (p: Product) => own(p, 'ingredient', ['Excel 导入', '识图采集'].includes(p.source) ? p.material : '');
export const productEfficacy = (p: Product) => own(p, 'efficacy', p.erp?.efficacy);
export const productDescription = (p: Product) => own(p, 'cn_description', p.erp?.description) || text(p.description);
export const productSupplySource = (p: Product) => own(p, 'supply_source', p.erp?.supplySource);
export const productSourceUrl = (p: Product) => own(p, 'source_url', p.erp?.sourceUrl);
export const productRemarks = (p: Product) => own(p, 'remarks', p.erp?.notes);
/** updated_at is never a collection timestamp. The fallback is for existing local collection records. */
export const productGatheredAt = (p: Product) => 'last_gathered_at' in p ? p.last_gathered_at || undefined : p.erp?.syncedAt || p.collectedAt;
export const sourceTypes: Record<string, string> = { westmonth: 'ERP 采集西之月货盘', alibaba: 'ERP 采集1688', alibaba_lapp: '轻应用采集1688', alibaba_lapp_westmonth: '轻应用采集西之月货盘' };
export const supplySources: Record<string, string> = { westmonth: '选品网', alibaba: '阿里1688', product_group: '组合品' };
export const productSourceType = (p: Product) => own(p, 'source_type', p.erp?.sourceType ? ({ '1688': 'alibaba' }[p.erp.sourceType] || p.erp.sourceType) : '');
export function productFieldValues(p: Product): ProductFieldValues {
  return {
    cn_title: own(p, 'cn_title', 'title' in p ? '' : p.name), title: text(p.title),
    cn_description: own(p, 'cn_description', p.erp?.description), description: text(p.description),
    brand_name: own(p, 'brand_name', p.brand), category_name: own(p, 'category_name', p.category),
    spu_code: productCode(p), supply_source: productSupplySource(p),
    remarks: productRemarks(p), target_user: own(p, 'target_user', p.audience), keyword: text(p.keyword),
  };
}
/** Allowlist patch: no new products columns, UI workflow state, SKU fields or arbitrary JSON keys. */
export function productUpdatePatch(values: ProductFieldValues) {
  const patch = Object.fromEntries(editableProductFields.map(key => [key, values[key].trim() || null])) as Record<keyof ProductFieldValues, string | null>;
  return { ...patch, supply_source: values.supply_source.trim() };
}
export function applyProductFields(product: Product, values: ProductFieldValues): Product {
  const patch = productUpdatePatch(values);
  const next: Product = { ...product, ...patch, name: patch.cn_title || patch.title || '', code: patch.spu_code || '', brand: patch.brand_name || '', category: patch.category_name || '', audience: patch.target_user || '',
    // Compatibility aliases for existing creative views, not extra products columns.
    erp: { ...product.erp, description: patch.cn_description || '', notes: patch.remarks || '', supplySource: patch.supply_source || '' },
  };
  Reflect.deleteProperty(next, 'currency');
  return next;
}

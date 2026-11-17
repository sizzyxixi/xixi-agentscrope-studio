import type { Sku } from './commerce-demo-data';

/** Existing products_sku columns. BIGINT identifiers cross the API boundary as strings. */
export type ProductsSkuRow = {
  id: string; products_id: string; pid: string | null; customer_id: number; customer_uid: string; sku_id: string;
  sku_code: string | null; images: string | null; weight: number | null; weight_class: string | null;
  price: string | null; size: string | null; spec: string | null; variants: unknown; spec_id: string; batch_no: string;
  created_at: string | null; updated_at: string | null; deleted_at: string | null; source_sku_code: string | null;
  weight_unit: string | null; product_length: string | null; product_width: string | null; product_height: string | null;
  package_length: string | null; package_width: string | null; package_height: string | null;
  claim_status: number; collect_status: number | null;
};
export type SkuDatabaseFields = Partial<Omit<ProductsSkuRow, 'id' | 'weight' | 'price' | 'spec'>>;
export const productDimensionFields = ['product_length', 'product_width', 'product_height'] as const;
export const packageDimensionFields = ['package_length', 'package_width', 'package_height'] as const;
export const editableSkuFields = ['sku_code', 'source_sku_code', 'spec', 'size', 'weight', 'weight_unit', 'price', ...productDimensionFields, ...packageDimensionFields] as const;
export type SkuFieldValues = Record<typeof editableSkuFields[number], string>;
const text = (value: unknown) => value === null || value === undefined ? '' : String(value);
export const skuCode = (sku: Sku) => 'sku_code' in sku ? sku.sku_code || '' : sku.code;
export const skuPrice = (sku: Sku) => text(sku.price);
export const skuSpec = (sku: Sku) => sku.spec || '';
export function skuWeightUnit(sku: Sku) {
  const raw = sku.weight_unit?.trim() || sku.weightUnit?.trim() || sku.weight_class?.trim() || 'g';
  return ({ 克: 'g', 千克: 'kg', 公斤: 'kg' } as Record<string, string>)[raw] || raw;
}
function legacyDimensions(value?: string): string[] {
  const parts = (value || '').replace(/\s*cm\s*$/i, '').split(/\s*[×x*]\s*/).map(value => value.trim());
  return parts.length === 3 && parts.every(value => value && Number.isFinite(Number(value)) && Number(value) > 0) ? parts : ['', '', ''];
}
export function skuDimensions(sku: Sku, packaged = false) {
  const keys = packaged ? packageDimensionFields : productDimensionFields;
  // A structured NULL is an explicit missing value; never revive a stale display alias.
  return keys.some(key => key in sku) ? keys.map(key => text(sku[key])) : legacyDimensions(packaged ? sku.packagingDimensions : sku.dimensions);
}
export function skuDimensionText(sku: Sku, packaged = false) {
  const values = skuDimensions(sku, packaged);
  return values.every(Boolean) ? `${values.join(' × ')} cm` : values.some(Boolean) ? values.map(value => value || '待补').join(' × ') + ' cm' : '';
}
export function skuFieldValues(sku: Sku): SkuFieldValues {
  const product = skuDimensions(sku), packaged = skuDimensions(sku, true);
  return { sku_code: skuCode(sku), source_sku_code: sku.source_sku_code || '', spec: skuSpec(sku),
    size: 'size' in sku ? sku.size || '' : sku.dimensions && !product.some(Boolean) ? sku.dimensions : '',
    weight: text(sku.weight), weight_unit: skuWeightUnit(sku), price: skuPrice(sku),
    product_length: product[0], product_width: product[1], product_height: product[2], package_length: packaged[0], package_width: packaged[1], package_height: packaged[2] };
}
export function validSkuDecimal(value: string, precision = 12, scale = 2, positive = false) {
  if (!/^(?:\d+|\d*\.\d+)$/.test(value.trim())) return false;
  const [integer, decimal = ''] = value.trim().split('.');
  return (integer.replace(/^0+/, '').length || 1) <= precision - scale && decimal.length <= scale && (!positive || Number(value) > 0);
}
export function skuFieldErrors(values: SkuFieldValues) {
  const errors: string[] = [];
  for (const [key, label, max] of [['sku_code', 'SKU 货号', 255], ['source_sku_code', '来源原始货号', 255], ['spec', '规格', 255], ['size', '尺寸说明', 150]] as const) if (values[key].length > max) errors.push(`${label}不能超过 ${max} 字`);
  if (values.price.trim() && !validSkuDecimal(values.price)) errors.push('价格须为非负数字，最多 10 位整数和 2 位小数');
  if (values.weight.trim() && (!Number.isFinite(Number(values.weight)) || Number(values.weight) <= 0)) errors.push('重量须为大于 0 的数字');
  if (!['g', 'kg'].includes(values.weight_unit)) errors.push('请核对重量单位，仅支持 g / kg');
  if ([...productDimensionFields, ...packageDimensionFields].some(key => values[key].trim() && !validSkuDecimal(values[key], 10, 2, true))) errors.push('产品及包装长宽高须为正数，最多 8 位整数和 2 位小数，单位 cm');
  return errors;
}
/** Only editable existing columns. Relations, owner IDs, variants, source IDs and statuses are never guessed. */
export function skuUpdatePatch(values: SkuFieldValues) {
  const errors = skuFieldErrors(values); if (errors.length) throw new Error(errors.join('；'));
  const nullable = (value: string) => value.trim() || null;
  return { sku_code: nullable(values.sku_code), source_sku_code: nullable(values.source_sku_code), spec: values.spec.trim(), size: nullable(values.size),
    weight: values.weight.trim() ? Number(values.weight) : null, weight_unit: values.weight_unit, price: nullable(values.price),
    product_length: nullable(values.product_length), product_width: nullable(values.product_width), product_height: nullable(values.product_height),
    package_length: nullable(values.package_length), package_width: nullable(values.package_width), package_height: nullable(values.package_height) };
}
export function applySkuFields(sku: Sku, values: SkuFieldValues): Sku {
  const patch = skuUpdatePatch(values);
  const next: Sku = { ...sku, ...patch, code: patch.sku_code || '', spec: patch.spec, color: '',
    // Legacy display aliases remain for creative snapshots; write patches contain only existing columns.
    weight: patch.weight === null ? '' : String(patch.weight), weightUnit: patch.weight_unit, price: patch.price || '',
    dimensions: productDimensionFields.every(key => patch[key]) ? productDimensionFields.map(key => patch[key]).join(' × ') : '',
    packagingDimensions: packageDimensionFields.every(key => patch[key]) ? packageDimensionFields.map(key => patch[key]).join(' × ') : '' };
  for (const key of ['name', 'profile', 'craftsmanship', 'selling']) Reflect.deleteProperty(next, key);
  return next;
}
export function skuFromRow(row: ProductsSkuRow): Sku {
  return { ...row, id: String(row.id), code: row.sku_code || '', spec: row.spec || '', color: '', weight: text(row.weight), price: text(row.price) };
}
export function skuImageUrls(sku: Sku): string[] {
  if (!sku.images) return [];
  let values: unknown = sku.images;
  try { values = JSON.parse(sku.images); } catch { /* A single URL is also a valid source representation. */ }
  return (Array.isArray(values) ? values : [values]).map(value => value && typeof value === 'object' && 'url' in value ? value.url : value).filter((value): value is string => typeof value === 'string' && /^(?:https?:\/\/|data:image\/|\/)/i.test(value));
}

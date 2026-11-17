import type { Sku } from './commerce-demo-data';
import { skuCode, skuDimensions, skuFieldValues, skuPrice, skuSpec, skuWeightUnit, type ProductsSkuRow } from './sku-fields';
import { productInformationTime, productRawValue } from './product-information-fields';

export type SkuArchiveFact = { keys: (keyof ProductsSkuRow)[]; label: string; value: string; raw?: boolean };
const status = (value: unknown, labels: Record<string, string>) => {
  const raw = productRawValue(value);
  return raw ? labels[raw] || raw : '';
};
const dimensions = (sku: Sku, packaged = false) => {
  const values = skuDimensions(sku, packaged);
  return values.some(Boolean) ? `${values.map(value => value || '—').join(' × ')} cm` : '';
};

/** Existing SKU columns only: everyday facts stay flat; tracing/opaque payloads remain read-only. */
export function skuArchiveFields(sku: Sku): { fields: SkuArchiveFact[]; records: SkuArchiveFact[] } {
  const field = (key: keyof ProductsSkuRow, label: string, value = productRawValue(sku[key as keyof Sku]), raw = false): SkuArchiveFact => ({ keys: [key], label, value, raw });
  const weight = productRawValue(sku.weight);
  return {
    fields: [
      field('sku_code', 'SKU 货号', skuCode(sku)), field('source_sku_code', '来源原始货号'),
      field('spec', '规格', skuSpec(sku)), field('price', '价格', skuPrice(sku)),
      field('weight', '重量', weight), field('weight_unit', '重量单位', skuWeightUnit(sku)),
      { keys: ['product_length', 'product_width', 'product_height'], label: '产品尺寸', value: dimensions(sku) },
      { keys: ['package_length', 'package_width', 'package_height'], label: '包装尺寸', value: dimensions(sku, true) },
      field('size', '尺寸说明', skuFieldValues(sku).size),
      field('sku_id', '西之月 SKU ID'), field('spec_id', '来源规格 ID'),
      field('batch_no', '采集批次', 'batch_no' in sku ? productRawValue(sku.batch_no) : sku.batch || ''),
      field('collect_status', '采集状态', status(sku.collect_status, { 2: '采集成功' })),
      field('claim_status', '认领状态', status(sku.claim_status, { 1: '未认领', 2: '已认领' })),
    ],
    records: [
      field('id', 'SKU 记录 ID'), field('pid', '关联商品 ID'), field('products_id', '西之月产品 ID'),
      field('customer_id', '用户 ID'), field('customer_uid', '客户 UID'), field('weight_class', '历史重量单位'),
      field('created_at', '创建时间', productInformationTime(sku.created_at)), field('updated_at', '更新时间', productInformationTime(sku.updated_at)),
      field('deleted_at', '删除时间', productInformationTime(sku.deleted_at)),
      field('variants', '规格下标', productRawValue(sku.variants), true), field('images', '原始图片', productRawValue(sku.images), true),
    ],
  };
}

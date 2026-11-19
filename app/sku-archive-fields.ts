import type { Sku } from './commerce-demo-data';
import { skuCode, skuDimensions, skuPrice, skuSpec, skuWeightUnit, type ProductsSkuRow } from './sku-fields';
import { productInformationTime, productRawValue } from './product-information-fields';

export type SkuArchiveFact = { keys: (keyof ProductsSkuRow)[]; label: string; value: string; raw?: boolean; hint?: string };
const dimensions = (sku: Sku, packaged = false) => {
  const values = skuDimensions(sku, packaged);
  return values.some(Boolean) ? `${values.map(value => value || '—').join(' × ')} cm` : '';
};

/** Show merchant-facing facts; technical IDs, legacy size prose and ingestion state stay hidden. */
export function skuArchiveFields(sku: Sku): { fields: SkuArchiveFact[]; records: SkuArchiveFact[] } {
  const field = (key: keyof ProductsSkuRow, label: string, value = productRawValue(sku[key as keyof Sku]), raw = false): SkuArchiveFact => ({ keys: [key], label, value, raw });
  const weight = productRawValue(sku.weight);
  return {
    fields: [
      field('sku_code', 'SKU 货号', skuCode(sku)), field('source_sku_code', '来源原始货号'),
      field('spec', '规格', skuSpec(sku)), field('price', '价格', skuPrice(sku)),
      { keys: ['weight', 'weight_unit', 'weight_class'], label: '重量', value: weight ? `${weight} ${skuWeightUnit(sku)}` : '' },
      { keys: ['product_length', 'product_width', 'product_height'], label: '产品尺寸', value: dimensions(sku), hint: '长 × 宽 × 高' },
      { keys: ['package_length', 'package_width', 'package_height'], label: '包装尺寸', value: dimensions(sku, true), hint: '长 × 宽 × 高' },
    ],
    records: [
      field('batch_no', '采集批次', 'batch_no' in sku ? productRawValue(sku.batch_no) : sku.batch || ''),
      field('created_at', '创建时间', productInformationTime(sku.created_at)), field('updated_at', '更新时间', productInformationTime(sku.updated_at)),
      field('variants', '规格下标', productRawValue(sku.variants), true),
    ],
  };
}

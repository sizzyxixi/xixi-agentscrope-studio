import type { Product } from './commerce-demo-data';
import { productFieldValues, productGatheredAt, productIngredient, productEfficacy, productSourceUrl, productSourceType, productSupplySource, sourceTypes, supplySources, type ProductsRow } from './product-fields';

import { productSalesSpecifications, type SalesSpecification } from './product-sales-specifications';

export type ProductInformationFact = { key: keyof ProductsRow; label: string; value: string; json?: boolean; specifications?: SalesSpecification[]; link?: boolean; wide?: boolean };
export type ProductInformationSection = { id: string; title: string; fields: ProductInformationFact[]; collapsed?: boolean };

/** Display raw source data without defining JSON schemas, rounding identifiers or inventing enums. */
export function productRawValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}
export function productInformationTime(value: unknown): string {
  if (typeof value !== 'string' || !value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
}
const enumValue = (value: unknown, labels: Record<string, string>) => {
  const raw = productRawValue(value);
  return raw ? labels[raw] || raw : '';
};

/** Business-facing details only; source URLs are optional read-only navigation. */
export function productInformationSections(product: Product): ProductInformationSection[] {
  const values = productFieldValues(product);
  const fact = (key: keyof ProductsRow, label: string, extra: Partial<ProductInformationFact> = {}): ProductInformationFact => ({ key, label, value: productRawValue(product[key as keyof Product]), ...extra });
  const editable = (key: keyof typeof values, label: string, extra: Partial<ProductInformationFact> = {}) => fact(key, label, { value: values[key], ...extra });
  return [
    { id: 'basic', title: '基础信息', fields: [
      editable('cn_title', '中文产品标题'), editable('title', '英文产品标题'),
      editable('cn_description', '中文描述', { wide: true }), editable('description', '英文描述', { wide: true }),
      editable('spu_code', '父商品编码'), editable('brand_name', '品牌名称'),
      fact('supply_source', '货源', { value: enumValue(productSupplySource(product), supplySources) }),
      fact('variables', '销售规格', { json: true, wide: true, specifications: productSalesSpecifications(product.variables) }),
      editable('target_user', '目标用户'), editable('keyword', '关键字'), editable('remarks', '备注', { wide: true }),
    ] },
    { id: 'more', title: '更多资料', collapsed: true, fields: [
      editable('category_name', '类目名称'),
      fact('ingredient', '成分', { value: productIngredient(product) }), fact('efficacy', '功效', { value: productEfficacy(product) }),
      fact('source_type', '采集类型', { value: enumValue(productSourceType(product), sourceTypes) || product.source }),
      fact('source_product_id', '来源商品 ID'),
      ...(/^https?:\/\//i.test(productSourceUrl(product).trim()) ? [fact('source_url', '来源链接', { value: productSourceUrl(product).trim(), link: true })] : []),
      fact('detail_synced_at', '详情采集时间', { value: productInformationTime(product.detail_synced_at) }),
      fact('last_gathered_at', '最近成功采集时间', { value: productInformationTime(productGatheredAt(product)) }),
      fact('last_gather_batch_no', '最近采集批次'),
      fact('created_at', '创建时间', { value: productInformationTime(product.created_at) }),
      fact('updated_at', '更新时间', { value: productInformationTime(product.updated_at) }),
    ] },
  ];
}

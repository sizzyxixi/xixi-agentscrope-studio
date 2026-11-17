import type { Product } from './commerce-demo-data';
import { excludeExistingSkus, importColumns, type parseProductTable } from './product-import';

export type PreviewFilter = '全部' | '可导入' | '错误' | '重复' | '提示';
export type ImportPreviewRow = {
  row: number; status: '可导入' | '错误' | '重复跳过' | '提示';
  title: string; parent: string; sku: string; spec: string; messages: string[];
  values: string[]; generatedParent: boolean; generatedSku: boolean; warnings: boolean;
};

/** Presentation only: validation and deduplication continue to use the existing rules. */
export function productImportPreview(data: ReturnType<typeof parseProductTable>, products: Product[]) {
  const plan = excludeExistingSkus(data.rows, products);
  const included = new Set(plan.rows.flatMap(item => item.product.skus.map(sku => sku.id)));
  const valid = new Map(data.rows.flatMap(item => item.product.skus.map(sku => [item.origins![sku.id].row, { item, sku }] as const)));
  const issues = new Map(data.issues.map(issue => [issue.row, issue]));
  const warnings = new Map<number, string[]>();
  for (const warning of data.warnings) warnings.set(warning.row, [...(warnings.get(warning.row) || []), warning.message]);
  const normalize = (value: string) => value.replace(/[（）]/g, char => char === '（' ? '(' : ')').replace(/[\s*]/g, '');
  const headers = data.rawRows[0].map(normalize);
  const columns = importColumns.map(column => {
    const index = headers.indexOf(normalize(column));
    return index === -1 && column === '价格' ? headers.indexOf('售价') : index;
  });
  const rows: ImportPreviewRow[] = data.rawRows.slice(data.dataStart).flatMap((raw, index) => {
    if (!raw.some(value => String(value || '').trim())) return [];
    const row = data.dataStart + index + 1, ready = valid.get(row), issue = issues.get(row);
    const values = columns.map(index => String(raw[index] || '').trim());
    const duplicate = !!ready && !included.has(ready.sku.id), hints = warnings.get(row) || [];
    return [{ row, values, status: issue ? '错误' : duplicate ? '重复跳过' : hints.length ? '提示' : '可导入',
      title: ready?.item.product.name || values[1], parent: ready?.item.product.code || issue?.code || values[0],
      sku: ready?.sku.code || values[8], spec: ready?.sku.spec || values[9],
      generatedParent: !!ready && !ready.item.origins![ready.sku.id].parentExplicit,
      generatedSku: !!ready && !ready.item.origins![ready.sku.id].skuExplicit,
      warnings: hints.length > 0, messages: issue ? [issue.message] : [...(duplicate ? ['已存在相同 SKU，跳过且不覆盖已有资料'] : []), ...hints],
    }];
  });
  return { rows, groupCount: new Set(rows.map(row => row.parent || `row:${row.row}`)).size,
    productCount: plan.rows.length, importable: plan.rows.reduce((count, item) => count + item.product.skus.length, 0),
    errors: data.issues.length, duplicates: plan.skipped, warnings: rows.filter(row => row.warnings).length };
}
export function filterImportPreview(rows: ImportPreviewRow[], filter: PreviewFilter) {
  return rows.filter(row => filter === '全部' || filter === '可导入' && ['可导入', '提示'].includes(row.status) || filter === '错误' && row.status === '错误' || filter === '重复' && row.status === '重复跳过' || filter === '提示' && row.warnings);
}

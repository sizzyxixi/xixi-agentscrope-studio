import { importColumns, type ImportIssue } from './product-import';
import type { ImportPreviewRow, productImportPreview } from './product-import-preview';

export const excelImportScenarios = [
  { title: '上传', options: [{ id: 'upload-initial', label: '初始化' }, { id: 'upload-failed', label: '校验失败' }] },
  { title: '校验', options: [{ id: 'validation-passed', label: '全部通过' }, { id: 'validation-empty', label: '无数据' }, { id: 'validation-failed', label: '全部失败' }, { id: 'validation-partial', label: '部分通过' }] },
  { title: '落库', options: [{ id: 'store-success', label: '全部成功' }, { id: 'store-partial', label: '部分成功' }, { id: 'store-failed', label: '全部失败' }] },
] as const;
export type ExcelImportScenario = typeof excelImportScenarios[number]['options'][number]['id'];
export type ValidationOutcome = 'passed' | 'empty' | 'failed' | 'partial';
export type StoreOutcome = 'success' | 'partial' | 'failed';

/** UI fixtures never read files or produce records for the product catalog. */
export function createExcelImportDemo(outcome: ValidationOutcome = 'partial') {
  const entry = (row: number, parent: string, title: string, sku: string, spec: string, status: ImportPreviewRow['status'], messages: string[] = []): ImportPreviewRow => ({
    row, parent, title, sku, spec, status, messages, generatedParent: false, generatedSku: false, warnings: status === '提示',
    values: [parent, title, '日用品牌', 'https://example.com/product/main.jpg', '日常使用，便于清洁', '不锈钢；PP', '便携；收纳', '供应商A', sku, spec, '', status === '错误' ? '300g' : '300', 'g', '39', '8', '8', '10', '12', '12', '14'],
  });
  let rows = [
    entry(7, 'CUP-350', '北欧哑光陶瓷马克杯', 'CUP-W350', '奶油白 / 350ml', '可导入'),
    entry(8, 'CUP-350', '北欧哑光陶瓷马克杯', 'CUP-B350', '曜石黑 / 350ml', '重复跳过', ['已存在相同 SKU，跳过且不覆盖已有资料']),
    entry(9, 'BOT-500', '不锈钢随行水瓶', 'BOT-S500', '银色 / 500ml', '可导入'),
    entry(10, 'BOT-500', '不锈钢随行水瓶', 'BOT-B500', '黑色 / 500ml', '提示', ['商品级信息已按组首行取值']),
    entry(11, 'BOX-01', '桌面透明收纳盒', 'BOX-S', '透明 / 小号', '错误', ['重量只填大于 0 的数字，单位选在「重量单位」列']),
    entry(12, 'BAG-01', '日常帆布托特包', 'BAG-N', '原色 / 标准款', '可导入'),
  ];
  rows[0].values[5] = rows[1].values[5] = '陶瓷';
  rows[4].values[5] = 'PP'; rows[5].values[5] = '棉';
  rows[3].values[2] = '其他品牌';
  if (outcome === 'empty') rows = [];
  else if (outcome !== 'partial') rows = rows.map<ImportPreviewRow>((row, index) => {
    if (outcome === 'passed') { row.values[11] = '300'; row.values[2] = '日用品牌'; return { ...row, status: '可导入', messages: [], warnings: false }; }
    const messages = ['重量只填大于 0 的数字，单位选在「重量单位」列', '规格不能为空', '产品及包装长宽高须填写正数，单位 cm'];
    if (index % 3 === 0) row.values[11] = '300g';
    else if (index % 3 === 1) { row.values[9] = ''; row.spec = ''; }
    else row.values[14] = '';
    return { ...row, status: '错误', messages: [messages[index % 3]], warnings: false };
  });
  const issues: ImportIssue[] = rows.filter(row => row.status === '错误').map(row => ({ row: row.row, code: row.parent, message: row.messages.join('；') }));
  const candidates = rows.filter(row => row.status === '可导入' || row.status === '提示');
  const preview: ReturnType<typeof productImportPreview> = { rows, groupCount: new Set(rows.map(row => row.parent)).size, productCount: new Set(candidates.map(row => row.parent)).size, importable: candidates.length, errors: issues.length, duplicates: rows.filter(row => row.status === '重复跳过').length, warnings: rows.filter(row => row.warnings).length };
  return { preview, issues, rawRows: [importColumns.slice(), [], [], [], [], [], ...rows.map(row => row.values.slice())] };
}

export function createExcelStoreResult(data: ReturnType<typeof createExcelImportDemo>, outcome: StoreOutcome = 'success') {
  const candidates = data.preview.rows.filter(row => row.status === '可导入' || row.status === '提示');
  const failedCount = outcome === 'failed' ? candidates.length : outcome === 'partial' && candidates.length ? Math.max(1, Math.floor(candidates.length / 3)) : 0;
  const issues = [...data.issues, ...candidates.slice(candidates.length - failedCount).map(row => ({ row: row.row, code: row.parent, message: '商品保存失败，请稍后重试。' }))].sort((a, b) => a.row - b.row);
  const success = candidates.length - failedCount;
  return { success, skipped: data.preview.duplicates, issues, outcome: issues.length ? success ? 'partial' as const : 'failed' as const : 'success' as const };
}

export function createExcelScenario(scenario?: ExcelImportScenario) {
  const validation = scenario?.startsWith('validation-') ? scenario.slice(11) as ValidationOutcome : null;
  const store = scenario?.startsWith('store-') ? scenario.slice(6) as StoreOutcome : null;
  const data = validation || store ? createExcelImportDemo(validation || 'passed') : null;
  return { step: store ? 3 : validation ? 1 : 0, data, result: store && data ? createExcelStoreResult(data, store) : null,
    file: scenario && scenario !== 'upload-initial' ? '商品导入清单.xlsx' : '', uploadState: scenario === 'upload-failed' ? 'failed' as const : 'idle' as const };
}

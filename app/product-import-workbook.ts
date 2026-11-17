import type { ImportIssue } from './product-import';

export async function readProductWorkbook(file: File) {
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) throw new Error('请上传 XLSX、XLS 或 CSV 文件。');
  if (file.size > 20 * 1024 * 1024) throw new Error('文件不能超过 20MB。');
  const xlsx = await import('@e965/xlsx');
  const workbook = xlsx.read(await file.arrayBuffer(), { type: 'array', sheetRows: 2008, cellDates: false });
  const name = workbook.SheetNames[0];
  if (!name) throw new Error('文件没有可读取的工作表。');
  if (/商品导入模板_v/.test(name) && name !== '商品导入模板_v2.2') throw new Error('模板版本不匹配，请下载 v2.2 模板。');
  const table = xlsx.utils.sheet_to_json<string[]>(workbook.Sheets[name], { header: 1, defval: '', raw: false, blankrows: true }).map(row => row.map(String));
  const versioned = name === '商品导入模板_v2.2' || table[1]?.[0]?.includes('v2.2');
  return { table, dataStart: versioned ? 6 : 1 };
}
/** Serve the reviewed workbook so formatting and the rules sheet survive download. */
export async function createProductTemplate(fetcher: typeof fetch = fetch) {
  const response = await fetcher('/templates/product-import-v2.2.xlsx', { cache: 'no-cache' });
  if (!response.ok) throw new Error('模板下载失败，请重试。');
  return response.blob();
}
export async function createErrorWorkbook(table: string[][], issues: ImportIssue[]) {
  const xlsx = await import('@e965/xlsx'); const workbook = xlsx.utils.book_new();
  const rows = [[...table[0], '原始行号', '错误说明'], ...issues.map(issue => [...Array.from({ length: table[0].length }, (_, i) => table[issue.row - 1]?.[i] || ''), String(issue.row), issue.message])];
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet(rows), '待修正商品');
  return new Blob([xlsx.write(workbook, { type: 'array', bookType: 'xlsx' })]);
}

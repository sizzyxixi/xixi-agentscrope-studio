import { registerHooks } from 'node:module';
import { extname } from 'node:path';
registerHooks({ resolve(specifier, context, next) { return next(specifier.startsWith('.') && !extname(specifier) && context.parentURL?.includes('/app/') ? `${specifier}.ts` : specifier, context); } });
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import * as xlsx from '@e965/xlsx';
const { importColumns, parseProductTable } = await import('../app/product-import.ts');
// Resolve the browser module's imports explicitly so Node can exercise its real workbook code.
const source = (await readFile(new URL('../app/product-import-workbook.ts', import.meta.url), 'utf8'))
  .replace("'./product-import'", JSON.stringify(new URL('../app/product-import.ts', import.meta.url).href))
  .replaceAll("'@e965/xlsx'", JSON.stringify(import.meta.resolve('@e965/xlsx')));
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { createProductTemplate, readProductWorkbook, createErrorWorkbook } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const templateBlob = () => createProductTemplate(async url => {
  assert.equal(url, '/templates/product-import-v2.2.xlsx');
  return new Response(await readFile(new URL('../public/templates/product-import-v2.2.xlsx', import.meta.url)));
});
const row = (code) => importColumns.map(key => ({'商品标题(中文)':'杯子','主图URL':'https://example.com/cup.jpg','成分':'陶瓷','功效':'饮水','SKU货号':code,'规格(货源侧)':'白色','重量':'300','产品尺寸(长 cm)':'8','产品尺寸(宽 cm)':'8','产品尺寸(高 cm)':'10','包装尺寸(长 cm)':'10','包装尺寸(宽 cm)':'10','包装尺寸(高 cm)':'12'}[key] || ''));
const file = (book, type = 'xlsx') => new File([xlsx.write(book, {type:'array',bookType:type === 'xls' ? 'biff8' : type})], `test.${type}`);

test('downloaded v2.2 template has two sheets, four examples and excludes all examples on import', async () => {
  const template = await templateBlob(); const workbook = xlsx.read(await template.arrayBuffer());
  assert.deepEqual(workbook.SheetNames, ['商品导入模板_v2.2','填写说明']);
  const rows = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {header:1});
  assert.equal(rows.filter(row => row.some(value => String(value).trim())).length, 6);
  assert.deepEqual(rows[0].map(value => value.replace(/\s*\*$/, '')), importColumns);
  assert.equal(rows[0].filter(value => value.endsWith('*')).length, 10);
  assert.equal(rows[6]?.some(value => String(value).trim()) || false, false);
  assert.ok(xlsx.utils.sheet_to_json(workbook.Sheets['填写说明'], {header:1}).flat().some(value => String(value).includes('仅导入通过行')));
  assert.equal(workbook.Sheets[workbook.SheetNames[0]].N1.v, '价格');
  for (const key of ['F', 'G']) assert.match(workbook.Sheets[workbook.SheetNames[0]][`${key}2`].v, /选填/);
  const notes = xlsx.utils.sheet_to_json(workbook.Sheets['填写说明'], {header:1}).flat().join(' ');
  assert.match(notes, /10项必填/);
  assert.doesNotMatch(notes, /12项必填/);
  const loaded = await readProductWorkbook(new File([template], 'template.xlsx'));
  assert.equal(loaded.dataStart, 6);
  assert.throws(() => parseProductTable(loaded.table, 'batch', loaded), /第 7 行/);
});
test('XLSX reads every one of 2000 formal rows, not just the former 500-row limit', async () => {
  const template = await templateBlob(); const workbook = xlsx.read(await template.arrayBuffer());
  xlsx.utils.sheet_add_aoa(workbook.Sheets[workbook.SheetNames[0]], Array.from({length:2000}, (_, i) => row(`SKU-${i}`)), {origin:'A7'});
  const loaded = await readProductWorkbook(file(workbook)); const parsed = parseProductTable(loaded.table, 'batch', loaded);
  assert.equal(parsed.total, 2000); assert.equal(parsed.passed, 2000); assert.equal(parsed.rows.at(-1).product.skus[0].code, 'SKU-1999');
});
test('template download fails explicitly instead of returning an error page as a workbook', async () => {
  await assert.rejects(() => createProductTemplate(async () => new Response('missing', { status:404 })), /模板下载失败/);
});
test('legacy binary XLS and CSV are parsed using the same 20-column contract', async () => {
  const book = xlsx.utils.book_new(); xlsx.utils.book_append_sheet(book, xlsx.utils.aoa_to_sheet([importColumns,row('ONE')]), '商品');
  for (const type of ['xls','csv']) { const loaded = await readProductWorkbook(file(book,type)); assert.equal(parseProductTable(loaded.table, 'batch', loaded).passed, 1); }
});
test('wrong version is rejected, and error rows preserve editable source data for reimport', async () => {
  const book = xlsx.utils.book_new(); xlsx.utils.book_append_sheet(book, xlsx.utils.aoa_to_sheet([importColumns,row('ONE')]), '商品导入模板_v1.0');
  await assert.rejects(() => readProductWorkbook(file(book)), /版本/);
  const table = [importColumns, row('ONE'), row('TWO')];
  const errorFile = await createErrorWorkbook(table, [{row:3,code:'X',message:'修正重量'}]);
  const loaded = await readProductWorkbook(new File([errorFile], 'errors.xlsx'));
  assert.equal(loaded.table[1][8], 'TWO'); assert.equal(loaded.table[1][20], '3');
  assert.equal(parseProductTable(loaded.table, 'retry', loaded).passed, 1);
});

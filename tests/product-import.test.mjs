import { registerHooks } from 'node:module';
import { extname } from 'node:path';
registerHooks({ resolve(specifier, context, next) { return next(specifier.startsWith('.') && !extname(specifier) && context.parentURL?.includes('/app/') ? `${specifier}.ts` : specifier, context); } });
import assert from 'node:assert/strict';
import test from 'node:test';
const { inspectLinks, parseProductTable, checkImageFile, importColumns } = await import('../app/product-import.ts');

test('link collection canonicalizes duplicate URLs and IDs and rejects wrong source/product paths', () => {
  const result = inspectLinks('https://detail.1688.com/offer/6945218330.htm\n6945218330\n\nhttps://1688.com/not-a-product\ninvalid', '1688');
  assert.equal(result.duplicates, 1);
  assert.equal(result.results.length, 3);
  assert.equal(result.results[0].sourceId, '6945218330');
  assert.deepEqual(result.results.slice(1).map(row => row.code), ['LINK_INVALID', 'LINK_INVALID']);
  assert.equal(inspectLinks('https://amazon.com.evil.test/dp/B0C7XK2M1P', 'Amazon').results[0].status, '失败');
  assert.equal(inspectLinks('https://www.amazon.com/dp/B0C7XK2M1P?ref=abc', 'Amazon').results[0].sourceId, 'B0C7XK2M1P');
});
test('link limit applies after duplicate removal while preserving invalid entries in results', () => {
  assert.equal(inspectLinks(Array(60).fill('123').join('\n'), '1688').results.length, 1);
  assert.throws(() => inspectLinks(Array.from({length:51}, (_, i) => String(1000+i)).join('\n'), '1688'), /50/);
});
const row = (values = {}) => importColumns.map(key => ({ '父商品编码':'CUP', '商品标题(中文)':'陶瓷杯', '主图URL':'https://example.com/cup.jpg', '成分':'陶瓷', '功效':'日常饮水', 'SKU货号':'CUP-W', '规格(货源侧)':'350ml', '重量':'280', '重量单位':'g', '产品尺寸(长 cm)':'8', '产品尺寸(宽 cm)':'8', '产品尺寸(高 cm)':'10', '包装尺寸(长 cm)':'12', '包装尺寸(宽 cm)':'12', '包装尺寸(高 cm)':'14', ...values }[key] || ''));
test('Excel groups multiple SKU rows and inherits facts from only the first group row', () => {
  const result = parseProductTable([importColumns, row(), row({'SKU货号':'CUP-B','规格(货源侧)':'蓝色;350ml','商品标题(中文)':'','主图URL':'','成分':'','功效':''})], 'batch');
  assert.equal(result.rows.length, 1);
  assert.equal(result.passed, 2);
  assert.equal(result.rows[0].product.name, '陶瓷杯');
  assert.deepEqual(result.rows[0].product.skus.map(sku => sku.code), ['CUP-W', 'CUP-B']);
  assert.equal(result.rows[0].images.length, 2);
});
test('missing group facts fail every row, while SKU-specific errors fail only that row', () => {
  const invalidGroup = parseProductTable([importColumns, row({'商品标题(中文)':''}), row({'SKU货号':'CUP-B','规格(货源侧)':'蓝色;350ml'})], 'batch');
  assert.equal(invalidGroup.rows.length, 0);
  assert.equal(invalidGroup.issues.length, 2);
  const partial = parseProductTable([importColumns, row(), row({'SKU货号':'CUP-B','规格(货源侧)':'蓝色;350ml','重量':'300g'})], 'batch');
  assert.equal(partial.passed, 1);
  assert.equal(partial.issues[0].row, 3);
  assert.equal(partial.rows[0].product.skus.length, 1);
});
test('blank parent codes create independent products; wrong templates cannot silently import', () => {
  const result = parseProductTable([importColumns, row({'父商品编码':''}), row({'父商品编码':'','SKU货号':'B'})], 'batch');
  assert.equal(result.rows.length, 2);
  assert.notEqual(result.rows[0].product.code, result.rows[1].product.code);
  assert.throws(() => parseProductTable([['商品名称'], ['杯子']], 'batch'), /缺少模板列/);
});
test('image input accepts supported images only and enforces the per-image size cap', () => {
  assert.equal(checkImageFile({type:'image/png',size:5*1024*1024}), '');
  assert.match(checkImageFile({type:'image/gif',size:100}), /格式/);
  assert.match(checkImageFile({type:'image/jpeg',size:5*1024*1024+1}), /5MB/);
});

test('format validation queues a link, never declares a product successful', () => {
  const parsed = inspectLinks('6945218330\n123\nhttps://qr.1688.com/a\nhttps://www.amazon.de/dp/B0C7XK2M1P', '1688');
  assert.equal(parsed.results[0].status, '待采集');
  assert.equal(parsed.results[1].status, '失败');
  assert.match(parsed.results[2].message, /源站/);
  assert.equal(parsed.results[3].code, 'PLAT_MISMATCH');
  const amazon = inspectLinks('https://www.amazon.co.uk/gp/product/B0C7XK2M1P/ref=abc?th=1', 'Amazon');
  assert.equal(amazon.results[0].sourceSite, 'amazon.co.uk');
  assert.equal(amazon.results[0].sourceId, 'B0C7XK2M1P');
  assert.equal(inspectLinks('https://m.1688.com/offer/6945218330.html?spm=x', '1688').results[0].sourceId, '6945218330');
});

test('Excel validates SKU uniqueness across parents, normalized specs, URLs, price and text lengths', () => {
  assert.equal(parseProductTable([importColumns, row(), row({'父商品编码':'OTHER'})], 'batch').issues.length, 2);
  assert.equal(parseProductTable([importColumns, row({'规格(货源侧)':'Ａ；Ｍ'}), row({'SKU货号':'NEW','规格(货源侧)':'A;M'})], 'batch').issues.length, 2);
  const invalid = parseProductTable([importColumns, row({'SKU图URL':'bad','价格':'abc','商品标题(中文)':'a'.repeat(101)})], 'batch');
  assert.equal(invalid.passed, 0);
  const price = parseProductTable([importColumns, row({'SKU图URL':'bad','价格':'abc'})], 'batch');
  assert.match(price.issues[0].message, /SKU 图 URL/);
  assert.match(price.issues[0].message, /价格/);
});

test('Excel warns on conflicting group facts and medical claims without blocking valid rows', () => {
  const parsed = parseProductTable([importColumns, row({'功效':'治疗皮肤问题'}), row({'SKU货号':'CUP-B','规格(货源侧)':'蓝色','商品标题(中文)':'错误的后续标题'})], 'batch');
  assert.equal(parsed.passed, 2);
  assert.equal(parsed.rows[0].product.name, '陶瓷杯');
  assert.equal(parsed.rows[0].product.category, '');
  assert.ok(parsed.warnings.some(issue => issue.message.includes('首行')));
  assert.ok(parsed.warnings.some(issue => issue.message.includes('医疗')));
});

test('Excel reads all 2000 data rows and excludes v2.2 example rows', () => {
  const rows = Array.from({length:2000}, (_, i) => row({'父商品编码':'','SKU货号':`SKU-${i}`}));
  const result = parseProductTable([importColumns, ['v2.2'], row(), row(), row(), row(), ...rows], 'batch');
  assert.equal(result.total, 2000);
  assert.equal(result.passed, 2000);
  assert.equal(result.rows[0].origins[result.rows[0].product.skus[0].id].row, 7);
  assert.throws(() => parseProductTable([importColumns, ...rows, row()], 'batch'), /2000/);
});

test('generic price heading accepts the previous price-caption alias without changing column count', () => {
  assert.equal(importColumns[13], '价格');
  const headers = importColumns.map(column => column === '价格' ? '售价' : column);
  const parsed = parseProductTable([headers, row({ '价格': '12.50' })], 'legacy-caption');
  assert.equal(parsed.passed, 1); assert.equal(parsed.rows[0].product.skus[0].price, '12.50');
});


test('category attributes are optional and provided attributes remain unchanged', () => {
  const optional = parseProductTable([importColumns, row({'成分':'', '功效':''})], 'optional');
  assert.equal(optional.passed, 1);
  assert.equal(optional.issues.length, 0);
  assert.equal(optional.rows[0].product.ingredient, '');
  assert.equal(optional.rows[0].product.efficacy, '');
  const supplied = parseProductTable([importColumns, row({'成分':'棉 95%；氨纶 5%', '功效':'吸湿透气'})], 'supplied');
  assert.equal(supplied.rows[0].product.ingredient, '棉 95%；氨纶 5%');
  assert.equal(supplied.rows[0].product.efficacy, '吸湿透气');
});

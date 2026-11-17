import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { extname } from 'node:path';
import test from 'node:test';
import * as xlsx from '@e965/xlsx';

registerHooks({ resolve(specifier, context, next) {
  if (specifier.startsWith('.') && !extname(specifier) && context.parentURL?.includes('/app/')) return next(`${specifier}.ts`, context);
  return next(specifier, context);
} });
const { createProductExport } = await import('../app/product-export.ts');
const { productSignature } = await import('../app/product-readiness.ts');
const product = {
  id: 'p', externalId: '000123', name: '=1+1', code: 'CUP', brand: '品牌', source: 'Excel 导入', material: '陶瓷', selling: '盛装饮品',
  collectedAt: '2026-11-12T08:00:00Z', erp: { supplySource: '货源A', notes: '含中文和换行\n备注', sourceUrl: 'https://supplier.test/p' },
  skus: [{ id: 'white', code: '00001', color: '白色', spec: '350ml', price: '12.99', weight: '300', dimensions: '8×8×10 cm' }, { id: 'black', code: '00002', color: '黑色', spec: '500ml', price: '15.99', weight: '400', dimensions: '9×9×12 cm' }],
  listingClaims: [{ shopId: 'shop', shopName: '美国店', site: 'US' }],
};
product.confirmedSnapshot = productSignature(product);
const media = [
  { id: 'shared', type: 'image', url: '/shared.jpg' },
  { id: 'w', type: 'image', url: 'https://cdn.test/white.jpg' },
  { id: 'b', type: 'video', url: '/black.mp4' },
  { id: 'placeholder', type: 'image', url: '/placeholder.jpg', placeholder: true },
];
const links = [ ['shared', []], ['w', ['white']], ['b', ['black']], ['removed', []], ['placeholder', []] ].map(([mediaId, skuIds]) => ({ productId: 'p', mediaId, skuIds, location: '参考素材', status: '已采用' }));
const read = async (products = [product], assets = media, scopes) => xlsx.read(await (await createProductExport(products, links, assets, 'https://studio.test', scopes)).arrayBuffer());
const rows = (book, name) => xlsx.utils.sheet_to_json(book.Sheets[name], { defval: '' });

test('export keeps product/SKU relations, asset scopes, text IDs and literal formula-like content', async () => {
  const book = await read();
  assert.deepEqual(book.SheetNames, ['商品清单', 'SKU清单']);
  const products = rows(book, '商品清单'), skus = rows(book, 'SKU清单');
  assert.equal(products.length, 1); assert.equal(skus.length, 2);
  assert.equal(products[0].ID, '000123'); assert.equal(products[0].标题, '=1+1');
  assert.equal(book.Sheets['商品清单'].E2.t, 's'); assert.equal(book.Sheets['商品清单'].E2.f, undefined);
  assert.equal(products[0].素材数量, 3); assert.equal(products[0].资料状态, '资料完整');
  assert.equal(products[0].目标店铺, '美国店 · US');
  assert.equal(products[0]['采集时间（北京时间）'], '2026/11/12 16:00:00');
  assert.equal(products[0].备注, '含中文和换行\n备注');
  assert.equal(skus[0].SKU货号, '00001'); assert.equal(skus[0].商品ID, products[0].ID);
  assert.equal(skus[0].内部商品ID, products[0].内部商品ID);
  assert.equal(skus[0].素材数量, 2); assert.equal(skus[1].素材数量, 2);
  assert.ok(skus[0].素材链接.includes('https://studio.test/shared.jpg'));
  assert.ok(skus[0].素材链接.includes('https://cdn.test/white.jpg'));
  assert.ok(!skus[0].素材链接.includes('black.mp4'));
  assert.ok(skus[1].素材链接.includes('https://studio.test/black.mp4'));
  assert.ok(!products[0].素材链接.includes('placeholder'));
});

test('export accepts only caller-selected products and keeps products with no SKU', async () => {
  const selected = { ...product, id: 'other', externalId: '', name: '空档案', skus: [], listingClaims: [] };
  const book = await read([selected]);
  assert.equal(rows(book, '商品清单').length, 1);
  assert.equal(rows(book, '商品清单')[0].ID, 'other');
  assert.equal(rows(book, '商品清单')[0].主图链接, '');
  assert.equal(rows(book, '商品清单')[0].目标店铺, '');
  assert.equal(rows(book, 'SKU清单').length, 0);
});

test('unavailable assets are excluded and missing covers stay blank', async () => {
  const book = await read([product], []);
  assert.equal(rows(book, '商品清单')[0].主图链接, '');
  assert.equal(rows(book, '商品清单')[0].素材数量, 0);
  assert.equal(rows(book, '商品清单')[0].资料状态, '资料完整');
  assert.equal(rows(book, 'SKU清单')[0].素材链接, '');
});

test('empty results cannot create a misleading export', async () => {
  await assert.rejects(() => read([]), /没有可导出/);
});

test('progress counts actual selected product and SKU rows, then enters file generation', async () => {
  const updates = [];
  const file = await createProductExport([product], links, media, 'https://studio.test', { p: ['black'] }, progress => updates.push(progress));
  assert.deepEqual(updates[0], { phase: 'preparing', completed: 0, total: 2 });
  assert.deepEqual(updates.at(-1), { phase: 'writing', completed: 2, total: 2 });
  assert.deepEqual(updates.map(update => update.completed), [0, 1, 2, 2]);
  assert.ok(file.size > 0);
  const empty = [];
  await assert.rejects(() => createProductExport([], links, media, 'https://studio.test', undefined, progress => empty.push(progress)));
  assert.equal(empty.length, 0);
});

test('export records partial claim scopes per shop and SKU', async () => {
  const partial = { ...product, listingClaims: [{ ...product.listingClaims[0], skuIds: ['white'] }] };
  const book = await read([partial]);
  const skus = rows(book, 'SKU清单');
  assert.equal(skus[0].认领店铺, '美国店 · US');
  assert.equal(skus[1].认领店铺, '');
  assert.equal(rows(book, '商品清单')[0].认领SKU范围, '美国店：00001');
  const selected = await read([partial], media, { p: ['black'] });
  assert.equal(rows(selected, 'SKU清单').length, 1);
  assert.equal(rows(selected, 'SKU清单')[0].SKU货号, '00002');
  assert.equal(rows(selected, 'SKU清单')[0].认领店铺, '');
  assert.equal(rows(selected, '商品清单')[0].目标店铺, '');
  assert.ok(!rows(selected, '商品清单')[0].素材链接.includes('white.jpg'));
  assert.equal(rows(selected, '商品清单')[0].素材数量, 2);
  assert.equal(rows(selected, '商品清单')[0].资料状态, '资料完整');
});

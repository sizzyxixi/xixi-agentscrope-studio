import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { extname } from 'node:path';
import test from 'node:test';
registerHooks({ resolve(specifier, context, next) { return next(specifier.startsWith('.') && !extname(specifier) && context.parentURL?.includes('/app/') ? `${specifier}.ts` : specifier, context); } });
const { materialProductSuggestions } = await import('../app/material-product-search.ts');
const { associateMaterial } = await import('../app/material-product-link.ts');
const products = [
  { id: 'internal-id', products_id: '9007199254740993123', name: '旧标题', cn_title: '陶瓷咖啡杯', title: 'Ceramic Mug', code: 'CUP-001', brand: 'HOMENKUR', skus: [{ id: 'white', code: 'CUP-W350', spec: '白色 / 350ml' }, { id: 'pair', code: 'CUP-W350-2', spec: '白色 / 双杯装', source_sku_code: 'ORIGINAL-2' }, { id: 'deleted-sku', code: 'REMOVED', deleted_at: 'now' }] },
  { id: 'other', name: '运动水瓶', code: 'BOT-001', skus: [{ id: 'bottle', code: 'BOT-GREEN', spec: '绿色' }] },
  { id: 'deleted', name: '已删除咖啡杯', code: 'DELETED', deleted_at: 'now', skus: [] },
];

test('blank searches reveal no rows; fuzzy title, business ID, parent and SKU queries return active products', () => {
  assert.deepEqual(materialProductSuggestions(products, ''), []);
  assert.deepEqual(materialProductSuggestions(products, '   '), []);
  for (const query of ['咖啡', 'ceramic', 'CUP-001', '9007199254740993123', 'HOMENKUR', 'ｃｕｐ－ｗ３５０']) assert.equal(materialProductSuggestions(products, query)[0].product.id, 'internal-id');
  assert.deepEqual(materialProductSuggestions(products, 'REMOVED'), []);
  assert.deepEqual(materialProductSuggestions(products, 'DELETED'), []);
  assert.deepEqual(materialProductSuggestions(products, 'internal-id'), []);
  assert.deepEqual(materialProductSuggestions(products, '不存在'), []);
});

test('SKU suggestions identify the matching rows for inline expansion without changing the catalog', () => {
  const before = structuredClone(products);
  assert.deepEqual(materialProductSuggestions(products, 'cup-w350-2')[0].matchedSkuIds, ['pair']);
  assert.deepEqual(materialProductSuggestions(products, 'original-2')[0].matchedSkuIds, ['pair']);
  assert.deepEqual(materialProductSuggestions(products, '陶瓷 CUP-W350')[0].product, products[0]);
  assert.deepEqual(products, before);
});

test('a selected single SKU uses the current material name without renaming the source file', () => {
  const media = { id: 'image', name: '当前素材名称', type: 'image', url: '/image.jpg' };
  const links = associateMaterial([], products[0], media, ['pair'], '商品图片', 'link', media.name);
  assert.deepEqual(links[0].skuIds, ['pair']); assert.equal(links[0].displayName, media.name);
  assert.equal(media.name, '当前素材名称');
});

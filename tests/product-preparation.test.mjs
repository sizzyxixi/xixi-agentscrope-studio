import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { extname } from 'node:path';
import test from 'node:test';
registerHooks({ resolve(specifier, context, next) { return next(specifier.startsWith('.') && !extname(specifier) && context.parentURL?.includes('/app/') ? `${specifier}.ts` : specifier, context); } });
const { productPreparation, reconcileProductSkus, validDimensions } = await import('../app/product-preparation.ts');
const product = { id: 'p', name: '杯子', code: 'CUP', skus: [{ id: 'w', code: 'W', spec: '350ml', price: '0', weight: '300', dimensions: '8 × 8 × 10 cm' }, { id: 'b', code: 'B', spec: '500ml', price: '15', weight: '400', dimensions: '9x9x12' }] };
const media = [{ id: 'main', type: 'image', url: '/main.jpg' }, { id: 'detail', type: 'image', url: '/detail.jpg' }];
const links = [{ productId: 'p', mediaId: 'main', skuIds: [], usage: '主图', status: '草稿' }, { productId: 'p', mediaId: 'detail', skuIds: ['w'], usage: '详情图', status: '草稿' }];
test('operational readiness distinguishes SKU facts from scoped and deleted materials', () => {
  const state = productPreparation(product, links.slice(1), media);
  assert.equal(state.complete, true); assert.equal(state.materialsReady, false);
  assert.deepEqual(state.materialIssues.map(item => item.skuId), ['b']);
  assert.equal(productPreparation(product, links, media, 'w').materialsReady, true);
  assert.equal(productPreparation(product, links, [], 'w').complete, true);
  assert.equal(productPreparation(product, links, [], 'w').materialIssues.length, 1);
  const missing = productPreparation({ ...product, skus: [{ ...product.skus[0], weight: '', price: '-1' }] }, links, media);
  assert.equal(missing.issues.length, 2);
});
test('available shared images satisfy material readiness without requiring named scenes', () => {
  assert.equal(productPreparation(product, [{ ...links[0], usage: '商品图片' }], [media[0]], 'b').materialsReady, true);
});
test('dimensions reject incomplete, negative and nonnumeric measurements', () => {
  for (const value of ['1×2×3', '1 x 2 x 3 cm', '0.5*2*3']) assert.equal(validDimensions(value), true);
  for (const value of ['', '1×2', '1×2×0', '-1×2×3', '单只 8×8×10', 'a×b×c']) assert.equal(validDimensions(value), false);
});
test('removing SKUs prunes claims and SKU links while preserving shared material and other products', () => {
  const original = { ...product, skus: [product.skus[0]], listingClaims: [{ shopId: 'one', skuIds: ['w', 'b'] }, { shopId: 'two', skuIds: ['b'] }, { shopId: 'legacy' }] };
  const result = reconcileProductSkus(original, [...links, { ...links[1], skuIds: ['b'] }, { ...links[1], productId: 'other', skuIds: ['b'] }]);
  assert.deepEqual(result.product.listingClaims, [{ shopId: 'one', skuIds: ['w'] }, { shopId: 'legacy' }]);
  assert.equal(result.links.length, 3); assert.deepEqual(result.links[0].skuIds, []);
  assert.deepEqual(original.listingClaims[0].skuIds, ['w', 'b']);
});

test('SKU edits retain common draft assets, prune removed SKU scopes and invalidate old exports', () => {
  const draft = { shopId: 'shop', skuIds: ['w', 'b'], prices: { w: '12', b: '15' }, mediaIds: ['main', 'detail', 'b-only'], exportedAt: 'before' };
  const value = { ...product, skus: [product.skus[0]], listingClaims: [{ shopId: 'shop', skuIds: ['w', 'b'] }], listingDrafts: [draft] };
  const next = reconcileProductSkus(value, [...links, { ...links[0], mediaId: 'b-only', skuIds: ['b'] }]).product;
  assert.deepEqual(next.listingDrafts[0].skuIds, ['w']);
  assert.deepEqual(next.listingDrafts[0].mediaIds, ['main', 'detail']);
  assert.deepEqual(next.listingDrafts[0].prices, { w: '12' });
  assert.equal(next.listingDrafts[0].exportedAt, undefined);
  assert.equal(draft.mediaIds.length, 3);
});

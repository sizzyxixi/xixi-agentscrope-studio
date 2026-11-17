import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { extname } from 'node:path';
import test from 'node:test';
registerHooks({ resolve(specifier, context, next) { return next(specifier.startsWith('.') && !extname(specifier) && context.parentURL?.includes('/app/') ? `${specifier}.ts` : specifier, context); } });
const { removeProductSku, saveProductDraft } = await import('../app/product-editor.ts');
const { skuClaimRecords } = await import('../app/product-claim-records.ts');
const { productFieldValues } = await import('../app/product-fields.ts');
const { skuFieldValues } = await import('../app/sku-fields.ts');
const now = '2026-11-17T03:00:00Z';
const product = { id: 'p', name: '商品标题', code: 'SPU-1', customer_id: 12, cn_title: '中文标题', title: 'English title', cn_description: '中文描述', description: 'English description', variables: { opaque: true },
  skus: [{ id: 'one', sku_id: '9007199254740993123', code: 'SKU-1', name: '无依据名称', spec: '白色 / 350 ml', price: '0', customer_id: 12 }, { id: 'two', sku_id: '1002', code: 'SKU-2', spec: '黑色 / 500 ml' }],
  listingClaims: [{ shopId: 'a', shopName: 'Amazon 美国店', platform: 'Amazon', site: 'US', claimedAt: now, skuIds: ['one'] }, { shopId: 'b', shopName: 'eBay 英国店', platform: 'eBay', site: 'UK', claimedAt: now, skuIds: ['one', 'two'] }, { shopId: 'legacy', shopName: 'Amazon 老店', site: 'US', claimedAt: now }],
  listingDrafts: [{ shopId: 'b', skuIds: ['one', 'two'], prices: { one: '12', two: '15' }, mediaIds: ['shared', 'both', 'one-only'], exportedAt: 'old' }],
};
const links = [
  { id: 'shared', productId: 'p', mediaId: 'shared', skuIds: [], status: '草稿' },
  { id: 'both', productId: 'p', mediaId: 'both', skuIds: ['one', 'two'], status: '草稿' },
  { id: 'one-only', productId: 'p', mediaId: 'one-only', skuIds: ['one'], status: '草稿' },
  { id: 'other', productId: 'other', mediaId: 'one-only', skuIds: ['one'], status: '草稿' },
];
test('deleting one SKU preserves the SPU, siblings, common files and other products', () => {
  const before = structuredClone({ product, links });
  const next = removeProductSku(product, 'one', links);
  assert.deepEqual(next.product.skus.map(s => s.id), ['two']);
  assert.deepEqual(next.product.listingClaims.map(c => [c.shopId, c.skuIds]), [['b', ['two']], ['legacy', ['two']]]);
  assert.deepEqual(next.links.map(l => [l.id, l.skuIds]), [['shared', []], ['both', ['two']], ['other', ['one']]]);
  assert.deepEqual(next.product.listingDrafts[0].skuIds, ['two']);
  assert.deepEqual(next.product.listingDrafts[0].prices, { two: '15' });
  assert.deepEqual(next.product.listingDrafts[0].mediaIds, ['shared', 'both']);
  assert.equal(next.product.listingDrafts[0].exportedAt, undefined);
  assert.deepEqual({ product, links }, before);
});
test('deleting the last SKU leaves an empty SPU without future automatic claims', () => {
  const first = removeProductSku(product, 'one', links);
  const next = removeProductSku(first.product, 'two', first.links);
  assert.equal(next.product.id, 'p'); assert.deepEqual(next.product.skus, []);
  assert.deepEqual(next.product.listingClaims, []); assert.deepEqual(next.product.listingDrafts, []);
  assert.deepEqual(next.links.map(l => l.id), ['shared', 'other']);
  assert.throws(() => removeProductSku(next.product, 'missing', []), /不存在/);
});
test('saving inline edits writes existing fields, keeps source metadata and omits SKU names', () => {
  const values = { ...productFieldValues(product), cn_title: '修改后的标题', title: 'Updated English title' };
  const saved = saveProductDraft(product, product.skus.map(s => ({ ...s, ...skuFieldValues(s) })), values, [product], now);
  assert.equal(saved.cn_title, values.cn_title); assert.equal(saved.title, values.title);
  assert.equal(saved.customer_id, 12); assert.equal(saved.skus[0].sku_id, product.skus[0].sku_id);
  assert.deepEqual(saved.variables, product.variables); assert.deepEqual(saved.listingClaims, product.listingClaims);
  assert.equal(saved.skus[0].name, undefined); assert.equal(saved.skus[0].price, '0');
  assert.equal(saved.updated_at, now); assert.equal(saved.created_at, undefined);
  assert.equal(product.cn_title, '中文标题');
});
test('inline save rejects duplicate codes and invalid SKU values before changing data', () => {
  const values = productFieldValues(product);
  assert.throws(() => saveProductDraft(product, [{ ...product.skus[0], price: '-1' }], values, [product], now), /价格/);
  assert.throws(() => saveProductDraft(product, [product.skus[0], { ...product.skus[1], code: 'SKU-1' }], values, [product], now), /重复/);
  assert.throws(() => saveProductDraft(product, product.skus, values, [product, { ...product, id: 'other' }], now), /重复/);
  assert.equal(saveProductDraft({ ...product, skus: [] }, [], values, [product], now).skus.length, 0);
  assert.throws(() => saveProductDraft(product, [], values, [], now, true), /补齐/);
});
const tasks = [
  { id: 'task-a-one', productId: 'p', skuId: 'one', shopId: 'a', platform: 'Amazon', createdAt: now, information: { title: '草稿标题' } },
  { id: 'task-b-two', productId: 'p', skuId: 'two', shopId: 'b', platform: 'eBay', createdAt: now, information: { title: '另一 SKU 的草稿' } },
  { id: 'mock-task', productId: 'p', skuId: 'one', shopId: 'not-claimed', presentationMock: true, information: { title: '不会增加认领记录' } },
];
test('claim history scopes records by SKU and links only its own existing draft', () => {
  const rows = skuClaimRecords(product, 'one', [], tasks);
  assert.deepEqual(rows.map(r => r.id), ['a', 'b', 'legacy']);
  assert.ok(rows.every(r => r.skuId === '9007199254740993123'));
  assert.equal(rows[0].draft.taskId, 'task-a-one'); assert.equal(rows[0].draft.skuCode, 'SKU-1');
  assert.equal(rows[1].draft, undefined); assert.equal(rows[2].draft, undefined);
  assert.equal(skuClaimRecords(product, 'two', [], tasks).length, 2);
  assert.deepEqual(skuClaimRecords(product, 'missing', [], tasks), []);
});
test('empty history and unknown source SKU IDs stay empty instead of borrowing the primary key', () => {
  assert.deepEqual(skuClaimRecords({ ...product, listingClaims: [] }, 'one', [], tasks), []);
  const missing = { ...product, skus: [{ ...product.skus[0], sku_id: undefined }] };
  assert.equal(skuClaimRecords(missing, 'one', [], tasks)[0].skuId, '');
  assert.deepEqual(skuClaimRecords({ ...product, deleted_at: now }, 'one', [], tasks), []);
});
test('inline SKU editing preserves freshly refreshed ownership and source metadata', () => {
  const current = { ...product, skus: [{ ...product.skus[0], customer_id: 99, variants: { opaque: 'latest' }, batch_no: 'latest-batch' }, product.skus[1]] };
  const saved = saveProductDraft(current, product.skus, productFieldValues(product), [current], now);
  assert.equal(saved.skus[0].customer_id, 99); assert.deepEqual(saved.skus[0].variants, { opaque: 'latest' }); assert.equal(saved.skus[0].batch_no, 'latest-batch');
});

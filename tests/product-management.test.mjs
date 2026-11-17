import { registerHooks } from 'node:module';
import { extname } from 'node:path';
registerHooks({ resolve(specifier, context, next) { return next(specifier.startsWith('.') && !extname(specifier) && context.parentURL?.includes('/app/') ? `${specifier}.ts` : specifier, context); } });
import assert from 'node:assert/strict';
import test from 'node:test';
const { claimProduct, claimSkuIds, selectedProductScopes, restoreSpuCatalog, skuLinks, deliveryIssues, outputAssociations } = await import('../app/product-management.ts');

const product = { id: 'p', code: 'P', name: '杯子', skus: [{ id: 'white', code: 'W' }, { id: 'black', code: 'B' }] };
test('retiring product archive state restores all products and preserves SKU, claims and material links', () => {
  const old = [{ ...product, archived: true, listingClaims: [{ shopId: 'shop', skuIds: ['white'] }] }, { ...product, id: 'other', archived: false }];
  const links = [{ id: 'l', productId: 'p', mediaId: 'photo', skuIds: ['white'], status: '已采用' }];
  const result = restoreSpuCatalog(old, links);
  assert.equal(result.products.length, 2);
  for (const item of result.products) assert.equal(Object.hasOwn(item, 'archived'), false);
  assert.deepEqual(result.products[0].skus, old[0].skus);
  assert.deepEqual(result.products[0].listingClaims, old[0].listingClaims);
  assert.deepEqual(result.links, links);
  assert.equal(old[0].archived, true);
  assert.deepEqual(restoreSpuCatalog(result.products, result.links), result);
  const shop = { id: 'second', name: '美国店', site: 'US', authorized: true };
  assert.equal(claimProduct(result.products[0], shop, 'now').listingClaims.length, 2);
  assert.deepEqual(deliveryIssues({ title: '杯子', skuIds: ['white'], mediaIds: ['photo'] }, result.products[0], [{ id: 'photo', url: '/photo.jpg' }], []), []);
});
test('legacy split records return to one SPU without merging similarly named unrelated goods', () => {
  const old = [{ ...product, name: '杯子 · W', skus: [product.skus[0]] }, { ...product, id: 'p--black', name: '杯子 · B', skus: [product.skus[1]] }, { ...product, id: 'other' }];
  const links = [{ id: 'l', productId: 'p--black', mediaId: 'photo', skuIds: ['black'] }];
  const result = restoreSpuCatalog(old, links);
  assert.equal(result.products.length, 2);
  assert.equal(result.products[0].name, '杯子');
  assert.deepEqual(result.products[0].skus.map(s => s.id), ['white', 'black']);
  assert.equal(result.links[0].productId, 'p');
  assert.deepEqual(result.links[0].skuIds, ['black']);
  assert.deepEqual(restoreSpuCatalog(result.products, result.links), result);
  assert.equal(old[0].skus.length, 1);
});
test('SKU material queries include shared assets and exclude another SKU', () => {
  const links = [{ productId: 'p', skuIds: [], mediaId: 'shared' }, { productId: 'p', skuIds: ['white'], mediaId: 'w' }, { productId: 'p', skuIds: ['black'], mediaId: 'b' }];
  assert.deepEqual(skuLinks(links, 'p', 'white').map(l => l.mediaId), ['shared', 'w']);
});
test('deleted assets, invalid SKU and deleted products cannot be delivered', () => {
  const version = { title: '杯子', skuIds: ['white'], mediaIds: ['photo'] };
  const media = [{ id: 'photo', url: '/photo.jpg' }];
  assert.deepEqual(deliveryIssues(version, product, media, []), []);
  assert.ok(deliveryIssues(version, product, media, ['photo']).length);
  assert.ok(deliveryIssues({ ...version, skuIds: ['deleted'] }, product, media, []).length);
  assert.ok(deliveryIssues(version, { ...product, deleted_at: '2026-11-13T00:00:00Z' }, media, []).length);
  assert.ok(deliveryIssues(version, product, [{ ...media[0], placeholder: true }], []).length);
});
test('generated outputs stay draft and only attach to the explicit SKU; ambiguous multi-SKU jobs are rejected', () => {
  const job = { id: 'j', productIds: ['p'], skuIds: ['white'], platform: 'Amazon', site: 'US', language: '英语', tool: '套图', mode: 'image', template: 'T' };
  const links = outputAssociations(job, ['output'], [product]);
  assert.equal(links[0].status, '草稿');
  assert.equal(links[0].location, '商品图');
  assert.deepEqual(links[0].skuIds, ['white']);
  assert.deepEqual(outputAssociations({ ...job, skuIds: [] }, ['output'], [product]), []);
  assert.equal(outputAssociations({ ...job, productIds: ['p--white'] }, ['output'], [product])[0].productId, 'p');
});

test('claim queues one SPU per authorized shop, preserves SKU and survives serialization', () => {
  const shop = { id: 'amazon-us', name: 'Amazon 美国店', site: 'US', authorized: true };
  const claimed = claimProduct(product, shop, '2026-11-12T08:00:00Z');
  assert.equal(claimed.listingClaims.length, 1);
  assert.equal(claimed.listingClaims[0].shopId, shop.id);
  assert.deepEqual(claimed.skus, product.skus);
  assert.equal(product.listingClaims, undefined);
  const restored = JSON.parse(JSON.stringify(claimed));
  assert.equal(claimProduct(restored, shop, 'later'), restored);
  assert.equal(claimProduct(claimed, { ...shop, id: 'expired', authorized: false }, 'later'), claimed);
  assert.equal(claimProduct({ ...product, deleted_at: '2026-11-13T00:00:00Z' }, shop, 'later').listingClaims, undefined);
  assert.equal(claimProduct(restored, { ...shop, id: 'ebay-us' }, 'later').listingClaims.length, 2);
});

test('partial SKU claims merge per shop without duplicates and retain separate shop scopes', () => {
  const shop = { id: 'amazon', name: '美国店', site: 'US', authorized: true };
  const white = claimProduct(product, shop, 'first', ['white', 'white']);
  assert.deepEqual(white.listingClaims[0].skuIds, ['white']);
  assert.equal(claimProduct(white, shop, 'again', ['white']), white);
  const black = claimProduct(white, shop, 'second', ['black']);
  assert.equal(black.listingClaims.length, 1);
  assert.deepEqual(black.listingClaims[0].skuIds, ['white', 'black']);
  assert.equal(black.activity.length, 2);
  const secondShop = claimProduct(white, { ...shop, id: 'ebay' }, 'third', ['black']);
  assert.deepEqual(secondShop.listingClaims.map(c => c.skuIds), [['white'], ['black']]);
  assert.equal(claimProduct(product, shop, 'empty', []), product);
  assert.equal(claimProduct(product, shop, 'stale', ['deleted', 'white']), product);
});

test('legacy whole-SPU claims remain whole and new whole-SPU claims snapshot the current SKUs', () => {
  const shop = { id: 'amazon', name: '美国店', site: 'US', authorized: true };
  const legacy = { ...product, listingClaims: [{ shopId: shop.id }] };
  assert.deepEqual(claimSkuIds(legacy, legacy.listingClaims[0]), ['white', 'black']);
  assert.equal(claimProduct(legacy, shop, 'again', ['white']), legacy);
  const whole = claimProduct(product, shop, 'first');
  const updated = { ...whole, skus: [...whole.skus, { id: 'red', code: 'R' }] };
  assert.deepEqual(claimSkuIds(updated, updated.listingClaims[0]), ['white', 'black']);
  const appended = claimProduct(updated, shop, 'later');
  assert.deepEqual(appended.listingClaims[0].skuIds, ['white', 'black', 'red']);
});

test('batch selection distinguishes whole SPUs, partial scopes, and ignores hidden or deleted SKUs', () => {
  const other = { ...product, id: 'other', skus: [{ id: 'red', code: 'R' }] };
  const scopes = selectedProductScopes([product, other], { p: ['white', 'deleted', 'white'], other: 'all', hidden: 'all' });
  assert.deepEqual(scopes.map(s => [s.product.id, s.skuIds, s.full]), [['p', ['white'], false], ['other', ['red'], true]]);
  assert.equal(selectedProductScopes([product], { p: ['white', 'black'] })[0].full, true);
  assert.deepEqual(selectedProductScopes([product], { p: ['deleted'] }), []);
  assert.equal(selectedProductScopes([{ ...product, skus: [] }], { p: 'all' })[0].full, true);
});

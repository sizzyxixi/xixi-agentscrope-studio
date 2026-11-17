import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { extname } from 'node:path';
import test from 'node:test';
registerHooks({ resolve(specifier, context, next) { return next(specifier.startsWith('.') && !extname(specifier) && context.parentURL?.includes('/app/') ? `${specifier}.ts` : specifier, context); } });
const { claimProductsToShops, claimShopsFromResources, filteredClaimShops, remainingShopClaims, resolveClaimScopes, isClaimShopAuthorized, authorizedClaimPlatforms, claimShopPage } = await import('../app/product-claim.ts');
const now = Date.parse('2026-11-13T08:00:00Z');
const resource = (id, config = {}, enabled = true) => ({ id, name: `店铺 ${id}`, enabled, config: { platform: 'lazada', country: 'SG', authorization_status: 'authorized', ...config } });
const product = { id: 'p', name: '杯子', code: 'CUP', skus: [{ id: 'white', code: 'W' }, { id: 'black', code: 'B' }] };
const scopes = [{ productId: 'p', skuIds: ['white'] }];
const shops = ['a', 'b'].map(id => ({ id, name: `Lazada ${id}`, platform: 'Lazada', site: 'SG', currency: 'SGD', active: true, authorized: true }));
test('only explicit, active and unexpired service authorization can supply claim shops', () => {
  const rows = [resource('valid'), resource('expired', { expires_at: '2026-11-12T00:00:00Z' }), resource('bad-time', { expires_at: 'invalid' }), resource('off', {}, false), resource('revoked', { authorization_status: 'expired' }), resource('unknown', { authorization_status: undefined }), resource('future', { expires_at: '2026-11-14T00:00:00Z' })];
  const result = claimShopsFromResources(rows, now);
  assert.deepEqual(result.map(shop => shop.id), ['valid', 'future']);
  assert.equal(result[0].platform, 'Lazada'); assert.equal(result[0].site, 'SG');
  assert.equal(isClaimShopAuthorized({ ...shops[0], authorized: undefined }, now), false);
  assert.equal(isClaimShopAuthorized({ ...shops[0], active: false }, now), false);
});
test('platform and case-insensitive store-name search exclude unrelated and unauthorized stores', () => {
  const list = [...shops, { ...shops[0], id: 'amazon', platform: 'Amazon' }, { ...shops[0], id: 'no', authorized: false }];
  assert.deepEqual(filteredClaimShops(list, 'Lazada', '  LAZADA A ').map(shop => shop.id), ['a']);
  assert.equal(filteredClaimShops(list, '').length, 3);
  assert.equal(filteredClaimShops(list, 'Lazada', 'missing').length, 0);
});
test('claiming selected SKUs to multiple shops preserves one SPU and produces independent per-shop scopes', () => {
  const result = claimProductsToShops([product], scopes, shops, 'Lazada', '2026-11-13T08:00:00Z');
  assert.equal(result.count, 2); assert.equal(result.products.length, 1);
  assert.deepEqual(result.products[0].listingClaims.map(claim => [claim.shopId, claim.skuIds]), [['a', ['white']], ['b', ['white']]]);
  assert.deepEqual(result.products[0].skus, product.skus); assert.equal(product.listingClaims, undefined);
});
test('whole-SPU and batch claims skip previously claimed variants without duplicate shop records', () => {
  const first = claimProductsToShops([product], scopes, [shops[0]], 'Lazada', 'first').products[0];
  const other = { ...product, id: 'other', skus: [{ id: 'red', code: 'R' }] };
  const all = [{ productId: 'p', skuIds: ['white', 'black'] }, { productId: 'other', skuIds: ['red'] }];
  assert.equal(remainingShopClaims([first, other], all, 'a'), 2);
  const result = claimProductsToShops([first, other], all, [...shops, shops[0]], 'Lazada', 'second');
  assert.equal(result.count, 5);
  assert.deepEqual(result.products[0].listingClaims[0].skuIds, ['white', 'black']);
  assert.equal(result.products[0].listingClaims.length, 2);
  assert.equal(result.products[1].listingClaims.length, 2);
  assert.throws(() => claimProductsToShops(result.products, all, shops, 'Lazada', 'again'), /已认领/);
});
test('revoked or cross-platform shop selection rejects the entire operation', () => {
  for (const invalid of [{ ...shops[1], authorized: false }, { ...shops[1], platform: 'Amazon' }, { ...shops[1], expiresAt: '2020-01-01' }]) assert.throws(() => claimProductsToShops([product], scopes, [shops[0], invalid], 'Lazada', 'now'), /不可认领/);
  assert.equal(product.listingClaims, undefined);
});
test('stale SKU selection is resolved against current data and never claims deleted records', () => {
  assert.deepEqual(resolveClaimScopes([product], [{ productId: 'p', skuIds: ['white', 'missing'] }, scopes[0]])[0].skuIds, ['white']);
  for (const unavailable of [{ ...product, deleted_at: 'now' }, { ...product, skus: [{ ...product.skus[0], deleted_at: 'now' }] }]) assert.throws(() => claimProductsToShops([unavailable], scopes, shops, 'Lazada', 'now'), /不可用/);
});

const { createClaimShopMocks } = await import('../app/product-claim-mocks.ts');
test('platform choices include only current authorized shops and default all searches across platforms', () => {
  const list = [...shops, { ...shops[0], id: 'amazon', platform: 'Amazon' }, { ...shops[0], id: 'off', platform: 'Temu', active: false }, { ...shops[0], id: 'revoked', platform: 'Shopee', authorized: false }, { ...shops[0], id: 'expired', platform: 'eBay', expiresAt: '2020-01-01' }];
  assert.deepEqual(authorizedClaimPlatforms(list), ['Amazon', 'Lazada']);
  assert.equal(filteredClaimShops(list, '').length, 3);
  assert.deepEqual(authorizedClaimPlatforms(list.filter(shop => ['off', 'revoked', 'expired'].includes(shop.id))), []);
  assert.deepEqual(authorizedClaimPlatforms([]), []);
});
test('all-platform claiming preserves each authorized target platform and rejects an invalid target atomically', () => {
  const targets = [shops[0], { ...shops[1], platform: 'Amazon' }];
  const result = claimProductsToShops([product], scopes, targets, '', '2026-11-17T08:00:00Z');
  assert.equal(result.count, 2);
  assert.deepEqual(result.products[0].listingClaims.map(claim => [claim.shopId, claim.platform, claim.skuIds]), [['a', 'Lazada', ['white']], ['b', 'Amazon', ['white']]]);
  assert.throws(() => claimProductsToShops([product], scopes, [targets[0], { ...targets[1], authorized: false }], '', 'now'), /不可认领/);
  assert.equal(product.listingClaims, undefined);
});
test('48 presentation shops span six platforms and stable IDs allow cross-page selections', () => {
  const list = createClaimShopMocks();
  assert.equal(list.length, 48); assert.equal(new Set(list.map(shop => shop.id)).size, 48);
  assert.equal(authorizedClaimPlatforms(list).length, 6); assert.ok(list.every(shop => shop.presentationMock && isClaimShopAuthorized(shop)));
  const first = claimShopPage(list, '', '', 1), second = claimShopPage(list, '', '', 2);
  assert.equal(first.items.length, 6); assert.equal(first.pageCount, 8); assert.equal(first.total, 48);
  assert.equal(new Set(first.items.map(shop => shop.platform)).size, 6);
  assert.ok(first.items.every(shop => !second.items.some(other => other.id === shop.id)));
  const selectedIds = [first.items[0].id, second.items[0].id];
  assert.equal(filteredClaimShops(list, '').filter(shop => selectedIds.includes(shop.id)).length, 2);
  assert.deepEqual(createClaimShopMocks(), list);
});
test('pagination follows platform/search results and clamps pages after results shrink', () => {
  const list = createClaimShopMocks();
  const amazon = claimShopPage(list, 'Amazon', '', 2);
  assert.equal(amazon.total, 8); assert.equal(amazon.items.length, 2); assert.equal(amazon.pageCount, 2);
  assert.ok(amazon.items.every(shop => shop.platform === 'Amazon'));
  const search = claimShopPage(list, '', ' 山野 ', 8);
  assert.equal(search.page, 1); assert.equal(search.total, 6); assert.equal(search.items.length, 6);
  assert.equal(claimShopPage(list, 'Amazon', '山野', 1).total, 1);
  const empty = claimShopPage(list, '', '不存在', 8);
  assert.equal(empty.page, 1); assert.equal(empty.pageCount, 1); assert.equal(empty.total, 0);
  assert.equal(claimShopPage(list, '', '', 1, 12).items.length, 12);
  assert.equal(claimShopPage(list, '', '', 1, 24).pageCount, 2);
});

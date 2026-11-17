import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { extname } from 'node:path';
import test from 'node:test';
import { unzipSync, strFromU8 } from 'fflate';
registerHooks({ resolve(specifier, context, next) { return next(specifier.startsWith('.') && !extname(specifier) && context.parentURL?.includes('/app/') ? `${specifier}.ts` : specifier, context); } });
const { listingDraftIssues, createListingPackage, listingAssets } = await import('../app/listing-preparation.ts');
const { availableListingShops } = await import('../app/listing-shops.ts');
const shop = { id: 'shop', name: '美国店', platform: 'Amazon', site: 'US', currency: 'USD', active: true };
const product = { id: 'p', name: '杯子', code: 'CUP', skus: [{ id: 'w', code: 'W', spec: '350ml', price: '10', weight: '300', dimensions: '8×8×10' }, { id: 'b', code: 'B', spec: '500ml' }], listingClaims: [{ shopId: 'shop', shopName: '美国店', site: 'US', skuIds: ['w'] }] };
const media = [{ id: 'main', name: '主图.png', type: 'image', url: 'data:image/png;base64,AQID' }, { id: 'detail', name: '详情.png', type: 'image', url: 'data:image/png;base64,BAUG' }, { id: 'other', name: '黑色.png', type: 'image', url: 'data:image/png;base64,BwgJ' }];
const links = media.map((item, i) => ({ productId: 'p', mediaId: item.id, usage: i === 1 ? '详情图' : '主图', skuIds: i === 2 ? ['b'] : ['w'], status: '草稿' }));
const draft = { shopId: 'shop', title: 'Ceramic Mug', description: '350ml ceramic mug', language: '英语', currency: 'USD', prices: { w: '19.99' }, skuIds: ['w'], mediaIds: ['main', 'detail'], updatedAt: '2026-11-12' };
test('listing readiness uses store-specific prices and only selected SKU scope', () => {
  assert.deepEqual(listingDraftIssues(product, draft, links, media), []);
  assert.ok(listingDraftIssues(product, { ...draft, currency: '', prices: { w: '' } }, links, media).includes('价格币种'));
  assert.equal(product.skus[0].price, '10');
});
test('ZIP includes original bytes, target, scoped SKU prices and factual preparation status', async () => {
  const zip = unzipSync(new Uint8Array(await (await createListingPackage(product, draft, shop, links, media)).arrayBuffer()));
  const manifest = JSON.parse(strFromU8(zip['刊登资料.json']));
  assert.equal(manifest.state, 'prepared'); assert.deepEqual(manifest.missing, []);
  assert.equal(manifest.shop.market, 'US'); assert.equal(manifest.skus.length, 1);
  assert.equal(manifest.skus[0].price, '10'); assert.equal(manifest.skus[0].listing_price, '19.99'); assert.equal(manifest.skus[0].listing_currency, 'USD');
  assert.equal(manifest.skus[0].currency, undefined);
  assert.deepEqual([...zip[manifest.assets[0].file]], [1, 2, 3]);
  assert.deepEqual(manifest.assets[0].skuIds, ['w']); assert.equal(manifest.assets.length, 2);
  assert.equal(manifest.published, undefined);
});
test('incomplete export records missing fields without claiming platform publication', async () => {
  const zip = unzipSync(new Uint8Array(await (await createListingPackage(product, { ...draft, description: '' }, shop, links, media)).arrayBuffer()));
  const manifest = JSON.parse(strFromU8(zip['刊登资料.json']));
  assert.equal(manifest.state, 'incomplete'); assert.ok(manifest.missing.includes('商品描述'));
});
test('stale, unrelated and another SKU materials cannot enter the archive', async () => {
  for (const mediaIds of [['missing'], ['other']]) await assert.rejects(() => createListingPackage(product, { ...draft, mediaIds }, shop, links, media), /失效/);
  await assert.rejects(() => createListingPackage(product, { ...draft, skuIds: ['b'] }, shop, links, media), /认领范围/);
  await assert.rejects(() => createListingPackage({ ...product, deleted_at: '2026-11-13T00:00:00Z' }, draft, shop, links, media), /认领范围/);
  await assert.rejects(() => createListingPackage(product, draft, { ...shop, id: 'other' }, links, media), /认领范围/);
});
test('an original file retrieval failure rejects the entire export', async () => {
  await assert.rejects(() => createListingPackage(product, draft, shop, links, media.map(item => ({ ...item, url: 'data:invalid' }))), /fetch failed/);
});
test('configured inactive targets remain inactive and historical claims keep their identity', () => {
  assert.equal(availableListingShops([{ ...shop, active: false }], [product])[0].active, false);
  const historical = availableListingShops([], [product])[0];
  assert.equal(historical.name, '美国店'); assert.equal(historical.currency, '');
  assert.deepEqual(availableListingShops([], []), []);
});

test('a shared file with multiple SKU-specific associations remains selectable for either SKU', () => {
  const separateLinks = [{ ...links[0], skuIds: ['b'] }, links[0]];
  assert.equal(listingAssets('p', separateLinks, media, ['w'])[0].media.id, 'main');
  assert.equal(listingAssets('p', separateLinks, media, ['w', 'b']).length, 1);
  assert.equal(listingAssets('p', separateLinks, media, []).length, 0);
});

test('language metadata does not silently classify untranslated source text as prepared English', () => {
  assert.ok(listingDraftIssues(product, { ...draft, language: '' }, links, media).includes('文案语言'));
  assert.ok(listingDraftIssues(product, { ...draft, title: '陶瓷马克杯' }, links, media).includes('英文文案待核对'));
});

test('a source SKU price never silently becomes the store listing price', () => {
  const issues = listingDraftIssues(product, { ...draft, prices: {} }, links, media);
  assert.ok(issues.includes('W · 刊登价格'));
  assert.equal(product.skus[0].price, '10');
});

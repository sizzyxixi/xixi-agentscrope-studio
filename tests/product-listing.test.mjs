import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { extname } from 'node:path';
import test from 'node:test';
registerHooks({ resolve(specifier, context, next) { return next(specifier.startsWith('.') && !extname(specifier) && context.parentURL?.includes('/app/') ? `${specifier}.ts` : specifier, context); } });
const { claimedListingTasks, listingTaskRows, recordListingReceipt, listingTaskId, listingSourceInformation, restoreListingTasks, listingTaskPresentation, listingTaskPlatforms } = await import('../app/product-listing.ts');
const { claimProductsToShops } = await import('../app/product-claim.ts');
const now = '2026-11-16T08:00:00Z';
const product = { id: 'p', name: '陶瓷杯', cn_title: '陶瓷杯', cn_description: '商品原始描述', code: 'CUP', skus: [{ id: 'white', code: 'W', spec: '白色 / 350 ml', price: '12.50' }, { id: 'black', code: 'B' }] };
const shops = ['a', 'b'].map(id => ({ id, name: `Lazada ${id}`, platform: 'Lazada', site: 'SG', currency: 'SGD', active: true, authorized: true }));
const claim = (ids = ['white', 'black']) => claimProductsToShops([product], [{ productId: 'p', skuIds: ids }], shops, 'Lazada', now).products;
const receipt = (task, platformState) => ({ success: true, requestId: task.publishRequestId, receiptId: 'receipt-1', acceptedAt: now, platformState });
test('claiming whole SPU creates one top-level record per SKU and shop without copying products', () => {
  const products = claim(), tasks = claimedListingTasks(products, shops, [], now);
  assert.equal(tasks.length, 4); assert.equal(products.length, 1); assert.equal(products[0].skus.length, 2);
  assert.equal(new Set(tasks.map(t => t.id)).size, 4);
  assert.ok(tasks.every(t => t.status === 'preparing' && !t.receipt && t.records[0].status === 'preparing'));
  assert.equal(listingTaskRows(tasks, products, 'pending').length, 4);
  assert.equal(listingTaskRows(tasks, products, 'published').length, 0);
  assert.deepEqual(claimedListingTasks(products, shops, tasks, now), tasks);
});
test('selected SKUs create only selected jobs; orphan and deleted variants never enter lists', () => {
  const products = claim(['white']), tasks = claimedListingTasks(products, shops, [], now);
  assert.equal(tasks.length, 2);
  assert.ok(tasks.every(t => t.skuId === 'white'));
  assert.equal(claimedListingTasks([{ ...products[0], deleted_at: now }], shops, [], now).length, 0);
  assert.equal(claimedListingTasks([{ ...products[0], skus: products[0].skus.map(s => ({ ...s, deleted_at: now })) }], shops, [], now).length, 0);
  assert.equal(listingTaskRows(tasks, [], 'pending').length, 0);
  assert.equal(listingTaskRows(tasks, [{ ...products[0], skus: [] }], 'pending').length, 0);
});
test('task IDs remain distinct even when source IDs contain separators', () => {
  assert.notEqual(listingTaskId('p/x', 'y', 'z'), listingTaskId('p', 'x/y', 'z'));
});
test('search supports SKU, store, platform and site independently', () => {
  const products = claim(), tasks = claimedListingTasks(products, shops, [], now);
  assert.equal(listingTaskRows(tasks, products, 'pending', ' LAZADA A ').length, 2);
  assert.equal(listingTaskRows(tasks, products, 'pending', 'SG').length, 4);
  assert.equal(listingTaskRows(tasks, products, 'pending', 'missing').length, 0);
});
test('preparation reads actual source values and does not invent a price, currency or translation', () => {
  const info = listingSourceInformation(product, 'white', shops[0]);
  assert.equal(info.title, '陶瓷杯'); assert.equal(info.description, '商品原始描述'); assert.equal(info.spec, '白色 / 350 ml'); assert.equal(info.currency, 'SGD');
  assert.equal(listingSourceInformation(product, 'black').price, '');
  assert.equal(listingSourceInformation(product, 'black').currency, '');
});
test('legacy claims recover platform labels without granting new shop authorization', () => {
  const old = { ...product, listingClaims: [{ shopId: 'old', shopName: 'Amazon 老店', site: 'US', claimedAt: now }] };
  const tasks = claimedListingTasks([old], [], [], now);
  assert.equal(tasks[0].platform, 'Amazon');
  assert.equal(claimedListingTasks([old], [], tasks.map(t => ({ ...t, platform: '其他' })), now)[0].platform, 'Amazon');
  assert.equal(shops.length, 2);
});
for (const platformState of ['draft', 'active', 'offline']) test(`successful receipt is published regardless of marketplace state ${platformState}`, () => {
  const products = claim(), tasks = claimedListingTasks(products, shops, [], now);
  const submitted = { ...tasks[0], status: 'publishing', publishRequestId: 'request-1' };
  const published = recordListingReceipt(submitted, receipt(submitted, platformState), 'direct');
  const next = [published, ...tasks.slice(1)];
  assert.equal(listingTaskRows(next, products, 'published').length, 1);
  assert.equal(listingTaskRows(next, products, 'pending').length, 3);
  assert.equal(published.publishedVia, 'direct'); assert.equal(published.records.at(-1).status, 'published');
  assert.equal(recordListingReceipt(published, published.receipt, 'direct'), published);
});
test('AI conversation and direct action share receipt validation and status movement', () => {
  const products = claim(), tasks = claimedListingTasks(products, shops, [], now);
  const submitted = { ...tasks[0], status: 'publishing', publishRequestId: 'request-1' };
  const published = recordListingReceipt(submitted, receipt(submitted), 'agent');
  assert.equal(published.status, 'published'); assert.equal(published.publishedVia, 'agent');
  assert.deepEqual(tasks[1].status, 'preparing');
});
test('errors, mismatched responses, claim state and exported drafts never count as publication', () => {
  const products = claim(), [task] = claimedListingTasks(products, shops, [], now);
  const submitted = { ...task, status: 'publishing', publishRequestId: 'request-1' };
  for (const invalid of [{ ...receipt(submitted), success: false }, { ...receipt(submitted), receiptId: '' }, { ...receipt(submitted), requestId: 'other' }, { ...receipt(submitted), acceptedAt: 'bad' }]) assert.throws(() => recordListingReceipt(submitted, invalid, 'direct'));
  assert.throws(() => recordListingReceipt({ ...submitted, status: 'ready' }, receipt(submitted), 'direct'), /尚未提交/);
  for (const status of ['preparing', 'ready', 'prepare_failed', 'publishing', 'publish_failed']) assert.equal(listingTaskRows([{ ...task, status, exportedAt: now }], products, 'published').length, 0);
});
test('reload restores in-flight publishing as unresolved pending and keeps idempotency key', () => {
  const products = claim(), tasks = claimedListingTasks(products, shops, [], now);
  const interrupted = { ...tasks[0], status: 'publishing', publishRequestId: 'request-1' };
  const [restored] = restoreListingTasks(JSON.parse(JSON.stringify([interrupted])));
  assert.equal(restored.status, 'publish_failed'); assert.equal(restored.publishRequestId, 'request-1');
  assert.equal(listingTaskRows([restored], products, 'published').length, 0);
  assert.equal(recordListingReceipt(restored, receipt(restored), 'agent').status, 'published');
});
const { productListingAdapter } = await import('../app/product-listing-service.ts');
test('frontend preparation reports staged progress and aborts without late success', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const products = claim(), [task] = claimedListingTasks(products, shops, [], now);
  const controller = new AbortController(), updates = [];
  const operation = productListingAdapter().prepare(task, listingSourceInformation(product, 'white', shops[0]), (value) => updates.push(value), controller.signal);
  t.mock.timers.tick(1200); await Promise.resolve();
  assert.deepEqual(updates, [20]);
  const result = assert.rejects(operation, /cancelled/);
  controller.abort(new Error('cancelled'));
  t.mock.timers.tick(6000); await result;
  assert.deepEqual(updates, [20]);
});
test('frontend preparation completes all milestones before publication can receive its own receipt', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const products = claim(), [task] = claimedListingTasks(products, shops, [], now);
  const source = listingSourceInformation(product, 'white', shops[0]), updates = [];
  const operation = productListingAdapter().prepare(task, source, value => updates.push(value), new AbortController().signal);
  for (let i = 0; i < 4; i++) { t.mock.timers.tick(1200); await Promise.resolve(); }
  assert.deepEqual(await operation, source); assert.deepEqual(updates, [20, 50, 80, 100]);
  const submitted = { ...task, status: 'publishing', publishRequestId: 'stable-request' };
  const publication = productListingAdapter().publish(submitted, submitted.publishRequestId, new AbortController().signal);
  t.mock.timers.tick(1800);
  const result = await publication;
  assert.equal(result.requestId, submitted.publishRequestId); assert.equal(recordListingReceipt(submitted, result, 'direct').status, 'published');
});
test('an untracked request cannot be accepted even if both missing request IDs compare equal', () => {
  const [task] = claimedListingTasks(claim(), shops, [], now);
  assert.throws(() => recordListingReceipt({ ...task, status: 'publishing' }, { success: true, receiptId: 'untracked', acceptedAt: now }, 'direct'));
});

test('pending list exposes only preparation and ready states without lifecycle progress', () => {
  assert.deepEqual(listingTaskPresentation('preparing'), { label: '预刊登', description: 'AI 正在为目标店铺准备刊登信息' });
  for (const status of ['ready', 'publishing', 'publish_failed']) assert.deepEqual(listingTaskPresentation(status), { label: '待刊登', description: '预刊登信息准备完成' });
  assert.equal(listingTaskPresentation('prepare_failed').label, '预刊登');
  assert.equal(listingTaskPresentation('prepare_failed').description, '预刊登信息尚未准备完成');
  assert.equal(listingTaskPresentation('published').label, '已刊登');
});
const { withListingMocks, listingTasksForStorage } = await import('../app/product-listing-mocks.ts');
const fixtureProducts = [
  { ...product, id: 'p-cup', skus: [{ id: 's-white', code: 'CUP-W350' }] },
  { ...product, id: 'mock-p-bottle', skus: [{ id: 'mock-s-bottle', code: 'BOT-GRN-500' }] },
  { ...product, id: 'p-audio', skus: [{ id: 's-audio', code: 'AUDIO-G' }] },
];
test('three publishing fixtures reference existing SKUs and stay out of persisted requests', () => {
  const original = structuredClone(fixtureProducts);
  const tasks = withListingMocks([], fixtureProducts, now);
  assert.equal(tasks.length, 3);
  assert.ok(tasks.every(task => task.status === 'publishing' && task.presentationMock && !task.receipt));
  assert.equal(listingTaskRows(tasks, fixtureProducts, 'pending').length, 3);
  assert.equal(listingTaskRows(tasks, fixtureProducts, 'published').length, 0);
  assert.deepEqual(withListingMocks(tasks, fixtureProducts, now), tasks);
  assert.deepEqual(listingTasksForStorage(tasks), []);
  assert.deepEqual(fixtureProducts, original);
  const [real] = claimedListingTasks(claim(), shops, [], now);
  assert.deepEqual(listingTasksForStorage([...tasks, real]), [real]);
});
test('publishing fixtures do not create catalog records or resurrect missing and deleted SKUs', () => {
  assert.deepEqual(withListingMocks([], [], now), []);
  assert.deepEqual(withListingMocks([], fixtureProducts.map(p => ({ ...p, deleted_at: now })), now), []);
  assert.deepEqual(withListingMocks([], fixtureProducts.map(p => ({ ...p, skus: p.skus.map(s => ({ ...s, deleted_at: now })) })), now), []);
});
test('legacy cached presentation fixtures are regenerated instead of restored as interrupted requests', () => {
  const mocks = withListingMocks([], fixtureProducts, now).map(task => ({ ...task, status: 'publish_failed' }));
  assert.deepEqual(restoreListingTasks(mocks), []);
  assert.ok(withListingMocks(restoreListingTasks(mocks), fixtureProducts, now).every(task => task.status === 'publishing'));
});

test('platform filter composes with search and applies independently to pending and published lists', () => {
  const products = claim(), source = claimedListingTasks(products, shops, [], now);
  const tasks = source.map((task, index) => ({ ...task, platform: index < 2 ? 'Amazon' : 'Lazada' }));
  for (const index of [0, 3]) {
    const submitted = { ...tasks[index], status: 'publishing', publishRequestId: `request-${index}` };
    tasks[index] = recordListingReceipt(submitted, receipt(submitted), 'direct');
  }
  for (const tab of ['pending', 'published']) {
    assert.deepEqual(listingTaskPlatforms(tasks, products, tab), ['Amazon', 'Lazada']);
    assert.equal(listingTaskRows(tasks, products, tab, '', ' amazon ').length, 1);
    assert.equal(listingTaskRows(tasks, products, tab, '', 'Lazada').length, 1);
    assert.equal(listingTaskRows(tasks, products, tab, 'missing', 'Amazon').length, 0);
    assert.equal(listingTaskRows(tasks, products, tab, '', 'Shopee').length, 0);
  }
  assert.equal(listingTaskRows(tasks, products, 'pending', 'Lazada a', 'Amazon').length, 1);
  assert.equal(listingTaskRows(tasks, products, 'pending', 'Lazada b', 'Amazon').length, 0);
  assert.deepEqual(listingTaskPlatforms(tasks, [], 'pending'), []);
});
test('platform options deduplicate case variants and omit removed records', () => {
  const products = claim(), tasks = claimedListingTasks(products, shops, [], now).map((task, i) => ({ ...task, platform: i % 2 ? 'amazon' : 'Amazon' }));
  assert.deepEqual(listingTaskPlatforms(tasks, products, 'pending'), ['Amazon']);
  assert.deepEqual(listingTaskPlatforms(tasks, [{ ...products[0], deleted_at: now }], 'pending'), []);
});

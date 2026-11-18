import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { extname } from 'node:path';
import test from 'node:test';

// Match the app bundler's extensionless TypeScript resolution in Node's test runner.
registerHooks({ resolve(specifier, context, next) {
  if (specifier.startsWith('.') && !extname(specifier) && context.parentURL?.includes('/app/')) {
    return next(`${specifier}.ts`, context);
  }
  return next(specifier, context);
} });
const { productSeed, mediaSeed, associationSeed, productJobSeed, mergeProductMocks, initializeProductWorkspace } = await import('../app/product-library-mocks.ts');
const { productChecks } = await import('../app/product-readiness.ts');

test('a new origin gets complete fixed products, images, associations and creation jobs', () => {
  const local = initializeProductWorkspace(undefined);
  const online = initializeProductWorkspace(null);
  assert.deepEqual(local, online);
  assert.equal(online.products.length, 8);
  assert.equal(online.products.reduce((count, product) => count + product.skus.length, 0), 9);
  assert.ok(online.products.some(product => product.id === 'p-santal'));
  assert.ok(online.links.some(link => link.productId === 'p-santal' && link.mediaId === 'sample-perfume-hero'));
  for (const link of online.links) {
    assert.ok(online.products.some(product => product.id === link.productId));
    assert.ok(online.media.some(media => media.id === link.mediaId));
  }
  for (const job of online.jobs) {
    assert.ok(job.productIds.every(id => online.products.some(product => product.id === id)));
    assert.ok(job.mediaIds.every(id => online.media.some(media => media.id === id)));
  }
  online.products[0].name = '线上修改';
  online.products[0].skus.pop();
  assert.equal(local.products[0].name, productSeed[0].name);
  assert.equal(local.products[0].skus.length, 2);
  assert.equal(productSeed[0].skus.length, 2);
});

test('existing workspace edits and deliberate empty catalogs are never reseeded on refresh', () => {
  const edited = { ...initializeProductWorkspace(null), products: [{ ...structuredClone(productSeed[0]), name: '已修改标题' }] };
  assert.strictEqual(initializeProductWorkspace(edited), edited);
  const empty = { ...edited, products: [], links: [], jobs: [] };
  assert.strictEqual(initializeProductWorkspace(empty), empty);
  assert.equal(initializeProductWorkspace(empty).products.length, 0);
  assert.strictEqual(initializeProductWorkspace({ products: [] }).products.length, 0);
});

test('fixtures have valid local photographs, SKU associations and traceable output jobs', () => {
  for (const media of mediaSeed) {
    assert.ok(existsSync(new URL(`../public${media.url}`, import.meta.url)), media.url);
    if (media.jobId) assert.ok(productJobSeed.some(job => job.id === media.jobId && job.mediaIds.includes(media.id)));
  }
  for (const link of associationSeed) {
    const product = productSeed.find(product => product.id === link.productId);
    assert.ok(product);
    assert.ok(mediaSeed.some(media => media.id === link.mediaId));
    assert.ok(link.skuIds.every(id => product.skus.some(sku => sku.id === id)));
  }
  const readiness = productSeed.map(product => productChecks(product, associationSeed, mediaSeed, 'listing').every(check => check.done));
  assert.ok(readiness.includes(true) && readiness.includes(false));
});

test('one-time migration preserves edited products, existing media and jobs', () => {
  const legacy = { ...structuredClone(productSeed[0]), name: '旧示例' };
  const edited = { ...legacy, name: '用户自己改过的商品' };
  const saved = { products: [edited], media: [{ id: 'upload', name: '我的照片' }], links: [], jobs: [{ id: 'user-job' }], socialAccounts: ['keep'] };
  const result = mergeProductMocks(saved, [legacy]);
  assert.deepEqual(result.products.find(product => product.id === edited.id), edited);
  assert.ok(result.media.some(media => media.id === 'upload'));
  assert.ok(result.jobs.some(job => job.id === 'user-job'));
  assert.deepEqual(result.socialAccounts, ['keep']);
  assert.equal(saved.products.length, 1);
  assert.ok(!result.links.some(link => link.productId === edited.id));
});

test('untouched defaults are upgraded; repeat loads never resurrect removed fixtures', () => {
  const legacy = { ...structuredClone(productSeed[0]), name: '旧示例' };
  const result = mergeProductMocks({ products: [legacy], media: [], links: [], jobs: [] }, [legacy]);
  assert.equal(result.products[0].name, productSeed[0].name);
  assert.equal(new Set(result.products.map(product => product.id)).size, result.products.length);
  assert.strictEqual(mergeProductMocks(result, [legacy]), result);
  const removed = { ...result, products: result.products.filter(product => product.id !== productSeed[0].id) };
  assert.equal(mergeProductMocks(removed, [legacy]).products.some(product => product.id === productSeed[0].id), false);
});

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
const { productSeed, mediaSeed, associationSeed, productJobSeed, mergeProductMocks } = await import('../app/product-library-mocks.ts');
const { productChecks } = await import('../app/product-readiness.ts');

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

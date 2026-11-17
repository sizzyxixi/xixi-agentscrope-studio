import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { extname } from 'node:path';
import test from 'node:test';
registerHooks({ resolve(specifier, context, next) { return next(specifier.startsWith('.') && !extname(specifier) && context.parentURL?.includes('/app/') ? `${specifier}.ts` : specifier, context); } });
const { productVideoContext } = await import('../app/product-video-context.ts');
const product = { id: 'p', name: '马克杯', cn_title: '陶瓷杯', skus: [{ id: 'white' }, { id: 'black' }] };
const media = ['shared', 'white', 'black', 'archived', 'other', 'placeholder', 'empty', 'video'].map(id => ({ id, name: id, type: id === 'video' ? 'video' : 'image', url: id === 'empty' ? '' : `/${id}.jpg`, placeholder: id === 'placeholder' }));
const links = media.map(item => ({ productId: item.id === 'other' ? 'other' : 'p', mediaId: item.id, skuIds: ['white', 'black'].includes(item.id) ? [item.id] : [], status: item.id === 'archived' ? '已归档' : '草稿' }));

test('video entry carries current product, selected SKUs and only applicable available images', () => {
  const before = structuredClone({ product, media, links });
  const context = productVideoContext(product, ['white', 'white'], links, media);
  assert.deepEqual(context.productIds, ['p']); assert.deepEqual(context.skuIds, ['white']);
  assert.deepEqual(context.mediaIds, ['shared', 'white']); assert.match(context.prompt, /陶瓷杯/);
  assert.deepEqual({ product, media, links }, before);
  assert.deepEqual(productVideoContext(product, ['white', 'black'], links, media).mediaIds, ['shared', 'white', 'black']);
});

test('deleted products and stale SKUs cannot be carried into creation; products without images still open a draft', () => {
  assert.throws(() => productVideoContext({ ...product, deleted_at: 'now' }, ['white'], links, media), /不可用/);
  assert.throws(() => productVideoContext(product, ['missing'], links, media), /已变更/);
  const context = productVideoContext(product, ['white'], links, []);
  assert.deepEqual(context.mediaIds, []); assert.deepEqual(context.productIds, ['p']);
});

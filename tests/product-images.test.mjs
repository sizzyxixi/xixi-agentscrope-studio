import assert from 'node:assert/strict';
import test from 'node:test';
import { imageScene, productImages } from '../app/product-images.ts';

const media = [
  { id: 'shared', type: 'image', name: '共用图片', url: '/shared.jpg' },
  { id: 'white', type: 'image', name: '白色细节', url: '/white.jpg' },
  { id: 'black', type: 'image', name: '黑色', url: '/black.jpg' },
  { id: 'video', type: 'video', name: '视频', url: '/video.mp4' },
  { id: 'placeholder', type: 'image', name: '占位图', url: '/mock.jpg', placeholder: true },
];
const link = (id, skuIds = [], usage = '主图') => ({ id, productId: 'p', mediaId: id, skuIds, usage, status: '草稿' });
const links = [link('shared'), link('white', ['white'], '细节参考'), link('black', ['black']), link('video'), link('placeholder'), link('missing')];

test('image gallery respects SKU scope and excludes videos, unavailable assets and archived relations', () => {
  const items = productImages('p', links, media, 'white');
  assert.deepEqual(items.map(item => item.media.id), ['shared', 'white']);
  assert.equal(productImages('other', links, media).length, 0);
  assert.equal(productImages('p', links.map(item => ({ ...item, status: '已归档' })), media).length, 0);
});

test('scene filters match explicit usages and keep unknown references unclassified', () => {
  for (const [usage, expected] of [['商品主视图', '主图'], ['主视觉', '主图'], ['详情图', '详情图'], ['平铺图', '平铺图'], ['细节参考', '细节图'], ['成分图', '成份图'], ['成份图', '成份图'], ['商品外观参考', '其他图片']]) assert.equal(imageScene({ usage }), expected);
  assert.deepEqual(productImages('p', links, media, '', '细节图').map(item => item.media.id), ['white']);
});

test('product-specific names preserve library names and duplicate images remain unique per scene', () => {
  const renamed = { ...links[0], displayName: '商品主图' };
  const duplicate = { ...renamed, id: 'second-link', usage: '细节图' };
  assert.equal(productImages('p', [renamed, duplicate], media).length, 1);
  assert.equal(productImages('p', [renamed], media)[0].name, '商品主图');
  assert.equal(media[0].name, '共用图片');
  assert.equal(productImages('p', [renamed, duplicate], media, '', '细节图')[0].link.id, 'second-link');
  assert.equal(productImages('p', [{ ...renamed, displayName: '  ' }], media)[0].name, '共用图片');
});

test('material groups separate SPU ownership from each explicit SKU without shared duplication', async () => {
  const { productMaterialGroups } = await import('../app/product-images.ts');
  const product = { id: 'p', skus: [{ id: 'white' }, { id: 'black' }] };
  const grouped = productMaterialGroups(product, links, media);
  assert.deepEqual(grouped.map(group => [group.id, group.items.map(item => item.media.id)]), [
    ['spu', ['shared', 'video']], ['sku:white', ['white']], ['sku:black', ['black']],
  ]);
  assert.equal(productMaterialGroups(product, links, media, 'image', 'spu')[0].items.length, 1);
  assert.deepEqual(productMaterialGroups(product, links, media, 'video').map(group => group.items.length), [1]);
  assert.deepEqual(productMaterialGroups(product, links, media, 'all', 'sku:white')[0].items.map(item => item.media.id), ['white']);
  assert.deepEqual(productMaterialGroups(product, links, media, 'all', 'sku:deleted'), []);
});

test('grouping deduplicates within a partition, preserves local names and excludes deleted SKU/archived links', async () => {
  const { productMaterialGroups } = await import('../app/product-images.ts');
  const product = { id: 'p', skus: [{ id: 'white' }, { id: 'black' }] };
  const source = [
    { ...link('white', ['white', 'black']), displayName: '共用细节名称' },
    { ...link('white', ['white']), id: 'duplicate' },
    link('shared', ['deleted']), { ...link('black', ['black']), status: '已归档' },
    { ...link('shared'), productId: 'other' },
  ];
  const grouped = productMaterialGroups(product, source, media);
  assert.deepEqual(grouped.map(group => group.items.map(item => item.name)), [['共用细节名称'], ['共用细节名称']]);
  assert.equal(media.find(item => item.id === 'white').name, '白色细节');
});

 test('empty material scopes disappear, including filters with no available files', async () => {
  const { productMaterialGroups } = await import('../app/product-images.ts');
  const product = { id: 'p', skus: [{ id: 'white' }, { id: 'empty' }] };
  assert.deepEqual(productMaterialGroups(product, [link('white', ['white'])], media).map(group => group.id), ['sku:white']);
  assert.deepEqual(productMaterialGroups(product, links, media, 'all', 'sku:empty'), []);
  assert.deepEqual(productMaterialGroups(product, links, media, 'video', 'sku:white'), []);
  assert.deepEqual(productMaterialGroups(product, links, []), []);
});

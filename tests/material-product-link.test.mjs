import assert from 'node:assert/strict';
import test from 'node:test';
import { associateMaterial } from '../app/material-product-link.ts';
import { productAssets } from '../app/product-images.ts';

const product = { id: 'p', skus: [{ id: 'white' }, { id: 'black' }] };
const image = { id: 'image', name: '商品主图', type: 'image', url: '/cup.jpg' };
const video = { id: 'video', name: '商品视频', type: 'video', url: '/cup.mp4' };

test('image links appear in product gallery with scene and selected SKU scope', () => {
  const links = associateMaterial([], product, image, ['white'], '主图', 'link');
  assert.equal(links.length, 1);
  assert.equal(links[0].location, '商品图');
  assert.equal(links[0].status, '草稿');
  assert.equal(productAssets('p', links, [image], 'white', '主图')[0].media, image);
  assert.equal(productAssets('p', links, [image], 'black').length, 0);
  assert.equal(productAssets('p', links, []).length, 0);
});

test('repeated associations are idempotent; SKU scopes merge and common scope covers all variants', () => {
  const first = associateMaterial([], product, image, ['white'], '主图', 'first');
  assert.equal(associateMaterial(first, product, image, ['white'], '主图', 'duplicate'), first);
  const merged = associateMaterial(first, product, image, ['black', 'black'], '主图', 'new');
  assert.equal(merged.length, 1); assert.equal(merged[0].id, 'first');
  assert.deepEqual(merged[0].skuIds, ['white', 'black']);
  const common = associateMaterial(merged, product, image, [], '主图', 'common');
  assert.deepEqual(common[0].skuIds, []);
  assert.equal(associateMaterial(common, product, image, ['white'], '主图', 'again'), common);
});

test('video association closes the product gallery path and keeps other products and scenes intact', () => {
  let links = associateMaterial([], product, image, [], '主图', 'image-link');
  links = associateMaterial(links, product, video, ['white'], '商品视频', 'video-link');
  links = associateMaterial(links, { ...product, id: 'other' }, video, [], '商品视频', 'other-link');
  links = associateMaterial(links, product, image, [], '详情图', 'detail-link');
  assert.equal(links.length, 4);
  const gallery = productAssets('p', links, [image, video], 'white');
  assert.deepEqual(gallery.map(item => item.media.id), ['image', 'video']);
  assert.equal(productAssets('p', links, [image, video], 'white', '视频')[0].media.url, video.url);
  assert.equal(productAssets('p', links, [image, video], 'black', '视频').length, 0);
  assert.equal(productAssets('other', links, [video], 'black', '视频').length, 1);
  assert.equal(image.name, '商品主图');
});

test('archived links reactivate without silently adding their old SKU scope or losing an adopted active link', () => {
  const first = associateMaterial([], product, image, ['white'], '主图', 'old');
  const archived = first.map(link => ({ ...link, status: '已归档' }));
  const restored = associateMaterial(archived, product, image, ['black'], '主图', 'new');
  assert.deepEqual(restored[0].skuIds, ['black']); assert.equal(restored[0].status, '草稿');
  const adopted = { ...first[0], id: 'adopted', status: '已采用' };
  const merged = associateMaterial([...archived, adopted], product, image, ['black'], '主图', 'merge');
  assert.equal(merged.length, 1); assert.equal(merged[0].status, '已采用');
});

test('invalid or unavailable targets cannot create associations', () => {
  assert.throws(() => associateMaterial([], { ...product, deleted_at: '2026-11-13T00:00:00Z' }, image, [], '主图', 'l'), /删除/);
  assert.throws(() => associateMaterial([], product, image, ['deleted'], '主图', 'l'), /SKU/);
  for (const asset of [{ ...image, placeholder: true }, { ...image, url: '' }, { ...image, type: 'document' }]) assert.throws(() => associateMaterial([], product, asset, [], '主图', 'l'), /不可用/);
  assert.throws(() => associateMaterial([], product, image, [], ' ', 'l'), /场景/);
});

test('video renames and legacy scene names do not create a second product association', () => {
  const linked = associateMaterial([], product, video, ['white'], '商品视频', 'first');
  const legacy = linked.map(link => ({ ...link, usage: '视频', displayName: '环境镜头' }));
  const merged = associateMaterial(legacy, product, video, ['black'], '商品视频', 'second');
  assert.equal(merged.length, 1);
  assert.equal(merged[0].displayName, '环境镜头');
  assert.equal(merged[0].usage, '商品视频');
  assert.deepEqual(merged[0].skuIds, ['white', 'black']);
});

test('adding a named image no longer requires a scene and keeps the library name unchanged', () => {
  const old = associateMaterial([], product, image, ['white'], '详情图', 'original');
  const linked = associateMaterial(old, product, image, ['black'], '商品图片', 'new', '包装展示');
  assert.equal(linked.length, 1);
  assert.equal(linked[0].id, 'original');
  assert.equal(linked[0].displayName, '包装展示');
  assert.equal(linked[0].usage, '商品图片');
  assert.deepEqual(linked[0].skuIds, ['white', 'black']);
  assert.equal(image.name, '商品主图');
  assert.equal(associateMaterial(linked, product, image, ['white'], '商品图片', 'again', '包装展示'), linked);
  assert.throws(() => associateMaterial([], product, image, [], '商品图片', 'empty', '  '), /名称/);
});

test('renaming an existing source image updates its visible association instead of creating a hidden duplicate', () => {
  const source = [{ ...associateMaterial([], product, image, [], '商品主视图', 'source')[0], location: '参考素材' }];
  const linked = associateMaterial(source, product, image, ['white'], '商品图片', 'new', '重新命名');
  assert.equal(linked.length, 1);
  assert.equal(linked[0].id, 'source');
  assert.equal(linked[0].location, '参考素材');
  assert.equal(linked[0].displayName, '重新命名');
  assert.deepEqual(linked[0].skuIds, []);
  assert.equal(image.name, '商品主图');
});

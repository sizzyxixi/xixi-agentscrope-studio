import assert from 'node:assert/strict';
import test from 'node:test';
import { selectMaterialFiles, readMaterialUploads } from '../app/product-material-upload.ts';
import { associateMaterial } from '../app/material-product-link.ts';
import { productMaterialGroups } from '../app/product-images.ts';

const image = new File(['image'], '主图.jpg', { type: 'image/jpeg', lastModified: 1 });
const video = new File(['video'], '展示.mp4', { type: 'video/mp4', lastModified: 1 });
const detail = new File(['detail'], '细节.png', { type: 'image/png', lastModified: 1 });
const entry = (file, id) => ({ file, id, name: file.name, previewUrl: `blob:${id}` });

test('multiple image selections reject videos and invalid files while skipping duplicate images', () => {
  const oversized = new File([new Uint8Array(20 * 1024 * 1024 + 1)], '过大.jpg', { type: 'image/jpeg' });
  const invalid = new File(['text'], '说明.txt', { type: 'text/plain' });
  const result = selectMaterialFiles([image, detail, detail, video, invalid, oversized], [entry(image, 'image')]);
  assert.deepEqual(result.accepted, [detail]);
  assert.equal(result.errors.length, 3);
  assert.match(result.errors[0], /仅支持上传图片/);
  assert.match(result.errors[1], /说明.txt/);
  assert.match(result.errors[2], /20MB/);
  assert.equal(selectMaterialFiles([new File(['other'], '主图.jpg', { type: 'image/jpeg', lastModified: 2 })], [entry(image, 'image')]).accepted.length, 1);
});

test('a batch preserves independent names and all files appear only in the selected SKU', async () => {
  const uploads = [entry(image, 'image'), { ...entry(detail, 'detail'), name: ' 商品细节 ' }];
  const media = await readMaterialUploads(uploads, async file => `data:${file.type};base64,ZmlsZQ==`);
  assert.deepEqual(media.map(item => [item.name, item.type]), [['主图.jpg', 'image'], ['商品细节', 'image']]);
  assert.ok(media.every(item => !item.url.startsWith('blob:')));
  const product = { id: 'p', skus: [{ id: 'selected' }, { id: 'empty' }] };
  const links = media.reduce((links, item) => associateMaterial(links, product, item, ['selected'], item.type === 'video' ? '商品视频' : '商品图片', `link-${item.id}`, item.name), []);
  assert.deepEqual(productMaterialGroups(product, links, media).map(group => [group.id, group.items.length]), [['sku:selected', 2]]);
  assert.equal(uploads[1].name, ' 商品细节 ');
});

test('invalid names prevent reading; a failed file rejects the whole batch', async () => {
  let reads = 0;
  await assert.rejects(readMaterialUploads([{ ...entry(image, 'image'), name: ' ' }], async () => { reads++; return 'data:image/jpeg;base64,AA=='; }), /名称/);
  assert.equal(reads, 0);
  await assert.rejects(readMaterialUploads([entry(image, 'image'), entry(detail, 'detail')], async file => {
    if (file === detail) throw new Error('读取失败');
    return 'data:image/jpeg;base64,AA==';
  }), /读取失败/);
  await assert.rejects(readMaterialUploads([], async () => ''), /先上传/);
});

test('video rejection happens before reading any file, even in a mixed batch', async () => {
  let reads = 0;
  await assert.rejects(readMaterialUploads([entry(image, 'image'), entry(video, 'video')], async () => { reads++; return 'data:video/mp4;base64,AA=='; }), /仅支持上传图片/);
  assert.equal(reads, 0);
});

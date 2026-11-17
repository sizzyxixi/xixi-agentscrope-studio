import assert from 'node:assert/strict';
import test from 'node:test';
import { applySkuFields, skuCode, skuDimensionText, skuDimensions, skuFieldErrors, skuFieldValues, skuFromRow, skuImageUrls, skuPrice, skuUpdatePatch, skuWeightUnit, validSkuDecimal } from '../app/sku-fields.ts';
const legacy = { id: 's', code: 'ERP-001', color: '红', name: '旧名称', profile: '旧外观', craftsmanship: '旧工艺', selling: '旧卖点', spec: '红色 / M', price: '0', weight: '250', weightUnit: 'g', dimensions: '10 × 8 × 6 cm', packagingDimensions: '12 × 10 × 8' };
test('source SKU code and ERP code are independent; unsupported presentation fields never enter the write patch', () => {
  const values = { ...skuFieldValues(legacy), sku_code: 'ERP-002', source_sku_code: 'SOURCE-0001', name: '不要保存', color: '蓝', profile: 'x', craftsmanship: 'x', selling: 'x', variants: [0, 1], pid: 'other', customer_id: 100 };
  const patch = skuUpdatePatch(values);
  assert.equal(patch.sku_code, 'ERP-002'); assert.equal(patch.source_sku_code, 'SOURCE-0001');
  for (const key of ['name', 'color', 'profile', 'craftsmanship', 'selling', 'variants', 'pid', 'customer_id']) assert.ok(!(key in patch));
  assert.equal(patch.price, '0'); assert.equal(patch.product_length, '10'); assert.equal(patch.package_height, '8');
});
test('structured measurements take precedence; explicit missing components cannot revive old dimensions', () => {
  const sku = { ...legacy, product_length: '20.00', product_width: null, product_height: '10.00' };
  assert.deepEqual(skuDimensions(sku), ['20.00', '', '10.00']);
  assert.equal(skuDimensionText(sku), '20.00 × 待补 × 10.00 cm');
  assert.deepEqual(skuDimensions({ ...legacy, product_length: null, product_width: null, product_height: null }), ['', '', '']);
});
test('legacy size description stays separate from the six measured dimensions', () => {
  const values = skuFieldValues({ ...legacy, size: '单只尺寸见说明', product_length: '10', product_width: '8', product_height: '6' });
  assert.equal(values.size, '单只尺寸见说明'); assert.equal(values.product_length, '10');
  assert.equal(skuFieldValues({ ...legacy, dimensions: '单只 10×8×6' }).size, '单只 10×8×6');
});
test('weight unit prefers weight_unit, supports old weight_class, and defaults an empty new row to g', () => {
  assert.equal(skuWeightUnit({ ...legacy, weight_unit: 'kg', weight_class: 'g' }), 'kg');
  assert.equal(skuWeightUnit({ ...legacy, weightUnit: undefined, weight_class: '千克' }), 'kg');
  assert.equal(skuWeightUnit({ id: 'new', code: '', color: '', spec: '' }), 'g');
  assert.equal(skuWeightUnit({ ...legacy, weight_unit: 'lb' }), 'lb');
  assert.ok(skuFieldErrors(skuFieldValues({ ...legacy, weight_unit: 'lb' })).length);
});
test('decimal precision follows existing price and dimension columns without rounding the supplied data', () => {
  for (const value of ['0', '0.00', '.50', '9999999999.99']) assert.equal(validSkuDecimal(value), true);
  for (const value of ['', '-1', '1.001', '10000000000', '1e2', 'Infinity']) assert.equal(validSkuDecimal(value), false);
  assert.equal(validSkuDecimal('99999999.99', 10, 2, true), true);
  assert.equal(validSkuDecimal('100000000', 10, 2, true), false);
  assert.ok(skuFieldErrors({ ...skuFieldValues(legacy), package_width: '0' }).length);
  assert.ok(skuFieldErrors({ ...skuFieldValues(legacy), spec: 'x'.repeat(256) }).length);
});
test('editing supported fields preserves source identities and original variants and removes unsupported descriptions', () => {
  const sku = { ...legacy, sku_id: '9007199254740993', products_id: '9007199254740995', pid: '9007199254740997', variants: [0, 1], spec_id: 'SPEC', batch_no: 'BATCH', claim_status: 2, collect_status: 2 };
  const next = applySkuFields(sku, { ...skuFieldValues(sku), sku_code: 'NEW', source_sku_code: 'SOURCE', price: '12.50' });
  assert.equal(skuCode(next), 'NEW'); assert.equal(next.source_sku_code, 'SOURCE'); assert.equal(next.price, '12.50');
  assert.equal(next.sku_id, sku.sku_id); assert.equal(next.products_id, sku.products_id); assert.equal(next.pid, sku.pid);
  assert.deepEqual(next.variants, [0, 1]); assert.equal(next.spec_id, 'SPEC'); assert.equal(next.batch_no, 'BATCH');
  assert.equal(next.claim_status, 2); assert.equal(next.collect_status, 2);
  for (const key of ['name', 'profile', 'craftsmanship', 'selling']) assert.ok(!(key in next));
  assert.equal(legacy.name, '旧名称');
});
test('row display keeps BIGINT identifiers exact, zero price visible and source image representation intact', () => {
  const row = { id: '4', products_id: '9007199254740993', pid: '9007199254740995', sku_id: '9007199254740997', sku_code: '0001', spec: '蓝色 / M', price: '0.00', weight: 0.25, weight_unit: 'kg', images: '["/blue.jpg","https://cdn.test/blue-detail.jpg"]' };
  const sku = skuFromRow(row);
  assert.equal(sku.id, '4'); assert.equal(sku.sku_id, row.sku_id); assert.equal(skuCode(sku), '0001');
  assert.equal(skuPrice(sku), '0.00'); assert.equal(sku.weight, '0.25');
  assert.deepEqual(skuImageUrls(sku), ['/blue.jpg', 'https://cdn.test/blue-detail.jpg']);
  assert.equal(sku.images, row.images);
});

test('named image JSON supplies thumbnails while retaining its original names and URLs', () => {
  const images = JSON.stringify([{ image_name: '正面', url: '/front.jpg' }, { image_name: '侧面', url: 'https://cdn.test/side.jpg' }, { image_name: '无效', url: 'javascript:alert(1)' }, { image_name: '缺少地址' }, null]);
  assert.deepEqual(skuImageUrls({ ...legacy, images }), ['/front.jpg', 'https://cdn.test/side.jpg']);
  assert.equal(skuFieldValues({ ...legacy, images }).sku_code, 'ERP-001');
  assert.equal(JSON.parse(images)[0].image_name, '正面');
});

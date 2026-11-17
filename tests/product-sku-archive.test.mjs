import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { extname } from 'node:path';
import test from 'node:test';
registerHooks({ resolve(specifier, context, next) { return next(specifier.startsWith('.') && !extname(specifier) && context.parentURL?.includes('/app/') ? `${specifier}.ts` : specifier, context); } });
const { skuArchiveFields } = await import('../app/sku-archive-fields.ts');
const sku = { id: '7', code: 'ERP-0001', color: '', spec: '蓝色 / M', price: '', weight: '' };
const all = sku => { const data = skuArchiveFields(sku); return [...data.fields, ...data.records]; };
const value = (sku, key) => all(sku).find(field => field.keys.includes(key)).value;

test('SKU archive covers all 29 table columns exactly once and keeps tracing fields out of everyday facts', () => {
  const expected = 'id products_id pid customer_id customer_uid sku_id sku_code images weight weight_class price size spec variants spec_id batch_no created_at updated_at deleted_at source_sku_code weight_unit product_length product_width product_height package_length package_width package_height claim_status collect_status'.split(' ');
  const actual = all(sku).flatMap(field => field.keys);
  assert.equal(actual.length, 29); assert.equal(new Set(actual).size, 29);
  assert.deepEqual(actual.toSorted(), expected.toSorted());
  const ordinary = skuArchiveFields(sku).fields.flatMap(field => field.keys);
  assert.ok(ordinary.includes('weight')); assert.ok(ordinary.includes('price')); assert.ok(ordinary.includes('product_length'));
  assert.ok(ordinary.includes('sku_id')); assert.ok(ordinary.includes('collect_status'));
  for (const key of ['customer_id', 'customer_uid', 'variants', 'images', 'created_at']) assert.ok(!ordinary.includes(key));
});

test('IDs, source codes and explicit empty batch values keep their original meanings', () => {
  const row = { ...sku, sku_id: '9007199254740993', products_id: '9007199254740995', pid: '9007199254740997', sku_code: '00042', source_sku_code: 'SOURCE-01', batch: 'legacy', batch_no: '' };
  assert.equal(value(row, 'sku_id'), '9007199254740993'); assert.equal(value(row, 'products_id'), '9007199254740995');
  assert.equal(value(row, 'pid'), '9007199254740997'); assert.equal(value(row, 'sku_code'), '00042');
  assert.equal(value(row, 'source_sku_code'), 'SOURCE-01'); assert.equal(value(row, 'batch_no'), '');
});

test('zero prices and weights remain visible; units are displayed independently without converting measurements', () => {
  const row = { ...sku, price: '0.00', weight: '0', weight_unit: 'kg', weight_class: 'g' };
  assert.equal(value(row, 'price'), '0.00'); assert.equal(value(row, 'weight'), '0');
  assert.equal(value(row, 'weight_unit'), 'kg'); assert.equal(value(row, 'weight_class'), 'g');
  assert.equal(value({ ...sku, weight: '', weight_unit: 'kg' }, 'weight_unit'), 'kg');
  assert.equal(value(sku, 'weight_unit'), 'g');
});

test('only documented statuses are translated and no failed/placeholder collection state is invented', () => {
  assert.equal(value({ ...sku, collect_status: 2 }, 'collect_status'), '采集成功');
  assert.equal(value({ ...sku, claim_status: 1 }, 'claim_status'), '未认领');
  assert.equal(value({ ...sku, claim_status: 2 }, 'claim_status'), '已认领');
  for (const key of ['collect_status', 'claim_status']) {
    assert.equal(value({ ...sku, [key]: null }, key), '');
    assert.equal(value({ ...sku, [key]: 99 }, key), '99');
  }
  assert.equal(value({ ...sku, collect_status: 1 }, 'collect_status'), '1');
});

test('partial measurements stay ordinary facts with neutral missing values and separate size prose', () => {
  const row = { ...sku, product_length: '10.50', product_width: null, product_height: '8.00', size: '包装前实测', dimensions: '99 × 99 × 99' };
  assert.equal(value(row, 'product_length'), '10.50 × — × 8.00 cm');
  assert.equal(value(row, 'size'), '包装前实测');
  assert.equal(value({ ...row, product_length: null, product_height: null }, 'product_length'), '');
  assert.ok(!all(row).some(field => field.value.includes('待补')));
});

test('opaque variants, named images and system dates are readable without mutating source data', () => {
  const row = { ...sku, variants: [0, 2], images: '[{"image_name":"侧面","url":"/side.jpg"}]', created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-16T00:00:00Z', deleted_at: null };
  const before = JSON.stringify(row);
  assert.deepEqual(JSON.parse(value(row, 'variants')), [0, 2]);
  assert.equal(value(row, 'images'), row.images);
  assert.notEqual(value(row, 'created_at'), value(row, 'updated_at'));
  assert.equal(value(row, 'deleted_at'), '');
  assert.equal(JSON.stringify(row), before);
});

import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { extname } from 'node:path';
import test from 'node:test';
registerHooks({ resolve(specifier, context, next) { return next(specifier.startsWith('.') && !extname(specifier) && context.parentURL?.includes('/app/') ? `${specifier}.ts` : specifier, context); } });
const { skuArchiveFields } = await import('../app/sku-archive-fields.ts');
const sku = { id: '7', code: 'ERP-0001', color: '', spec: '蓝色 / M', price: '', weight: '' };
const all = sku => { const data = skuArchiveFields(sku); return [...data.fields, ...data.records]; };
const value = (sku, key) => all(sku).find(field => field.keys.includes(key)).value;

test('SKU archive hides technical identifiers and obsolete fields while retaining business facts', () => {
  const visible = 'sku_code source_sku_code spec price weight weight_unit weight_class product_length product_width product_height package_length package_width package_height batch_no created_at updated_at variants'.split(' ');
  const hidden = 'id products_id pid customer_id customer_uid sku_id images size spec_id deleted_at collect_status claim_status'.split(' ');
  const actual = all(sku).flatMap(field => field.keys);
  assert.deepEqual(actual.toSorted(), visible.toSorted());
  assert.ok(hidden.every(key => !actual.includes(key)));
  assert.equal(skuArchiveFields(sku).fields.length, 7);
  assert.deepEqual(skuArchiveFields(sku).records.flatMap(field => field.keys), ['batch_no', 'created_at', 'updated_at', 'variants']);
});

test('IDs, source codes and explicit empty batch values keep their original meanings', () => {
  const row = { ...sku, sku_id: '9007199254740993', products_id: '9007199254740995', pid: '9007199254740997', sku_code: '00042', source_sku_code: 'SOURCE-01', batch: 'legacy', batch_no: '' };
  const before = structuredClone(row);
  assert.equal(value(row, 'sku_code'), '00042');
  assert.deepEqual(row, before);
  assert.equal(value(row, 'source_sku_code'), 'SOURCE-01'); assert.equal(value(row, 'batch_no'), '');
});

test('weight and resolved units share one compact field without converting measurements', () => {
  const row = { ...sku, price: '0.00', weight: '0', weight_unit: 'kg', weight_class: 'g' };
  assert.equal(value(row, 'price'), '0.00'); assert.equal(value(row, 'weight'), '0 kg');
  assert.equal(value({ ...sku, weight: '250', weight_class: 'g' }, 'weight'), '250 g');
  assert.equal(value({ ...sku, weight: '', weight_unit: 'kg' }, 'weight'), '');
  assert.equal(value(sku, 'weight'), '');
});

test('legacy claim and ingestion statuses remain data only, without a local publication workflow', () => {
  assert.equal(all({ ...sku, claim_status: 2 }).some(field => field.keys.includes('claim_status')), false);
  assert.equal(all({ ...sku, collect_status: 2 }).some(field => field.keys.includes('collect_status')), false);
});

test('partial measurements stay ordinary facts with neutral missing values without obsolete size prose', () => {
  const row = { ...sku, product_length: '10.50', product_width: null, product_height: '8.00', size: '包装前实测', dimensions: '99 × 99 × 99' };
  assert.equal(value(row, 'product_length'), '10.50 × — × 8.00 cm');
  assert.equal(all(row).some(field => field.keys.includes('size')), false);
  assert.equal(value({ ...row, product_length: null, product_height: null }, 'product_length'), '');
  assert.ok(!all(row).some(field => field.value.includes('待补')));
});

test('opaque variants, named images and system dates are readable without mutating source data', () => {
  const row = { ...sku, variants: [0, 2], images: '[{"image_name":"侧面","url":"/side.jpg"}]', created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-16T00:00:00Z', deleted_at: null };
  const before = JSON.stringify(row);
  assert.deepEqual(JSON.parse(value(row, 'variants')), [0, 2]);
  assert.equal(all(row).some(field => field.keys.includes('images')), false);
  assert.notEqual(value(row, 'created_at'), value(row, 'updated_at'));
  assert.equal(all(row).some(field => field.keys.includes('deleted_at')), false);
  assert.equal(JSON.stringify(row), before);
});

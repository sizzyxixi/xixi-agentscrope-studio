import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { extname } from 'node:path';
import test from 'node:test';
registerHooks({ resolve(specifier, context, next) { return next(specifier.startsWith('.') && !extname(specifier) && context.parentURL?.includes('/app/') ? `${specifier}.ts` : specifier, context); } });
const { productDisplayId } = await import('../app/product-fields.ts');
const { productInformationSections, productInformationTime, productRawValue } = await import('../app/product-information-fields.ts');
const product = { id: '9007199254740993', name: '历史标题', code: '', brand: '', category: '', skus: [], erp: {} };
const fields = product => productInformationSections(product).flatMap(section => section.fields);
const value = (product, key) => fields(product).find(field => field.key === key).value;

test('detail view omits technical fields in every section, including collapsed content', () => {
  const hidden = 'id products_id status ai_choose customer_id customer_uid brand_id category_id attributes extend main_image images video operate_platform deleted_at'.split(' ');
  const populated = { ...product, source_url: 'https://detail.1688.com/offer/840020550702.html', ...Object.fromEntries(hidden.map(key => [key, 'technical-value'])) };
  const actual = fields(populated).map(field => field.key);
  assert.ok(hidden.every(key => !actual.includes(key)));
  assert.equal(new Set(actual).size, actual.length);
  for (const key of ['cn_title', 'title', 'cn_description', 'description', 'brand_name', 'category_name', 'spu_code', 'supply_source', 'source_url', 'target_user', 'keyword', 'remarks']) assert.ok(actual.includes(key));
});

test('source link is optional read-only navigation; Excel and image imports do not ask for one', () => {
  const linked = { ...product, source_url: 'https://detail.1688.com/offer/840020550702.html' };
  assert.equal(fields(linked).find(field => field.key === 'source_url').link, true);
  for (const source of ['Excel 导入', '图采建档']) {
    const row = { ...product, source, source_url: null };
    assert.equal(fields(row).some(field => field.key === 'source_url'), false);
    assert.equal(value(row, 'source_type'), source);
  }
  assert.equal(fields({ ...product, source_url: 'javascript:alert(1)' }).some(field => field.key === 'source_url'), false);
});

test('Chinese and English values stay independent and explicit empty values never revive aliases', () => {
  const row = { ...product, cn_title: '', title: 'Travel Mug', cn_description: '', description: 'English only', erp: { description: '历史中文描述' } };
  assert.equal(value(row, 'cn_title'), ''); assert.equal(value(row, 'title'), 'Travel Mug');
  assert.equal(value(row, 'cn_description'), ''); assert.equal(value(row, 'description'), 'English only');
  assert.equal(fields(row).some(field => field.key === 'id'), false);
  assert.equal(row.id, '9007199254740993');
  assert.equal(fields({ ...row, products_id: '9007199254740997' }).some(field => field.key === 'products_id'), false);
});

test('legacy claim state stays hidden and technical values remain untouched', () => {
  const known = { ...product, status: 0, ai_choose: 0, claim_status: 1, operate_platform: 'alibaba_lapp', brand_id: 0, category_id: 0 };
  assert.equal(fields(known).some(field => field.key === 'claim_status'), false);
  assert.ok(fields(known).every(field => !['id', 'brand_id', 'category_id'].includes(field.key)));
  assert.equal(known.brand_id, 0); assert.equal(known.category_id, 0);
  assert.equal(known.claim_status, 1);
});

test('hidden JSON and images remain unchanged while sales specifications stay readable', () => {
  const row = { ...product, attributes: [{ 原属性: '中英原样', Color: 'White' }], variables: { custom: ['不规定结构'] }, extend: { alibaba: { quote_type: 'range', price_ranges: [{ price: '3.50', begin: 20 }] } }, images: '[{"image_name":"包装图片","url":"https://example.com/image.png"}]' };
  const before = JSON.stringify(row);
  assert.deepEqual(JSON.parse(value(row, 'variables')), row.variables);
  for (const key of ['attributes', 'extend', 'images']) assert.equal(fields(row).some(field => field.key === key), false);
  assert.equal(JSON.stringify(row), before);
  assert.equal(productRawValue(null), ''); assert.equal(productRawValue(0), '0');
});

test('collection timestamps remain distinct from detail collection and ordinary record updates', () => {
  const row = { ...product, detail_synced_at: '2026-11-01T00:00:00Z', last_gathered_at: null, updated_at: '2026-11-16T00:00:00Z', created_at: '2026-10-01T00:00:00Z', last_gather_batch_no: 'batch-12' };
  assert.equal(value(row, 'last_gathered_at'), '');
  assert.equal(value(row, 'last_gather_batch_no'), 'batch-12');
  assert.notEqual(value(row, 'detail_synced_at'), value(row, 'updated_at'));
  assert.match(value(row, 'detail_synced_at'), /2026/);
  assert.equal(productInformationTime('unknown'), 'unknown');
  assert.equal(productInformationTime(undefined), '');
});

test('the displayed product ID uses products_id only, preserving zero and large identifiers', () => {
  assert.equal(productDisplayId(product), '');
  assert.equal(productDisplayId({ ...product, products_id: null }), '');
  assert.equal(productDisplayId({ ...product, products_id: '' }), '');
  assert.equal(productDisplayId({ ...product, products_id: 0 }), '0');
  assert.equal(productDisplayId({ ...product, products_id: '9007199254740993123' }), '9007199254740993123');
  assert.equal(fields({ ...product, products_id: '9007199254740993123' }).some(field => field.key === 'products_id'), false);
});

test('supply source and readable sales options stay in basic information, with a single collapsed source section', () => {
  const row = { ...product, supply_source: 'alibaba', variables: { 颜色: ['白色', '黑色'], 尺码: ['S', 'M', 'L'] } };
  const sections = productInformationSections(row);
  assert.equal(sections.length, 2);
  assert.deepEqual(sections[0].fields.find(field => field.key === 'variables').specifications, [{ name: '颜色', options: ['白色', '黑色'] }, { name: '尺码', options: ['S', 'M', 'L'] }]);
  assert.equal(sections[0].fields.find(field => field.key === 'supply_source').value, '阿里1688');
  assert.equal(sections[1].title, '更多资料'); assert.equal(sections[1].collapsed, true);
  for (const key of ['source_type', 'detail_synced_at', 'last_gathered_at', 'created_at', 'updated_at']) assert.ok(sections[1].fields.some(field => field.key === key));
  assert.ok(!sections[1].fields.some(field => ['variables', 'supply_source'].includes(field.key)));
});

test('basic information follows the requested order and all other visible fields move to more details', () => {
  const sections = productInformationSections({ ...product, ingredient: '棉', efficacy: '柔软', claim_status: 1 });
  assert.deepEqual(sections[0].fields.map(field => field.key), ['cn_title', 'title', 'cn_description', 'description', 'spu_code', 'brand_name', 'supply_source', 'variables', 'target_user', 'keyword', 'remarks']);
  for (const key of ['category_name', 'ingredient', 'efficacy', 'source_type', 'created_at']) assert.ok(sections[1].fields.some(field => field.key === key));
  assert.equal(sections[1].title, '更多资料'); assert.equal(sections[1].collapsed, true);
});

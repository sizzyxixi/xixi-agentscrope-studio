import assert from 'node:assert/strict';
import test from 'node:test';
import { editableProductFields, productTitle, productFieldValues, productUpdatePatch, productIngredient, productEfficacy, productGatheredAt, applyProductFields } from '../app/product-fields.ts';
const product = { id: '9007199254740993', name: '历史中文标题', code: 'CUP', brand: '旧品牌', category: '', material: '不锈钢外壳', selling: '历史营销卖点', dimensions: '10×8×8', packaging: '彩盒', audience: '通勤', source: '手动创建', currency: 'USD', skus: [], erp: { description: '旧中文描述', efficacy: '原功效', notes: '旧备注' } };
test('Chinese and English text are independent, and cleared fields never resurrect legacy aliases', () => {
  const p = { ...product, title: 'Travel Mug', cn_title: '', description: 'English description', cn_description: '', ingredient: '', efficacy: '' };
  assert.equal(productTitle(p), 'Travel Mug');
  assert.equal(productFieldValues(p).cn_title, '');
  assert.equal(productFieldValues(p).cn_description, '');
  assert.equal(productIngredient(p), ''); assert.equal(productEfficacy(p), '');
  assert.equal(productTitle({ ...p, title: '' }), '');
});
test('legacy material and selling prose are not silently relabelled as ingredient and efficacy', () => {
  assert.equal(productIngredient(product), ''); assert.equal(productEfficacy({ ...product, erp: {} }), '');
  assert.equal(productIngredient({ ...product, source: 'Excel 导入' }), product.material);
});
test('update allowlist excludes unsupported SPU fields, tenant identity, workflow state and uncontracted JSON', () => {
  const fields = { ...productFieldValues(product), cn_title: ' 中文 ', title: ' English ', ingredient: '陶瓷', remarks: '', currency: 'USD', selling: '不要保存', packaging: '盒', dimensions: '1x2x3', customer_id: 2, customer_uid: 'other', attributes: { invented: 1 }, variables: [], extend: {}, listingDrafts: [] };
  const patch = productUpdatePatch(fields);
  assert.equal(patch.cn_title, '中文'); assert.equal(patch.title, 'English'); assert.equal(patch.remarks, null);
  for (const key of ['source_url', 'ingredient', 'efficacy', 'currency', 'selling', 'packaging', 'dimensions', 'customer_id', 'customer_uid', 'attributes', 'variables', 'extend', 'listingDrafts']) assert.ok(!(key in patch));
});
test('applying supported fields preserves opaque JSON, IDs and independent listing/SKU data', () => {
  const p = { ...product, customer_id: 7, attributes: [{ 原属性: '不变' }], variables: [{ 颜色: ['红', '蓝'] }], extend: { alibaba: { quote_type: 'range', price_ranges: [{ begin: 10, price: 5 }] } }, source_url: 'https://detail.1688.com/offer/840020550702.html', ingredient: '原成分', efficacy: '原功效', listingDrafts: [{ currency: 'EUR' }], skus: [{ id: 'sku', price: '10' }] };
  const next = applyProductFields(p, { ...productFieldValues(p), cn_title: '新标题', title: 'New title', efficacy: '新功效', ingredient: '陶瓷' });
  assert.equal(next.id, '9007199254740993'); assert.equal(next.customer_id, 7);
  assert.deepEqual(next.attributes, p.attributes); assert.deepEqual(next.variables, p.variables); assert.deepEqual(next.extend, p.extend);
  assert.deepEqual(next.skus, p.skus); assert.deepEqual(next.listingDrafts, p.listingDrafts);
  assert.ok(!('currency' in next)); assert.equal(next.name, '新标题');
  assert.equal(next.ingredient, '原成分'); assert.equal(next.efficacy, '原功效');
  assert.equal(next.source_url, p.source_url); assert.equal(next.material, p.material); assert.equal(next.selling, p.selling);
  assert.equal(next.dimensions, p.dimensions); assert.equal(next.packaging, p.packaging);
});
test('collection time follows last_gathered_at and never falls back to ordinary edit timestamps', () => {
  assert.equal(productGatheredAt({ ...product, updatedAt: '2026-11-13', updated_at: '2026-11-13' }), undefined);
  assert.equal(productGatheredAt({ ...product, last_gathered_at: null, collectedAt: 'old' }), undefined);
  assert.equal(productGatheredAt({ ...product, last_gathered_at: 'new', collectedAt: 'old' }), 'new');
});

test('only the requested business fields can be edited, including supply source', () => {
  const expected = 'spu_code brand_name category_name title cn_title description cn_description target_user keyword remarks supply_source'.split(' ');
  assert.deepEqual([...editableProductFields].sort(), expected.sort());
  const values = { ...productFieldValues(product), supply_source: ' alibaba ', source_url: 'changed', ingredient: 'changed', efficacy: 'changed' };
  assert.equal(productUpdatePatch(values).supply_source, 'alibaba');
  assert.equal(applyProductFields(product, values).erp.supplySource, 'alibaba');
  assert.equal(productUpdatePatch({ ...values, supply_source: '' }).supply_source, '');
});

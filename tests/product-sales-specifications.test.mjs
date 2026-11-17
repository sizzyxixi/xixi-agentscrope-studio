import assert from 'node:assert/strict';
import test from 'node:test';
import { productSalesSpecifications } from '../app/product-sales-specifications.ts';

test('sales specifications display independent dimensions without changing the source or SKU indexes', () => {
  const source = { 颜色: ['黑色', '白色', '黑色'], 尺码: ['S', 'M', 'L'] };
  const before = structuredClone(source);
  assert.deepEqual(productSalesSpecifications(source), [{ name: '颜色', options: ['黑色', '白色'] }, { name: '尺码', options: ['S', 'M', 'L'] }]);
  assert.deepEqual(source, before);
  assert.deepEqual(productSalesSpecifications([{ name: ' 尺码 ', options: [{ value: 'S' }, { value: 'M' }, 0] }]), [{ name: '尺码', options: ['S', 'M', '0'] }]);
});

test('missing and unknown JSON stays safe and never invents option groups', () => {
  for (const value of [null, undefined, '', 0, [], {}, { empty: [] }, { custom: { nested: true } }, [{ unknown: true }]]) assert.deepEqual(productSalesSpecifications(value), []);
});

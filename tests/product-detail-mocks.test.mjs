import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { extname } from 'node:path';
import test from 'node:test';
registerHooks({ resolve(specifier, context, next) { return next(specifier.startsWith('.') && !extname(specifier) && context.parentURL?.includes('/app/') ? `${specifier}.ts` : specifier, context); } });
const { fillProductDetailMock } = await import('../app/product-detail-mocks.ts');
const { productSeed } = await import('../app/product-library-mocks.ts');

test('fixtures include bilingual details and realistic sources with links only when present', () => {
  const linked = productSeed.find(product => product.id === 'p-cup');
  assert.equal(linked.source_type, 'alibaba');
  assert.equal(linked.supply_source, 'alibaba');
  assert.equal(linked.source_url, `https://detail.1688.com/offer/${linked.source_product_id}.html`);
  for (const product of productSeed) {
    for (const key of ['products_id', 'title', 'cn_title', 'description', 'cn_description', 'spu_code', 'brand_name', 'category_name', 'target_user', 'keyword', 'supply_source', 'last_gathered_at', 'last_gather_batch_no']) assert.ok(product[key], `${product.id} ${key}`);
    if (['Excel 导入', '图采建档'].includes(product.source)) {
      assert.equal(product.source_url, null); assert.equal(product.source_product_id, null);
    }
  }
});

test('existing fixtures gain missing fields without replacing user changes or explicit empties', () => {
  const old = { id: 'p-cup', mock: true, name: '用户标题', code: 'CUSTOM', brand: '我的品牌', category: '家居', audience: '用户人群', selling: '商品描述', skus: [], title: '', source_url: null, supply_source: 'product_group' };
  const before = structuredClone(old);
  const next = fillProductDetailMock(old);
  assert.equal(next.title, ''); assert.equal(next.cn_title, '用户标题'); assert.equal(next.spu_code, 'CUSTOM');
  assert.equal(next.brand_name, '我的品牌'); assert.equal(next.source_url, null); assert.equal(next.supply_source, 'product_group');
  assert.deepEqual(old, before);
  assert.strictEqual(fillProductDetailMock(next), next);
  const real = { ...old, mock: false };
  assert.strictEqual(fillProductDetailMock(real), real);
  const unknown = { ...old, id: 'user-product' };
  assert.strictEqual(fillProductDetailMock(unknown), unknown);
});

test('mock sales options cover color and size while existing nonempty source JSON remains intact', () => {
  const watch = productSeed.find(product => product.id === 'mock-p-watch');
  assert.deepEqual(watch.variables, { 颜色: ['云雾白'], 尺码: ['42 mm / 硅胶表带'] });
  assert.deepEqual(fillProductDetailMock({ ...watch, variables: null }).variables, watch.variables);
  const custom = { ...watch, variables: { custom: ['original'] } };
  assert.strictEqual(fillProductDetailMock(custom), custom);
});
test('legacy mock SKU placeholders become ordinary specifications without replacing custom or real data',()=>{
 const fixture=productSeed.find(product=>product.id==='p-skin');
 const old={...structuredClone(fixture),skus:fixture.skus.map(sku=>({...sku,spec:'组合清单待核实'})),variables:{颜色:['原值'],规格:['组合清单待核实']}};
 const next=fillProductDetailMock(old);
 assert.equal(next.skus[0].spec,'标准套装');assert.deepEqual(next.variables,{颜色:['原值'],规格:['标准套装']});
 assert.equal(old.skus[0].spec,'组合清单待核实');assert.strictEqual(fillProductDetailMock(next),next);
 const edited={...next,skus:next.skus.map(sku=>({...sku,spec:'保湿乳 100 ml'}))};assert.strictEqual(fillProductDetailMock(edited),edited);
 const real={...old,mock:false};assert.strictEqual(fillProductDetailMock(real),real);
});

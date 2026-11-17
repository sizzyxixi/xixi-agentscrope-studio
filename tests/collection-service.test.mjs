import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { extname } from 'node:path';
registerHooks({ resolve(specifier, context, next) { return next(specifier.startsWith('.') && !extname(specifier) && context.parentURL?.includes('/app/') ? `${specifier}.ts` : specifier, context); } });
const { assertComplete, collectionAdapter, mergeCollected, retryable } = await import('../app/collection-service.ts');
import { excludeExistingSkus, importColumns, parseProductTable } from '../app/product-import.ts';
const values = (updates = {}) => importColumns.map(key => ({'父商品编码':'CUP','商品标题(中文)':'陶瓷杯','主图URL':'https://oss.westmonth.com/cup.jpg','成分':'陶瓷','功效':'盛装饮品','SKU货号':'CUP-W','规格(货源侧)':'白色','重量':'280','重量单位':'g','产品尺寸(长 cm)':'8','产品尺寸(宽 cm)':'8','产品尺寸(高 cm)':'10','包装尺寸(长 cm)':'12','包装尺寸(宽 cm)':'12','包装尺寸(高 cm)':'14',...updates}[key] || ''));
const item = () => parseProductTable([importColumns, values()], 'batch').rows[0];

test('success requires complete facts, SKU measurements and stored main + SKU images', () => {
  assert.doesNotThrow(() => assertComplete(item()));
  for (const update of [i => i.product.skus[0].spec = '', i => i.product.skus[0].weight = '250–300', i => i.product.skus[0].packagingDimensions = '8 × 8', i => i.images[0].url = 'https://supplier.test/cup.jpg', i => i.images[0].main = false, i => i.images = []]) {
    const value = item(); update(value); assert.throws(() => assertComplete(value));
  }
});
test('unconfigured ERP adapter cannot fabricate collection, uploads or AI results', async () => {
  assert.equal(await collectionAdapter().authorization('1688'), 'unavailable');
  await assert.rejects(() => collectionAdapter().collect({}), {code:'SERVICE_UNAVAILABLE'});
  await assert.rejects(() => collectionAdapter().upload({}), {code:'SERVICE_UNAVAILABLE'});
  await assert.rejects(() => collectionAdapter().analyze([], {}), {code:'SERVICE_UNAVAILABLE'});
  assert.equal(retryable('TIMEOUT'), true); assert.equal(retryable('AUTH_EXPIRED'), false); assert.equal(retryable('LINK_INVALID'), false);
});
test('Excel skips global explicit SKU; implicit SKU dedupes on explicit parent + spec; new SKU appends', () => {
  const original = item().product;
  assert.equal(excludeExistingSkus(parseProductTable([importColumns, values({'父商品编码':'DIFFERENT'})], 'second').rows, [original]).skipped, 1);
  assert.equal(excludeExistingSkus(parseProductTable([importColumns, values({'SKU货号':''})], 'second').rows, [original]).skipped, 1);
  const added = excludeExistingSkus(parseProductTable([importColumns, values({'SKU货号':'CUP-B','规格(货源侧)':'蓝色'})], 'second').rows, [original]);
  assert.equal(added.skipped, 0);
  const catalog = mergeCollected({products:[original],links:[],media:[]}, added.rows, 'append', 'second');
  assert.equal(catalog.products.length, 1); assert.equal(catalog.products[0].skus.length, 2); assert.equal(catalog.products[0].name, original.name);
  const anonymous = parseProductTable([importColumns, values({'父商品编码':'','SKU货号':''})], 'third');
  assert.equal(excludeExistingSkus(anonymous.rows, [anonymous.rows[0].product]).skipped, 0);
});
test('recollection replaces edited source facts and source references while retaining creative material, SKU identity and snapshots', () => {
  const original = item(); original.product.erp = {...original.product.erp, sourceType:'1688',sourceId:'6945218330',sourceSite:'1688.com'};
  original.product.name = '运营修改标题'; original.product.category = '刊登类目'; original.product.audience='咖啡爱好者'; original.product.creativeBrief={useCase:'办公'};
  original.product.collectedAt = '2026-11-01T08:00:00Z'; original.product.listingClaims = [{shopId:'shop-us',shopName:'美国店',site:'US',claimedAt:'2026-11-02T08:00:00Z'}];
  const version = {id:'version',skuIds:[original.product.skus[0].id],title:'原刊登快照'}; original.product.contentVersions=[version];
  const incoming = item(); incoming.product.id='different-id'; incoming.product.skus[0].id='different-sku-id'; incoming.images[0].skuId='different-sku-id'; incoming.product.erp={...original.product.erp}; incoming.product.material='新成分';
  const links = [{id:'source',productId:original.product.id,skuIds:[original.product.skus[0].id],collection:'来源素材',location:'参考素材'}, {id:'creative',productId:original.product.id,skuIds:[original.product.skus[0].id],collection:'生成',location:'商品图'}, {id:'manual',productId:original.product.id,skuIds:[],collection:'',location:'参考素材'}];
  const merged = mergeCollected({products:[original.product],links,media:[]}, [incoming], 'replace', 'next-batch');
  assert.equal(merged.products.length, 1); const product = merged.products[0];
  assert.equal(product.id, original.product.id); assert.equal(product.skus[0].id, original.product.skus[0].id);
  assert.equal(product.name, '陶瓷杯'); assert.equal(product.material, '新成分'); assert.equal(product.category, '刊登类目');
  assert.equal(product.audience, '咖啡爱好者'); assert.deepEqual(product.creativeBrief, original.product.creativeBrief); assert.deepEqual(product.contentVersions, [version]);
  assert.ok(!merged.links.some(link => link.id === 'source')); assert.ok(merged.links.some(link => link.id === 'creative')); assert.ok(merged.links.some(link => link.id === 'manual'));
  assert.equal(product.skus[0].batch, 'next-batch');
  assert.equal(product.collectedAt, original.product.collectedAt);
  assert.ok(product.last_gathered_at); assert.notEqual(product.last_gathered_at, original.product.collectedAt);
  assert.equal(product.last_gather_batch_no, 'next-batch');
  assert.deepEqual(product.listingClaims, original.product.listingClaims);
});


test('collection accepts products without category-specific composition or efficacy', () => {
  const optional = parseProductTable([importColumns, values({'成分':'', '功效':''})], 'optional').rows[0];
  assert.doesNotThrow(() => assertComplete(optional));
});

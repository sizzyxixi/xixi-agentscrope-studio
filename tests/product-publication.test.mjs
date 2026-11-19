import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { extname } from 'node:path';
import test from 'node:test';
registerHooks({ resolve(specifier, context, next) { return next(specifier.startsWith('.') && !extname(specifier) && /\/(app|lib)\//.test(context.parentURL || '') ? `${specifier}.ts` : specifier, context); } });
const { createProductPublicationContext, publicationPrompt, publicationProductMessage, publicationSkuCount, publicationAgentId } = await import('../app/product-publication.ts');
const product = { id: 'p-1', products_id: '9007199254740993123', name: '陶瓷杯', code: 'CUP', brand: '品牌', category: '水具', source: '1688', audience: '', selling: '', material: '', dimensions: '', packaging: '', skus: [{ id: 'white', code: 'CUP-W', color: '白', spec: '白色', price: '0.00' }, { id: 'black', code: 'CUP-B', color: '黑', spec: '黑色' }] };
const other = { ...product, id: 'p-2', products_id: '9007199254740993124', name: '随行水瓶', code: 'BOTTLE', skus: [{ id: 'bottle', code: 'BOT-500', color: '', spec: '500ml' }] };
const shop = { id: 'shop-sg', name: '家居旗舰店', platform: 'Lazada', site: 'SG', currency: 'SGD', active: true, authorized: true };
const scopes = [{ productId: product.id, skuIds: ['white'] }, { productId: other.id, skuIds: ['bottle'] }];

test('publication hands off one shop and all selected products without broadening SKU scope', () => {
  const before = JSON.stringify([product, other]);
  const context = createProductPublicationContext([product, other], scopes, shop, () => '/creative/mug.jpg');
  assert.equal(context.products.length, 2); assert.equal(publicationSkuCount(context), 2);
  assert.deepEqual(context.products[0].skus.map(sku => sku.sku_code), ['CUP-W']);
  assert.equal(context.products[0].businessId, product.products_id);
  assert.equal(context.shop.id, 'shop-sg'); assert.equal(context.products[0].image, '/creative/mug.jpg');
  assert.equal(context.products[0].skus[0].price, '0.00');
  assert.equal(publicationPrompt(context), '将这批商品刊登到「家居旗舰店」店铺。');
  context.products[0].fields.cn_title = '修改'; context.products[0].skus[0].spec = '修改';
  assert.equal(JSON.stringify([product, other]), before);
});

test('whole SPU selection and overlapping scopes stay unique and can be repeated for the same shop', () => {
  const claimed = { ...product, listingClaims: [{ shopId: shop.id, skuIds: ['white', 'black'] }], claim_status: 2 };
  const selections = [{ productId: product.id, skuIds: ['white', 'black'] }, { productId: product.id, skuIds: ['white'] }];
  const first = createProductPublicationContext([claimed], selections, shop);
  assert.equal(first.products.length, 1); assert.equal(publicationSkuCount(first), 2);
  assert.deepEqual(createProductPublicationContext([claimed], selections, shop), first);
  assert.equal(claimed.claim_status, 2);
});

test('deleted or stale product/SKU selections and invalid shop authorizations block handoff', () => {
  for (const products of [[], [{ ...product, deleted_at: '2026-11-01' }], [{ ...product, skus: [] }], [{ ...product, skus: product.skus.map(sku => ({ ...sku, deleted_at: '2026-11-01' })) }]]) {
    assert.throws(() => createProductPublicationContext(products, scopes.slice(0, 1), shop), /已变化/);
  }
  for (const target of [{ ...shop, authorized: false }, { ...shop, active: false }, { ...shop, expiresAt: '2000-01-01' }]) assert.throws(() => createProductPublicationContext([product], scopes.slice(0, 1), target), /授权已失效/);
  assert.throws(() => createProductPublicationContext([product], [], shop), /已变化/);
});

test('conversation receives selected facts and stable business IDs without images, local IDs or claim state', () => {
  const context = createProductPublicationContext([product, other], scopes, shop, () => 'data:image/png;base64,private-image');
  const message = publicationProductMessage(context);
  assert.match(message, /2 个商品 \/ 2 个 SKU/); assert.match(message, /陶瓷杯/); assert.match(message, /随行水瓶/);
  assert.match(message, /9007199254740993123/); assert.match(message, /CUP-W/); assert.ok(!message.includes('CUP-B'));
  for (const value of ['data:image', 'p-1', 'claim_status', 'listingClaims']) assert.ok(!message.includes(value), value);
  assert.equal(publicationAgentId('Lazada'), 'official-lazada'); assert.equal(publicationAgentId('TikTok Shop'), 'official-tiktok');
});

const {readPublicationMessage,publicationMessageStart,publicationMessageEnd}=await import('../app/product-publication-message.ts');
test('sent and reloaded conversations render product cards and the user prompt instead of internal fact JSON',()=>{
 const context=createProductPublicationContext([product,other],scopes,shop,()=>'/creative/mug.jpg');
 const text='将这批商品刊登到目标店铺，并先检查资料。';
 const message='目标店铺：家居旗舰店\n'+publicationProductMessage(context)+text;
 const preview=readPublicationMessage(message);
 assert.equal(preview.text,text);assert.equal(preview.shop.platform,'Lazada');assert.equal(preview.products.length,2);
 assert.deepEqual(preview.products[0].codes,['CUP-W']);assert.equal(preview.products[0].image,'/creative/mug.jpg');
 assert.deepEqual(readPublicationMessage(JSON.parse(JSON.stringify(message))),preview);
 assert.equal(readPublicationMessage('一般经营消息'),null);
 for(const data of [{version:1,shop:{name:'店铺',site:'SG',platform:'Lazada'},products:[{cn_title:'商品',skus:[]}]},{version:2,products:[]},null])assert.equal(readPublicationMessage(`${publicationMessageStart}\n${JSON.stringify(data)}\n${publicationMessageEnd}\n文字`),null);
});

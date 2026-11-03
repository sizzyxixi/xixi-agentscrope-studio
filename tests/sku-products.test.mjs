import assert from 'node:assert/strict';
import test from 'node:test';
import {splitSkuProducts} from '../app/sku-products.ts';
const product={id:'p',name:'杯子',code:'P',selling:'共用卖点',dimensions:'10cm',skus:[{id:'red',code:'RED',color:'红'},{id:'blue',code:'BLUE',color:'蓝',selling:'蓝色卖点'}]};
const links=[{id:'common',productId:'p',mediaId:'shared',skuIds:[]},{id:'red-only',productId:'p',mediaId:'red-photo',skuIds:['red']}];
test('each SKU becomes an independent record without copying file entities or leaking exclusive references',()=>{
 const result=splitSkuProducts([product],links);
 assert.equal(result.products.length,2);
 assert.ok(result.products.every(p=>p.skus.length===1));
 assert.deepEqual(result.links.filter(l=>l.productId==='p--blue').map(l=>l.mediaId),['shared']);
 assert.equal(result.products[1].selling,'蓝色卖点');
 assert.equal(product.skus.length,2);
 result.products[0].skus[0].color='绿';
 assert.equal(product.skus[0].color,'红');
});
test('repeated normalization keeps stable IDs and relationships',()=>{
 const once=splitSkuProducts([product],links);
 assert.deepEqual(splitSkuProducts(once.products,once.links),once);
});

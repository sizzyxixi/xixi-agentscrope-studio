import assert from 'node:assert/strict';
import test from 'node:test';
import { productChecks, productReferences, productSignature } from '../app/product-readiness.ts';
const product={id:'p',name:'杯子',code:'CUP',brand:'BRAND',category:'家居',source:'手动',selling:'随行杯',material:'不锈钢',dimensions:'16cm',audience:'通勤',packaging:'纸盒',skus:[{id:'a',code:'WHITE',color:'白色',spec:'350ml'},{id:'b',code:'BLACK',color:'黑色',spec:'500ml'}]};
const media=['white','black','shared','output'].map(id=>({id,name:id,url:'/test.jpg',type:'image',source:'用户上传',createdAt:''}));
const links=media.map(m=>({id:m.id,mediaId:m.id,productId:'p',skuIds:m.id==='white'?['a']:m.id==='black'?['b']:[],platform:'通用',site:'通用',language:'无文字',usage:'商品图',collection:'',status:'已采用',location:m.id==='output'?'商品图':'参考素材',version:1}));
test('SKU references include only its own and shared active images, excluding outputs',()=>{
 assert.deepEqual(productReferences(product,links,media,'a').map(m=>m.id),['white','shared']);
 assert.deepEqual(productReferences(product,links.map(l=>l.mediaId==='shared'?{...l,status:'已归档'}:l),media,'b').map(m=>m.id),['black']);
});
test('editing a confirmed SKU invalidates fact confirmation without mutating old snapshots',()=>{
 const confirmed={...product,confirmedSnapshot:productSignature(product)};
 assert.ok(productChecks(confirmed,links,media,'listing','a').every(c=>c.done));
 const changed={...confirmed,skus:confirmed.skus.map(s=>s.id==='a'?{...s,spec:'750ml'}:s)};
 assert.equal(productChecks(changed,links,media,'listing','a').find(c=>c.label==='商品事实已人工核对').done,false);
 assert.equal(confirmed.skus[0].spec,'350ml');
});
test('POD and video require task-specific inputs and missing reference images are reported',()=>{
 const confirmed={...product,confirmedSnapshot:productSignature(product)};
 assert.equal(productChecks(confirmed,links,media,'pod','a').find(c=>c.label==='定制区域与设计限制').done,false);
 assert.equal(productChecks(confirmed,links,media,'video','a').find(c=>c.label==='目标人群与使用场景').done,false);
 assert.equal(productChecks(product,[],media,'listing','a').find(c=>c.label==='可用参考图片').done,false);
});

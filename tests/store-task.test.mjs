import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { extname } from 'node:path';
registerHooks({ resolve(specifier, context, next) { return next(specifier.startsWith('.') && !extname(specifier) && /\/(app|lib)\//.test(context.parentURL || '') ? `${specifier}.ts` : specifier, context); } });
const {prepareStoreTask}=await import('../app/store-demo/store-task.ts');
const {createProductPublicationContext,publicationPrompt}=await import('../app/product-publication.ts');
const task={agent:{id:'official-shopee'},text:'Analyze sales',files:[],targetShop:null};
test('store tasks create a session for the selected agent before uploading attachments',async()=>{
 const calls=[];
 const original=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{
  calls.push({url,options});
  return Response.json(calls.length===1?{session_id:'task-real'}:{file:{id:'file-1',session_id:'task-real'}});
 };
 try{
  const result=await prepareStoreTask('test-token',{...task,files:[new File(['sales'],'sales.txt')],targetShop:{id:'shop-1',name:'Shop A',site:'US',type:'local'}});
  assert.equal(calls[0].url,'/api/console/agents/official-shopee/chat');
  assert.equal(calls[0].options.method,'POST');
  assert.equal(calls[1].options.body.get('session_id'),'task-real');
  assert.equal(calls[1].options.body.get('file').name,'sales.txt');
  assert.equal(result.sessionId,'task-real');assert.equal(result.files[0].id,'file-1');
  assert.match(result.message,/Shop A/);assert.match(result.message,/Analyze sales/);
 }finally{globalThis.fetch=original;}
});
test('failed session creation prevents upload and propagates the failure',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return Response.json({detail:'Agent unavailable'},{status:400});};
 try{await assert.rejects(prepareStoreTask('test-token',task),/Agent unavailable/);assert.equal(calls,1);}finally{globalThis.fetch=original;}
});
test('batch publication uses normal selected-agent chat and carries every selected SKU and the chosen shop',async()=>{
 const original=globalThis.fetch;const calls=[];
 globalThis.fetch=async(url,options)=>{calls.push({url,options});return Response.json({session_id:'product-chat'});};
 const rows=[{id:'p-cup',name:'Ceramic Mug',code:'CUP',skus:[{id:'white',code:'CUP-W350',spec:'White / 350 ml'},{id:'black',code:'CUP-B350',spec:'Black'}]},{id:'p-bottle',name:'Water Bottle',code:'BOT',skus:[{id:'bottle',code:'BOT-500',spec:'500ml'}]}];
 const shop={id:'sg-shop',name:'Home SG',platform:'Lazada',site:'SG',currency:'SGD',active:true,authorized:true};
 const publication=createProductPublicationContext(rows,[{productId:'p-cup',skuIds:['white']},{productId:'p-bottle',skuIds:['bottle']}],shop);
 try{
  const result=await prepareStoreTask('test-token',{...task,agent:{id:'official-lazada'},text:publicationPrompt(publication),publication});
  assert.equal(calls.length,1);assert.equal(calls[0].url,'/api/console/agents/official-lazada/chat');
  for(const value of ['Home SG','sg-shop','Ceramic Mug','CUP-W350','Water Bottle','BOT-500','将这批商品刊登到'])assert.ok(result.message.includes(value),value);
  assert.ok(!result.message.includes('CUP-B350'));assert.ok(!result.message.includes('data:image'));assert.deepEqual(result.files,[]);
  await assert.rejects(prepareStoreTask('test-token',{...task,publication}),/平台不一致/);assert.equal(calls.length,1);
 }finally{globalThis.fetch=original;}
});

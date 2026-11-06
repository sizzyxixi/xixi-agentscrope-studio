import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const sources=await Promise.all(['../lib/console-api.ts','../app/file-api.ts','../app/store-demo/store-task.ts'].map(path=>readFile(new URL(path,import.meta.url),'utf8')));
const source=sources.map(value=>value.replace(/^import .*;$/gm,'')).join('\n');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {prepareStoreTask}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
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

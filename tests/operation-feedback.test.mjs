import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../lib/feedback-store.ts', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { FeedbackStore, FEEDBACK_DURATION, feedbackKind } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);
function fixture() {
 let now=0, id=0; const timers=new Map();
 const clock={set(callback,duration){const key=++id;timers.set(key,{callback,at:now+duration});return key;},clear(key){timers.delete(key);}};
 return { store:new FeedbackStore(clock), timers, advance(duration){const until=now+duration;while(true){const due=[...timers].filter(([,timer])=>timer.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;now=due[1].at;timers.delete(due[0]);due[1].callback();}now=until;} };
}
test('every feedback variant expires at five seconds',()=>{
 for(const kind of ['success','error','info','warning','loading','plain']){
  const {store,advance}=fixture();store.publish('message',kind);advance(4999);assert.equal(store.getSnapshot().length,1);advance(1);assert.equal(store.getSnapshot().length,0);
 }
 assert.equal(FEEDBACK_DURATION,5000);
});
test('messages keep independent deadlines and survive navigation subscribers',()=>{
 const {store,advance}=fixture();let renders=0;const unsubscribe=store.subscribe(()=>renders++);
 store.publish('first','success');advance(3000);unsubscribe();store.publish('second','error');advance(2000);
 assert.deepEqual(store.getSnapshot().map(x=>x.message),['second']);advance(3000);assert.equal(store.getSnapshot().length,0);assert.equal(renders,1);
});
test('updating a loading message replaces it and restarts its deadline',()=>{
 const {store,advance,timers}=fixture();store.publish('loading','loading','operation');advance(4000);store.publish('saved','success','operation');assert.equal(store.getSnapshot().length,1);assert.equal(timers.size,1);
 advance(1000);assert.equal(store.getSnapshot()[0].message,'saved');advance(4000);assert.equal(store.getSnapshot().length,0);
});
test('same text can be shown for consecutive actions and timer disposal is complete',()=>{
 const {store,advance,timers}=fixture();store.publish('saved','success','form');advance(5000);store.publish('saved','success','form');assert.equal(store.getSnapshot().length,1);
 for(let i=0;i<10;i++)store.publish(String(i));assert.equal(store.getSnapshot().length,5);assert.equal(timers.size,5);store.dispose();assert.equal(timers.size,0);assert.equal(store.getSnapshot().length,0);
});
test('feedback classification does not report unsuccessful actions as successful',()=>{
 assert.equal(feedbackKind('测试发送未成功'),'error');assert.equal(feedbackKind('请先保存模型'),'warning');assert.equal(feedbackKind('模型设置已保存。'),'success');
});

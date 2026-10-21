import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
const source = await readFile(new URL('../app/run-activity.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {mergeRunTiming, elapsedRunMs, settleRun} = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const clock = (extra={}) => ({id:'local',startedAt:1000,sampledAt:1000,elapsedMs:0,status:'running',...extra});
test('late backend startup does not rewind 35 seconds already shown',()=>{
 const merged=mergeRunTiming(clock(),clock({id:'server',startedAt:36000,sampledAt:36000}),36000);
 assert.equal(merged.elapsedMs,35000); assert.equal(merged.startedAt,1000); assert.equal(elapsedRunMs(merged,38000),37000);
});
test('subsequent delayed snapshots and completion never rewind a turn',()=>{
 const first=mergeRunTiming(clock(),clock({id:'server'}),36000);
 const done=mergeRunTiming(first,clock({id:'server',status:'complete',elapsedMs:15000}),51000);
 assert.equal(done.elapsedMs,50000); assert.equal(elapsedRunMs(done,100000),50000);
});
test('approval waiting remains paused and is not included when resumed',()=>{
 const paused=clock({elapsedMs:5000,sampledAt:6000,status:'requires-action'});
 const resumed=mergeRunTiming(paused,clock({elapsedMs:5000}),100000);
 assert.equal(elapsedRunMs(resumed,102000),7000);
});
test('a stopped clock stays frozen',()=>{
 const saved=Date.now; Date.now=()=>41000;
 try {const stopped=settleRun(clock(),'cancelled');assert.equal(elapsedRunMs(stopped,90000),40000);assert.equal(stopped.status,'cancelled');} finally {Date.now=saved;}
});

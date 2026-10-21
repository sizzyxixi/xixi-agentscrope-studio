import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
const source=await readFile(new URL('../app/api/agent/stream/route.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {POST}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const request=()=>new Request('http://localhost/api/agent/stream',{method:'POST',body:JSON.stringify({sessionId:'chat',requestId:'turn-1'})});
test('proxy delivers a first chunk before upstream closes, and cancellation aborts upstream',async()=>{
 const saved=globalThis.fetch;let signal,body,wasCancelled=false;
 globalThis.fetch=async (_url,options)=>{signal=options.signal;body=JSON.parse(options.body);return new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(': connected\n\n'));},cancel(){wasCancelled=true;}}));};
 try {const response=await POST(request());const reader=response.body.getReader();const chunk=await reader.read();assert.equal(new TextDecoder().decode(chunk.value),': connected\n\n');assert.equal(body.request_id,'turn-1');assert.match(response.headers.get('cache-control'),/no-store/);await reader.cancel();assert.equal(signal.aborted,true);assert.equal(wasCancelled,true);} finally {globalThis.fetch=saved;}
});
test('upstream authentication failures preserve their HTTP status',async()=>{
 const saved=globalThis.fetch;globalThis.fetch=async()=>new Response('{"detail":"login required"}',{status:401});
 try {assert.equal((await POST(request())).status,401);}finally{globalThis.fetch=saved;}
});

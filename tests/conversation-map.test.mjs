import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
const source = await readFile(new URL('../components/assistant-ui/utils/conversation-map.ts', import.meta.url),'utf8');
const javascript = ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {projectConversation,readingLine}=await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);
const message=(id,role,text,extra={})=>({id,role,content:[{type:'text',text}],metadata:{custom:{}},...extra});
test('a turn groups a user prompt with every assistant continuation, ignoring system notes',()=>{
 const messages=[message('s','system','internal notes'),message('u1','user','库存检查'),message('a1','assistant','开始检查'),message('a2','assistant','检查结果'),message('u2','user','价格分析'),message('a3','assistant','价格结果')];
 const result=projectConversation(messages);
 assert.deepEqual(result.entries.map(x=>x.id),['u1','u2']);assert.equal(result.turnOf.get('a2'),'u1');assert.equal(result.entries[1].preview,'价格结果');assert.equal(result.turnOf.has('s'),false);
});
test('streaming updates the preview without duplicating a turn or changing earlier entries',()=>{
 const u1=message('u1','user','第一轮'),a1=message('a1','assistant','完成'),u2=message('u2','user','第二轮');
 const first=projectConversation([u1,a1,u2,message('a2','assistant','生成中')]);
 const second=projectConversation([u1,a1,u2,message('a2','assistant','已生成完整答案')],first);
 assert.equal(second.entries.length,2);assert.equal(second.entries[1].preview,'已生成完整答案');assert.equal(second.entries[0],first.entries[0]);assert.equal(first.entries[1].preview,'生成中');
});
test('new assistant continuations are grouped into the preceding turn, and new prompts add one turn',()=>{
 const u=message('u','user','报告'),a=message('a','assistant','结果');const first=projectConversation([u,a]);
 const next=projectConversation([u,a,message('tool-answer','assistant','工具完成')],first);assert.equal(next.entries.length,1);assert.equal(next.turnOf.get('tool-answer'),'u');
 const last=projectConversation([...next.messages,message('u2','user','继续')],next);assert.equal(last.entries.length,2);assert.equal(last.entries[1].title,'继续');
});
test('file-only turns use the actual attachment name, not an empty navigation entry',()=>{
 const file=message('file','user','',{content:[],metadata:{custom:{studioFiles:[{name:'库存.xlsx'}]}}});
 assert.equal(projectConversation([file]).entries[0].title,'库存.xlsx');
});
test('the reading line reaches the last turn at the bottom of a short final screen',()=>{
 const viewport={clientHeight:500,scrollHeight:1500,scrollTop:0,getBoundingClientRect:()=>({top:100,height:500})};
 assert.equal(readingLine(viewport),101);viewport.scrollTop=750;assert.equal(readingLine(viewport),351);viewport.scrollTop=1000;assert.equal(readingLine(viewport),601);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {platformSetFields,changePromptField,promptFieldContext,serializeCreativePrompt,validImageCount} from '../app/creative-prompt.ts';
test('platform configuration serializes human-readable editable fields alongside the original request',()=>{
 const fields=platformSetFields('Amazon','英语');
 const prompt=serializeCreativePrompt('突出香水的琥珀色玻璃质感。',fields);
 assert.match(prompt,/^突出香水的琥珀色玻璃质感。/);
 assert.match(prompt,/目标平台：亚马逊/);assert.match(prompt,/图片语言：英语/);
 assert.match(prompt,/图片数量：6 张/);assert.deepEqual(promptFieldContext(fields),{platform:'Amazon',language:'英语'});
});
test('changing a prompt value keeps submitted snapshots independent and propagates updated platform context',()=>{
 const snapshot=platformSetFields('Amazon','英语');
 const edited=changePromptField(snapshot,'platform','Shopify');
 assert.equal(snapshot[0].value,'Amazon');assert.equal(edited[0].value,'Shopify');
 assert.equal(promptFieldContext(edited).platform,'Shopify');
 assert.deepEqual(promptFieldContext([]),{});
});
test('custom image counts are bounded before generating a set',()=>{
 const fields=platformSetFields('eBay','德语');
 assert.equal(validImageCount(changePromptField(fields,'count','4')),4);
 for(const count of ['0','-1','10000','3.5','abc'])assert.equal(validImageCount(changePromptField(fields,'count',count)),6);
});

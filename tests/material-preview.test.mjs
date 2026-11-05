import test from 'node:test';
import assert from 'node:assert/strict';
import { materialPreviewKind, supportsMaterialPreview } from '../app/material-preview-kind.ts';
import { matchesHistoryType } from '../app/material-history.ts';
import { materialMediaSeed, isInCreationHistory } from '../app/material-library-data.ts';
const file=(name,type='document')=>({name,type,url:'/files/'+name});
test('media opens its native image or video viewer',()=>{
  assert.equal(materialPreviewKind(file('asset','image')),'image');
  assert.equal(materialPreviewKind(file('clip.mp4','video')),'video');
});
test('each supported document routes to its format renderer',()=>{
  for(const [name,kind] of [['notes.MD','markdown'],['notes.markdown','markdown'],['report.PDF','pdf'],['report.docx','word'],['report.doc','word'],['index.HTML','html'],['index.htm','html'],['notes.txt','text']])assert.equal(materialPreviewKind(file(name)),kind);
});
test('archives, spreadsheets, presentations and arbitrary files do not open a misleading preview',()=>{
  for(const name of ['assets.zip','table.xlsx','slides.pptx','data.json','log.log','audio.mp3'])assert.equal(supportsMaterialPreview(file(name)),false);
});
test('all history pages together contain every categorized fixture exactly once',()=>{
  const all=materialMediaSeed.filter(m=>isInCreationHistory(m,Date.parse('2026-11-04')));
  const categories=['图片','视频','文档','其他'].flatMap(type=>all.filter(m=>matchesHistoryType(m,type)));
  const pages=Array.from({length:Math.ceil(all.length/10)},(_,i)=>all.slice(i*10,i*10+10)).flat();
  assert.deepEqual(pages.map(m=>m.id).sort(),categories.map(m=>m.id).sort());
  assert.equal(new Set(pages.map(m=>m.id)).size,all.length);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { materialMediaSeed, materialLibrarySeed, officialModels, isCreation, isInCreationHistory, isMaterialAvailable, mediaSpace } from '../app/material-library-data.ts';

test('uploaded conversation inputs stay out of creation history',()=>{
  const item={id:'input',source:'创作上传',jobId:undefined};
  assert.equal(isCreation(item),false);
  assert.equal(isCreation({...item,source:'用户上传',jobId:'source-task'}),false);
  assert.equal(isCreation({...item,source:'对话创作',jobId:'task'}),true);
});

test('deletion and undelivered placeholders prevent new references without removing media',()=>{
  const item=materialMediaSeed[0];
  const deleted={...materialLibrarySeed,metadata:{...materialLibrarySeed.metadata,[item.id]:{deletedAt:'2026-11-03'}}};
  assert.equal(isMaterialAvailable(item,deleted),false);
  assert.equal(isMaterialAvailable({...item,placeholder:true},materialLibrarySeed),false);
  assert.equal(isMaterialAvailable(item,materialLibrarySeed),true);
  assert.equal(materialMediaSeed[0],item);
});

test('demo assets have unique records, valid local files, and explicit shared ownership',()=>{
  assert.equal(new Set(materialMediaSeed.map(m=>m.id)).size,materialMediaSeed.length);
  assert.ok(materialMediaSeed.some(m=>mediaSpace(m)==='enterprise'));
  assert.ok(materialMediaSeed.some(m=>m.type==='video'&&m.url.endsWith('.mp4')&&!m.placeholder));
  for(const url of [...materialMediaSeed.map(m=>m.url),...officialModels.map(m=>m.image),...materialLibrarySeed.brands.map(b=>b.cover)]){
    if(url.startsWith('/'))assert.ok(existsSync(fileURLToPath(new URL('../public'+url,import.meta.url))),url);
  }
});

test('collecting a creation preserves its history entry and original retention period', () => {
  const item = materialMediaSeed.find(isCreation);
  const created = Date.parse(item.createdAt);
  const collected = { ...materialLibrarySeed, metadata: { ...materialLibrarySeed.metadata, [item.id]: { collection: true } } };
  assert.equal(isMaterialAvailable(item, collected), true);
  assert.equal(isInCreationHistory(item, created + 86400000), true);
  assert.equal(isInCreationHistory(item, created + 365 * 86400000), false);
});

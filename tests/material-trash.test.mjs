import assert from 'node:assert/strict';
import test from 'node:test';
import { TRASH_RETENTION_MS, isTrashExpired, trashRemaining, purgeExpiredTrash } from '../app/material-trash.ts';

const DAY=86400000;
const deletedAt='2026-11-01T12:00:00Z';
const start=Date.parse(deletedAt);
const state=()=>({styleVersion:1,metadata:{},brands:[],models:[],folders:[]});

test('trash retention counts elapsed time, including the exact seven-day boundary',()=>{
  assert.deepEqual(trashRemaining(deletedAt,start),{label:'7天',urgent:false});
  assert.deepEqual(trashRemaining(deletedAt,start-60000),{label:'7天',urgent:false});
  assert.deepEqual(trashRemaining(deletedAt,start+5*DAY),{label:'2天',urgent:false});
  assert.deepEqual(trashRemaining(deletedAt,start+6*DAY),{label:'1天',urgent:false});
  assert.deepEqual(trashRemaining(deletedAt,start+6*DAY+1),{label:'<1天',urgent:true});
  assert.equal(isTrashExpired(deletedAt,start+TRASH_RETENTION_MS-1),false);
  assert.equal(isTrashExpired(deletedAt,start+TRASH_RETENTION_MS),true);
  assert.equal(trashRemaining(deletedAt,start+TRASH_RETENTION_MS),null);
});

test('purging removes expired styles and models and erases media metadata content',()=>{
  const input={...state(),metadata:{expired:{deletedAt,folder:'folder',description:'private',tags:['tag']},live:{collection:true}},brands:[{id:'expired-style',deletedAt,referenceImages:['data:image/png;base64,secret']},{id:'active-style'}],models:[{id:'expired-model',deletedAt,image:'secret'},{id:'active-model'}]};
  const result=purgeExpiredTrash(input,start+TRASH_RETENTION_MS);
  assert.deepEqual(result.brands,[{id:'active-style'}]);
  assert.deepEqual(result.models,[{id:'active-model'}]);
  assert.deepEqual(result.metadata.expired,{deletedAt,purgedAt:new Date(start+TRASH_RETENTION_MS).toISOString()});
  assert.equal(result.metadata.live,input.metadata.live);
  assert.equal(input.metadata.expired.description,'private');
  assert.equal(purgeExpiredTrash(result,start+TRASH_RETENTION_MS),result);
});

test('recently deleted and restored resources survive cleanup',()=>{
  const input={...state(),metadata:{restored:{collection:true}},brands:[{id:'recent',deletedAt}],models:[{id:'restored'}]};
  assert.equal(purgeExpiredTrash(input,start+TRASH_RETENTION_MS-1),input);
  assert.equal(purgeExpiredTrash({...input,brands:[{id:'restored-style'}]},start+8*DAY).models.length,1);
});

test('legacy removed folders are discarded and files return to root without deleting them',()=>{
  const input={...state(),folders:[{id:'removed',deletedAt},{id:'active'}],metadata:{live:{folder:'removed'},trashed:{folder:'removed',deletedAt:new Date(start+6*DAY).toISOString()}}};
  const result=purgeExpiredTrash(input,start+7*DAY);
  assert.deepEqual(result.folders,[{id:'active'}]);
  assert.equal(result.metadata.live.folder,undefined);
  assert.equal(result.metadata.trashed.folder,undefined);
  assert.equal(result.metadata.trashed.purgedAt,undefined);
});

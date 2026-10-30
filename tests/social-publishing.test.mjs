import assert from 'node:assert/strict';
import test from 'node:test';
import {publishIssue,frameRangeIssue} from '../app/social-publishing.ts';
const valid={accountId:'tiktok-santal-us',caption:'SANTAL #Fragrance',privacy:'PUBLIC_TO_EVERYONE',scheduledAt:'',commercial:false,ownBrand:false,branded:false,consent:true};
test('publishing requires explicit privacy and consent, but allows saving drafts separately',()=>{
 assert.equal(publishIssue(valid),null);
 assert.match(publishIssue({...valid,privacy:''}),/可见范围/);
 assert.match(publishIssue({...valid,consent:false}),/声明/);
 assert.match(publishIssue({...valid,accountId:''}),/账号/);
 assert.match(publishIssue({...valid,caption:' '}),/文案/);
 assert.match(publishIssue({...valid,caption:'a'.repeat(2201)}),/2,200/);
});
test('commercial disclosure validates brand selection and disallows private third-party branded content',()=>{
 assert.match(publishIssue({...valid,commercial:true}),/商业内容类型/);
 assert.equal(publishIssue({...valid,commercial:true,ownBrand:true,privacy:'SELF_ONLY'}),null);
 assert.match(publishIssue({...valid,commercial:true,branded:true,privacy:'SELF_ONLY'}),/仅自己/);
 assert.equal(publishIssue({...valid,commercial:true,branded:true}),null);
});
test('scheduled plans reject invalid or elapsed dates',()=>{
 const now=Date.parse('2026-10-30T00:00:00Z');
 assert.match(publishIssue({...valid,scheduledAt:'invalid'},now),/未来/);
 assert.match(publishIssue({...valid,scheduledAt:'2026-10-29T00:00:00Z'},now),/未来/);
 assert.equal(publishIssue({...valid,scheduledAt:'2026-10-31T00:00:00Z'},now),null);
});
test('frame edits stay within the source timeline and cannot use empty or reversed ranges',()=>{
 assert.equal(frameRangeIssue(2,4,6),null);
 for(const [start,end,duration] of [[-1,2,6],[2,7,6],[2,2,6],[4,2,6],[NaN,4,6],[0,1,0]])assert.ok(frameRangeIssue(start,end,duration));
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { claimTimeCalendarValue } from '../app/claim-time-range.ts';
test('custom periods preserve cross-month and same-day selections',()=>{
 const range=claimTimeCalendarValue({from:'2024-02-29',to:'2024-03-02'});
 assert.equal(range.start.toString(),'2024-02-29');assert.equal(range.end.toString(),'2024-03-02');
 assert.ok(claimTimeCalendarValue({from:'2026-11-17',to:'2026-11-17'}));
});
test('empty, partial, invalid and reversed periods cannot be applied as a selection',()=>{
 for(const range of [{from:'',to:''},{from:'2026-11-17',to:''},{from:'',to:'2026-11-17'},{from:'2026-02-30',to:'2026-03-01'},{from:'2026-11-18',to:'2026-11-17'}])assert.equal(claimTimeCalendarValue(range),null);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { creativeTurnTrace } from '../app/creative-turn.ts';
const context={tool:'平台套图',platform:'Amazon',site:'美国 US',ratio:'1:1',quality:'2K'};
test('turn metadata keeps its completion timestamp and per-turn image cost',()=>{
 const completedAt='2026-10-30T03:10:20.000Z';
 const trace=creativeTurnTrace(context,3,completedAt);
 assert.equal(trace.completedAt,completedAt);
 assert.equal(trace.credits,24);
 assert.equal(trace.tools[1].input.数量,'3');
 assert.equal(trace.tools[1].input.比例,'1:1');
 assert.equal(trace.feedback,undefined);
});
test('tool traces reflect packaging and layered-canvas workflows',()=>{
 const packaging=creativeTurnTrace({...context,editorKind:'packaging'},1,'2026-10-30T03:10:20Z');
 const layers=creativeTurnTrace({...context,editorKind:'layers'},1,'2026-10-30T03:10:20Z');
 assert.equal(packaging.tools[1].name,'packaging.generate');
 assert.equal(layers.tools[1].name,'canvas.compose');
 assert.ok(packaging.reasoning.some(text=>text.includes('折叠线')));
 assert.ok(layers.reasoning.some(text=>text.includes('图层')));
});

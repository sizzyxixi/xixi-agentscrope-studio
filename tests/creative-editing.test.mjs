import assert from 'node:assert/strict';
import test from 'node:test';
import {boxSvg,boxTemplates,emptyDocument,layerSvg} from '../app/creative-editing.ts';
test('packaging templates produce different cutting layouts and retain supplied dimensions',()=>{
 const layouts=boxTemplates.map(template=>boxSvg(template.id,80,160,50));
 assert.equal(new Set(layouts).size,4);
 for(const svg of layouts){assert.match(svg,/80 × 160 × 50 mm/);assert.match(svg,/stroke-dasharray/);assert.match(svg,/<svg/);}
});
test('layer export honors stacking order, visibility and text escaping',()=>{
 const document=emptyDocument();
 document.layers.find(layer=>layer.id==='subtitle').visible=false;
 document.layers.find(layer=>layer.id==='headline').text='<script>alert("x")</script> & SANTAL';
 const svg=layerSvg(document.layers,'data:image/png;base64,AA==');
 assert.ok(svg.indexOf('<rect')<svg.indexOf('<image'));
 assert.ok(svg.indexOf('<image')<svg.indexOf('&lt;script&gt;'));
 assert.doesNotMatch(svg,/<script>|A quiet kind/);
 assert.match(svg,/&amp; SANTAL/);
});
test('editing documents are independent across sessions',()=>{
 const first=emptyDocument(),second=emptyDocument();
 first.layers[0].text='Changed';first.marks.push({id:'mark',kind:'comment',x:50,y:30,color:'#e84343'});
 assert.equal(second.layers[0].text,'SANTAL');assert.equal(second.marks.length,0);
});
test('square image canvases export layer coordinates in the same aspect ratio',()=>{
 const document=emptyDocument();
 const svg=layerSvg(document.layers,'data:image/png;base64,AA==',800);
 assert.match(svg,/width="800" height="800" viewBox="0 0 800 800"/);
 assert.match(svg,/y="158"/);
});

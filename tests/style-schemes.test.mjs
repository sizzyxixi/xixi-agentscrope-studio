import test from 'node:test';
import assert from 'node:assert/strict';
import { styleReference, upgradeStyleLibrary, normalizeStyleReferences, addStyleImages, hasStyleContent } from '../app/style-schemes.ts';
const legacy={id:'old-brand',name:'My shop',colors:['#333333'],prompt:'Soft daylight',logo:'/logo.svg',cover:'/old-cover.jpg',space:'personal',updatedAt:'2026-11-03'};
const state={metadata:{},brands:[legacy],models:[],folders:[]};
test('existing stored resources survive simplification without losing their content',()=>{
 const upgraded=upgradeStyleLibrary(state);
 assert.equal(upgraded.brands[0],legacy);
 assert.equal(upgradeStyleLibrary(upgraded),upgraded);
});
test('reloading does not restore a removed default style',()=>{
 const upgraded=upgradeStyleLibrary(state);
 const removed={...upgraded,brands:[legacy]};
 assert.equal(upgradeStyleLibrary(removed),removed);
});
test('style references carry only name, description and visual references',()=>{
 const scheme={...legacy,referenceImages:['/a.jpg','/a.jpg','/b.jpg']};
 const reference=styleReference(scheme);
 assert.deepEqual(reference,{id:legacy.id,kind:'brand',name:'My shop',summary:'Soft daylight',images:['/a.jpg','/b.jpg'],image:'/a.jpg'});
 assert.equal(scheme.logo,'/logo.svg');
});
test('legacy logo and cover do not become style references',()=>{
 const reference=styleReference(legacy);
 assert.deepEqual(reference.images,[]);
 assert.equal(reference.image,undefined);
 assert.equal('logo' in reference,false);
 assert.equal('colors' in reference,false);
});
test('restored style drafts drop retired fields and logo imagery without affecting model references',()=>{
 const style={id:'s',kind:'brand',name:'Old style',summary:'Soft',image:'/logo.svg',images:['/logo.svg','/scene.jpg'],logo:'/logo.svg',colors:['#333333'],includeLogo:true};
 const model={id:'m',kind:'model',name:'Mia',summary:'Person',image:'/model.jpg'};
 const normalized=normalizeStyleReferences([style,model]);
 assert.deepEqual(normalized[0],{id:'s',kind:'brand',name:'Old style',summary:'Soft',image:'/scene.jpg',images:['/scene.jpg']});
 assert.equal(normalized[1],model);
 assert.equal(style.includeLogo,true);
});
test('a description or reference is required; retired fields alone cannot make a style usable',()=>{
 assert.equal(hasStyleContent({...legacy,prompt:''}),false);
 assert.equal(hasStyleContent({prompt:' ',referenceImages:[]}),false);
 assert.equal(hasStyleContent({prompt:'Soft daylight'}),true);
 assert.equal(hasStyleContent({prompt:'',referenceImages:['/scene.jpg']}),true);
});
test('reference images are deduplicated and limited to five without changing the first image',()=>{
 const existing=['first.jpg','second.jpg'];
 assert.deepEqual(addStyleImages(existing,['second.jpg','3.jpg','4.jpg','5.jpg','6.jpg']),['first.jpg','second.jpg','3.jpg','4.jpg','5.jpg']);
 assert.deepEqual(existing,['first.jpg','second.jpg']);
});

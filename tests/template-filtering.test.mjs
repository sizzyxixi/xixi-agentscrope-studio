import assert from 'node:assert/strict';
import test from 'node:test';
import {emptyTemplateFilters,matchesTemplate} from '../app/template-filtering.ts';

const templates=[
 {id:'pet-set',scene:'电商设计',tool:'平台套图',category:'宠物',platforms:['TikTok Shop','Amazon']},
 {id:'beauty-set',scene:'电商设计',tool:'平台套图',category:'美妆',platforms:['Amazon']},
 {id:'pet-store',scene:'店铺装修',tool:'店铺首页',category:'宠物',platforms:['TikTok Shop']},
 {id:'service-set',scene:'电商设计',tool:'平台套图',category:'服务',platforms:['TikTok Shop','Shopify']},
];
const find=(filters)=>templates.filter(template=>matchesTemplate(template,{...emptyTemplateFilters(),...filters})).map(template=>template.id);

test('platform and category narrow the chosen scene and tool together',()=>{
 assert.deepEqual(find({scene:'电商设计',tool:'平台套图',platform:'TikTok Shop',category:'宠物'}),['pet-set']);
 assert.deepEqual(find({platform:'TikTok Shop',category:'宠物'}),['pet-set','pet-store']);
});
test('unsupported platform/category combinations produce an empty result, and clearing filters restores results',()=>{
 assert.deepEqual(find({platform:'Amazon',category:'服务'}),[]);
 assert.deepEqual(find({category:'服务'}),['service-set']);
 assert.equal(find(emptyTemplateFilters()).length,templates.length);
});

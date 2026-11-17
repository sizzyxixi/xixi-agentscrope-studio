import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { extname } from 'node:path';
import test from 'node:test';
registerHooks({resolve(specifier,context,next){return next(specifier.startsWith('.')&&!extname(specifier)&&context.parentURL?.includes('/app/')?`${specifier}.ts`:specifier,context);}});
const {createListingDraft,changeDraftVariants,listingDraftIssues}=await import('../app/listing-draft.ts');
const sku={id:'s',code:'SKU-1',spec:'White',price:'19.20',weight:0.38,weight_unit:'kg',package_length:'10',package_width:'8',package_height:'12'};
const product={id:'p',name:'Care',title:'Body Care',brand:'Botanic',category:'美妆 / 身体护理',skus:[sku]};
const task={id:'t',site:'TH',information:{title:'Body Care',description:'Gentle',currency:'THB'}};
test('draft retains source values, separates shop fields and includes site-specific category attributes',()=>{
 const original=structuredClone(product),draft=createListingDraft(task,product,sku,['/a.jpg','/a.jpg','/b.jpg']);
 assert.deepEqual(draft.images,['/a.jpg','/b.jpg']);assert.equal(draft.skus[0].weight,'380');assert.equal(draft.skus[0].length,'10');assert.equal(draft.skus[0].price,'19.20');
 assert.ok(draft.attributes.find(field=>field.name==='TH_FDA – License Code'&&field.required));
 assert.ok(!createListingDraft({...task,site:'SG'},product,sku,[]).attributes.some(field=>field.name.startsWith('TH_FDA')));
 assert.deepEqual(product,original);
 const edited={...draft,title:'Saved draft'};const restored=createListingDraft({...task,draft:edited},product,sku,[]);restored.title='changed';assert.equal(edited.title,'Saved draft');
});
test('adding two specification dimensions generates every combination and separate SKU values',()=>{
 const draft=createListingDraft(task,product,sku,[]);
 const next=changeDraftVariants(draft,[{id:'color',name:'Color',options:['White','Black']},{id:'size',name:'Size',options:['S','M']}]);
 assert.deepEqual(next.skus.map(row=>row.spec),['White / S','White / M','Black / S','Black / M']);
 assert.equal(new Set(next.skus.map(row=>row.id)).size,4);assert.equal(next.skus[0].sellerSku,'SKU-1');assert.ok(next.skus.slice(1).every(row=>row.sellerSku===''));
 assert.throws(()=>changeDraftVariants(draft,[{id:'x',name:'X',options:Array.from({length:101},(_,i)=>String(i))}]),/100/);
});
test('drafts may save incomplete publishing fields; publication requires valid images, attributes, inventory and price',()=>{
 const draft=createListingDraft(task,product,sku,[]);assert.deepEqual(listingDraftIssues(draft),[]);
 assert.ok(listingDraftIssues(draft,true).some(issue=>issue.includes('产品图片')));
 const complete={...draft,images:['/a.jpg'],attributes:draft.attributes.map(field=>({...field,value:field.value||'Value'})),skus:draft.skus.map(row=>({...row,stock:'20'}))};assert.deepEqual(listingDraftIssues(complete,true),[]);
 assert.ok(listingDraftIssues({...complete,skus:[{...complete.skus[0],price:'-1'}]},true).length);
 assert.ok(listingDraftIssues({...complete,skus:[{...complete.skus[0],salePrice:'25',saleFrom:'2026-11-18',saleTo:'2026-11-17'}]}).length);
});

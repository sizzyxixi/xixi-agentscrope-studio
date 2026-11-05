import test from 'node:test';
import assert from 'node:assert/strict';
import { modelProfile, canPublishModel, modelVisibleInSpace } from '../app/model-profile.ts';
import { officialModels } from '../app/material-library-data.ts';

test('older official collections show the structured official profile without renaming the collection',()=>{
 const official=officialModels[0];
 const legacy={id:'collected',name:'店铺常用人物',source:'official',image:official.image,description:'旧的人物描述'};
 assert.deepEqual(modelProfile(legacy,officialModels),{gender:official.gender,age:official.age,appearance:official.appearance,persona:official.persona,bodyType:official.bodyType,features:official.features});
 assert.equal(legacy.name,'店铺常用人物');
});
test('a custom model sharing a fixture image retains its own profile and refinements',()=>{
 const model={source:'custom',image:officialModels[0].image,gender:'女',age:'36–45 岁',features:'短卷发',adjustments:['戴眼镜'],description:'人物完整描述'};
 assert.deepEqual(modelProfile(model,officialModels),{gender:'女',age:'36–45 岁',appearance:undefined,persona:undefined,bodyType:undefined,features:'短卷发；戴眼镜'});
});
test('uploaded models keep unknown demographic fields unset',()=>{
 const model={source:'upload',image:'/own.jpg',description:'上传人物参考'};
 assert.deepEqual(modelProfile(model,officialModels),{gender:undefined,age:undefined,appearance:undefined,persona:undefined,bodyType:undefined,features:'上传人物参考'});
});

test('custom appearance, age, persona and body type survive profile display',()=>{
 const model={source:'custom',image:'/person.png',gender:'女',age:'28 岁',appearance:'东南亚混合外观',persona:'瑜伽教练',bodyType:'运动体型',features:'短发',description:'完整档案'};
 const profile=modelProfile(model);
 assert.equal(profile.appearance,'东南亚混合外观');
 assert.equal(profile.age,'28 岁');
 assert.equal(profile.persona,'瑜伽教练');
 assert.equal(profile.bodyType,'运动体型');
});

test('official models remain personal and cannot be published, including legacy enterprise copies',()=>{
 const official={source:'official',space:'personal'};
 assert.equal(canPublishModel(official),false);
 assert.equal(modelVisibleInSpace(official,'personal'),true);
 assert.equal(modelVisibleInSpace({...official,space:'enterprise'},'enterprise'),false);
 for(const source of ['custom','upload']){
  assert.equal(canPublishModel({source}),true);
  assert.equal(modelVisibleInSpace({source,space:'enterprise'},'enterprise'),true);
  assert.equal(modelVisibleInSpace({source,space:'enterprise',deletedAt:'2026-11-04'},'enterprise'),false);
 }
});

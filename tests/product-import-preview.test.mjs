import { registerHooks } from 'node:module';
import { extname } from 'node:path';
registerHooks({resolve(specifier,context,next){return next(specifier.startsWith('.')&&!extname(specifier)&&context.parentURL?.includes('/app/')?`${specifier}.ts`:specifier,context);}});
import assert from 'node:assert/strict';
import test from 'node:test';
const {importColumns,parseProductTable}=await import('../app/product-import.ts');
const {productImportPreview,filterImportPreview}=await import('../app/product-import-preview.ts');
const row=(overrides={})=>importColumns.map(column=>({'父商品编码':'CUP','商品标题(中文)':'陶瓷杯','主图URL':'https://example.com/cup.jpg','成分':'陶瓷','功效':'日常饮水','SKU货号':'CUP-W','规格(货源侧)':'白色','重量':'300','产品尺寸(长 cm)':'8','产品尺寸(宽 cm)':'8','产品尺寸(高 cm)':'10','包装尺寸(长 cm)':'10','包装尺寸(宽 cm)':'10','包装尺寸(高 cm)':'12',...overrides}[column]||''));

test('one preview includes valid, invalid, duplicate and warning rows without changing import rules',()=>{
  const raw=[importColumns,row(),row({'SKU货号':'CUP-B','规格(货源侧)':'黑色'}),row({'SKU货号':'CUP-R','规格(货源侧)':'红色','重量':'300g'}),row({'父商品编码':'','SKU货号':'','规格(货源侧)':'透明'})];
  const parsed=parseProductTable(raw,'batch');
  const view=productImportPreview(parsed,[{id:'existing',code:'OLD',skus:[{code:'CUP-B'}]}]);
  assert.deepEqual(view.rows.map(item=>[item.row,item.status]),[[2,'可导入'],[3,'重复跳过'],[4,'错误'],[5,'提示']]);
  assert.equal(view.importable,2);assert.equal(view.duplicates,1);assert.equal(view.errors,1);assert.equal(view.warnings,1);assert.equal(view.groupCount,2);
  assert.equal(view.rows[2].values[11],'300g');assert.match(view.rows[2].messages[0],/重量/);
  assert.equal(view.rows[3].generatedParent,true);assert.equal(view.rows[3].generatedSku,true);
  for(const [filter,expected] of [['全部',4],['可导入',2],['错误',1],['重复',1],['提示',1]])assert.equal(filterImportPreview(view.rows,filter).length,expected);
  assert.equal(parsed.passed,3);assert.equal(parsed.rows[0].product.skus.length,2);
});

test('group errors and blank rows preserve original worksheet row numbers and total group count',()=>{
  const parsed=parseProductTable([importColumns,row({'商品标题(中文)':''}),[],row({'SKU货号':'CUP-B','规格(货源侧)':'黑色'})],'batch');
  const view=productImportPreview(parsed,[]);
  assert.equal(view.groupCount,1);assert.equal(view.importable,0);assert.equal(view.rows.length,2);
  assert.deepEqual(view.rows.map(item=>item.row),[2,4]);assert.ok(view.rows.every(item=>item.status==='错误'));
});

test('warnings on duplicate rows remain visible without being counted as importable rows',()=>{
  const parsed=parseProductTable([importColumns,row(),row({'SKU货号':'CUP-B','规格(货源侧)':'黑色','品牌':'不同品牌'})],'batch');
  const view=productImportPreview(parsed,[{id:'p',code:'CUP',skus:[{code:'CUP-B'}]}]);
  assert.equal(view.importable,1);assert.equal(view.duplicates,1);assert.equal(view.warnings,1);
  assert.equal(filterImportPreview(view.rows,'提示')[0].status,'重复跳过');
  assert.equal(view.rows[1].messages.length,2);
});

test('v2.2 data starts at row seven and generated codes are shown beside original empty fields',()=>{
  const raw=[importColumns,['v2.2'],[],[],[],[],row({'父商品编码':'','SKU货号':''})];
  const view=productImportPreview(parseProductTable(raw,'abcdefgh-123',{dataStart:6}),[]);
  assert.equal(view.rows[0].row,7);assert.match(view.rows[0].parent,/^IMP-abcdefgh-7$/);
  assert.equal(view.rows[0].values[0],'');assert.equal(view.rows[0].values[8],'');
});

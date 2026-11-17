import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { extname } from 'node:path';
import test from 'node:test';
registerHooks({ resolve(specifier, context, next) { return next(specifier.startsWith('.') && !extname(specifier) && context.parentURL?.includes('/app/') ? `${specifier}.ts` : specifier, context); } });
const { createExcelImportDemo, createExcelScenario, createExcelStoreResult, excelImportScenarios } = await import('../app/product-import-demo.ts');

test('validation scenarios reconcile row totals, error downloads and import eligibility', () => {
  for (const outcome of ['passed', 'empty', 'failed', 'partial']) {
    const data = createExcelImportDemo(outcome), { preview } = data;
    assert.equal(preview.rows.length, preview.importable + preview.errors + preview.duplicates);
    assert.equal(preview.errors, data.issues.length);
    assert.equal(preview.importable, preview.rows.filter(row => ['可导入', '提示'].includes(row.status)).length);
    for (const issue of data.issues) assert.equal(data.rawRows[issue.row - 1][0], issue.code);
    if (outcome === 'passed') assert.deepEqual([preview.importable, preview.errors, preview.warnings, preview.duplicates], [6, 0, 0, 0]);
    if (outcome === 'empty') assert.equal(preview.rows.length, 0);
    if (outcome === 'failed') assert.deepEqual([preview.importable, preview.errors], [0, 6]);
    if (outcome === 'partial') assert.deepEqual([preview.importable, preview.errors, preview.duplicates], [4, 1, 1]);
  }
});

test('store outcomes report actual fixture failures, preserving row identities for download', () => {
  for (const outcome of ['success', 'partial', 'failed']) {
    const data = createExcelImportDemo('passed'), result = createExcelStoreResult(data, outcome);
    assert.equal(result.success + result.issues.length + result.skipped, 6);
    assert.equal(result.outcome, outcome);
    assert.deepEqual([result.success, result.issues.length], outcome === 'success' ? [6, 0] : outcome === 'partial' ? [4, 2] : [0, 6]);
    for (const issue of result.issues) assert.equal(data.rawRows[issue.row - 1][0], issue.code);
  }
  const partialValidation = createExcelImportDemo(), result = createExcelStoreResult(partialValidation);
  assert.deepEqual([result.success, result.skipped, result.issues.length], [4, 1, 1]);
});

test('each control opens its corresponding step and scenarios do not share mutable data', () => {
  const controls = excelImportScenarios.flatMap(group => group.options);
  assert.equal(controls.length, 9);
  for (const {id} of controls) {
    const view = createExcelScenario(id);
    assert.equal(view.step, id.startsWith('upload-') ? 0 : id.startsWith('validation-') ? 1 : 3);
    if (id.startsWith('upload-')) assert.equal(view.uploadState, id === 'upload-failed' ? 'failed' : 'idle');
  }
  const first = createExcelScenario('validation-passed');
  first.data.preview.rows[0].messages.push('changed');
  assert.deepEqual(createExcelScenario('validation-passed').data.preview.rows[0].messages, []);
  assert.equal(createExcelScenario('store-success').result.issues.length, 0);
  assert.deepEqual(createExcelScenario('upload-initial'), createExcelScenario());
});

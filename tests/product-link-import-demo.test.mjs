import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { extname } from 'node:path';
import test from 'node:test';
registerHooks({ resolve(specifier, context, next) { return next(specifier.startsWith('.') && !extname(specifier) && context.parentURL?.includes('/app/') ? `${specifier}.ts` : specifier, context); } });
const { createLinkImportScenario, retryLinkImportScenario } = await import('../app/product-link-import-demo.ts');
const { inspectLinks } = await import('../app/product-import.ts');
const { linkCollectionResults } = await import('../app/link-collection-results.ts');

test('link presentation outcomes reconcile result counts for both supported sources', () => {
  for (const source of ['1688', 'Amazon']) {
    assert.equal(createLinkImportScenario('initial', source), null);
    for (const [scenario, successes, failures] of [['failed', 0, 3], ['partial', 2, 1], ['success', 3, 0]]) {
      const task = createLinkImportScenario(scenario, source);
      assert.equal(task.source, source);
      assert.equal(task.phase, 'done');
      assert.equal(task.results.filter(row => row.status === '成功').length, successes);
      assert.equal(task.results.filter(row => row.status === '失败').length, failures);
      assert.ok(task.results.every(row => !row.productId));
      assert.ok(task.results.every(row => !row.title && !row.thumbnail));
      for (const row of task.results.filter(row => row.sourceId)) {
        const parsed = inspectLinks(row.input, source).results[0];
        assert.equal(parsed.sourceId, row.sourceId);
        assert.equal(parsed.code, '');
      }
    }
  }
});

test('collection results expose counts and failed inputs without any product metadata', () => {
  const partial = createLinkImportScenario('partial', '1688');
  partial.results[1] = {...partial.results[1], title:'Unexpected product title', thumbnail:'/unexpected.jpg', productId:'unexpected-id'};
  const view = linkCollectionResults(partial);
  assert.deepEqual([view.total, view.success, view.failed], [3, 2, 1]);
  assert.deepEqual(view.failures, [{input:partial.results[1].input, inputLine:2, code:'TIMEOUT', message:'采集超时，请稍后重试。'}]);
  const complete = linkCollectionResults(createLinkImportScenario('success', 'Amazon'));
  assert.equal(complete.success, 3);
  assert.deepEqual(complete.failures, []);
});

test('input line numbers survive blank-line removal and canonical duplicate removal', () => {
  const parsed = inspectLinks('\n6945218330\nhttps://detail.1688.com/offer/6945218330.htm\n\ninvalid\nhttps://www.amazon.com/dp/B0C7XK2M1P', '1688');
  assert.equal(parsed.duplicates, 1);
  assert.deepEqual(parsed.results.map(row => row.inputLine), [2, 5, 6]);
  assert.deepEqual(parsed.results.filter(row => row.status === '失败').map(row => row.input), ['invalid', 'https://www.amazon.com/dp/B0C7XK2M1P']);
});

test('preview retry updates only its timeout row and preserves the original scenario', () => {
  const task = createLinkImportScenario('partial', '1688');
  const next = retryLinkImportScenario(task, task.results[1].input);
  assert.equal(next.results.filter(row => row.status === '成功').length, 3);
  assert.equal(next.results[1].retries, 1);
  assert.equal(task.results[1].status, '失败');
  const errors = createLinkImportScenario('failed', 'Amazon');
  assert.deepEqual(retryLinkImportScenario(errors, errors.results[0].input), errors);
  next.results[0].message = 'modified';
  assert.equal(createLinkImportScenario('partial', '1688').results[0].message, '商品资料与图片已入库');
});

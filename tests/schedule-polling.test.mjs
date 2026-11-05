import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../app/ScheduleConsole.tsx', import.meta.url), 'utf8');
const tree = ts.createSourceFile('ScheduleConsole.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let effect;
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(tree) === 'useEffect'
      && node.arguments[1]?.getText(tree).includes('isActive')) effect = node.arguments[0].getText(tree);
  ts.forEachChild(node, visit);
}
visit(tree);
assert.ok(effect, 'Exercise the actual schedule polling effect');
const js = ts.transpileModule(`const polling = ${effect};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function fixture(isActive = true, token = 'account') {
  const timers = new Map(), requests = [], errors = [];
  const context = { isActive, token, document: { visibilityState: 'visible' },
    refresh: () => new Promise((resolve, reject) => requests.push({ resolve, reject })),
    setLoadError: error => errors.push(error), setLoading: () => {},
    window: { setInterval: fn => { timers.set(1, fn); return 1; }, clearInterval: id => timers.delete(id) },
  };
  vm.createContext(context);
  vm.runInContext(js, context);
  const cleanup = vm.runInContext('polling()', context);
  return { requests, errors, timers, context, cleanup, tick: () => { for (const fn of timers.values()) fn(); } };
}

test('hidden automation page and logged-out page make no requests or polling timers', () => {
  for (const f of [fixture(false), fixture(true, '')]) {
    assert.equal(f.requests.length, 0);
    assert.equal(f.timers.size, 0);
  }
});
test('slow requests do not overlap, and polling resumes after completion', async () => {
  const f = fixture();
  assert.equal(f.requests.length, 1);
  f.tick(); f.tick(); f.tick();
  assert.equal(f.requests.length, 1);
  f.requests[0].resolve();
  await new Promise(setImmediate);
  f.tick();
  assert.equal(f.requests.length, 2);
  f.cleanup();
});
test('hidden tabs skip refresh and leaving the page stops polling and stale error feedback', async () => {
  const f = fixture();
  f.requests[0].resolve();
  await new Promise(setImmediate);
  f.context.document.visibilityState = 'hidden';
  f.tick();
  assert.equal(f.requests.length, 1);
  f.context.document.visibilityState = 'visible'; f.tick();
  f.cleanup();
  f.requests[1].reject(new Error('late failure'));
  await new Promise(setImmediate);
  assert.equal(f.timers.size, 0);
  assert.equal(f.errors.length, 0);
});

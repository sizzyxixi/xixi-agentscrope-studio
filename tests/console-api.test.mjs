import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../lib/console-api.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { consoleApi } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

function stalled(signal) {
  return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
}

test('stalled reads time out, and a subsequent retry can load agents', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal;
  t.mock.method(globalThis, 'fetch', async (_url, options) => { signal = options.signal; return stalled(signal); });
  const pending = assert.rejects(consoleApi('account', 'agents'), /读取超时/);
  t.mock.timers.tick(20_000);
  await pending;
  assert.equal(signal.aborted, true);
  globalThis.fetch.mock.mockImplementation(async () => Response.json({ agents: [{ id: 'main' }] }));
  assert.equal((await consoleApi('account', 'agents')).agents[0].id, 'main');
});

test('timeout also covers a response whose JSON body never finishes', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(globalThis, 'fetch', async (_url, { signal }) => ({ ok: true, json: () => stalled(signal) }));
  const pending = assert.rejects(consoleApi('account', 'agents'), /读取超时/);
  await Promise.resolve();
  t.mock.timers.tick(20_000);
  await pending;
});

test('navigation cancels reads without misreporting a timeout', async t => {
  t.mock.method(globalThis, 'fetch', async (_url, { signal }) => stalled(signal));
  const controller = new AbortController();
  const pending = assert.rejects(consoleApi('account', 'agents', 'GET', undefined, controller.signal), { name: 'AbortError' });
  controller.abort();
  await pending;
});

test('authentication errors remain errors instead of empty agent lists', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ detail: '请先登录。' }, { status: 401 }));
  await assert.rejects(consoleApi('', 'agents'), /请先登录/);
});

test('writes preserve their payload and are not timed out or replayed', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let finish, received, calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url, options) => { calls++; received = options; return new Promise(resolve => { finish = resolve; }); });
  const pending = consoleApi('account', 'resources/item', 'PUT', { enabled: false });
  t.mock.timers.tick(60_000);
  assert.equal(received.signal.aborted, false);
  assert.equal(received.headers.authorization, 'Bearer account');
  assert.deepEqual(JSON.parse(received.body), { enabled: false });
  finish(Response.json({ ok: true }));
  await pending;
  assert.equal(calls, 1);
});

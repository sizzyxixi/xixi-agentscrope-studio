import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
const source = await readFile(new URL('../app/api/console/[...path]/route.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { GET } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
test('heartbeat uses lightweight health endpoint instead of loading console statistics', async t => {
  let url;
  t.mock.method(globalThis, 'fetch', async value => { url = value; return Response.json({ status: 'ok' }); });
  const response = await GET(new Request('http://localhost/api/console/health'), { params: Promise.resolve({ path: ['health'] }) });
  assert.equal(new URL(url).pathname, '/health');
  assert.equal((await response.json()).status, 'ok');
});
test('agent requests preserve authentication, query and upstream status', async t => {
  let url, headers;
  t.mock.method(globalThis, 'fetch', async (value, options) => { url = value; headers = options.headers; return Response.json({ detail: '请先登录。' }, { status: 401 }); });
  const response = await GET(new Request('http://localhost/api/console/agents?mine=1', { headers: { authorization: 'Bearer fixture' } }), { params: Promise.resolve({ path: ['agents'] }) });
  assert.equal(new URL(url).pathname, '/console/agents');
  assert.equal(new URL(url).search, '?mine=1');
  assert.equal(headers.authorization, 'Bearer fixture');
  assert.equal(response.status, 401);
});

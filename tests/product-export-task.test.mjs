import assert from 'node:assert/strict';
import test from 'node:test';
import { ProductExportController } from '../app/product-export-task.ts';

const input = () => ({ products: [{ id: 'p', skus: [{ id: 'a' }, { id: 'b' }] }], links: [], media: [], origin: 'https://studio.test', skuScopes: { p: ['b'] }, filename: '所选商品.xlsx' });
function setup(overrides = {}, minimumDurationMs = 0) {
  const workers = [], downloads = [], revoked = [], files = [];
  let sequence = 0;
  const controller = new ProductExportController({
    createId: () => `export-${++sequence}`,
    createWorker: () => {
      const worker = { onmessage: null, onerror: null, onmessageerror: null, stopped: false,
        postMessage(request) { this.request = request; }, terminate() { this.stopped = true; },
        send(message) { this.onmessage?.({ data: { id: this.request.id, ...message } }); },
      }; workers.push(worker); return worker;
    },
    createUrl: file => { files.push(file); return `blob:${files.length}`; },
    revokeUrl: url => revoked.push(url), download: (...args) => downloads.push(args), ...overrides,
  }, minimumDurationMs);
  return { controller, workers, downloads, revoked, files };
}

test('export starts immediately, snapshots selected SKU scope and blocks duplicate submissions', () => {
  const { controller: c, workers } = setup();
  const source = input();
  assert.equal(c.start(source), true);
  assert.equal(c.getSnapshot().status, 'running');
  assert.equal(c.getSnapshot().completed, 0);
  assert.equal(c.getSnapshot().skuCount, 1);
  assert.equal(c.getSnapshot().total, 2);
  source.products[0].skus = []; source.skuScopes.p.push('a');
  assert.equal(workers[0].request.input.products[0].skus.length, 2);
  assert.deepEqual(workers[0].request.input.skuScopes.p, ['b']);
  assert.equal(c.start(input()), false);
  assert.equal(workers.length, 1);
  c.dismiss(); assert.equal(c.getSnapshot().status, 'running');
});

test('real progress stays running during file writing, then exposes a downloadable file', () => {
  const { controller: c, workers, files, downloads, revoked } = setup();
  c.start(input()); const worker = workers[0];
  worker.send({ type: 'progress', progress: { phase: 'preparing', completed: 1, total: 2 } });
  assert.equal(c.getSnapshot().completed, 1);
  worker.send({ type: 'progress', progress: { phase: 'preparing', completed: 0, total: 2 } });
  assert.equal(c.getSnapshot().completed, 1);
  worker.send({ type: 'progress', progress: { phase: 'writing', completed: 2, total: 2 } });
  assert.equal(c.getSnapshot().status, 'running');
  assert.equal(c.getSnapshot().phase, 'writing');
  worker.send({ type: 'complete', buffer: new Uint8Array([80, 75]).buffer });
  assert.equal(c.getSnapshot().status, 'success');
  assert.equal(c.getSnapshot().url, 'blob:1');
  assert.equal(files[0].type, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.deepEqual(downloads, [['blob:1', '所选商品.xlsx']]);
  assert.equal(worker.stopped, true);
  c.dismiss(); assert.equal(c.getSnapshot(), null); assert.deepEqual(revoked, ['blob:1']);
});

test('failure can retry the original snapshot and late messages cannot complete the new task', () => {
  const { controller: c, workers, downloads } = setup();
  c.start(input()); const first = workers[0], oldMessage = first.onmessage;
  first.send({ type: 'error', message: '生成失败' });
  assert.equal(c.getSnapshot().status, 'error'); assert.equal(first.stopped, true);
  c.retry(); assert.equal(c.getSnapshot().status, 'running');
  assert.deepEqual(workers[1].request.input.skuScopes, { p: ['b'] });
  oldMessage({ data: { id: first.request.id, type: 'complete', buffer: new ArrayBuffer(5) } });
  assert.equal(c.getSnapshot().status, 'running'); assert.equal(downloads.length, 0);
  workers[1].onerror({ preventDefault() {} });
  assert.equal(c.getSnapshot().status, 'error');
  c.retry(); workers[2].onmessageerror({}); assert.equal(c.getSnapshot().status, 'error');
});

test('cancellation terminates the worker and never triggers a late download', () => {
  const { controller: c, workers, downloads } = setup();
  c.start(input()); const worker = workers[0], onmessage = worker.onmessage;
  c.cancel(); assert.equal(worker.stopped, true); assert.equal(c.getSnapshot().status, 'cancelled');
  onmessage({ data: { id: worker.request.id, type: 'complete', buffer: new ArrayBuffer(4) } });
  assert.equal(downloads.length, 0); assert.equal(c.getSnapshot().status, 'cancelled');
  c.retry(); assert.equal(workers.length, 2); assert.equal(c.getSnapshot().status, 'running');
  c.dispose(); assert.equal(workers[1].stopped, true); assert.equal(c.getSnapshot(), null);
});

test('startup and empty-file errors never report success; blocked auto-download keeps the link', () => {
  const broken = setup({ createWorker: () => { throw new Error('unavailable'); } });
  broken.controller.start(input()); assert.equal(broken.controller.getSnapshot().status, 'error');
  const { controller: c, workers, downloads } = setup();
  c.start(input()); workers[0].send({ type: 'complete', buffer: new ArrayBuffer(0) });
  assert.equal(c.getSnapshot().status, 'error'); assert.equal(downloads.length, 0);
  const blocked = setup({ download: () => { throw new Error('blocked'); } });
  blocked.controller.start(input()); blocked.workers[0].send({ type: 'complete', buffer: new ArrayBuffer(4) });
  assert.equal(blocked.controller.getSnapshot().status, 'success');
  assert.equal(blocked.controller.getSnapshot().url, 'blob:1');
});

test('empty selection cannot start; a subsequent export releases the previous file', () => {
  const { controller: c, workers, revoked } = setup();
  assert.equal(c.start({ ...input(), products: [] }), false); assert.equal(c.getSnapshot(), null);
  c.start(input()); workers[0].send({ type: 'complete', buffer: new ArrayBuffer(4) });
  c.start(input()); assert.deepEqual(revoked, ['blob:1']);
  c.cancel(); c.dismiss(); assert.equal(c.getSnapshot(), null);
});

test('fast exports remain in progress for three seconds from submission, then download once', t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'] });
  const { controller: c, workers, downloads } = setup({}, 3000);
  c.start(input());
  t.mock.timers.tick(500);
  workers[0].send({ type: 'complete', buffer: new ArrayBuffer(4) });
  assert.equal(workers[0].stopped, true);
  assert.equal(c.getSnapshot().status, 'running');
  assert.equal(c.start(input()), false);
  t.mock.timers.tick(2499);
  assert.equal(c.getSnapshot().status, 'running');
  assert.equal(downloads.length, 0);
  t.mock.timers.tick(1);
  assert.equal(c.getSnapshot().status, 'success');
  assert.equal(downloads.length, 1);
  t.mock.timers.tick(10000);
  assert.equal(downloads.length, 1);
});

test('a slow export waits for the real file and does not add another three-second delay', t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'] });
  const { controller: c, workers, downloads } = setup({}, 3000);
  c.start(input()); t.mock.timers.tick(5000);
  assert.equal(c.getSnapshot().status, 'running'); assert.equal(downloads.length, 0);
  workers[0].send({ type: 'complete', buffer: new ArrayBuffer(4) });
  assert.equal(c.getSnapshot().status, 'success'); assert.equal(downloads.length, 1);
});

test('cancelling or disposing during the minimum display time prevents delayed downloads', t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'] });
  const { controller: c, workers, downloads } = setup({}, 3000);
  c.start(input()); workers[0].send({ type: 'complete', buffer: new ArrayBuffer(4) });
  c.cancel(); t.mock.timers.tick(3000);
  assert.equal(c.getSnapshot().status, 'cancelled'); assert.equal(downloads.length, 0);
  c.retry(); workers[1].send({ type: 'complete', buffer: new ArrayBuffer(4) });
  c.dispose(); t.mock.timers.tick(3000);
  assert.equal(c.getSnapshot(), null); assert.equal(downloads.length, 0);
});

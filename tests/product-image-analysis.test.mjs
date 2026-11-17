import assert from 'node:assert/strict';
import test from 'node:test';
import { ImageAnalysisTask } from '../app/product-image-analysis.ts';

test('closing and reopening the progress view preserves the same advancing task', t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'] });
  const task = new ImageAnalysisTask();
  let renders = 0, completed = 0;
  const closeView = task.subscribe(() => renders++);
  task.start(() => completed++);
  t.mock.timers.tick(1000);
  assert.deepEqual(task.getSnapshot(), { status: 'running', progress: 25, elapsed: 1 });
  closeView(); const previousRenders = renders;
  t.mock.timers.tick(1000);
  assert.equal(renders, previousRenders);
  assert.deepEqual(task.getSnapshot(), { status: 'running', progress: 50, elapsed: 2 });
  const closeAgain = task.subscribe(() => renders++);
  t.mock.timers.tick(1000);
  assert.equal(task.getSnapshot().progress, 75);
  assert.ok(renders > previousRenders);
  assert.equal(completed, 0);
  closeAgain(); task.cancel();
});

test('analysis finishes once while the dialog is closed and the result remains available', t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'] });
  const task = new ImageAnalysisTask();
  let completed = 0;
  task.start(() => completed++);
  t.mock.timers.tick(5000);
  assert.deepEqual(task.getSnapshot(), { status: 'complete', progress: 100, elapsed: 5 });
  assert.equal(completed, 1);
  t.mock.timers.tick(10000);
  assert.equal(completed, 1);
  assert.equal(task.getSnapshot().status, 'complete');
  task.cancel();
});

test('explicit cancellation clears progress and prevents late completion or contamination of a new run', t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'] });
  const task = new ImageAnalysisTask();
  let oldCompleted = 0, newCompleted = 0;
  task.start(() => oldCompleted++);
  t.mock.timers.tick(1000); task.cancel();
  assert.deepEqual(task.getSnapshot(), { status: 'idle', progress: 0, elapsed: 0 });
  t.mock.timers.tick(5000);
  assert.equal(oldCompleted, 0);
  task.start(() => newCompleted++);
  t.mock.timers.tick(2000);
  assert.equal(task.getSnapshot().progress, 50);
  t.mock.timers.tick(2000);
  assert.equal(oldCompleted, 0); assert.equal(newCompleted, 1);
  task.cancel();
});

test('repeated starts cannot reset an in-flight analysis or replace its completion callback', t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'] });
  const task = new ImageAnalysisTask();
  let original = 0, duplicate = 0;
  task.start(() => original++); t.mock.timers.tick(1000);
  task.start(() => duplicate++); assert.equal(task.getSnapshot().progress, 25);
  t.mock.timers.tick(3000);
  assert.equal(original, 1); assert.equal(duplicate, 0);
  task.cancel(); assert.equal(task.getSnapshot().status, 'idle');
});

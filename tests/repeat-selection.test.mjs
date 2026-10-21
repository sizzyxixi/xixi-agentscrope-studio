import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../app/repeat-selection.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { changeRepeatFrequency } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const original = { frequency: 'weekly', weekdays: [0, 2], month_days: [15], month: 2, month_day: 29 };

test('switching weekly and biweekly in either direction clears secondary choices', () => {
  for (const [from, to] of [['weekly', 'biweekly'], ['biweekly', 'weekly'], ['daily', 'weekly']]) {
    const next = { ...original, ...changeRepeatFrequency({ ...original, frequency: from }, to) };
    assert.equal(next.frequency, to);
    assert.deepEqual(next.weekdays, []);
    assert.deepEqual(next.month_days, []);
    assert.equal(next.month, undefined);
    assert.equal(next.month_day, undefined);
  }
  assert.deepEqual(original.weekdays, [0, 2]);
});
test('reopening the same frequency keeps saved selections while other frequencies reset them', () => {
  assert.deepEqual({ ...original, ...changeRepeatFrequency(original, 'weekly') }, original);
  for (const frequency of ['monthly', 'yearly', 'daily', 'once']) {
    const next = { ...original, ...changeRepeatFrequency(original, frequency) };
    assert.deepEqual(next.weekdays, []);
    assert.deepEqual(next.month_days, []);
    assert.equal(next.month_day, undefined);
  }
});
test('interval scheduling retains its all-week execution window', () => {
  assert.deepEqual(changeRepeatFrequency(original, 'interval').weekdays, [0, 1, 2, 3, 4, 5, 6]);
});

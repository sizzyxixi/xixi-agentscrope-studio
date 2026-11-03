import assert from 'node:assert/strict';
import test from 'node:test';
import { generationCreditEstimate, generationModelOptions, normalizeGenerationModel } from '../app/generation-models.ts';

test('image choices match the requested catalog and stay separate from video choices', () => {
  assert.deepEqual(generationModelOptions('image').map(model => model.id), ['image2', 'image2.5', 'banana2.1']);
  assert.ok(generationModelOptions('video').every(model => !generationModelOptions('image').some(image => image.id === model.id)));
});

test('unit estimates change independently with model and resolution', () => {
  assert.equal(generationCreditEstimate('image', 'image2', '1K'), 8);
  assert.equal(generationCreditEstimate('image', 'image2', '4K'), 20);
  assert.equal(generationCreditEstimate('image', 'image2.5', '4K'), 30);
  assert.equal(generationCreditEstimate('image', 'banana2.1', '4K'), 16);
  assert.equal(generationCreditEstimate('video', '标准', '1080P'), 10);
});

test('legacy selections normalize by mode, while unpriced combinations never show a fabricated quote', () => {
  assert.equal(normalizeGenerationModel('image', '标准'), 'image2');
  assert.equal(normalizeGenerationModel('image', 'banana2.1'), 'banana2.1');
  assert.equal(normalizeGenerationModel('video', 'image2'), '标准');
  assert.equal(generationCreditEstimate('image', 'image2', '1080P'), null);
  assert.equal(generationCreditEstimate('video', 'image2', '768P'), null);
  assert.equal(generationCreditEstimate('image', 'unknown', '1K'), null);
});

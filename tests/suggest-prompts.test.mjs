import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../app/suggest-prompts.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { suggestionBody, readSuggestPrompts } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

test('every streaming chunk boundary hides protocol without hiding the answer', () => {
  const suffix = '<suggest_prompts>[{"prompt":"Next step"}]</suggest_prompts>';
  for (let length = 1; length <= suffix.length; length++) {
    assert.equal(suggestionBody('Answer\n' + suffix.slice(0, length)), 'Answer');
  }
});
test('normal answers and fenced protocol examples are preserved', () => {
  for (const text of ['Hello', '<div>Example</div>', '```xml\n<suggest_prompts>[]</suggest_prompts>\n```', '~~~xml\n<suggest_prompts>[]</suggest_prompts>\n~~~']) {
    assert.equal(suggestionBody(text), text);
  }
});
test('only validated prompt text is displayed and used as composer input', () => {
  assert.deepEqual(readSuggestPrompts([{}, null, { label: 'Hidden' }, { prompt: ' ' }, { prompt: 'a'.repeat(501) }, { prompt: ' Next ', label: 'Discard' }, { prompt: 'Next' }, { prompt: '继续' }]), [{ prompt: 'Next' }, { prompt: '继续' }]);
  assert.deepEqual(readSuggestPrompts({ prompt: 'Next' }), []);
  assert.equal(readSuggestPrompts(Array.from({ length: 8 }, (_, i) => ({ prompt: `${i}` }))).length, 4);
});

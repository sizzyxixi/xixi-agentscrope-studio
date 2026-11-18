import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { registerHooks } from 'node:module';
import { extname } from 'node:path';
import test from 'node:test';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

registerHooks({ resolve(specifier, context, next) {
  return next(specifier.startsWith('.') && !extname(specifier) && /\/(app|lib)\//.test(context.parentURL || '') ? `${specifier}.ts` : specifier, context);
} });
const { useImageImportTask } = await import('../app/use-image-import-task.ts');
const { randomId } = await import('../lib/browser-id.ts');
const uuid = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/;

test('product image task mounts on HTTP where randomUUID is unavailable', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) } });
  try {
    function Probe() {
      const task = useImageImportTask();
      return createElement('span', null, task.fields.sku);
    }
    const html = renderToString(createElement(Probe));
    assert.match(html, /<span>IMG-[\dA-F]{8}-01<\/span>/);
  } finally {
    if (original) Object.defineProperty(globalThis, 'crypto', original);
    else Reflect.deleteProperty(globalThis, 'crypto');
  }
});

test('HTTP fallback creates distinct valid UUIDs using secure random bytes', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  const originalRandom = Math.random;
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) } });
  Math.random = () => { throw new Error('Insecure randomness must not be used'); };
  try {
    const ids = Array.from({ length: 1000 }, () => randomId());
    assert.ok(ids.every(value => uuid.test(value)));
    assert.equal(new Set(ids).size, ids.length);
  } finally {
    Math.random = originalRandom;
    if (original) Object.defineProperty(globalThis, 'crypto', original);
    else Reflect.deleteProperty(globalThis, 'crypto');
  }
});

test('native UUID generation preserves its crypto receiver', () => {
  assert.match(randomId(), uuid);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiClient } from '../src/data/api-client.mjs';

test('default fetch сохраняет binding globalThis', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = function () {
    assert.equal(this, globalThis);
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ data: [] }) });
  };
  try {
    await new ApiClient().list('sites');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('raw upload не сериализует Blob, а protected download возвращает Blob', async () => {
  const source = new Blob(['photo'], { type: 'image/jpeg' }); const calls = [];
  const client = new ApiClient({ fetchImpl: async (url, options) => {
    calls.push({ url, options });
    if (options.method === 'POST') return { ok: true, status: 201, json: async () => ({ data: { id: '7' } }) };
    return { ok: true, status: 200, blob: async () => source };
  } });
  assert.deepEqual(await client.requestRaw('/lessons/1/photos', { body: source, headers: { 'Content-Type': 'image/jpeg' } }), { id: '7' });
  assert.equal(calls[0].options.body, source); assert.equal(calls[0].options.credentials, 'same-origin');
  assert.equal(await client.blob('/lessons/1/photos/7/file'), source);
  assert.equal(calls[1].options.credentials, 'same-origin');
});

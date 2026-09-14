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

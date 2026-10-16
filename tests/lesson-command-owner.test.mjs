import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createApiRouter } from '../backend/src/routes.mjs';
import { ApiClient } from '../src/data/api-client.mjs';

test('a shared-cookie user change rejects queued lesson commands before any service mutation', async () => {
  let mutations = 0;
  const lessons = Object.fromEntries(['start', 'putAttendance', 'finish', 'addExtra', 'removeExtra', 'quickChild', 'update'].map((name) =>
    [name, async () => { mutations++; return {}; }]));
  const app = express(); app.use(express.json());
  app.use('/api/v1', createApiRouter({ query: async () => { throw new Error('No database expected'); } }, {
    lessons, testAuth(request, _response, next) { request.auth = { userId: '2', roles: ['director'] }; next(); },
  }));
  app.use((error, _request, response, _next) => response.status(error.status ?? 500).json({ error: { code: error.code, message: error.message } }));
  const server = await new Promise((resolve) => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  try {
    const client = new ApiClient({ baseUrl: `http://127.0.0.1:${server.address().port}/api/v1` });
    for (const [method, path] of [['POST', '/lessons/10/start'], ['PUT', '/lessons/10/attendance/7'],
      ['POST', '/lessons/10/finish'], ['POST', '/lessons/10/extras'], ['DELETE', '/lessons/10/extras/7'],
      ['POST', '/lessons/10/quick-child'], ['PATCH', '/lessons/10']]) {
      await assert.rejects(client.request(path, { method, body: {}, expectedActorId: '1', idempotencyKey: 'owner-command' }),
        { status: 409, code: 'LESSON_ACTOR_CHANGED' });
      assert.equal(mutations, 0);
    }
    await client.request('/lessons/10/attendance/7', { method: 'PUT', body: { present: true }, expectedActorId: '2' });
    assert.equal(mutations, 1);
    await client.request('/lessons/10/attendance/7', { method: 'PUT', body: { present: false } });
    assert.equal(mutations, 2, 'existing nonqueued callers retain their contract');
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

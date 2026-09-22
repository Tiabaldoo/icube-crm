import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import express from 'express';
import { createApiRouter } from '../backend/src/routes.mjs';

let server; let baseUrl; const seen = [];
before(async () => {
  const app = express(); app.use(express.json());
  const pool = { query: async () => [[]] };
  const testAuth = (request, _response, next) => {
    const role = request.get('x-test-role') || 'teacher';
    request.auth = { userId: role === 'teacher' ? '2' : role === 'partner' ? '3' : '1', roles: [role], projectIds: role === 'partner' ? ['77'] : [] };
    next();
  };
  app.use('/api/v1', createApiRouter(pool, { testAuth, dailyDashboard: { async get(context) { seen.push(context); return { day: '2026-09-22', projectIds: context.projectIds }; } } }));
  app.use((error, _request, response, _next) => response.status(error.status ?? 500).json({ error: { code: error.code ?? 'INTERNAL_ERROR', message: error.message } }));
  await new Promise((resolve, reject) => { server = app.listen(0, '127.0.0.1', (error) => error ? reject(error) : resolve()); });
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
});
after(() => new Promise((resolve) => server.close(resolve)));

async function call(role) {
  const response = await fetch(`${baseUrl}/dashboard/daily`, { headers: { 'x-test-role': role } });
  return { response, payload: await response.json() };
}

test('financial dashboard запрещён teacher и доступен director/partner в доверенном scope', async () => {
  assert.equal((await call('teacher')).response.status, 403);
  assert.equal((await call('director')).response.status, 200);
  const partner = await call('partner'); assert.equal(partner.response.status, 200);
  assert.deepEqual(partner.payload.data.projectIds, ['77']);
  assert.equal(seen.some((context) => context.roles.includes('teacher')), false);
});

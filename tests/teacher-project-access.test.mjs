import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { createApiRouter } from '../backend/src/routes.mjs';

async function withServer(run) {
  const calls = []; const deleteCalls = [];
  const memberships = new Map([
    ['41', [{ project_id: 2 }]],
    ['42', [{ project_id: 1 }]],
    ['43', [{ project_id: 2 }, { project_id: 1 }]],
  ]);
  const pool = { query: async (sql, params = {}) => {
    if (sql.startsWith('SELECT project_id FROM teacher_projects WHERE teacher_id=')) return [memberships.get(String(params.id)) ?? []];
    throw new Error(`Unexpected SQL: ${sql}`);
  } };
  const authService = {
    async getTeacherAccess(id) { calls.push(['get', String(id)]); return { teacherId: String(id), exists: true }; },
    async createTeacherAccess(id) { calls.push(['create', String(id)]); return { teacherId: String(id), exists: true }; },
    async resetTeacherPassword(id) { calls.push(['reset', String(id)]); return { teacherId: String(id), exists: true }; },
    async disableTeacherAccess(id) { calls.push(['disable', String(id)]); return { teacherId: String(id), exists: true }; },
  };
  const testAuth = (request, _response, next) => {
    const role = request.get('x-test-role') || 'partner';
    request.auth = { userId: role === 'director' ? '1' : '9', roles: [role], projectIds: role === 'partner' ? ['2'] : [] };
    next();
  };
  const app = express(); app.use(express.json());
  const deletions = { async deleteTeacher(id, options) { deleteCalls.push([String(id), options]); } };
  app.use('/api/v1', createApiRouter(pool, { authService, deletions, testAuth }));
  app.use((error, _request, response, _next) => response.status(error.status ?? 500).json({ error: { code: error.code ?? 'INTERNAL_ERROR', message: error.message } }));
  const server = await new Promise((resolve, reject) => {
    const instance = app.listen(0, '127.0.0.1', (error) => error ? reject(error) : resolve(instance));
  });
  try { await run(`http://127.0.0.1:${server.address().port}/api/v1`, calls, deleteCalls); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

async function request(baseUrl, path, { role = 'partner', method = 'GET' } = {}) {
  return fetch(`${baseUrl}${path}`, {
    method, headers: { 'x-test-role': role, ...(method === 'GET' || method === 'DELETE' ? {} : { 'content-type': 'application/json' }) },
    body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify({ login: 'teacher@example.com', password: 'secret-pass' }),
  });
}

test('partner управляет CRM-доступом только пока teacher_projects связывает преподавателя с его проектом', async () => {
  await withServer(async (baseUrl, calls) => {
    assert.equal((await request(baseUrl, '/teachers/41/access')).status, 200);
    assert.equal((await request(baseUrl, '/teachers/41/access', { method: 'POST' })).status, 201);
    assert.equal((await request(baseUrl, '/teachers/41/access/reset-password', { method: 'POST' })).status, 200);
    assert.equal((await request(baseUrl, '/teachers/41/access', { method: 'DELETE' })).status, 200);

    for (const teacherId of ['42', '44']) {
      assert.equal((await request(baseUrl, `/teachers/${teacherId}/access`)).status, 403);
      assert.equal((await request(baseUrl, `/teachers/${teacherId}/access/reset-password`, { method: 'POST' })).status, 403);
    }
    assert.equal((await request(baseUrl, '/teachers/42/access', { role: 'director' })).status, 200);
    assert.deepEqual(calls, [
      ['get', '41'], ['create', '41'], ['reset', '41'], ['disable', '41'], ['get', '42'],
    ]);
  });
});

test('partner delete route передаёт свой scope, а foreign teacher блокируется до deletion service', async () => {
  await withServer(async (baseUrl, _accessCalls, deleteCalls) => {
    assert.equal((await request(baseUrl, '/teachers/41', { method: 'DELETE' })).status, 204);
    assert.equal((await request(baseUrl, '/teachers/42', { method: 'DELETE' })).status, 403);
    assert.equal((await request(baseUrl, '/teachers/43', { role: 'director', method: 'DELETE' })).status, 204);
    assert.deepEqual(deleteCalls, [
      ['41', { projectId: '2' }],
      ['43', { projectId: null }],
    ]);
  });
});

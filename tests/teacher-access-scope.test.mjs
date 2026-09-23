import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { createApiRouter } from '../backend/src/routes.mjs';

async function withServer(run) {
  const calls = [];
  const access = { teacherId: '7', exists: true, login: 'teacher@example.com', status: 'active' };
  const authService = {
    getTeacherAccess: async (id) => { calls.push(['get', String(id)]); return access; },
    createTeacherAccess: async (id, body, actor) => { calls.push(['create', String(id), body, actor]); access.status = 'active'; return access; },
    resetTeacherPassword: async (id, body) => { calls.push(['reset', String(id), body]); access.status = 'active'; return access; },
    disableTeacherAccess: async (id) => { calls.push(['disable', String(id)]); access.status = 'blocked'; return access; },
  };
  const pool = { query: async (sql, params = {}) => {
    if (sql === 'SELECT project_id FROM teacher_projects WHERE teacher_id=:id') {
      return [[String(params.id) === '7' ? { project_id: 2 } : { project_id: 1 }]];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  }};
  const empty = { list: async () => [], get: async () => null, create: async () => null, update: async () => null };
  const deletions = { deleteTeacher: async () => { calls.push(['delete-teacher']); return null; } };
  const testAuth = (request, _response, next) => {
    const role = request.get('x-role') || 'partner';
    request.auth = role === 'director'
      ? { roles: ['director'], projectIds: [], userId: '1' }
      : { roles: [role], projectIds: role === 'partner' ? ['2'] : [], userId: '5' };
    next();
  };
  const app = express(); app.use(express.json()); app.use('/api/v1', createApiRouter(pool, { authService, catalog: empty, deletions, testAuth }));
  app.use((error, _request, response, _next) => response.status(error.status ?? 500).json({ error: { code: error.code ?? 'INTERNAL_ERROR', message: error.message } }));
  const server = await new Promise((resolve, reject) => { const value = app.listen(0, '127.0.0.1', (error) => error ? reject(error) : resolve(value)); });
  try { await run(`http://127.0.0.1:${server.address().port}/api/v1`, calls); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

async function api(base, path, { method = 'GET', role = 'partner', body } = {}) {
  const response = await fetch(base + path, { method, headers: { 'x-role': role, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, payload: response.status === 204 ? null : await response.json() };
}

test('director can read access for any teacher', () => withServer(async (base) => {
  assert.equal((await api(base, '/teachers/99/access', { role: 'director' })).status, 200);
}));

test('partner can read/create/reset/disable/re-enable access only for teacher in own project', () => withServer(async (base, calls) => {
  assert.equal((await api(base, '/teachers/7/access')).status, 200);
  assert.equal((await api(base, '/teachers/7/access', { method: 'POST', body: { login: 'teacher@example.com', password: 'password1' } })).status, 201);
  assert.equal((await api(base, '/teachers/7/access/reset-password', { method: 'POST', body: { password: 'password2' } })).status, 200);
  assert.equal((await api(base, '/teachers/7/access', { method: 'DELETE' })).status, 200);
  assert.equal((await api(base, '/teachers/7/access', { method: 'POST', body: { login: 'teacher@example.com', password: 'password3' } })).status, 201);
  assert.deepEqual(calls.map((item) => item[0]), ['get', 'create', 'reset', 'disable', 'create']);
}));

test('partner cannot manage a foreign teacher, but can request deletion inside its own project scope', () => withServer(async (base, calls) => {
  for (const request of [
    ['/teachers/8/access', {}],
    ['/teachers/8/access', { method: 'POST', body: { login: 'x@example.com', password: 'password1' } }],
    ['/teachers/8/access/reset-password', { method: 'POST', body: { password: 'password2' } }],
    ['/teachers/8/access', { method: 'DELETE' }],
  ]) assert.equal((await api(base, request[0], request[1])).status, 403);
  assert.equal((await api(base, '/teachers/8', { method: 'DELETE' })).status, 403);
  assert.equal((await api(base, '/teachers/7', { method: 'DELETE' })).status, 204);
  assert.equal(calls.some((item) => item[0] === 'delete-teacher'), true);
}));

test('non-director non-partner role does not gain teacher access management', () => withServer(async (base) => {
  assert.equal((await api(base, '/teachers/7/access', { role: 'teacher' })).status, 403);
}));

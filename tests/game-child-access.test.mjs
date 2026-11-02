import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, before, test } from 'node:test';
import express from 'express';
import { clearSessionCookieOptions, createAuthService, SESSION_COOKIE, sessionCookieOptions } from '../backend/src/auth-service.mjs';
import { createApiRouter } from '../backend/src/routes.mjs';

const tokenHash = (value) => createHash('sha256').update(value).digest('hex');

function fixture() {
  const state = {
    now: new Date('2026-11-02T00:00:00Z'),
    users: [
      { id: 1, email: 'parent@example.com', password_hash: 'parent-pass', display_name: 'Родитель', status: 'active', token_version: 1, roles: ['parent'] },
      { id: 2, email: 'misha.k@child.icube.local', password_hash: 'child-pass', display_name: 'Миша', status: 'active', token_version: 1, roles: ['child'] },
      { id: 3, email: 'mixed@example.com', password_hash: 'mixed-pass', display_name: 'Две роли', status: 'active', token_version: 1, roles: ['child', 'parent'] },
    ],
    sessions: [],
  };
  const query = async (sql, params = {}) => {
    if (sql.includes('FROM users u LEFT JOIN teachers')) {
      return [state.users.filter((item) => item.email === params.login).map((item) => ({ ...item, teacher_id: null }))];
    }
    if (sql.includes('FROM auth_sessions s JOIN users u')) {
      const session = state.sessions.find((item) => item.refresh_token_hash === params.tokenHash);
      const user = session && state.users.find((item) => item.id === session.user_id && item.token_version === session.token_version);
      return [user ? [{ session_id: session.id, id: user.id, display_name: user.display_name, teacher_id: null }] : []];
    }
    if (sql.includes('FROM user_roles ur JOIN roles')) {
      return [state.users.find((item) => item.id === Number(params.userId)).roles.map((code) => ({ code }))];
    }
    if (sql.startsWith('INSERT INTO auth_sessions')) {
      state.sessions.push({ id: params.id, user_id: Number(params.userId), refresh_token_hash: params.tokenHash, token_version: Number(params.tokenVersion) });
      return [{ insertId: state.sessions.length }];
    }
    if (sql.startsWith('UPDATE users SET last_login_at=')) return [{ affectedRows: 1 }];
    throw new Error(`Неожиданный SQL в фикстуре: ${sql}`);
  };
  const connection = { query, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {} };
  const pool = { query, getConnection: async () => connection };
  let tokenCounter = 0;
  const service = createAuthService(pool, { now: () => state.now, makeToken: () => `token-${++tokenCounter}`,
    makeSessionId: () => `session-${tokenCounter}`, comparePassword: async (password, hash) => password === hash });
  return { state, pool, service };
}

const auth = fixture();
let server; let baseUrl;
before(async () => {
  const app = express(); app.use(express.json());
  app.use('/api/v1', createApiRouter(auth.pool, { authService: auth.service, catalog: {}, payments: {} }));
  app.use((error, _request, response, _next) => response.status(error.status ?? 500).json({ error: { code: error.code ?? 'INTERNAL_ERROR', message: error.message } }));
  await new Promise((resolve, reject) => { server = app.listen(0, '127.0.0.1', (error) => error ? reject(error) : resolve()); });
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
});
after(() => new Promise((resolve) => server.close(resolve)));

async function request(path, { method = 'GET', body, cookie } = {}) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  return { response, payload: await response.json() };
}

const crmRoutes = [
  ['GET', '/auth/me'], ['GET', '/releases/current'], ['GET', '/push/config'], ['POST', '/push/test'],
  ['GET', '/notification-settings'], ['PATCH', '/notification-settings'], ['GET', '/parent/children/1/attendance'], ['GET', '/children'],
];

test('взрослый с паролем из фикстуры входит: отказ ребёнку вызван ролью, а не фикстурой', async () => {
  const login = await request('/auth/login', { method: 'POST', body: { login: 'parent@example.com', password: 'parent-pass' } });
  assert.equal(login.response.status, 200);
  assert.deepEqual(login.payload.data.roles, ['parent']);
});

test('ребёнок с верным паролем не входит в CRM, получает общий отказ, cookie и сессии нет', async () => {
  const sessionsBefore = auth.state.sessions.length;
  const login = await request('/auth/login', { method: 'POST', body: { login: 'misha.k@child.icube.local', password: 'child-pass' } });
  const wrongPassword = await request('/auth/login', { method: 'POST', body: { login: 'misha.k@child.icube.local', password: 'wrong' } });
  assert.equal(login.response.status, 401);
  assert.deepEqual(login.payload, wrongPassword.payload);
  assert.equal(login.payload.error.code, 'INVALID_CREDENTIALS');
  assert.equal(login.response.headers.get('set-cookie'), null);
  assert.equal(auth.state.sessions.length, sessionsBefore);
});

test('токен, которого нет в сессиях CRM (например, игровой), в cookie icube_session даёт 401 на всех маршрутах', async () => {
  for (const [method, path] of crmRoutes) {
    const { response } = await request(path, { method, cookie: `${SESSION_COOKIE}=game-session-token` });
    assert.equal(response.status, 401, `${method} ${path}`);
  }
});

test('даже существующая сессия пользователя только с ролью child не открывает маршруты CRM', async () => {
  auth.state.sessions.push({ id: 'forged', user_id: 2, refresh_token_hash: tokenHash('forged-child-token'), token_version: 1 });
  await assert.rejects(auth.service.authenticateToken('forged-child-token'), (error) => error.status === 403);
  for (const [method, path] of crmRoutes) {
    const { response } = await request(path, { method, cookie: `${SESSION_COOKIE}=forged-child-token` });
    assert.equal(response.status, 403, `${method} ${path}`);
  }
});

// Вход пропускает пользователя с хотя бы одной взрослой ролью (GAME_PLAN, раздел 1).
// Поэтому детская учётка обязана быть отдельным пользователем с единственной ролью child.
test('роль child не ограничивает взрослого: смешанная учётка входит в CRM как взрослая', async () => {
  const login = await request('/auth/login', { method: 'POST', body: { login: 'mixed@example.com', password: 'mixed-pass' } });
  assert.equal(login.response.status, 200);
  assert.deepEqual(login.payload.data.roles, ['child', 'parent']);
});

test('cookie CRM остаётся прежней и не пересекается с игрой', () => {
  assert.equal(SESSION_COOKIE, 'icube_session');
  for (const options of [sessionCookieOptions(), clearSessionCookieOptions()]) {
    assert.equal(options.path, '/api/v1');
    assert.equal(options.sameSite, 'lax');
    assert.equal(options.httpOnly, true);
    assert.equal(options.secure, true);
  }
});

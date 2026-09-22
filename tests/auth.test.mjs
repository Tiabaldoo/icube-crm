import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import express from 'express';
import bcrypt from 'bcryptjs';
import { createAuthService, hashPassword, parseSessionCookie, SESSION_TTL_SECONDS } from '../backend/src/auth-service.mjs';
import { createApiRouter } from '../backend/src/routes.mjs';
import { createMysqlCatalog } from '../backend/src/catalog.mjs';

function fixture() {
  const state = {
    now: new Date('2026-09-15T00:00:00Z'),
    users: [
      { id: 1, email: 'director@example.com', password_hash: 'director-pass', display_name: 'Директор', status: 'active', token_version: 1 },
      { id: 2, email: 'teacher@example.com', password_hash: 'teacher-pass', display_name: 'Преподаватель', status: 'active', token_version: 1 },
      { id: 3, email: 'blocked@example.com', password_hash: 'blocked-pass', display_name: 'Заблокирован', status: 'blocked', token_version: 1 },
      { id: 4, email: 'parent@example.com', password_hash: 'parent-pass', display_name: 'Родитель', status: 'active', token_version: 1 },
    ],
    roles: [{ id: 1, code: 'director' }, { id: 2, code: 'teacher' }, { id: 3, code: 'parent' }],
    userRoles: [{ user_id: 1, role_id: 1 }, { user_id: 2, role_id: 2 }, { user_id: 3, role_id: 3 }, { user_id: 4, role_id: 3 }],
    teachers: [{ id: 7, user_id: 2, full_name: 'Преподаватель', deleted_at: null }, { id: 8, user_id: null, full_name: 'Новый Учитель', deleted_at: null }],
    sessions: [], nextUserId: 5,
  };
  const query = async (sql, params = {}) => {
    if (sql.includes('FROM users u LEFT JOIN teachers') && sql.includes('LOWER(u.email)')) {
      const user = state.users.find((item) => item.email.toLowerCase() === params.login && item.deleted_at == null);
      return [[user ? { ...user, teacher_id: state.teachers.find((item) => item.user_id === user.id)?.id ?? null } : undefined].filter(Boolean)];
    }
    if (sql.includes('FROM auth_sessions s JOIN users u')) {
      const session = state.sessions.find((item) => item.refresh_token_hash === params.tokenHash && item.revoked_at == null
        && item.expires_at > state.now);
      const user = session && state.users.find((item) => item.id === session.user_id && item.status === 'active'
        && item.deleted_at == null && item.token_version === session.token_version);
      return [[user ? { session_id: session.id, id: user.id, display_name: user.display_name,
        teacher_id: state.teachers.find((item) => item.user_id === user.id)?.id ?? null } : undefined].filter(Boolean)];
    }
    if (sql.includes('FROM user_roles ur JOIN roles')) {
      return [state.userRoles.filter((item) => item.user_id === Number(params.userId))
        .map((item) => ({ code: state.roles.find((role) => role.id === item.role_id).code })).sort((a, b) => a.code.localeCompare(b.code))];
    }
    if (sql.startsWith('INSERT INTO auth_sessions')) {
      state.sessions.push({ id: params.id, user_id: Number(params.userId), refresh_token_hash: params.tokenHash,
        token_version: Number(params.tokenVersion), expires_at: params.expiresAt, revoked_at: null });
      return [{ insertId: state.sessions.length }];
    }
    if (sql.startsWith('UPDATE users SET last_login_at=')) return [{ affectedRows: 1 }];
    if (sql.startsWith('UPDATE auth_sessions SET revoked_at=') && sql.includes('WHERE id=')) {
      const session = state.sessions.find((item) => item.id === params.sessionId); if (session) session.revoked_at = state.now; return [{ affectedRows: session ? 1 : 0 }];
    }
    if (sql.startsWith('UPDATE auth_sessions SET revoked_at=') && sql.includes('WHERE user_id=')) {
      state.sessions.filter((item) => item.user_id === Number(params.userId)).forEach((item) => { item.revoked_at ??= state.now; }); return [{ affectedRows: 1 }];
    }
    if (sql.includes('FROM teachers t LEFT JOIN users u')) {
      const teacher = state.teachers.find((item) => item.id === Number(params.teacherId) && item.deleted_at == null);
      const user = teacher && state.users.find((item) => item.id === teacher.user_id);
      return [[teacher ? { teacher_id: teacher.id, user_id: teacher.user_id, email: user?.email, status: user?.status } : undefined].filter(Boolean)];
    }
    if (sql.startsWith('SELECT id,user_id,full_name FROM teachers')) {
      const teacher = state.teachers.find((item) => item.id === Number(params.teacherId) && item.deleted_at == null); return [[teacher].filter(Boolean)];
    }
    if (sql.startsWith('SELECT id FROM users WHERE LOWER(email)')) {
      return [state.users.filter((item) => item.email === params.login && item.id !== Number(params.userId ?? 0)).map(({ id }) => ({ id }))];
    }
    if (sql.startsWith('INSERT INTO users')) {
      const user = { id: state.nextUserId++, email: params.login, password_hash: params.passwordHash, display_name: params.displayName,
        status: 'active', token_version: 1 }; state.users.push(user); return [{ insertId: user.id }];
    }
    if (sql.startsWith('UPDATE teachers SET user_id=')) {
      state.teachers.find((item) => item.id === Number(params.teacherId)).user_id = Number(params.userId); return [{ affectedRows: 1 }];
    }
    if (sql === "SELECT id FROM roles WHERE code='teacher' LIMIT 1") return [[{ id: 2 }]];
    if (sql.startsWith('INSERT IGNORE INTO user_roles')) {
      if (!state.userRoles.some((item) => item.user_id === Number(params.userId) && item.role_id === Number(params.roleId))) state.userRoles.push({ user_id: Number(params.userId), role_id: Number(params.roleId) });
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('SELECT user_id FROM teachers')) {
      const teacher = state.teachers.find((item) => item.id === Number(params.teacherId) && item.deleted_at == null); return [[teacher ? { user_id: teacher.user_id } : undefined].filter(Boolean)];
    }
    if (sql.startsWith('UPDATE users SET email=')) {
      const user = state.users.find((item) => item.id === Number(params.userId)); Object.assign(user, { email: params.login, password_hash: params.passwordHash,
        display_name: params.displayName, status: 'active', token_version: user.token_version + 1 }); return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('UPDATE users SET password_hash=')) {
      const user = state.users.find((item) => item.id === Number(params.userId)); Object.assign(user, { password_hash: params.passwordHash, status: 'active', token_version: user.token_version + 1 }); return [{ affectedRows: 1 }];
    }
    if (sql.startsWith("UPDATE users SET status='blocked'")) {
      const user = state.users.find((item) => item.id === Number(params.userId)); Object.assign(user, { status: 'blocked', token_version: user.token_version + 1 }); return [{ affectedRows: 1 }];
    }
    throw new Error(`Неожиданный SQL auth fixture: ${sql}`);
  };
  const connection = { query, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {} };
  const pool = { query, getConnection: async () => connection };
  let tokenCounter = 0;
  const service = createAuthService(pool, { now: () => state.now, makeToken: () => `token-${++tokenCounter}`,
    makeSessionId: () => `session-${tokenCounter}`, comparePassword: async (password, hash) => password === hash || hash === `bcrypt:${password}`,
    createPasswordHash: async (password) => `bcrypt:${password}` });
  return { state, pool, service };
}

const auth = fixture();
let server; let baseUrl;
before(async () => {
  const empty = { list: async () => [], get: async () => null, create: async () => null, update: async () => null };
  const app = express(); app.use(express.json()); app.use('/api/v1', createApiRouter(auth.pool, { authService: auth.service, catalog: empty,
    payments: { list: async () => [] } }));
  app.use((error, _request, response, _next) => response.status(error.status ?? 500).json({ error: { code: error.code ?? 'INTERNAL_ERROR', message: error.message } }));
  await new Promise((resolve, reject) => { server = app.listen(0, '127.0.0.1', (error) => error ? reject(error) : resolve()); });
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
});
after(() => new Promise((resolve) => server.close(resolve)));

async function request(path, { method = 'GET', body, cookie } = {}) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  return { response, payload: response.status === 204 ? null : await response.json() };
}

test('production password hash использует bcrypt и не хранит открытый пароль', async () => {
  const hash = await hashPassword('strong-password');
  assert.notEqual(hash, 'strong-password'); assert.match(hash, /^\$2[aby]\$12\$/);
  assert.equal(await bcrypt.compare('strong-password', hash), true);
});

test('director и teacher входят по email без учёта регистра и получают HttpOnly session cookie', async () => {
  const director = await request('/auth/login', { method: 'POST', body: { login: ' Director@Example.com ', password: 'director-pass' } });
  assert.equal(director.response.status, 200); assert.deepEqual(director.payload.data.roles, ['director']); assert.equal(director.payload.data.teacherId, null);
  const setCookie = director.response.headers.get('set-cookie');
  assert.match(setCookie, /icube_session=/); assert.match(setCookie, /HttpOnly/i); assert.match(setCookie, /Secure/i); assert.match(setCookie, /SameSite=Lax/i);
  const teacher = await request('/auth/login', { method: 'POST', body: { login: 'teacher@example.com', password: 'teacher-pass' } });
  assert.deepEqual(teacher.payload.data.roles, ['teacher']); assert.equal(teacher.payload.data.teacherId, '7');
});

test('parent входит через общую session auth, но не получает административные права', async () => {
  const login = await auth.service.login({ login: 'parent@example.com', password: 'parent-pass' });
  assert.deepEqual(login.profile.roles, ['parent']);
  const profile = await auth.service.authenticateToken(login.sessionToken);
  assert.deepEqual(profile.roles, ['parent']); assert.equal(profile.teacherId, null);
  const httpLogin = await request('/auth/login', { method: 'POST', body: { login: 'parent@example.com', password: 'parent-pass' } });
  const cookie = httpLogin.response.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('/children', { cookie })).response.status, 403);
  assert.equal((await request('/salary-accruals', { cookie })).response.status, 403);
});

test('неверный, неизвестный и blocked login возвращают одинаковую ошибку', async () => {
  const attempts = [
    { login: 'director@example.com', password: 'wrong' }, { login: 'missing@example.com', password: 'wrong' },
    { login: 'blocked@example.com', password: 'blocked-pass' },
  ];
  const results = await Promise.all(attempts.map((body) => request('/auth/login', { method: 'POST', body })));
  for (const result of results) { assert.equal(result.response.status, 401); assert.equal(result.payload.error.code, 'INVALID_CREDENTIALS'); assert.equal(result.payload.error.message, 'Неверный логин или пароль'); }
});

test('auth/me требует сессию, возвращает профиль, а logout отзывает текущую сессию', async () => {
  assert.equal((await request('/auth/me')).response.status, 401);
  const login = await request('/auth/login', { method: 'POST', body: { login: 'director@example.com', password: 'director-pass' } });
  const cookie = login.response.headers.get('set-cookie').split(';')[0];
  const profile = await request('/auth/me', { cookie }); assert.equal(profile.payload.data.displayName, 'Директор');
  assert.equal((await request('/auth/logout', { method: 'POST', cookie })).response.status, 204);
  assert.equal((await request('/auth/me', { cookie })).response.status, 401);
});

test('expired, revoked и token_version mismatch сессии не проходят authenticate', async () => {
  for (const mutation of ['expired', 'revoked', 'version']) {
    const login = await auth.service.login({ login: 'teacher@example.com', password: 'teacher-pass' });
    const session = auth.state.sessions.at(-1);
    if (mutation === 'expired') session.expires_at = new Date(auth.state.now.getTime() - 1);
    if (mutation === 'revoked') session.revoked_at = auth.state.now;
    if (mutation === 'version') auth.state.users.find((item) => item.id === 2).token_version += 1;
    await assert.rejects(auth.service.authenticateToken(login.sessionToken), (error) => error.status === 401);
    if (mutation === 'version') auth.state.users.find((item) => item.id === 2).token_version -= 1;
  }
  assert.equal(SESSION_TTL_SECONDS, 30 * 24 * 60 * 60);
});

test('teacher не проходит director-only endpoint, director проходит', async () => {
  const teacherLogin = await request('/auth/login', { method: 'POST', body: { login: 'teacher@example.com', password: 'teacher-pass' } });
  const teacherCookie = teacherLogin.response.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('/payments', { cookie: teacherCookie })).response.status, 403);
  const directorLogin = await request('/auth/login', { method: 'POST', body: { login: 'director@example.com', password: 'director-pass' } });
  const directorCookie = directorLogin.response.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('/payments', { cookie: directorCookie })).response.status, 200);
});

test('создание teacher access связывает user, reset и disable отзывают старые sessions', async () => {
  const access = await auth.service.createTeacherAccess(8, { login: 'new@example.com', password: 'new-secret' }, 1);
  assert.deepEqual(access, { teacherId: '8', exists: true, login: 'new@example.com', status: 'active' });
  const createdUser = auth.state.users.find((item) => item.email === 'new@example.com');
  assert.equal(createdUser.password_hash, 'bcrypt:new-secret'); assert.ok(auth.state.userRoles.some((item) => item.user_id === createdUser.id && item.role_id === 2));
  const oldLogin = await auth.service.login({ login: 'new@example.com', password: 'new-secret' });
  await auth.service.resetTeacherPassword(8, { password: 'reset-secret' });
  assert.equal(createdUser.password_hash, 'bcrypt:reset-secret');
  await assert.rejects(auth.service.authenticateToken(oldLogin.sessionToken), (error) => error.status === 401);
  const resetLogin = await auth.service.login({ login: 'new@example.com', password: 'reset-secret' });
  await auth.service.disableTeacherAccess(8);
  assert.equal(createdUser.status, 'blocked');
  await assert.rejects(auth.service.authenticateToken(resetLogin.sessionToken), (error) => error.status === 401);
});

test('cookie parser не принимает роль или токен из иных данных', () => {
  assert.equal(parseSessionCookie('theme=dark; icube_session=abc%20123; role=director'), 'abc 123');
  assert.equal(parseSessionCookie('role=director'), null);
});

test('teacher catalog scope использует только доверенный auth.teacherId для своих groups и children', async () => {
  const calls = [];
  const pool = { query: async (sql, params = {}) => {
    calls.push({ sql, params });
    if (sql.includes('FROM study_groups g')) return [[]];
    if (sql.includes('FROM children c LEFT JOIN child_guardians')) return [[]];
    throw new Error(`Неожиданный SQL: ${sql}`);
  } };
  const catalog = createMysqlCatalog(pool);
  await catalog.list('groups', { roles: ['teacher'], teacherId: '7' });
  await catalog.list('children', { roles: ['teacher'], teacherId: '7' });
  assert.equal(calls[0].params.actorTeacherId, '7'); assert.match(calls[0].sql, /g\.default_teacher_id=:actorTeacherId/);
  assert.match(calls[0].sql, /sl\.planned_teacher_id=:actorTeacherId OR sl\.actual_teacher_id=:actorTeacherId/);
  assert.match(calls[0].sql, /teacher_projects/); assert.match(calls[0].sql, /tp\.active=TRUE/); assert.match(calls[0].sql, /teacher_project_directions/);
  assert.equal(calls[1].params.actorTeacherId, '7');
  assert.match(calls[1].sql, /group_memberships[\s\S]*sg\.default_teacher_id=:actorTeacherId/);
  assert.match(calls[1].sql, /lesson_roster_members[\s\S]*l\.planned_teacher_id=:actorTeacherId/);
  assert.match(calls[1].sql, /attendances[\s\S]*l\.actual_teacher_id=:actorTeacherId/);
  assert.match(calls[1].sql, /teacher_projects/); assert.match(calls[1].sql, /tp\.active=TRUE/); assert.match(calls[1].sql, /teacher_project_directions/);
});

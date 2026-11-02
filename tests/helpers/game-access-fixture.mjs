import express from 'express';
import { createAuthService } from '../../backend/src/auth-service.mjs';
import { createGameAccess } from '../../backend/src/game-access.mjs';
import { createGameLoginGuard } from '../../backend/src/game-login-guard.mjs';
import { createApiRouter } from '../../backend/src/routes.mjs';

export function gameFixture({ guard = createGameLoginGuard(), ...options } = {}) {
  const state = {
    now: '2026-11-02 23:30:00.000000',
    users: [
      { id: 1, email: 'parent@example.com', password_hash: 'parent-pass', display_name: 'Родитель', status: 'active', token_version: 1, roles: ['parent'] },
      { id: 2, email: 'director@example.com', password_hash: 'director-pass', display_name: 'Директор', status: 'active', token_version: 1, roles: ['director'] },
    ],
    children: [
      { id: 8, full_name: 'Миша Ковалёв', status: 'active', deleted_at: null },
      { id: 9, full_name: 'Аня', status: 'paused', deleted_at: null },
      { id: 10, full_name: 'Лид', status: 'lead', deleted_at: null },
      { id: 11, full_name: 'Закончил', status: 'finished', deleted_at: null },
      { id: 12, full_name: 'Без записей', status: 'active', deleted_at: null },
    ],
    enrollments: [
      { child_id: 8, project_id: 1, superseded_at: null }, { child_id: 9, project_id: 1, superseded_at: null },
      { child_id: 9, project_id: 2, superseded_at: null }, { child_id: 10, project_id: 1, superseded_at: null },
      { child_id: 11, project_id: 1, superseded_at: null }, { child_id: 8, project_id: 3, superseded_at: '2026-01-01' },
    ],
    accounts: [], audit: [], sessions: [], writes: [], statements: [], compares: [], nextUserId: 100,
  };
  const faults = { failOn: null, deadlocks: 0, failPool: false };
  const userById = (id) => state.users.find((user) => user.id === Number(id));
  const accountByChild = (id) => state.accounts.find((account) => account.child_id === Number(id));
  function query(sql, params = {}) {
    state.statements.push(sql);
    if (faults.failOn && sql.includes(faults.failOn)) throw new Error('Сбой базы');
    const write = sql.match(/^\s*(INSERT(?: IGNORE)? INTO|UPDATE|DELETE FROM)\s+(\w+)/);
    if (write) state.writes.push(write[2]);
    if (/(UPDATE|DELETE FROM)\s+child_user_accounts/.test(sql)) throw new Error('Строку child_user_accounts нельзя менять');
    if (sql.includes('FROM users u LEFT JOIN teachers')) {
      return [state.users.filter((user) => user.email === params.login).map((user) => ({ ...user, teacher_id: null }))];
    }
    if (sql.includes('FROM auth_sessions s JOIN users u')) {
      const session = state.sessions.find((item) => item.refresh_token_hash === params.tokenHash && !item.revoked_at);
      const user = session && userById(session.user_id);
      return [user ? [{ session_id: session.id, id: user.id, display_name: user.display_name, teacher_id: null }] : []];
    }
    if (sql.startsWith('INSERT INTO auth_sessions')) { state.sessions.push({ id: params.id, user_id: Number(params.userId), refresh_token_hash: params.tokenHash }); return [{}]; }
    if (sql.startsWith('UPDATE users SET last_login_at=')) return [{ affectedRows: 1 }];
    if (sql.startsWith('SELECT r.code FROM user_roles ur JOIN roles')) return [[...userById(params.userId).roles].sort().map((code) => ({ code }))];
    if (sql.startsWith('SELECT id,full_name,status FROM children')) {
      return [state.children.filter((child) => child.id === Number(params.childId) && child.deleted_at == null)];
    }
    if (sql.includes('SELECT DISTINCT project_id FROM child_enrollments')) {
      return [[...new Set(state.enrollments.filter((item) => item.child_id === Number(params.childId) && item.superseded_at == null).map((item) => item.project_id))].map((project_id) => ({ project_id }))];
    }
    if (sql.includes('FROM child_user_accounts a JOIN users u')) {
      const account = accountByChild(params.childId); const user = account && userById(account.user_id);
      return [user ? [{ user_id: user.id, created_at: account.created_at, email: user.email, status: user.status, deleted_at: user.deleted_at ?? null }] : []];
    }
    if (sql.startsWith('SELECT id FROM users WHERE LOWER(email)')) return [state.users.filter((user) => user.email === params.email).map(({ id }) => ({ id }))];
    if (sql.startsWith('INSERT INTO users')) {
      const user = { id: state.nextUserId++, email: params.email, password_hash: params.passwordHash, display_name: params.displayName, status: 'active', token_version: 1, roles: [] };
      state.users.push(user); return [{ insertId: user.id }];
    }
    if (sql === "SELECT id FROM roles WHERE code='child' LIMIT 1") return [[{ id: 5 }]];
    if (sql.startsWith('INSERT INTO user_roles')) { userById(params.userId).roles.push('child'); return [{}]; }
    if (sql.startsWith('INSERT INTO child_user_accounts')) {
      if (accountByChild(params.childId)) throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' });
      state.accounts.push({ child_id: Number(params.childId), user_id: Number(params.userId), created_at: state.now }); return [{}];
    }
    if (sql.startsWith('INSERT INTO audit_log')) { state.audit.push({ action: sql.match(/'(game_access\.[a-z_]+)'/)?.[1], ...params }); return [{}]; }
    if (sql.includes('JOIN child_user_accounts a ON a.child_id=c.id WHERE c.id=:childId FOR UPDATE')) {
      const account = accountByChild(params.childId);
      return [account ? [{ user_id: account.user_id, created_at: account.created_at }] : []];
    }
    if (sql.startsWith('DELETE ur FROM user_roles')) { const user = userById(params.userId); user.roles = user.roles.filter((role) => role !== 'child'); return [{}]; }
    if (sql.startsWith("UPDATE users SET status='blocked',deleted_at=")) {
      const user = userById(params.userId);
      Object.assign(user, { status: 'blocked', deleted_at: state.now, email: null, phone: null, token_version: user.token_version + 1 });
      if (sql.includes('display_name=:displayName')) user.display_name = params.displayName;
      if (sql.includes('password_hash=:passwordHash')) user.password_hash = params.passwordHash;
      return [{}];
    }
    if (sql.startsWith('UPDATE users SET password_hash=')) {
      Object.assign(userById(params.userId), { password_hash: params.passwordHash, status: 'active', token_version: userById(params.userId).token_version + 1 }); return [{}];
    }
    if (sql.startsWith("UPDATE users SET status='blocked'")) {
      Object.assign(userById(params.userId), { status: 'blocked', token_version: userById(params.userId).token_version + 1 }); return [{}];
    }
    if (sql.startsWith('UPDATE auth_sessions SET revoked_at=')) return [{}];
    if (sql.includes('FROM users u LEFT JOIN child_user_accounts a')) {
      const user = state.users.find((item) => item.email === params.email);
      if (!user) return [[]];
      const account = state.accounts.find((item) => item.user_id === user.id);
      const child = account && state.children.find((item) => item.id === account.child_id);
      return [[{ id: user.id, password_hash: user.password_hash, status: user.status, token_version: user.token_version, deleted_at: user.deleted_at ?? null,
        child_id: account?.child_id ?? null, created_at: account?.created_at ?? null, full_name: child?.full_name ?? null, child_status: child?.status ?? null, child_deleted_at: child?.deleted_at ?? null }]];
    }
    if (sql.includes('FROM children c LEFT JOIN child_user_accounts a')) {
      const child = state.children.find((item) => item.id === Number(params.childId) && item.deleted_at == null);
      if (!child) return [[]];
      const account = accountByChild(child.id); const user = account && userById(account.user_id);
      return [[{ child_status: child.status, full_name: child.full_name, user_id: user?.id ?? null, created_at: account?.created_at ?? null,
        status: user?.status ?? null, token_version: user?.token_version ?? null, deleted_at: user?.deleted_at ?? null }]];
    }
    throw new Error(`Неожиданный SQL в фикстуре: ${sql}`);
  }
  const run = async (sql, params) => query(sql, params);
  const tables = ['users', 'accounts', 'audit', 'sessions'];
  let snapshot = null;
  // Транзакции идут по одной, как при блокировке строки ребёнка в InnoDB.
  let turn = Promise.resolve();
  const turns = [];
  const connection = {
    query: run,
    beginTransaction: async () => {
      const previous = turn;
      turn = new Promise((resolve) => { turns.push(resolve); });
      await previous;
      snapshot = structuredClone(Object.fromEntries(tables.map((table) => [table, state[table]])));
    },
    commit: async () => {
      if (faults.deadlocks > 0) { faults.deadlocks -= 1; throw Object.assign(new Error('deadlock'), { code: 'ER_LOCK_DEADLOCK' }); }
      snapshot = null;
    },
    rollback: async () => { Object.assign(state, snapshot); snapshot = null; },
    release() { turns.shift()?.(); },
  };
  const pool = {
    query: async (sql, params) => { if (faults.failPool) throw new Error('Сбой базы'); return query(sql, params); },
    getConnection: async () => {
      if (faults.deadlocks > 0) return { ...connection, commit: async () => { faults.deadlocks -= 1; throw Object.assign(new Error('deadlock'), { code: 'ER_LOCK_DEADLOCK' }); } };
      return connection;
    },
  };
  let password = 0;
  const gameAccess = createGameAccess(pool, {
    guard, makePassword: () => `generated-password-${++password}`,
    createPasswordHash: async (value) => `hash:${value}`,
    comparePassword: async (value, hash) => {
      state.compares.push(hash);
      await new Promise((resolve) => setImmediate(resolve));
      return hash === `hash:${value}`;
    },
    ...options,
  });
  return { state, pool, connection, gameAccess, guard, faults };
}

export const director = { userId: '2', roles: ['director'] };
export const partner = { userId: '3', roles: ['partner'], projectIds: ['1'] };

export function addLegacyAccount(fixture, { childId, createdAt, roles = ['child'], email = 'old.user@child.icube.local' }) {
  const user = { id: fixture.state.nextUserId++, email, password_hash: 'hash:old-password', display_name: 'Старый', status: 'active', token_version: 3, roles };
  fixture.state.users.push(user);
  fixture.state.accounts.push({ child_id: childId, user_id: user.id, created_at: createdAt });
  return user;
}

export async function startCrm(fixture, { gameAccess = fixture.gameAccess, auth = null } = {}) {
  const authService = createAuthService(fixture.pool, { makeToken: () => `token-${fixture.state.sessions.length + 1}`, makeSessionId: () => `session-${fixture.state.sessions.length + 1}`,
    comparePassword: async (value, hash) => value === hash });
  const app = express(); app.use(express.json());
  app.use('/api/v1', createApiRouter(fixture.pool, {
    authService, catalog: {}, payments: {}, gameAccess,
    testAuth: auth ? (request, _response, next) => { request.auth = auth(request); next(); } : null,
  }));
  app.use((error, _request, response, _next) => response.status(error.status ?? 500).json({ error: { code: error.code ?? 'INTERNAL_ERROR', message: error.message } }));
  const server = await new Promise((resolve, reject) => { const value = app.listen(0, '127.0.0.1', (error) => error ? reject(error) : resolve(value)); });
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}/api/v1`, close: () => new Promise((resolve) => server.close(resolve)) };
}

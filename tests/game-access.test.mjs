import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { childPasswordWords } from '../backend/src/child-password-words.mjs';
import { generatedChildPassword } from '../backend/src/game-access.mjs';
import { createGameLoginGuard } from '../backend/src/game-login-guard.mjs';
import { addLegacyAccount, director, gameFixture, partner, startCrm } from './helpers/game-access-fixture.mjs';

const verify = (fixture, login, password, clientIp = '203.0.113.5') => fixture.gameAccess.verifyChild({ login, password, clientIp });
const rejectsWith = (promise, code) => assert.rejects(promise, (error) => error.code === code);

test('словарь: ровно 512 уникальных слов из латиницы, удобной длины', () => {
  assert.equal(childPasswordWords.length, 512);
  assert.equal(new Set(childPasswordWords).size, 512);
  for (const word of childPasswordWords) assert.match(word, /^[a-z]{3,10}$/, word);
});

test('пароль: четыре слова и две цифры, не меньше 42 бит случайности', () => {
  assert.ok(Math.log2(512) * 4 + Math.log2(100) >= 42);
  const passwords = new Set(Array.from({ length: 200 }, () => generatedChildPassword()));
  assert.equal(passwords.size, 200);
  for (const password of passwords) {
    assert.match(password, /^[a-z]+-[a-z]+-[a-z]+-[a-z]+-\d{2}$/);
    assert.ok(Buffer.byteLength(password) <= 72);
    for (const word of password.split('-').slice(0, 4)) assert.ok(childPasswordWords.includes(word));
  }
});

test('пароль берётся из криптографического генератора, предсказуемых источников нет', () => {
  const calls = [];
  generatedChildPassword((min, max) => { calls.push([min, max]); return 0; });
  assert.deepEqual(calls, [[0, 512], [0, 512], [0, 512], [0, 512], [0, 10], [0, 10]]);
  const source = readFileSync(new URL('../backend/src/game-access.mjs', import.meta.url), 'utf8');
  assert.match(source, /import \{[^}]*randomInt[^}]*\} from 'node:crypto'/);
  assert.doesNotMatch(source, /Math\.random/);
});

test('создание: отдельный пользователь с единственной ролью child, запись в журнал без пароля', async () => {
  const f = gameFixture();
  const usersBefore = JSON.stringify(f.state.users);
  const created = await f.gameAccess.create(8, { login: ' Misha.K ' }, director);
  assert.equal(created.login, 'misha.k'); assert.equal(created.password, 'generated-password-1');
  assert.equal(created.firstAccessOn, '2026-11-02');
  const user = f.state.users.at(-1);
  assert.equal(user.email, 'misha.k@child.icube.local'); assert.deepEqual(user.roles, ['child']);
  assert.notEqual(user.password_hash, created.password);
  assert.equal(JSON.stringify(f.state.users.slice(0, 2)), usersBefore);
  assert.equal(f.state.audit.length, 1); assert.equal(f.state.audit[0].action, 'game_access.create');
  assert.doesNotMatch(JSON.stringify(f.state.audit), /generated-password|hash:/);
});

test('создание: неверный логин, повтор, занятый логин и статус ребёнка отклоняются', async () => {
  const f = gameFixture();
  for (const login of ['ab', 'misha@evil.example', 'миша', '', null, 'x'.repeat(33)]) await rejectsWith(f.gameAccess.create(8, { login }, director), 'VALIDATION_ERROR');
  await f.gameAccess.create(8, { login: 'misha.k' }, director);
  await rejectsWith(f.gameAccess.create(8, { login: 'another' }, director), 'GAME_ACCESS_EXISTS');
  await rejectsWith(f.gameAccess.create(12, { login: 'misha.k' }, director), 'LOGIN_EXISTS');
  await rejectsWith(f.gameAccess.create(10, { login: 'lead.child' }, director), 'GAME_ACCESS_CHILD_STATUS');
  await rejectsWith(f.gameAccess.create(11, { login: 'done.child' }, director), 'GAME_ACCESS_CHILD_STATUS');
  assert.equal(f.state.accounts.length, 1);
});

test('created_at и связь не меняются при отключении, восстановлении и сбросе пароля', async () => {
  const f = gameFixture();
  await f.gameAccess.create(8, { login: 'misha.k' }, director);
  const [before] = structuredClone(f.state.accounts);
  f.state.now = '2027-03-15 10:00:00.000000';
  const steps = [
    () => f.gameAccess.disable(8, director), () => f.gameAccess.resetPassword(8, director),
    () => f.gameAccess.resetPassword(8, director), () => f.gameAccess.disable(8, director),
    () => f.gameAccess.resetPassword(8, partner), () => f.gameAccess.unlock(8, director),
  ];
  for (const step of steps) {
    const result = await step();
    assert.equal(result.firstAccessOn, '2026-11-02');
    assert.deepEqual(f.state.accounts, [before]);
    assert.equal((await f.gameAccess.status(8)).firstAccessOn, '2026-11-02');
  }
  await rejectsWith(f.gameAccess.create(8, { login: 'misha.new' }, director), 'GAME_ACCESS_EXISTS');
  assert.deepEqual(f.state.accounts, [before]);
  assert.equal(f.state.users.filter((user) => user.roles.includes('child')).length, 1);
});

test('историческая строка child_user_accounts сохраняет свою дату', async () => {
  const f = gameFixture();
  addLegacyAccount(f, { childId: 8, createdAt: '2025-01-10 09:00:00.000000' });
  assert.equal((await f.gameAccess.get(8, director)).firstAccessOn, '2025-01-10');
  await f.gameAccess.resetPassword(8, director); await f.gameAccess.disable(8, director);
  assert.equal(f.state.accounts[0].created_at, '2025-01-10 09:00:00.000000');
  assert.equal((await f.gameAccess.status(8)).firstAccessOn, '2025-01-10');
});

test('сброс и отключение не трогают взрослого, связанного со строкой child_user_accounts', async () => {
  const f = gameFixture();
  const adult = addLegacyAccount(f, { childId: 8, createdAt: '2025-01-10 09:00:00.000000', roles: ['child', 'parent'] });
  const before = { ...adult };
  await rejectsWith(f.gameAccess.resetPassword(8, director), 'GAME_ACCESS_INVALID');
  await rejectsWith(f.gameAccess.disable(8, director), 'GAME_ACCESS_INVALID');
  await rejectsWith(f.gameAccess.unlock(8, director), 'GAME_ACCESS_INVALID');
  assert.deepEqual(adult, before);
  assert.equal((await f.gameAccess.status(8)).canLogin, false);
});

test('код CRM не обновляет child_user_accounts, удаление только вместе с ребёнком в deleteChild', () => {
  const directory = new URL('../backend/src/', import.meta.url);
  const hits = [];
  for (const file of readdirSync(directory)) {
    const source = readFileSync(new URL(file, directory), 'utf8');
    if (/UPDATE\s+child_user_accounts/i.test(source)) hits.push(`update:${file}`);
    if (/DELETE\s+FROM\s+child_user_accounts/i.test(source)) hits.push(`delete:${file}`);
  }
  assert.deepEqual(hits, ['delete:catalog.mjs']);
});

test('партнёр управляет только ребёнком, полностью относящимся к его проекту', async () => {
  const f = gameFixture();
  const created = await f.gameAccess.create(8, { login: 'misha.k' }, partner);
  assert.equal(created.login, 'misha.k');
  assert.equal((await f.gameAccess.get(9, partner)).manageable, false);
  assert.equal((await f.gameAccess.get(9, partner)).login, undefined);
  await rejectsWith(f.gameAccess.create(9, { login: 'anya' }, partner), 'GAME_ACCESS_DIRECTOR_ONLY');
  await f.gameAccess.create(9, { login: 'anya' }, director);
  for (const action of [() => f.gameAccess.resetPassword(9, partner), () => f.gameAccess.disable(9, partner), () => f.gameAccess.unlock(9, partner)]) {
    await rejectsWith(action(), 'GAME_ACCESS_DIRECTOR_ONLY');
  }
  await rejectsWith(f.gameAccess.get(12, partner), 'FORBIDDEN');
  await rejectsWith(f.gameAccess.create(12, { login: 'nobody' }, partner), 'FORBIDDEN');
  await rejectsWith(f.gameAccess.get(8, { roles: ['partner'], projectIds: ['2'] }), 'FORBIDDEN');
});

test('законченная запись в другом проекте тоже делает ребёнка общим, заменённая — нет', async () => {
  const f = gameFixture();
  f.state.enrollments.push({ child_id: 11, project_id: 2, superseded_at: null });
  assert.equal((await f.gameAccess.get(11, partner)).manageable, false);
  assert.equal((await f.gameAccess.get(8, partner)).manageable, true);
});

test('маршруты: преподаватель и родитель получают 403, партнёр и директор проходят, пароль не кешируется', async () => {
  const f = gameFixture();
  const crm = await startCrm(f, { auth: (request) => JSON.parse(request.get('x-test-auth')) });
  try {
    const call = (auth, path, method = 'GET', body) => fetch(`${crm.baseUrl}${path}`, { method, headers: { 'x-test-auth': JSON.stringify(auth), 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    for (const auth of [{ userId: '5', roles: ['teacher'] }, { userId: '1', roles: ['parent'] }, { userId: '7', roles: ['child'] }]) {
      assert.equal((await call(auth, '/children/8/game-access')).status, 403);
      assert.equal((await call(auth, '/children/8/game-access', 'POST', { login: 'misha.k' })).status, 403);
      assert.equal((await call(auth, '/children/8/game-access', 'DELETE')).status, 403);
    }
    const created = await call(partner, '/children/8/game-access', 'POST', { login: 'misha.k' });
    assert.equal(created.status, 201); assert.equal(created.headers.get('cache-control'), 'no-store');
    assert.equal((await call(director, '/children/8/game-access')).status, 200);
    assert.equal((await call(director, '/children/999/game-access')).status, 404);
  } finally { await crm.close(); }
});

test('verify-child: успешный вход не создаёт сессию CRM', async () => {
  const f = gameFixture();
  const { password } = await f.gameAccess.create(8, { login: 'misha.k' }, director);
  f.state.writes.length = 0;
  const result = await verify(f, 'misha.k', password);
  assert.deepEqual(result, { childId: '8', userId: '100', displayName: 'Миша Ковалёв', tokenVersion: 1, firstAccessOn: '2026-11-02' });
  assert.deepEqual(f.state.writes, []); assert.equal(f.state.sessions.length, 0);
});

test('verify-child: все отказы выглядят одинаково', async () => {
  const f = gameFixture();
  const { password } = await f.gameAccess.create(8, { login: 'misha.k' }, director);
  const cases = {
    'неверный пароль': async () => verify(f, 'misha.k', 'wrong', '203.0.113.1'),
    'нет логина': async () => verify(f, 'nobody', password, '203.0.113.2'),
    'неверный формат': async () => verify(f, 'x', password, '203.0.113.3'),
    'взрослый email': async () => verify(f, 'parent@example.com', 'parent-pass', '203.0.113.4'),
    'ребёнок закончил': async () => { f.state.children[0].status = 'finished'; try { await verify(f, 'misha.k', password, '203.0.113.5'); } finally { f.state.children[0].status = 'active'; } },
    'ребёнок лид': async () => { f.state.children[0].status = 'lead'; try { await verify(f, 'misha.k', password, '203.0.113.6'); } finally { f.state.children[0].status = 'active'; } },
    'ребёнок в архиве': async () => { f.state.children[0].status = 'archived'; try { await verify(f, 'misha.k', password, '203.0.113.7'); } finally { f.state.children[0].status = 'active'; } },
    'ребёнок удалён': async () => { f.state.children[0].deleted_at = 'x'; try { await verify(f, 'misha.k', password, '203.0.113.8'); } finally { f.state.children[0].deleted_at = null; } },
    'пользователь заблокирован': async () => { f.state.users.at(-1).status = 'blocked'; try { await verify(f, 'misha.k', password, '203.0.113.9'); } finally { f.state.users.at(-1).status = 'active'; } },
    'лишняя роль': async () => { f.state.users.at(-1).roles.push('parent'); try { await verify(f, 'misha.k', password, '203.0.113.10'); } finally { f.state.users.at(-1).roles.pop(); } },
    'нет связи с ребёнком': async () => { const accounts = f.state.accounts; f.state.accounts = []; try { await verify(f, 'misha.k', password, '203.0.113.11'); } finally { f.state.accounts = accounts; } },
  };
  for (const [name, attempt] of Object.entries(cases)) {
    await assert.rejects(attempt(), (error) => error.status === 401 && error.code === 'INVALID_CREDENTIALS' && error.message === 'Неверный логин или пароль', name);
  }
  assert.equal(f.state.sessions.length, 0);
});

test('пауза разрешена, отключение и сброс пароля гасят доступ через tokenVersion и canLogin', async () => {
  const f = gameFixture();
  await f.gameAccess.create(9, { login: 'anya' }, director);
  assert.equal((await f.gameAccess.status(9)).canLogin, true);
  const { password: first } = await f.gameAccess.resetPassword(9, director);
  assert.equal((await f.gameAccess.status(9)).tokenVersion, 2);
  await f.gameAccess.disable(9, director);
  assert.deepEqual([(await f.gameAccess.status(9)).canLogin, (await f.gameAccess.status(9)).tokenVersion], [false, 3]);
  await rejectsWith(verify(f, 'anya', first), 'INVALID_CREDENTIALS');
  const { password: second } = await f.gameAccess.resetPassword(9, director);
  assert.equal((await verify(f, 'anya', second)).tokenVersion, 4);
  await rejectsWith(verify(f, 'anya', first, '203.0.113.20'), 'INVALID_CREDENTIALS');
});

test('status: нет доступа, закрытые статусы и удалённый ребёнок', async () => {
  const f = gameFixture();
  assert.deepEqual(await f.gameAccess.status(12), { exists: true, canLogin: false, tokenVersion: null, status: 'active', firstAccessOn: null, displayName: 'Без записей' });
  await f.gameAccess.create(8, { login: 'misha.k' }, director);
  f.state.children[0].status = 'archived';
  const closed = await f.gameAccess.status(8);
  assert.equal(closed.canLogin, false); assert.equal(closed.firstAccessOn, '2026-11-02');
  f.state.children[0].deleted_at = 'x';
  assert.deepEqual(await f.gameAccess.status(8), { exists: false, canLogin: false, tokenVersion: null, status: null, firstAccessOn: null, displayName: null });
  await rejectsWith(f.gameAccess.status('abc'), 'VALIDATION_ERROR');
});

test('verify-child: адрес обязателен, loopback означает неверный прокси и закрывает вход', async () => {
  const f = gameFixture();
  const { password } = await f.gameAccess.create(8, { login: 'misha.k' }, director);
  const errors = console.error; console.error = () => {};
  try {
    for (const clientIp of [undefined, '', 'unknown', '127.0.0.1', '::1', '::ffff:127.0.0.1', '0.0.0.0', '203.0.113.5, 10.0.0.1']) {
      await rejectsWith(f.gameAccess.verifyChild({ login: 'misha.k', password, clientIp }), 'INVALID_CLIENT_IP');
    }
  } finally { console.error = errors; }
});

test('заблокированная пара получает 429 даже с верным паролем, сброс пароля снимает блокировку', async () => {
  const f = gameFixture({ guard: createGameLoginGuard() });
  const { password } = await f.gameAccess.create(8, { login: 'misha.k' }, director);
  for (let i = 0; i < 5; i += 1) await rejectsWith(verify(f, 'misha.k', 'wrong'), 'INVALID_CREDENTIALS');
  await rejectsWith(verify(f, 'misha.k', password), 'LOGIN_RATE_LIMITED');
  const { password: fresh } = await f.gameAccess.resetPassword(8, director);
  assert.equal((await verify(f, 'misha.k', fresh)).childId, '8');
});

test('кнопка разблокировки снимает блокировку без смены пароля', async () => {
  const f = gameFixture();
  const { password } = await f.gameAccess.create(8, { login: 'misha.k' }, director);
  for (let i = 0; i < 5; i += 1) await rejectsWith(verify(f, 'misha.k', 'wrong'), 'INVALID_CREDENTIALS');
  await f.gameAccess.unlock(8, partner);
  assert.equal((await verify(f, 'misha.k', password)).childId, '8');
  assert.equal(f.state.audit.at(-1).action, 'game_access.unlock');
});

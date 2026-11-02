import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import bcrypt from 'bcryptjs';
import { childPasswordWords } from '../backend/src/child-password-words.mjs';
import { generatedChildPassword } from '../backend/src/game-access.mjs';
import { createGameLoginGuard } from '../backend/src/game-login-guard.mjs';
import { createPasswordVerifier } from '../backend/src/game-password-verifier.mjs';
import { releaseChildGameAccount } from '../backend/src/game-account-release.mjs';
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
  for (const file of readdirSync(directory, { recursive: true }).filter((name) => name.endsWith('.mjs'))) {
    const source = readFileSync(new URL(file.replaceAll('\\', '/'), directory), 'utf8');
    if (/(UPDATE|REPLACE\s+INTO)\s+`?child_user_accounts/i.test(source)) hits.push(`update:${file}`);
    if (/INSERT[^;`]*child_user_accounts[^;`]*ON\s+DUPLICATE/i.test(source)) hits.push(`update:${file}`);
    if (/DELETE\s+(\w+\s+)?FROM\s+`?child_user_accounts/i.test(source)) hits.push(`delete:${file}`);
  }
  assert.deepEqual(hits, ['delete:catalog.mjs']);
});

test('удаление ребёнка: детская учётка обезличена, логин освобождён, дата первого доступа осталась в журнале', async () => {
  const f = gameFixture();
  await f.gameAccess.create(8, { login: 'misha.k' }, director);
  const user = f.state.users.at(-1);
  await releaseChildGameAccount(f.connection, 8, '2');
  assert.deepEqual([user.status, user.email, user.password_hash, user.roles], ['blocked', null, '!', []]);
  assert.equal(user.display_name.includes('Миша'), false);
  assert.equal(user.token_version, 2); assert.ok(user.deleted_at);
  const entry = f.state.audit.at(-1);
  assert.deepEqual([entry.action, entry.childId, entry.actorId], ['game_access.child_deleted', 8, '2']);
  assert.deepEqual(JSON.parse(entry.after), { userId: String(user.id), firstAccessOn: '2026-11-02', childOnly: true });
  assert.doesNotMatch(JSON.stringify(f.state.audit), /Миша|misha/);
  f.state.accounts = [];
  assert.equal((await f.gameAccess.create(12, { login: 'misha.k' }, director)).login, 'misha.k');
});

test('удаление ребёнка: взрослый, связанный исторической строкой, теряет только роль child', async () => {
  const f = gameFixture();
  const adult = addLegacyAccount(f, { childId: 8, createdAt: '2025-01-10 09:00:00.000000', roles: ['child', 'parent'] });
  const before = { ...adult };
  await releaseChildGameAccount(f.connection, 8);
  assert.deepEqual({ ...adult, roles: before.roles }, before);
  assert.deepEqual(adult.roles, ['parent']);
  assert.equal(JSON.parse(f.state.audit.at(-1).after).childOnly, false);
});

test('удаление ребёнка: учётка без ролей тоже обезличивается', async () => {
  const f = gameFixture();
  const user = addLegacyAccount(f, { childId: 8, createdAt: '2025-01-10 09:00:00.000000', roles: [] });
  await releaseChildGameAccount(f.connection, 8);
  assert.deepEqual([user.status, user.email, user.password_hash], ['blocked', null, '!']);
});

test('удаление ребёнка без игрового доступа ничего не пишет', async () => {
  const f = gameFixture();
  await releaseChildGameAccount(f.connection, 8);
  assert.deepEqual(f.state.writes, []); assert.deepEqual(f.state.audit, []);
});

test('deleteChild освобождает учётку до удаления связи и в той же транзакции, сохраняя автора', () => {
  const source = readFileSync(new URL('../backend/src/catalog.mjs', import.meta.url), 'utf8');
  assert.match(source, /async function deleteChild\(childId, context = \{\}\)/);
  assert.match(source, /await releaseChildGameAccount\(connection, childId, context\.userId \?\? null\); await connection\.query\('DELETE FROM child_user_accounts/);
  assert.match(readFileSync(new URL('../backend/src/routes.mjs', import.meta.url), 'utf8'), /catalog\.deleteChild\(request\.params\.id, request\.auth\)/);
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

test('смешанные роли: директор-партнёр действует как директор, преподаватель-партнёр как партнёр', async () => {
  const f = gameFixture();
  assert.equal((await f.gameAccess.get(9, { userId: '4', roles: ['director', 'partner'], projectIds: ['1'] })).manageable, true);
  const teacherPartner = { userId: '4', roles: ['partner', 'teacher'], projectIds: ['1'] };
  assert.equal((await f.gameAccess.get(9, teacherPartner)).manageable, false);
  await rejectsWith(f.gameAccess.create(9, { login: 'anya' }, teacherPartner), 'GAME_ACCESS_DIRECTOR_ONLY');
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

test('параллельные неверные попытки не обходят лимит: до пароля доходят ровно 5', async () => {
  const f = gameFixture();
  await f.gameAccess.create(8, { login: 'misha.k' }, director);
  const results = await Promise.allSettled(Array.from({ length: 40 }, () => verify(f, 'misha.k', 'wrong')));
  assert.equal(f.state.compares.length, 1);
  assert.equal(results.filter((item) => item.reason?.code === 'GAME_LOGIN_BUSY').length, 39);
  for (let round = 0; round < 3; round += 1) {
    await Promise.allSettled(Array.from({ length: 40 }, () => verify(f, 'misha.k', 'wrong')));
    await Promise.allSettled(Array.from({ length: 40 }, () => verify(f, 'misha.k', 'wrong')));
  }
  assert.equal(f.state.compares.length, 5);
  await rejectsWith(verify(f, 'misha.k', 'wrong'), 'LOGIN_RATE_LIMITED');
});

test('поток запросов с одного адреса отсекается до базы: не больше трёх одновременно', async () => {
  const f = gameFixture();
  f.state.statements.length = 0;
  const results = await Promise.allSettled(Array.from({ length: 30 }, (_, index) => verify(f, `login${index}`, 'wrong')));
  assert.equal(results.filter((item) => item.reason?.code === 'GAME_LOGIN_BUSY').length, 27);
  assert.equal(f.state.statements.filter((sql) => sql.includes('FROM users u LEFT JOIN child_user_accounts a')).length, 3);
});

test('настоящий поток bcrypt работает через verifyChild и не теряет места', async () => {
  const hash = bcrypt.hashSync('right-password', 4);
  const verifier = createPasswordVerifier();
  const f = gameFixture({ passwordVerifier: verifier });
  try {
    addLegacyAccount(f, { childId: 8, createdAt: '2025-01-10 09:00:00.000000' }).password_hash = hash;
    assert.equal((await verify(f, 'old.user', 'right-password')).childId, '8');
    await rejectsWith(verify(f, 'old.user', 'wrong', '203.0.113.6'), 'INVALID_CREDENTIALS');
    await rejectsWith(verify(f, 'nobody', 'wrong', '203.0.113.7'), 'INVALID_CREDENTIALS');
    assert.equal(verifier.pendingCount(), 0);
  } finally { await verifier.close(); }
});

test('параллельные верные входы не считаются неудачей', async () => {
  const f = gameFixture();
  const { password } = await f.gameAccess.create(8, { login: 'misha.k' }, director);
  await Promise.allSettled(Array.from({ length: 20 }, () => verify(f, 'misha.k', password)));
  assert.equal((await verify(f, 'misha.k', password)).childId, '8');
});

test('сбой базы при входе освобождает резерв и не считается неудачей', async () => {
  const f = gameFixture();
  const { password } = await f.gameAccess.create(8, { login: 'misha.k' }, director);
  f.faults.failPool = true;
  for (let i = 0; i < 10; i += 1) await assert.rejects(verify(f, 'misha.k', password), /Сбой базы/);
  f.faults.failPool = false;
  assert.equal((await verify(f, 'misha.k', password)).childId, '8');
});

test('занятая очередь даёт отказ без записи неудачи и без запроса к базе', async () => {
  const f = gameFixture();
  const { password } = await f.gameAccess.create(8, { login: 'misha.k' }, director);
  f.faults.busy = true;
  f.state.statements.length = 0;
  for (let i = 0; i < 10; i += 1) await rejectsWith(verify(f, 'misha.k', password), 'GAME_LOGIN_BUSY');
  assert.deepEqual(f.state.statements, []);
  f.faults.busy = false;
  assert.equal((await verify(f, 'misha.k', password)).childId, '8');
});

test('неизвестный логин проверяется по фиктивному хэшу той же стоимости', async () => {
  const f = gameFixture();
  await rejectsWith(verify(f, 'nobody', 'whatever'), 'INVALID_CREDENTIALS');
  await rejectsWith(verify(f, 'x', 'whatever', '203.0.113.6'), 'INVALID_CREDENTIALS');
  assert.equal(f.state.compares.length, 2);
  for (const hash of f.state.compares) assert.match(hash, /^\$2a\$12\$/);
});

test('вход не считает bcrypt в главном потоке', () => {
  const source = readFileSync(new URL('../backend/src/game-access.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /bcrypt/);
  assert.match(source, /createPasswordVerifier/);
});

test('транзакция: сбой на середине создания откатывает пользователя, связь и журнал', async () => {
  const f = gameFixture();
  const users = f.state.users.length;
  f.faults.failOn = 'INSERT INTO audit_log';
  await assert.rejects(f.gameAccess.create(8, { login: 'misha.k' }, director), /Сбой базы/);
  assert.equal(f.state.users.length, users);
  assert.deepEqual(f.state.accounts, []);
  assert.deepEqual(f.state.audit, []);
});

test('транзакция: сбой сброса пароля оставляет прежний пароль и версию', async () => {
  const f = gameFixture();
  const { password } = await f.gameAccess.create(8, { login: 'misha.k' }, director);
  f.faults.failOn = 'INSERT INTO audit_log';
  await assert.rejects(f.gameAccess.resetPassword(8, director), /Сбой базы/);
  f.faults.failOn = null;
  assert.equal((await verify(f, 'misha.k', password)).tokenVersion, 1);
});

test('сбой базы после commit не теряет показанный один раз пароль', async () => {
  const f = gameFixture();
  await f.gameAccess.create(8, { login: 'misha.k' }, director);
  const original = f.connection.commit;
  f.connection.commit = async () => { await original(); f.faults.failPool = true; };
  const reset = await f.gameAccess.resetPassword(8, director);
  assert.equal(reset.password, 'generated-password-2'); assert.equal(reset.login, 'misha.k');
  f.faults.failPool = false;
  const created = await f.gameAccess.create(9, { login: 'anya' }, director);
  assert.equal(created.login, 'anya'); assert.equal(created.password, 'generated-password-3');
});

test('сбой журнала при разблокировке не снимает блокировку', async () => {
  const f = gameFixture();
  await f.gameAccess.create(8, { login: 'misha.k' }, director);
  for (let i = 0; i < 5; i += 1) await rejectsWith(verify(f, 'misha.k', 'wrong'), 'INVALID_CREDENTIALS');
  f.faults.failOn = 'INSERT INTO audit_log';
  await assert.rejects(f.gameAccess.unlock(8, director), /Сбой базы/);
  f.faults.failOn = null;
  await rejectsWith(verify(f, 'misha.k', 'wrong'), 'LOGIN_RATE_LIMITED');
});

test('создание не блокирует отсутствующую строку доступа: нет основы для взаимоблокировки', async () => {
  const f = gameFixture();
  await f.gameAccess.create(8, { login: 'misha.k' }, director);
  const reads = f.state.statements.filter((sql) => sql.includes('FROM child_user_accounts a JOIN users u'));
  assert.ok(reads.length > 0);
  for (const sql of reads) assert.doesNotMatch(sql, /FOR UPDATE/);
  assert.ok(f.state.statements.some((sql) => /FROM children WHERE id=:childId AND deleted_at IS NULL FOR UPDATE/.test(sql)));
});

test('взаимоблокировка повторяется один раз и не создаёт дублей', async () => {
  const f = gameFixture();
  f.faults.deadlocks = 1;
  const created = await f.gameAccess.create(8, { login: 'misha.k' }, director);
  assert.equal(created.login, 'misha.k');
  assert.equal(f.state.accounts.length, 1);
  assert.equal(f.state.users.filter((user) => user.roles.includes('child')).length, 1);
});

test('параллельное создание одному ребёнку оставляет одну строку и один пароль', async () => {
  const f = gameFixture();
  const results = await Promise.allSettled([f.gameAccess.create(8, { login: 'one.login' }, director), f.gameAccess.create(8, { login: 'two.login' }, director)]);
  assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1);
  assert.equal(f.state.accounts.length, 1);
});

test('статус входа учитывает статус ребёнка, а чужая учётка не раскрывается', async () => {
  const f = gameFixture();
  await f.gameAccess.create(8, { login: 'misha.k' }, director);
  assert.equal((await f.gameAccess.get(8, director)).canLogin, true);
  f.state.children[0].status = 'finished';
  const closed = await f.gameAccess.get(8, director);
  assert.deepEqual([closed.status, closed.canLogin], ['active', false]);
  const g = gameFixture();
  addLegacyAccount(g, { childId: 8, createdAt: '2025-01-10 09:00:00.000000', roles: ['parent'], email: 'adult@example.com' });
  assert.deepEqual(await g.gameAccess.get(8, partner), { manageable: true, exists: true, invalid: true });
});

test('кнопка разблокировки снимает блокировку без смены пароля', async () => {
  const f = gameFixture();
  const { password } = await f.gameAccess.create(8, { login: 'misha.k' }, director);
  for (let i = 0; i < 5; i += 1) await rejectsWith(verify(f, 'misha.k', 'wrong'), 'INVALID_CREDENTIALS');
  await f.gameAccess.unlock(8, partner);
  assert.equal((await verify(f, 'misha.k', password)).childId, '8');
  assert.equal(f.state.audit.at(-1).action, 'game_access.unlock');
});

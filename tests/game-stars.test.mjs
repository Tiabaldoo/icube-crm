// Этап 4: звёзды игры со стороны CRM — права и границы доступа (Т5), идемпотентность, подтверждение (Т7),
// audit_log, недоступность игры, внутренний API посещений и сквозной путь CRM ↔ игра по HTTP.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { after, before, test } from 'node:test';
import express from 'express';
import { createGameAttendance } from '../backend/src/game-attendance.mjs';
import { createInternalGameApp as createCrmInternalApp, startInternalGameServer as startCrmInternal } from '../backend/src/game-internal.mjs';
import { createGameServerClient } from '../backend/src/game-server-client.mjs';
import { createGameStars } from '../backend/src/game-stars.mjs';
import { createApiRouter } from '../backend/src/routes.mjs';
import { createCrmClient } from '../game/server/crm-client.mjs';
import { createInternalGameApp, startInternalGameServer } from '../game/server/internal-app.mjs';
import { createReconciler } from '../game/server/reconciler.mjs';
import { createStars } from '../game/server/stars.mjs';
import { createMemoryStore } from '../game/server/store-memory.mjs';

const TOKEN = 'test-only-internal-token-0123456789abcdef';
const quiet = { log() {}, warn() {}, error() {} };
const director = { userId: '2', roles: ['director'] };
const partner = { userId: '3', roles: ['partner'], projectIds: ['1'] };
const otherPartner = { userId: '4', roles: ['partner'], projectIds: ['2'] };
const teacher = { userId: '40', roles: ['teacher'] };
const strangerTeacher = { userId: '41', roles: ['teacher'] };
const parent = { userId: '1', roles: ['parent'] };
// Игровые учётки CRM: здесь — только какие дети имеют активный доступ. Само условие проверяет
// game-access.mjs (activeChildIds), его тесты — ниже на фикстуре game-access.
const activeAccounts = new Set(['8', '9', '12']);
const accounts = { calls: 0, activeChildIds: async (ids) => { accounts.calls += 1; return new Set(ids.map(String).filter((id) => activeAccounts.has(id))); } };

// Поддельная база CRM: только запросы звёзд и посещений. Неизвестный SQL — ошибка теста.
function crmPool() {
  const state = {
    children: [{ id: 8, status: 'active', projects: [1] }, { id: 9, status: 'active', projects: [2] }, { id: 12, status: 'paused', projects: [1] }],
    teachers: [{ id: 7, user_id: 40 }, { id: 70, user_id: 41 }],
    teacherChildren: new Set(['7:8']),
    users: [{ id: 2, display_name: 'Директор' }, { id: 3, display_name: 'Партнёр' }, { id: 40, display_name: 'Преподаватель' }],
    attendances: { 8: [
      { attendance_id: 501, lesson_id: 1, attendance_type: 'main', is_trial: 1, is_intro_group: 0, starts_at: '2026-11-02 10:00:00.000000' },
      { attendance_id: 502, lesson_id: 2, attendance_type: 'extra', is_trial: 0, is_intro_group: 0, starts_at: '2026-11-03 18:30:00.000000' },
    ] },
    audit: [], statements: [],
  };
  const query = async (sql, params = {}) => {
    state.statements.push(sql);
    const childId = Number(params.childId);
    if (sql.startsWith('SELECT id FROM children WHERE id=:childId AND deleted_at IS NULL')) return [state.children.filter((child) => child.id === childId).map(({ id }) => ({ id }))];
    if (sql.includes('FROM child_enrollments WHERE child_id IN (:ids) AND project_id=:projectId')) {
      return [state.children.filter((child) => params.ids.includes(String(child.id)) && child.projects.includes(Number(params.projectId))).map((child) => ({ child_id: child.id }))];
    }
    if (sql.startsWith('SELECT id FROM teachers WHERE user_id=:userId')) return [state.teachers.filter((item) => item.user_id === Number(params.userId)).map(({ id }) => ({ id }))];
    if (sql.includes('FROM group_memberships gm')) {
      state.scopeQueries = (state.scopeQueries ?? 0) + 1;
      return [params.ids.filter((id) => state.teacherChildren.has(`${params.teacherId}:${id}`)).map((id) => ({ child_id: Number(id) }))];
    }
    if (sql.startsWith('SELECT id,display_name FROM users WHERE id IN')) return [state.users.filter((user) => params.ids.includes(String(user.id)))];
    if (sql.startsWith('SELECT id FROM audit_log')) {
      return [state.audit.filter((row) => row.action === params.action && row.childId === params.childId && String(row.after.bonusId) === params.bonusId).map(() => ({ id: 1 }))];
    }
    if (sql.startsWith('INSERT INTO audit_log')) { state.audit.push({ ...params, action: params.action, after: JSON.parse(params.after) }); return [{}]; }
    if (sql.includes('FROM attendances a JOIN lessons l')) {
      return [(state.attendances[childId] ?? []).map((row) => ({ ...row, lesson_date: row.starts_at.slice(0, 10) }))];
    }
    if (sql.startsWith('SELECT id,status FROM children WHERE id IN')) return [state.children.filter((child) => params.ids.includes(String(child.id))).map(({ id, status }) => ({ id, status }))];
    throw new Error(`Неожиданный SQL: ${sql}`);
  };
  return { state, pool: { query } };
}

const listen = async (app) => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server;
};
const close = (server) => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); });

// Связка: CRM (API + внутренний порт) ↔ игра (обратный канал 3101 и сверка) по настоящему HTTP.
let crm; let gameStore; let gameServer; let crmApi; let crmInternal; let stars; let reconciler; let gameStarsService;
let actor = director;

before(async () => {
  crm = crmPool();
  crmInternal = await listen(createCrmInternalApp({ token: TOKEN, gameAccess: { status: async () => ({}) }, gameAttendance: createGameAttendance(crm.pool) }));
  const crmClient = createCrmClient({ baseUrl: `http://127.0.0.1:${crmInternal.address().port}`, token: TOKEN, logger: quiet });
  gameStore = createMemoryStore();
  for (const childId of ['8', '9']) await gameStore.insertProfile({ childId, nickname: `Ник${childId}`, firstAccessOn: '2026-11-01' });
  stars = createStars({ store: gameStore, crm: crmClient, logger: quiet });
  reconciler = createReconciler({ store: gameStore, crm: crmClient, stars, logger: quiet });
  gameServer = startInternalGameServer({ app: createInternalGameApp({ token: TOKEN, stars, reconciler, logger: quiet }), port: 0, logger: quiet });
  await once(gameServer, 'listening');
  gameStarsService = createGameStars(crm.pool, { gameAccess: accounts,
    client: createGameServerClient({ baseUrl: `http://127.0.0.1:${gameServer.address().port}`, token: TOKEN, logger: quiet }), maxStars: 10, logger: quiet,
  });
  const app = express(); app.use(express.json());
  app.use('/api/v1', createApiRouter(crm.pool, {
    authService: {}, catalog: {}, payments: {}, gameAccess: {}, gameStars: gameStarsService,
    testAuth: (request, _response, next) => { request.auth = actor; next(); },
  }));
  app.use((error, _request, response, _next) => response.status(error.status ?? 500).json({ error: { code: error.code ?? 'INTERNAL_ERROR', message: error.message } }));
  crmApi = await listen(app);
});
after(async () => { await close(crmApi); await close(gameServer); await close(crmInternal); });

async function api(path, { as = director, method = 'GET', body, key } = {}) {
  actor = as;
  const response = await fetch(`http://127.0.0.1:${crmApi.address().port}/api/v1${path}`, {
    method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(key ? { 'idempotency-key': key } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* неизвестный маршрут отдаёт HTML Express */ }
  return { status: response.status, json, headers: response.headers };
}
const grant = (childId, body, options) => api(`/children/${childId}/game-stars/bonuses`, { method: 'POST', body, ...options });

test('внутренний API: полный список засчитанных посещений, включая пробные; без имён и денег', async () => {
  const attendance = createGameAttendance(crm.pool);
  const result = await attendance.qualifyingAttendance('8');
  assert.deepEqual(result, { exists: true, attendances: [
    { attendanceId: '501', lessonId: '1', lessonDate: '2026-11-02', startsAt: '2026-11-02T10:00:00+11:00', attendanceType: 'main', isTrial: true, isIntroLesson: false },
    { attendanceId: '502', lessonId: '2', lessonDate: '2026-11-03', startsAt: '2026-11-03T18:30:00+11:00', attendanceType: 'extra', isTrial: false, isIntroLesson: false },
  ] });
  const sql = crm.state.statements.find((item) => item.includes('FROM attendances a JOIN lessons l'));
  for (const condition of ['a.present=TRUE', "l.status='completed'", 'l.deleted_at IS NULL', 'l.is_empty_trip=FALSE', 'ORDER BY l.starts_at,a.id']) assert.ok(sql.includes(condition), condition);
  assert.doesNotMatch(sql, /price|charged|full_name|payment|balance/i);
  assert.deepEqual(await attendance.qualifyingAttendance('404'), { exists: false, attendances: [] });
  assert.deepEqual(await attendance.childrenStatus('8,404,8'), { children: [{ childId: '8', exists: true, status: 'active' }, { childId: '404', exists: false, status: null }] });
  for (const ids of ['', 'x', '0', Array.from({ length: 201 }, (_, i) => i + 1).join(',')]) await assert.rejects(attendance.childrenStatus(ids), { code: 'VALIDATION_ERROR' });
});

test('внутренний API посещений — только с секретом и только когда подключён', async () => {
  const base = `http://127.0.0.1:${crmInternal.address().port}`;
  assert.equal((await fetch(`${base}/internal/game/children/8/qualifying-attendance`)).status, 404);
  const ok = await fetch(`${base}/internal/game/children/8/qualifying-attendance`, { headers: { 'x-game-internal-token': TOKEN } });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).data.attendances.length, 2);
  const batch = await fetch(`${base}/internal/game/children?ids=8,9`, { headers: { 'x-game-internal-token': TOKEN } });
  assert.equal((await batch.json()).data.children.length, 2);
});

test('сквозной путь: игра сверяет посещения CRM — 6 звёзд (пробное + первое после него), сотрудник видит итог', async () => {
  const summary = await api('/children/8/game-stars');
  assert.equal(summary.status, 200);
  assert.equal(summary.headers.get('cache-control'), 'no-store');
  assert.deepEqual(summary.json.data.wallet, { balance: 0, chest: 6, debt: 0 });
  assert.deepEqual(summary.json.data.entries.map((entry) => entry.kind).sort(), ['attendance', 'trial_followup_bonus']);
  // Исправление в CRM задним числом: посещение 502 отменено — звёзды отозваны, история сохранена.
  const saved = crm.state.attendances[8];
  crm.state.attendances[8] = [saved[0]];
  assert.equal((await stars.reconcile('8')).added, 2);
  assert.equal((await api('/children/8/game-stars')).json.data.wallet.chest, 0);
  crm.state.attendances[8] = saved;
  await stars.reconcile('8');
  assert.equal(gameStore.starsSnapshot('8').entries.length, 6);
  assert.equal(gameStore.starsSnapshot('8').wallet.chest, 6);
});

test('бонус директора: запись в журнал игры и в audit_log, двойная отправка — одна запись', async () => {
  const before = crm.state.audit.length;
  const body = { amount: 2, reason: 'Лучший проект группы' };
  const [first, second] = await Promise.all([grant(8, body, { key: 'click-1' }), grant(8, body, { key: 'click-1' })]);
  assert.deepEqual([first.status, second.status], [201, 201]);
  assert.equal(first.json.data.bonus.id, second.json.data.bonus.id);
  assert.equal(crm.state.audit.length, before + 1);
  assert.deepEqual(crm.state.audit.at(-1), { actorId: '2', action: 'game_stars.bonus', childId: '8', after: { bonusId: first.json.data.bonus.id, amount: 2, reason: 'Лучший проект группы' } });
  const bonus = first.json.data.bonuses.find((item) => item.id === first.json.data.bonus.id);
  assert.equal(bonus.createdByName, 'Директор'); assert.equal(bonus.canRevoke, true);
  // Тот же ключ с другой суммой — конфликт, а не второй бонус.
  assert.equal((await grant(8, { ...body, amount: 3 }, { key: 'click-1' })).json.error.code, 'IDEMPOTENCY_CONFLICT');
  assert.equal((await grant(8, body)).json.error.code, 'IDEMPOTENCY_KEY_REQUIRED');
});

test('сумма: 1–10, больше 3 — только с подтверждением; баланс из браузера не принимается', async () => {
  for (const amount of [0, 11, -2, 1.5, '2', null]) assert.equal((await grant(8, { amount, reason: 'Старание' }, { key: `a${amount}` })).status, 400, String(amount));
  assert.equal((await grant(8, { amount: 2, reason: '' }, { key: 'empty-reason' })).status, 400);
  const unconfirmed = await grant(8, { amount: 4, reason: 'Победа в олимпиаде' }, { key: 'big-1' });
  assert.equal(unconfirmed.status, 409); assert.equal(unconfirmed.json.error.code, 'GAME_BONUS_CONFIRMATION_REQUIRED');
  const chestBefore = gameStore.starsSnapshot('8').wallet.chest;
  const confirmed = await grant(8, { amount: 4, reason: 'Победа в олимпиаде', confirmed: true, balance: 1000, chest: 500, kind: 'purchase' }, { key: 'big-1' });
  assert.equal(confirmed.status, 201);
  assert.equal(gameStore.starsSnapshot('8').wallet.chest, chestBefore + 4);
  for (const [method, path] of [['PUT', '/children/8/game-stars'], ['PATCH', '/children/8/game-stars'], ['POST', '/children/8/game-stars'], ['POST', '/children/8/game-stars/balance']]) {
    assert.equal((await api(path, { method, body: { balance: 1000 } })).status, 404, `${method} ${path}`);
  }
  const limited = createGameStars(crm.pool, { gameAccess: accounts, client: { grantBonus: async () => assert.fail('не должно дойти до игры') }, maxStars: 5 });
  await assert.rejects(limited.grant('8', { amount: 6, reason: 'Много', confirmed: true }, { ...director, idempotencyKey: 'k' }), { code: 'VALIDATION_ERROR' });
});

test('партнёр: свои дети — да, ребёнок другого проекта — 403, игра не вызывается', async () => {
  assert.equal((await grant(8, { amount: 1, reason: 'Помог другу' }, { as: partner, key: 'p-1' })).status, 201);
  const auditBefore = crm.state.audit.length;
  const foreign = await grant(9, { amount: 1, reason: 'Чужой ребёнок' }, { as: partner, key: 'p-2' });
  assert.equal(foreign.status, 403);
  assert.equal((await api('/children/9/game-stars', { as: partner })).status, 403);
  assert.equal((await grant(8, { amount: 1, reason: 'Чужой ребёнок' }, { as: otherPartner, key: 'p-3' })).status, 403);
  assert.equal(crm.state.audit.length, auditBefore);
  assert.equal(gameStore.starsSnapshot('9').entries.length, 0);
});

test('преподаватель: только «свои» дети (Т5); чужой, не связанный и родитель — отказ', async () => {
  assert.equal((await grant(8, { amount: 1, reason: 'Собрал робота' }, { as: teacher, key: 't-1' })).status, 201);
  assert.equal((await grant(9, { amount: 1, reason: 'Собрал робота' }, { as: teacher, key: 't-2' })).status, 403);
  assert.equal((await grant(8, { amount: 1, reason: 'Собрал робота' }, { as: strangerTeacher, key: 't-3' })).status, 403);
  assert.equal((await grant(8, { amount: 1, reason: 'Собрал робота' }, { as: { userId: '99', roles: ['teacher'] }, key: 't-4' })).status, 403);
  assert.equal((await grant(8, { amount: 1, reason: 'Хочу звёзд' }, { as: parent, key: 'x-1' })).status, 403);
  assert.equal((await api('/children/8/game-stars', { as: { userId: '100', roles: ['child'] } })).status, 403);
  assert.equal((await grant(404, { amount: 1, reason: 'Нет такого' }, { as: director, key: 'x-2' })).status, 404);
  assert.equal((await grant(404, { amount: 1, reason: 'Нет такого' }, { as: teacher, key: 'x-3' })).status, 403);
});

test('отзыв: автор или директор, с причиной; чужой партнёр не может; история и audit_log сохраняются', async () => {
  const given = await grant(8, { amount: 3, reason: 'Ошибочный бонус' }, { as: teacher, key: 't-revoke' });
  const bonusId = given.json.data.bonus.id;
  const path = `/children/8/game-stars/bonuses/${bonusId}/revoke`;
  assert.equal((await api(path, { as: partner, method: 'POST', body: { reason: 'Не тот ребёнок' } })).json.error.code, 'GAME_BONUS_REVOKE_FORBIDDEN');
  assert.equal((await api(path, { as: teacher, method: 'POST', body: {} })).status, 400);
  const revoked = await api(path, { as: teacher, method: 'POST', body: { reason: 'Не тот ребёнок' } });
  assert.equal(revoked.status, 200);
  const view = revoked.json.data.bonuses.find((item) => item.id === bonusId);
  assert.equal(view.revoked.reason, 'Не тот ребёнок'); assert.equal(view.revoked.byName, 'Преподаватель'); assert.equal(view.canRevoke, false);
  const auditBefore = crm.state.audit.length;
  assert.equal((await api(path, { as: director, method: 'POST', body: { reason: 'Повтор' } })).json.data.replayed, true);
  assert.equal(crm.state.audit.length, auditBefore);
  assert.equal(crm.state.audit.at(-1).action, 'game_stars.bonus_revoke');
  assert.equal((await api(`/children/9/game-stars/bonuses/${bonusId}/revoke`, { as: director, method: 'POST', body: { reason: 'Чужой' } })).json.error.code, 'GAME_BONUS_NOT_FOUND');
  // Директор отзывает чужой бонус.
  const other = await grant(8, { amount: 1, reason: 'Ещё бонус' }, { as: partner, key: 'p-revoke' });
  assert.equal((await api(`/children/8/game-stars/bonuses/${other.json.data.bonus.id}/revoke`, { as: director, method: 'POST', body: { reason: 'Директор исправил' } })).status, 200);
});

test('ребёнок ещё не входил в игру — CRM показывает это, а бонус не выдаётся', async () => {
  const summary = await api('/children/12/game-stars');
  assert.deepEqual(summary.json.data, { profile: false, accessActive: true, maxStars: 10, confirmAbove: 3 });
  assert.equal((await grant(12, { amount: 1, reason: 'Пока рано' }, { key: 'no-profile' })).json.error.code, 'GAME_PROFILE_MISSING');
});

test('игра недоступна: 503 «игра временно недоступна», audit_log не пишется, повтор после восстановления — один бонус', async () => {
  const down = createGameStars(crm.pool, { gameAccess: accounts, client: createGameServerClient({ baseUrl: 'http://127.0.0.1:9', token: TOKEN, timeoutMs: 500, logger: quiet }), logger: quiet });
  const auditBefore = crm.state.audit.length;
  await assert.rejects(down.grant('8', { amount: 1, reason: 'Пока игра лежит' }, { ...director, idempotencyKey: 'down-1' }), { status: 503, code: 'GAME_UNAVAILABLE' });
  await assert.rejects(down.summary('8', director), { code: 'GAME_UNAVAILABLE' });
  assert.equal(crm.state.audit.length, auditBefore);
  const first = await gameStarsService.grant('8', { amount: 1, reason: 'Пока игра лежит' }, { ...director, idempotencyKey: 'down-1' });
  const again = await gameStarsService.grant('8', { amount: 1, reason: 'Пока игра лежит' }, { ...director, idempotencyKey: 'down-1' });
  assert.equal(first.bonus.id, again.bonus.id);
  assert.equal(crm.state.audit.length, auditBefore + 1);
});

test('неверный секрет обратного канала — «недоступна», а не отказ сотруднику', async () => {
  const wrong = createGameServerClient({ baseUrl: `http://127.0.0.1:${gameServer.address().port}`, token: 'x'.repeat(40), logger: quiet });
  assert.deepEqual(await wrong.stars('8'), { ok: false, unavailable: true });
});

test('ответ игры потерян после записи: повтор дописывает единственную запись audit_log', async () => {
  const real = createGameServerClient({ baseUrl: `http://127.0.0.1:${gameServer.address().port}`, token: TOKEN, logger: quiet });
  let drop = true;
  const lossy = { ...real, grantBonus: async (body) => { const result = await real.grantBonus(body); if (drop) { drop = false; return { ok: false, unavailable: true }; } return result; } };
  const service = createGameStars(crm.pool, { gameAccess: accounts, client: lossy, logger: quiet });
  const auditBefore = crm.state.audit.length;
  await assert.rejects(service.grant('8', { amount: 1, reason: 'Ответ потерялся' }, { ...director, idempotencyKey: 'lost-1' }), { code: 'GAME_UNAVAILABLE' });
  assert.equal(crm.state.audit.length, auditBefore);
  const retry = await service.grant('8', { amount: 1, reason: 'Ответ потерялся' }, { ...director, idempotencyKey: 'lost-1' });
  assert.equal(retry.replayed, true);
  assert.equal(crm.state.audit.length, auditBefore + 1);
  await service.grant('8', { amount: 1, reason: 'Ответ потерялся' }, { ...director, idempotencyKey: 'lost-1' });
  assert.equal(crm.state.audit.length, auditBefore + 1);
});

test('партнёр-преподаватель без единственного проекта проверяется как преподаватель', async () => {
  const both = { userId: '40', roles: ['partner', 'teacher'], projectIds: [] };
  assert.equal((await api('/children/8/game-stars', { as: both })).status, 200);
  assert.equal((await api('/children/9/game-stars', { as: both })).status, 403);
  assert.equal((await api('/children/8/game-stars', { as: { userId: '3', roles: ['partner'], projectIds: [] } })).status, 403);
});

// GET /children: признак gameStars для преподавателя — только при включённой игре и только «своим» детям.
async function childrenApp(service) {
  const listed = [{ id: '8', name: 'Миша' }, { id: '9', name: 'Аня' }, { id: '12', name: 'Петя' }];
  const app = express(); app.use(express.json());
  app.use('/api/v1', createApiRouter(crm.pool, {
    authService: {}, payments: {}, gameAccess: service ? {} : null, gameStars: service,
    catalog: { list: async (resource) => { assert.equal(resource, 'children'); return listed.map((child) => ({ ...child })); } },
    testAuth: (request, _response, next) => { request.auth = actor; next(); },
  }));
  const server = await listen(app);
  const get = async (as) => {
    actor = as;
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/children`);
    return { status: response.status, text: await response.clone().text(), data: (await response.json()).data };
  };
  return { get, close: () => close(server) };
}

test('GET /children: при включённой игре признак gameStars только у детей, которым преподаватель вправе выдавать звёзды', async () => {
  const app = await childrenApp(gameStarsService);
  try {
    const before = crm.state.scopeQueries ?? 0;
    const forTeacher = await app.get(teacher);
    assert.deepEqual(forTeacher.data.map((child) => [child.id, child.gameStars ?? false]), [['8', true], ['9', false], ['12', false]]);
    assert.equal((crm.state.scopeQueries ?? 0) - before, 1, 'одна пакетная проверка на список');
    for (const as of [strangerTeacher, { userId: '99', roles: ['teacher'] }, director, partner, { userId: '40', roles: ['partner', 'teacher'], projectIds: ['1'] }]) {
      const result = await app.get(as);
      assert.ok(result.data.every((child) => !('gameStars' in child)), JSON.stringify(as));
    }
    // Признак не разрешение: операция всё равно проверяет права заново.
    crm.state.teacherChildren.delete('7:8');
    assert.equal((await grant(8, { amount: 1, reason: 'Устаревший признак' }, { as: teacher, key: 'stale-mark' })).status, 403);
    crm.state.teacherChildren.add('7:8');
  } finally { await app.close(); }
});

test('GET /children: при выключенной игре ответ прежний — без полей и без запросов к базе', async () => {
  const app = await childrenApp(null);
  try {
    const statements = crm.state.statements.length;
    const result = await app.get(teacher);
    assert.equal(result.text, JSON.stringify({ data: [{ id: '8', name: 'Миша' }, { id: '9', name: 'Аня' }, { id: '12', name: 'Петя' }] }));
    assert.equal(crm.state.statements.length, statements);
  } finally { await app.close(); }
});

test('GET /children: сбой проверки прав не ломает список, признака просто нет', async () => {
  const broken = createGameStars({ query: async () => { throw new Error("Сбой базы"); } }, { client: {}, gameAccess: accounts, logger: quiet });
  const list = [{ id: '8' }];
  assert.deepEqual(await broken.markChildren(list, { userId: '40', teacherId: '7', roles: ['teacher'] }), [{ id: '8' }]);
});

test('активный игровой доступ: без учётки или с отключённой — признака нет, выдача и отзыв запрещены сервером; звёзды сохраняются', async () => {
  const given = await grant(8, { amount: 2, reason: 'До отключения' }, { as: teacher, key: 'before-disable' });
  assert.equal(given.status, 201);
  const chest = gameStore.starsSnapshot('8').wallet.chest;
  const app = await childrenApp(gameStarsService);
  try {
    // Доступ отключён (или ещё не создан — для CRM это одно и то же: activeChildIds его не возвращает).
    activeAccounts.delete('8');
    assert.deepEqual((await app.get(teacher)).data.map((child) => child.gameStars ?? false), [false, false, false]);
    const denied = await grant(8, { amount: 1, reason: 'После отключения' }, { as: teacher, key: 'after-disable' });
    assert.equal(denied.status, 409); assert.equal(denied.json.error.code, 'GAME_ACCESS_INACTIVE');
    assert.equal((await grant(8, { amount: 1, reason: 'Директор тоже' }, { as: director, key: 'director-disabled' })).json.error.code, 'GAME_ACCESS_INACTIVE');
    const revoke = await api(`/children/8/game-stars/bonuses/${given.json.data.bonus.id}/revoke`, { as: teacher, method: 'POST', body: { reason: 'Отзыв без доступа' } });
    assert.equal(revoke.json.error.code, 'GAME_ACCESS_INACTIVE');
    assert.equal(gameStore.starsSnapshot('8').wallet.chest, chest, 'звёзды не тронуты');
    // Директор видит звёзды отключённого ребёнка, но без выдачи и отзыва.
    const view = (await api('/children/8/game-stars', { as: director })).json.data;
    assert.equal(view.accessActive, false); assert.equal(view.wallet.chest, chest);
    assert.ok(view.bonuses.every((bonus) => bonus.canRevoke === false));
    // Доступ восстановлен — звёзды на месте, признак и выдача снова работают.
    activeAccounts.add('8');
    assert.equal((await app.get(teacher)).data[0].gameStars, true);
    assert.equal((await api('/children/8/game-stars', { as: teacher })).json.data.wallet.chest, chest);
    assert.equal((await grant(8, { amount: 1, reason: 'После восстановления' }, { as: teacher, key: 'after-restore' })).status, 201);
  } finally { activeAccounts.add('8'); await app.close(); }
});

test('пометка списка: активность доступа проверяется только для детей, которых преподаватель вправе награждать', async () => {
  const app = await childrenApp(gameStarsService);
  try {
    const seen = [];
    const original = accounts.activeChildIds;
    accounts.activeChildIds = async (ids) => { seen.push([...ids]); return original(ids); };
    await app.get(teacher);
    accounts.activeChildIds = original;
    assert.deepEqual(seen, [['8']]);
  } finally { await app.close(); }
});

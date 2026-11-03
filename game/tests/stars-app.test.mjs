import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import { createInternalGameApp, startInternalGameServer } from '../server/internal-app.mjs';
import { createReconciler } from '../server/reconciler.mjs';
import { createStars } from '../server/stars.mjs';
import { createMemoryStore } from '../server/store-memory.mjs';
import { fakeCrm, request, sessionCookie, silentLogger, startGame, TOKEN, visit } from './helpers.mjs';

const requestKey = (value) => createHash('sha256').update(value).digest('hex');
const flush = async () => { for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setImmediate(resolve)); };

async function withGame(run) {
  const crm = fakeCrm();
  const child = crm.addChild(8, 'misha.k', 'kot-luna-reka-dom-47', { attendances: [visit(1, '2026-11-02', { trial: true }), visit(2, '2026-11-03')] });
  const game = await startGame({ crm: crm.crm });
  try { await run({ game, crm, child }); } finally { await game.close(); }
}
const loginCookie = async (game) => sessionCookie((await request(game, '/game/api/login', { method: 'POST', body: { login: 'misha.k', password: 'kot-luna-reka-dom-47' } })).setCookie);

test('вход запускает сверку: в сундуке 6 звёзд за первое платное после пробного', () => withGame(async ({ game, crm }) => {
  const cookie = await loginCookie(game);
  await flush();
  assert.equal(crm.calls.attendance.length, 1);
  const stars = await request(game, '/game/api/stars', { cookie });
  assert.equal(stars.status, 200);
  assert.deepEqual(stars.json, { data: { balance: 0, chest: 6 } });
  assert.equal(stars.headers.get('cache-control'), 'no-store');
  // Не чаще раза в минуту на ребёнка.
  assert.equal(crm.calls.attendance.length, 1);
}));

test('сундук открывает только сам ребёнок с игровой сессией и со своего сайта', () => withGame(async ({ game }) => {
  const cookie = await loginCookie(game);
  await flush();
  assert.equal((await request(game, '/game/api/stars/chest/open', { method: 'POST', body: {} })).status, 401);
  assert.equal((await request(game, '/game/api/stars/chest/open', { method: 'POST', body: {}, cookie, origin: 'https://evil.example' })).status, 403);
  const opened = await request(game, '/game/api/stars/chest/open', { method: 'POST', body: {}, cookie });
  assert.deepEqual(opened.json, { data: { opened: 6, balance: 6, chest: 0 } });
  const again = await request(game, '/game/api/stars/chest/open', { method: 'POST', body: {}, cookie });
  assert.deepEqual(again.json, { data: { opened: 0, balance: 6, chest: 0 } });
}));

test('браузер не может начислить звёзды: маршрутов начисления у игры для ребёнка нет', () => withGame(async ({ game }) => {
  const cookie = await loginCookie(game);
  for (const path of ['/game/api/stars', '/game/api/stars/bonus', '/game/api/bonuses', '/game/api/stars/reconcile', '/game/api/internal/bonuses']) {
    const response = await request(game, path, { method: 'POST', body: { amount: 100 }, cookie });
    assert.equal(response.status, 404, path);
  }
  assert.equal((await request(game, '/game/api/stars', { cookie })).json.data.chest, 6);
}));

test('CRM недоступна: звёзды показываются из журнала, ничего не отзывается', () => withGame(async ({ game, crm }) => {
  const cookie = await loginCookie(game);
  await flush();
  crm.state.attendanceUnavailable = true;
  game.time.advance(2 * 60_000);
  const stars = await request(game, '/game/api/stars', { cookie });
  assert.deepEqual(stars.json, { data: { balance: 0, chest: 6 } });
}));

async function internal({ allowed = true } = {}) {
  const store = createMemoryStore();
  const crm = fakeCrm();
  crm.addChild(8, 'misha.k', 'pw', { attendances: [visit(2, '2026-11-03')] });
  await store.insertProfile({ childId: '8', nickname: 'КосмоКот83', firstAccessOn: '2026-11-01' });
  const logger = silentLogger();
  const stars = createStars({ store, crm: crm.crm, logger });
  const reconciler = createReconciler({ store, crm: crm.crm, stars, logger });
  const server = startInternalGameServer({ app: createInternalGameApp({ token: TOKEN, stars, reconciler, logger, isAllowedPeer: allowed ? undefined : () => false }), port: 0, logger });
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, { body, secret = TOKEN } = {}) => {
    const response = await fetch(`${base}${path}`, { method: body ? 'POST' : 'GET',
      headers: { ...(secret ? { 'x-game-internal-token': secret } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, json: await response.json() };
  };
  return { call, crm, close: () => new Promise((resolve) => server.close(resolve)), address: server.address() };
}

test('обратный канал: только 127.0.0.1, без секрета или с чужого адреса — 404', async () => {
  const api = await internal();
  try {
    assert.equal(api.address.address, '127.0.0.1');
    const unknown = await api.call('/internal/unknown');
    for (const secret of [null, 'wrong', `${TOKEN}x`]) {
      const response = await api.call('/internal/children/8/stars', { secret });
      assert.equal(response.status, 404);
      assert.deepEqual(response.json, unknown.json);
    }
  } finally { await api.close(); }
  const remote = await internal({ allowed: false });
  try { assert.equal((await remote.call('/internal/children/8/stars')).status, 404); } finally { await remote.close(); }
});

test('обратный канал: бонус, повтор, отзыв и журнал для CRM', async () => {
  const api = await internal();
  try {
    const body = { childId: '8', amount: 2, reason: 'Помог группе', actorUserId: '5', requestKey: requestKey('one') };
    const first = await api.call('/internal/bonuses', { body });
    const repeat = await api.call('/internal/bonuses', { body });
    assert.equal(first.status, 200); assert.equal(repeat.json.data.bonus.id, first.json.data.bonus.id); assert.equal(repeat.json.data.replayed, true);
    assert.equal((await api.call('/internal/bonuses', { body: { ...body, amount: 50, requestKey: requestKey('two') } })).json.error.code, 'VALIDATION_ERROR');
    const forbidden = await api.call(`/internal/bonuses/${first.json.data.bonus.id}/revoke`, { body: { childId: '8', actorUserId: '6', reason: 'Ошибка' } });
    assert.equal(forbidden.status, 403);
    const revoked = await api.call(`/internal/bonuses/${first.json.data.bonus.id}/revoke`, { body: { childId: '8', actorUserId: '5', reason: 'Ошибка' } });
    assert.equal(revoked.status, 200);
    const summary = await api.call('/internal/children/8/stars');
    assert.deepEqual(summary.json.data.wallet, { balance: 0, chest: 3, debt: 0 });
    assert.deepEqual(summary.json.data.entries.map((entry) => entry.kind), ['attendance', 'staff_bonus_revoke', 'staff_bonus']);
    assert.equal(summary.json.data.bonuses[0].revoked.byUserId, '5');
    assert.equal((await api.call('/internal/children/77/stars')).json.error.code, 'GAME_PROFILE_MISSING');
  } finally { await api.close(); }
});

test('фоновая сверка: проходит все профили, удалённых из CRM пропускает, при сбое CRM останавливается', async () => {
  const store = createMemoryStore();
  const crm = fakeCrm();
  for (const id of [3, 8, 12]) {
    crm.addChild(id, `c${id}`, 'pw', { attendances: [visit(id, '2026-11-03')] });
    await store.insertProfile({ childId: String(id), nickname: `Ник${id}`, firstAccessOn: '2026-11-01' });
  }
  crm.children.get('12').deleted = true;
  const logger = silentLogger();
  const stars = createStars({ store, crm: crm.crm, logger });
  const reconciler = createReconciler({ store, crm: crm.crm, stars, logger, limits: { intervalMs: 1000, perChildMs: 60_000, pageSize: 2 } });
  assert.deepEqual(await reconciler.sweep(), { children: 2, added: 2, skipped: 1 });
  assert.deepEqual(crm.calls.batch, [['3', '8'], ['12']]);
  assert.deepEqual(await reconciler.sweep(), { children: 2, added: 0, skipped: 1 });
  crm.state.unavailable = true;
  assert.deepEqual(await reconciler.sweep(), { children: 0, added: 0, skipped: 0 });
  assert.match(logger.lines.join('\n'), /остановлена/);
  assert.equal(store.starsSnapshot('3').wallet.chest, 3);
});

test('звёзды сразу после входа ждут уже начатую сверку, а не показывают старый итог', () => withGame(async ({ game }) => {
  const cookie = await loginCookie(game);
  const stars = await request(game, '/game/api/stars', { cookie });
  assert.deepEqual(stars.json, { data: { balance: 0, chest: 6 } });
}));

test('обратный канал: медленная CRM не превращает ответ сотруднику в «игра недоступна»', async () => {
  const store = createMemoryStore();
  await store.insertProfile({ childId: '8', nickname: 'КосмоКот83', firstAccessOn: '2026-11-01' });
  const logger = silentLogger();
  const stars = createStars({ store, crm: fakeCrm().crm, logger });
  const reconciler = { reconcileChild: () => new Promise(() => {}) };
  const server = startInternalGameServer({ app: createInternalGameApp({ token: TOKEN, stars, reconciler, logger, reconcileWaitMs: 50 }), port: 0, logger });
  await once(server, 'listening');
  try {
    const started = Date.now();
    const response = await fetch(`http://127.0.0.1:${server.address().port}/internal/children/8/stars`, { headers: { 'x-game-internal-token': TOKEN } });
    assert.equal(response.status, 200);
    assert.ok(Date.now() - started < 1000);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

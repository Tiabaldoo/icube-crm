import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSessions, GameUnavailable, hashToken, SESSION_LIMITS } from '../server/sessions.mjs';
import { createMemoryStore } from '../server/store-memory.mjs';
import { clock, fakeCrm, silentLogger } from './helpers.mjs';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

async function setup() {
  const store = createMemoryStore();
  const crm = fakeCrm();
  const child = crm.addChild(8, 'misha.k', 'pass');
  await store.insertProfile({ childId: '8', nickname: 'КосмоКот83', firstAccessOn: '2026-11-02' });
  const time = clock();
  const sessions = createSessions({ store, crm: crm.crm, now: time.now, logger: silentLogger() });
  const { token, expiresAt } = await sessions.create({ childId: '8', tokenVersion: 1 });
  return { store, crm, child, time, sessions, token, expiresAt };
}

test('в базе только хэш токена; срок — 30 дней от входа', async () => {
  const { store, token, expiresAt, time } = await setup();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  const session = await store.findSession(hashToken(token));
  assert.notEqual(session.tokenHash, token);
  assert.equal(expiresAt - time.now(), SESSION_LIMITS.maxAgeMs);
  assert.equal(await store.findSession(token), null);
});

test('в течение минуты CRM не спрашиваем, позже — спрашиваем', async () => {
  const { sessions, token, time, crm } = await setup();
  assert.ok(await sessions.authenticate(token));
  time.advance(59_000);
  assert.ok(await sessions.authenticate(token));
  assert.equal(crm.calls.status.length, 0);
  time.advance(2_000);
  assert.ok(await sessions.authenticate(token));
  assert.equal(crm.calls.status.length, 1);
});

test('сброс пароля, отключение и удаление ребёнка закрывают сессии не позже чем через минуту', async () => {
  for (const change of [
    (child) => { child.tokenVersion += 1; },
    (child) => { child.canLogin = false; },
    (child) => { child.deleted = true; },
  ]) {
    const { sessions, token, time, child, store } = await setup();
    const second = (await sessions.create({ childId: '8', tokenVersion: 1 })).token;
    change(child);
    time.advance(SESSION_LIMITS.checkIntervalMs);
    assert.equal(await sessions.authenticate(token), null);
    // Закрыты все сессии ребёнка, а не только проверенная.
    assert.notEqual((await store.findSession(hashToken(second))).revokedAt, null);
    assert.equal(await sessions.authenticate(second), null);
  }
});

test('новый вход с новым паролем закрывает сессии со старой версией и не трогает новые', async () => {
  const { sessions, token, time, child, store } = await setup();
  child.tokenVersion = 2;
  const fresh = (await sessions.create({ childId: '8', tokenVersion: 2 })).token;
  assert.equal((await store.findSession(hashToken(token))).revokeReason, 'token_version');
  time.advance(SESSION_LIMITS.checkIntervalMs);
  assert.ok(await sessions.authenticate(fresh));
});

test('14 дней без активности и 30 дней всего — сессия истекает', async () => {
  const idle = await setup();
  idle.time.advance(SESSION_LIMITS.idleMs);
  assert.equal(await idle.sessions.authenticate(idle.token), null);
  assert.equal((await idle.store.findSession(hashToken(idle.token))).revokeReason, 'expired');

  const active = await setup();
  for (let day = 0; day < 29; day += 1) { active.time.advance(DAY); assert.ok(await active.sessions.authenticate(active.token)); }
  active.time.advance(DAY);
  assert.equal(await active.sessions.authenticate(active.token), null);
});

test('CRM недоступна: 10 минут от последней успешной проверки, без продления сроков', async () => {
  const { sessions, token, time, crm, store } = await setup();
  crm.state.unavailable = true;
  time.advance(5 * MINUTE);
  const graced = await sessions.authenticate(token);
  assert.equal(graced.grace, true);
  const stored = await store.findSession(hashToken(token));
  assert.equal(stored.lastSeenAt, stored.createdAt, 'в льготном окне активность не продлевается');
  assert.equal(stored.checkedAt, stored.createdAt);
  time.advance(5 * MINUTE);
  assert.ok(await sessions.authenticate(token));
  time.advance(1);
  await assert.rejects(sessions.authenticate(token), GameUnavailable);
  // CRM вернулась — сессия снова работает, проверка обновила отметки.
  crm.state.unavailable = false;
  assert.ok(await sessions.authenticate(token));
  assert.equal((await store.findSession(hashToken(token))).checkedAt, time.now());
});

test('льготное окно не продлевает сессию за пределы 14 дней без активности', async () => {
  const { sessions, token, time, crm } = await setup();
  time.advance(SESSION_LIMITS.idleMs - MINUTE);
  crm.state.unavailable = true;
  await assert.rejects(sessions.authenticate(token), GameUnavailable);
  time.advance(MINUTE);
  assert.equal(await sessions.authenticate(token), null);
});

test('одновременные запросы ребёнка ждут одну проверку статуса', async () => {
  const { sessions, token, time, crm } = await setup();
  time.advance(SESSION_LIMITS.checkIntervalMs);
  await Promise.all([...Array(5)].map(() => sessions.authenticate(token)));
  assert.equal(crm.calls.status.length, 1);
});

test('выход закрывает сессию; мусор вместо токена ничего не делает', async () => {
  const { sessions, token } = await setup();
  await sessions.revoke(token);
  assert.equal(await sessions.authenticate(token), null);
  for (const value of [null, '', 'x', `${token}x`, 'а'.repeat(43)]) assert.equal(await sessions.authenticate(value), null);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGameLoginGuard, GAME_LOGIN_LIMITS, normalizeClientIp } from '../backend/src/game-login-guard.mjs';
import { createLoginRateLimiter } from '../backend/src/login-rate-limit.mjs';

function setup(limits) {
  const clock = { time: 1_000_000 };
  const guard = createGameLoginGuard({ now: () => clock.time, ...(limits ? { limits: { ...GAME_LOGIN_LIMITS, ...limits } } : {}) });
  const fail = (ip, login, times = 1) => { for (let i = 0; i < times; i += 1) guard.failure(ip, login); };
  const blocked = (ip, login) => assert.throws(() => guard.assertAllowed(ip, login), (error) => error.status === 429 && error.code === 'LOGIN_RATE_LIMITED');
  const allowed = (ip, login) => assert.doesNotThrow(() => guard.assertAllowed(ip, login));
  return { clock, guard, fail, blocked, allowed };
}

test('пороги этапа теста: 5, 20, 50 за 15 минут', () => {
  assert.deepEqual([GAME_LOGIN_LIMITS.pairFailures, GAME_LOGIN_LIMITS.loginFailures, GAME_LOGIN_LIMITS.ipFailures], [5, 20, 50]);
  assert.equal(GAME_LOGIN_LIMITS.windowMs, 900_000);
});

test('пара IP и логин блокируется после 5 неудач и не мешает другим адресам', () => {
  const { fail, blocked, allowed, clock } = setup();
  fail('203.0.113.1', 'misha', 4); allowed('203.0.113.1', 'misha');
  fail('203.0.113.1', 'misha'); blocked('203.0.113.1', 'misha');
  allowed('203.0.113.2', 'misha');
  clock.time += GAME_LOGIN_LIMITS.blockMs; allowed('203.0.113.1', 'misha');
});

test('логин блокируется после 20 неудач с разных адресов для незнакомых адресов', () => {
  const { fail, blocked } = setup();
  for (let i = 0; i < 20; i += 1) fail(`198.51.100.${i + 1}`, 'misha');
  blocked('198.51.100.200', 'misha');
});

test('чужая атака с разных адресов не закрывает вход знакомому адресу ребёнка', () => {
  const { guard, fail, blocked, allowed } = setup();
  guard.success('203.0.113.7', 'misha');
  for (let i = 0; i < 40; i += 1) fail(`198.51.100.${i + 1}`, 'misha');
  blocked('198.51.100.200', 'misha');
  allowed('203.0.113.7', 'misha');
});

test('перебор по разным логинам с одного адреса блокируется на 50 неудачах, знакомые пары проходят', () => {
  const { guard, fail, blocked, allowed } = setup();
  guard.success('203.0.113.7', 'misha');
  for (let i = 0; i < 50; i += 1) fail('203.0.113.7', `login${i}`);
  blocked('203.0.113.7', 'new.login');
  blocked('203.0.113.7', null);
  allowed('203.0.113.7', 'misha');
});

test('знакомая пара всё равно ограничена своим счётчиком', () => {
  const { guard, fail, blocked } = setup();
  guard.success('203.0.113.7', 'misha');
  fail('203.0.113.7', 'misha', 5);
  blocked('203.0.113.7', 'misha');
});

test('знакомая пара истекает через 30 дней', () => {
  const { guard, fail, blocked, clock } = setup();
  guard.success('203.0.113.7', 'misha');
  clock.time += GAME_LOGIN_LIMITS.knownPairMs + 1;
  for (let i = 0; i < 20; i += 1) fail(`198.51.100.${i + 1}`, 'misha');
  blocked('203.0.113.7', 'misha');
});

test('разблокировка снимает счётчики логина и общий запрет адреса, но не чужих логинов', () => {
  const { guard, fail, blocked, allowed } = setup();
  fail('203.0.113.7', 'misha', 5);
  for (let i = 0; i < 50; i += 1) fail('203.0.113.7', `login${i}`);
  blocked('203.0.113.7', 'misha');
  guard.unlock('misha');
  allowed('203.0.113.7', 'misha');
  blocked('203.0.113.7', 'other');
});

test('счётчики не зависят от несуществующих логинов: блокировка не раскрывает существование', () => {
  const { fail, blocked } = setup();
  fail('203.0.113.1', 'nobody.here', 5);
  blocked('203.0.113.1', 'nobody.here');
});

test('размер таблиц ограничен', () => {
  const { guard, fail, allowed } = setup({ maxEntries: 3 });
  for (let i = 0; i < 10; i += 1) { fail('203.0.113.1', `login${i}`); guard.success('203.0.113.1', `login${i}`); }
  allowed('203.0.113.1', 'login9');
  fail('203.0.113.1', 'login0');
});

test('счётчики игры не пересекаются со взрослым входом', () => {
  const adult = createLoginRateLimiter();
  const { fail, blocked } = setup();
  fail('203.0.113.1', 'parent', 5);
  blocked('203.0.113.1', 'parent');
  assert.doesNotThrow(() => adult.assertAllowed('203.0.113.1', 'parent'));
});

test('адрес клиента: IPv4, отображённый IPv6 и сеть /64', () => {
  assert.equal(normalizeClientIp(' 203.0.113.5 '), '203.0.113.5');
  assert.equal(normalizeClientIp('::ffff:203.0.113.5'), '203.0.113.5');
  assert.equal(normalizeClientIp('::ffff:cb00:7105'), '203.0.113.5');
  assert.equal(normalizeClientIp('2001:db8:1:2:3:4:5:6'), '2001:0db8:0001:0002::/64');
  assert.equal(normalizeClientIp('2001:db8:1:2:ffff::9'), '2001:0db8:0001:0002::/64');
});

test('адрес клиента: loopback, пустой, зона IPv6 и список адресов отвергаются', () => {
  for (const value of [null, undefined, 5, '', ' ', 'unknown', '127.0.0.1', '127.8.8.8', '0.0.0.0', '::', '::1', '::ffff:127.0.0.1', '::ffff:7f00:1', 'fe80::1%eth0', '1.1.1.1,2.2.2.2', '999.1.1.1']) {
    assert.equal(normalizeClientIp(value), null, String(value));
  }
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadConfig } from '../backend/src/config.mjs';
import { createLoginGrants, LOGIN_GRANT_TTL_MS } from '../backend/src/game-login-grant.mjs';
import { createGameLoginGuard, GAME_LOGIN_LIMITS } from '../backend/src/game-login-guard.mjs';
import { director, gameFixture } from './helpers/game-access-fixture.mjs';

const KEY = 'grant-key-only-in-crm-0123456789abcdef';
const CLUB = '203.0.113.50';
const HOME = '198.51.100.7';

function setup() {
  let time = Date.UTC(2026, 10, 3, 1, 0, 0);
  const clock = { now: () => time, advance: (ms) => { time += ms; } };
  const guard = createGameLoginGuard({ now: clock.now });
  const f = gameFixture({ guard, loginGrantKey: KEY, now: clock.now });
  return { f, clock, guard };
}
async function withChild(setupResult, childId = 8, login = 'misha.k') {
  const { password } = await setupResult.f.gameAccess.create(childId, { login }, director);
  return password;
}
const verify = (f, login, password, clientIp, loginGrant) => f.gameAccess.verifyChild({ login, password, clientIp, loginGrant });
const outcome = (promise) => promise.then(() => 'OK', (error) => error.code);
const fail = async (f, login, clientIp, times, loginGrant) => { for (let i = 0; i < times; i += 1) await outcome(verify(f, login, 'wrong', clientIp, loginGrant)); };

test('разрешение выдаётся только после верного пароля и не содержит ключа', async () => {
  const s = setup();
  const password = await withChild(s);
  await assert.rejects(verify(s.f, 'misha.k', 'wrong', CLUB), (error) => error.code === 'INVALID_CREDENTIALS' && error.details === undefined);
  const result = await verify(s.f, 'misha.k', password, CLUB);
  assert.match(result.loginGrant, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
  assert.ok(!result.loginGrant.includes(KEY));
  assert.doesNotMatch(Buffer.from(result.loginGrant.split('.')[1], 'base64url').toString(), /grant-key/);
  // Каждый вход — новое разрешение с новым id.
  const again = await verify(s.f, 'misha.k', password, CLUB, result.loginGrant);
  assert.notEqual(again.loginGrant, result.loginGrant);
});

test('разрешение не заменяет пароль: с ним и без пароля — тот же отказ', async () => {
  const s = setup();
  const password = await withChild(s);
  const { loginGrant } = await verify(s.f, 'misha.k', password, CLUB);
  for (const value of ['', 'wrong', null]) {
    await assert.rejects(verify(s.f, 'misha.k', value, CLUB, loginGrant), (error) => error.status === 401 && error.code === 'INVALID_CREDENTIALS');
  }
});

test('сценарий A: одноклассник за тем же адресом не блокирует ребёнка с разрешением', async () => {
  const s = setup();
  const password = await withChild(s);
  const { loginGrant } = await verify(s.f, 'misha.k', password, CLUB);
  await fail(s.f, 'misha.k', CLUB, 30);
  assert.equal(await outcome(verify(s.f, 'misha.k', password, CLUB)), 'LOGIN_RATE_LIMITED', 'без разрешения защита этапа 2 осталась');
  assert.equal(await outcome(verify(s.f, 'misha.k', password, CLUB, loginGrant)), 'OK');
});

test('сценарий B: перебор логина с многих адресов не блокирует ребёнка с разрешением на новом адресе', async () => {
  const s = setup();
  const password = await withChild(s);
  const { loginGrant } = await verify(s.f, 'misha.k', password, HOME);
  for (let i = 1; i <= 60; i += 1) await fail(s.f, 'misha.k', `192.0.2.${i}`, 1);
  assert.equal(await outcome(verify(s.f, 'misha.k', password, CLUB)), 'LOGIN_RATE_LIMITED', 'неизвестный адрес без разрешения по-прежнему закрыт');
  assert.equal(await outcome(verify(s.f, 'misha.k', password, CLUB, loginGrant)), 'OK');
});

test('ошибки по одному разрешению закрывают только его: другие разрешения ребёнка работают (пункт 6)', async () => {
  const s = setup();
  const password = await withChild(s);
  const phone = (await verify(s.f, 'misha.k', password, HOME)).loginGrant;
  const laptop = (await verify(s.f, 'misha.k', password, HOME)).loginGrant;
  // Кто-то с украденной копией разрешения телефона перебирает пароль.
  await fail(s.f, 'misha.k', '192.0.2.200', GAME_LOGIN_LIMITS.grantFailures, phone);
  assert.equal(await outcome(verify(s.f, 'misha.k', password, '192.0.2.200', phone)), 'LOGIN_RATE_LIMITED');
  // Сколько бы украденных разрешений ни было закрыто, другое разрешение и знакомые адреса не страдают.
  assert.equal(await outcome(verify(s.f, 'misha.k', password, CLUB, laptop)), 'OK');
  assert.equal(await outcome(verify(s.f, 'misha.k', password, HOME)), 'OK');
});

test('перебор с украденным разрешением: 5 попыток за 15 минут, потом блок', async () => {
  const s = setup();
  const password = await withChild(s);
  const { loginGrant } = await verify(s.f, 'misha.k', password, HOME);
  await fail(s.f, 'misha.k', '192.0.2.9', 4, loginGrant);
  assert.equal(await outcome(verify(s.f, 'misha.k', 'wrong', '192.0.2.10', loginGrant)), 'INVALID_CREDENTIALS');
  assert.equal(await outcome(verify(s.f, 'misha.k', password, '192.0.2.11', loginGrant)), 'LOGIN_RATE_LIMITED', 'смена адреса не обходит счётчик разрешения');
  s.clock.advance(GAME_LOGIN_LIMITS.blockMs);
  assert.equal(await outcome(verify(s.f, 'misha.k', password, HOME, loginGrant)), 'OK');
});

test('одновременные попытки по одному разрешению не обходят счётчик', async () => {
  const s = setup();
  const password = await withChild(s);
  const { loginGrant } = await verify(s.f, 'misha.k', password, HOME);
  const results = await Promise.all([...Array(10)].map(() => outcome(verify(s.f, 'misha.k', 'wrong', HOME, loginGrant))));
  assert.equal(results.filter((code) => code === 'INVALID_CREDENTIALS').length, 1);
  assert.ok(results.filter((code) => code === 'GAME_LOGIN_BUSY').length >= 1);
});

test('подделка: изменённые данные, чужой ключ, чужой логин, истёкший срок — обычные лимиты', async () => {
  const s = setup();
  const password = await withChild(s);
  await withChild(s, 9, 'anya');
  const { loginGrant } = await verify(s.f, 'misha.k', password, HOME);
  const [version, payload, signature] = loginGrant.split('.');
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
  const forged = {
    'изменён id': `${version}.${Buffer.from(JSON.stringify({ ...data, g: 'A'.repeat(22) })).toString('base64url')}.${signature}`,
    'продлён срок': `${version}.${Buffer.from(JSON.stringify({ ...data, e: data.e + 1e12 })).toString('base64url')}.${signature}`,
    'чужой ключ': createLoginGrants({ key: 'x'.repeat(40), now: s.clock.now }).sign({ userId: data.u, login: 'misha.k', tokenVersion: data.t }),
    'обрезана подпись': `${version}.${payload}.${signature.slice(0, 20)}`,
    'мусор': 'v1.abc.def', 'не строка': { grant: loginGrant },
  };
  await fail(s.f, 'misha.k', CLUB, 30);
  for (const [name, value] of Object.entries(forged)) {
    assert.equal(await outcome(verify(s.f, 'misha.k', password, CLUB, value)), 'LOGIN_RATE_LIMITED', name);
  }
  // Разрешение Миши для логина Ани ничего не даёт.
  const grants = createLoginGrants({ key: KEY, now: s.clock.now });
  assert.equal(grants.read(loginGrant, 'anya'), null);
  assert.ok(grants.read(loginGrant, 'misha.k'));
  s.clock.advance(LOGIN_GRANT_TTL_MS);
  assert.equal(grants.read(loginGrant, 'misha.k'), null, 'истёкшее разрешение не принимается');
  await fail(s.f, 'misha.k', CLUB, 30);
  assert.equal(await outcome(verify(s.f, 'misha.k', password, CLUB, loginGrant)), 'LOGIN_RATE_LIMITED');
});

test('сброс пароля и отключение: старые разрешения не дают льгот, неудачи идут и в обычные счётчики', async () => {
  const s = setup();
  const first = await withChild(s);
  const { loginGrant } = await verify(s.f, 'misha.k', first, HOME);
  const { password: second } = await s.f.gameAccess.resetPassword(8, director);
  // Ребёнок с новым паролем входит и получает новое разрешение с новой версией.
  const renewed = await verify(s.f, 'misha.k', second, HOME, loginGrant);
  assert.ok(renewed.loginGrant);
  // Перебор со старым разрешением закрывает адрес как обычная неизвестная попытка.
  await fail(s.f, 'misha.k', '192.0.2.50', 5, loginGrant);
  assert.equal(await outcome(verify(s.f, 'misha.k', second, '192.0.2.50')), 'LOGIN_RATE_LIMITED');
  await s.f.gameAccess.disable(8, director);
  assert.equal(await outcome(verify(s.f, 'misha.k', second, HOME, renewed.loginGrant)), 'INVALID_CREDENTIALS');
  const { password: third } = await s.f.gameAccess.resetPassword(8, director);
  const grants = createLoginGrants({ key: KEY, now: s.clock.now });
  assert.ok(grants.read(renewed.loginGrant, 'misha.k').tokenVersion < 4, 'версия в старом разрешении ниже текущей');
  assert.equal(await outcome(verify(s.f, 'misha.k', third, HOME, renewed.loginGrant)), 'OK');
});

test('«Разблокировать вход» снимает и блок по разрешениям', async () => {
  const s = setup();
  const password = await withChild(s);
  const { loginGrant } = await verify(s.f, 'misha.k', password, HOME);
  await fail(s.f, 'misha.k', HOME, 5, loginGrant);
  assert.equal(await outcome(verify(s.f, 'misha.k', password, HOME, loginGrant)), 'LOGIN_RATE_LIMITED');
  await s.f.gameAccess.unlock(8, director);
  assert.equal(await outcome(verify(s.f, 'misha.k', password, HOME, loginGrant)), 'OK');
});

test('без ключа разрешения не выдаются и не принимаются: правила этапа 2', async () => {
  const f = gameFixture();
  const { password } = await f.gameAccess.create(8, { login: 'misha.k' }, director);
  const result = await verify(f, 'misha.k', password, HOME);
  assert.equal(result.loginGrant, undefined);
  const foreign = createLoginGrants({ key: KEY }).sign({ userId: result.userId, login: 'misha.k', tokenVersion: result.tokenVersion });
  for (let i = 0; i < 5; i += 1) await outcome(verify(f, 'misha.k', 'wrong', CLUB));
  assert.equal(await outcome(verify(f, 'misha.k', password, CLUB, foreign)), 'LOGIN_RATE_LIMITED');
});

test('ключ: только при включённой игре, не короче 32 символов и не равен секрету игры', () => {
  const base = { DB_HOST: 'localhost', DB_USER: 'u', DB_PASSWORD: 'p', APP_ENV: 'test', DB_NAME: 'icube_test' };
  const token = 'test-only-internal-token-0123456789abcdef';
  const on = { ...base, GAME_ENABLED: 'true', GAME_INTERNAL_TOKEN: token };
  assert.equal(loadConfig({ ...on, GAME_LOGIN_GRANT_KEY: KEY }).game.loginGrantKey, KEY);
  assert.equal(loadConfig({ ...base, GAME_LOGIN_GRANT_KEY: KEY }).game.loginGrantKey, null);
  for (const key of ['short', token, `replace_me${KEY}`, '']) assert.equal(loadConfig({ ...on, GAME_LOGIN_GRANT_KEY: key }).game.loginGrantKey, null, key);
});

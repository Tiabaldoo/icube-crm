// Сквозная проверка входа группы: игровой сервер этапа 3 → внутренний API CRM этапа 2
// с настоящей защитой входа (game-login-guard) и настоящим bcrypt в отдельном потоке.
// Тест лежит в tests/, потому что коду в game/ импортировать модули CRM запрещено.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { hashPassword } from '../backend/src/auth-service.mjs';
import { createInternalGameApp } from '../backend/src/game-internal.mjs';
import { createPasswordVerifier } from '../backend/src/game-password-verifier.mjs';
import { createGameApp } from '../game/server/app.mjs';
import { createCrmClient } from '../game/server/crm-client.mjs';
import { createLoginQueue } from '../game/server/login-queue.mjs';
import { createSessions } from '../game/server/sessions.mjs';
import { createMemoryStore } from '../game/server/store-memory.mjs';
import { director, gameFixture } from './helpers/game-access-fixture.mjs';

const TOKEN = 'i'.repeat(40);
const GRANT_KEY = 'g'.repeat(40);
const ORIGIN = 'https://game.example.test';
const CLUB_IP = '203.0.113.50';
const GROUP = 15;
const quiet = { log() {}, warn() {}, error() {} };

let crm; let game; let verifier; const passwords = new Map();
const listen = (app) => new Promise((resolve, reject) => { const server = app.listen(0, '127.0.0.1', (error) => (error ? reject(error) : resolve(server))); });
const close = (server) => new Promise((resolve) => server.close(resolve));

before(async () => {
  verifier = createPasswordVerifier();
  const fixture = gameFixture({ createPasswordHash: hashPassword, passwordVerifier: verifier, makePassword: undefined, loginGrantKey: GRANT_KEY });
  for (let index = 1; index <= GROUP; index += 1) fixture.state.children.push({ id: 100 + index, full_name: `Ребёнок ${index}`, status: 'active', deleted_at: null });
  for (let index = 1; index <= GROUP; index += 1) {
    const { password } = await fixture.gameAccess.create(100 + index, { login: `kid${index}` }, director);
    passwords.set(`kid${index}`, password);
  }
  crm = await listen(createInternalGameApp({ token: TOKEN, gameAccess: fixture.gameAccess }));
  const client = createCrmClient({ baseUrl: `http://127.0.0.1:${crm.address().port}`, token: TOKEN, logger: quiet });
  const store = createMemoryStore();
  const sessions = createSessions({ store, crm: client, logger: quiet });
  game = await listen(createGameApp({ config: { publicOrigin: ORIGIN, devClientIp: null }, store, crm: client, sessions, loginQueue: createLoginQueue(),
    // Звёзды здесь не проверяются: нагрузочный тест только про вход.
    stars: null, reconciler: { reconcileChild: async () => ({ status: 'skipped', added: 0 }) }, logger: quiet }));
});
after(async () => { await close(game); await close(crm); await verifier.close(); });

const grants = new Map();
const login = (name, password = passwords.get(name), { ip = CLUB_IP, grant = null } = {}) => fetch(`http://127.0.0.1:${game.address().port}/game/api/login`, {
  method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, 'x-real-ip': ip, ...(grant ? { cookie: grant } : {}) },
  body: JSON.stringify({ login: name, password }),
}).then(async (response) => {
  const grantCookie = response.headers.getSetCookie().find((value) => value.startsWith('icube_game_login_grant='))?.split(';')[0] ?? null;
  return { status: response.status, body: await response.json(), grant: grantCookie };
});

test(`${GROUP} одновременных первых входов с одного адреса проходят без повторов со стороны клиента`, { timeout: 60_000 }, async () => {
  const started = Date.now();
  const results = await Promise.all([...passwords.keys()].map((name) => login(name)));
  const seconds = (Date.now() - started) / 1000;
  assert.deepEqual(results.map((result) => result.status), Array(GROUP).fill(200), JSON.stringify(results.filter((r) => r.status !== 200)));
  assert.equal(new Set(results.map((result) => result.body.data.nickname.toLowerCase())).size, GROUP);
  [...passwords.keys()].forEach((name, index) => { assert.ok(results[index].grant, name); grants.set(name, results[index].grant); });
  console.log(`# ${GROUP} входов за ${seconds.toFixed(1)} с`);
});

test(`${GROUP} повторных входов с разрешениями с того же адреса тоже проходят`, { timeout: 60_000 }, async () => {
  const results = await Promise.all([...passwords.keys()].map((name) => login(name, undefined, { grant: grants.get(name) })));
  assert.deepEqual(results.map((result) => result.status), Array(GROUP).fill(200));
});

test('одноклассник за тем же адресом не закрывает вход ребёнку с разрешением; без разрешения защита этапа 2 на месте', { timeout: 60_000 }, async () => {
  for (let index = 0; index < 30; index += 1) await login('kid1', 'wrong-password');
  const newDevice = await login('kid1');
  assert.deepEqual([newDevice.status, newDevice.body.error?.code], [429, 'LOGIN_RATE_LIMITED']);
  // Верный пароль с разрешением проходит и, как любой успешный вход на этапе 2, обнуляет счётчик этой пары.
  const withGrant = await login('kid1', undefined, { grant: grants.get('kid1') });
  assert.equal(withGrant.status, 200);
  // Другие дети за тем же адресом входят: знакомые пары и разрешения не зависят от чужих ошибок.
  assert.equal((await login('kid2', undefined, { grant: grants.get('kid2') })).status, 200);
});

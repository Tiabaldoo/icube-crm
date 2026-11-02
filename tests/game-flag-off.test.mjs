import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { loadConfig } from '../backend/src/config.mjs';
import { createApp, startGameIfEnabled } from '../backend/src/server.mjs';
import { gameFixture, startCrm } from './helpers/game-access-fixture.mjs';

const database = { DB_HOST: 'localhost', DB_USER: 'u', DB_PASSWORD: 'p' };
const token = 'test-only-internal-token-0123456789abcdef';
const environment = (overrides) => ({ ...database, APP_ENV: 'test', DB_NAME: 'icube_test', ...overrides });
const enabled = { GAME_ENABLED: 'true', GAME_INTERNAL_TOKEN: token };

test('без настроек игра выключена', () => {
  assert.deepEqual(loadConfig(environment({})).game, { enabled: false, requested: false, internalToken: null, internalPort: 3001 });
});

test('включается только на test и development с полной настройкой', () => {
  const config = loadConfig(environment(enabled));
  assert.equal(config.game.enabled, true); assert.equal(config.game.internalToken, token);
  assert.equal(loadConfig({ ...database, APP_ENV: 'development', DB_NAME: 'icube_dev', ...enabled }).game.enabled, true);
});

test('на production игра закрыта при любых настройках', () => {
  const config = loadConfig({ ...database, APP_ENV: 'production', DB_NAME: 'icube_prod', ...enabled, GAME_INTERNAL_PORT: '3055' });
  assert.equal(config.game.enabled, false); assert.equal(config.game.internalToken, null); assert.equal(config.game.requested, true);
});

test('неполная настройка не роняет CRM и оставляет игру выключенной', () => {
  for (const overrides of [
    { GAME_ENABLED: 'true' }, { GAME_ENABLED: 'true', GAME_INTERNAL_TOKEN: 'short' }, { GAME_ENABLED: 'yes', GAME_INTERNAL_TOKEN: token },
    { GAME_ENABLED: 'true', GAME_INTERNAL_TOKEN: `replace_me${token}` }, { ...enabled, GAME_INTERNAL_PORT: 'abc' },
    { ...enabled, GAME_INTERNAL_PORT: '3000' }, { ...enabled, GAME_INTERNAL_PORT: '70000' },
  ]) assert.equal(loadConfig(environment(overrides)).game.enabled, false, JSON.stringify(overrides));
});

test('пример настроек production не содержит переменных игры', () => {
  assert.doesNotMatch(readFileSync(new URL('../.env.production.example', import.meta.url), 'utf8'), /GAME_/);
  assert.match(readFileSync(new URL('../.env.test.example', import.meta.url), 'utf8'), /^GAME_ENABLED=false$/m);
});

test('при выключенном флаге внутренний сервер не запускается', () => {
  const logger = { log() {}, error() { throw new Error('лишняя ошибка'); } };
  const server = startGameIfEnabled({ config: loadConfig(environment({})), gameAccess: null, logger });
  server?.close();
  assert.equal(server, null);
});

test('запрошенная, но запрещённая игра не запускается и сообщает об этом', () => {
  const errors = [];
  const config = loadConfig({ ...database, APP_ENV: 'production', DB_NAME: 'icube_prod', ...enabled });
  const server = startGameIfEnabled({ config, gameAccess: null, logger: { log() {}, error: (text) => errors.push(text) } });
  server?.close();
  assert.equal(server, null);
  assert.equal(errors.length, 1);
});

test('приложение CRM без блока game собирается как раньше, сервис игры не создаётся', () => {
  const app = createApp({ config: { trustProxy: 1, receipts: {}, photos: {}, parent: {}, push: {} }, pool: {} });
  assert.equal(app.locals.gameAccess, null);
  const off = createApp({ config: loadConfig(environment({ PHOTO_STORAGE_DIR: 'x' })), pool: {} });
  assert.equal(off.locals.gameAccess, null);
});

const off = gameFixture(); const on = gameFixture();
let crmOff; let crmOn;
before(async () => { crmOff = await startCrm(off, { gameAccess: null }); crmOn = await startCrm(on); });
after(async () => { await crmOff.close(); await crmOn.close(); });

const request = (base, path, { method = 'GET', body, cookie } = {}) => fetch(`${base}${path}`, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });

async function adultFlow(base) {
  const login = await request(base, '/auth/login', { method: 'POST', body: { login: 'parent@example.com', password: 'parent-pass' } });
  const setCookie = login.headers.get('set-cookie');
  const me = await request(base, '/auth/me', { cookie: setCookie.split(';')[0] });
  const wrong = await request(base, '/auth/login', { method: 'POST', body: { login: 'parent@example.com', password: 'wrong' } });
  return {
    loginStatus: login.status, loginBody: await login.json(), cookie: setCookie.replace(/token-\d+/, 'token').replace(/Expires=[^;]+/, ''),
    meStatus: me.status, meBody: await me.json(), wrongStatus: wrong.status, wrongBody: await wrong.json(),
  };
}

test('взрослый вход и /auth/me одинаковы при выключенном и включённом флаге', async () => {
  assert.deepEqual(await adultFlow(crmOn.baseUrl), await adultFlow(crmOff.baseUrl));
});

test('при выключенном флаге маршруты игры отвечают как неизвестные, без кода ошибки API', async () => {
  const login = await request(crmOff.baseUrl, '/auth/login', { method: 'POST', body: { login: 'director@example.com', password: 'director-pass' } });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const unknown = await request(crmOff.baseUrl, '/children/8/no-such-route', { cookie });
  assert.equal(unknown.status, 404);
  for (const [path, method] of [['/children/8/game-access', 'GET'], ['/children/8/game-access', 'POST'], ['/children/8/game-access', 'DELETE'], ['/children/8/game-access/reset-password', 'POST'], ['/children/8/game-access/unlock', 'POST']]) {
    const response = await request(crmOff.baseUrl, path, { method, cookie });
    assert.equal(response.status, 404, path);
    assert.equal((await response.text()).includes('"code"'), false);
  }
  assert.equal((await request(crmOff.baseUrl, '/children/8/game-access')).status, 401);
});

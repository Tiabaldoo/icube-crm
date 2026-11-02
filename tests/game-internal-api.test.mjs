import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { after, before, test } from 'node:test';
import { createInternalGameApp, isLoopbackAddress, startInternalGameServer } from '../backend/src/game-internal.mjs';
import { director, gameFixture } from './helpers/game-access-fixture.mjs';

const token = 'test-only-internal-token-0123456789abcdef';
const fixture = gameFixture();
const silent = { log() {}, error() {} };
let server; let baseUrl; let password;

before(async () => {
  ({ password } = await fixture.gameAccess.create(8, { login: 'misha.k' }, director));
  server = startInternalGameServer({ app: createInternalGameApp({ token, gameAccess: fixture.gameAccess }), port: 0, logger: silent });
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));

const call = (path, { secret = token, body, headers = {} } = {}) => fetch(`${baseUrl}${path}`, {
  method: body ? 'POST' : 'GET',
  headers: { ...(secret ? { 'x-game-internal-token': secret } : {}), ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
  body: body ? JSON.stringify(body) : undefined,
});
const verifyPath = '/internal/game/verify-child';
const statusPath = '/internal/game/children/8/status';

test('сервер слушает только 127.0.0.1', () => {
  assert.equal(server.address().address, '127.0.0.1');
});

test('без секрета и с неверным секретом ответ 404, одинаковый с неизвестным путём', async () => {
  const unknown = await (await call('/internal/game/unknown')).text();
  for (const secret of [null, 'wrong', `${token}x`, token.slice(0, -1)]) {
    for (const response of [await call(statusPath, { secret }), await call(verifyPath, { secret, body: { login: 'misha.k', password, clientIp: '203.0.113.5' } })]) {
      assert.equal(response.status, 404);
      assert.equal(await response.text(), unknown);
    }
  }
});

test('нелокальный адрес не принимается даже с секретом', async () => {
  for (const address of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) assert.equal(isLoopbackAddress(address), true);
  for (const address of ['203.0.113.5', '10.0.0.1', '::ffff:10.0.0.1', undefined]) assert.equal(isLoopbackAddress(address), false);
  const remote = startInternalGameServer({ app: createInternalGameApp({ token, gameAccess: fixture.gameAccess, isAllowedPeer: () => false }), port: 0, logger: silent });
  await once(remote, 'listening');
  try {
    const response = await fetch(`http://127.0.0.1:${remote.address().port}${statusPath}`, { headers: { 'x-game-internal-token': token } });
    assert.equal(response.status, 404);
  } finally { await new Promise((resolve) => remote.close(resolve)); }
});

test('неверный секрет с плохим телом даёт 404: тело не разбирается до проверки', async () => {
  const response = await fetch(`${baseUrl}${verifyPath}`, { method: 'POST', headers: { 'x-game-internal-token': 'wrong', 'content-type': 'application/json' }, body: '{broken' });
  assert.equal(response.status, 404);
});

test('verify-child и status отвечают по секрету', async () => {
  const verified = await call(verifyPath, { body: { login: 'misha.k', password, clientIp: '203.0.113.5' } });
  assert.equal(verified.status, 200);
  assert.deepEqual((await verified.json()).data, { childId: '8', userId: '100', displayName: 'Миша Ковалёв', tokenVersion: 1, firstAccessOn: '2026-11-02' });
  const status = await call(statusPath);
  assert.equal((await status.json()).data.canLogin, true);
});

test('заголовки прокси игнорируются: адрес берётся только из тела', async () => {
  const spoofed = { 'x-forwarded-for': '203.0.113.9', 'x-real-ip': '203.0.113.9' };
  const errors = console.error; console.error = () => {};
  try {
    const response = await call(verifyPath, { body: { login: 'misha.k', password }, headers: spoofed });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'INVALID_CLIENT_IP');
  } finally { console.error = errors; }
});

test('сервис посещений и других данных не открыт, только два метода', async () => {
  for (const path of ['/internal/game/children/8/qualifying-attendance', '/internal/game/children?ids=8', '/api/v1/auth/me', '/internal/game/children/8']) {
    assert.equal((await call(path)).status, 404, path);
  }
});

test('большое и неверное тело не раскрывает пароль в ответе', async () => {
  const broken = await fetch(`${baseUrl}${verifyPath}`, { method: 'POST', headers: { 'x-game-internal-token': token, 'content-type': 'application/json' }, body: '{"password":"secret-text"' });
  assert.equal(broken.status, 400);
  assert.doesNotMatch(await broken.text(), /secret-text/);
  for (const body of ['{"login":"misha.k","password":kot-luna-reka-dom-47}', 'kot-luna-reka-dom-47', '"kot-luna']) {
    const leaked = await fetch(`${baseUrl}${verifyPath}`, { method: 'POST', headers: { 'x-game-internal-token': token, 'content-type': 'application/json' }, body });
    assert.equal(leaked.status, 400);
    const text = await leaked.text();
    assert.doesNotMatch(text, /kot|luna/);
    assert.equal(JSON.parse(text).error.code, 'INVALID_REQUEST');
  }
  const large = await fetch(`${baseUrl}${verifyPath}`, { method: 'POST', headers: { 'x-game-internal-token': token, 'content-type': 'application/json' }, body: JSON.stringify({ login: 'x'.repeat(10_000) }) });
  assert.equal(large.status, 413);
});

test('занятый порт не роняет процесс: ошибка только логируется', async () => {
  const busy = createServer().listen(0, '127.0.0.1');
  await once(busy, 'listening');
  const errors = [];
  const failed = startInternalGameServer({ app: createInternalGameApp({ token, gameAccess: fixture.gameAccess }), port: busy.address().port, logger: { log() {}, error: (text) => errors.push(text) } });
  await once(failed, 'error');
  assert.match(errors[0], /EADDRINUSE/);
  await new Promise((resolve) => busy.close(resolve));
});

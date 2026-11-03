import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import express from 'express';
import { createCrmClient } from '../server/crm-client.mjs';
import { silentLogger, TOKEN } from './helpers.mjs';

let server; let baseUrl; const seen = [];
before(async () => {
  const app = express(); app.use(express.json());
  app.use((request, response, next) => { seen.push({ path: request.path, token: request.get('x-game-internal-token'), body: request.body }); next(); });
  app.post('/internal/game/verify-child', (request, response) => {
    const { login } = request.body;
    if (login === 'ok') return response.json({ data: { childId: '8', userId: '100', tokenVersion: 1, firstAccessOn: '2026-11-02' } });
    if (login === 'busy') return response.status(429).json({ error: { code: 'GAME_LOGIN_BUSY' } });
    if (login === 'down') return response.status(503).json({ error: { code: 'GAME_LOGIN_UNAVAILABLE' } });
    if (login === 'slow') return setTimeout(() => response.json({ data: {} }), 300);
    if (login === 'html') return response.status(502).send('<html>');
    return response.status(401).json({ error: { code: 'INVALID_CREDENTIALS' } });
  });
  app.get('/internal/game/children/:id/status', (request, response) => response.json({ data: { exists: true, id: request.params.id } }));
  app.get('/internal/game/children/:id/qualifying-attendance', (request, response) => response.json({ data: { exists: true, attendances: [], id: request.params.id } }));
  app.get('/internal/game/children', (request, response) => response.json({ data: { ids: request.query.ids } }));
  app.use((_request, response) => response.status(404).json({ error: { code: 'NOT_FOUND' } }));
  server = await new Promise((resolve) => { const value = app.listen(0, '127.0.0.1', () => resolve(value)); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));

const client = (options = {}) => createCrmClient({ baseUrl, token: TOKEN, logger: silentLogger(), ...options });

test('секрет в заголовке, адрес ребёнка в теле', async () => {
  const result = await client().verifyChild({ login: 'ok', password: 'p', clientIp: '203.0.113.1' });
  assert.deepEqual(result, { ok: true, data: { childId: '8', userId: '100', tokenVersion: 1, firstAccessOn: '2026-11-02' } });
  assert.equal(seen.at(-1).token, TOKEN);
  assert.deepEqual(seen.at(-1).body, { login: 'ok', password: 'p', clientIp: '203.0.113.1' });
});

test('отказы CRM передаются кодом, сбои — как недоступность', async () => {
  assert.deepEqual(await client().verifyChild({ login: 'bad' }), { ok: false, status: 401, code: 'INVALID_CREDENTIALS' });
  assert.deepEqual(await client().verifyChild({ login: 'busy' }), { ok: false, status: 429, code: 'GAME_LOGIN_BUSY' });
  assert.deepEqual(await client().verifyChild({ login: 'down' }), { ok: false, unavailable: true, reason: 'http_503' });
  assert.deepEqual(await client().verifyChild({ login: 'html' }), { ok: false, unavailable: true, reason: 'http_502' });
  assert.deepEqual(await client({ verifyTimeoutMs: 50 }).verifyChild({ login: 'slow' }), { ok: false, unavailable: true, reason: 'timeout' });
  assert.deepEqual(await createCrmClient({ baseUrl: 'http://127.0.0.1:1', token: TOKEN }).status('8'), { ok: false, unavailable: true, reason: 'network' });
});

test('404 — ошибка настройки (флаг или секрет), а не отказ ребёнку', async () => {
  const logger = silentLogger();
  assert.deepEqual(await createCrmClient({ baseUrl: `${baseUrl}/wrong`, token: TOKEN, logger }).status('8'), { ok: false, unavailable: true, reason: 'not_found' });
  assert.match(logger.lines.join('\n'), /GAME_INTERNAL_TOKEN/);
});

test('id ребёнка экранируется в пути', async () => {
  const result = await client().status('8/../../x');
  assert.equal(result.ok, true);
  assert.equal(result.data.id, '8/../../x');
});

test('этап 4: посещения ребёнка и статусы пачки — те же секрет и разбор ответа', async () => {
  const attendance = await client().qualifyingAttendance('8');
  assert.deepEqual(attendance, { ok: true, data: { exists: true, attendances: [], id: '8' } });
  assert.equal(seen.at(-1).token, TOKEN);
  assert.deepEqual(await client().childrenStatus(['3', '8']), { ok: true, data: { ids: '3,8' } });
  assert.equal((await createCrmClient({ baseUrl: 'http://127.0.0.1:9', token: TOKEN, logger: silentLogger() }).qualifyingAttendance('8')).unavailable, true);
});

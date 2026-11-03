import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMemoryStore } from '../server/store-memory.mjs';
import { hashToken, SESSION_LIMITS } from '../server/sessions.mjs';
import { CHILD_IP, fakeCrm, request, sessionCookie, silentLogger, startGame } from './helpers.mjs';

async function withGame(run, options = {}) {
  const crm = fakeCrm();
  crm.addChild(8, 'misha.k', 'kot-luna-reka-dom-47');
  crm.addChild(9, 'anya', 'les-more-sad-kit-12');
  const game = await startGame({ crm: crm.crm, ...options });
  try { await run({ game, crm }); } finally { await game.close(); }
}
const login = (game, body = { login: 'misha.k', password: 'kot-luna-reka-dom-47' }, options = {}) => request(game, '/game/api/login', { method: 'POST', body, ...options });

test('вход: cookie сессии httpOnly, Secure, SameSite=Strict, Path=/game, на 30 дней; в ответе только ник', () => withGame(async ({ game, crm }) => {
  const response = await login(game);
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(response.json.data), ['nickname']);
  assert.match(response.json.data.nickname, /^[А-ЯЁа-яё]+\d+$/u);
  const line = response.setCookie.find((value) => value.startsWith('icube_game_session='));
  assert.match(line, /HttpOnly/); assert.match(line, /Secure/); assert.match(line, /SameSite=Strict/); assert.match(line, /Path=\/game(;|$)/);
  assert.match(line, new RegExp(`Max-Age=${SESSION_LIMITS.maxAgeMs / 1000}`));
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(crm.calls.verify[0], { login: 'misha.k', password: 'kot-luna-reka-dom-47', clientIp: CHILD_IP });
  const me = await request(game, '/game/api/me', { cookie: sessionCookie(response.setCookie) });
  assert.deepEqual(me.json, { data: { nickname: response.json.data.nickname } });
}));

test('повторный вход того же ребёнка — тот же профиль и ник, второе устройство работает параллельно', () => withGame(async ({ game }) => {
  const first = await login(game);
  const second = await login(game, undefined, { ip: '198.51.100.20' });
  assert.equal(first.json.data.nickname, second.json.data.nickname);
  assert.equal((await request(game, '/game/api/me', { cookie: sessionCookie(first.setCookie) })).status, 200);
  assert.equal((await request(game, '/game/api/me', { cookie: sessionCookie(second.setCookie) })).status, 200);
}));

test('неверный пароль — 401 без cookie; разные дети получают разные ники', () => withGame(async ({ game }) => {
  const wrong = await login(game, { login: 'misha.k', password: 'nope' });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.json.error.code, 'INVALID_CREDENTIALS');
  assert.equal(sessionCookie(wrong.setCookie), null);
  const misha = await login(game);
  const anya = await login(game, { login: 'anya', password: 'les-more-sad-kit-12' });
  assert.notEqual(misha.json.data.nickname.toLowerCase(), anya.json.data.nickname.toLowerCase());
}));

test('CSRF: без Origin, с чужим Origin и не JSON — отказ, CRM не вызывается', () => withGame(async ({ game, crm }) => {
  assert.equal((await login(game, undefined, { origin: null })).status, 403);
  assert.equal((await login(game, undefined, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await login(game, 'login=misha.k', { contentType: 'text/plain' })).status, 415);
  assert.equal((await login(game, 'login=misha.k', { contentType: 'application/x-www-form-urlencoded' })).status, 415);
  const cookie = sessionCookie((await login(game)).setCookie);
  assert.equal((await request(game, '/game/api/logout', { method: 'POST', body: {}, cookie, origin: 'https://evil.example' })).status, 403);
  assert.equal((await request(game, '/game/api/me', { cookie })).status, 200, 'чужой сайт не может разлогинить');
  assert.equal(crm.calls.verify.length, 1);
}));

test('адрес ребёнка: без X-Real-IP вход закрыт, X-Forwarded-For не используется', () => withGame(async ({ game, crm }) => {
  const missing = await login(game, undefined, { ip: null, headers: { 'x-forwarded-for': '203.0.113.99' } });
  assert.equal(missing.status, 503);
  assert.equal(crm.calls.verify.length, 0);
  assert.match(game.logger.lines.join('\n'), /X-Real-IP/);
}));

test('тело запроса: неверные поля и слишком большое тело — 400 без текста запроса', () => withGame(async ({ game, crm }) => {
  for (const body of [{}, { login: 'misha.k' }, { login: 1, password: 'x' }, { login: ' ', password: 'x' }, { login: 'misha.k', password: 'x'.repeat(129) }]) {
    assert.equal((await login(game, body)).status, 400, JSON.stringify(body).slice(0, 40));
  }
  const huge = await login(game, { login: 'misha.k', password: 'secret-password', pad: 'x'.repeat(4000) });
  assert.equal(huge.status, 413);
  assert.doesNotMatch(huge.text, /secret-password/);
  const broken = await login(game, '{"login":"misha.k","password":"secret-password"');
  assert.equal(broken.status, 400);
  assert.doesNotMatch(broken.text, /secret-password/);
  assert.equal(crm.calls.verify.length, 0);
}));

test('выход: сессия закрыта в базе, cookie удалён, старый cookie больше не работает', () => withGame(async ({ game }) => {
  const cookie = sessionCookie((await login(game)).setCookie);
  const out = await request(game, '/game/api/logout', { method: 'POST', body: {}, cookie });
  assert.equal(out.status, 204);
  assert.ok(out.setCookie.some((value) => value.startsWith('icube_game_session=;') && /Path=\/game/.test(value)));
  const token = cookie.split('=')[1];
  assert.equal((await game.store.findSession(hashToken(token))).revokeReason, 'logout');
  assert.equal((await request(game, '/game/api/me', { cookie })).status, 401);
}));

test('вход другого ребёнка в том же браузере закрывает прежнюю сессию', () => withGame(async ({ game }) => {
  const misha = sessionCookie((await login(game)).setCookie);
  const anya = await login(game, { login: 'anya', password: 'les-more-sad-kit-12' }, { cookie: misha });
  assert.equal(anya.status, 200);
  assert.equal((await request(game, '/game/api/me', { cookie: misha })).status, 401);
  // Даже неудачная попытка входа закрывает прежнюю сессию этого браузера.
  const annaCookie = sessionCookie(anya.setCookie);
  assert.equal((await login(game, { login: 'misha.k', password: 'wrong' }, { cookie: annaCookie })).status, 401);
  assert.equal((await request(game, '/game/api/me', { cookie: annaCookie })).status, 401);
}));

test('/me: без сессии 401 и cookie стирается; сброс пароля в CRM выкидывает не позже чем через минуту', () => withGame(async ({ game, crm }) => {
  assert.equal((await request(game, '/game/api/me')).status, 401);
  const cookie = sessionCookie((await login(game)).setCookie);
  crm.children.get('8').tokenVersion = 2;
  assert.equal((await request(game, '/game/api/me', { cookie })).status, 200);
  game.time.advance(SESSION_LIMITS.checkIntervalMs);
  const expired = await request(game, '/game/api/me', { cookie });
  assert.equal(expired.status, 401);
  assert.ok(expired.setCookie.some((value) => value.startsWith('icube_game_session=;')));
}));

test('CRM недоступна: вход 503, открытая сессия живёт 10 минут, потом 503', () => withGame(async ({ game, crm }) => {
  const cookie = sessionCookie((await login(game)).setCookie);
  crm.state.unavailable = true;
  assert.equal((await login(game, { login: 'anya', password: 'les-more-sad-kit-12' })).status, 503);
  game.time.advance(SESSION_LIMITS.graceMs);
  assert.equal((await request(game, '/game/api/me', { cookie })).status, 200);
  game.time.advance(1);
  const down = await request(game, '/game/api/me', { cookie });
  assert.equal(down.status, 503);
  assert.equal(down.json.error.code, 'GAME_UNAVAILABLE');
}));

test('GAME_LOGIN_BUSY от CRM сервер повторяет сам; если не помогло — 429 для повтора клиентом', () => withGame(async ({ game, crm }) => {
  crm.state.busyLeft = 2;
  assert.equal((await login(game)).status, 200);
  crm.state.busyLeft = 10;
  const busy = await login(game);
  assert.equal(busy.status, 429);
  assert.equal(busy.json.error.code, 'GAME_LOGIN_BUSY');
}));

test('health отвечает без подробностей; сбой базы — 503', async () => {
  await withGame(async ({ game }) => {
    const health = await request(game, '/game/api/health');
    assert.deepEqual([health.status, health.json], [200, { status: 'ok' }]);
  });
  const store = createMemoryStore();
  store.ping = async () => { throw Object.assign(new Error('ECONNREFUSED 10.0.0.1'), { code: 'ECONNREFUSED' }); };
  await withGame(async ({ game }) => {
    const health = await request(game, '/game/api/health');
    assert.deepEqual([health.status, health.json], [503, { status: 'unavailable' }]);
  }, { store });
});

test('страница игры: CSP без inline-скриптов, запрет встраивания, неизвестный маршрут API — 404', () => withGame(async ({ game }) => {
  const page = await request(game, '/game/', { ip: null });
  assert.equal(page.status, 200);
  assert.match(page.text, /Остров чудиков/);
  const csp = page.headers.get('content-security-policy');
  assert.match(csp, /script-src 'self'/); assert.match(csp, /frame-ancestors 'none'/); assert.doesNotMatch(csp, /unsafe-inline/);
  assert.equal(page.headers.get('x-powered-by'), null);
  assert.equal((await request(game, '/game/api/unknown')).status, 404);
  assert.equal((await request(game, '/api/v1/auth/me')).status, 404);
}));

test('пароль не попадает в журнал даже при сбое', () => withGame(async ({ game, crm }) => {
  crm.crm.verifyChild = async () => { throw new Error('boom'); };
  assert.equal((await login(game)).status, 500);
  assert.doesNotMatch(game.logger.lines.join('\n'), /kot-luna-reka-dom-47/);
}, { logger: silentLogger() }));

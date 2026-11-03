import { createGameApp } from '../server/app.mjs';
import { createLoginQueue } from '../server/login-queue.mjs';
import { createReconciler } from '../server/reconciler.mjs';
import { createSessions } from '../server/sessions.mjs';
import { createStars } from '../server/stars.mjs';
import { createMemoryStore } from '../server/store-memory.mjs';

export const ORIGIN = 'https://game.example.test';
export const CHILD_IP = '203.0.113.7';
export const TOKEN = 't'.repeat(40);

export const baseEnv = (extra = {}) => ({
  APP_ENV: 'test', GAME_DB_HOST: '127.0.0.1', GAME_DB_NAME: 'icube_game_test', GAME_DB_USER: 'icube_game_test_app',
  GAME_DB_PASSWORD: 'secret', GAME_INTERNAL_TOKEN: TOKEN, GAME_PUBLIC_ORIGIN: ORIGIN, ...extra,
});

export const silentLogger = () => {
  const lines = [];
  const push = (...args) => lines.push(args.join(' '));
  return { lines, log: push, warn: push, error: push };
};

// Поддельный внутренний API CRM: дети, пароли и статусы задаются в тесте.
export function fakeCrm() {
  const children = new Map();
  const calls = { verify: [], status: [], attendance: [], batch: [] };
  const state = { unavailable: false, busyLeft: 0, grants: 0, attendanceUnavailable: false };
  const crm = {
    async verifyChild(body) {
      calls.verify.push(body);
      if (state.unavailable) return { ok: false, unavailable: true, reason: 'network' };
      if (state.busyLeft > 0) { state.busyLeft -= 1; return { ok: false, status: 429, code: 'GAME_LOGIN_BUSY' }; }
      const child = [...children.values()].find((item) => item.login === body.login);
      if (!child || child.password !== body.password || !child.canLogin) return { ok: false, status: 401, code: 'INVALID_CREDENTIALS' };
      state.grants += 1;
      return { ok: true, data: { childId: child.childId, userId: `u${child.childId}`, tokenVersion: child.tokenVersion, firstAccessOn: child.firstAccessOn, loginGrant: `v1.grant${state.grants}.sig` } };
    },
    async status(childId) {
      calls.status.push(childId);
      if (state.unavailable) return { ok: false, unavailable: true, reason: 'network' };
      const child = children.get(String(childId));
      if (!child || child.deleted) return { ok: true, data: { exists: false, canLogin: false, tokenVersion: null, status: null, firstAccessOn: null } };
      return { ok: true, data: { exists: true, canLogin: child.canLogin, tokenVersion: child.tokenVersion, status: 'active', firstAccessOn: child.firstAccessOn } };
    },
    // Засчитанные посещения ребёнка: child.attendances — как их отдаёт CRM.
    async qualifyingAttendance(childId) {
      calls.attendance.push(String(childId));
      if (state.unavailable || state.attendanceUnavailable) return { ok: false, unavailable: true, reason: 'network' };
      const child = children.get(String(childId));
      if (!child || child.deleted) return { ok: true, data: { exists: false, attendances: [] } };
      return { ok: true, data: { exists: true, attendances: child.attendances.map((item) => ({ ...item })) } };
    },
    async childrenStatus(ids) {
      calls.batch.push(ids);
      if (state.unavailable) return { ok: false, unavailable: true, reason: 'network' };
      return { ok: true, data: { children: ids.map((id) => {
        const child = children.get(String(id));
        return child && !child.deleted ? { childId: String(id), exists: true, status: 'active' } : { childId: String(id), exists: false, status: null };
      }) } };
    },
  };
  const addChild = (childId, login, password, extra = {}) => {
    const child = { childId: String(childId), login, password, tokenVersion: 1, canLogin: true, firstAccessOn: '2026-11-02', deleted: false, attendances: [], ...extra };
    children.set(String(childId), child);
    return child;
  };
  return { crm, calls, state, addChild, children };
}

// Посещение в формате ответа CRM. Дата занятия — по Сахалину (+11:00).
export const visit = (attendanceId, lessonDate, { trial = false, intro = false, hour = 10 } = {}) => ({
  attendanceId: String(attendanceId), lessonId: String(1000 + Number(attendanceId)), lessonDate,
  startsAt: `${lessonDate}T${String(hour).padStart(2, '0')}:00:00+11:00`, attendanceType: 'main', isTrial: trial, isIntroLesson: intro,
});

export function clock(start = Date.UTC(2026, 10, 3, 1, 0, 0)) {
  let value = start;
  return { now: () => value, advance: (ms) => { value += ms; return value; } };
}

export async function startGame({ crm, store = createMemoryStore(), time = clock(), config = {}, logger = silentLogger(), queue = createLoginQueue(), busyDelay = () => 1 } = {}) {
  const sessions = createSessions({ store, crm, now: time.now, logger });
  const stars = createStars({ store, crm, now: time.now, logger });
  const reconciler = createReconciler({ store, crm, stars, now: time.now, logger });
  const app = createGameApp({ config: { publicOrigin: ORIGIN, devClientIp: null, ...config }, store, crm, sessions, loginQueue: queue, stars, reconciler, logger, busyDelay });
  const server = await new Promise((resolve, reject) => { const value = app.listen(0, '127.0.0.1', (error) => (error ? reject(error) : resolve(value))); });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  return { server, baseUrl, store, sessions, stars, reconciler, time, logger, close: () => new Promise((resolve) => server.close(resolve)) };
}

export async function request(game, path, { method = 'GET', body, cookie, origin = ORIGIN, ip = CHILD_IP, contentType = 'application/json', headers = {} } = {}) {
  const response = await fetch(`${game.baseUrl}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': contentType } : {}),
      ...(origin ? { origin } : {}), ...(ip ? { 'x-real-ip': ip } : {}), ...(cookie ? { cookie } : {}), ...headers,
    },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* не JSON */ }
  return { status: response.status, headers: response.headers, json, text, setCookie: response.headers.getSetCookie() };
}

export const sessionCookie = (setCookie) => {
  const line = setCookie.find((value) => value.startsWith('icube_game_session=') && !value.startsWith('icube_game_session=;'));
  return line ? line.split(';')[0] : null;
};

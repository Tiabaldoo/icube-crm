import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import { LoginQueueFull } from './login-queue.mjs';
import { ensureProfile } from './profiles.mjs';
import { GameUnavailable } from './sessions.mjs';
import { StarProblem } from './star-errors.mjs';

export const SESSION_COOKIE = 'icube_game_session';
// Разрешение на вход от CRM: не даёт доступа, только защищает вход ребёнка от чужих ошибок.
// Браузер отправляет его только на адрес входа.
export const LOGIN_GRANT_COOKIE = 'icube_game_login_grant';
const LOGIN_GRANT_PATH = '/game/api/login';
const LOGIN_GRANT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const LOGIN_GRANT_PATTERN = /^[A-Za-z0-9._-]{1,512}$/;
export const CLIENT_DIRECTORY = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'client');
const COOKIE_PATH = '/game';
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const MAX_LOGIN_LENGTH = 64;
const MAX_PASSWORD_LENGTH = 128;
const BUSY_RETRIES = 3;

class Problem extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const problems = {
  unavailable: () => new Problem(503, 'GAME_UNAVAILABLE', 'Игра временно недоступна. Попробуй позже'),
  loginUnavailable: () => new Problem(503, 'GAME_LOGIN_UNAVAILABLE', 'Вход временно недоступен. Попробуй позже'),
  busy: () => new Problem(429, 'GAME_LOGIN_BUSY', 'Входим… Подожди несколько секунд'),
  unauthorized: () => new Problem(401, 'UNAUTHORIZED', 'Нужно войти'),
};

export function cookieValue(header, name) {
  for (const part of String(header ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return null;
}

// Пауза перед повтором входа держит процесс: иначе ответ ребёнку мог бы не прийти.
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

export function createGameApp({ config, store, crm, sessions, loginQueue, stars, reconciler, logger = console, clientDirectory = CLIENT_DIRECTORY,
  busyDelay = () => 300 + Math.floor(Math.random() * 700) }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false);
  app.use(helmet({
    contentSecurityPolicy: { useDefaults: false, directives: {
      'default-src': ["'self'"], 'script-src': ["'self'"], 'style-src': ["'self'"], 'img-src': ["'self'", 'data:'],
      'connect-src': ["'self'"], 'font-src': ["'self'"], 'object-src': ["'none'"], 'base-uri': ["'none'"],
      'form-action': ["'self'"], 'frame-ancestors': ["'none'"],
    } },
    referrerPolicy: { policy: 'no-referrer' },
  }));

  const cookieOptions = (maxAge) => ({ httpOnly: true, secure: true, sameSite: 'strict', path: COOKIE_PATH, ...(maxAge != null ? { maxAge } : {}) });
  const tokenOf = (request) => cookieValue(request.headers.cookie, SESSION_COOKIE);
  const clearSession = (response) => response.clearCookie(SESSION_COOKIE, cookieOptions());

  // Адрес ребёнка ставит Nginx в X-Real-IP; верим ему, только если запрос пришёл с этой же машины.
  function clientIpOf(request) {
    if (config.devClientIp) return config.devClientIp;
    if (!LOOPBACK.has(request.socket.remoteAddress)) return null;
    const value = request.get('x-real-ip');
    return value && value.length <= 45 ? value.trim() : null;
  }

  // CSRF: изменяющие запросы — только JSON и только со своего домена. Вместе с SameSite=Strict этого хватает.
  function sameOrigin(request, _response, next) {
    if (request.get('origin') !== config.publicOrigin) return next(new Problem(403, 'FORBIDDEN_ORIGIN', 'Запрос с чужого сайта'));
    if (!request.is('application/json')) return next(new Problem(415, 'UNSUPPORTED_MEDIA_TYPE', 'Нужен JSON'));
    return next();
  }

  const api = express.Router();
  api.use((_request, response, next) => { response.set('Cache-Control', 'no-store'); next(); });
  const run = (handler) => async (request, response, next) => {
    try { await handler(request, response); } catch (error) { next(error); }
  };
  async function requireSession(request) {
    let result;
    try { result = await sessions.authenticate(tokenOf(request)); } catch (error) {
      if (error instanceof GameUnavailable) throw problems.unavailable();
      throw error;
    }
    if (!result) throw problems.unauthorized();
    return result.session;
  }

  api.get('/health', run(async (_request, response) => {
    try { await store.ping(); } catch (error) {
      logger.error(`База игры недоступна: ${error?.code ?? error?.message}`);
      return response.status(503).json({ status: 'unavailable' });
    }
    return response.json({ status: 'ok' });
  }));

  api.post('/login', sameOrigin, express.json({ limit: '2kb' }), run(async (request, response) => {
    const { login, password } = request.body ?? {};
    if (typeof login !== 'string' || typeof password !== 'string' || !login.trim() || !password
      || login.length > MAX_LOGIN_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
      throw new Problem(400, 'VALIDATION_ERROR', 'Введи логин и пароль');
    }
    const clientIp = clientIpOf(request);
    if (!clientIp) {
      logger.error('Вход в игру отклонён: нет X-Real-IP от локального прокси, проверьте Nginx');
      throw problems.loginUnavailable();
    }
    // В одном браузере одна сессия: прежняя закрывается до проверки нового входа.
    const previous = tokenOf(request);
    if (previous) { await sessions.revoke(previous, 'relogin'); clearSession(response); }

    const storedGrant = cookieValue(request.headers.cookie, LOGIN_GRANT_COOKIE);
    const loginGrant = storedGrant && LOGIN_GRANT_PATTERN.test(storedGrant) ? storedGrant : null;
    let result;
    for (let attempt = 0; ; attempt += 1) {
      try { result = await loginQueue.run(clientIp, () => crm.verifyChild({ login, password, clientIp, loginGrant })); } catch (error) {
        if (error instanceof LoginQueueFull) throw problems.busy();
        throw error;
      }
      if (result.ok || result.code !== 'GAME_LOGIN_BUSY' || attempt >= BUSY_RETRIES) break;
      await sleep(busyDelay());
    }
    if (!result.ok) {
      if (result.unavailable) throw problems.loginUnavailable();
      if (result.status === 401) throw new Problem(401, 'INVALID_CREDENTIALS', 'Неверный логин или пароль');
      if (result.code === 'LOGIN_RATE_LIMITED') throw new Problem(429, 'LOGIN_RATE_LIMITED', 'Слишком много попыток. Попробуй позже');
      if (result.code === 'GAME_LOGIN_BUSY') throw problems.busy();
      if (result.code === 'INVALID_CLIENT_IP') logger.error('CRM отвергла адрес клиента: проверьте цепочку прокси');
      else logger.error(`Вход в игру: неожиданный ответ CRM ${result.status} ${result.code ?? ''}`.trim());
      throw problems.loginUnavailable();
    }
    const { childId, tokenVersion, firstAccessOn, loginGrant: issuedGrant } = result.data ?? {};
    if (!/^[1-9]\d*$/.test(String(childId)) || !Number.isInteger(tokenVersion) || !/^\d{4}-\d{2}-\d{2}$/.test(String(firstAccessOn))) {
      logger.error('Вход в игру: CRM вернула неполный ответ');
      throw problems.loginUnavailable();
    }
    const profile = await ensureProfile(store, { childId: String(childId), firstAccessOn }, { logger });
    const { token, expiresAt } = await sessions.create({ childId: String(childId), tokenVersion });
    response.cookie(SESSION_COOKIE, token, cookieOptions(sessions.cookieMaxAgeMs(expiresAt)));
    if (typeof issuedGrant === 'string' && LOGIN_GRANT_PATTERN.test(issuedGrant)) {
      response.cookie(LOGIN_GRANT_COOKIE, issuedGrant, { httpOnly: true, secure: true, sameSite: 'strict', path: LOGIN_GRANT_PATH, maxAge: LOGIN_GRANT_MAX_AGE_MS });
    }
    // Звёзды за занятия сверяются при входе; ответ ребёнку CRM не ждёт.
    reconciler.reconcileChild(String(childId)).catch(() => {});
    response.json({ data: { nickname: profile.nickname } });
  }));

  api.post('/logout', sameOrigin, run(async (request, response) => {
    await sessions.revoke(tokenOf(request), 'logout');
    clearSession(response);
    response.status(204).end();
  }));

  api.get('/me', run(async (request, response) => {
    let session;
    try { session = await requireSession(request); } catch (error) {
      if (error.status === 401) clearSession(response);
      throw error;
    }
    const profile = await store.getProfile(session.childId);
    if (!profile) throw problems.unauthorized();
    response.json({ data: { nickname: profile.nickname } });
  }));

  // Звёзды считает только сервер: клиент видит итог и может лишь открыть сундук.
  const childStars = (wallet) => ({ balance: wallet.balance, chest: wallet.chest });
  api.get('/stars', run(async (request, response) => {
    const session = await requireSession(request);
    await reconciler.reconcileChild(session.childId);
    const { wallet } = await stars.summary(session.childId);
    response.json({ data: childStars(wallet) });
  }));

  api.post('/stars/chest/open', sameOrigin, run(async (request, response) => {
    const session = await requireSession(request);
    const { opened, wallet } = await stars.openChest(session.childId);
    response.json({ data: { opened, ...childStars(wallet) } });
  }));

  api.use((_request, _response, next) => next(new Problem(404, 'NOT_FOUND', 'Не найдено')));

  app.use('/game/api', api);
  app.use('/game', express.static(clientDirectory, { index: 'index.html', redirect: true, dotfiles: 'ignore', setHeaders: (response) => response.set('Cache-Control', 'no-cache') }));
  app.use((_request, response) => response.status(404).json({ error: { code: 'NOT_FOUND', message: 'Не найдено' } }));
  // Текст ошибки разбора тела цитирует запрос, а в нём может быть пароль.
  app.use((error, _request, response, _next) => {
    if (error instanceof Problem || error instanceof StarProblem) return response.status(error.status).json({ error: { code: error.code, message: error.message } });
    if (error?.status >= 400 && error.status < 500) return response.status(error.status).json({ error: { code: 'INVALID_REQUEST', message: 'Некорректный запрос' } });
    logger.error(`Ошибка игрового сервера: ${error?.code ?? error?.message ?? error}`);
    return response.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Что-то пошло не так. Попробуй позже' } });
  });
  return app;
}

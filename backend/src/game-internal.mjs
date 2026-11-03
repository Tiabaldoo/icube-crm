import { createHash, timingSafeEqual } from 'node:crypto';
import express from 'express';
import { ApiProblem } from './catalog.mjs';

const TOKEN_HEADER = 'x-game-internal-token';
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const digest = (value) => createHash('sha256').update(String(value ?? '')).digest();
const notFound = (response) => response.status(404).json({ error: { code: 'NOT_FOUND', message: 'Не найдено' } });

export const isLoopbackAddress = (address) => LOOPBACK_ADDRESSES.has(address);

export function createInternalGameApp({ token, gameAccess, gameAttendance = null, isAllowedPeer = isLoopbackAddress }) {
  const expected = digest(token);
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false);
  app.use((request, response, next) => {
    const provided = digest(request.get(TOKEN_HEADER));
    if (!isAllowedPeer(request.socket.remoteAddress) || !timingSafeEqual(provided, expected)) return notFound(response);
    return next();
  });
  app.use(express.json({ limit: '8kb' }));
  const run = (handler) => async (request, response, next) => {
    try { response.json({ data: await handler(request) }); } catch (error) { next(error); }
  };
  app.post('/internal/game/verify-child', run((request) => gameAccess.verifyChild(request.body)));
  app.get('/internal/game/children/:childId/status', run((request) => gameAccess.status(request.params.childId)));
  // Этап 4: посещения для сверки звёзд и статусы пачки детей. Только чтение.
  if (gameAttendance) {
    app.get('/internal/game/children/:childId/qualifying-attendance', run((request) => gameAttendance.qualifyingAttendance(request.params.childId)));
    app.get('/internal/game/children', run((request) => gameAttendance.childrenStatus(request.query.ids)));
  }
  app.use((_request, response) => notFound(response));
  // Текст ошибки разбора тела цитирует запрос, а в нём может быть пароль.
  app.use((error, _request, response, _next) => {
    if (error instanceof ApiProblem) return response.status(error.status).json({ error: { code: error.code, message: error.message } });
    if (error.status) return response.status(error.status).json({ error: { code: 'INVALID_REQUEST', message: 'Некорректный запрос' } });
    console.error(error);
    return response.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  });
  return app;
}

// Сбой этого порта не должен останавливать основной API CRM.
export function startInternalGameServer({ app, port, logger = console }) {
  const server = app.listen(port, '127.0.0.1');
  server.on('listening', () => logger.log(`Внутренний API игры слушает 127.0.0.1:${server.address().port}`));
  server.on('error', (error) => logger.error(`Внутренний API игры не запущен: ${error.code ?? error.message}`));
  return server;
}

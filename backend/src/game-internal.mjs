import { createHash, timingSafeEqual } from 'node:crypto';
import express from 'express';

const TOKEN_HEADER = 'x-game-internal-token';
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const digest = (value) => createHash('sha256').update(String(value ?? '')).digest();
const notFound = (response) => response.status(404).json({ error: { code: 'NOT_FOUND', message: 'Не найдено' } });

export const isLoopbackAddress = (address) => LOOPBACK_ADDRESSES.has(address);

export function createInternalGameApp({ token, gameAccess }) {
  const expected = digest(token);
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false);
  app.use((request, response, next) => {
    const provided = digest(request.get(TOKEN_HEADER));
    if (!isLoopbackAddress(request.socket.remoteAddress) || !timingSafeEqual(provided, expected)) return notFound(response);
    return next();
  });
  app.use(express.json({ limit: '8kb' }));
  const run = (handler) => async (request, response, next) => {
    try { response.json({ data: await handler(request) }); } catch (error) { next(error); }
  };
  app.post('/internal/game/verify-child', run((request) => gameAccess.verifyChild(request.body)));
  app.get('/internal/game/children/:childId/status', run((request) => gameAccess.status(request.params.childId)));
  app.use((_request, response) => notFound(response));
  app.use((error, _request, response, _next) => {
    if (!error.status) console.error(error);
    response.status(error.status ?? 500).json({ error: {
      code: error.code ?? 'INTERNAL_ERROR',
      message: error.status ? error.message : 'Внутренняя ошибка сервера',
    } });
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

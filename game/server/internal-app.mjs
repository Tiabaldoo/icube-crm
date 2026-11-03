import { createHash, timingSafeEqual } from 'node:crypto';
import express from 'express';
import { StarProblem } from './star-errors.mjs';

// Обратный канал для CRM (решение Т4): 127.0.0.1:3101, тот же секрет, что и у внутреннего API CRM.
// Наружу не проксируется. CRM вызывает его только после своей проверки прав и границ доступа,
// поэтому здесь проверяются лишь секрет, адрес и корректность данных.
const TOKEN_HEADER = 'x-game-internal-token';
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const digest = (value) => createHash('sha256').update(String(value ?? '')).digest();
const notFound = (response) => response.status(404).json({ error: { code: 'NOT_FOUND', message: 'Не найдено' } });

export const isLoopbackAddress = (address) => LOOPBACK_ADDRESSES.has(address);

export function createInternalGameApp({ token, stars, reconciler, isAllowedPeer = isLoopbackAddress, logger = console, reconcileWaitMs = 2_000 }) {
  const expected = digest(token);
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false);
  app.use((request, response, next) => {
    const provided = digest(request.get(TOKEN_HEADER));
    if (!isAllowedPeer(request.socket.remoteAddress) || !timingSafeEqual(provided, expected)) return notFound(response);
    response.set('Cache-Control', 'no-store');
    return next();
  });
  app.use(express.json({ limit: '4kb' }));
  const run = (handler) => async (request, response, next) => {
    try { response.json({ data: await handler(request) }); } catch (error) { next(error); }
  };

  app.post('/internal/bonuses', run((request) => stars.grantBonus(request.body ?? {})));
  app.post('/internal/bonuses/:bonusId/revoke', run((request) => stars.revokeBonus({ ...(request.body ?? {}), bonusId: request.params.bonusId })));
  // Сотрудник смотрит звёзды ребёнка: перед ответом — свежая сверка, но не дольше reconcileWaitMs,
  // чтобы медленный ответ CRM не превратился для CRM в «игра недоступна». Сверка доделается фоном.
  app.get('/internal/children/:childId/stars', run(async (request) => {
    let timer;
    await Promise.race([
      reconciler.reconcileChild(String(request.params.childId)),
      new Promise((resolve) => { timer = setTimeout(resolve, reconcileWaitMs); }),
    ]);
    clearTimeout(timer);
    return stars.summary(request.params.childId, { includeBonuses: true });
  }));
  app.use((_request, response) => notFound(response));
  app.use((error, _request, response, _next) => {
    if (error instanceof StarProblem) return response.status(error.status).json({ error: { code: error.code, message: error.message } });
    if (error?.status >= 400 && error.status < 500) return response.status(error.status).json({ error: { code: 'INVALID_REQUEST', message: 'Некорректный запрос' } });
    logger.error(`Ошибка внутреннего API игры: ${error?.code ?? error?.message ?? error}`);
    return response.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка игры' } });
  });
  return app;
}

// Сбой этого порта не должен останавливать игру для детей.
export function startInternalGameServer({ app, port, logger = console }) {
  const server = app.listen(port, '127.0.0.1');
  server.on('listening', () => logger.log(`Внутренний API игры для CRM слушает 127.0.0.1:${server.address().port}`));
  server.on('error', (error) => logger.error(`Внутренний API игры не запущен: ${error.code ?? error.message}`));
  return server;
}

import express from 'express';
import helmet from 'helmet';
import { loadConfig } from './config.mjs';
import { createPool } from './db.mjs';
import { createApiRouter } from './routes.mjs';
import { createMysqlLessons } from './lessons.mjs';
import { createLessonPhotoService } from './lesson-photos.mjs';
import { createParentNotifications } from './parent-notifications.mjs';
import { createParentPortal } from './parent-portal.mjs';
import { createNotificationEvents } from './notification-events.mjs';
import { createWebPushService } from './web-push.mjs';
import { createMysqlPayments } from './payments.mjs';
import { createPaymentReceiptService } from './payment-receipts.mjs';
import { createGameAccess } from './game-access.mjs';
import { createGameAttendance } from './game-attendance.mjs';
import { createInternalGameApp, startInternalGameServer } from './game-internal.mjs';
import { createGameServerClient } from './game-server-client.mjs';
import { createGameStars } from './game-stars.mjs';

export function startGameIfEnabled({ config, gameAccess, gameAttendance = null, logger = console }) {
  if (!config.game?.enabled) {
    if (config.game?.requested) logger.error('Игра не запущена: GAME_ENABLED не применён для этого окружения или настроек');
    return null;
  }
  const app = createInternalGameApp({ token: config.game.internalToken, gameAccess, gameAttendance });
  return startInternalGameServer({ app, port: config.game.internalPort, logger });
}

export function createApp({ config, pool }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(helmet());
  app.use(express.json({ limit: '1mb' }));
  const notificationEvents = createNotificationEvents(pool);
  const parentNotifications = createParentNotifications(pool, { notificationEvents });
  const payments = createMysqlPayments(pool, { notificationEvents });
  const paymentReceipts = createPaymentReceiptService(pool, {
    ...config.receipts, payments, notificationEvents, parentNotifications,
  });
  const lessonPhotos = createLessonPhotoService(pool, { ...config.photos, parentNotifications });
  const lessons = createMysqlLessons(pool, { lessonPhotos, parentNotifications, notificationEvents });
  const parentPortal = createParentPortal(pool, { contact: config.parent, materializeLessons: lessons.materialize, notificationEvents });
  const push = createWebPushService(pool, { config: config.push, notificationEvents });
  const gameAccess = config.game?.enabled ? createGameAccess(pool, { allowPrivateClientIp: config.game.allowPrivateClientIp, loginGrantKey: config.game.loginGrantKey }) : null;
  app.locals.gameAccess = gameAccess;
  app.locals.gameAttendance = gameAccess ? createGameAttendance(pool) : null;
  if (gameAccess && !config.game.serverUrl) console.error('Бонусы игры выключены: GAME_SERVER_INTERNAL_URL должен указывать на 127.0.0.1');
  const gameStars = gameAccess && config.game.serverUrl ? createGameStars(pool, {
    client: createGameServerClient({ baseUrl: config.game.serverUrl, token: config.game.internalToken }), maxStars: config.game.bonusMaxStars,
  }) : null;
  app.use('/api/v1', createApiRouter(pool, {
    notificationEvents, lessonPhotos, lessons, parentNotifications, parentPortal, payments, paymentReceipts, push, gameAccess, gameStars,
  }));
  app.use((error, _request, response, _next) => {
    if (!error.status) console.error(error);
    response.status(error.status ?? 500).json({ error: {
      code: error.code ?? 'INTERNAL_ERROR',
      message: error.status ? error.message : 'Внутренняя ошибка сервера',
      ...(error.details === undefined ? {} : { details: error.details }),
    } });
  });
  return app;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const config = loadConfig();
  const pool = createPool(config.database);
  const app = createApp({ config, pool });
  app.listen(config.port, '127.0.0.1', () => {
    console.log(`iCube API (${config.appEnv}) слушает 127.0.0.1:${config.port}`);
  });
  startGameIfEnabled({ config, gameAccess: app.locals.gameAccess, gameAttendance: app.locals.gameAttendance });
}

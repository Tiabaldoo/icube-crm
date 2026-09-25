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

export function createApp({ config, pool }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(helmet());
  app.use(express.json({ limit: '1mb' }));
  const notificationEvents = createNotificationEvents(pool);
  const parentNotifications = createParentNotifications(pool, { notificationEvents });
  const lessonPhotos = createLessonPhotoService(pool, { ...config.photos, parentNotifications });
  const lessons = createMysqlLessons(pool, { lessonPhotos, parentNotifications, notificationEvents });
  const parentPortal = createParentPortal(pool, { contact: config.parent, materializeLessons: lessons.materialize, notificationEvents });
  const push = createWebPushService(pool, { config: config.push, notificationEvents });
  app.use('/api/v1', createApiRouter(pool, { notificationEvents, lessonPhotos, lessons, parentNotifications, parentPortal, push }));
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
}

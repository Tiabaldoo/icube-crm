import { createGameApp } from './app.mjs';
import { loadGameConfig } from './config.mjs';
import { createCrmClient } from './crm-client.mjs';
import { createInternalGameApp, startInternalGameServer } from './internal-app.mjs';
import { createLoginQueue } from './login-queue.mjs';
import { createReconciler } from './reconciler.mjs';
import { createSessions } from './sessions.mjs';
import { createStars } from './stars.mjs';
import { createGamePool, createMysqlStore } from './store-mysql.mjs';

export function createGameServer(config) {
  const pool = createGamePool(config.database);
  const store = createMysqlStore(pool);
  const crm = createCrmClient({ baseUrl: config.crmInternalUrl, token: config.internalToken });
  const sessions = createSessions({ store, crm });
  const stars = createStars({ store, crm });
  const reconciler = createReconciler({ store, crm, stars });
  const app = createGameApp({ config, store, crm, sessions, loginQueue: createLoginQueue(), stars, reconciler });
  const internalApp = createInternalGameApp({ token: config.internalToken, stars, reconciler });
  return { app, internalApp, reconciler, pool };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const config = loadGameConfig();
  const { app, internalApp, reconciler } = createGameServer(config);
  // Только loopback: наружу игру выпускает Nginx, обратный канал для CRM наружу не выпускается.
  app.listen(config.port, '127.0.0.1', () => {
    console.log(`Игровой сервер (${config.appEnv}) слушает 127.0.0.1:${config.port}`);
  });
  startInternalGameServer({ app: internalApp, port: config.internalPort });
  reconciler.start();
}

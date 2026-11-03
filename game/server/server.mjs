import { createGameApp } from './app.mjs';
import { loadGameConfig } from './config.mjs';
import { createCrmClient } from './crm-client.mjs';
import { createLoginQueue } from './login-queue.mjs';
import { createSessions } from './sessions.mjs';
import { createGamePool, createMysqlStore } from './store-mysql.mjs';

export function createGameServer(config) {
  const pool = createGamePool(config.database);
  const store = createMysqlStore(pool);
  const crm = createCrmClient({ baseUrl: config.crmInternalUrl, token: config.internalToken });
  const sessions = createSessions({ store, crm });
  const app = createGameApp({ config, store, crm, sessions, loginQueue: createLoginQueue() });
  return { app, pool };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const config = loadGameConfig();
  const { app } = createGameServer(config);
  // Только loopback: наружу игру выпускает Nginx.
  app.listen(config.port, '127.0.0.1', () => {
    console.log(`Игровой сервер (${config.appEnv}) слушает 127.0.0.1:${config.port}`);
  });
}

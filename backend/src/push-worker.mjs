import { loadConfig } from './config.mjs';
import { createPool } from './db.mjs';
import { createNotificationEvents } from './notification-events.mjs';
import { createParentNotifications } from './parent-notifications.mjs';
import { createPushScheduler } from './push-scheduler.mjs';
import { createWebPushService } from './web-push.mjs';

export async function runPushWorker({ pool, config, sender, now } = {}) {
  const ownedPool = !pool;
  const resolvedConfig = config ?? loadConfig();
  const resolvedPool = pool ?? createPool(resolvedConfig.database);
  try {
    const notificationEvents = createNotificationEvents(resolvedPool);
    const parentNotifications = createParentNotifications(resolvedPool, { notificationEvents });
    const scheduler = createPushScheduler(resolvedPool, {
      notificationEvents, parentNotifications, reminderTime: resolvedConfig.push.parentReminderTime, now,
    });
    const push = createWebPushService(resolvedPool, { config: resolvedConfig.push, notificationEvents, sender, now });
    const scheduled = await scheduler.generate();
    const delivery = await push.processPending({ limit: resolvedConfig.push.batchSize });
    return { scheduled, delivery };
  } finally {
    if (ownedPool) await resolvedPool.end();
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  runPushWorker().then((result) => {
    console.log(JSON.stringify(result));
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

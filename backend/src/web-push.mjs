import { createHash, randomUUID } from 'node:crypto';
import webpush from 'web-push';
import { inTransaction } from './db.mjs';
import { createNotificationEvents } from './notification-events.mjs';
import { notificationTag, notificationTypeConfig } from './notification-types.mjs';

const MAX_ATTEMPTS = 5;
const retryDelaySeconds = (attempts) => [60, 5 * 60, 30 * 60, 2 * 60 * 60][Math.max(0, Math.min(3, attempts - 1))];
const endpointHash = (endpoint) => createHash('sha256').update(String(endpoint)).digest('hex');
const cleanError = (error) => String(error?.body || error?.message || 'Push provider error').slice(0, 1000);

export function normalizePushSubscription(value) {
  const endpoint = String(value?.endpoint ?? '').trim();
  const p256dh = String(value?.keys?.p256dh ?? '').trim();
  const auth = String(value?.keys?.auth ?? '').trim();
  if (!endpoint || !p256dh || !auth || endpoint.length > 4096 || p256dh.length > 255 || auth.length > 255) {
    const error = new Error('Некорректная push subscription'); error.status = 400; error.code = 'VALIDATION_ERROR'; throw error;
  }
  return { endpoint, p256dh, auth };
}

export function createWebPushService(pool, {
  config = {}, sender = null, notificationEvents = createNotificationEvents(pool), now = () => new Date(),
} = {}) {
  const enabled = Boolean(config.enabled && config.publicKey && config.privateKey && config.subject);
  const pushSender = sender ?? (enabled ? webpush : null);
  if (enabled && !sender) pushSender.setVapidDetails(config.subject, config.publicKey, config.privateKey);

  function publicConfig() {
    return { enabled, publicKey: enabled ? config.publicKey : null };
  }

  async function bind(userId, value, userAgent = null) {
    const subscription = normalizePushSubscription(value);
    const hash = endpointHash(subscription.endpoint);
    await pool.query(`INSERT INTO web_push_subscriptions
      (user_id,endpoint,endpoint_hash,p256dh,auth,user_agent,last_seen_at,disabled_at)
      VALUES (:userId,:endpoint,:hash,:p256dh,:auth,:userAgent,NOW(6),NULL)
      ON DUPLICATE KEY UPDATE user_id=VALUES(user_id),endpoint=VALUES(endpoint),p256dh=VALUES(p256dh),auth=VALUES(auth),
        user_agent=VALUES(user_agent),last_seen_at=NOW(6),disabled_at=NULL`, {
      userId, endpoint: subscription.endpoint, hash, p256dh: subscription.p256dh, auth: subscription.auth,
      userAgent: String(userAgent ?? '').slice(0, 512) || null,
    });
    const [rows] = await pool.query(`SELECT id,user_id,disabled_at FROM web_push_subscriptions
      WHERE endpoint_hash=:hash LIMIT 1`, { hash });
    return { id: String(rows[0].id), userId: String(rows[0].user_id), active: rows[0].disabled_at == null };
  }

  async function disable(userId, endpoint) {
    const hash = endpointHash(String(endpoint ?? ''));
    await pool.query(`UPDATE web_push_subscriptions SET disabled_at=COALESCE(disabled_at,NOW(6)),last_seen_at=NOW(6)
      WHERE endpoint_hash=:hash AND user_id=:userId`, { hash, userId });
    return { disabled: true };
  }

  async function createTestNotification(context) {
    if (!enabled) {
      const error = new Error('Web Push сейчас отключён на сервере'); error.status = 409; error.code = 'PUSH_DISABLED'; throw error;
    }
    const notificationId = await inTransaction(pool, (connection) => notificationEvents.createUser(connection, {
      userId: context.userId, roleCode: context.roles?.[0] ?? null, type: 'push_test',
      title: 'Тестовое уведомление', body: 'Уведомления iCube работают.',
      destination: 'home', dedupKey: `push:test:${context.userId}:${randomUUID()}`,
      respectSettings: false,
    }));
    await processPending({ limit: 50 });
    return { notificationId };
  }

  async function claim(limit = 50) {
    return inTransaction(pool, async (connection) => {
      const [rows] = await connection.query(`SELECT pd.id FROM push_deliveries pd
        JOIN web_push_subscriptions s ON s.id=pd.subscription_id
        WHERE s.disabled_at IS NULL AND pd.attempts<:maxAttempts
          AND ((pd.status='pending' AND pd.next_attempt_at<=NOW(6))
            OR (pd.status='sending' AND pd.updated_at<DATE_SUB(NOW(6),INTERVAL 10 MINUTE)))
        ORDER BY pd.next_attempt_at,pd.id LIMIT :limit FOR UPDATE SKIP LOCKED`, {
        maxAttempts: MAX_ATTEMPTS, limit: Math.max(1, Math.min(200, Number(limit) || 50)),
      });
      if (!rows.length) return [];
      const ids = rows.map((row) => Number(row.id));
      await connection.query(`UPDATE push_deliveries SET status='sending',attempts=attempts+1,last_error=NULL
        WHERE id IN (${ids.join(',')})`);
      const [claimed] = await connection.query(`SELECT pd.id,pd.attempts,pd.notification_id,n.notification_type,n.title,n.body,
          n.destination,n.entity_type,n.entity_id,n.created_at,s.id subscription_id,s.endpoint,s.p256dh,s.auth
        FROM push_deliveries pd JOIN notifications n ON n.id=pd.notification_id
        JOIN web_push_subscriptions s ON s.id=pd.subscription_id
        WHERE pd.id IN (${ids.join(',')}) ORDER BY pd.id`);
      return claimed;
    });
  }

  async function markExpired(deliveryId) {
    await pool.query(`UPDATE push_deliveries SET status='failed',last_error='expired',next_attempt_at=NOW(6)
      WHERE id=:id`, { id: deliveryId });
  }

  async function markSent(deliveryId) {
    await pool.query(`UPDATE push_deliveries SET status='sent',sent_at=NOW(6),last_error=NULL
      WHERE id=:id`, { id: deliveryId });
  }

  async function markGone(row, error) {
    await inTransaction(pool, async (connection) => {
      await connection.query(`UPDATE web_push_subscriptions SET disabled_at=COALESCE(disabled_at,NOW(6))
        WHERE id=:id`, { id: row.subscription_id });
      await connection.query(`UPDATE push_deliveries SET status='gone',last_error=:error WHERE id=:id`, {
        id: row.id, error: cleanError(error),
      });
    });
  }

  async function markFailure(row, error) {
    const status = Number(error?.statusCode ?? 0);
    const retryable = status === 429 || status >= 500 || status === 0;
    if (retryable && Number(row.attempts) < MAX_ATTEMPTS) {
      const seconds = retryDelaySeconds(Number(row.attempts));
      await pool.query(`UPDATE push_deliveries SET status='pending',next_attempt_at=DATE_ADD(NOW(6),INTERVAL :seconds SECOND),
        last_error=:error WHERE id=:id`, { id: row.id, seconds, error: cleanError(error) });
    } else {
      await pool.query(`UPDATE push_deliveries SET status='failed',last_error=:error WHERE id=:id`, {
        id: row.id, error: cleanError(error),
      });
    }
  }

  async function sendRow(row) {
    const configForType = notificationTypeConfig(row.notification_type);
    const ageSeconds = Math.max(0, Math.floor((now().getTime() - new Date(String(row.created_at).replace(' ', 'T') + '+11:00').getTime()) / 1000));
    if (ageSeconds > configForType.ttl) { await markExpired(row.id); return { id: String(row.id), status: 'expired' }; }
    const payload = JSON.stringify({
      notificationId: String(row.notification_id), type: row.notification_type, title: row.title, body: row.body,
      destination: row.destination ?? 'home', entityType: row.entity_type ?? null,
      entityId: row.entity_id == null ? null : String(row.entity_id),
      tag: notificationTag(row.notification_type, row.entity_type, row.entity_id, row.notification_id),
    });
    try {
      await pushSender.sendNotification({
        endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth },
      }, payload, { TTL: configForType.ttl, urgency: 'normal' });
      await markSent(row.id);
      return { id: String(row.id), status: 'sent' };
    } catch (error) {
      if ([404, 410].includes(Number(error?.statusCode))) await markGone(row, error);
      else await markFailure(row, error);
      return { id: String(row.id), status: [404, 410].includes(Number(error?.statusCode)) ? 'gone' : 'failed' };
    }
  }

  async function processPending({ limit = 50 } = {}) {
    if (!enabled || !pushSender) return { enabled: false, processed: 0, results: [] };
    const rows = await claim(limit);
    const results = [];
    for (const row of rows) results.push(await sendRow(row));
    return { enabled: true, processed: rows.length, results };
  }

  return { enabled, publicConfig, bind, disable, createTestNotification, processPending, claim, sendRow };
}

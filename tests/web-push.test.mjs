import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createWebPushService, normalizePushSubscription } from '../backend/src/web-push.mjs';
import { createNotificationEvents, crossedDebtThreshold } from '../backend/src/notification-events.mjs';
import { settingsForRole } from '../backend/src/notification-types.mjs';
import { createParentNotifications } from '../backend/src/parent-notifications.mjs';
import { PARENT_NOTIFICATION_TYPES } from '../backend/src/parent-portal.mjs';
import { createPushScheduler } from '../backend/src/push-scheduler.mjs';

function pushPoolFixture() {
  const state = { subscriptions: [], deliveries: [], notifications: [] };
  let nextSub = 1;
  const query = async (sql, params = {}) => {
    if (sql.includes('SELECT id,user_id FROM web_push_subscriptions') && sql.includes('FOR UPDATE')) {
      return [state.subscriptions.filter((row) => row.endpoint_hash === params.hash).map((row) => ({ id: row.id, user_id: row.user_id }))];
    }
    if (sql.startsWith('INSERT INTO web_push_subscriptions')) {
      let row = state.subscriptions.find((item) => item.endpoint_hash === params.hash);
      if (!row) {
        row = { id: nextSub++, user_id: Number(params.userId), endpoint: params.endpoint, endpoint_hash: params.hash,
          p256dh: params.p256dh, auth: params.auth, disabled_at: null };
        state.subscriptions.push(row);
      } else Object.assign(row, { user_id: Number(params.userId), endpoint: params.endpoint, p256dh: params.p256dh, auth: params.auth, disabled_at: null });
      return [{ affectedRows: 1, insertId: row.id }];
    }
    if (sql.includes('SELECT id,user_id,disabled_at FROM web_push_subscriptions')) {
      return [state.subscriptions.filter((row) => row.endpoint_hash === params.hash).map((row) => ({ id: row.id, user_id: row.user_id, disabled_at: row.disabled_at }))];
    }
    if (sql.startsWith('UPDATE push_deliveries pd JOIN notifications n')) {
      let affectedRows = 0;
      for (const delivery of state.deliveries) {
        const notification = state.notifications.find((item) => item.id === delivery.notification_id);
        if (delivery.subscription_id === Number(params.subscriptionId) && ['pending', 'sending'].includes(delivery.status)
          && (!notification?.user_id || Number(notification.user_id) !== Number(params.userId))) {
          delivery.status = 'failed'; delivery.last_error = 'subscription rebound to another user'; affectedRows += 1;
        }
      }
      return [{ affectedRows }];
    }
    if (sql.startsWith('UPDATE web_push_subscriptions SET disabled_at=COALESCE')) {
      const row = state.subscriptions.find((item) => item.id === Number(params.id)
        || (item.endpoint_hash === params.hash && item.user_id === Number(params.userId)));
      if (row) row.disabled_at = new Date();
      return [{ affectedRows: row ? 1 : 0 }];
    }
    if (sql.startsWith("UPDATE push_deliveries SET status='gone'")) {
      const row = state.deliveries.find((item) => item.id === Number(params.id)); if (row) { row.status = 'gone'; row.last_error = params.error; }
      return [{ affectedRows: row ? 1 : 0 }];
    }
    if (sql.startsWith("UPDATE push_deliveries SET status='sent'")) {
      const row = state.deliveries.find((item) => item.id === Number(params.id)); if (row) row.status = 'sent';
      return [{ affectedRows: row ? 1 : 0 }];
    }
    if (sql.startsWith("UPDATE push_deliveries SET status='pending'")) {
      const row = state.deliveries.find((item) => item.id === Number(params.id)); if (row) { row.status = 'pending'; row.last_error = params.error; }
      return [{ affectedRows: row ? 1 : 0 }];
    }
    if (sql.startsWith("UPDATE push_deliveries SET status='failed'")) {
      const row = state.deliveries.find((item) => item.id === Number(params.id)); if (row) row.status = 'failed';
      return [{ affectedRows: row ? 1 : 0 }];
    }
    throw new Error(`Unexpected push SQL: ${sql}`);
  };
  const connection = { query, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {} };
  return { state, pool: { query, getConnection: async () => connection } };
}

const subscription = { endpoint: 'https://push.example/device', keys: { p256dh: 'public-key', auth: 'auth-key' } };
const pushConfig = { enabled: true, publicKey: 'public', privateKey: 'private', subject: 'mailto:test@example.com' };

test('push subscription upsert does not duplicate endpoint and rebind invalidates previous-user pending deliveries', async () => {
  const fixture = pushPoolFixture();
  const service = createWebPushService(fixture.pool, { config: pushConfig, sender: { sendNotification: async () => {} } });
  const first = await service.bind(10, subscription, 'phone');
  const second = await service.bind(10, subscription, 'phone');
  assert.equal(first.id, second.id); assert.equal(fixture.state.subscriptions.length, 1);
  fixture.state.notifications.push({ id: 50, user_id: 10 });
  fixture.state.deliveries.push({ id: 60, notification_id: 50, subscription_id: Number(first.id), status: 'pending' });
  const rebound = await service.bind(20, subscription, 'phone');
  assert.equal(rebound.userId, '20');
  assert.equal(fixture.state.subscriptions.length, 1);
  assert.equal(fixture.state.deliveries[0].status, 'failed');
});

test('logout device binding can be disabled and the same browser endpoint can later bind another user', async () => {
  const fixture = pushPoolFixture();
  const service = createWebPushService(fixture.pool, { config: pushConfig, sender: { sendNotification: async () => {} } });
  await service.bind(10, subscription);
  await service.disable(10, subscription.endpoint);
  assert.ok(fixture.state.subscriptions[0].disabled_at);
  await service.bind(20, subscription);
  assert.equal(fixture.state.subscriptions[0].user_id, 20);
  assert.equal(fixture.state.subscriptions[0].disabled_at, null);
});

test('410 disables dead subscription and marks delivery gone without retry', async () => {
  const fixture = pushPoolFixture();
  const bound = await createWebPushService(fixture.pool, { config: pushConfig, sender: { sendNotification: async () => {} } }).bind(10, subscription);
  fixture.state.deliveries.push({ id: 1, notification_id: 1, subscription_id: Number(bound.id), status: 'sending' });
  const service = createWebPushService(fixture.pool, {
    config: pushConfig, now: () => new Date('2026-09-25T08:00:00Z'),
    sender: { sendNotification: async () => { const error = new Error('gone'); error.statusCode = 410; throw error; } },
  });
  await service.sendRow({ id: 1, attempts: 1, notification_id: 1, notification_type: 'teacher_lesson_soon',
    title: 'Soon', body: 'Body', destination: 'lesson', entity_type: 'lesson', entity_id: 9,
    created_at: '2026-09-25 18:55:00.000000', subscription_id: Number(bound.id),
    endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth });
  assert.ok(fixture.state.subscriptions[0].disabled_at);
  assert.equal(fixture.state.deliveries[0].status, 'gone');
});

test('503 keeps delivery retryable while attempts remain', async () => {
  const fixture = pushPoolFixture();
  fixture.state.deliveries.push({ id: 2, notification_id: 2, subscription_id: 1, status: 'sending' });
  const service = createWebPushService(fixture.pool, {
    config: pushConfig, now: () => new Date('2026-09-25T08:00:00Z'),
    sender: { sendNotification: async () => { const error = new Error('temporary'); error.statusCode = 503; throw error; } },
  });
  await service.sendRow({ id: 2, attempts: 1, notification_id: 2, notification_type: 'teacher_lesson_soon',
    title: 'Soon', body: 'Body', destination: 'lesson', entity_type: 'lesson', entity_id: 9,
    created_at: '2026-09-25 18:55:00.000000', subscription_id: 1,
    endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth });
  assert.equal(fixture.state.deliveries[0].status, 'pending');
});

test('subscription validation requires endpoint and both Web Push keys', () => {
  assert.deepEqual(normalizePushSubscription(subscription), subscription);
  assert.throws(() => normalizePushSubscription({ endpoint: subscription.endpoint, keys: {} }), /Некорректная/);
});

test('all six parent notification types default true and generic role defaults match product rules', () => {
  assert.equal(PARENT_NOTIFICATION_TYPES.length, 6);
  assert.ok(PARENT_NOTIFICATION_TYPES.every((item) => item.defaultEnabled === true));
  const teacher = settingsForRole('teacher'); const director = settingsForRole('director'); const partner = settingsForRole('partner');
  assert.equal(teacher.length, 8); assert.ok(teacher.every((item) => item.defaultEnabled));
  assert.equal(director.length, 7); assert.ok(director.every((item) => item.defaultEnabled));
  assert.equal(partner.find((item) => item.type === 'partner_lesson_not_started').defaultEnabled, false);
  assert.equal(partner.find((item) => item.type === 'partner_lesson_not_finished').defaultEnabled, false);
  assert.ok(partner.filter((item) => !['partner_lesson_not_started', 'partner_lesson_not_finished'].includes(item.type)).every((item) => item.defaultEnabled));
});

test('explicit generic saved false overrides default true', async () => {
  const pool = { query: async (sql) => {
    if (sql.startsWith('SELECT notification_type,enabled')) return [[{ notification_type: 'teacher_lesson_soon', enabled: 0 }]];
    throw new Error(`Unexpected settings SQL: ${sql}`);
  } };
  const rows = await createNotificationEvents(pool).getSettings(7, ['teacher']);
  assert.equal(rows.find((row) => row.type === 'teacher_lesson_soon').enabled, false);
  assert.equal(rows.find((row) => row.type === 'teacher_lesson_moved').enabled, true);
});

test('self-action suppression happens before any DB notification write', async () => {
  const pool = { query: async () => { throw new Error('DB must not be touched for self action'); } };
  const service = createNotificationEvents(pool);
  assert.equal(await service.createUser(pool, {
    userId: 10, actorUserId: 10, type: 'director_lesson_moved', title: 'x', body: 'x', dedupKey: 'x',
  }), null);
});

test('debt threshold triggers only on crossing from above -2 to -2 or below', () => {
  assert.equal(crossedDebtThreshold(-1, -2), true);
  assert.equal(crossedDebtThreshold(-2, -3), false);
  assert.equal(crossedDebtThreshold(-3, 0), false);
  assert.equal(crossedDebtThreshold(0, -2), true);
});

function parentPhotoFixture() {
  const state = { notifications: [] };
  const query = async (sql, params = {}) => {
    if (sql.includes('FROM child_guardians cg') && sql.includes('parent_notification_settings')) return [[{ user_id: 10 }]];
    if (sql.startsWith('INSERT IGNORE INTO notifications')) {
      if (state.notifications.some((row) => row.userId === params.userId && row.dedupKey === params.dedupKey)) return [{ affectedRows: 0 }];
      state.notifications.push(params); return [{ affectedRows: 1 }];
    }
    if (sql.includes('FROM attendances a LEFT JOIN child_enrollments')) return [[{ child_id: 5, enrollment_id: 7, is_trial: 0, balance_lessons: '1.00000000' }]];
    throw new Error(`Unexpected parent photo SQL: ${sql}`);
  };
  return { state, pool: { query } };
}

test('finish without server photo creates no photo notification; first uploaded photo creates one and later photos dedup', async () => {
  const fixture = parentPhotoFixture();
  const service = createParentNotifications(fixture.pool);
  const lesson = { id: 99, starts_at: '2026-09-25 16:00:00' };
  await service.lessonFinished(fixture.pool, lesson);
  assert.equal(fixture.state.notifications.filter((row) => row.type === 'lesson_finished').length, 0);
  await service.photoAvailable(fixture.pool, lesson, 5);
  await service.photoAvailable(fixture.pool, lesson, 5);
  assert.equal(fixture.state.notifications.filter((row) => row.type === 'lesson_finished').length, 1);
});

test('scheduled reminder generator suppresses teacher start after lesson started and finish after completed', async () => {
  const created = [];
  const notificationEvents = {
    roleUsers: async () => [{ user_id: 1 }],
    teacherUser: async () => ({ user_id: 2 }),
    partnerUsers: async () => [{ user_id: 3 }],
    createUser: async (_connection, payload) => { created.push(payload.type); return '1'; },
  };
  const scheduler = createPushScheduler({ query: async () => [[]] }, { notificationEvents });
  const connection = { query: async () => [[
    { id: 1, group_id: 4, project_id_snapshot: 2, planned_teacher_id: 7, actual_teacher_id: 7,
      starts_at: '2026-09-25 16:00:00', ends_at: '2026-09-25 17:00:00', status: 'in_progress', group_name: 'Группа', default_teacher_id: 7 },
    { id: 2, group_id: 4, project_id_snapshot: 2, planned_teacher_id: 7, actual_teacher_id: 7,
      starts_at: '2026-09-25 14:00:00', ends_at: '2026-09-25 15:00:00', status: 'completed', group_name: 'Группа', default_teacher_id: 7 },
  ]] };
  await scheduler.generateLessons(connection, { day: '2026-09-25', time: '16:10:00', sql: '2026-09-25 16:10:00' });
  assert.doesNotMatch(created.join(','), /teacher_lesson_start_reminder|teacher_lesson_finish_reminder/);
});

test('mutation points use actor suppression, current group name and partner project scope', async () => {
  const source = await readFile(new URL('../backend/src/notification-events.mjs', import.meta.url), 'utf8');
  assert.match(source, /actorUserId != null && same\(actorUserId, userId\)/);
  assert.match(source, /SELECT g\.id,g\.name,g\.project_id/);
  assert.match(source, /partnerUsers\(connection, group\.project_id\)/);
  assert.match(source, /p\.id=:projectId/);
  for (const type of ['teacher_lesson_moved','teacher_lesson_cancelled','teacher_child_added','teacher_absence_notice',
    'director_quick_child_created','director_lesson_moved','director_lesson_cancelled','director_child_added_group','director_debt_threshold',
    'partner_quick_child_created','partner_child_added_group','partner_lesson_moved','partner_lesson_cancelled']) assert.match(source, new RegExp(type));
});

test('all required scheduled teacher/director/partner event types are wired in backend scheduler', async () => {
  const source = await readFile(new URL('../backend/src/push-scheduler.mjs', import.meta.url), 'utf8');
  for (const type of ['teacher_lesson_soon','teacher_lesson_start_reminder','teacher_lesson_finish_reminder','teacher_child_birthday',
    'director_lesson_not_started','director_lesson_not_finished','partner_lesson_not_started','partner_lesson_not_finished']) {
    assert.match(source, new RegExp(type));
  }
  assert.match(source, /Asia\/Sakhalin|BUSINESS_TIME_ZONE/);
});

test('service worker preserves app-shell/API exclusion and adds real push + notificationclick deep link', async () => {
  const source = await readFile(new URL('../service-worker.js', import.meta.url), 'utf8');
  assert.match(source, /CACHE_NAME = 'icube-crm-shell-v2-/);
  assert.match(source, /url\.pathname\.includes\('\/api\/'\).*return/s);
  assert.match(source, /addEventListener\('push'/);
  assert.match(source, /showNotification/);
  assert.match(source, /payload\.tag/);
  assert.match(source, /addEventListener\('notificationclick'/);
  assert.match(source, /clients\.matchAll/);
  assert.match(source, /clients\.openWindow/);
  assert.match(source, /pushNotification/);
});

test('push frontend uses capability detection, explicit permission button and backend test path', async () => {
  const source = await readFile(new URL('../src/frontend/push-client.mjs', import.meta.url), 'utf8');
  assert.match(source, /navigator\?\.serviceWorker.*PushManager.*Notification/s);
  assert.match(source, /Notification\.requestPermission\(\)/);
  assert.match(source, /onclick="icubePush\.enable\(\)">Разрешить уведомления/);
  assert.match(source, /api\.request\('\/push\/test'/);
  assert.doesNotMatch(source, /new Notification\(/);
  assert.match(source, /Для уведомлений на iPhone добавьте iCube на экран «Домой»/);
});

test('deep-link bridge opens teacher lesson, director child and parent schedule and marks read after navigation', async () => {
  const apiSource = await readFile(new URL('../src/frontend/api-sync.mjs', import.meta.url), 'utf8');
  const parentSource = await readFile(new URL('../src/frontend/parent-portal.mjs', import.meta.url), 'utf8');
  assert.match(apiSource, /destination === 'lesson'.*selectedLesson/s);
  assert.match(apiSource, /destination === 'child'.*selectedChild/s);
  assert.match(apiSource, /\/notifications\/\$\{encodeURIComponent\(link\.notificationId\)\}\/read/);
  assert.match(parentSource, /openPushDestination/);
  assert.match(parentSource, /\['home', 'schedule', 'payments', 'photos'\]/);
  assert.match(parentSource, /\/parent\/notifications\/\$\{notificationId\}\/read/);
  assert.match(apiSource, /showLogin\(\)/);
  assert.match(apiSource, /afterAuthenticatedLoad\(profile\)/);
});

test('push migration and worker are durable, per-device and atomically claimed', async () => {
  const migration = await readFile(new URL('../database/migrations/019_web_push_notifications.sql', import.meta.url), 'utf8');
  const pushSource = await readFile(new URL('../backend/src/web-push.mjs', import.meta.url), 'utf8');
  assert.match(migration, /CREATE TABLE web_push_subscriptions/);
  assert.match(migration, /UNIQUE KEY uq_web_push_endpoint_hash/);
  assert.match(migration, /CREATE TABLE push_deliveries/);
  assert.match(migration, /UNIQUE KEY uq_push_delivery_notification_subscription/);
  assert.match(migration, /CREATE TABLE user_notification_settings/);
  assert.match(pushSource, /FOR UPDATE SKIP LOCKED/);
  assert.match(pushSource, /attempts<:maxAttempts/);
  assert.match(pushSource, /\[404, 410\]/);
  assert.match(pushSource, /status === 429 \|\| status >= 500/);
  assert.match(pushSource, /n\.user_id=s\.user_id/);
});

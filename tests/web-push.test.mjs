import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
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

test('missing VAPID configuration disables push cleanly and public config never exposes private key', () => {
  const disabled = createWebPushService({ query: async () => { throw new Error('DB must not be touched'); } }, {
    config: { enabled: true, publicKey: 'public-only', privateKey: null, subject: 'mailto:test@example.com' },
  });
  assert.deepEqual(disabled.publicConfig(), { enabled: false, publicKey: null });
  assert.equal('privateKey' in disabled.publicConfig(), false);

  const enabled = createWebPushService({ query: async () => { throw new Error('DB must not be touched'); } }, {
    config: pushConfig, sender: { setVapidDetails() {}, sendNotification: async () => {} },
  });
  assert.deepEqual(enabled.publicConfig(), { enabled: true, publicKey: 'public' });
  assert.equal('privateKey' in enabled.publicConfig(), false);
});

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

test('expired short-lived delivery is not sent to provider', async () => {
  const fixture = pushPoolFixture();
  fixture.state.deliveries.push({ id: 3, notification_id: 3, subscription_id: 1, status: 'sending' });
  let sends = 0;
  const service = createWebPushService(fixture.pool, {
    config: pushConfig, now: () => new Date('2026-09-25T10:30:00Z'),
    sender: { sendNotification: async () => { sends += 1; } },
  });
  const result = await service.sendRow({ id: 3, attempts: 1, notification_id: 3, notification_type: 'teacher_lesson_start_reminder',
    title: 'Start', body: 'Body', destination: 'lesson', entity_type: 'lesson', entity_id: 9,
    created_at: '2026-09-25 18:00:00.000000', subscription_id: 1,
    endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth });
  assert.equal(result.status, 'expired');
  assert.equal(sends, 0);
  assert.equal(fixture.state.deliveries[0].status, 'failed');
});

test('temporary provider failure stops retrying after max attempts', async () => {
  const fixture = pushPoolFixture();
  fixture.state.deliveries.push({ id: 4, notification_id: 4, subscription_id: 1, status: 'sending' });
  const service = createWebPushService(fixture.pool, {
    config: pushConfig, now: () => new Date('2026-09-25T08:00:00Z'),
    sender: { sendNotification: async () => { const error = new Error('temporary'); error.statusCode = 503; throw error; } },
  });
  await service.sendRow({ id: 4, attempts: 5, notification_id: 4, notification_type: 'teacher_lesson_soon',
    title: 'Soon', body: 'Body', destination: 'lesson', entity_type: 'lesson', entity_id: 9,
    created_at: '2026-09-25 18:55:00.000000', subscription_id: 1,
    endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth });
  assert.equal(fixture.state.deliveries[0].status, 'failed');
});

test('subscription validation requires endpoint and both Web Push keys', () => {
  assert.deepEqual(normalizePushSubscription(subscription), {
    endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth,
  });
  assert.throws(() => normalizePushSubscription({ endpoint: subscription.endpoint, keys: {} }), /Некорректная/);
});

test('all seven parent notification types default true and generic role defaults match product rules', () => {
  assert.equal(PARENT_NOTIFICATION_TYPES.length, 7);
  assert.ok(PARENT_NOTIFICATION_TYPES.every((item) => item.defaultEnabled === true));
  const teacher = settingsForRole('teacher'); const director = settingsForRole('director'); const partner = settingsForRole('partner');
  assert.equal(teacher.length, 8); assert.ok(teacher.every((item) => item.defaultEnabled));
  assert.equal(director.length, 9); assert.ok(director.every((item) => item.defaultEnabled));
  assert.equal(partner.length, 7);
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
    if (sql.includes('FROM child_guardians cg') && sql.includes('parent_notification_settings')) return [[{ user_id: 10, enabled: 1 }]];
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

test('mutation points keep actor suppression, current group names and project-scoped partner lookup', async () => {
  const source = await readFile(new URL('../backend/src/notification-events.mjs', import.meta.url), 'utf8');
  assert.match(source, /actorUserId != null && same\(actorUserId, userId\)/);
  assert.match(source, /SELECT g\.id,g\.name,g\.project_id/);
  assert.match(source, /createForPartners\(connection, group\.project_id/);
  assert.match(source, /p\.id=:projectId/);
});

test('teacher quick-child mutation does not also emit a separate child-added-group event', async () => {
  const source = await readFile(new URL('../backend/src/lessons.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('async function quickChild');
  const end = source.indexOf('async function salaryAccruals', start);
  const block = source.slice(start, end);
  assert.match(block, /notificationEvents\.quickChildCreated/);
  assert.doesNotMatch(block, /notificationEvents\.childAddedToGroup/);
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

test('service worker runtime parses push payload, shows tagged notification and focuses/navigates existing CRM window', async () => {
  const source = await readFile(new URL('../service-worker.js', import.meta.url), 'utf8');
  const handlers = {}; const shown = []; const navigations = []; let focused = 0; let closed = 0;
  const client = {
    url: 'https://crm.example/app/',
    async navigate(url) { navigations.push(url); this.url = url; return this; },
    async focus() { focused += 1; return this; },
  };
  const context = {
    URL,
    self: {
      registration: {
        scope: 'https://crm.example/app/',
        async showNotification(title, options) { shown.push({ title, options }); },
      },
      location: { origin: 'https://crm.example' },
      addEventListener(type, handler) { handlers[type] = handler; },
    },
    clients: {
      async matchAll() { return [client]; },
      async openWindow(url) { throw new Error('openWindow must not be used when CRM window exists: ' + url); },
    },
    caches: { open: async () => ({ addAll: async () => {}, put: async () => {}, match: async () => null }), keys: async () => [] },
    fetch: async () => ({ ok: true, clone() { return this; } }),
  };
  runInNewContext(source, context, { filename: 'service-worker.js' });
  let pending;
  handlers.push({
    data: { json: () => ({
      notificationId: '123', type: 'teacher_lesson_moved', title: 'Занятие перенесено', body: 'Новое время',
      destination: 'lesson', entityType: 'lesson', entityId: '456', tag: 'lesson-move-456',
    }) },
    waitUntil(value) { pending = value; },
  });
  await pending;
  assert.equal(shown.length, 1);
  assert.equal(shown[0].title, 'Занятие перенесено');
  assert.equal(shown[0].options.body, 'Новое время');
  assert.equal(shown[0].options.tag, 'lesson-move-456');
  assert.equal(shown[0].options.data.notificationId, '123');
  assert.equal(shown[0].options.data.entityId, '456');

  handlers.notificationclick({
    notification: { data: shown[0].options.data, close() { closed += 1; } },
    waitUntil(value) { pending = value; },
  });
  await pending;
  assert.equal(closed, 1);
  assert.equal(focused, 1);
  assert.equal(navigations.length, 1);
  const target = new URL(navigations[0]);
  assert.equal(target.searchParams.get('pushNotification'), '123');
  assert.equal(target.searchParams.get('destination'), 'lesson');
  assert.equal(target.searchParams.get('entityType'), 'lesson');
  assert.equal(target.searchParams.get('entityId'), '456');
});

test('test notification uses the backend delivery pipeline and real Web Push sender hook', async () => {
  const state = { sent: 0, markedSent: 0 };
  const claimed = {
    id: 1, attempts: 1, notification_id: 99, notification_type: 'push_test',
    title: 'Тестовое уведомление', body: 'Уведомления iCube работают.', destination: 'home',
    entity_type: null, entity_id: null, created_at: '2026-09-25 18:55:00.000000',
    subscription_id: 5, endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth,
  };
  const query = async (sql) => {
    if (sql.includes('SELECT pd.id FROM push_deliveries')) return [[{ id: 1 }]];
    if (sql.startsWith("UPDATE push_deliveries SET status='sending'")) return [{ affectedRows: 1 }];
    if (sql.includes('FROM push_deliveries pd JOIN notifications n')) return [[claimed]];
    if (sql.startsWith("UPDATE push_deliveries SET status='sent'")) { state.markedSent += 1; return [{ affectedRows: 1 }]; }
    throw new Error('Unexpected test-push SQL: ' + sql);
  };
  const connection = { query, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {} };
  const pool = { query, getConnection: async () => connection };
  const notificationEvents = {
    async createUser(_connection, payload) {
      assert.equal(payload.type, 'push_test');
      assert.equal(payload.userId, 20);
      assert.equal(payload.respectSettings, false);
      return '99';
    },
  };
  const sender = { async sendNotification(_subscription, payload) {
    state.sent += 1;
    const parsed = JSON.parse(payload);
    assert.equal(parsed.notificationId, '99');
    assert.equal(parsed.type, 'push_test');
    assert.equal(parsed.title, 'Тестовое уведомление');
  } };
  const service = createWebPushService(pool, {
    config: pushConfig, notificationEvents, sender, now: () => new Date('2026-09-25T08:05:00Z'),
  });
  const result = await service.createTestNotification({ userId: 20, roles: ['teacher'] });
  assert.equal(result.notificationId, '99');
  assert.equal(state.sent, 1);
  assert.equal(state.markedSent, 1);
});

test('push frontend uses capability detection, explicit permission button and backend test path', async () => {
  const source = await readFile(new URL('../src/frontend/push-client.mjs', import.meta.url), 'utf8');
  assert.match(source, /navigator\?\.serviceWorker.*PushManager.*Notification/s);
  assert.match(source, /Notification\.requestPermission\(\)/);
  assert.match(source, /onclick="icubePush\.enable\(\)">Разрешить уведомления/);
  assert.match(source, /api\.request\('\/push\/test'/);
  assert.doesNotMatch(source, /new Notification\(/);
  assert.match(source, /Для уведомлений на iPhone добавьте АйКуб на экран «Домой»/);
});

test('bell is an internal notification inbox independent from Web Push settings', async () => {
  const source = await readFile(new URL('../src/frontend/push-client.mjs', import.meta.url), 'utf8');
  const panel = source.slice(source.indexOf('function pushPanelMarkup'), source.indexOf('function renderPushPanel'));
  assert.match(panel, /Новых уведомлений нет/);
  assert.match(panel, /Прочитать все/);
  assert.match(panel, /История уведомлений/);
  assert.doesNotMatch(panel, /pushStatusText|Включить уведомления|Отключить уведомления|Как установить приложение/);
  assert.match(source, /state\.notifications\.filter\(\(item\) => !item\.readAt\)\.length/);
  assert.match(source, /api\.request\(`\$\{inboxBase\(\)\}\/read-all`/);
  assert.match(source, /if \(!item\.readAt\) await api\.request/);
  assert.match(source, /item\.readAt = item\.readAt \?\? new Date\(\)\.toISOString\(\)/);
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

test('one logical notification enqueues one delivery per active device and deduplicates repeated generation', async () => {
  const subscriptions = [
    { id: 1, user_id: 20, disabled_at: null },
    { id: 2, user_id: 20, disabled_at: null },
    { id: 3, user_id: 20, disabled_at: new Date() },
    { id: 4, user_id: 21, disabled_at: null },
  ];
  const state = { notifications: [], deliveries: [], nextId: 1 };
  const connection = { query: async (sql, params = {}) => {
    if (sql.startsWith('SELECT enabled FROM user_notification_settings')) return [[]];
    if (sql.startsWith('INSERT IGNORE INTO notifications')) {
      const existing = state.notifications.find((row) => String(row.userId) === String(params.userId) && row.dedupKey === params.dedupKey);
      if (existing) return [{ affectedRows: 0, insertId: 0 }];
      const row = { id: state.nextId++, ...params }; state.notifications.push(row);
      return [{ affectedRows: 1, insertId: row.id }];
    }
    if (sql.startsWith('SELECT id FROM notifications')) {
      const row = state.notifications.find((item) => String(item.userId) === String(params.userId) && item.dedupKey === params.dedupKey);
      return [[row ? { id: row.id } : undefined].filter(Boolean)];
    }
    if (sql.startsWith('INSERT IGNORE INTO push_deliveries')) {
      for (const sub of subscriptions.filter((item) => String(item.user_id) === String(params.userId) && item.disabled_at == null)) {
        if (!state.deliveries.some((item) => item.notificationId === Number(params.notificationId) && item.subscriptionId === sub.id)) {
          state.deliveries.push({ notificationId: Number(params.notificationId), subscriptionId: sub.id });
        }
      }
      return [{ affectedRows: 0 }];
    }
    throw new Error('Unexpected multi-device SQL: ' + sql);
  } };
  const events = createNotificationEvents({ query: connection.query });
  const payload = {
    userId: 20, roleCode: 'teacher', type: 'teacher_lesson_moved', title: 'Move', body: 'Body',
    entityType: 'lesson', entityId: 90, destination: 'lesson', dedupKey: 'teacher:lesson_move:90:20260925160000',
  };
  await events.createUser(connection, payload);
  await events.createUser(connection, payload);
  assert.equal(state.notifications.length, 1);
  assert.deepEqual(state.deliveries, [
    { notificationId: 1, subscriptionId: 1 },
    { notificationId: 1, subscriptionId: 2 },
  ]);
});

test('push worker is a separate persistent minute job and normal API server does not depend on starting it', async () => {
  const [worker, service, timer, pkg, server] = await Promise.all([
    readFile(new URL('../backend/src/push-worker.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../deploy/icube-crm-push.service', import.meta.url), 'utf8'),
    readFile(new URL('../deploy/icube-crm-push.timer', import.meta.url), 'utf8'),
    readFile(new URL('../package.json', import.meta.url), 'utf8'),
    readFile(new URL('../backend/src/server.mjs', import.meta.url), 'utf8'),
  ]);
  assert.match(worker, /export async function runPushWorker/);
  assert.match(worker, /scheduler\.generate\(\)/);
  assert.match(worker, /push\.processPending/);
  assert.match(service, /Type=oneshot/);
  assert.match(service, /npm run push:worker/);
  assert.match(timer, /OnCalendar=\*-\*-\* \*:\*:00/);
  assert.match(timer, /Persistent=true/);
  assert.equal(JSON.parse(pkg).scripts['push:worker'], 'node backend/src/push-worker.mjs');
  assert.doesNotMatch(server, /push-worker\.mjs|runPushWorker/);
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


function notificationEventFixture({ directors = [10, 11], partnersByProject = { 1: [31], 2: [30] }, settings = {} } = {}) {
  const state = { notifications: [], nextId: 1 };
  const groups = {
    4: { id: 4, name: 'Школа №1 · Пн · 16:00', project_id: 2, default_teacher_id: 7 },
    5: { id: 5, name: 'Чужой проект', project_id: 1, default_teacher_id: 8 },
  };
  const teacherUsers = { 7: 20, 8: 21 };
  async function query(sql, params = {}) {
    if (sql.startsWith('SELECT enabled FROM user_notification_settings')) {
      const key = String(params.userId) + ':' + params.type;
      return [Object.hasOwn(settings, key) ? [{ enabled: settings[key] ? 1 : 0 }] : []];
    }
    if (sql.startsWith('SELECT g.id,g.name,g.project_id,g.default_teacher_id,c.full_name child_name')) {
      const group = groups[Number(params.groupId)];
      return [[group ? { ...group, child_name: 'Ребёнок ' + params.childId } : undefined].filter(Boolean)];
    }
    if (sql.startsWith('SELECT g.id,g.name,g.project_id,g.default_teacher_id')) {
      const group = groups[Number(params.groupId)];
      return [[group].filter(Boolean)];
    }
    if (sql.startsWith('SELECT u.id user_id FROM teachers')) {
      const userId = teacherUsers[Number(params.teacherId)];
      return [[userId ? { user_id: userId } : undefined].filter(Boolean)];
    }
    if (sql.startsWith('SELECT DISTINCT u.id user_id FROM users u')) {
      return [params.role === 'director' ? directors.map((user_id) => ({ user_id })) : []];
    }
    if (sql.startsWith('SELECT DISTINCT u.id user_id FROM projects p')) {
      return [(partnersByProject[Number(params.projectId)] ?? []).map((user_id) => ({ user_id }))];
    }
    if (sql.startsWith('SELECT l.id,l.project_id_snapshot,l.planned_teacher_id,l.actual_teacher_id,')) {
      return [[{ id: Number(params.lessonId), project_id_snapshot: 2, planned_teacher_id: 7, actual_teacher_id: null,
        group_name: 'Школа №1 · Пн · 16:00', child_name: 'Иван Иванов' }]];
    }
    if (sql.startsWith('SELECT e.id,e.child_id,c.full_name FROM child_enrollments')) {
      return [[{ id: Number(params.enrollmentId), child_id: 77, full_name: 'Иван Иванов' }]];
    }
    if (sql.startsWith('INSERT IGNORE INTO notifications')) {
      const duplicate = state.notifications.find((row) => String(row.userId) === String(params.userId) && row.dedupKey === params.dedupKey);
      if (duplicate) return [{ affectedRows: 0, insertId: 0 }];
      const row = { id: state.nextId++, ...params };
      state.notifications.push(row);
      return [{ affectedRows: 1, insertId: row.id }];
    }
    if (sql.startsWith('SELECT id FROM notifications')) {
      const row = state.notifications.find((item) => String(item.userId) === String(params.userId) && item.dedupKey === params.dedupKey);
      return [[row ? { id: row.id } : undefined].filter(Boolean)];
    }
    if (sql.startsWith('INSERT IGNORE INTO push_deliveries')) return [{ affectedRows: 0 }];
    throw new Error('Unexpected notification-event SQL: ' + sql);
  }
  return { state, connection: { query }, pool: { query } };
}

test('lesson move suppresses the actor but still notifies teacher, another director and only the partner of the lesson project', async () => {
  const fixture = notificationEventFixture();
  const events = createNotificationEvents(fixture.pool);
  await events.lessonMoved(fixture.connection, {
    lesson: { id: 90, group_id: 4, planned_teacher_id: 7, actual_teacher_id: null, starts_at: '2026-09-28 16:00:00' },
    previousStartsAt: '2026-09-28 15:00:00', actorUserId: 10,
  });
  const recipients = fixture.state.notifications.map((row) => [row.type, Number(row.userId), row.projectId == null ? null : Number(row.projectId)]);
  assert.deepEqual(recipients, [
    ['teacher_lesson_moved', 20, 2],
    ['director_lesson_moved', 11, null],
    ['partner_lesson_moved', 30, 2],
  ]);
  assert.ok(fixture.state.notifications.every((row) => row.body.includes('Школа №1 · Пн · 16:00')));
  assert.equal(fixture.state.notifications.some((row) => Number(row.userId) === 10), false);
  assert.equal(fixture.state.notifications.some((row) => Number(row.userId) === 31), false);
});

test('partner lesson move suppresses the acting partner while still notifying teacher and directors', async () => {
  const fixture = notificationEventFixture({ directors: [10], partnersByProject: { 2: [30] } });
  const events = createNotificationEvents(fixture.pool);
  await events.lessonMoved(fixture.connection, {
    lesson: { id: 90, group_id: 4, planned_teacher_id: 7, starts_at: '2026-09-28 16:00:00' },
    previousStartsAt: '2026-09-28 15:00:00', actorUserId: 30,
  });
  assert.equal(fixture.state.notifications.some((row) => Number(row.userId) === 30), false);
  assert.equal(fixture.state.notifications.some((row) => row.type === 'teacher_lesson_moved' && Number(row.userId) === 20), true);
  assert.equal(fixture.state.notifications.some((row) => row.type === 'director_lesson_moved' && Number(row.userId) === 10), true);
});

test('all immediate partner event families stay inside the group project', async () => {
  const fixture = notificationEventFixture({ directors: [] });
  const events = createNotificationEvents(fixture.pool);
  const lesson = { id: 90, group_id: 4, planned_teacher_id: 7, actual_teacher_id: null, starts_at: '2026-09-28 16:00:00' };
  await events.quickChildCreated(fixture.connection, { lesson, childId: 77, childName: 'Иван Иванов', actorUserId: 99 });
  await events.childAddedToGroup(fixture.connection, { groupId: 4, childId: 77, actorUserId: 99, causeKey: 'membership-1' });
  await events.lessonMoved(fixture.connection, { lesson, previousStartsAt: '2026-09-28 15:00:00', actorUserId: 99 });
  await events.lessonCancelled(fixture.connection, { lesson, actorUserId: 99 });
  const partnerRows = fixture.state.notifications.filter((row) => String(row.roleCode) === 'partner');
  assert.deepEqual(partnerRows.map((row) => row.type).sort(), [
    'partner_child_added_group', 'partner_lesson_cancelled', 'partner_lesson_moved', 'partner_quick_child_created',
  ]);
  assert.ok(partnerRows.every((row) => Number(row.userId) === 30 && Number(row.projectId) === 2));
  assert.equal(partnerRows.some((row) => Number(row.userId) === 31), false);
});

test('teacher immediate event families are delivered to the assigned teacher and self child-add is suppressed', async () => {
  const fixture = notificationEventFixture({ directors: [] });
  const events = createNotificationEvents(fixture.pool);
  const lesson = { id: 90, group_id: 4, planned_teacher_id: 7, actual_teacher_id: null, starts_at: '2026-09-28 16:00:00' };
  await events.lessonMoved(fixture.connection, { lesson, previousStartsAt: '2026-09-28 15:00:00', actorUserId: 99 });
  await events.lessonCancelled(fixture.connection, { lesson, actorUserId: 99 });
  await events.childAddedToGroup(fixture.connection, { groupId: 4, childId: 77, actorUserId: 99, causeKey: 'membership-teacher' });
  await events.absenceNotice(fixture.connection, { lessonId: 90, childId: 77, actorUserId: 50 });
  const teacherRows = fixture.state.notifications.filter((row) => String(row.roleCode) === 'teacher');
  assert.deepEqual(teacherRows.map((row) => row.type).sort(), [
    'teacher_absence_notice', 'teacher_child_added', 'teacher_lesson_cancelled', 'teacher_lesson_moved',
  ]);
  assert.ok(teacherRows.every((row) => Number(row.userId) === 20));
  const before = teacherRows.length;
  await events.childAddedToGroup(fixture.connection, { groupId: 4, childId: 78, actorUserId: 20, causeKey: 'membership-self' });
  assert.equal(fixture.state.notifications.filter((row) => String(row.roleCode) === 'teacher').length, before);
});

test('director immediate events cover quick child, move, cancel and existing child group add without notifying the acting director', async () => {
  const fixture = notificationEventFixture({ directors: [10, 11], partnersByProject: {} });
  const events = createNotificationEvents(fixture.pool);
  const lesson = { id: 90, group_id: 4, planned_teacher_id: 7, actual_teacher_id: null, starts_at: '2026-09-28 16:00:00' };
  await events.quickChildCreated(fixture.connection, { lesson, childId: 77, childName: 'Иван Иванов', actorUserId: 10 });
  await events.lessonMoved(fixture.connection, { lesson, previousStartsAt: '2026-09-28 15:00:00', actorUserId: 10 });
  await events.lessonCancelled(fixture.connection, { lesson, actorUserId: 10 });
  await events.childAddedToGroup(fixture.connection, { groupId: 4, childId: 78, actorUserId: 10, causeKey: 'membership-director' });
  const directorRows = fixture.state.notifications.filter((row) => String(row.roleCode) === 'director');
  assert.ok(directorRows.every((row) => Number(row.userId) === 11));
  assert.deepEqual(directorRows.map((row) => row.type).sort(), [
    'director_child_added_group', 'director_lesson_cancelled', 'director_lesson_moved', 'director_quick_child_created',
  ]);
});

test('debt crossing callers use mutation-unique keys so recovery can be followed by a new crossing', async () => {
  const [lessons, payments, routes] = await Promise.all([
    readFile(new URL('../backend/src/lessons.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../backend/src/payments.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../backend/src/routes.mjs', import.meta.url), 'utf8'),
  ]);
  assert.match(lessons, /causeKey: `balance-entry-\${entry\.insertId}`/);
  assert.match(payments, /causeKey: `payment-remove-\${paymentId}`/);
  assert.match(payments, /causeKey: `payment-update-\${paymentId}-\${String\(old\.updated_at/);
  assert.match(routes, /payments = createMysqlPayments\(pool, \{ notificationEvents \}\)/);
  assert.match(routes, /payments\.remove\(request\.params\.id, \{[\s\S]*?actorUserId:/);
});

test('debt threshold can notify again only after balance recovered above -2 and crosses the threshold again', async () => {
  const fixture = notificationEventFixture({ directors: [10], partnersByProject: {} });
  const events = createNotificationEvents(fixture.pool);
  await events.debtThreshold(fixture.connection, { enrollmentId: 55, before: -1, after: -2, causeKey: 'attendance-1', actorUserId: 99 });
  await events.debtThreshold(fixture.connection, { enrollmentId: 55, before: -2, after: -3, causeKey: 'attendance-2', actorUserId: 99 });
  await events.debtThreshold(fixture.connection, { enrollmentId: 55, before: -3, after: 0, causeKey: 'payment-1', actorUserId: 99 });
  await events.debtThreshold(fixture.connection, { enrollmentId: 55, before: 0, after: -2, causeKey: 'attendance-3', actorUserId: 99 });
  const rows = fixture.state.notifications.filter((row) => row.type === 'director_debt_threshold');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.dedupKey), [
    'director:debt:55:attendance-1',
    'director:debt:55:attendance-3',
  ]);
});

test('partner overdue notification types are default-off but explicit true enables them', async () => {
  const off = notificationEventFixture({ directors: [], partnersByProject: {} });
  const offEvents = createNotificationEvents(off.pool);
  await offEvents.createUser(off.connection, {
    userId: 30, roleCode: 'partner', projectId: 2, type: 'partner_lesson_not_started',
    title: 'Late', body: 'Body', entityType: 'lesson', entityId: 90, destination: 'lesson', dedupKey: 'partner:late:90',
  });
  assert.equal(off.state.notifications.length, 0);

  const on = notificationEventFixture({ directors: [], partnersByProject: {}, settings: { '30:partner_lesson_not_started': true } });
  const onEvents = createNotificationEvents(on.pool);
  await onEvents.createUser(on.connection, {
    userId: 30, roleCode: 'partner', projectId: 2, type: 'partner_lesson_not_started',
    title: 'Late', body: 'Body', entityType: 'lesson', entityId: 90, destination: 'lesson', dedupKey: 'partner:late:90',
  });
  assert.equal(on.state.notifications.length, 1);
});

test('explicit parent false remains stronger than the new default true', async () => {
  let inserts = 0;
  const pool = { query: async (sql) => {
    if (sql.includes('FROM child_guardians cg') && sql.includes('parent_notification_settings')) {
      return [[{ user_id: 10, guardian_id: 5, enabled: 0 }]];
    }
    if (sql.startsWith('INSERT IGNORE INTO notifications')) { inserts += 1; return [{ affectedRows: 1 }]; }
    throw new Error('Unexpected parent preference SQL: ' + sql);
  } };
  const service = createParentNotifications(pool);
  const created = await service.createForChild(pool, {
    childId: 5, type: 'lesson_move', data: { startsAt: '2026-09-28 16:00:00', previousStartsAt: '2026-09-28 15:00:00' },
    referenceType: 'lesson', referenceId: 90, dedupKey: 'parent:move:90',
  });
  assert.equal(created, 0);
  assert.equal(inserts, 0);
});

test('generic saved false suppresses the logical notification before outbox delivery is created', async () => {
  const fixture = notificationEventFixture({ directors: [], settings: { '20:teacher_lesson_moved': false } });
  const events = createNotificationEvents(fixture.pool);
  await events.lessonMoved(fixture.connection, {
    lesson: { id: 90, group_id: 4, planned_teacher_id: 7, starts_at: '2026-09-28 16:00:00' },
    previousStartsAt: '2026-09-28 15:00:00', actorUserId: 99,
  });
  assert.equal(fixture.state.notifications.some((row) => row.type === 'teacher_lesson_moved'), false);
});

function schedulerFixture(rows, { directors = [{ user_id: 10 }], partnersByProject = { 2: [{ user_id: 30 }] } } = {}) {
  const created = [];
  const notificationEvents = {
    roleUsers: async (_connection, role) => role === 'director' ? directors : [],
    teacherUser: async (_connection, teacherId) => teacherId == null ? null : ({ user_id: 100 + Number(teacherId) }),
    partnerUsers: async (_connection, projectId) => partnersByProject[Number(projectId)] ?? [],
    createUser: async (_connection, payload) => { created.push(payload); return String(created.length); },
  };
  const connection = { query: async (sql) => {
    if (sql.includes('JOIN child_enrollments')) return [[]];
    if (sql.includes('FROM lessons l JOIN study_groups g')) return [rows];
    return [[]];
  } };
  return { created, notificationEvents, connection };
}

test('scheduler enforces soon/start/overdue-start/finish/overdue-finish conditions from current lesson status', async () => {
  const rows = [
    { id: 1, project_id_snapshot: 2, planned_teacher_id: 7, actual_teacher_id: null, default_teacher_id: 7,
      starts_at: '2026-09-25 16:59:00', ends_at: '2026-09-25 18:00:00', status: 'scheduled', group_name: 'G1' },
    { id: 2, project_id_snapshot: 2, planned_teacher_id: 7, actual_teacher_id: null, default_teacher_id: 7,
      starts_at: '2026-09-25 16:00:00', ends_at: '2026-09-25 17:00:00', status: 'scheduled', group_name: 'G2' },
    { id: 3, project_id_snapshot: 2, planned_teacher_id: 7, actual_teacher_id: null, default_teacher_id: 7,
      starts_at: '2026-09-25 15:44:00', ends_at: '2026-09-25 17:00:00', status: 'scheduled', group_name: 'G3' },
    { id: 4, project_id_snapshot: 2, planned_teacher_id: 7, actual_teacher_id: 7, default_teacher_id: 7,
      starts_at: '2026-09-25 15:00:00', ends_at: '2026-09-25 16:00:00', status: 'in_progress', group_name: 'G4' },
    { id: 5, project_id_snapshot: 2, planned_teacher_id: 7, actual_teacher_id: 7, default_teacher_id: 7,
      starts_at: '2026-09-25 14:00:00', ends_at: '2026-09-25 15:29:00', status: 'in_progress', group_name: 'G5' },
    { id: 6, project_id_snapshot: 2, planned_teacher_id: 7, actual_teacher_id: 7, default_teacher_id: 7,
      starts_at: '2026-09-25 14:00:00', ends_at: '2026-09-25 15:00:00', status: 'completed', group_name: 'G6' },
    { id: 7, project_id_snapshot: 2, planned_teacher_id: 7, actual_teacher_id: null, default_teacher_id: 7,
      starts_at: '2026-09-25 14:00:00', ends_at: '2026-09-25 15:00:00', status: 'cancelled', group_name: 'G7' },
  ];
  const fixture = schedulerFixture(rows);
  const scheduler = createPushScheduler({ query: async () => [[]] }, { notificationEvents: fixture.notificationEvents });
  await scheduler.generateLessons(fixture.connection, { day: '2026-09-25', time: '16:00:00', sql: '2026-09-25 16:00:00' });
  const byLesson = (id) => fixture.created.filter((item) => Number(item.entityId) === id).map((item) => item.type).sort();
  assert.deepEqual(byLesson(1), ['teacher_lesson_soon']);
  assert.deepEqual(byLesson(2), ['teacher_lesson_start_reminder']);
  assert.deepEqual(byLesson(3), ['director_lesson_not_started', 'partner_lesson_not_started']);
  assert.deepEqual(byLesson(4), ['teacher_lesson_finish_reminder']);
  assert.deepEqual(byLesson(5), ['director_lesson_not_finished', 'partner_lesson_not_finished']);
  assert.deepEqual(byLesson(6), []);
  assert.deepEqual(byLesson(7), []);
});

test('scheduler partner overdue events use the lesson project when selecting recipients', async () => {
  const rows = [
    { id: 8, project_id_snapshot: 1, planned_teacher_id: 8, actual_teacher_id: null, default_teacher_id: 8,
      starts_at: '2026-09-25 15:40:00', ends_at: '2026-09-25 17:00:00', status: 'scheduled', group_name: 'P1' },
    { id: 9, project_id_snapshot: 2, planned_teacher_id: 7, actual_teacher_id: 7, default_teacher_id: 7,
      starts_at: '2026-09-25 14:00:00', ends_at: '2026-09-25 15:20:00', status: 'in_progress', group_name: 'P2' },
  ];
  const fixture = schedulerFixture(rows, { directors: [], partnersByProject: { 1: [{ user_id: 31 }], 2: [{ user_id: 30 }] } });
  const scheduler = createPushScheduler({ query: async () => [[]] }, { notificationEvents: fixture.notificationEvents });
  await scheduler.generateLessons(fixture.connection, { day: '2026-09-25', time: '16:00:00', sql: '2026-09-25 16:00:00' });
  const partner = fixture.created.filter((item) => item.roleCode === 'partner');
  assert.deepEqual(partner.map((item) => [item.type, Number(item.userId), Number(item.projectId)]).sort(), [
    ['partner_lesson_not_finished', 30, 2],
    ['partner_lesson_not_started', 31, 1],
  ]);
});

test('scheduler birthday creates one teacher notification per child/day even with two lessons', async () => {
  const created = [];
  const notificationEvents = {
    teacherUser: async () => ({ user_id: 107 }),
    createUser: async (_connection, payload) => { created.push(payload); return String(created.length); },
  };
  const scheduler = createPushScheduler({ query: async () => [[]] }, { notificationEvents });
  const connection = { query: async () => [[
    { lesson_id: 1, project_id_snapshot: 2, planned_teacher_id: 7, actual_teacher_id: null, default_teacher_id: 7,
      child_id: 77, full_name: 'Иван Иванов', birth_date: '2018-09-25' },
    { lesson_id: 2, project_id_snapshot: 2, planned_teacher_id: 7, actual_teacher_id: null, default_teacher_id: 7,
      child_id: 77, full_name: 'Иван Иванов', birth_date: '2018-09-25' },
    { lesson_id: 3, project_id_snapshot: 2, planned_teacher_id: 7, actual_teacher_id: null, default_teacher_id: 7,
      child_id: 78, full_name: 'Не именинник', birth_date: '2018-09-24' },
  ]] };
  await scheduler.generateBirthdays(connection, { day: '2026-09-25', time: '15:00:00', sql: '2026-09-25 15:00:00' });
  assert.equal(created.length, 1);
  assert.equal(created[0].type, 'teacher_child_birthday');
  assert.equal(created[0].dedupKey, 'teacher:birthday:7:77:2026-09-25');
});

test('scheduler calls configurable parent day-before generation only from the configured Sakhalin time onward', async () => {
  function poolFixture() {
    const connection = { query: async () => [[]], beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {} };
    return { query: connection.query, getConnection: async () => connection };
  }
  const calls = [];
  const notificationEvents = {
    roleUsers: async () => [], teacherUser: async () => null, partnerUsers: async () => [], createUser: async () => null,
  };
  const before = createPushScheduler(poolFixture(), {
    notificationEvents, parentNotifications: { generateDayBefore: async (day) => { calls.push(day); return { created: 0 }; } },
    reminderTime: '19:00', now: () => new Date('2026-09-25T07:59:00Z'),
  });
  await before.generate();
  assert.deepEqual(calls, []);
  const atTime = createPushScheduler(poolFixture(), {
    notificationEvents, parentNotifications: { generateDayBefore: async (day) => { calls.push(day); return { created: 0 }; } },
    reminderTime: '19:00', now: () => new Date('2026-09-25T08:00:00Z'),
  });
  await atTime.generate();
  assert.deepEqual(calls, ['2026-09-26']);
});

test('frontend logout unbinds current endpoint before session logout and login rebind does not request permission automatically', async () => {
  const apiSource = await readFile(new URL('../src/frontend/api-sync.mjs', import.meta.url), 'utf8');
  const pushSource = await readFile(new URL('../src/frontend/push-client.mjs', import.meta.url), 'utf8');
  const logoutStart = apiSource.indexOf('async function logout()');
  const logoutEnd = apiSource.indexOf('function temporaryTeacherParentRole()', logoutStart);
  const logout = apiSource.slice(logoutStart, logoutEnd);
  assert.ok(logout.indexOf('icubePush.unbind()') >= 0);
  assert.ok(logout.indexOf('icubePush.unbind()') < logout.indexOf("api.request('/auth/logout'"));
  const rebindStart = pushSource.indexOf('export async function rebindPush');
  const rebindEnd = pushSource.indexOf('export async function unbindPush', rebindStart);
  const rebind = pushSource.slice(rebindStart, rebindEnd);
  assert.match(rebind, /Notification\.permission !== 'granted'/);
  assert.match(rebind, /getSubscription\(\)/);
  assert.match(rebind, /bind\(subscription\)/);
  assert.doesNotMatch(rebind, /requestPermission/);
});

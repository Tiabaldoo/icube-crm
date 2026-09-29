import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createNotifications } from '../backend/src/notifications.mjs';
import { createReleaseNotes, releaseForRoles } from '../backend/src/release-notes.mjs';
import { openReleaseNote } from '../src/frontend/release-notes.mjs';

function fixture() {
  const rows = []; const calls = [];
  const pool = { async query(sql, p = {}) {
    calls.push({ sql, p });
    if (sql.startsWith('INSERT IGNORE INTO notifications')) {
      if (rows.some((row) => row.user_id === p.userId && row.dedup_key === p.dedupKey)) return [{ affectedRows: 0, insertId: 0 }];
      const row = { id: rows.length + 1, user_id: p.userId, role_code: p.roleCode, recipient_project_id: p.projectId,
        notification_type: p.type, title: p.title, body: p.body, entity_type: p.entityType, entity_id: p.entityId,
        destination: p.destination, dedup_key: p.dedupKey, read_at: null, created_at: '2026-09-29 10:00:00' };
      rows.push(row); return [{ affectedRows: 1, insertId: row.id }];
    }
    if (sql.startsWith('SELECT id,notification_type')) return [rows.filter((row) => String(row.user_id) === String(p.userId)
      && (p.projectId == null || String(row.recipient_project_id) === String(p.projectId)))];
    if (sql.startsWith('SELECT id,user_id,role_code')) return [rows.filter((row) => String(row.id) === p.id)];
    if (sql.startsWith('UPDATE notifications SET read_at')) {
      const selected = rows.filter((row) => p.id ? String(row.id) === p.id : String(row.user_id) === String(p.userId));
      for (const row of selected) row.read_at ??= '2026-09-29 11:00:00';
      return [{ affectedRows: selected.length }];
    }
    throw new Error(`Unexpected SQL (including any push delivery): ${sql}`);
  } };
  return { pool, rows, calls, service: createNotifications(pool) };
}
for (const role of ['director', 'partner', 'teacher']) test(`${role}: personal release stays readable, deduplicates across reload/devices, no push`, async () => {
  const f = fixture(); const actor = { userId: '10', roles: [role], projectIds: ['2'] };
  const [first] = await f.service.list(actor);
  assert.equal(first.type, 'crm_release'); assert.equal(first.readAt, null);
  assert.equal(first.title, 'Обновление 1.1'); assert.equal(first.entityType, 'crm_release');
  assert.equal(f.rows[0].user_id, '10');
  await Promise.all([f.service.list(actor), createNotifications(f.pool).list(actor)]);
  assert.equal(f.rows.length, 1);
  await f.service.markRead(first.id, actor);
  const [read] = await f.service.list(actor); assert.ok(read.readAt); assert.equal(read.id, first.id);
  assert.equal((await createReleaseNotes(f.pool).current(actor)).sections.length, role === 'teacher' ? 2 : 3);
  const other = { ...actor, userId: '11' };
  const [unread] = await f.service.list(other); assert.equal(unread.readAt, null);
  await assert.rejects(f.service.markRead(first.id, other), { status: 403 });
  await f.service.markAllRead(other); assert.ok((await f.service.list(other))[0].readAt);
  assert.equal(f.rows.length, 2);
  assert.ok(f.calls.every(({ sql }) => !/push_deliveries|web_push|user_notification_settings/.test(sql)));
});
test('parent receives no release; mixed roles have one notification and unique sections', async () => {
  const f = fixture(); const release = createReleaseNotes(f.pool);
  await release.ensureNotification({ userId: '20', roles: ['parent'] });
  assert.equal(f.rows.length, 0); assert.equal(await release.current({ roles: ['parent'] }), null);
  const actor = { userId: '30', roles: ['director', 'partner', 'teacher', 'parent'] };
  await f.service.list(actor); await f.service.list(actor); assert.equal(f.rows.length, 1);
  const note = await release.current(actor);
  assert.equal(new Set(note.sections.map((section) => section.title)).size, 3);
});
test('partner release retains existing project scope; foreign notifications stay hidden', async () => {
  const f = fixture(); const actor = { userId: '10', roles: ['partner'], projectIds: ['2'] };
  await f.service.list(actor); assert.equal(f.rows[0].recipient_project_id, '2');
  f.rows.push({ ...f.rows[0], id: 99, recipient_project_id: '3' });
  assert.equal((await f.service.list(actor)).length, 1);
  await assert.rejects(f.service.markRead('99', actor), { status: 403 });
});
test('first and read-history notification clicks both open the standard release detail', async () => {
  const push = await readFile(new URL('../src/frontend/push-client.mjs', import.meta.url), 'utf8');
  const sync = await readFile(new URL('../src/frontend/api-sync.mjs', import.meta.url), 'utf8');
  const notification = { id: '1', readAt: null, destination: 'crm-release', entityType: 'crm_release' };
  const legacy = { state: {}, render() {} }; const calls = [];
  const api = { async request(url) { calls.push(url); return url === '/releases/current' ? releaseForRoles(['teacher']) : {}; } };
  const context = vm.createContext({ state: { notifications: [notification] }, api, legacy,
    authProfile: { roles: ['teacher'] }, inboxBase: () => '/notifications', parentInbox: () => false,
    syncBellIcons() {}, closePushPanel() {}, openReleaseNote, window: { alert(message) { throw new Error(message); } } });
  const destination = sync.slice(sync.indexOf('async function openNotificationDestination('), sync.indexOf('async function handlePushDeepLink('));
  const click = push.slice(push.indexOf('async function openNotification('), push.indexOf('async function runAction('));
  vm.runInContext(`${destination}\n${click}\nwindow.icubeOpenNotification=openNotificationDestination;`, context);
  await context.openNotification('1'); assert.ok(notification.readAt);
  assert.match(legacy.state.modal, /Что нового в версии 1.1/); assert.match(legacy.state.modal, /closeModal\(\)/);
  assert.doesNotMatch(legacy.state.modal, /Смешанные группы/);
  legacy.state.modal = null;
  await context.openNotification('1'); assert.match(legacy.state.modal, /Что нового в версии 1.1/);
  assert.equal(calls.filter((url) => url === '/releases/current').length, 2);
  assert.equal(context.state.notifications.length, 1);
  assert.doesNotMatch(sync, /showReleaseNote|release-notice/);
  assert.doesNotMatch(sync.slice(sync.indexOf('async function afterAuthenticatedLoad'), sync.indexOf('async function loginFromForm')), /release/i);
});
test('manager release detail has all three sections in existing modal', async () => {
  const legacy = { state: {}, render() {} };
  await openReleaseNote({ request: async () => releaseForRoles(['partner']) }, legacy);
  assert.equal((legacy.state.modal.match(/<h4>/g) || []).length, 3);
  assert.match(legacy.state.modal, /Смешанные группы/);
});
test('teacher reload requests scoped inbox and assigns the server data', async () => {
  const source = await readFile(new URL('../src/frontend/api-sync.mjs', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('async function reloadTeacher('), source.indexOf('async function saveSite('));
  const notifications = [{ id: '1', type: 'crm_release' }]; const calls = [];
  const context = vm.createContext({ api: { async list(name) { calls.push(name); return name === 'notifications' ? notifications : []; } },
    authProfile: { teacherId: '4' }, legacy: { state: {}, render() {} }, directories: {},
    mapGroup: (v) => v, mapChild: (v) => v, mapLesson: (v) => v, isoToRu: (v) => v,
    saveTeacherOfflineSnapshot: async () => {}, reapplyQueuedLessonState: async () => {} });
  vm.runInContext(body, context); await context.reloadTeacher();
  assert.ok(calls.includes('notifications')); assert.equal(context.legacy.state.notifications, notifications);
});

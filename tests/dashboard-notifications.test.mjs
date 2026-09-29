import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  calculateDashboardMetrics,
  countActiveChildrenForProject,
  countActiveChildrenTotal,
  countActiveGroups,
  monthlyPaymentAmount,
  installDashboardUi,
} from '../src/frontend/dashboard-ui.mjs';
import { createNotifications } from '../backend/src/notifications.mjs';
import { createDailyDashboard } from '../backend/src/daily-dashboard.mjs';

const partner = { roles: ['partner'], projectIds: ['2'], userId: '17' };
const director = { roles: ['director'], projectIds: [], userId: '1' };
const pool = (query) => ({ query });

test('active children are distinct globally and independently inside each project', () => {
  const children = [
    { id: 1, enrollments: [
      { projectId: 1, status: 'Активный' },
      { projectId: 1, status: 'Активный' },
    ] },
    { id: 2, enrollments: [
      { projectId: 1, status: 'Активный' },
      { projectId: 2, status: 'Активный' },
    ] },
    { id: 3, enrollments: [{ projectId: 2, status: 'Активный' }] },
    { id: 4, enrollments: [{ projectId: 1, status: 'Пауза' }] },
  ];
  assert.equal(countActiveChildrenTotal(children), 3);
  assert.equal(countActiveChildrenForProject(children, 1), 2);
  assert.equal(countActiveChildrenForProject(children, 2), 2);
  assert.equal(countActiveChildrenTotal(children, ['2']), 2);
});

test('active children project count follows current state after project transfer', () => {
  const before = [{ id: 5, enrollments: [{ projectId: 2, status: 'Активный' }] }];
  const after = [{ id: 5, enrollments: [{ projectId: 1, status: 'Активный' }] }];
  assert.equal(countActiveChildrenForProject(before, 2), 1);
  assert.equal(countActiveChildrenForProject(before, 1), 0);
  assert.equal(countActiveChildrenForProject(after, 2), 0);
  assert.equal(countActiveChildrenForProject(after, 1), 1);

  const keepsOldProject = [{ id: 6, enrollments: [
    { projectId: 1, status: 'Активный' },
    { projectId: 2, status: 'Активный' },
  ] }];
  assert.equal(countActiveChildrenForProject(keepsOldProject, 1), 1);
  assert.equal(countActiveChildrenForProject(keepsOldProject, 2), 1);
});

test('active groups count only active groups and split by project', () => {
  const groups = [
    { id: 1, projectId: 1, active: true },
    { id: 2, projectId: 1, active: false },
    { id: 3, projectId: 2, active: true },
    { id: 4, projectId: 2, active: true },
  ];
  assert.equal(countActiveGroups(groups), 3);
  assert.equal(countActiveGroups(groups, 1), 1);
  assert.equal(countActiveGroups(groups, 2), 2);
});

test('monthly payments use payment project snapshot and gross amount', () => {
  const payments = [
    { id: 1, paidOn: '2026-09-01', amount: 4100, projectId: 1 },
    { id: 2, paidOn: '2026-09-02', amount: 4500, projectId: 2 },
    { id: 3, paidOn: '2026-08-31', amount: 7000, projectId: 1 },
  ];
  const now = new Date(2026, 8, 17, 12, 0, 0);
  assert.equal(monthlyPaymentAmount(payments, now), 8600);
  assert.equal(monthlyPaymentAmount(payments, now, 1), 4100);
  assert.equal(monthlyPaymentAmount(payments, now, 2), 4500);
});

test('partner dashboard metrics stay inside its own project', () => {
  const input = {
    projects: [
      { id: 1, name: 'iCubeRobots', active: true },
      { id: 2, name: 'Зебра', active: true },
    ],
    children: [
      { id: 1, enrollments: [{ projectId: 1, status: 'Активный' }] },
      { id: 2, enrollments: [{ projectId: 2, status: 'Активный' }] },
      { id: 3, enrollments: [{ projectId: 1, status: 'Активный' }, { projectId: 2, status: 'Активный' }] },
    ],
    groups: [
      { id: 1, projectId: 1, active: true },
      { id: 2, projectId: 2, active: true },
    ],
    payments: [
      { paidOn: '2026-09-03', amount: 7000, projectId: 1 },
      { paidOn: '2026-09-04', amount: 4500, projectId: 2 },
    ],
  };
  const metrics = calculateDashboardMetrics(input, { now: new Date(2026, 8, 17), projectIds: ['2'] });
  assert.equal(metrics.activeChildren, 2);
  assert.equal(metrics.activeGroups, 1);
  assert.equal(metrics.monthlyPayments, 4500);
  assert.deepEqual(metrics.projects.map((item) => item.name), ['Зебра']);
});

test('dashboard unread notification actions reuse the existing inbox open handler', async () => {
  const notifications = [
    { id: '1', type: 'crm_release', title: 'Release', body: 'Что нового', destination: 'crm-release', entityType: 'crm_release', entityId: null, readAt: null },
    { id: '2', type: 'lesson_move', title: 'Lesson', body: 'Занятие', destination: 'lesson', entityType: 'lesson', entityId: '20', readAt: null },
    { id: '3', type: 'project_change', title: 'Child', body: 'Ребёнок', destination: 'child', entityType: 'child', entityId: '30', readAt: null },
    { id: '4', type: 'group_change', title: 'Group', body: 'Группа', destination: 'group', entityType: 'group', entityId: '40', readAt: null },
    { id: '5', type: 'info', title: 'No destination', body: 'Только текст', destination: 'home', entityType: null, entityId: null, readAt: null },
  ];
  const state = {
    role: 'director', notifications, projects: [], children: [], groups: [], payments: [], lessons: [], teachers: [], sites: [],
  };
  let rendered = 0;
  const opened = [];
  const windowObject = {
    icubeLegacy: {
      state,
      pageHead: (title, subtitle, action = '') => `<div><h1>${title}</h1><span>${subtitle}</span>${action}</div>`,
      render() { rendered += 1; },
    },
    icubePush: {
      async openNotification(id) {
        opened.push(String(id));
        const item = state.notifications.find((notification) => String(notification.id) === String(id));
        if (item) item.readAt = '2026-09-29T10:00:00.000Z';
        windowObject.icubeLegacy.render();
      },
    },
    alert(message) { throw new Error(message); },
  };
  installDashboardUi({ windowObject, api: { request: async () => ({}) } });

  let html = windowObject.serverDashboard();
  assert.equal((html.match(/>Открыть<\/button>/g) ?? []).length, 4);
  assert.equal((html.match(/>Прочитано<\/button>/g) ?? []).length, 5);
  for (const id of [1, 2, 3, 4]) assert.match(html, new RegExp(`onclick="icubePush\\.openNotification\\(${id}\\)"`));
  assert.doesNotMatch(html, /icubePush\.openNotification\(5\)/, 'notification без destination не получает «Открыть»');

  for (const id of [1, 2, 3, 4]) await windowObject.icubePush.openNotification(id);
  assert.deepEqual(opened, ['1', '2', '3', '4'], 'release/lesson/child/group используют один existing inbox handler');
  assert.equal(rendered, 4);
  html = windowObject.serverDashboard();
  assert.doesNotMatch(html, />Release<|>Lesson<|>Child<|>Group</, 'прочитанные уведомления исчезают из unread-блока');
  assert.match(html, />No destination</, 'непрочитанное уведомление без destination остаётся');
  assert.equal(state.notifications.length, 5, 'read не удаляет notification из history state');
});

test('notification list exposes read state and mark-as-read persists read_at', async () => {
  const calls = [];
  const db = pool(async (sql, params = {}) => {
    calls.push({ sql, params });
    if (sql.startsWith('INSERT IGNORE INTO notifications')) return [{ affectedRows: 0 }];
    if (sql.includes('SELECT id,notification_type')) return [[{
      id: 9, notification_type: 'project_change', title: 'Изменение', body: 'Текст',
      entity_type: 'child', entity_id: 5, created_at: '2026-09-17 10:00:00', read_at: null,
    }]];
    if (sql.includes('SELECT id,user_id,role_code')) return [[{
      id: 9, user_id: null, role_code: 'director', recipient_project_id: null, read_at: null,
    }]];
    if (sql.startsWith('UPDATE notifications SET read_at=')) return [{ affectedRows: 1 }];
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  const notifications = createNotifications(db);
  const [item] = await notifications.list(director);
  assert.equal(item.readAt, null);
  assert.equal(item.type, 'project_change');
  assert.deepEqual(await notifications.markRead('9', director), { id: '9', read: true });
  assert.ok(calls.some(({ sql }) => sql.includes('read_at=COALESCE(read_at,NOW(6))')));
});

test('partner cannot mark another project notification as read', async () => {
  let recipientProjectId = 1;
  let updates = 0;
  const db = pool(async (sql) => {
    if (sql.includes('SELECT id,user_id,role_code')) return [[{
      id: 10, user_id: null, role_code: 'partner', recipient_project_id: recipientProjectId, read_at: null,
    }]];
    if (sql.startsWith('UPDATE notifications SET read_at=')) { updates += 1; return [{ affectedRows: 1 }]; }
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  const notifications = createNotifications(db);
  await assert.rejects(notifications.markRead('10', partner), { status: 403, code: 'FORBIDDEN' });
  assert.equal(updates, 0);
  recipientProjectId = 2;
  await notifications.markRead('10', partner);
  assert.equal(updates, 1);
});

test('mark all reads only unread notifications in the authenticated role scope', async () => {
  const calls = [];
  const db = pool(async (sql, params = {}) => {
    calls.push({ sql, params });
    if (sql.startsWith('UPDATE notifications SET read_at=COALESCE')) return [{ affectedRows: 3 }];
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  assert.deepEqual(await createNotifications(db).markAllRead(partner), { read: 3 });
  const [{ sql, params }] = calls;
  assert.match(sql, /read_at IS NULL/);
  assert.match(sql, /recipient_project_id=:projectId/);
  assert.equal(params.projectId, '2');
  assert.equal(params.userId, '17');
  assert.equal(params.roleCode, 'partner');
});

test('daily summary remains project-scoped and available for director and partner', async () => {
  const db = pool(async (sql, params = {}) => {
    if (sql.includes('FROM projects WHERE active=TRUE')) {
      return [params.projectId ? [{ id: 2, name: 'Зебра' }] : [{ id: 1, name: 'iCubeRobots' }, { id: 2, name: 'Зебра' }]];
    }
    return [[{ completed: 1, planned: 2, value: '1' }]];
  });
  const dashboard = createDailyDashboard(db, { today: () => '2026-09-17' });
  const directorSummary = await dashboard.get(director);
  const partnerSummary = await dashboard.get(partner);
  assert.equal(directorSummary.projects.length, 2);
  assert.deepEqual(partnerSummary.projects.map((item) => item.projectName), ['Зебра']);
});

test('notification read route is implemented and daily summary route remains present', async () => {
  const routes = await readFile(new URL('../backend/src/routes.mjs', import.meta.url), 'utf8');
  assert.match(routes, /router\.get\('\/dashboard\/daily'/);
  assert.match(routes, /router\.post\('\/notifications\/:id\/read',[\s\S]*notifications\.markRead/);
  assert.match(routes, /router\.post\('\/notifications\/read-all',[\s\S]*notifications\.markAllRead/);
  assert.match(routes, /router\.post\('\/parent\/notifications\/read-all',[\s\S]*markAllNotificationsRead/);
  assert.doesNotMatch(routes, /router\.post\('\/notifications\/:id\/read',[^\n]*notImplemented/);
});

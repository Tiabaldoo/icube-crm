import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { countActiveChildrenForProject } from '../src/frontend/dashboard-ui.mjs';
import { createNotifications } from '../backend/src/notifications.mjs';
import { createDailyDashboard } from '../backend/src/daily-dashboard.mjs';

const partner = { roles: ['partner'], projectIds: ['2'], userId: '17' };
const director = { roles: ['director'], projectIds: [], userId: '1' };
const pool = (query) => ({ query });

test('active children are distinct by child and project', () => {
  const children = [
    { id: 1, enrollments: [
      { projectId: 1, status: 'Активный' },
      { projectId: 1, status: 'Активный' },
    ] },
    { id: 2, enrollments: [
      { projectId: 1, status: 'Активный' },
      { projectId: 2, status: 'Активный' },
    ] },
    { id: 3, enrollments: [{ projectId: 1, status: 'Пауза' }] },
  ];
  assert.equal(countActiveChildrenForProject(children, 1), 2);
  assert.equal(countActiveChildrenForProject(children, 2), 1);
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

test('notification list exposes read state and mark-as-read persists read_at', async () => {
  const calls = [];
  const db = pool(async (sql, params = {}) => {
    calls.push({ sql, params });
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
  assert.doesNotMatch(routes, /router\.post\('\/notifications\/:id\/read',[^\n]*notImplemented/);
});

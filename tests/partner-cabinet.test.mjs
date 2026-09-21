import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { createAuthService } from '../backend/src/auth-service.mjs';
import { createMysqlCatalog } from '../backend/src/catalog.mjs';
import { createMysqlLessons } from '../backend/src/lessons.mjs';
import { createProjectTransfers } from '../backend/src/project-transfers.mjs';
import { createDailyDashboard } from '../backend/src/daily-dashboard.mjs';
import { createDeletionService } from '../backend/src/deletion.mjs';
import { assertOwned } from '../backend/src/project-scope.mjs';

const partner = { roles: ['partner'], projectIds: ['2'], userId: '17' };
function pool(query) {
  const connection = { query, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {} };
  return { query, getConnection: async () => connection };
}

test('partner login resolves its project through partner_users and rejects an unbound account', async () => {
  let projectIds = [2];
  const db = pool(async (sql) => {
    if (sql.includes('FROM users u LEFT JOIN teachers')) return [[{ id: 17, password_hash: 'hash', display_name: 'Партнёр', status: 'active', token_version: 1, teacher_id: null }]];
    if (sql.includes('FROM user_roles ur JOIN roles')) return [[{ code: 'partner' }]];
    if (sql.includes('FROM partner_users pu JOIN partners partner')) return [projectIds.map((id) => ({ id }))];
    if (sql.startsWith('INSERT INTO auth_sessions') || sql.startsWith('UPDATE users SET last_login_at=')) return [{ affectedRows: 1 }];
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  const auth = createAuthService(db, { comparePassword: async () => true });
  const result = await auth.login({ login: 'partner@example.com', password: 'password' });
  assert.deepEqual(result.profile.projectIds, ['2']);
  assert.deepEqual(result.profile.roles, ['partner']);
  projectIds = [];
  await assert.rejects(auth.login({ login: 'partner@example.com', password: 'password' }), { status: 401, code: 'INVALID_CREDENTIALS' });
});

test('backend ownership prevents partner mutation of iCube data, including mixed-project children', async () => {
  const db = pool(async (sql, params) => {
    if (sql.includes('FROM study_groups')) return [[{ project_id: params.id === '20' ? 2 : 1 }]];
    if (sql.includes('FROM child_enrollments WHERE child_id=')) return [[{ project_id: 2 }, { project_id: 1 }]];
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  await assertOwned(db, 'groups', '20', partner);
  await assert.rejects(assertOwned(db, 'groups', '10', partner), { status: 403, code: 'FORBIDDEN' });
  await assert.rejects(assertOwned(db, 'children', '5', partner, { exclusiveChild: true }), { status: 403, code: 'FORBIDDEN' });
});

test('partner-created site and teacher receive Zebra ownership without iCube availability', async () => {
  const calls = [];
  const site = { id: 31, project_id: 2, name: 'Зебра', short_name: 'Зебра', type: null, address: null, note: null, active: 1 };
  const teacher = { id: 41, full_name: 'Учитель', phone: null, active: 1, access_login: null, access_status: null };
  const db = pool(async (sql, params = {}) => {
    calls.push({ sql, params });
    if (sql.startsWith('INSERT INTO sites')) return [{ insertId: 31 }];
    if (sql.startsWith('SELECT id,project_id,name,short_name')) return [[site]];
    if (sql.startsWith('SELECT id FROM directions')) return [[{ id: 3 }]];
    if (sql.startsWith('INSERT INTO teachers')) return [{ insertId: 41 }];
    if (sql.startsWith('DELETE FROM teacher_directions') || sql.startsWith('INSERT INTO teacher_directions') || sql.startsWith('INSERT IGNORE INTO teacher_projects')) return [{ affectedRows: 1 }];
    if (sql.includes('FROM teachers t LEFT JOIN users u')) return [[teacher]];
    if (sql.includes('FROM teacher_directions td')) return [[{ teacher_id: 41, id: 3, name: 'Робототехника' }]];
    if (sql === 'SELECT teacher_id,project_id FROM teacher_projects ORDER BY project_id') return [[{ teacher_id: 41, project_id: 2 }]];
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  const catalog = createMysqlCatalog(db);
  assert.equal((await catalog.create('sites', { name: 'Зебра' }, partner)).projectId, '2');
  const created = await catalog.create('teachers', { name: 'Учитель', directionIds: ['3'] }, partner);
  assert.deepEqual(created.projectIds, ['2']);
  assert.ok(calls.some(({ sql, params }) => sql.startsWith('INSERT INTO sites') && params.projectId === '2'));
  assert.ok(calls.some(({ sql, params }) => sql.startsWith('INSERT IGNORE INTO teacher_projects') && params.projectId === '2'));
  await assert.rejects(catalog.create('sites', { name: 'Не тот проект', projectId: '1' }, partner), { status: 403, code: 'FORBIDDEN' });
  await assert.rejects(catalog.create('teachers', { name: 'Не тот проект', directionIds: ['3'], projectIds: ['1'] }, partner), { status: 403, code: 'FORBIDDEN' });
});

test('teacher availability cannot be removed while a project group still uses that teacher', async () => {
  let assigned = true;
  const db = pool(async (sql) => {
    if (sql.includes('FROM teachers t LEFT JOIN users u')) return [[{ id: 41, full_name: 'Учитель', phone: null, active: 1 }]];
    if (sql.includes('FROM teacher_directions td')) return [[{ teacher_id: 41, id: 3, name: 'Робототехника' }]];
    if (sql === 'SELECT teacher_id,project_id FROM teacher_projects ORDER BY project_id') return [[{ teacher_id: 41, project_id: 2 }]];
    if (sql.startsWith('SELECT id FROM directions')) return [[{ id: 3 }]];
    if (sql.startsWith('SELECT id FROM study_groups WHERE default_teacher_id=')) return [assigned ? [{ id: 51 }] : []];
    return [{ affectedRows: 1 }];
  });
  const catalog = createMysqlCatalog(db);
  await assert.rejects(catalog.update('teachers', '41', { projectIds: [] }, partner), { status: 409, code: 'TEACHER_PROJECT_IN_USE' });
  assigned = false;
  assert.equal((await catalog.update('teachers', '41', { projectIds: [] }, partner)).id, '41');
});

test('group assignment requires both site ownership and teacher project availability', async () => {
  let available = false;
  const db = pool(async (sql) => {
    if (sql.startsWith('SELECT id FROM ')) return [[{ id: 1 }]];
    if (sql.startsWith('SELECT s.id FROM sites s JOIN teacher_projects')) return [available ? [{ id: 31 }] : []];
    if (sql.startsWith('SELECT teacher_id FROM teacher_directions')) return [[{ teacher_id: 41 }]];
    if (sql.startsWith('INSERT INTO study_groups')) return [{ insertId: 51 }];
    if (sql.startsWith('SELECT id,price FROM price_versions')) return [[]];
    if (sql.includes('FROM study_groups g JOIN directions')) return [[{ id: 51, name: 'Зебра', direction_id: 3, direction_name: 'Робототехника',
      site_id: 31, site_name: 'Зебра', project_id: 2, project_name: 'Зебра', teacher_id: 41, teacher_name: 'Учитель',
      weekday: 5, start_time: '18:00:00', end_time: '19:00:00', starts_on: '2026-09-01', ends_on: null, active: 1, price: null }]];
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  const catalog = createMysqlCatalog(db);
  const body = { name: 'Зебра', directionId: '3', siteId: '31', teacherId: '41', weekday: 5,
    startTime: '18:00', endTime: '19:00', startsOn: '2026-09-01' };
  await assert.rejects(catalog.create('groups', body, partner), { status: 400, code: 'PROJECT_MISMATCH' });
  available = true;
  assert.equal((await catalog.create('groups', body, partner)).projectId, '2');
  await assert.rejects(catalog.create('groups', { ...body, projectId: '1' }, partner), { status: 403, code: 'FORBIDDEN' });
});

test('partner sees own and foreign enrollments of an accessible mixed-project child', async () => {
  const db = pool(async (sql, params = {}) => {
    if (sql.includes('FROM children c LEFT JOIN child_guardians')) return [[{ id: 5, full_name: 'Ребёнок', status: 'active', needs_director_review: 0 }]];
    if (sql.includes('FROM child_enrollments e JOIN directions')) return [[
      { id: 7, child_id: 5, direction_id: 1, direction_name: 'Робототехника', project_id: 1, project_name: 'iCubeRobots', status: 'active', balance_lessons: '3.00000000', current_price: '1025.00', group_id: 10, group_name: 'Техническое имя', site_name: 'Школа №1', weekday: 3, start_time: '15:30:00' },
      { id: 8, child_id: 5, direction_id: 2, direction_name: 'Программирование', project_id: 2, project_name: 'Зебра', status: 'active', balance_lessons: '1.00000000', current_price: '1125.00', group_id: 20, group_name: 'Другое имя', site_name: 'Зебра', weekday: 5, start_time: '18:00:00' },
    ]];
    if (sql.startsWith('SELECT * FROM child_enrollments WHERE id=')) return [[{
      id: 7, child_id: 5, direction_id: 1, project_id: 1, status: 'active', individual_price: null, superseded_at: null,
    }]];
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  const catalog = createMysqlCatalog(db);
  const [directorChild] = await catalog.list('children', { roles: ['director'] });
  const [partnerChild] = await catalog.list('children', partner);
  assert.equal(directorChild.enrollments.length, 2);
  assert.deepEqual(partnerChild.enrollments.map((item) => item.projectId), ['1', '2']);
  assert.equal(partnerChild.enrollments[0].editable, false); assert.equal('balanceLessons' in partnerChild.enrollments[0], false);
  assert.equal(partnerChild.enrollments[0].siteName, 'Школа №1'); assert.equal(partnerChild.enrollments[0].startTime, '15:30');
  assert.equal(partnerChild.enrollments[1].editable, true); assert.equal(partnerChild.enrollments[1].balanceLessons, '1.00000000');
  await assert.rejects(catalog.updateEnrollment('7', { status: 'paused' }, partner), { status: 403, code: 'FORBIDDEN' });
});

test('project transfer closes the old membership, delegates money to FIFO transfer, and notifies the destination', async () => {
  const calls = []; let delegated;
  const db = pool(async (sql, params = {}) => {
    calls.push({ sql, params });
    if (sql.includes('FROM child_enrollments e JOIN children')) return [[{ id: 8, child_id: 5, direction_id: 2, project_id: 2,
      status: 'active', balance_lessons: '2.00000000', individual_price: null, superseded_at: null,
      full_name: 'Ребёнок', direction_name: 'Программирование', source_project_name: 'Зебра' }]];
    if (sql.startsWith('SELECT id,name,code FROM projects')) return [[{ id: 1, name: 'iCubeRobots', code: 'icube-robots' }]];
    if (sql.includes('FROM child_enrollments WHERE child_id=')) return [[]];
    if (sql.includes('FROM group_memberships gm JOIN study_groups')) return [[{ id: 55, group_id: 51, name: 'Старая группа' }]];
    if (sql.startsWith('INSERT INTO child_enrollments')) return [{ insertId: 9 }];
    if (sql.startsWith('INSERT INTO enrollment_project_transfers')) return [{ insertId: 10 }];
    if (sql.startsWith('UPDATE ') || sql.startsWith('INSERT INTO notifications') || sql.startsWith('INSERT INTO enrollment_status_history')) return [{ affectedRows: 1 }];
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  const transfers = createProjectTransfers(db, { create: async (body, context) => { delegated = { body, context }; return { id: '77' }; } });
  const result = await transfers.create('8', { projectId: '1' }, partner);
  assert.equal(result.childId, '5');
  assert.equal(result.removedGroupName, 'Старая группа');
  assert.deepEqual(delegated.body, { sourceEnrollmentId: '8', targetEnrollmentId: '9' });
  assert.ok(delegated.context.connection);
  assert.ok(calls.some(({ sql }) => sql.includes("SET status='finished'") && sql.includes('superseded_at=NOW(6)')));
  assert.ok(calls.some(({ sql }) => sql.startsWith('UPDATE group_memberships SET ended_on=')));
  assert.ok(calls.some(({ sql, params }) => sql.startsWith('INSERT INTO enrollment_status_history') && params.projectId === 2 && params.groupId === 51));
  assert.ok(calls.some(({ sql, params }) => sql.startsWith('INSERT INTO notifications') && params.roleCode === 'director' && params.childId === 5));
  assert.ok(calls.some(({ sql, params }) => sql.startsWith('INSERT INTO enrollment_project_transfers') && params.balanceTransferId === '77'));
  assert.ok(!calls.some(({ sql }) => /UPDATE (payments|refunds|attendances|lessons)\b/.test(sql)));
  await assert.rejects(transfers.create('8', { projectId: '2' }, partner), { status: 409, code: 'SAME_PROJECT' });
  await assert.rejects(transfers.create('8', { projectId: '1' }, { ...partner, projectIds: ['1'] }), { status: 403, code: 'FORBIDDEN' });
});

test('partner calendar returns only schedule fields for foreign lessons and cannot mutate them', async () => {
  const foreign = { id: 50, group_id: 10, group_name: 'iCube группа', direction_name: 'Робототехника', project_id_snapshot: 1,
    project_name: 'iCubeRobots', site_id_snapshot: 4, site_name: 'Школа', site_override_id: null,
    planned_teacher_id: 7, planned_teacher_name: 'Учитель', actual_teacher_id: null,
    scheduled_starts_at: '2026-09-18 10:00:00', scheduled_ends_at: '2026-09-18 11:00:00',
    starts_at: '2026-09-18 10:00:00', ends_at: '2026-09-18 11:00:00', status: 'scheduled' };
  const db = pool(async (sql) => {
    if (sql.includes('FROM lessons l JOIN study_groups')) return [[foreign]];
    if (sql === 'SELECT * FROM lessons WHERE id=:id FOR UPDATE') return [[foreign]];
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  const lessons = createMysqlLessons(db);
  const dto = await lessons.get('50', partner);
  assert.equal(dto.readOnly, true);
  assert.equal(dto.siteName, 'Школа');
  assert.equal(dto.projectName, 'iCubeRobots');
  for (const forbidden of ['roster', 'attendances', 'salary', 'topic', 'status', 'directionId']) assert.ok(!(forbidden in dto), forbidden);
  await assert.rejects(lessons.update('50', { topic: 'Чужое' }, partner), { status: 403, code: 'FORBIDDEN' });
});

test('partner salary and persistent notifications are selected by project', async () => {
  const calls = [];
  const db = pool(async (sql, params) => { calls.push({ sql, params }); return [[]]; });
  const lessons = createMysqlLessons(db);
  await lessons.salaryAccruals({}, partner);
  await lessons.notifications(partner);
  assert.ok(calls.some(({ sql, params }) => sql.includes('FROM salary_accruals sa')
    && sql.includes('l.project_id_snapshot=:projectId') && params.projectId === '2'));
  assert.ok(calls.some(({ sql, params }) => sql.includes('FROM notifications WHERE')
    && sql.includes('recipient_project_id=:projectId') && params.projectId === '2' && params.roleCode === 'partner'));
});

test('daily dashboard uses project scope for every metric and separate summaries for director', async () => {
  const queries = [];
  const db = pool(async (sql, params) => {
    queries.push({ sql, params });
    if (sql.includes('FROM projects WHERE active=TRUE')) return [params.projectId ? [{ id: 2, name: 'Зебра' }] : [{ id: 1, name: 'iCubeRobots' }, { id: 2, name: 'Зебра' }]];
    return [[{ completed: 1, planned: 2, value: '1' }]];
  });
  const dashboard = createDailyDashboard(db, { today: () => '2026-09-16' });
  assert.equal((await dashboard.get(partner)).projects.length, 1);
  assert.equal((await dashboard.get({ roles: ['director'] })).projects.length, 2);
  assert.ok(queries.filter(({ sql }) => !sql.includes('FROM projects WHERE active=TRUE')).every(({ params }) => String(params.projectId) === '1' || String(params.projectId) === '2'));
});

test('director deletion of a Zebra group creates a persistent partner notification', async () => {
  const calls = [];
  const db = pool(async (sql) => {
    calls.push(sql);
    if (sql.startsWith('SELECT id FROM study_groups')) return [[{ id: 51 }]];
    if (sql.startsWith('SELECT g.project_id,g.name FROM study_groups')) return [[{ project_id: 2, name: 'Группа Зебры' }]];
    if (sql.includes('FROM group_memberships WHERE group_id=:id) memberships')) return [[{
      memberships: 0, lessons: 0, attendances: 0, quickChildren: 0, childStatusHistory: 0,
      enrollmentStatusHistory: 0, payments: 0, refunds: 0,
    }]];
    if (sql.startsWith('SELECT l.id FROM lessons')) return [[]];
    if (sql.startsWith('SELECT')) return [[]];
    return [{ affectedRows: 1 }];
  });
  await createDeletionService(db).deleteGroup('51', { roles: ['director'], userId: '1' });
  assert.ok(calls.some((sql) => sql.includes("VALUES ('partner',:projectId,'project_change'")));
});

test('migration, frontend and routes retain ownership, project transfer and lesson-site contracts', async () => {
  const files = await Promise.all(['../database/migrations/013_partner_project_scope.sql', '../src/frontend/crm-ui.js', '../src/frontend/api-sync.mjs', '../index.html', '../backend/src/routes.mjs', '../backend/src/price-versions.mjs']
    .map((name) => readFile(new URL(name, import.meta.url), 'utf8')));
  const [migration, ui, sync, index, routes, priceVersions] = files;
  assert.match(migration, /CREATE TABLE teacher_projects/);
  assert.match(migration, /CREATE TABLE enrollment_project_transfers/);
  assert.match(migration, /ADD COLUMN project_id BIGINT UNSIGNED NULL AFTER direction_id/);
  assert.match(migration, /UNIQUE KEY uq_enrollments_current_direction \(child_id,current_direction_id\)/);
  assert.ok(migration.indexOf('ADD UNIQUE KEY uq_enrollments_current_direction') < migration.indexOf('DROP INDEX uq_child_enrollments_child_direction'));
  assert.match(migration, /UPDATE payments p JOIN child_enrollments/);
  assert.match(migration, /WHERE p.project_id_snapshot IS NULL/);
  assert.match(priceVersions, /pv2\.project_id IS NULL/);
  assert.match(ui, /Number\(site\.id\)!==Number\(group\?\.siteId\)/);
  assert.doesNotMatch(index, /window\.editLessonForm\s*=/);
  assert.match(sync, /projectTransferForm, confirmProjectTransfer/);
  assert.match(sync, /if \(lesson\.readOnly\)/);
  assert.match(routes, /\/enrollments\/:id\/project-transfer/);
  const migrationNames = (await readdir(new URL('../database/migrations/', import.meta.url))).filter((name) => /^\d{3}_.*\.sql$/.test(name));
  assert.equal(migrationNames.length, new Set(migrationNames.map((name) => name.slice(0, 3))).size);
  assert.ok(migrationNames.includes('012_lesson_site_override.sql'));
  assert.ok(migrationNames.includes('013_partner_project_scope.sql'));
  assert.doesNotMatch(migration, /\b(?:DROP TABLE|TRUNCATE|DROP DATABASE)\b/i);
});

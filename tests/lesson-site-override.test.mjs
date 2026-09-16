import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createDeletionService } from '../backend/src/deletion.mjs';
import { createMysqlLessons } from '../backend/src/lessons.mjs';

function baseLesson(overrides = {}) {
  return {
    id: 1, group_id: 10, group_name: 'Роботы · Чт 13:00', direction_id_snapshot: 3, direction_name: 'Робототехника',
    project_id_snapshot: 5, project_name: 'iCubeRobots', site_id_snapshot: 7, site_name: 'Школа №1',
    site_override_id: null, site_override_name: null, planned_teacher_id: 9, planned_teacher_name: 'Преподаватель',
    actual_teacher_id: 9, actual_teacher_name: 'Преподаватель', scheduled_starts_at: '2026-09-20 13:00:00',
    scheduled_ends_at: '2026-09-20 14:30:00', starts_at: '2026-09-20 13:00:00', ends_at: '2026-09-20 14:30:00',
    actual_starts_at: null, actual_ends_at: null, status: 'scheduled', topic: null, is_intro_group: 0, is_empty_trip: 0,
    roster_frozen_at: null, attendance_applied_at: null, completed_at: null, cancelled_at: null, lock_version: 1,
    deleted_at: null, ...overrides,
  };
}

function readPool(row) {
  return {
    query: async (sql) => {
      if (sql.includes('FROM lessons l JOIN study_groups')) return [[row]];
      if (sql.includes('FROM lesson_roster_members')) return [[]];
      if (sql.includes('FROM attendances WHERE lesson_id IN')) return [[]];
      if (sql.includes('FROM salary_accruals')) return [[]];
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
}

test('lesson API returns group site by default and override site when set', async () => {
  const defaultLesson = await createMysqlLessons(readPool(baseLesson())).get(1, { roles: ['director'] });
  assert.equal(defaultLesson.siteId, '7');
  assert.equal(defaultLesson.siteName, 'Школа №1');
  assert.equal(defaultLesson.siteOverrideId, null);

  const overridden = await createMysqlLessons(readPool(baseLesson({ site_override_id: 8, site_override_name: 'Зебра' }))).get(1, { roles: ['director'] });
  assert.equal(overridden.siteId, '8');
  assert.equal(overridden.siteName, 'Зебра');
  assert.equal(overridden.siteOverrideId, '8');
  assert.equal(overridden.projectId, '5');
  assert.equal(overridden.projectName, 'iCubeRobots');
});

function mutablePool() {
  const row = baseLesson();
  const query = async (sql, params = {}) => {
    if (sql.startsWith('SELECT * FROM lessons WHERE id=')) return [[{ ...row }]];
    if (sql.startsWith('SELECT id FROM sites WHERE id=')) return [[{ id: params.id }]];
    if (sql.startsWith('SELECT id FROM teachers WHERE id=')) return [[{ id: params.id }]];
    if (sql.startsWith('UPDATE lessons SET starts_at=')) {
      row.site_override_id = params.siteOverrideId;
      row.site_override_name = params.siteOverrideId == null ? null : 'Зебра';
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('FROM lessons l JOIN study_groups')) return [[{ ...row }]];
    if (sql.includes('FROM lesson_roster_members')) return [[]];
    if (sql.includes('FROM attendances WHERE lesson_id IN')) return [[]];
    if (sql.includes('FROM salary_accruals')) return [[]];
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  return {
    query,
    getConnection: async () => ({ query, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {} }),
  };
}

test('director can set and clear lesson site override without changing project', async () => {
  const service = createMysqlLessons(mutablePool());
  const overridden = await service.update(1, { siteId: 8 }, { roles: ['director'] });
  assert.equal(overridden.siteId, '8');
  assert.equal(overridden.siteName, 'Зебра');
  assert.equal(overridden.siteOverrideId, '8');
  assert.equal(overridden.projectId, '5');

  const reset = await service.update(1, { siteId: null }, { roles: ['director'] });
  assert.equal(reset.siteId, '7');
  assert.equal(reset.siteName, 'Школа №1');
  assert.equal(reset.siteOverrideId, null);
  assert.equal(reset.projectId, '5');
});

test('teacher cannot change lesson site', async () => {
  const service = createMysqlLessons(mutablePool());
  await assert.rejects(() => service.update(1, { siteId: 8 }, { roles: ['teacher'], teacherId: 9 }), (error) => {
    assert.equal(error.status, 403);
    assert.equal(error.code, 'FORBIDDEN');
    return true;
  });
});

test('site used as a lesson override cannot be physically deleted', async () => {
  let dependencySql = '';
  const pool = {
    query: async (sql) => {
      if (sql.startsWith('SELECT id FROM sites')) return [[{ id: 8 }]];
      if (sql.startsWith('SELECT\n      (SELECT COUNT(*) FROM study_groups')) {
        dependencySql = sql;
        return [[{ groupCount: 0, lessons: 1 }]];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  const service = createDeletionService(pool);
  await assert.rejects(() => service.deleteSite(8), (error) => error.code === 'SITE_HAS_DEPENDENCIES');
  assert.match(dependencySql, /site_override_id=:id/);
});

test('migration and frontend keep the override through reload and display the effective site', async () => {
  const [migration, sync, ui] = await Promise.all([
    readFile(new URL('../database/migrations/010_lesson_site_override.sql', import.meta.url), 'utf8'),
    readFile(new URL('../src/frontend/api-sync.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/frontend/crm-ui.js', import.meta.url), 'utf8'),
  ]);
  assert.match(migration, /site_override_id BIGINT UNSIGNED NULL/);
  assert.match(migration, /FOREIGN KEY \(site_override_id\) REFERENCES sites\(id\)/);
  assert.match(sync, /siteName: lesson\.siteName/);
  assert.match(sync, /siteOverrideId: lesson\.siteOverrideId/);
  assert.match(sync, /body\.siteId = value\('#le-site'\) \|\| null/);
  assert.match(ui, /id=\"le-site\"/);
  assert.match(ui, /По умолчанию —/);
  assert.match(ui, /e\.lesson\?\.siteName/);
  assert.match(ui, /l\.siteName\|\|byId\(state\.sites,g\.siteId\)/);
});

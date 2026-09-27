import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { changeGroupMembership } from '../backend/src/group-memberships.mjs';
import { createMysqlLessons } from '../backend/src/lessons.mjs';
import { createMysqlCatalog } from '../backend/src/catalog.mjs';

function fixture(initial) {
  const rows = structuredClone(initial); let nextId = Math.max(0, ...rows.map((row) => row.id)) + 1;
  const calls = [];
  const connection = { query: async (sql, params = {}) => {
    calls.push({ sql, params: structuredClone(params) });
    if (sql.startsWith('SELECT id,group_id,started_on,ended_on')) return [structuredClone(rows.sort((a, b) => a.started_on.localeCompare(b.started_on) || a.id - b.id))];
    if (sql.startsWith('UPDATE group_memberships SET ended_on=')) {
      const row = rows.find((item) => String(item.id) === String(params.id)); row.ended_on = params.endedOn; return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('UPDATE group_memberships SET group_id=:groupId,started_on=')) {
      const row = rows.find((item) => String(item.id) === String(params.id)); row.group_id = Number(params.groupId); row.started_on = params.startedOn; return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('UPDATE group_memberships SET group_id=')) {
      const row = rows.find((item) => String(item.id) === String(params.id)); row.group_id = Number(params.groupId); return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('INSERT INTO group_memberships')) {
      const row = { id: nextId++, enrollment_id: Number(params.id), group_id: Number(params.groupId), started_on: params.startedOn, ended_on: null };
      rows.push(row); return [{ insertId: row.id }];
    }
    if (sql.startsWith('DELETE FROM group_memberships')) {
      const index = rows.findIndex((item) => String(item.id) === String(params.id)); if (index >= 0) rows.splice(index, 1); return [{ affectedRows: index >= 0 ? 1 : 0 }];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  } };
  return { rows, calls, connection };
}

test('group change preserves A history and starts B without overlap', async () => {
  const data = fixture([{ id: 1, enrollment_id: 9, group_id: 10, started_on: '2026-09-01', ended_on: null }]);
  await changeGroupMembership(data.connection, { enrollmentId: 9, targetGroupId: 20, startedOn: '2026-09-20' });
  assert.deepEqual(data.rows, [
    { id: 1, enrollment_id: 9, group_id: 10, started_on: '2026-09-01', ended_on: '2026-09-19' },
    { id: 2, enrollment_id: 9, group_id: 20, started_on: '2026-09-20', ended_on: null },
  ]);
});

test('same start date corrects the group instead of creating overlapping memberships', async () => {
  const data = fixture([{ id: 1, enrollment_id: 9, group_id: 10, started_on: '2026-09-20', ended_on: null }]);
  await changeGroupMembership(data.connection, { enrollmentId: 9, targetGroupId: 20, startedOn: '2026-09-20' });
  assert.equal(data.rows.length, 1); assert.equal(data.rows[0].group_id, 20); assert.equal(data.rows[0].ended_on, null);
});

test('editing current group start shifts previous boundary and rejects overlap', async () => {
  const data = fixture([
    { id: 1, enrollment_id: 9, group_id: 10, started_on: '2026-09-01', ended_on: '2026-09-19' },
    { id: 2, enrollment_id: 9, group_id: 20, started_on: '2026-09-20', ended_on: null },
  ]);
  await changeGroupMembership(data.connection, { enrollmentId: 9, targetGroupId: 20, startedOn: '2026-09-18' });
  assert.equal(data.rows[0].ended_on, '2026-09-17'); assert.equal(data.rows[1].started_on, '2026-09-18');
  await assert.rejects(changeGroupMembership(data.connection, { enrollmentId: 9, targetGroupId: 20, startedOn: '2026-09-01' }),
    (error) => error.code === 'MEMBERSHIP_DATE_CONFLICT' && /пересечение/.test(error.message));
});

test('read models and pre-start roster use membership dates while frozen roster stays persisted', async () => {
  const [catalog, lessons, api, ui] = await Promise.all([
    readFile(new URL('../backend/src/catalog.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../backend/src/lessons.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/frontend/api-sync.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/frontend/crm-ui.js', import.meta.url), 'utf8'),
  ]);
  assert.match(catalog, /c\.created_at/); assert.match(catalog, /group_started_on/); assert.match(catalog, /effective_group_id/);
  assert.match(lessons, /gm\.started_on<=DATE\(l\.starts_at\)[\s\S]*gm\.ended_on IS NULL OR gm\.ended_on>=DATE\(l\.starts_at\)/);
  assert.match(api, /effectiveGroupChildIds: \(lesson\.effectiveRoster/);
  assert.match(ui, /groupRosterFrozenV146[\s\S]*groupChildIdsV146[\s\S]*effectiveGroupChildIds/);
  assert.match(ui, /В базе с/); assert.doesNotMatch(ui, /id="cf-created/);
  assert.match(ui, /Дата начала занятий в группе/); assert.match(ui, /Настройки направления/);
});

test('lesson DTO exposes date-effective preview but keeps frozen main roster and extras unchanged', async () => {
  let frozen = false; const sqlSeen = [];
  const lessonRow = () => ({ id: 50, group_id: 20, group_name: 'B', direction_id_snapshot: 1, direction_name: 'Робототехника',
    project_id_snapshot: 1, project_name: 'iCube', site_id_snapshot: 1, site_name: 'Site', site_override_id: null,
    planned_teacher_id: 2, planned_teacher_name: 'Teacher', actual_teacher_id: null, actual_teacher_name: null,
    scheduled_starts_at: '2026-09-20 10:00:00', scheduled_ends_at: '2026-09-20 11:00:00', starts_at: '2026-09-20 10:00:00', ends_at: '2026-09-20 11:00:00',
    actual_starts_at: null, actual_ends_at: null, status: frozen ? 'in_progress' : 'scheduled', topic: null, is_intro_group: 0, is_empty_trip: 0,
    roster_frozen_at: frozen ? '2026-09-20 10:00:00' : null, attendance_applied_at: null, completed_at: null, cancelled_at: null,
    lock_version: 1, effective_roster_child_ids: frozen ? null : JSON.stringify([8]), absence_notice_child_ids: null, birthday_child_ids: null });
  const pool = { query: async (sql) => {
    sqlSeen.push(sql);
    if (sql.includes('FROM lessons l JOIN study_groups')) return [[lessonRow()]];
    if (sql.startsWith('SELECT lesson_id,child_id,roster_type')) return [frozen ? [{ lesson_id: 50, child_id: 9, roster_type: 'main' }] : []];
    if (sql.startsWith('SELECT id,lesson_id,child_id,enrollment_id')) return [[{ id: 3, lesson_id: 50, child_id: 11, enrollment_id: 15,
      attendance_type: 'extra', present: 1, is_trial: 0, price_snapshot: null, charged_lessons: '0.00000000', marked_at: null }]];
    throw new Error(`Unexpected SQL: ${sql}`);
  } };
  const lessons = createMysqlLessons(pool);
  const preview = await lessons.get(50, { roles: [] });
  assert.deepEqual(preview.effectiveRoster, [{ childId: '8', type: 'main' }]);
  assert.deepEqual(preview.roster, []); assert.equal(preview.attendances[0].type, 'extra');
  frozen = true;
  const started = await lessons.get(50, { roles: [] });
  assert.deepEqual(started.roster, [{ childId: '9', type: 'main' }]);
  assert.deepEqual(started.effectiveRoster, []); assert.equal(started.attendances[0].childId, '11');
  assert.ok(sqlSeen.some((sql) => sql.includes('gm.started_on<=DATE(l.starts_at)')));
});

test('children read model keeps enrollment and membership dates separate and returns createdAt', async () => {
  const pool = { query: async (sql) => {
    if (sql.includes('FROM children c LEFT JOIN child_guardians')) return [[{ id: 8, full_name: 'Ребёнок', birth_date: null,
      school: null, grade: null, status: 'active', note: null, needs_director_review: 0, created_at: '2026-09-27 12:00:00',
      guardian_name: null, guardian_phone: null }]];
    if (sql.includes('FROM child_enrollments e JOIN directions')) return [[{ id: 9, child_id: 8, direction_id: 1, project_id: 1,
      project_name: 'iCube', direction_name: 'Робототехника', status: 'active', individual_price: null, balance_lessons: '0.00000000',
      started_on: '2026-09-01', ended_on: null, group_id: 20, group_started_on: '2026-09-20', effective_group_id: 10,
      group_name: 'Будущая группа', weekday: 5, start_time: '18:00:00', site_name: 'Площадка', current_price: '1025.00' }]];
    throw new Error(`Unexpected SQL: ${sql}`);
  } };
  const [child] = await createMysqlCatalog(pool).list('children', { roles: ['director'] });
  assert.equal(child.createdAt, '2026-09-27');
  assert.equal(child.enrollments[0].startedOn, '2026-09-01');
  assert.equal(child.enrollments[0].groupStartedOn, '2026-09-20');
  assert.equal(child.enrollments[0].effectiveGroupId, '10');
});

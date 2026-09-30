import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { createMysqlCatalog } from '../backend/src/catalog.mjs';
import { createMysqlLessons } from '../backend/src/lessons.mjs';
import { advancedGroupFields, installAdvancedGroupUi } from '../src/frontend/advanced-groups.mjs';

const director = { roles: ['director'], userId: '1' };
const partner = { roles: ['partner'], projectIds: ['2'], userId: '2' };
const teacher = { roles: ['teacher'], teacherId: '4', userId: '4' };

test('025 preserves existing and new group visibility by database default', async (t) => {
  const migration = await readFile(new URL('../database/migrations/025_partner_calendar_visibility.sql', import.meta.url), 'utf8');
  assert.match(migration, /ADD COLUMN partner_calendar_visible BOOLEAN NOT NULL DEFAULT TRUE/);
  assert.doesNotMatch(migration, /UPDATE|DROP|TRUNCATE/i);
  const db = new DatabaseSync(':memory:'); t.after(() => db.close());
  db.exec('CREATE TABLE study_groups(id INTEGER PRIMARY KEY); INSERT INTO study_groups(id) VALUES (1);');
  db.exec(migration);
  db.exec('INSERT INTO study_groups(id) VALUES (2);');
  assert.deepEqual(db.prepare('SELECT partner_calendar_visible FROM study_groups ORDER BY id').all().map((row) => Number(row.partner_calendar_visible)), [1, 1]);
});

function catalogFixture() {
  let group = null; const writes = [];
  const query = async (sql, p = {}) => {
    if (sql.includes('FROM study_groups g JOIN directions')) return [group ? [{ ...group }] : []];
    if (/^SELECT id FROM (directions|sites|projects|teachers|study_groups)/.test(sql)) return [[{ id: p.id ?? p.groupId }]];
    if (sql.startsWith('SELECT s.id FROM sites') || sql.startsWith('SELECT teacher_id FROM teacher_project_directions')) return [[{ id: 1 }]];
    if (sql.startsWith('SELECT d.name FROM group_memberships')) return [[]];
    if (sql.startsWith('INSERT INTO study_groups')) {
      writes.push({ sql, p });
      group = { id: 10, name: p.name, is_mixed: p.isMixed, direction_id: p.directionId, direction_name: 'Робототехника',
        site_id: p.siteId, site_name: 'Площадка', project_id: p.projectId, project_name: 'Проект', teacher_id: p.teacherId,
        teacher_name: 'Преподаватель', weekday: p.weekday, start_time: p.startTime, end_time: p.endTime,
        starts_on: p.startsOn, ends_on: p.endsOn, active: p.active, is_individual: 0, package_lesson_count: 4,
        calculation_mode: 'standard', schedule_slots: [], price: null,
        partner_calendar_visible: sql.includes('partner_calendar_visible') ? p.partnerCalendarVisible : true };
      return [{ insertId: 10 }];
    }
    if (sql.startsWith('UPDATE study_groups')) {
      writes.push({ sql, p });
      if (sql.includes('partner_calendar_visible=:partnerCalendarVisible')) group.partner_calendar_visible = p.partnerCalendarVisible;
      return [{ affectedRows: 1 }];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  const connection = { query, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {} };
  const pool = { query, getConnection: async () => connection };
  const body = { name: 'Группа', directionId: 1, siteId: 2, projectId: 2, teacherId: 4,
    weekday: 2, startTime: '16:00', endTime: '17:30', startsOn: '2026-09-01', active: true };
  return { catalog: createMysqlCatalog(pool), writes, body, get group() { return group; } };
}

test('director DTO and create/update store FALSE then TRUE; partner DTO omits setting', async () => {
  const f = catalogFixture();
  const created = await f.catalog.create('groups', f.body, director);
  assert.equal(created.partnerCalendarVisible, true);
  assert.equal(f.group.partner_calendar_visible, true);
  assert.doesNotMatch(f.writes[0].sql, /partner_calendar_visible/); // Database default for omitted value.
  const hidden = await f.catalog.update('groups', 10, { partnerCalendarVisible: false }, director);
  assert.equal(hidden.partnerCalendarVisible, false);
  assert.equal(f.group.partner_calendar_visible, false);
  assert.match(f.writes.at(-1).sql, /partner_calendar_visible=:partnerCalendarVisible/);
  const visible = await f.catalog.update('groups', 10, { partnerCalendarVisible: true }, director);
  assert.equal(visible.partnerCalendarVisible, true);
  assert.equal(f.group.partner_calendar_visible, true);
  const ownPartner = await f.catalog.get('groups', 10, partner);
  assert.equal('partnerCalendarVisible' in ownPartner, false);
});

test('partner crafted create/update cannot change visibility, ordinary save keeps database value', async () => {
  const f = catalogFixture();
  await assert.rejects(f.catalog.create('groups', { ...f.body, partnerCalendarVisible: false }, partner), { status: 403 });
  await assert.rejects(f.catalog.create('groups', { ...f.body, partner_calendar_visible: false }, partner), { status: 403 });
  assert.equal(f.writes.length, 0);
  await f.catalog.create('groups', f.body, partner);
  assert.equal(f.group.partner_calendar_visible, true);
  await assert.rejects(f.catalog.update('groups', 10, { partnerCalendarVisible: false }, partner), { status: 403 });
  await assert.rejects(f.catalog.update('groups', 10, { partner_calendar_visible: false }, partner), { status: 403 });
  await f.catalog.update('groups', 10, { name: 'Переименована' }, partner);
  assert.equal(f.group.partner_calendar_visible, true);
  assert.doesNotMatch(f.writes.at(-1).sql, /partner_calendar_visible/);
});

test('partner calendar groups return only visible foreign scheduling fields', async () => {
  const query = async (sql, params) => {
    assert.match(sql, /g\.deleted_at IS NULL AND g\.partner_calendar_visible=TRUE AND g\.project_id<>:projectId/);
    assert.doesNotMatch(sql, /price_versions|teacher_share|partner_share|balance|children/);
    assert.equal(params.projectId, '2');
    return [[{ id: 101, direction_id: 1, direction_name: 'Робототехника', is_mixed: 0,
      project_id: 1, project_name: 'iCubeRobots', site_id: 3, site_name: 'Школа', teacher_id: 4,
      teacher_name: 'Преподаватель', weekday: 4, start_time: '12:00:00', end_time: '13:00:00',
      starts_on: '2026-09-01', ends_on: null, active: 1,
      schedule_slots: [{ weekday: 5, startTime: '15:00', endTime: '16:00' }] }]];
  };
  const catalog = createMysqlCatalog({ query });
  const result = await catalog.calendarGroups(partner);
  assert.deepEqual(result, [{ id: '101', directionId: '1', directionName: 'Робототехника', isMixed: false,
    projectId: '1', projectName: 'iCubeRobots', siteId: '3', siteName: 'Школа', teacherId: '4',
    teacherName: 'Преподаватель', weekday: 4, startTime: '12:00', endTime: '13:00',
    scheduleSlots: [{ weekday: 5, startTime: '15:00', endTime: '16:00' }], startsOn: '2026-09-01',
    endsOn: null, active: true }]);
  await assert.rejects(catalog.calendarGroups(director), { status: 403 });
  await assert.rejects(catalog.calendarGroups(teacher), { status: 403 });
});

function lessonFixture() {
  const lessons = [
    { id: 11, group_id: 101, project_id_snapshot: 1, partner_calendar_visible: true },
    { id: 12, group_id: 102, project_id_snapshot: 1, partner_calendar_visible: false },
    { id: 13, group_id: 103, project_id_snapshot: 2, partner_calendar_visible: false },
  ].map((item) => ({ ...item, direction_id_snapshot: 1, direction_name: 'Робототехника', is_mixed_snapshot: 0,
    group_name: 'Группа', project_name: 'Проект', site_id_snapshot: 2, site_name: 'Площадка',
    planned_teacher_id: 4, actual_teacher_id: 4, planned_teacher_name: 'Преподаватель', actual_teacher_name: 'Преподаватель',
    starts_at: '2026-09-14 16:00:00', ends_at: '2026-09-14 17:00:00', scheduled_starts_at: '2026-09-14 16:00:00',
    scheduled_ends_at: '2026-09-14 17:00:00', status: 'completed', deleted_at: null,
    roster_frozen_at: null, attendance_applied_at: null, topic: null }));
  const calls = [];
  const query = async (sql, p = {}) => {
    calls.push({ sql, p });
    if (sql.startsWith('DELETE l FROM lessons')) return [{ affectedRows: 0 }];
    if (sql.startsWith('SELECT g.id,g.is_mixed')) return [[]];
    if (sql.startsWith('SELECT tp.teacher_id FROM teacher_projects')) return [[{ teacher_id: 4 }]];
    if (sql.includes('FROM lessons l JOIN study_groups g ON g.id=l.group_id JOIN directions')) {
      if (p.partnerProjectId) assert.match(sql, /l\.project_id_snapshot=:partnerProjectId OR g\.partner_calendar_visible=TRUE/);
      const matching = lessons.filter((item) => (!p.id || String(item.id) === String(p.id)) && item.deleted_at == null
        && (!p.partnerProjectId || String(item.project_id_snapshot) === String(p.partnerProjectId) || item.partner_calendar_visible));
      return [matching];
    }
    if (sql.startsWith('SELECT l.group_id,l.scheduled_starts_at FROM lessons l')) {
      assert.match(sql, /JOIN study_groups g ON g\.id=l\.group_id/);
      if (p.projectId) assert.match(sql, /l\.project_id_snapshot=:projectId OR g\.partner_calendar_visible=TRUE/);
      return [lessons.filter((item) => item.deleted_at != null && (!p.projectId || String(item.project_id_snapshot) === String(p.projectId) || item.partner_calendar_visible))
        .map((item) => ({ group_id: item.group_id, scheduled_starts_at: item.scheduled_starts_at }))];
    }
    if (sql.includes('lesson_roster_members WHERE lesson_id IN') || sql.includes('FROM attendances WHERE lesson_id IN') || sql.includes('FROM salary_accruals sa WHERE')) return [[]];
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  return { service: createMysqlLessons({ query }), lessons, calls };
}

test('foreign visible stays readOnly, foreign hidden is absent, own hidden stays full', async () => {
  const f = lessonFixture();
  const rows = await f.service.list({ from: '2026-09-01', to: '2026-09-30' }, partner);
  assert.deepEqual(rows.map((item) => item.id), ['11', '13']);
  assert.equal(rows[0].readOnly, true);
  assert.equal(rows[0].directionName, 'Робототехника');
  assert.equal(rows[0].directionId, '1');
  assert.equal(rows[0].isMixed, false);
  assert.equal(rows[0].status, 'completed');
  assert.equal(rows[1].readOnly, undefined);
  assert.equal((await f.service.get(11, partner)).readOnly, true);
  await assert.rejects(f.service.get(12, partner), { status: 404, code: 'NOT_FOUND' });
  assert.equal((await f.service.get(13, partner)).readOnly, undefined);
  f.lessons[0].is_mixed_snapshot = 1;
  assert.equal((await f.service.get(11, partner)).directionName, 'Смешанная');
  assert.equal((await f.service.get(11, partner)).isMixed, true);
  f.lessons[0].is_mixed_snapshot = 0;
  f.lessons[0].partner_calendar_visible = false;
  assert.deepEqual((await f.service.list({ from: '2026-09-01', to: '2026-09-30' }, partner)).map((item) => item.id), ['13']);
  f.lessons[0].partner_calendar_visible = true;
  assert.equal((await f.service.get(11, partner)).readOnly, true);
  assert.deepEqual((await f.service.list({ from: '2026-09-01', to: '2026-09-30' }, director)).map((item) => item.id), ['11', '12', '13']);
  assert.deepEqual((await f.service.list({ from: '2026-09-01', to: '2026-09-30' }, teacher)).map((item) => item.id), ['11', '12', '13']);
});

test('deleted occurrences of foreign hidden groups are filtered, visible and own remain', async () => {
  const f = lessonFixture();
  f.lessons.forEach((item) => { item.deleted_at = '2026-09-15 12:00:00'; });
  assert.deepEqual((await f.service.deletedOccurrences(partner)).map((item) => item.groupId), ['101', '103']);
  assert.deepEqual((await f.service.deletedOccurrences(director)).map((item) => item.groupId), ['101', '102', '103']);
});

test('advanced form shows director-only setting, persisted FALSE, new TRUE and omits partner payload', () => {
  assert.match(advancedGroupFields({}, true), /id="gf-partner-calendar-visible"[^>]* checked/);
  assert.doesNotMatch(advancedGroupFields({ partnerCalendarVisible: false }, true), /id="gf-partner-calendar-visible"[^>]* checked/);
  assert.doesNotMatch(advancedGroupFields({}, false), /gf-partner-calendar-visible/);
  const fields = new Map([['#gf-package-count', { value: '4' }], ['#gf-partner-calendar-visible', { checked: false }]]);
  const host = { groupForm() { legacy.state.modal = '<div class="modal-actions"></div>'; }, group() { return '<h1>Группа</h1>'; } };
  const legacy = { state: { role: 'director', groups: [{ id: 10, partnerCalendarVisible: false }] } };
  installAdvancedGroupUi(legacy, host, { querySelector: (key) => fields.get(key), querySelectorAll: () => [] });
  host.groupForm(10);
  assert.match(legacy.state.modal, /gf-partner-calendar-visible/);
  assert.equal(host.icubeAdvancedGroups.payload().partnerCalendarVisible, false);
  fields.get('#gf-partner-calendar-visible').checked = true;
  assert.equal(host.icubeAdvancedGroups.payload().partnerCalendarVisible, true);
  legacy.state.role = 'partner'; fields.delete('#gf-partner-calendar-visible'); host.groupForm(10);
  assert.doesNotMatch(legacy.state.modal, /gf-partner-calendar-visible/);
  assert.equal('partnerCalendarVisible' in host.icubeAdvancedGroups.payload(), false);
});

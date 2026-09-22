import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMysqlLessons } from '../backend/src/lessons.mjs';

function transactionPool(handler) {
  const connection = { query: handler, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {} };
  return { query: handler, getConnection: async () => connection };
}

const completeLesson = (row) => ({
  ...row, group_name: 'Группа', direction_name: 'Робототехника', project_name: 'iCubeRobots', site_name: 'Площадка',
  planned_teacher_name: 'Преподаватель', actual_teacher_name: row.actual_teacher_id ? 'Преподаватель' : null,
  actual_starts_at: null, actual_ends_at: null, topic: null, is_intro_group: 0, is_empty_trip: 0,
  roster_frozen_at: null, attendance_applied_at: null, completed_at: null, cancelled_at: null, deleted_at: null, lock_version: 1,
});

test('явный клик директора создаёт только один past occurrence по расписанию', async () => {
  let inserted = 0;
  const row = completeLesson({ id: 40, group_id: 4, direction_id_snapshot: 1, project_id_snapshot: 2, site_id_snapshot: 3,
    planned_teacher_id: 6, actual_teacher_id: null, status: 'scheduled', scheduled_starts_at: '2026-09-14 10:00:00',
    scheduled_ends_at: '2026-09-14 11:00:00', starts_at: '2026-09-14 10:00:00', ends_at: '2026-09-14 11:00:00' });
  const handler = async (sql, params = {}) => {
    if (sql.startsWith('SELECT id,direction_id,project_id')) return [[{ id: 4, direction_id: 1, project_id: 2, site_id: 3, default_teacher_id: 6,
      weekday: 1, start_time: '10:00:00', end_time: '11:00:00', starts_on: '2026-01-01', ends_on: null }]];
    if (sql.startsWith('INSERT IGNORE INTO lessons')) { inserted += 1; assert.equal(params.date, '2026-09-14'); return [{ insertId: 40 }]; }
    if (sql.startsWith('SELECT l.id FROM lessons l WHERE')) return [[{ id: 40 }]];
    if (sql.includes('FROM lessons l JOIN study_groups')) return [[row]];
    if (sql.includes('lesson_roster_members WHERE lesson_id IN') || sql.includes('FROM attendances WHERE lesson_id IN') || sql.includes('FROM salary_accruals sa WHERE')) return [[]];
    throw new Error(`Неожиданный SQL: ${sql}`);
  };
  const lesson = await createMysqlLessons({ query: handler }).create({ groupId: 4, scheduledDate: '2026-09-14' }, { roles: ['director'] });
  assert.equal(lesson.id, '40'); assert.equal(inserted, 1);
});

test('DELETE completed lesson восстанавливает lot/balance, чистит salary и tombstone не materializes снова', async () => {
  const lesson = completeLesson({ id: 50, group_id: 4, direction_id_snapshot: 1, project_id_snapshot: 2, site_id_snapshot: 3,
    planned_teacher_id: 6, actual_teacher_id: 6, status: 'completed', scheduled_starts_at: '2099-09-14 10:00:00',
    scheduled_ends_at: '2099-09-14 11:00:00', starts_at: '2099-09-14 10:00:00', ends_at: '2099-09-14 11:00:00',
    roster_frozen_at: '2099-09-14 10:00:00', attendance_applied_at: '2099-09-14 11:00:00', completed_at: '2099-09-14 11:00:00' });
  let deleted = false; let insertAttempts = 0; const calls = [];
  const handler = async (sql, params = {}) => {
    calls.push({ sql, params });
    if (sql === 'SELECT * FROM lessons WHERE id=:id FOR UPDATE') return [[deleted ? { ...lesson, deleted_at: '2099-09-15 00:00:00' } : lesson]];
    if (sql === 'SELECT * FROM attendances WHERE lesson_id=:lessonId FOR UPDATE') return [[{ id: 70, enrollment_id: 9, child_id: 8, present: 1, is_trial: 0 }]];
    if (sql.includes("be.attendance_id=:attendanceId AND be.entry_type='attendance'")) return [[{ id: 80, enrollment_id: 9, lessons_delta: '-1.00000000', amount_delta: '-1025.00', unit_price_snapshot: '1025.00' }]];
    if (sql.startsWith('SELECT balance_lot_id,lessons')) return [[{ balance_lot_id: 60, lessons: '1.00000000' }]];
    if (sql.startsWith('INSERT INTO balance_entries')) return [{ insertId: 81 }];
    if (sql.startsWith('UPDATE lessons SET deleted_at=')) { deleted = true; return [{ affectedRows: 1 }]; }
    if (sql.startsWith('DELETE l FROM lessons')) { assert.match(sql, /l\.deleted_at IS NULL/); return [{ affectedRows: 0 }]; }
    if (sql.startsWith('SELECT g.id,g.direction_id')) return [[{ id: 4, direction_id: 1, project_id: 2, site_id: 3, default_teacher_id: 6,
      weekday: 1, start_time: '10:00:00', end_time: '11:00:00', starts_on: '2099-01-01', ends_on: null }]];
    if (sql.startsWith('INSERT IGNORE INTO lessons')) { insertAttempts += 1; return [{ affectedRows: 0 }]; }
    if (sql.includes('FROM lessons l JOIN study_groups')) return [deleted ? [] : [lesson]];
    if (/^(UPDATE|DELETE)/.test(sql)) return [{ affectedRows: 1 }];
    throw new Error(`Неожиданный SQL: ${sql}`);
  };
  const service = createMysqlLessons(transactionPool(handler));
  await service.remove(50, { roles: ['director'] });
  assert.ok(calls.some(({ sql }) => sql.startsWith('UPDATE balance_lots SET remaining_lessons=remaining_lessons+')));
  assert.ok(calls.some(({ sql }) => sql.startsWith('UPDATE child_enrollments SET balance_lessons=balance_lessons+')));
  assert.ok(calls.some(({ sql }) => sql.startsWith('DELETE FROM salary_accruals')));
  assert.ok(calls.some(({ sql }) => sql.startsWith('UPDATE lessons SET deleted_at=')));
  const rows = await service.list({ from: '2099-09-14', to: '2099-09-14' }, { roles: ['director'] });
  assert.deepEqual(rows, []); assert.equal(insertAttempts, 1);
});

test('empty trip с нулём детей сохраняет существующее начисление 300 ₽', async () => {
  const lesson = completeLesson({ id: 60, group_id: 4, direction_id_snapshot: 1, project_id_snapshot: 2, site_id_snapshot: 3,
    planned_teacher_id: 6, actual_teacher_id: null, status: 'scheduled', scheduled_starts_at: '2026-09-14 10:00:00',
    scheduled_ends_at: '2026-09-14 11:00:00', starts_at: '2026-09-14 10:00:00', ends_at: '2026-09-14 11:00:00' });
  let salary;
  const handler = async (sql, params = {}) => {
    if (sql === 'SELECT * FROM lessons WHERE id=:id FOR UPDATE') return [[lesson]];
    if (sql.startsWith('UPDATE attendances SET present=FALSE')) return [{ affectedRows: 0 }];
    if (sql.startsWith("UPDATE lessons SET status='completed'")) { lesson.status = 'completed'; lesson.is_empty_trip = 1; lesson.actual_teacher_id = 6; return [{ affectedRows: 1 }]; }
    if (sql.startsWith('SELECT * FROM salary_accruals WHERE')) return [[]];
    if (sql.startsWith('SELECT COUNT(*) present_count')) return [[{ present_count: 0 }]];
    if (sql.startsWith('SELECT * FROM salary_rate_versions')) return [[{ id: 5, regular_fixed: '600.00', per_present_child: '100.00', intro_fixed: '600.00', empty_trip_fixed: '300.00' }]];
    if (sql.startsWith('INSERT INTO salary_accruals')) { salary = params; return [{ insertId: 90 }]; }
    if (sql.includes('FROM lessons l JOIN study_groups')) return [[lesson]];
    if (sql.includes('lesson_roster_members WHERE lesson_id IN') || sql.includes('FROM attendances WHERE lesson_id IN') || sql.includes('FROM salary_accruals sa WHERE')) return [[]];
    throw new Error(`Неожиданный SQL: ${sql}`);
  };
  await createMysqlLessons(transactionPool(handler)).emptyTrip(60, { roles: ['director'] });
  assert.equal(salary.type, 'empty_trip'); assert.equal(salary.total, '300.00'); assert.equal(salary.present, 0);
});

test('смена типа completed lesson пересоздаёт только salary accrual по настройкам', async () => {
  const lesson = completeLesson({ id: 70, group_id: 4, direction_id_snapshot: 1, project_id_snapshot: 2, site_id_snapshot: 3,
    planned_teacher_id: 6, actual_teacher_id: 6, status: 'completed', scheduled_starts_at: '2026-09-14 10:00:00',
    scheduled_ends_at: '2026-09-14 11:00:00', starts_at: '2026-09-14 10:00:00', ends_at: '2026-09-14 11:00:00' });
  let currentSalary = { id: 90, lesson_id: 70, teacher_id: 6, rate_version_id: 5, accrual_type: 'regular',
    present_children: 2, fixed_amount: '600.00', children_amount: '200.00', total_amount: '800.00', reversed_at: null };
  const inserted = []; const calls = [];
  const handler = async (sql, params = {}) => {
    calls.push({ sql, params });
    if (sql === 'SELECT * FROM lessons WHERE id=:id FOR UPDATE') return [[lesson]];
    if (sql.includes('FROM teachers t JOIN teacher_projects tp')) return [[{ id: 6 }]];
    if (sql.startsWith('UPDATE lessons SET starts_at=')) return [{ affectedRows: 1 }];
    if (sql.startsWith('SELECT * FROM salary_accruals WHERE')) return [currentSalary?.reversed_at ? [] : [currentSalary]];
    if (sql.startsWith('UPDATE salary_accruals SET reversed_at=')) { currentSalary.reversed_at = 'now'; return [{ affectedRows: 1 }]; }
    if (sql.startsWith('SELECT COUNT(*) present_count')) return [[{ present_count: 2 }]];
    if (sql.startsWith('SELECT * FROM salary_rate_versions')) return [[{ id: 5, regular_fixed: '600.00', per_present_child: '100.00', intro_fixed: '650.00', empty_trip_fixed: '350.00' }]];
    if (sql.startsWith('INSERT INTO salary_accruals')) {
      inserted.push({ ...params }); currentSalary = { id: 90 + inserted.length, teacher_id: params.teacherId, rate_version_id: params.rateId,
        accrual_type: params.type, present_children: params.present, total_amount: params.total, reversed_at: null }; return [{ insertId: currentSalary.id }];
    }
    if (sql.includes('FROM lessons l JOIN study_groups')) return [[lesson]];
    if (sql.includes('lesson_roster_members WHERE lesson_id IN') || sql.includes('FROM attendances WHERE lesson_id IN')) return [[]];
    if (sql.includes('FROM salary_accruals sa WHERE')) return [currentSalary ? [currentSalary] : []];
    throw new Error(`Неожиданный SQL: ${sql}`);
  };
  const service = createMysqlLessons(transactionPool(handler));
  await service.update(70, { introGroup: true, emptyTrip: false }, { roles: ['director'] });
  await service.update(70, { introGroup: false, emptyTrip: true }, { roles: ['director'] });
  await service.update(70, { introGroup: false, emptyTrip: false }, { roles: ['director'] });
  assert.deepEqual(inserted.map(({ type, total }) => [type, total]), [['intro', '650.00'], ['empty_trip', '350.00'], ['regular', '800.00']]);
  assert.equal(calls.some(({ sql }) => sql.includes('UPDATE child_enrollments SET balance_lessons')), false);
  assert.equal(calls.some(({ sql }) => sql.includes('UPDATE attendances SET')), false);
});

test('lesson deletion purges physical photos only after database commit', async () => {
  const lesson = completeLesson({ id: 80, group_id: 4, direction_id_snapshot: 1, project_id_snapshot: 2, site_id_snapshot: 3,
    planned_teacher_id: 6, actual_teacher_id: 6, status: 'completed', starts_at: '2026-09-14 10:00:00', ends_at: '2026-09-14 11:00:00' });
  let committed = false; const order = [];
  const handler = async (sql) => {
    if (sql === 'SELECT * FROM lessons WHERE id=:id FOR UPDATE') return [[lesson]];
    if (sql === 'SELECT * FROM attendances WHERE lesson_id=:lessonId FOR UPDATE') return [[]];
    if (/^(UPDATE|DELETE)/.test(sql)) return [{ affectedRows: 1 }];
    throw new Error(`Неожиданный SQL: ${sql}`);
  };
  const connection = { query: handler, beginTransaction: async () => order.push('begin'), commit: async () => { committed = true; order.push('commit'); }, rollback: async () => {}, release() {} };
  const photos = {
    async prepareLessonPurge() { order.push('prepare'); return [{ id: 1, storageKey: 'one.jpg' }]; },
    async purgePrepared() { assert.equal(committed, true); order.push('purge'); return { purged: 1, failed: [] }; },
  };
  await createMysqlLessons({ query: handler, getConnection: async () => connection }, { lessonPhotos: photos }).remove(80, { roles: ['director'] });
  assert.deepEqual(order, ['begin', 'prepare', 'commit', 'purge']);
});

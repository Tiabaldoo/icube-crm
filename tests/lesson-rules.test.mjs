import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { calculateSalary, freezeRosterMembers, occurrenceDates, planFifoConsumption, restoredLotBalances } from '../backend/src/lesson-rules.mjs';
import { createMysqlLessons } from '../backend/src/lessons.mjs';

test('расписание материализует уникальные occurrence в границах группы', () => {
  const group = { weekday: 1, startsOn: '2026-09-01', endsOn: '2026-09-30' };
  const dates = occurrenceDates(group, '2026-09-01', '2026-09-30');
  assert.deepEqual(dates, ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28']);
  assert.equal(new Set(dates).size, dates.length);
  assert.deepEqual(occurrenceDates({ weekday: 1, starts_on: new Date('2026-09-01T00:00:00Z'), ends_on: null }, '2026-09-07', '2026-09-07'), ['2026-09-07']);
});

test('frozen roster не меняется после изменения исходного membership', () => {
  const memberships = [{ childId: 1, enrollmentId: 11 }, { childId: 2, enrollmentId: 12 }, { childId: 2, enrollmentId: 12 }];
  const frozen = freezeRosterMembers(memberships);
  memberships.splice(0, memberships.length, { childId: 3, enrollmentId: 13 });
  assert.deepEqual(frozen, [
    { childId: '1', enrollmentId: '11', type: 'main' },
    { childId: '2', enrollmentId: '12', type: 'main' },
  ]);
});

test('FIFO списывает ровно занятие и сохраняет историческую стоимость lot', () => {
  const result = planFifoConsumption([
    { id: 1, remainingLessons: '0.25000000', unitPrice: '1000.00' },
    { id: 2, remainingLessons: '2.00000000', unitPrice: '1025.00' },
  ], '1.00000000', '1125.00');
  assert.deepEqual(result.consumptions, [
    { lotId: '1', lessons: '0.25000000', amount: '250.00' },
    { lotId: '2', lessons: '0.75000000', amount: '768.75' },
  ]);
  assert.equal(result.uncoveredLessons, '0.00000000');
  assert.equal(result.amount, '1018.75');
});

test('при нехватке lots остаток уходит в минус без фиктивного lot', () => {
  const result = planFifoConsumption([{ id: 1, remainingLessons: '0.25000000', unitPrice: '1025.00' }], '1.00000000', '1125.00');
  assert.equal(result.consumptions.length, 1);
  assert.equal(result.uncoveredLessons, '0.75000000');
  assert.equal(result.amount, '1100.00');
});

test('reversal восстанавливает те же исторические lots', () => {
  const restored = restoredLotBalances(
    [{ id: 1, remainingLessons: '0.00000000' }, { id: 2, remainingLessons: '1.25000000' }],
    [{ lotId: 1, lessons: '0.25000000' }, { lotId: 2, lessons: '0.75000000' }],
  );
  assert.deepEqual(restored, [
    { lotId: '1', remainingLessons: '0.25000000' },
    { lotId: '2', remainingLessons: '2.00000000' },
  ]);
});

test('salary использует present main, trial и extra одинаково в счётчике', () => {
  const rates = { regularFixed: '600.00', perPresentChild: '100.00', introFixed: '600.00', emptyTripFixed: '300.00' };
  assert.deepEqual(calculateSalary('regular', 3, rates), { kind: 'regular', presentCount: 3, fixed: '600.00', children: '300.00', total: '900.00' });
  assert.equal(calculateSalary('intro', 7, rates).total, '600.00');
  assert.equal(calculateSalary('empty_trip', 0, rates).total, '300.00');
  assert.equal(calculateSalary('cancelled', 4, rates).total, '0.00');
});

test('lesson service содержит транзакционные guards для idempotency, reversal и teacher DTO', async () => {
  const [service, routes] = await Promise.all([
    readFile(new URL('../backend/src/lessons.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../backend/src/routes.mjs', import.meta.url), 'utf8'),
  ]);
  assert.match(service, /if \(lesson\.status === 'in_progress' \|\| lesson\.status === 'completed'\) return/);
  assert.match(service, /if \(lesson\.status === 'completed'\) return/);
  assert.match(service, /reversal_of_entry_id/);
  assert.match(service, /remaining_lessons=remaining_lessons\+:lessons/);
  assert.match(service, /supersedes_accrual_id/);
  assert.match(service, /hasRole\(context, 'director'\)[\s\S]*?salaryRows/);
  for (const route of ["'/lessons'", "'/lessons/:id/start'", "'/lessons/:id/finish'", "'/lessons/:id/attendance/:childId'", "'/lessons/:id/extras'", "'/lessons/:id/quick-child'", "'/salary-accruals'"]) assert.match(routes, new RegExp(route.replaceAll('/', '\\/')));
});

test('teacher DTO реального lesson service не раскрывает salary', async () => {
  const pool = { query: async (sql) => {
    if (sql.startsWith('SELECT id FROM teachers')) return [[{ id: 5 }]];
    if (sql.includes('FROM lessons l JOIN study_groups')) return [[{
      id: 1, group_id: 2, group_name: 'Группа', direction_id_snapshot: 3, direction_name: 'Робототехника',
      project_id_snapshot: 4, project_name: 'iCubeRobots', site_id_snapshot: 6, site_name: 'Площадка',
      planned_teacher_id: 5, planned_teacher_name: 'Преподаватель', actual_teacher_id: 5, actual_teacher_name: 'Преподаватель',
      scheduled_starts_at: '2026-09-14 10:00:00', scheduled_ends_at: '2026-09-14 11:00:00', starts_at: '2026-09-14 10:00:00', ends_at: '2026-09-14 11:00:00',
      actual_starts_at: null, actual_ends_at: null, status: 'scheduled', topic: null, is_intro_group: 0, is_empty_trip: 0,
      roster_frozen_at: null, attendance_applied_at: null, completed_at: null, cancelled_at: null, lock_version: 1,
    }]];
    if (sql.includes('lesson_roster_members')) return [[]];
    if (sql.includes('FROM attendances')) return [[]];
    throw new Error(`Неожиданный SQL: ${sql}`);
  } };
  const lesson = await createMysqlLessons(pool).get(1, { roles: ['teacher'], userId: 10 });
  assert.equal(lesson.actualTeacherId, '5');
  assert.equal('salary' in lesson, false);
});

function transactionPool(handler) {
  const connection = {
    query: handler,
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  };
  return { query: handler, getConnection: async () => connection };
}

function historicalFinishFixture({ present = 1, markedAt = '2026-09-14 10:05:00.000000' } = {}) {
  const lesson = {
    id: 50, group_id: 4, direction_id_snapshot: 1, project_id_snapshot: 2, site_id_snapshot: 3,
    planned_teacher_id: 6, actual_teacher_id: 6, status: 'in_progress', starts_at: '2026-09-14 10:00:00.000000',
    scheduled_starts_at: '2026-09-14 10:00:00.000000', scheduled_ends_at: '2026-09-14 11:00:00.000000',
    ends_at: '2026-09-14 11:00:00.000000', actual_starts_at: '2026-09-14 10:00:00.000000', actual_ends_at: null,
    topic: null, is_intro_group: 0, is_empty_trip: 0, roster_frozen_at: '2026-09-14 10:00:00.000000',
    attendance_applied_at: null, completed_at: null, cancelled_at: null, lock_version: 2,
  };
  const priceVersions = [
    { id: 1, validFrom: '2026-01-01 00:00:00.000000', validTo: '2026-09-14 15:00:00.000000', price: '1025.00' },
    { id: 2, validFrom: '2026-09-14 15:00:00.000000', validTo: null, price: '1250.00' },
  ];
  const salaryVersions = [
    { id: 12, validFrom: '2026-01-01 00:00:00.000000', validTo: '2026-09-14 15:00:00.000000', regular_fixed: '600.00', per_present_child: '100.00', intro_fixed: '600.00', empty_trip_fixed: '300.00' },
    { id: 13, validFrom: '2026-09-14 15:00:00.000000', validTo: null, regular_fixed: '900.00', per_present_child: '150.00', intro_fixed: '900.00', empty_trip_fixed: '450.00' },
  ];
  const effectiveAt = (versions, timestamp) => versions.find((version) => version.validFrom <= timestamp && (!version.validTo || version.validTo > timestamp));
  const captured = {};
  const handler = async (sql, params = {}) => {
    if (sql === 'SELECT * FROM lessons WHERE id=:id FOR UPDATE') return [[lesson]];
    if (sql === 'SELECT * FROM attendances WHERE lesson_id=:lessonId FOR UPDATE') return [[{
      id: 70, lesson_id: 50, child_id: 8, enrollment_id: 9, attendance_type: 'main', present, is_trial: 0, marked_at: markedAt,
    }]];
    if (sql.includes('FROM child_enrollments e WHERE')) {
      captured.priceSql = sql; captured.priceParams = params;
      return [[{ id: 9, child_id: 8, direction_id: 1, current_price: effectiveAt(priceVersions, params.startsAt).price }]];
    }
    if (sql.includes("be.entry_type='attendance'")) return [[]];
    if (sql.includes('FROM balance_lots')) return [[]];
    if (sql.startsWith('INSERT INTO balance_entries')) return [{ insertId: 80 }];
    if (sql.startsWith('UPDATE child_enrollments')) return [{ affectedRows: 1 }];
    if (sql.startsWith('UPDATE attendances SET enrollment_id')) { captured.attendancePrice = params.price; return [{ affectedRows: 1 }]; }
    if (sql.startsWith("UPDATE lessons SET status='completed'")) { lesson.status = 'completed'; return [{ affectedRows: 1 }]; }
    if (sql.startsWith('SELECT * FROM salary_accruals WHERE')) return [[]];
    if (sql.startsWith('SELECT * FROM salary_rate_versions WHERE')) {
      captured.salarySql = sql; captured.salaryParams = params;
      return [[effectiveAt(salaryVersions, params.startsAt)]];
    }
    if (sql.startsWith('SELECT COUNT(*) present_count')) return [[{ present_count: present ? 1 : 0 }]];
    if (sql.startsWith('INSERT INTO salary_accruals')) { captured.salary = params; return [{ insertId: 90 }]; }
    if (sql.includes('FROM lessons l JOIN study_groups')) return [[{
      ...lesson, group_name: 'Группа', direction_name: 'Робототехника', project_name: 'iCubeRobots', site_name: 'Площадка',
      planned_teacher_name: 'Преподаватель', actual_teacher_name: 'Преподаватель',
    }]];
    if (sql.includes('lesson_roster_members WHERE lesson_id IN')) return [[]];
    if (sql.includes('FROM attendances WHERE lesson_id IN')) return [[]];
    if (sql.includes('FROM salary_accruals sa WHERE sa.lesson_id IN')) return [[]];
    throw new Error(`Неожиданный SQL: ${sql}`);
  };
  return { pool: transactionPool(handler), captured };
}

test('утреннее посещение использует цену, действовавшую до дневного изменения', async () => {
  const { pool, captured } = historicalFinishFixture();
  await createMysqlLessons(pool).finish(50, {}, { roles: ['director'] });
  assert.equal(captured.priceParams.startsAt, '2026-09-14 10:00:00.000000');
  assert.match(captured.priceSql, /pv\.valid_from<=:startsAt/g);
  assert.match(captured.priceSql, /pv\.valid_to>:startsAt/g);
  assert.doesNotMatch(captured.priceSql, /DATE_ADD\(:date/);
  assert.equal(captured.attendancePrice, '1025.00');
});

test('утреннее занятие использует ставку зарплаты до дневного изменения', async () => {
  const { pool, captured } = historicalFinishFixture();
  await createMysqlLessons(pool).finish(50, {}, { roles: ['director'] });
  assert.equal(captured.salaryParams.startsAt, '2026-09-14 10:00:00.000000');
  assert.match(captured.salarySql, /valid_from<=:startsAt/);
  assert.match(captured.salarySql, /valid_to>:startsAt/);
  assert.doesNotMatch(captured.salarySql, /DATE_ADD\(DATE\(:startsAt\)/);
  assert.equal(captured.salary.total, '700.00');
});

test('обычное занятие нельзя завершить без явной отметки посещаемости', async () => {
  const { pool } = historicalFinishFixture({ present: 0, markedAt: null });
  await assert.rejects(
    createMysqlLessons(pool).finish(50, {}, { roles: ['director'] }),
    (error) => error.code === 'ATTENDANCE_REQUIRED' && error.status === 409,
  );
});

test('явно отмеченное отсутствие позволяет завершить обычное занятие', async () => {
  const { pool, captured } = historicalFinishFixture({ present: 0 });
  const lesson = await createMysqlLessons(pool).finish(50, {}, { roles: ['director'] });
  assert.equal(lesson.status, 'completed');
  assert.equal(captured.salary.present, 0);
});

test('более позднее посещение не отменяет trial у первого исторического занятия', async () => {
  const lesson = {
    id: 10, group_id: 4, direction_id_snapshot: 1, planned_teacher_id: 6, actual_teacher_id: null,
    starts_at: '2026-09-14 10:00:00.000000', status: 'scheduled',
  };
  let insertedTrial;
  const laterVisits = [{ lessonId: 20, startsAt: '2026-09-21 10:00:00.000000' }];
  const handler = async (sql, params = {}) => {
    if (sql === 'SELECT * FROM lessons WHERE id=:id FOR UPDATE') return [[lesson]];
    if (sql.startsWith('SELECT id FROM teachers')) return [[{ id: 6 }]];
    if (sql.includes('FROM group_memberships gm')) return [[{ child_id: 8, enrollment_id: 9 }]];
    if (sql.startsWith('INSERT IGNORE INTO lesson_roster_members')) return [{ affectedRows: 1 }];
    if (sql.startsWith('SELECT a.id FROM attendances a JOIN lessons')) {
      assert.match(sql, /l\.starts_at<:startsAt OR \(l\.starts_at=:startsAt AND l\.id<:lessonId\)/);
      assert.equal(params.startsAt, lesson.starts_at);
      const earlier = laterVisits.filter((visit) => visit.startsAt < params.startsAt || (visit.startsAt === params.startsAt && visit.lessonId < Number(params.lessonId)));
      return [earlier.map((visit) => ({ id: visit.lessonId }))];
    }
    if (sql.startsWith('INSERT IGNORE INTO attendances')) { insertedTrial = params.trial; return [{ affectedRows: 1 }]; }
    if (sql.startsWith("UPDATE lessons SET status='in_progress'")) { lesson.status = 'in_progress'; lesson.actual_teacher_id = 6; return [{ affectedRows: 1 }]; }
    if (sql.includes('FROM lessons l JOIN study_groups')) return [[{
      ...lesson, group_name: 'Группа', project_id_snapshot: 2, project_name: 'iCubeRobots', site_id_snapshot: 3, site_name: 'Площадка',
      direction_name: 'Робототехника', planned_teacher_name: 'Преподаватель', actual_teacher_name: 'Преподаватель',
      scheduled_starts_at: lesson.starts_at, scheduled_ends_at: '2026-09-14 11:00:00.000000', ends_at: '2026-09-14 11:00:00.000000',
      actual_starts_at: lesson.starts_at, actual_ends_at: null, topic: null, is_intro_group: 0, is_empty_trip: 0,
      roster_frozen_at: lesson.starts_at, attendance_applied_at: null, completed_at: null, cancelled_at: null, lock_version: 2,
    }]];
    if (sql.includes('lesson_roster_members WHERE lesson_id IN')) return [[]];
    if (sql.includes('FROM attendances WHERE lesson_id IN')) return [[]];
    if (sql.includes('FROM salary_accruals sa WHERE sa.lesson_id IN')) return [[]];
    throw new Error(`Неожиданный SQL: ${sql}`);
  };
  await createMysqlLessons(transactionPool(handler)).start(10, {}, { roles: ['director'] });
  assert.equal(insertedTrial, true);
});

test('после изменения расписания удаляются только пустые будущие occurrence и создаются новые', async () => {
  const group = {
    id: 4, direction_id: 1, project_id: 2, site_id: 3, default_teacher_id: 6,
    weekday: 5, start_time: '18:00:00', end_time: '19:00:00', starts_on: '2099-09-01', ends_on: null,
  };
  let nextId = 100;
  const lessons = [
    { id: 1, status: 'completed', scheduled_starts_at: '2099-09-02 17:00:00', starts_at: '2099-09-02 17:00:00' },
    { id: 2, status: 'scheduled', scheduled_starts_at: '2099-09-09 17:00:00', starts_at: '2099-09-09 17:00:00' },
    { id: 3, status: 'scheduled', scheduled_starts_at: '2099-09-16 17:00:00', starts_at: '2099-09-16 17:00:00' },
  ];
  let cleanupSql;
  const plusHour = (value) => `${value.slice(0, 11)}${String(Number(value.slice(11, 13)) + 1).padStart(2, '0')}${value.slice(13)}`;
  const complete = (row) => ({
    group_id: 4, group_name: 'Группа', direction_id_snapshot: 1, direction_name: 'Робототехника', project_id_snapshot: 2,
    project_name: 'iCubeRobots', site_id_snapshot: 3, site_name: 'Площадка', planned_teacher_id: 6,
    planned_teacher_name: 'Преподаватель', actual_teacher_id: 6, actual_teacher_name: 'Преподаватель',
    scheduled_ends_at: plusHour(String(row.scheduled_starts_at)), ends_at: plusHour(String(row.starts_at)), actual_starts_at: null,
    actual_ends_at: null, topic: null, is_intro_group: 0, is_empty_trip: 0, roster_frozen_at: null,
    attendance_applied_at: null, completed_at: row.status === 'completed' ? row.starts_at : null, cancelled_at: null, lock_version: 1,
    ...row,
  });
  const handler = async (sql, params = {}) => {
    if (sql.startsWith('DELETE l FROM lessons')) {
      cleanupSql = sql;
      for (let index = lessons.length - 1; index >= 0; index -= 1) if (lessons[index].status === 'scheduled') lessons.splice(index, 1);
      return [{ affectedRows: 2 }];
    }
    if (sql.startsWith('SELECT g.id,g.direction_id')) return [[group]];
    if (sql.startsWith('INSERT IGNORE INTO lessons')) {
      const scheduled = `${params.date} ${params.start}:00`;
      if (!lessons.some((item) => item.scheduled_starts_at === scheduled)) lessons.push({ id: nextId++, status: 'scheduled', scheduled_starts_at: scheduled, starts_at: scheduled });
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('FROM lessons l JOIN study_groups')) return [[...lessons.map(complete)]];
    if (sql.includes('lesson_roster_members WHERE lesson_id IN')) return [[]];
    if (sql.includes('FROM attendances WHERE lesson_id IN')) return [[]];
    if (sql.includes('FROM salary_accruals sa WHERE sa.lesson_id IN')) return [[]];
    throw new Error(`Неожиданный SQL: ${sql}`);
  };
  await createMysqlLessons({ query: handler }).list({ from: '2099-09-01', to: '2099-09-20' }, { roles: ['director'] });
  assert.match(cleanupSql, /l\.status='scheduled'.*l\.scheduled_starts_at>NOW\(6\)/s);
  assert.match(cleanupSql, /NOT EXISTS \(SELECT 1 FROM attendances/);
  assert.ok(lessons.some((item) => item.id === 1 && item.status === 'completed' && item.scheduled_starts_at === '2099-09-02 17:00:00'));
  assert.equal(lessons.some((item) => ['2099-09-09 17:00:00', '2099-09-16 17:00:00'].includes(item.scheduled_starts_at)), false);
  assert.deepEqual(lessons.filter((item) => item.status === 'scheduled').map((item) => item.scheduled_starts_at), [
    '2099-09-04 18:00:00', '2099-09-11 18:00:00', '2099-09-18 18:00:00',
  ]);
});

test('перенос проведённого занятия сохраняет id, статус, посещение и зарплату', async () => {
  const lesson = {
    id: 50, group_id: 4, direction_id_snapshot: 1, project_id_snapshot: 2, site_id_snapshot: 3,
    planned_teacher_id: 6, actual_teacher_id: 6, status: 'completed',
    scheduled_starts_at: '2026-09-14 10:00:00.000000', scheduled_ends_at: '2026-09-14 11:00:00.000000',
    starts_at: '2026-09-14 10:00:00.000000', ends_at: '2026-09-14 11:00:00.000000',
    actual_starts_at: '2026-09-14 10:00:00.000000', actual_ends_at: '2026-09-14 11:00:00.000000',
    topic: 'Тема', is_intro_group: 0, is_empty_trip: 0, roster_frozen_at: '2026-09-14 10:00:00.000000',
    attendance_applied_at: '2026-09-14 11:00:00.000000', completed_at: '2026-09-14 11:00:00.000000', cancelled_at: null, lock_version: 3,
  };
  const attendance = { id: 70, lesson_id: 50, child_id: 8, enrollment_id: 9, attendance_type: 'main', present: 1, is_trial: 0, price_snapshot: '1025.00', charged_lessons: '1.00000000', marked_at: '2026-09-14 10:05:00.000000' };
  const salary = { id: 90, lesson_id: 50, teacher_id: 6, rate_version_id: 12, accrual_type: 'regular', present_children: 1, fixed_amount: '600.00', children_amount: '100.00', total_amount: '700.00' };
  let updateSql;
  const handler = async (sql, params = {}) => {
    if (sql === 'SELECT * FROM lessons WHERE id=:id FOR UPDATE') return [[lesson]];
    if (sql.startsWith('SELECT id FROM teachers WHERE id=')) return [[{ id: 6 }]];
    if (sql.startsWith('UPDATE lessons SET starts_at=')) {
      updateSql = sql;
      lesson.starts_at = `${params.date} ${params.start}:00.000000`;
      lesson.ends_at = `${params.date} ${params.end}:00.000000`;
      lesson.lock_version += 1;
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('FROM lessons l JOIN study_groups')) return [[{ ...lesson, group_name: 'Группа', direction_name: 'Робототехника', project_name: 'iCubeRobots', site_name: 'Площадка', planned_teacher_name: 'Преподаватель', actual_teacher_name: 'Преподаватель' }]];
    if (sql.includes('lesson_roster_members WHERE lesson_id IN')) return [[{ lesson_id: 50, child_id: 8, roster_type: 'main' }]];
    if (sql.includes('FROM attendances WHERE lesson_id IN')) return [[attendance]];
    if (sql.includes('FROM salary_accruals sa WHERE sa.lesson_id IN')) return [[salary]];
    throw new Error(`Неожиданный SQL: ${sql}`);
  };
  const result = await createMysqlLessons(transactionPool(handler)).update(50, {
    date: '2026-09-18', startTime: '18:00', endTime: '19:00', actualTeacherId: 6,
  }, { roles: ['director'] });
  assert.equal(result.id, '50');
  assert.equal(result.status, 'completed');
  assert.equal(result.startsAt, '2026-09-18T18:00:00Z');
  assert.equal(result.attendances[0].id, '70');
  assert.equal(result.salary.id, '90');
  assert.doesNotMatch(updateSql, /status=/);
});

function quickChildRemovalFixture(history = {}) {
  const lesson = {
    id: 50, group_id: 4, direction_id_snapshot: 1, project_id_snapshot: 2, site_id_snapshot: 3,
    planned_teacher_id: 6, actual_teacher_id: 6, status: 'in_progress',
    scheduled_starts_at: '2026-09-14 10:00:00.000000', scheduled_ends_at: '2026-09-14 11:00:00.000000',
    starts_at: '2026-09-14 10:00:00.000000', ends_at: '2026-09-14 11:00:00.000000',
    actual_starts_at: '2026-09-14 10:00:00.000000', actual_ends_at: null, topic: null,
    is_intro_group: 0, is_empty_trip: 0, roster_frozen_at: '2026-09-14 10:00:00.000000', attendance_applied_at: null,
    completed_at: null, cancelled_at: null, lock_version: 2,
  };
  const calls = [];
  const handler = async (sql, params = {}) => {
    calls.push({ sql, params });
    if (sql === 'SELECT * FROM lessons WHERE id=:id FOR UPDATE') return [[lesson]];
    if (sql.startsWith('SELECT id FROM teachers WHERE user_id=')) return [[{ id: 6 }]];
    if (sql.startsWith('SELECT a.* FROM attendances')) return [[{ id: 70, lesson_id: 50, child_id: 8, enrollment_id: 9, attendance_type: 'extra', present: 1, is_trial: 1 }]];
    if (sql.startsWith('SELECT id,full_name FROM children')) return [[{ id: 8, full_name: 'Новый Ребёнок' }]];
    if (sql === 'SELECT id FROM child_enrollments WHERE child_id=:childId FOR UPDATE') return [[{ id: 9 }]];
    if (sql.includes('(SELECT COUNT(*) FROM payments')) return [[{ payments: 0, refunds: 0, attendances: 0, roster: 0, photos: 0, memberships: 0, balanceEntries: 0, balanceLots: 0, balanceTransfers: 0, nonzeroBalances: 0, enrollmentHistory: 0, childHistory: 0, userAccounts: 0, priceHistory: 0, ...history }]];
    if (sql.startsWith('SELECT guardian_id FROM child_guardians')) return [[{ guardian_id: 12 }]];
    if (sql.includes('FROM lessons l JOIN study_groups')) return [[{ ...lesson, group_name: 'Группа', direction_name: 'Робототехника', project_name: 'iCubeRobots', site_name: 'Площадка', planned_teacher_name: 'Преподаватель', actual_teacher_name: 'Преподаватель' }]];
    if (sql.includes('lesson_roster_members WHERE lesson_id IN') || sql.includes('FROM attendances WHERE lesson_id IN') || sql.includes('FROM salary_accruals sa WHERE sa.lesson_id IN')) return [[]];
    if (/^(DELETE|INSERT INTO notifications)/.test(sql)) return [{ affectedRows: 1, insertId: 100 }];
    throw new Error(`Неожиданный SQL: ${sql}`);
  };
  return { pool: transactionPool(handler), calls };
}

test('удаление временного quick child без другой истории полностью удаляет карточку и сохраняет уведомление', async () => {
  const { pool, calls } = quickChildRemovalFixture();
  await createMysqlLessons(pool).removeExtra(50, 8, { roles: ['teacher'], userId: 20 });
  assert.ok(calls.some(({ sql }) => sql.startsWith('DELETE FROM children')));
  assert.ok(calls.some(({ sql }) => sql.startsWith('DELETE FROM child_enrollments')));
  assert.ok(calls.some(({ sql }) => sql.includes('INSERT INTO notifications')));
});

test('quick child с другой историей сохраняется при удалении из занятия', async () => {
  const { pool, calls } = quickChildRemovalFixture({ payments: 1 });
  await createMysqlLessons(pool).removeExtra(50, 8, { roles: ['director'] });
  assert.equal(calls.some(({ sql }) => sql.startsWith('DELETE FROM children')), false);
  assert.equal(calls.some(({ sql }) => sql.includes('INSERT INTO notifications')), false);
});

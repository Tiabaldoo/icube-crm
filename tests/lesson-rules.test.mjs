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
  assert.match(routes, /router\.delete\('\/lessons\/:id'/);
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
    if (sql.includes('FROM attendances')) return [[{ id: 11, lesson_id: 1, child_id: 12, enrollment_id: 13,
      attendance_type: 'main', present: 1, is_trial: 0, price_snapshot: '1025.00', charged_lessons: '1.00000000', marked_at: null }]];
    throw new Error(`Неожиданный SQL: ${sql}`);
  } };
  const lesson = await createMysqlLessons(pool).get(1, { roles: ['teacher'], userId: 10 });
  assert.equal(lesson.actualTeacherId, '5');
  assert.equal('salary' in lesson, false);
  assert.equal('priceSnapshot' in lesson.attendances[0], false);
});

test('teacher не читает и не изменяет чужой lesson id', async () => {
  let scopedTeacher;
  const foreign = { id: 50, planned_teacher_id: 9, actual_teacher_id: null, deleted_at: null, status: 'scheduled' };
  const handler = async (sql, params = {}) => {
    if (sql.includes('FROM lessons l JOIN study_groups')) { scopedTeacher = params.actorTeacherId; return [[]]; }
    if (sql === 'SELECT * FROM lessons WHERE id=:id FOR UPDATE') return [[foreign]];
    throw new Error(`Неожиданный SQL: ${sql}`);
  };
  const service = createMysqlLessons(transactionPool(handler));
  await assert.rejects(service.get(50, { roles: ['teacher'], userId: '2', teacherId: '5' }), (error) => error.status === 404);
  assert.equal(scopedTeacher, '5');
  await assert.rejects(service.start(50, { actualTeacherId: 9 }, { roles: ['teacher'], userId: '2', teacherId: '5' }), (error) => error.status === 403);
});

test('teacher quick-child создаёт ребёнка, enrollment и attendance один раз только в своём занятии', async () => {
  const lesson = {
    id: 61, group_id: 4, direction_id_snapshot: 1, project_id_snapshot: 2, site_id_snapshot: 3,
    planned_teacher_id: 5, actual_teacher_id: 5, status: 'in_progress', deleted_at: null,
    scheduled_starts_at: '2026-09-23 10:00:00', scheduled_ends_at: '2026-09-23 11:00:00',
    starts_at: '2026-09-23 10:00:00', ends_at: '2026-09-23 11:00:00', actual_starts_at: '2026-09-23 10:00:00',
    actual_ends_at: null, topic: null, is_intro_group: 0, is_empty_trip: 0, roster_frozen_at: '2026-09-23 10:00:00',
    attendance_applied_at: null, completed_at: null, cancelled_at: null, lock_version: 2,
  };
  const counters = { children: 0, enrollments: 0, roster: 0, attendances: 0, notifications: 0 };
  let childId = null; let attendanceParams;
  const handler = async (sql, params = {}) => {
    if (sql === 'SELECT * FROM lessons WHERE id=:id FOR UPDATE') return [[lesson]];
    if (sql.startsWith('SELECT tp.teacher_id FROM teacher_projects')) return [[{ teacher_id: 5 }]];
    if (sql.startsWith('SELECT id FROM children WHERE create_idempotency_key=')) return [childId == null ? [] : [{ id: childId }]];
    if (sql.startsWith('INSERT INTO children')) { counters.children += 1; childId = 91; return [{ insertId: childId }]; }
    if (sql.startsWith('INSERT INTO child_enrollments')) { counters.enrollments += 1; return [{ insertId: 92 }]; }
    if (sql.startsWith('INSERT INTO lesson_roster_members')) { counters.roster += 1; return [{ insertId: 1 }]; }
    if (sql.startsWith('INSERT INTO attendances')) { counters.attendances += 1; attendanceParams = params; return [{ insertId: 93 }]; }
    if (sql.startsWith('INSERT INTO notifications')) { counters.notifications += 1; return [{ insertId: 94 }]; }
    if (sql.includes('FROM lessons l JOIN study_groups')) return [[{
      ...lesson, group_name: 'Группа', direction_name: 'Робототехника', project_name: 'iCubeRobots', site_name: 'Площадка',
      planned_teacher_name: 'Учитель', actual_teacher_name: 'Учитель',
    }]];
    if (sql.includes('lesson_roster_members WHERE lesson_id IN')) return [[{ lesson_id: 61, child_id: 91, roster_type: 'extra' }]];
    if (sql.includes('FROM attendances WHERE lesson_id IN')) return [[{ id: 93, lesson_id: 61, child_id: 91, enrollment_id: 92,
      attendance_type: 'extra', present: 1, is_trial: 1, price_snapshot: null, charged_lessons: '0.00000000', marked_at: '2026-09-23 10:05:00' }]];
    if (sql.includes('FROM salary_accruals sa WHERE sa.lesson_id IN')) return [[]];
    throw new Error(`Неожиданный SQL: ${sql}`);
  };
  const service = createMysqlLessons(transactionPool(handler));
  const context = { roles: ['teacher'], userId: '20', teacherId: '5', idempotencyKey: 'quick-child-command' };
  const created = await service.quickChild(61, { name: 'Новый Ребёнок', phone: null }, context);
  const retried = await service.quickChild(61, { name: 'Новый Ребёнок', phone: null }, context);
  assert.equal(created.childId, '91'); assert.equal(retried.childId, '91');
  assert.deepEqual(counters, { children: 1, enrollments: 1, roster: 1, attendances: 1, notifications: 1 });
  assert.equal(attendanceParams.childId, 91); assert.equal(attendanceParams.enrollmentId, 92);
  assert.equal(created.lesson.attendances[0].present, true); assert.equal(created.lesson.attendances[0].trial, true);
  await assert.rejects(
    service.quickChild(61, { name: 'Чужой Ребёнок' }, { ...context, teacherId: '6', idempotencyKey: 'foreign-command' }),
    (error) => error.status === 403,
  );
  assert.equal(counters.children, 1);
});

test('teacher start игнорирует чужой actualTeacherId, director teacher-mode сохраняет actor director', async () => {
  const makeHandler = (lesson, captured) => async (sql, params = {}) => {
    if (sql === 'SELECT * FROM lessons WHERE id=:id FOR UPDATE') return [[lesson]];
    if (sql.includes('FROM teacher_projects tp') && sql.includes('teacher_project_directions')) return [[{ teacher_id: 5 }]];
    if (sql.includes('FROM teachers t JOIN teacher_projects tp')) return [[{ id: params.id }]];
    if (sql.includes('FROM group_memberships gm')) return [[{ child_id: 8, enrollment_id: 10 }]];
    if (sql.startsWith('INSERT IGNORE INTO lesson_roster_members')) { captured.actorId = params.actorId; return [{ affectedRows: 1 }]; }
    if (sql.startsWith('SELECT a.id FROM attendances a JOIN lessons')) return [[]];
    if (sql.startsWith('INSERT IGNORE INTO attendances')) return [{ affectedRows: 1 }];
    if (sql.startsWith("UPDATE lessons SET status='in_progress'")) { captured.actualTeacherId = String(params.teacherId); lesson.status = 'in_progress'; lesson.actual_teacher_id = params.teacherId; return [{ affectedRows: 1 }]; }
    if (sql.includes('FROM lessons l JOIN study_groups')) return [[{ ...lesson, group_name: 'Группа', direction_name: 'Робототехника',
      project_id_snapshot: 2, project_name: 'iCubeRobots', site_id_snapshot: 3, site_name: 'Площадка', planned_teacher_name: 'Учитель', actual_teacher_name: 'Учитель',
      scheduled_starts_at: lesson.starts_at, scheduled_ends_at: lesson.ends_at, actual_starts_at: lesson.starts_at, actual_ends_at: null,
      topic: null, is_intro_group: 0, is_empty_trip: 0, roster_frozen_at: lesson.starts_at, attendance_applied_at: null, completed_at: null, cancelled_at: null, lock_version: 2 }]];
    if (sql.includes('lesson_roster_members WHERE lesson_id IN') || sql.includes('FROM attendances WHERE lesson_id IN') || sql.includes('FROM salary_accruals sa WHERE sa.lesson_id IN')) return [[]];
    throw new Error(`Неожиданный SQL: ${sql}`);
  };
  const teacherLesson = { id: 51, group_id: 4, direction_id_snapshot: 1, planned_teacher_id: 5, actual_teacher_id: null,
    starts_at: '2026-09-15 10:00:00', ends_at: '2026-09-15 11:00:00', status: 'scheduled' };
  const teacherCaptured = {};
  await createMysqlLessons(transactionPool(makeHandler(teacherLesson, teacherCaptured))).start(51, { actualTeacherId: 99 }, { roles: ['teacher'], userId: '2', teacherId: '5' });
  assert.equal(teacherCaptured.actualTeacherId, '5'); assert.equal(teacherCaptured.actorId, '2');

  const directorLesson = { ...teacherLesson, id: 52, planned_teacher_id: 6, actual_teacher_id: null, status: 'scheduled' };
  const directorCaptured = {};
  await createMysqlLessons(transactionPool(makeHandler(directorLesson, directorCaptured))).start(52, { actualTeacherId: 6 }, { roles: ['director'], userId: '1' });
  assert.equal(directorCaptured.actualTeacherId, '6'); assert.equal(directorCaptured.actorId, '1');
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

test('потерянный ответ start/finish и повтор команды не дублируют roster, списание, зарплату и уведомление', async () => {
  const lesson = {
    id: 77, group_id: 4, direction_id_snapshot: 1, project_id_snapshot: 2, site_id_snapshot: 3,
    planned_teacher_id: 6, actual_teacher_id: null, status: 'scheduled', deleted_at: null,
    starts_at: '2026-09-14 10:00:00.000000', ends_at: '2026-09-14 11:00:00.000000',
    scheduled_starts_at: '2026-09-14 10:00:00.000000', scheduled_ends_at: '2026-09-14 11:00:00.000000',
    actual_starts_at: null, actual_ends_at: null, topic: null, is_intro_group: 0, is_empty_trip: 0,
    roster_frozen_at: null, attendance_applied_at: null, completed_at: null, cancelled_at: null, lock_version: 1,
  };
  const attendance = { id: 70, lesson_id: 77, child_id: 8, enrollment_id: 9, attendance_type: 'main',
    present: 0, is_trial: 0, marked_at: null, price_snapshot: null, charged_lessons: '0.00000000' };
  const lot = { id: 30, remaining_lessons: '4.00000000', unit_price: '1025.00', created_at: '2026-09-01 10:00:00' };
  const counters = { rosterInserts: 0, attendanceInserts: 0, startUpdates: 0, debitEntries: 0,
    lotUpdates: 0, lotConsumptions: 0, enrollmentDebits: 0, attendanceCharges: 0,
    finishUpdates: 0, salaryInserts: 0, salaryReversals: 0, notificationCalls: 0 };
  let debit = null; let salary = null;

  const handler = async (sql, params = {}) => {
    if (sql === 'SELECT * FROM lessons WHERE id=:id FOR UPDATE') return [[lesson]];
    if (sql.includes('FROM teachers t JOIN teacher_projects tp')) return [[{ id: 6 }]];
    if (sql.includes('FROM group_memberships gm')) return [[{ child_id: 8, enrollment_id: 9 }]];
    if (sql.startsWith('INSERT IGNORE INTO lesson_roster_members')) { counters.rosterInserts += 1; return [{ affectedRows: 1 }]; }
    if (sql.startsWith('SELECT a.id FROM attendances a JOIN lessons')) return [[]];
    if (sql.startsWith('INSERT IGNORE INTO attendances')) { counters.attendanceInserts += 1; return [{ affectedRows: 1 }]; }
    if (sql.startsWith("UPDATE lessons SET status='in_progress'")) {
      counters.startUpdates += 1; lesson.status = 'in_progress'; lesson.actual_teacher_id = params.teacherId;
      lesson.actual_starts_at = lesson.starts_at; lesson.roster_frozen_at = lesson.starts_at; lesson.lock_version += 1;
      return [{ affectedRows: 1 }];
    }
    if (sql === 'SELECT * FROM attendances WHERE lesson_id=:lessonId FOR UPDATE') return [[attendance]];
    if (sql.includes('FROM child_enrollments e WHERE')) return [[{ id: 9, child_id: 8, direction_id: 1, current_price: '1025.00' }]];
    if (sql.includes("be.entry_type='attendance'")) return [debit ? [debit] : []];
    if (sql.includes('FROM balance_lots')) return [[lot]];
    if (sql.startsWith('INSERT INTO balance_entries')) {
      counters.debitEntries += 1; debit = { id: 80, enrollment_id: 9, attendance_id: 70, entry_type: 'attendance',
        lessons_delta: '-1.00000000', amount_delta: params.amount, unit_price_snapshot: params.price };
      return [{ insertId: 80 }];
    }
    if (sql.startsWith('UPDATE balance_lots SET remaining_lessons=remaining_lessons-')) {
      counters.lotUpdates += 1; lot.remaining_lessons = '3.00000000'; return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('INSERT INTO balance_lot_consumptions')) { counters.lotConsumptions += 1; return [{ insertId: 81 }]; }
    if (sql.startsWith('UPDATE child_enrollments SET balance_lessons=balance_lessons-')) { counters.enrollmentDebits += 1; return [{ affectedRows: 1 }]; }
    if (sql.startsWith('UPDATE attendances SET enrollment_id=:enrollmentId,price_snapshot=')) {
      counters.attendanceCharges += 1; attendance.price_snapshot = params.price; attendance.charged_lessons = '1.00000000'; return [{ affectedRows: 1 }];
    }
    if (sql.startsWith("UPDATE lessons SET status='completed'")) {
      counters.finishUpdates += 1; lesson.status = 'completed'; lesson.completed_at = lesson.ends_at;
      lesson.actual_ends_at = lesson.ends_at; lesson.attendance_applied_at = lesson.ends_at; lesson.lock_version += 1;
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('SELECT * FROM salary_accruals WHERE')) return [salary ? [salary] : []];
    if (sql.startsWith('SELECT COUNT(*) present_count')) return [[{ present_count: attendance.present ? 1 : 0 }]];
    if (sql.startsWith('SELECT * FROM salary_rate_versions WHERE')) return [[{ id: 12, regular_fixed: '600.00',
      per_present_child: '100.00', intro_fixed: '600.00', empty_trip_fixed: '300.00' }]];
    if (sql.startsWith('INSERT INTO salary_accruals')) {
      counters.salaryInserts += 1; salary = { id: 90, lesson_id: 77, teacher_id: 6, rate_version_id: 12,
        accrual_type: 'regular', present_children: 1, fixed_amount: '600.00', children_amount: '100.00', total_amount: '700.00', reversed_at: null };
      return [{ insertId: 90 }];
    }
    if (sql.startsWith('UPDATE salary_accruals SET reversed_at=')) { counters.salaryReversals += 1; return [{ affectedRows: 1 }]; }
    if (sql.includes('FROM lessons l JOIN study_groups')) return [[{ ...lesson, group_name: 'Группа', direction_name: 'Робототехника',
      project_name: 'iCubeRobots', site_name: 'Площадка', planned_teacher_name: 'Преподаватель', actual_teacher_name: 'Преподаватель' }]];
    if (sql.includes('lesson_roster_members WHERE lesson_id IN')) return [[{ lesson_id: 77, child_id: 8, roster_type: 'main' }]];
    if (sql.includes('FROM attendances WHERE lesson_id IN')) return [[attendance]];
    if (sql.includes('FROM salary_accruals sa WHERE sa.lesson_id IN')) return [salary ? [salary] : []];
    throw new Error(`Неожиданный SQL: ${sql}`);
  };
  const parentNotifications = { async lessonFinished() { counters.notificationCalls += 1; return 1; } };
  const service = createMysqlLessons(transactionPool(handler), { parentNotifications });
  const context = { roles: ['director'], userId: '1' }; const startBody = { actualTeacherId: 6 };

  await service.start(77, startBody, context); // Сервер применил команду, но клиент не получил ответ.
  await service.start(77, startBody, context); // Клиент повторил ту же команду.
  assert.deepEqual({ rosterInserts: counters.rosterInserts, attendanceInserts: counters.attendanceInserts, startUpdates: counters.startUpdates },
    { rosterInserts: 1, attendanceInserts: 1, startUpdates: 1 });

  attendance.present = 1; attendance.marked_at = '2026-09-14 10:05:00.000000';
  await service.finish(77, {}, context); // Finish зафиксирован, его HTTP-ответ потерян.
  await service.finish(77, {}, context); // Повтор той же команды после восстановления сети.

  assert.equal(lesson.status, 'completed'); assert.equal(lot.remaining_lessons, '3.00000000');
  assert.deepEqual(counters, {
    rosterInserts: 1, attendanceInserts: 1, startUpdates: 1,
    debitEntries: 1, lotUpdates: 1, lotConsumptions: 1, enrollmentDebits: 1, attendanceCharges: 1,
    finishUpdates: 1, salaryInserts: 1, salaryReversals: 0, notificationCalls: 1,
  });
});

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

test('явно отмеченное отсутствие не позволяет завершить занятие и не создаёт зарплату', async () => {
  const { pool, captured } = historicalFinishFixture({ present: 0 });
  await assert.rejects(createMysqlLessons(pool).finish(50, {}, { roles: ['director'] }), (error) => error.code === 'ATTENDANCE_REQUIRED' && error.status === 409);
  assert.equal(captured.salary, undefined);
});

test('активный group membership попадает во frozen roster, а поздний визит не отменяет trial', async () => {
  const lesson = {
    id: 10, group_id: 4, direction_id_snapshot: 1, planned_teacher_id: 6, actual_teacher_id: null,
    starts_at: '2026-09-14 10:00:00.000000', status: 'scheduled',
  };
  let insertedTrial; let rosterChild;
  const laterVisits = [{ lessonId: 20, startsAt: '2026-09-21 10:00:00.000000' }];
  const handler = async (sql, params = {}) => {
    if (sql === 'SELECT * FROM lessons WHERE id=:id FOR UPDATE') return [[lesson]];
    if (sql.includes('FROM teachers t JOIN teacher_projects tp')) return [[{ id: 6 }]];
    if (sql.includes('FROM group_memberships gm')) return [[{ child_id: 8, enrollment_id: 9 }]];
    if (sql.startsWith('INSERT IGNORE INTO lesson_roster_members')) { rosterChild = params.childId; return [{ affectedRows: 1 }]; }
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
  assert.equal(rosterChild, '8');
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
    if (sql.includes('FROM teachers t JOIN teacher_projects tp')) return [[{ id: 6 }]];
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
  assert.equal(result.startsAt, '2026-09-18T18:00:00+11:00');
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
    if (sql.includes('FROM teacher_projects tp') && sql.includes('teacher_project_directions')) return [[{ teacher_id: 6 }]];
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

test('teacher lesson access requires active project and allowed direction while director and partner retain scope access', async () => {
  const rows = [
    { id: 101, group_id: 11, group_name: 'iCube', direction_id_snapshot: 1, direction_name: 'Робототехника', project_id_snapshot: 1, project_name: 'iCubeRobots', site_id_snapshot: 1, site_name: 'Площадка', planned_teacher_id: 5, planned_teacher_name: 'Учитель', actual_teacher_id: null, actual_teacher_name: null, scheduled_starts_at: '2026-09-24 10:00:00', scheduled_ends_at: '2026-09-24 11:00:00', starts_at: '2026-09-24 10:00:00', ends_at: '2026-09-24 11:00:00', status: 'scheduled', topic: null, is_intro_group: 0, is_empty_trip: 0, lock_version: 1 },
    { id: 202, group_id: 22, group_name: 'Zebra', direction_id_snapshot: 1, direction_name: 'Робототехника', project_id_snapshot: 2, project_name: 'Зебра', site_id_snapshot: 2, site_name: 'Зебра', planned_teacher_id: 5, planned_teacher_name: 'Учитель', actual_teacher_id: null, actual_teacher_name: null, scheduled_starts_at: '2026-09-25 10:00:00', scheduled_ends_at: '2026-09-25 11:00:00', starts_at: '2026-09-25 10:00:00', ends_at: '2026-09-25 11:00:00', status: 'scheduled', topic: null, is_intro_group: 0, is_empty_trip: 0, lock_version: 1 },
  ];
  let teacherSql = '';
  const handler = async (sql, params = {}) => {
    if (sql.includes('FROM study_groups g WHERE g.deleted_at IS NULL')) return [[]];
    if (sql.includes('FROM lessons l') && sql.includes('l.deleted_at IS NOT NULL')) return [[]];
    if (sql.includes('FROM lessons l JOIN study_groups')) {
      if (params.actorTeacherId) { teacherSql = sql; return [[rows[0]]]; }
      if (params.id) return [[rows.find((row) => String(row.id) === String(params.id))].filter(Boolean)];
      return [rows];
    }
    if (sql.includes('lesson_roster_members WHERE lesson_id IN') || sql.includes('FROM attendances WHERE lesson_id IN') || sql.includes('FROM salary_accruals sa WHERE sa.lesson_id IN')) return [[]];
    if (sql === 'SELECT * FROM lessons WHERE id=:id FOR UPDATE') return [[rows[1]]];
    if (sql.includes('FROM teacher_projects tp') && sql.includes('teacher_project_directions')) return [[]];
    throw new Error(`Неожиданный SQL: ${sql}`);
  };
  const service = createMysqlLessons(transactionPool(handler));
  const teacherRows = await service.list({}, { roles: ['teacher'], userId: '9', teacherId: '5' });
  assert.deepEqual(teacherRows.map((lesson) => lesson.id), ['101']);
  assert.match(teacherSql, /tp\.active=TRUE/); assert.match(teacherSql, /teacher_project_directions/);
  await assert.rejects(service.start(202, {}, { roles: ['teacher'], userId: '9', teacherId: '5' }), (error) => error.status === 403);
  assert.deepEqual((await service.list({}, { roles: ['director'], userId: '1' })).map((lesson) => lesson.id), ['101', '202']);
  assert.equal((await service.get(202, { roles: ['partner'], userId: '2', projectIds: ['2'] })).id, '202');
});

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

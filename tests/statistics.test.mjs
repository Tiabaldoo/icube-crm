import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateStatistics, createStatistics } from '../backend/src/statistics.mjs';

const period = { from: '2026-09-01', to: '2026-09-30' };
const filters = { projectId: null, directionId: null };

test('completed lessons, ordinary visits/absences и ordinary extra считаются, trial исключается', () => {
  const result = calculateStatistics({ period, filters, attendanceRows: [
    { lesson_id: 1, group_id: 5, attendance_id: 10, attendance_type: 'main', present: 1, is_trial: 0, marked_at: 'x' },
    { lesson_id: 1, group_id: 5, attendance_id: 11, attendance_type: 'main', present: 0, is_trial: 0, marked_at: 'x' },
    { lesson_id: 1, group_id: 5, attendance_id: 12, attendance_type: 'main', present: 1, is_trial: 1, marked_at: 'x' },
    { lesson_id: 2, group_id: 5, attendance_id: 13, attendance_type: 'extra', present: 1, is_trial: 0, marked_at: 'x' },
    { lesson_id: 2, group_id: 5, attendance_id: 14, attendance_type: 'extra', present: 0, is_trial: 0, marked_at: 'x' },
  ], currentRows: [{ group_id: 5, group_name: 'Группа', project_id: 1, project_name: 'iCube', direction_id: 1, direction_name: 'Роботы', child_id: null }] });
  assert.deepEqual({ lessons: result.summary.completedLessons, visits: result.summary.visits, absences: result.summary.absences, rate: result.summary.attendancePercent },
    { lessons: 2, visits: 2, absences: 1, rate: '66.7' });
});

test('New считается по первым ordinary visits отдельно по context, но summary дедуплицирует ребёнка', () => {
  const result = calculateStatistics({ period, filters, firstVisitRows: [
    { child_id: 7, group_id: 5, project_id_snapshot: 1, direction_id_snapshot: 1 },
    { child_id: 7, group_id: 6, project_id_snapshot: 1, direction_id_snapshot: 2 },
    { child_id: 8, group_id: 5, project_id_snapshot: 1, direction_id_snapshot: 1 },
  ] });
  assert.equal(result.summary.newChildren, 2);
});

test('последний paused/finished входит в Left, вернувшийся active не приходит из ranked SQL', () => {
  const result = calculateStatistics({ period, filters, leftRows: [
    { enrollment_id: 20, child_id: 7, group_id: 5, new_status: 'paused' },
    { enrollment_id: 21, child_id: 8, group_id: 5, new_status: 'finished' },
  ] });
  assert.equal(result.summary.leftChildren, 2);
});

test('active current membership формирует уникальных детей и occupancy 75%/112.5%', () => {
  const currentRows = [];
  for (let child = 1; child <= 6; child += 1) currentRows.push({ group_id: 5, group_name: 'А', project_id: 1, project_name: 'iCube', direction_id: 1, direction_name: 'Роботы', child_id: child });
  for (let child = 1; child <= 9; child += 1) currentRows.push({ group_id: 6, group_name: 'Б', project_id: 1, project_name: 'iCube', direction_id: 2, direction_name: 'Код', child_id: child });
  const result = calculateStatistics({ period, filters, currentRows });
  assert.equal(result.summary.activeChildren, 9);
  assert.deepEqual(result.groups.map((group) => [group.currentMembers, group.capacity, group.occupancyPercent]), [[6, 8, '75.0'], [9, 8, '112.5']]);
  assert.equal(result.summary.averageOccupancyPercent, '93.8');
});

test('statistics SQL исключает cancelled/deleted, использует snapshots и применяет project/direction filters', async () => {
  const calls = [];
  const pool = { query: async (sql, params) => { calls.push({ sql, params }); return [[]]; } };
  const result = await createStatistics(pool).get({ from: period.from, to: period.to, projectId: '2', directionId: '3' });
  assert.equal(result.summary.completedLessons, 0); assert.deepEqual(result.groups, []);
  const attendanceSql = calls[0].sql;
  assert.match(attendanceSql, /l\.status='completed'/); assert.match(attendanceSql, /l\.deleted_at IS NULL/);
  assert.match(attendanceSql, /l\.project_id_snapshot=:projectId/); assert.match(attendanceSql, /l\.direction_id_snapshot=:directionId/);
  const firstSql = calls[1].sql;
  assert.match(firstSql, /a\.present=TRUE AND a\.is_trial=FALSE/); assert.match(firstSql, /PARTITION BY a\.child_id,l\.project_id_snapshot,l\.direction_id_snapshot/);
  const leftSql = calls[2].sql;
  assert.match(leftSql, /PARTITION BY h\.enrollment_id ORDER BY h\.changed_at DESC,h\.id DESC/);
  assert.match(leftSql, /new_status IN \('paused','finished'\)/);
  const currentSql = calls[3].sql;
  assert.match(currentSql, /e\.status='active'/); assert.match(currentSql, /g\.active=TRUE/);
  assert.equal(calls.every(({ params }) => params.projectId === '2' && params.directionId === '3'), true);
});

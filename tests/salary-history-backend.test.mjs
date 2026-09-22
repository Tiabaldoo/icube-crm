import assert from 'node:assert/strict';
import test from 'node:test';
import { createMysqlLessons } from '../backend/src/lessons.mjs';

function pool(handler) {
  return { query: async (sql, params = {}) => [await handler(sql, params)] };
}

const accrual = {
  id: 91, lesson_id: 44, teacher_id: 5, rate_version_id: 7, accrual_type: 'regular',
  present_children: 3, fixed_amount: '600.00', children_amount: '300.00', total_amount: '900.00',
  starts_at: '2025-01-15 10:00:00', ends_at: '2025-01-15 11:30:00', group_id: 12, group_name: 'Историческая группа',
  project_id_snapshot: 1, project_name: 'iCubeRobots', site_id: 8, site_name: 'ДК «Океан»',
};

test('salary-accruals returns self-contained historical amounts, project and effective site', async () => {
  const calls = [];
  const lessons = createMysqlLessons(pool(async (sql, params) => {
    calls.push({ sql, params });
    assert.match(sql, /sa\.reversed_at IS NULL/);
    assert.match(sql, /l\.project_id_snapshot=:projectId/);
    assert.match(sql, /COALESCE\(l\.site_override_id,l\.site_id_snapshot\) site_id/);
    assert.match(sql, /COALESCE\(os\.name,ss\.name\) site_name/);
    assert.match(sql, /ORDER BY l\.starts_at,sa\.id/);
    return [accrual];
  }));
  const rows = await lessons.salaryAccruals(
    { teacherId: '5', projectId: '1', from: '2025-01-01', to: '2025-01-31' },
    { roles: ['director'], projectIds: [] },
  );
  assert.equal(calls[0].params.projectId, '1');
  assert.equal(calls[0].params.from, '2025-01-01');
  assert.equal(calls[0].params.to, '2025-01-31');
  assert.deepEqual(rows[0], {
    id: '91', lessonId: '44', teacherId: '5', rateVersionId: '7',
    type: 'regular', presentChildren: 3, fixedAmount: '600.00', childrenAmount: '300.00', totalAmount: '900.00',
    startsAt: '2025-01-15T10:00:00+11:00', endsAt: '2025-01-15T11:30:00+11:00', groupId: '12', groupName: 'Историческая группа',
    projectId: '1', projectName: 'iCubeRobots', siteId: '8', siteName: 'ДК «Океан»',
  });
});

test('salary-accruals period boundaries are inclusive and reversed dates are rejected', async () => {
  let capturedSql = '';
  const lessons = createMysqlLessons(pool(async (sql) => { capturedSql = sql; return []; }));
  await lessons.salaryAccruals(
    { teacherId: '5', from: '2026-09-11', to: '2026-10-10' },
    { roles: ['director'], projectIds: [] },
  );
  assert.match(capturedSql, /DATE\(l\.starts_at\)>=:from/);
  assert.match(capturedSql, /DATE\(l\.starts_at\)<=:to/);
  await assert.rejects(
    lessons.salaryAccruals({ teacherId: '5', from: '2026-10-10', to: '2026-09-11' }, { roles: ['director'] }),
    { status: 400, code: 'VALIDATION_ERROR', message: 'Дата начала периода должна быть не позже даты окончания' },
  );
});

test('partner salary scope always overrides a foreign projectId query', async () => {
  let captured;
  const lessons = createMysqlLessons(pool(async (sql, params) => { captured = { sql, params }; return []; }));
  await lessons.salaryAccruals(
    { teacherId: '5', projectId: '1', from: '2026-08-26', to: '2026-09-25' },
    { roles: ['partner'], projectIds: ['2'] },
  );
  assert.equal(captured.params.projectId, '2');
  assert.match(captured.sql, /l\.project_id_snapshot=:projectId/);
});

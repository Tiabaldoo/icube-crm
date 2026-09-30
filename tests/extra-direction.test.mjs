import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createMysqlLessons } from '../backend/src/lessons.mjs';

function fixture({ completed = false, existingTarget = false, targetStatus = 'active' } = {}) {
  const lesson = { id: 60, group_id: 10, direction_id_snapshot: 1, project_id_snapshot: 3,
    planned_teacher_id: 4, actual_teacher_id: 4, status: completed ? 'completed' : 'in_progress',
    starts_at: '2026-09-14 10:00:00', ends_at: '2026-09-14 11:00:00' };
  const state = { enrollments: existingTarget ? [{ id: 102, project_id: 3, status: targetStatus }] : [],
    attendance: completed ? { id: 201, child_id: 51, enrollment_id: 101, is_trial: 0, present: 1, charged_lessons: '1.00000000' } : null,
    roster: completed ? 'extra' : null, created: 0, reversals: 0, salaryChecks: 0, calls: [] };
  const query = async (sql, p = {}) => {
    state.calls.push({ sql, p });
    if (sql === 'SELECT * FROM lessons WHERE id=:id FOR UPDATE') return [[lesson]];
    if (sql.startsWith('SELECT tp.teacher_id FROM teacher_projects')) return [[{ teacher_id: 4 }]];
    if (sql.includes('FROM lessons l JOIN study_groups')) return [[{ ...lesson, group_name: 'Группа', direction_name: 'Робототехника', project_name: 'iCubeRobots',
      site_id_snapshot: 4, site_name: 'Площадка', planned_teacher_name: 'Преподаватель', actual_teacher_name: 'Преподаватель' }]];
    if (sql.includes('lesson_roster_members WHERE lesson_id IN')) return [[state.roster ? { lesson_id: 60, child_id: 51, roster_type: state.roster } : null].filter(Boolean)];
    if (sql.includes('FROM attendances WHERE lesson_id IN')) return [[state.attendance && { ...state.attendance, lesson_id: 60, attendance_type: 'extra', marked_at: '2026-09-14 10:05:00' }].filter(Boolean)];
    if (sql.includes('FROM salary_accruals sa WHERE sa.lesson_id IN')) return [[]];
    if (sql.startsWith('SELECT id FROM children WHERE id=')) return [[{ id: 51 }]];
    if (sql.startsWith('SELECT id FROM directions WHERE id=')) return [[{ id: 1 }]];
    if (sql.startsWith('SELECT id,project_id,status FROM child_enrollments')) return [[...state.enrollments]];
    if (sql.startsWith('INSERT INTO child_enrollments')) { state.created++; state.enrollments.push({ id: 102, project_id: 3, status: 'active' }); return [{ insertId: 102 }]; }
    if (sql.startsWith('SELECT roster_type FROM lesson_roster_members')) return [state.roster ? [{ roster_type: state.roster }] : []];
    if (sql.startsWith('SELECT * FROM attendances WHERE lesson_id=:lessonId AND child_id=:childId')) return [state.attendance ? [{ ...state.attendance }] : []];
    if (sql.startsWith('SELECT be.* FROM balance_entries')) return [state.reversals ? [] : [{ id: 301, enrollment_id: 101, lessons_delta: '-1.00000000', amount_delta: '-1125.00', unit_price_snapshot: '1125.00' }]];
    if (sql.startsWith('SELECT balance_lot_id,lessons FROM balance_lot_consumptions')) return [[{ balance_lot_id: 401, lessons: '1.00000000' }]];
    if (sql.startsWith('INSERT INTO balance_entries')) { state.reversals++; return [{ insertId: 302 }]; }
    if (sql.startsWith('UPDATE balance_lots') || sql.startsWith('UPDATE child_enrollments') || sql.startsWith('UPDATE attendances SET charged_lessons')) return [{ affectedRows: 1 }];
    if (sql.startsWith('UPDATE attendances SET enrollment_id=:enrollmentId,is_trial=TRUE')) {
      Object.assign(state.attendance, { enrollment_id: p.enrollmentId, is_trial: 1, charged_lessons: '0.00000000', price_snapshot: null }); return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('INSERT INTO lesson_roster_members')) { state.roster = 'extra'; return [{ insertId: 1 }]; }
    if (sql.startsWith('INSERT INTO attendances')) { state.attendance = { id: 201, child_id: 51, enrollment_id: p.enrollmentId,
      is_trial: 1, present: 1, charged_lessons: '0.00000000' }; return [{ insertId: 201 }]; }
    if (sql.startsWith('SELECT * FROM salary_accruals')) { state.salaryChecks++; return [[{ id: 501, teacher_id: 4, rate_version_id: 1, accrual_type: 'regular', present_children: 1, total_amount: '700.00' }]]; }
    if (sql.startsWith('SELECT COUNT(*) present_count')) return [[{ present_count: 1 }]];
    if (sql.startsWith('SELECT * FROM salary_rate_versions')) return [[{ id: 1, regular_fixed: '600.00', per_present_child: '100.00', intro_fixed: '600.00', empty_trip_fixed: '300.00' }]];
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  const connection = { query, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {} };
  return { service: createMysqlLessons({ query, getConnection: async () => connection }), state };
}

const director = { roles: ['director'], userId: 1 };
test('extra trial direction creates only enrollment on lesson date and no group membership or debit', async () => {
  const f = fixture(); const lesson = await f.service.makeExtraTrialDirection(60, 51, director);
  assert.equal(f.state.created, 1);
  assert.equal(f.state.attendance.enrollment_id, 102);
  assert.equal(f.state.attendance.is_trial, 1);
  assert.equal(lesson.attendances[0].trial, true);
  assert.ok(f.state.calls.some(({ sql, p }) => sql.startsWith('INSERT INTO child_enrollments') && p.startsAt === '2026-09-14 10:00:00'));
  assert.ok(!f.state.calls.some(({ sql }) => /^(INSERT|UPDATE|DELETE).*group_memberships|^UPDATE child_enrollments SET balance_lessons/.test(sql)));
  await f.service.makeExtraTrialDirection(60, 51, director);
  assert.equal(f.state.created, 1);
  assert.equal(f.state.calls.filter(({ sql }) => sql.startsWith('INSERT INTO attendances')).length, 1);
});

test('completed extra reverses old debit and rebinds attendance as trial exactly once', async () => {
  const f = fixture({ completed: true });
  await f.service.makeExtraTrialDirection(60, 51, director);
  assert.equal(f.state.reversals, 1); assert.equal(f.state.attendance.enrollment_id, 102);
  assert.equal(f.state.attendance.charged_lessons, '0.00000000'); assert.equal(f.state.salaryChecks, 1);
  assert.ok(f.state.calls.some(({ sql, p }) => sql.startsWith('UPDATE child_enrollments SET balance_lessons=balance_lessons+') && p.id === 101));
  await f.service.makeExtraTrialDirection(60, 51, director);
  assert.equal(f.state.reversals, 1); assert.equal(f.state.created, 1);
});

test('existing target enrollment is reused, unavailable enrollment is rejected', async () => {
  const active = fixture({ existingTarget: true });
  await active.service.makeExtraTrialDirection(60, 51, director);
  assert.equal(active.state.created, 0); assert.equal(active.state.attendance.enrollment_id, 102);
  const finished = fixture({ existingTarget: true, targetStatus: 'finished' });
  await assert.rejects(finished.service.makeExtraTrialDirection(60, 51, director), { code: 'ENROLLMENT_UNAVAILABLE' });
  assert.equal(finished.state.attendance, null);
  const foreign = fixture({ existingTarget: true }); foreign.state.enrollments[0].project_id = 99;
  await assert.rejects(foreign.service.makeExtraTrialDirection(60, 51, director), { code: 'ENROLLMENT_UNAVAILABLE' });
  assert.equal(foreign.state.created, 0);
});

test('teacher cannot rebind a completed extra', async () => {
  const f = fixture({ completed: true });
  await assert.rejects(f.service.makeExtraTrialDirection(60, 51, { roles: ['teacher'], userId: 9, teacherId: 4 }), { status: 403 });
  assert.equal(f.state.created, 0); assert.equal(f.state.reversals, 0);
});

test('frontend search pins each enrollment and extra menu uses atomic trial action', async () => {
  const [ui, sync, routes] = await Promise.all([
    readFile(new URL('../src/frontend/crm-ui.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/frontend/api-sync.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../backend/src/routes.mjs', import.meta.url), 'utf8'),
  ]);
  const search = ui.slice(ui.indexOf('window.showExtraResults=function(q)'), ui.indexOf('// Make the new-child action visible', ui.indexOf('window.showExtraResults=function(q)')));
  assert.match(search, /flatMap\(function\(c\)/);
  assert.match(search, /addExtra\('\+row\.child\.id\+','\+row\.enrollment\.id/);
  assert.match(ui, /onclick="icubeExtraOptions\('/);
  assert.match(sync, /if \(!lesson\.isMixed && Number\(selected\.directionId\) !== Number\(lesson\.directionId\)\)/);
  assert.match(sync, /enrollmentId: Number\(enrollmentId\)/);
  assert.match(sync, /icubeApi\.makeExtraTrialDirection/);
  assert.match(routes, /\/lessons\/:id\/extras\/:childId\/trial-direction/);
});

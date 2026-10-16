import test from 'node:test';
import assert from 'node:assert/strict';
import { createMysqlLessons } from '../backend/src/lessons.mjs';
import { createMysqlCatalog } from '../backend/src/catalog.mjs';
import { freezeRosterMembers, lessonUnits, lessonDecimal } from '../backend/src/lesson-rules.mjs';

const director = { roles: ['director'], userId: '1' };
const teacher = { roles: ['teacher'], userId: '2', teacherId: '5' };

// Stateful SQL fixture, following the project's existing transaction-pool tests.
// Financial rows and rollback are modelled; unexpected queries fail the test.
function fixture({ type = 'main', missing = false, status = 'completed', mode = 'standard' } = {}) {
  let state = {
    lesson: { id: 10, group_id: 20, project_id_snapshot: 1, direction_id_snapshot: 1, is_mixed_snapshot: 1,
      planned_teacher_id: 5, actual_teacher_id: 5, status, starts_at: '2026-09-10 10:00:00', ends_at: '2026-09-10 11:00:00',
      scheduled_starts_at: '2026-09-10 10:00:00', scheduled_ends_at: '2026-09-10 11:00:00', calculation_mode_snapshot: mode,
      teacher_share_percent_snapshot: '50', partner_share_percent_snapshot: '25', tax_percent_snapshot: '0', custom_tax_enabled_snapshot: 0 },
    roster: [{ lesson_id: 10, child_id: 7, roster_type: type }],
    attendances: missing ? [] : [{ id: 30, lesson_id: 10, child_id: 7, enrollment_id: 11, attendance_type: type,
      present: false, is_trial: false, charged_lessons: '0.00000000', marked_at: null }],
    enrollments: [{ id: 11, child_id: 7, direction_id: 1, project_id: 1, status: 'active', current_price: '1000.00', balance_lessons: '4.00000000' },
      { id: 12, child_id: 7, direction_id: 2, project_id: 1, status: 'active', current_price: '1500.00', balance_lessons: '3.00000000' }],
    lots: [{ id: 40, enrollment_id: 11, remaining_lessons: '4.00000000', unit_price: '900.00' },
      { id: 41, enrollment_id: 12, remaining_lessons: '3.00000000', unit_price: '1400.00' }],
    entries: [], consumptions: [], salaries: [], audit: [], dependencies: {}, candidates: [{ id: 11 }],
    memberships: [{ child_id: 7, enrollment_id: 11, group_id: 20, started_on: '2026-09-01' }],
    payments: [{ id: 77, amount: '4500.00', price_snapshot: '900.00' }],
    otherLesson: { id: 99, status: 'completed', attendance: { present: true, enrollment_id: 90 } }, deletedChild: false,
  };
  let snapshot; let failure = null; let nextId = 100;
  const add = (left, right) => lessonDecimal(lessonUnits(String(left)) + lessonUnits(String(right)));
  const mutation = () => [{ affectedRows: 1 }];
  const query = async (raw, p = {}) => {
    const sql = raw.replace(/\s+/g, ' ').trim();
    if (failure && sql.startsWith(failure)) throw new Error('injected financial failure');
    if (sql === 'SELECT * FROM lessons WHERE id=:id FOR UPDATE') return [[{ ...state.lesson }]];
    if (sql.startsWith('SELECT tp.teacher_id')) return [[{ teacher_id: 5 }]];
    if (sql.startsWith('SELECT roster_type FROM lesson_roster_members')) return [state.roster.filter((r) => String(r.child_id) === String(p.childId))];
    if (sql.startsWith('SELECT * FROM attendances WHERE lesson_id=:lessonId AND child_id=:childId')) return [state.attendances.filter((a) => String(a.child_id) === String(p.childId)).map((a) => ({ ...a }))];
    if (sql.startsWith('SELECT e.id,e.child_id,e.direction_id,e.balance_lessons')) return [state.enrollments.filter((e) => String(e.id) === String(p.enrollmentId) && String(e.child_id) === String(p.childId) && String(e.project_id) === String(p.projectId)).map((e) => ({ ...e }))];
    if (sql.startsWith('SELECT DISTINCT e.id')) {
      assert.match(sql, /e\.started_on<=DATE\(:startsAt\)/);
      if (sql.includes('JOIN group_memberships')) assert.match(sql, /gm\.started_on<=DATE\(:startsAt\)/);
      return [state.candidates];
    }
    for (const [table, dependency] of Object.entries({ balance_transfers: 'transfers', enrollment_project_transfers: 'projectTransfers', refunds: 'refunds', partner_settlements: 'settlements' })) {
      if (sql.startsWith(`SELECT id FROM ${table} WHERE`)) { assert.match(sql, /FOR UPDATE$/); return [state.dependencies[dependency] ? [{ id: 1 }] : []]; }
    }
    if (sql.startsWith('SELECT be.* FROM balance_entries')) return [state.entries.filter((e) => e.attendance_id === p.attendanceId && e.entry_type === 'attendance' && !state.entries.some((r) => r.reversal_of_entry_id === e.id))];
    if (sql.startsWith('SELECT balance_lot_id,lessons')) return [state.consumptions.filter((c) => c.balance_entry_id === p.entryId)];
    if (sql.startsWith('SELECT id,remaining_lessons,unit_price FROM balance_lots')) return [state.lots.filter((l) => String(l.enrollment_id) === String(p.enrollmentId) && lessonUnits(l.remaining_lessons) > 0n).map((l) => ({ ...l }))];
    if (sql.startsWith('INSERT INTO balance_entries')) {
      const id = nextId++; const reversal = sql.includes("'reversal'");
      state.entries.push({ id, enrollment_id: p.enrollmentId, attendance_id: reversal ? null : p.attendanceId,
        entry_type: reversal ? 'reversal' : 'attendance', lessons_delta: reversal ? p.lessons : '-1.00000000',
        amount_delta: p.amount, unit_price_snapshot: p.price, reversal_of_entry_id: p.oldEntryId });
      return [{ insertId: id }];
    }
    if (sql.startsWith('UPDATE balance_lots SET remaining_lessons=')) {
      const lot = state.lots.find((l) => String(l.id) === String(p.id));
      lot.remaining_lessons = add(lot.remaining_lessons, sql.includes('remaining_lessons+:lessons') ? p.lessons : lessonDecimal(-lessonUnits(p.lessons)));
      return mutation();
    }
    if (sql.startsWith('INSERT INTO balance_lot_consumptions')) { state.consumptions.push({ balance_lot_id: Number(p.lotId), balance_entry_id: p.entryId, lessons: p.lessons, amount: p.amount }); return mutation(); }
    if (sql.startsWith('UPDATE child_enrollments SET balance_lessons=')) {
      const e = state.enrollments.find((e) => String(e.id) === String(p.id));
      e.balance_lessons = add(e.balance_lessons, sql.includes('balance_lessons-1.00000000') ? '-1.00000000' : p.lessons); return mutation();
    }
    if (sql.startsWith('INSERT INTO attendances')) {
      const id = nextId++; state.attendances.push({ id, lesson_id: 10, child_id: Number(p.childId), enrollment_id: Number(p.enrollmentId), attendance_type: p.type, present: false, is_trial: p.trial, marked_at: null, charged_lessons: '0.00000000' }); return [{ insertId: id }];
    }
    if (sql.startsWith('UPDATE attendances SET enrollment_id=:enrollmentId,attendance_type=')) {
      Object.assign(state.attendances.find((a) => a.id === p.id), { enrollment_id: Number(p.enrollmentId), attendance_type: p.type, present: p.present, is_trial: p.trial,
        marked_at: p.present ? '2026-09-10 10:05:00' : null, price_snapshot: null, charged_lessons: '0.00000000' }); return mutation();
    }
    if (sql.startsWith('UPDATE attendances SET enrollment_id=:enrollmentId,price_snapshot=')) {
      Object.assign(state.attendances.find((a) => a.id === p.id), { enrollment_id: Number(p.enrollmentId), price_snapshot: p.price, charged_lessons: '1.00000000' }); return mutation();
    }
    if (sql.startsWith('UPDATE attendances SET charged_lessons=0')) { state.attendances.find((a) => a.id === p.id).charged_lessons = '0.00000000'; return mutation(); }
    if (sql.startsWith('INSERT INTO audit_log')) { state.audit.push(JSON.parse(p.after)); return mutation(); }
    if (sql.startsWith('SELECT * FROM salary_accruals')) return [state.salaries.filter((s) => !s.reversed_at).slice(-1)];
    if (sql.startsWith('SELECT COUNT(*) present_count')) return [[{ present_count: state.attendances.filter((a) => a.present).length }]];
    if (sql.startsWith('SELECT price_snapshot,charged_lessons')) return [state.attendances.filter((a) => a.present && !a.is_trial && Number(a.charged_lessons) > 0)];
    if (sql.includes('FROM salary_rate_versions')) return [[{ id: 1, regular_fixed: '600.00', per_present_child: '100.00', intro_fixed: '600.00', empty_trip_fixed: '300.00' }]];
    if (sql.startsWith('UPDATE salary_accruals SET reversed_at=')) { state.salaries.find((s) => s.id === p.id).reversed_at = 'now'; return mutation(); }
    if (sql.startsWith('INSERT INTO salary_accruals')) { const id = nextId++; state.salaries.push({ id, teacher_id: p.teacherId, rate_version_id: p.rateId, accrual_type: p.type, present_children: p.present, total_amount: p.total, supersedes_accrual_id: p.supersedes }); return [{ insertId: id }]; }
    if (sql.startsWith('SELECT e.id,e.direction_id FROM child_enrollments')) return [state.enrollments.filter((e) => String(e.child_id) === String(p.childId) && String(e.project_id) === String(p.projectId))];
    if (sql.startsWith('SELECT a.id FROM attendances a JOIN lessons')) return [[{ id: 999 }]]; // An established child, not an automatic trial.
    if (sql.startsWith('INSERT INTO lesson_roster_members')) { state.roster.push({ lesson_id: 10, child_id: Number(p.childId), roster_type: 'extra' }); return mutation(); }
    if (sql.startsWith('SELECT a.* FROM attendances a JOIN lesson_roster_members')) return [state.attendances.filter((a) => String(a.child_id) === String(p.childId) && state.roster.some((r) => r.child_id === a.child_id && r.roster_type === 'extra'))];
    if (sql.startsWith('DELETE FROM lesson_roster_members WHERE lesson_id=')) { state.roster = state.roster.filter((r) => String(r.child_id) !== String(p.childId)); return mutation(); }
    if (sql.includes('FROM lessons l JOIN study_groups')) return [[{ ...state.lesson, group_name: 'Смешанная', direction_name: 'Робототехника' }]];
    if (sql.includes('lesson_roster_members WHERE lesson_id IN')) return [state.roster];
    if (sql.includes('FROM attendances WHERE lesson_id IN')) return [state.attendances];
    if (sql.includes('FROM salary_accruals sa WHERE sa.lesson_id IN')) return [state.salaries.filter((s) => !s.reversed_at).map((s) => ({ ...s, lesson_id: 10 }))];
    if (sql.startsWith('SELECT c.id, c.full_name')) return [[{ id: 7, full_name: 'Ошибка', status: 'lead' }]];
    if (sql.startsWith('SELECT e.id, e.child_id')) return [[]];
    if (sql.startsWith('SELECT (SELECT COUNT(*) FROM payments')) return [[{ payments: state.payments.length, attendances: state.attendances.filter((a) => a.marked_at != null).length,
      balanceEffects: state.entries.filter((e) => e.entry_type === 'attendance' && !state.entries.some((r) => r.reversal_of_entry_id === e.id)).length,
      nonzeroBalances: state.enrollments.filter((e) => Number(e.balance_lessons) !== 0).length }]];
    if (sql.startsWith('SELECT id FROM child_enrollments WHERE child_id=')) return [state.enrollments];
    if (sql.startsWith('SELECT guardian_id FROM child_guardians')) return [[]];
    if (sql.startsWith('DELETE FROM attendances WHERE enrollment_id=')) { state.attendances = state.attendances.filter((a) => String(a.enrollment_id) !== String(p.id) || a.marked_at != null); return mutation(); }
    if (sql.startsWith('DELETE FROM lesson_roster_members WHERE child_id=')) { state.roster = []; return mutation(); }
    if (sql.startsWith('DELETE FROM children WHERE id=')) { state.deletedChild = true; return mutation(); }
    if (sql.startsWith('DELETE ') && sql.includes(':id')) return mutation();
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  const connection = { query, async beginTransaction() { snapshot = structuredClone(state); }, async commit() {},
    async rollback() { state = snapshot; }, release() {} };
  const pool = { query, getConnection: async () => connection };
  return { service: createMysqlLessons(pool), catalog: createMysqlCatalog(pool), get state() { return state; }, failAt(prefix) { failure = prefix; } };
}

const balance = (f, id = 11) => f.state.enrollments.find((e) => e.id === id).balance_lessons;
const salary = (f) => f.state.salaries.filter((s) => !s.reversed_at).reduce((sum, s) => sum + Number(s.total_amount), 0);
const mark = (f, present, trial = false, actor = director) => f.service.putAttendance(10, 7, { present, trial }, actor);

for (const viaDelete of [false, true]) test(`main: mark → ${viaDelete ? 'card delete' : 'uncheck'} → mark preserves exact FIFO, roster and salary`, async () => {
  const f = fixture(); const unchanged = structuredClone({ memberships: f.state.memberships, payments: f.state.payments, otherLesson: f.state.otherLesson });
  await mark(f, true); await mark(f, true);
  assert.equal(balance(f), '3.00000000'); assert.equal(salary(f), 700); assert.equal(f.state.entries.length, 1);
  assert.equal(f.state.entries[0].amount_delta, '-900.00'); // FIFO lot price, not today's 1000.
  if (viaDelete) await f.service.removeAttendance(10, 7, director); else await mark(f, false);
  assert.equal(balance(f), '4.00000000'); assert.equal(salary(f), 0); assert.equal(f.state.roster.length, 1);
  assert.equal(f.state.attendances[0].present, false); assert.equal(f.state.attendances[0].marked_at, null);
  assert.equal(f.state.lots[0].remaining_lessons, '4.00000000');
  await f.service.removeAttendance(10, 7, director); assert.equal(f.state.entries.length, 2);
  await mark(f, true); assert.equal(balance(f), '3.00000000'); assert.equal(salary(f), 700);
  assert.equal(f.state.attendances.length, 1); assert.equal(f.state.entries.length, 3); assert.equal(f.state.consumptions.length, 2);
  assert.deepEqual({ memberships: f.state.memberships, payments: f.state.payments, otherLesson: f.state.otherLesson }, unchanged);
});

test('legacy frozen main without attendance restores only the historical enrollment and rejects outsiders', async () => {
  const f = fixture({ missing: true }); await mark(f, true); assert.equal(balance(f), '3.00000000');
  assert.equal(f.state.attendances[0].enrollment_id, 11);
  const before = structuredClone(f.state);
  await assert.rejects(f.service.putAttendance(10, 999, { present: true }, director), { code: 'CHILD_NOT_IN_LESSON' });
  assert.deepEqual(f.state, before);
});

test('ambiguous historical enrollment refuses atomically instead of selecting the first direction', async () => {
  const f = fixture({ missing: true }); f.state.candidates.push({ id: 12 }); const before = structuredClone(f.state);
  await assert.rejects(mark(f, true), { code: 'ATTENDANCE_ENROLLMENT_AMBIGUOUS' }); assert.deepEqual(f.state, before);
  assert.throws(() => freezeRosterMembers([{ childId: 7, enrollmentId: 11 }, { childId: 7, enrollmentId: 12 }]), { code: 'ATTENDANCE_ENROLLMENT_AMBIGUOUS' });
});

test('legacy extra still in frozen roster restores an unambiguous historical enrollment', async () => {
  const f = fixture({ type: 'extra', missing: true }); await mark(f, true);
  assert.equal(f.state.roster.length, 1); assert.equal(f.state.attendances[0].attendance_type, 'extra');
  assert.equal(balance(f), '3.00000000');
});

test('extra: uncheck preserves participant; removal and re-add can select a different direction', async () => {
  const f = fixture({ type: 'extra' }); await mark(f, true); await mark(f, false);
  assert.equal(f.state.roster.length, 1); await mark(f, true);
  const removed = await f.service.removeExtra(10, 7, director);
  assert.equal(removed.roster.length, 0); assert.equal(removed.attendances.length, 0);
  assert.equal(balance(f), '4.00000000'); assert.equal(salary(f), 0);
  await f.service.removeExtra(10, 7, director);
  await f.service.addExtra(10, { childId: 7, enrollmentId: 12 }, director);
  await f.service.addExtra(10, { childId: 7, enrollmentId: 12 }, director);
  assert.equal(f.state.attendances.length, 1); assert.equal(f.state.attendances[0].enrollment_id, 12);
  assert.equal(balance(f), '4.00000000'); assert.equal(balance(f, 12), '2.00000000'); assert.equal(salary(f), 700);
  assert.equal(f.state.attendances[0].price_snapshot, '1500.00');
});

test('extra with two directions requires explicit selection; ordinary-group makeup uses selected direction', async () => {
  const f = fixture({ type: 'extra' }); await f.service.removeExtra(10, 7, director);
  await assert.rejects(f.service.addExtra(10, { childId: 7 }, director), { code: 'ENROLLMENT_REQUIRED' });
  f.state.lesson.is_mixed_snapshot = 0;
  await f.service.addExtra(10, { childId: 7, enrollmentId: 12 }, director);
  assert.equal(balance(f), '4.00000000'); assert.equal(balance(f, 12), '2.00000000');
});

test('one available enrollment is sufficient in a mixed lesson', async () => {
  const f = fixture({ type: 'extra' }); await f.service.removeExtra(10, 7, director); f.state.enrollments.pop();
  await f.service.addExtra(10, { childId: 7 }, director); assert.equal(balance(f), '3.00000000');
});

for (const mode of ['standard', 'attendance_share']) test(`trial toggles without presence have no debit or salary (${mode})`, async () => {
  const f = fixture({ mode }); await mark(f, false, true); assert.equal(balance(f), '4.00000000'); assert.equal(salary(f), 0);
  assert.equal(f.state.attendances[0].marked_at, null);
  await mark(f, true, true); assert.equal(balance(f), '4.00000000'); assert.equal(salary(f), mode === 'standard' ? 700 : 0);
  await mark(f, true, false); assert.equal(balance(f), '3.00000000'); assert.equal(salary(f), mode === 'standard' ? 700 : 500);
  await mark(f, true, true); assert.equal(balance(f), '4.00000000'); assert.equal(f.state.lots[0].remaining_lessons, '4.00000000');
  await mark(f, false, true); assert.equal(salary(f), 0);
});

test('existing teacher, partner and parent permissions are retained for completed lessons', async () => {
  const f = fixture(); await mark(f, true, false, teacher); assert.equal(balance(f), '3.00000000');
  await assert.rejects(f.service.removeAttendance(10, 7, teacher), { status: 403 });
  await assert.rejects(f.service.removeExtra(10, 7, teacher), { status: 403 });
  await assert.rejects(f.service.removeAttendance(10, 7, { roles: ['parent'], userId: '4' }), { status: 403 });
  await assert.rejects(mark(f, false, false, { roles: ['partner'], userId: '3', projectIds: ['2'] }), { status: 403 });
  await mark(f, false, false, { roles: ['partner'], userId: '3', projectIds: ['1'] }); assert.equal(balance(f), '4.00000000');
});

for (const failure of ['INSERT INTO audit_log', 'INSERT INTO salary_accruals']) test(`failure at ${failure} rolls back all financial state`, async () => {
  const f = fixture({ mode: 'attendance_share' }); await mark(f, true); const before = structuredClone(f.state); f.failAt(failure);
  await assert.rejects(mark(f, true, true), /injected financial failure/);
  assert.deepEqual(f.state, before);
});

for (const dependency of ['transfers', 'projectTransfers', 'refunds', 'settlements']) test(`${dependency} refuses historical correction before any changes`, async () => {
  const f = fixture(); await mark(f, true); f.state.dependencies[dependency] = 1; const before = structuredClone(f.state);
  await assert.rejects(mark(f, false), { code: 'ATTENDANCE_FINANCIAL_HISTORY' }); assert.deepEqual(f.state, before);
});

test('cleared attendance and reversed technical effects do not prevent deleting an otherwise empty erroneous child', async () => {
  const f = fixture(); f.state.enrollments.forEach((e) => { e.balance_lessons = '0.00000000'; }); f.state.lots = []; f.state.payments = [];
  await mark(f, true); assert.equal(balance(f), '-1.00000000'); await mark(f, false);
  assert.equal(balance(f), '0.00000000'); await f.catalog.deleteChild(7); assert.equal(f.state.deletedChild, true);
  assert.equal(f.state.attendances.length, 0); assert.equal(f.state.roster.length, 0);
});

test('subsequently funded debt is rejected before reversing unbacked lessons', async () => {
  const f = fixture(); f.state.enrollments[0].balance_lessons = '-1.00000000'; f.state.lots = [];
  await mark(f, true); assert.equal(balance(f), '-2.00000000');
  // A later payment covered this debt; the original debit has no lot to restore.
  f.state.enrollments[0].balance_lessons = '1.00000000'; const before = structuredClone(f.state);
  await assert.rejects(mark(f, false), { code: 'ATTENDANCE_FINANCIAL_HISTORY' }); assert.deepEqual(f.state, before);
});

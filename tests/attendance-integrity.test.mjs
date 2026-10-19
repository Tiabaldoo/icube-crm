import test from 'node:test';
import assert from 'node:assert/strict';
import { createMysqlLessons } from '../backend/src/lessons.mjs';
import { createMysqlCatalog } from '../backend/src/catalog.mjs';
import { freezeRosterMembers, lessonUnits, lessonDecimal } from '../backend/src/lesson-rules.mjs';

const director = { roles: ['director'], userId: '1' };
const teacher = { roles: ['teacher'], userId: '2', teacherId: '5' };

// Stateful SQL fixture, following the project's existing transaction-pool tests.
// Financial rows and rollback are modelled; unexpected queries fail the test.
function fixture({ type = 'main', missing = false, status = 'completed', mode = 'standard', notificationEvents = null } = {}) {
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
    lots: [{ id: 40, enrollment_id: 11, original_lessons: '4.00000000', remaining_lessons: '4.00000000', unit_price: '900.00' },
      { id: 41, enrollment_id: 12, original_lessons: '3.00000000', remaining_lessons: '3.00000000', unit_price: '1400.00' }],
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
    if (sql.startsWith('SELECT roster_type FROM lesson_roster_members')) return [state.roster.filter((r) => String(r.child_id) === String(p.childId) && (!sql.includes("roster_type='extra'") || r.roster_type === 'extra'))];
    if (sql.startsWith('SELECT * FROM attendances WHERE lesson_id=:lessonId AND child_id=:childId')) return [state.attendances.filter((a) => String(a.child_id) === String(p.childId)).map((a) => ({ ...a }))];
    if (sql.startsWith('SELECT e.id,e.child_id,e.direction_id,e.balance_lessons')) return [state.enrollments.filter((e) => String(e.id) === String(p.enrollmentId) && String(e.child_id) === String(p.childId) && String(e.project_id) === String(p.projectId)).map((e) => ({ ...e }))];
    if (sql.startsWith('SELECT DISTINCT e.id')) {
      assert.match(sql, /e\.started_on<=DATE\(:startsAt\)/);
      if (sql.includes('JOIN group_memberships')) assert.match(sql, /gm\.started_on<=DATE\(:startsAt\)/);
      return [state.candidates];
    }
    for (const [table, dependency] of Object.entries({ balance_transfers: 'transfers', enrollment_project_transfers: 'projectTransfers', refunds: 'refunds', partner_settlements: 'settlements' })) {
      if (sql.startsWith(`SELECT id FROM ${table} WHERE`)) {
        assert.match(sql, /FOR UPDATE$/);
        const rows = state.dependencies[dependency] ?? [];
        return [table === 'enrollment_project_transfers' ? rows.filter((r) => String(r.source_enrollment_id) === String(p.enrollmentId)
          || (sql.includes('OR target_enrollment_id=') && String(r.target_enrollment_id) === String(p.enrollmentId))) : rows];
      }
    }
    if (sql.startsWith('SELECT be.* FROM balance_entries')) return [state.entries.filter((e) => e.attendance_id === p.attendanceId && e.entry_type === 'attendance' && !state.entries.some((r) => r.reversal_of_entry_id === e.id))];
    if (sql.startsWith('SELECT balance_lot_id,lessons')) return [state.consumptions.filter((c) => c.balance_entry_id === p.entryId)];
    if (sql.startsWith('SELECT id,enrollment_id,original_lessons,remaining_lessons FROM balance_lots')) return [state.lots.filter((l) => String(l.id) === String(p.id)).map((l) => ({ ...l }))];
    if (sql.startsWith('SELECT dependent.id FROM balance_lot_consumptions linked')) {
      assert.match(sql, /source\.entry_type='transfer_in'/);
      assert.match(sql, /dependent\.occurred_at>debit\.occurred_at/);
      const lot = state.lots.find((l) => String(l.id) === String(p.lotId));
      if (!state.entries.some((e) => e.id === lot?.source_balance_entry_id && e.entry_type === 'transfer_in')) return [[]];
      const debit = state.entries.find((e) => e.id === p.entryId);
      return [state.consumptions.filter((c) => String(c.balance_lot_id) === String(p.lotId)).map((c) => state.entries.find((e) => e.id === c.balance_entry_id))
        .filter((e) => ['transfer_out', 'refund'].includes(e.entry_type) && !state.entries.some((r) => r.reversal_of_entry_id === e.id)
          && (e.occurred_at > debit.occurred_at || (e.occurred_at === debit.occurred_at && e.id > debit.id)))];
    }
    if (sql.startsWith('SELECT id,remaining_lessons,unit_price FROM balance_lots')) return [state.lots.filter((l) => String(l.enrollment_id) === String(p.enrollmentId) && lessonUnits(l.remaining_lessons) > 0n).map((l) => ({ ...l }))];
    if (sql.startsWith('INSERT INTO balance_entries')) {
      const id = nextId++; const reversal = sql.includes("'reversal'");
      state.entries.push({ id, enrollment_id: p.enrollmentId, attendance_id: reversal ? null : p.attendanceId,
        entry_type: reversal ? 'reversal' : 'attendance', lessons_delta: reversal ? p.lessons : '-1.00000000',
        amount_delta: p.amount, unit_price_snapshot: p.price, reversal_of_entry_id: p.oldEntryId, occurred_at: p.occurredAt });
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
    if (sql.startsWith('SELECT id,full_name FROM children')) return [[]]; // Established child, not a temporary quick child.
    if (sql.includes('FROM lessons l JOIN study_groups')) return [[{ ...state.lesson, group_name: 'Смешанная', direction_name: 'Робототехника' }]];
    if (sql.includes('lesson_roster_members WHERE lesson_id IN')) return [state.roster];
    if (sql.includes('FROM attendances WHERE lesson_id IN')) {
      assert.match(sql, /e\.id=attendances\.enrollment_id/);
      return [state.attendances.map((a) => {
        const active = state.entries.filter((e) => e.attendance_id === a.id && e.entry_type === 'attendance'
          && !state.entries.some((r) => r.reversal_of_entry_id === e.id));
        if (sql.includes('charged_amount')) {
          assert.match(sql, /-MIN\(be\.amount_delta\)/);
          assert.match(sql, /reversal\.reversal_of_entry_id=be\.id/);
        }
        return { ...a, attendance_direction_name: state.enrollments.find((e) => e.id === a.enrollment_id)?.direction_id === 2 ? 'Программирование' : 'Робототехника',
          charged_amount: active.length === 1 ? (-Number(active[0].amount_delta)).toFixed(2) : null };
      })];
    }
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
  return { service: createMysqlLessons(pool,{notificationEvents}), catalog: createMysqlCatalog(pool), get state() { return state; }, failAt(prefix) { failure = prefix; } };
}

const balance = (f, id = 11) => f.state.enrollments.find((e) => e.id === id).balance_lessons;
const salary = (f) => f.state.salaries.filter((s) => !s.reversed_at).reduce((sum, s) => sum + Number(s.total_amount), 0);
const mark = (f, present, trial = false, actor = director) => f.service.putAttendance(10, 7, { present, trial }, actor);

test('lead paid alert hook runs only after actual paid debit, never trial, absence or repeated identical request',async()=>{
  const alerts=[];const f=fixture({notificationEvents:{leadPaidAttendance:async(_c,p)=>alerts.push(p),debtThreshold:async()=>{}}});
  await mark(f,true,true);assert.equal(alerts.length,0);
  await mark(f,false,true);assert.equal(alerts.length,0);
  await mark(f,true,false);assert.deepEqual(alerts,[{enrollmentId:11}]);
  await mark(f,true,false);assert.equal(alerts.length,1);
  await mark(f,false);assert.equal(alerts.length,1);
  await mark(f,true);assert.equal(alerts.length,2,'event service deduplicates re-marking using the enrollment key');
});

test('attendance DTO exposes the exact active FIFO amount that deletion reverses, without changing financial rules', async () => {
  const f = fixture(); const marked = await mark(f, true); const row = marked.attendances[0];
  assert.equal(row.directionName, 'Робототехника'); assert.equal(row.priceSnapshot, '1000.00');
  assert.equal(row.chargedAmount, '900.00', 'FIFO debit differs from the enrollment price snapshot');
  const nonDirector = (await f.service.get(10, teacher)).attendances[0];
  assert.equal(Object.hasOwn(nonDirector, 'chargedAmount'), false, 'financial details stay director-only');
  await f.service.removeAttendance(10, 7, director);
  assert.equal(f.state.entries[1].amount_delta, row.chargedAmount);
  assert.equal(f.state.entries[1].reversal_of_entry_id, f.state.entries[0].id);
  assert.equal(balance(f), '4.00000000'); assert.equal(f.state.lots[0].remaining_lessons, '4.00000000');
  assert.equal((await f.service.get(10, director)).attendances[0].chargedAmount, null);
  const again = await mark(f, true); assert.equal(again.attendances[0].chargedAmount, '900.00');
  assert.equal(f.state.entries.length, 3); assert.equal(balance(f), '3.00000000');
});

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

for (const dependency of ['projectTransfers', 'settlements', 'lotOwnership', 'lotCapacity']) test(`${dependency} refuses unsafe historical correction before any changes`, async () => {
  const f = fixture(); await mark(f, true);
  if (dependency === 'projectTransfers') f.state.dependencies.projectTransfers = [{ id: 1, source_enrollment_id: 11, target_enrollment_id: 90 }];
  if (dependency === 'settlements') f.state.dependencies.settlements = [{ id: 1 }];
  if (dependency === 'lotOwnership') f.state.lots[0].enrollment_id = 12;
  if (dependency === 'lotCapacity') f.state.lots[0].remaining_lessons = '4.00000000';
  const before = structuredClone(f.state);
  await assert.rejects(mark(f, false), { code: 'ATTENDANCE_FINANCIAL_HISTORY' }); assert.deepEqual(f.state, before);
  if (dependency === 'projectTransfers') {
    const absent = fixture(); absent.state.dependencies.projectTransfers = structuredClone(f.state.dependencies.projectTransfers);
    const beforeAdd = structuredClone(absent.state);
    await assert.rejects(mark(absent, true), { code: 'ATTENDANCE_FINANCIAL_HISTORY' }); assert.deepEqual(absent.state, beforeAdd);
  }
});

test('safe attendance reversal preserves unrelated payments, refunds and transfers and restores exact FIFO and salary', async () => {
  for (const viaDelete of [false, true]) {
    const f = fixture(); await mark(f, true);
    // Later payment, partial refund of the original lot, and incoming transfer.
    f.state.payments.push({ id: 78, enrollment_id: 11, amount: '2000.00', price_snapshot: '1000.00' });
    f.state.dependencies.refunds = [{ id: 80, enrollment_id: 11, payment_id: 77, lessons_debit: '1.00000000' }];
    f.state.dependencies.transfers = [{ id: 81, source_enrollment_id: 90, target_enrollment_id: 11 }];
    f.state.dependencies.projectTransfers = [{ id: 82, source_enrollment_id: 90, target_enrollment_id: 11 }];
    f.state.lots[0].remaining_lessons = '2.00000000';
    f.state.lots.push({ id: 42, enrollment_id: 11, original_lessons: '2.00000000', remaining_lessons: '2.00000000', unit_price: '1000.00' },
      { id: 43, enrollment_id: 11, original_lessons: '1.00000000', remaining_lessons: '1.00000000', unit_price: '1100.00' });
    f.state.enrollments[0].balance_lessons = '5.00000000';
    const history = structuredClone({ dependencies: f.state.dependencies, payments: f.state.payments,
      memberships: f.state.memberships, otherLesson: f.state.otherLesson, otherEnrollment: f.state.enrollments[1] });
    if (viaDelete) await f.service.removeAttendance(10, 7, director); else await mark(f, false);
    assert.equal(balance(f), '6.00000000'); assert.equal(salary(f), 0);
    assert.deepEqual(f.state.lots.map((l) => l.remaining_lessons), ['3.00000000', '3.00000000', '2.00000000', '1.00000000']);
    assert.equal(f.state.entries.length, 2); assert.equal(f.state.entries[1].reversal_of_entry_id, f.state.entries[0].id);
    assert.equal(f.state.entries[1].amount_delta, '900.00');
    assert.equal(f.state.attendances[0].present, false); assert.equal(f.state.attendances[0].marked_at, null);
    assert.equal(f.state.roster[0].roster_type, 'main');
    const cleared = structuredClone(f.state);
    await f.service.removeAttendance(10, 7, director); assert.deepEqual(f.state, cleared);
    await mark(f, true); await mark(f, true);
    assert.equal(balance(f), '5.00000000'); assert.equal(salary(f), 700);
    assert.equal(f.state.entries.length, 3); assert.equal(f.state.entries[2].amount_delta, '-900.00');
    assert.equal(f.state.lots[0].remaining_lessons, '2.00000000'); assert.equal(f.state.consumptions.length, 2);
    await mark(f, false); assert.equal(balance(f), '6.00000000'); assert.equal(salary(f), 0);
    assert.equal(f.state.entries.length, 4); assert.equal(f.state.lots[0].remaining_lessons, '3.00000000');
    assert.deepEqual({ dependencies: f.state.dependencies, payments: f.state.payments,
      memberships: f.state.memberships, otherLesson: f.state.otherLesson, otherEnrollment: f.state.enrollments[1] }, history);
    await mark(f, false, true); assert.equal(balance(f), '6.00000000'); assert.equal(f.state.entries.length, 4);
  }
  const linked = fixture();
  linked.state.entries.push({ id: 90, enrollment_id: 11, entry_type: 'transfer_in', occurred_at: '2026-09-01 12:00:00' });
  linked.state.lots[0].source_balance_entry_id = 90;
  await mark(linked, true);
  // An outgoing operation from the very transfer-in lot used by this debit
  // depends on its FIFO attribution; unlike unrelated history it cannot move.
  linked.state.entries.push({ id: 200, enrollment_id: 11, entry_type: 'transfer_out', occurred_at: '2026-09-11 12:00:00' });
  linked.state.consumptions.push({ balance_lot_id: 40, balance_entry_id: 200, lessons: '1.00000000', amount: '900.00' });
  linked.state.lots[0].remaining_lessons = '2.00000000'; linked.state.enrollments[0].balance_lessons = '2.00000000';
  const before = structuredClone(linked.state);
  await assert.rejects(mark(linked, false), { code: 'ATTENDANCE_FINANCIAL_HISTORY' }); assert.deepEqual(linked.state, before);
});

test('extra without attendance is removed from this lesson only, with no phantom visit or repeated financial effects', async () => {
  for (const status of ['completed', 'in_progress']) {
    const f = fixture({ type: 'extra', missing: true, status });
    if (status === 'completed') {
      await mark(f, true); await mark(f, false);
      assert.equal(f.state.roster.length, 1); assert.equal(balance(f), '4.00000000'); assert.equal(salary(f), 0);
      f.state.attendances = []; // Legacy physical deletion left only the frozen extra roster.
    }
    f.state.roster.push({ lesson_id: 10, child_id: 8, roster_type: 'main' });
    f.state.candidates = []; // Removal must not resolve or recreate an enrollment/attendance.
    const before = structuredClone(f.state);
    const removed = await f.service.removeExtra(10, 7, director);
    assert.deepEqual(f.state, { ...before, roster: [before.roster[1]] });
    assert.equal(removed.roster.some((r) => r.childId === '7'), false); assert.equal(removed.attendances.length, 0);
    const after = structuredClone(f.state);
    await f.service.removeExtra(10, 7, director); assert.deepEqual(f.state, after);
    await f.service.removeExtra(10, 8, director); assert.deepEqual(f.state, after);
    await assert.rejects(f.service.removeExtra(10, 7, { roles: ['partner'], userId: '4', projectIds: ['2'] }), { status: 403 });
    assert.deepEqual(f.state, after);
  }
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

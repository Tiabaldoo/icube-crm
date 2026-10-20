import test from 'node:test';
import assert from 'node:assert/strict';
import { correctionFixture } from './helpers/attendance-correction-fixture.mjs';
import { createApiRouter } from '../backend/src/routes.mjs';

const activeDebits = (f) => f.db.prepare("SELECT be.* FROM balance_entries be WHERE be.entry_type='attendance' AND NOT EXISTS(SELECT 1 FROM balance_entries r WHERE r.reversal_of_entry_id=be.id)").all();
const present = (f) => f.rows('attendances').filter((a) => a.present);
const salary = (f) => f.rows('salary_accruals').filter((a) => !a.reversed_at);

test('direction corrections in both directions restore balances, retain audits and never double debit', async (t) => {
  const f = correctionFixture(t); f.seedVisit();
  const request = f.body(); await f.correct(request);
  assert.equal(f.balance(7), 0); assert.equal(f.balance(8), -1);
  assert.equal(present(f)[0].enrollment_id, 8); assert.equal(activeDebits(f).length, 1);
  assert.equal(activeDebits(f)[0].amount_delta, '-1500.00');
  const after = f.snapshot(); await f.correct(request); assert.equal(f.snapshot(), after);
  await f.correct(f.body({ enrollment: 7 }), { idempotencyKey: 'back' });
  assert.equal(f.balance(7), -1); assert.equal(f.balance(8), 0);
  assert.equal(activeDebits(f).length, 1); assert.equal(activeDebits(f)[0].amount_delta, '-1125.00');
  assert.equal(f.rows('audit_log').filter((a) => a.action === 'attendance.correct').length, 2);
});

for (const individual of [false, true]) test(`historical ${individual ? 'individual' : 'direction'} price wins over current price; late enrollment is permitted`, async (t) => {
  const f = correctionFixture(t); f.seedVisit();
  f.db.exec("UPDATE child_enrollments SET started_on='2026-10-19',created_at='2026-10-19' WHERE id=8; UPDATE price_versions SET valid_to='2026-10-18' WHERE id=2; INSERT INTO price_versions VALUES(4,'direction',NULL,NULL,2,NULL,'3000.00','2026-10-18',NULL)");
  if (individual) f.db.exec("INSERT INTO price_versions VALUES(5,'enrollment',8,NULL,NULL,NULL,'975.00','2026-09-01','2026-10-18'),(6,'enrollment',8,NULL,NULL,NULL,'2500.00','2026-10-18',NULL)");
  await f.correct();
  assert.equal(present(f)[0].price_snapshot, individual ? '975.00' : '1500.00');
  assert.equal(activeDebits(f)[0].amount_delta, individual ? '-975.00' : '-1500.00');
});

test('missing unversioned historical individual price refuses before financial changes', async (t) => {
  const f = correctionFixture(t); f.seedVisit(); f.db.exec("UPDATE child_enrollments SET individual_price='800.00' WHERE id=8");
  const before = f.snapshot(); await assert.rejects(f.correct(), { code: 'PRICE_HISTORY_UNAVAILABLE' }); assert.equal(f.snapshot(), before);
});

test('later individual price versions do not leak into an earlier visit; existing direction fallback applies', async (t) => {
  const f=correctionFixture(t);f.seedVisit();
  f.db.exec("UPDATE child_enrollments SET individual_price='900.00',created_at='2026-10-19',started_on='2026-10-19' WHERE id=8; INSERT INTO price_versions VALUES(5,'enrollment',8,NULL,NULL,NULL,'900.00','2026-10-19',NULL)");
  await f.correct();assert.equal(present(f)[0].price_snapshot,'1500.00');assert.equal(activeDebits(f)[0].amount_delta,'-1500.00');
});

for(const status of ['scheduled','cancelled']) test(`a ${status} target rejects atomically instead of changing lesson status`,async(t)=>{
  const f=correctionFixture(t);f.seedVisit();f.db.prepare('UPDATE lessons SET status=? WHERE id=11').run(status);
  const before=f.snapshot();await assert.rejects(f.correct(f.body({target:11})),{code:'LESSON_NOT_STARTED'});assert.equal(f.snapshot(),before);
});

test('no-op creates no financial or salary movement, and stale forms/key reuse are rejected', async (t) => {
  const f = correctionFixture(t); f.seedVisit(); const old = f.body();
  const ledger = JSON.stringify(f.rows('balance_entries'));
  const result = await f.correct(f.body({ enrollment: 7 })); assert.equal(result.unchanged, true);
  assert.equal(JSON.stringify(f.rows('balance_entries')), ledger); assert.equal(salary(f).length, 0);
  await assert.rejects(f.correct(old), { code: 'IDEMPOTENCY_CONFLICT' });
  await f.correct(old, { idempotencyKey: 'change' });
  const state = f.snapshot(); await assert.rejects(f.correct(old, { idempotencyKey: 'stale' }), { code: 'ATTENDANCE_STALE' }); assert.equal(f.snapshot(), state);
});

test('completed different-group move changes child history, both salaries, and preserves frozen main roster', async (t) => {
  const f = correctionFixture(t); f.seedVisit(); const body = f.body({ target: 11 });
  f.db.exec("INSERT INTO salary_accruals(lesson_id,teacher_id,rate_version_id,accrual_type,present_children,fixed_amount,children_amount,total_amount) VALUES(10,5,1,'regular',1,'600.00','100.00','700.00')");
  await f.correct(body);
  assert.equal(present(f).length, 1); assert.equal(present(f)[0].lesson_id, 11); assert.equal(present(f)[0].attendance_type, 'extra');
  assert.equal(f.db.prepare('SELECT count(*) n FROM lesson_roster_members').get().n, 2);
  assert.equal(f.db.prepare('SELECT roster_type FROM lesson_roster_members WHERE lesson_id=10').get().roster_type, 'main');
  assert.equal(f.balance(7), 0); assert.equal(f.balance(8), -1);
  assert.deepEqual(salary(f).map((s) => [s.lesson_id, s.teacher_id, s.total_amount]), [[11,6,'700.00']]);
  assert.ok(f.rows('salary_accruals')[0].reversed_at);
  const source = await f.lessons.get(10, f.context); const target = await f.lessons.get(11, f.context);
  assert.equal(source.attendances[0].present, false); assert.equal(target.attendances[0].present, true);
  assert.equal(target.attendances[0].enrollmentId, '8'); assert.equal(target.status, 'completed');
  const after = f.snapshot(); await f.correct(body); assert.equal(f.snapshot(), after);
});

test('concurrent retries serialize and independent stale requests cannot add duplicate financial effects', async (t) => {
  const f = correctionFixture(t); f.seedVisit(); const request = f.body({ target: 11 });
  const [one, two] = await Promise.all([f.correct(request), f.correct(request)]); assert.deepEqual(one,two);
  assert.equal(activeDebits(f).length,1); assert.equal(present(f).length,1);
  assert.equal(f.db.prepare('SELECT count(*) n FROM lesson_roster_members WHERE lesson_id=11 AND child_id=8').get().n,1);
  const body = f.body({ source: 11, enrollment: 7 });
  const results = await Promise.allSettled([f.correct(body,{idempotencyKey:'parallel-one'},11),f.correct(body,{idempotencyKey:'parallel-two'},11)]);
  assert.equal(results.filter((r)=>r.status==='fulfilled').length,1);assert.equal(results.find((r)=>r.status==='rejected').reason.code,'ATTENDANCE_STALE');
  assert.equal(activeDebits(f).length,1);assert.equal(f.balance(7),-1);assert.equal(f.balance(8),0);
  assert.deepEqual(f.correctionCalls.filter((c)=>c.sql==='SELECT * FROM lessons WHERE id=:id FOR UPDATE').slice(0,2).map((c)=>String(c.params.id)),['10','11']);
});

test('a rescheduled destination and a source removed since opening the form reject without changes', async (t) => {
  const f = correctionFixture(t); f.seedVisit(); const request=f.body({target:11});
  f.db.exec('UPDATE lessons SET lock_version=lock_version+1 WHERE id=11');const before=f.snapshot();
  await assert.rejects(f.correct(request),{code:'ATTENDANCE_STALE'});assert.equal(f.snapshot(),before);
  const fresh=f.body({target:11});f.db.exec('UPDATE attendances SET present=0,marked_at=NULL WHERE lesson_id=10');const removed=f.snapshot();
  await assert.rejects(f.correct(fresh),{code:'ATTENDANCE_NOT_FOUND'});assert.equal(f.snapshot(),removed);
});

test('target existing children retain their attendance and salary version is recalculated for the new count', async (t) => {
  const f=correctionFixture(t);f.seedVisit();
  f.db.exec("INSERT INTO attendances(lesson_id,child_id,enrollment_id,attendance_type,present,is_trial,charged_lessons,marked_at) VALUES(11,9,8,'main',1,1,0,'2026-10-09 15:00:00'); INSERT INTO lesson_roster_members(lesson_id,child_id,roster_type) VALUES(11,9,'main'); INSERT INTO salary_accruals(lesson_id,teacher_id,rate_version_id,accrual_type,present_children,fixed_amount,children_amount,total_amount) VALUES(11,6,1,'regular',1,'600.00','100.00','700.00')");
  const other=JSON.stringify(f.db.prepare('SELECT * FROM attendances WHERE child_id=9').get());
  await f.correct(f.body({target:11}));assert.equal(salary(f)[0].total_amount,'800.00');assert.equal(salary(f)[0].teacher_id,6);
  assert.equal(JSON.stringify(f.db.prepare('SELECT * FROM attendances WHERE child_id=9').get()),other);assert.ok(f.rows('salary_accruals')[0].reversed_at);
});

test('individual trial presence and introductory group salary keep the existing rules', async (t) => {
  const f=correctionFixture(t);f.seedVisit({trial:true});
  f.db.exec('UPDATE lessons SET is_intro_group=1 WHERE id=10');
  await f.correct(f.body({enrollment:8,trial:true}));
  assert.equal(activeDebits(f).length,0);assert.equal(f.balance(7),0);assert.equal(f.balance(8),0);
  assert.equal(salary(f)[0].accrual_type,'intro');assert.equal(salary(f)[0].total_amount,'600.00');assert.equal(present(f)[0].is_trial,1);
});

test('moving an extra removes only the source extra; same enrollment is reversed then charged once', async (t) => {
  const f = correctionFixture(t); f.seedVisit({ type: 'extra' });
  f.db.exec('UPDATE lessons SET is_mixed_snapshot=1 WHERE id=11');
  await f.correct(f.body({ target: 11, enrollment: 7 }));
  assert.equal(f.balance(), -1); assert.equal(activeDebits(f).length, 1);
  assert.equal(f.db.prepare('SELECT count(*) n FROM lesson_roster_members WHERE lesson_id=10').get().n, 0);
  assert.equal(present(f)[0].enrollment_id, 7);
});

test('move to in-progress lesson uses existing deferred debit rule and completed empty-trip salary remains', async (t) => {
  const f = correctionFixture(t); f.seedVisit();
  f.db.exec("UPDATE lessons SET status='in_progress' WHERE id=11; UPDATE lessons SET is_empty_trip=1 WHERE id=10");
  await f.correct(f.body({ target: 11 }));
  assert.equal(activeDebits(f).length, 0); assert.equal(f.balance(7), 0); assert.equal(f.balance(8), 0);
  assert.deepEqual(salary(f).map((s) => [s.lesson_id,s.total_amount]), [[10,'300.00']]);
});

for (const duplicate of ['roster','attendance']) test(`target ${duplicate} duplicate rejects without changing either lesson`, async (t) => {
  const f = correctionFixture(t); f.seedVisit();
  if (duplicate === 'roster') f.db.exec("INSERT INTO lesson_roster_members(lesson_id,child_id,roster_type) VALUES(11,8,'extra')");
  else f.db.exec("INSERT INTO attendances(lesson_id,child_id,enrollment_id,attendance_type,present,is_trial,charged_lessons) VALUES(11,8,8,'extra',1,1,0)");
  const before = f.snapshot(); await assert.rejects(f.correct(f.body({ target: 11 })), { code: 'CHILD_ALREADY_IN_LESSON' }); assert.equal(f.snapshot(), before);
});

for (const prefix of ['INSERT INTO balance_entries','INSERT INTO salary_accruals','INSERT INTO audit_log']) test(`transaction rolls back balances, FIFO, roster, salary and audit when ${prefix} fails`, async (t) => {
  const f = correctionFixture(t); f.seedVisit(); const before = f.snapshot(); f.failCorrectionAt(prefix);
  await assert.rejects(f.correct(f.body({ target: 11 })), /injected correction failure/); assert.equal(f.snapshot(), before);
  assert.equal(f.db.prepare('SELECT count(*) n FROM lesson_roster_members').get().n, 1);
});

test('paid/trial toggles and direction plus trial reuse existing financial and share salary rules', async (t) => {
  const f = correctionFixture(t, { mode: 'attendance_share' }); f.seedVisit();
  await f.correct(f.body({ enrollment: 8, trial: true }));
  assert.equal(f.balance(7), 0); assert.equal(f.balance(8), 0); assert.equal(activeDebits(f).length, 0);
  assert.equal(present(f)[0].is_trial, 1); assert.equal(salary(f)[0].total_amount, '0.00');
  await f.correct(f.body({ enrollment: 8 }), { idempotencyKey: 'paid' });
  assert.equal(f.balance(8), -1); assert.equal(activeDebits(f).length, 1); assert.equal(present(f)[0].is_trial, 0);
  assert.equal(salary(f)[0].total_amount, '750.00');
});

test('FIFO restores the original paid lot and charges the destination lot at its actual funding price', async (t) => {
  const f = correctionFixture(t); await f.pay(); await f.pay('6000.00', { enrollmentId: 8 });
  // Seed the original visit with its real paid lot instead of an uncovered debit.
  const lot = f.db.prepare('SELECT id FROM balance_lots WHERE enrollment_id=7').get(); f.seedVisit();
  const debit = activeDebits(f)[0];
  f.db.prepare("INSERT INTO balance_lot_consumptions(balance_lot_id,balance_entry_id,lessons,amount) VALUES(?,?,'1.00000000','1125.00')").run(lot.id, debit.id);
  f.db.prepare('UPDATE balance_lots SET remaining_lessons=remaining_lessons-1 WHERE id=?').run(lot.id);
  await f.correct();
  assert.equal(f.balance(7), 4); assert.equal(f.balance(8), 3);
  assert.equal(Number(f.db.prepare('SELECT remaining_lessons FROM balance_lots WHERE enrollment_id=7').get().remaining_lessons), 4);
  assert.equal(Number(f.db.prepare('SELECT remaining_lessons FROM balance_lots WHERE enrollment_id=8').get().remaining_lessons), 3);
  assert.equal(activeDebits(f)[0].amount_delta, '-1500.00');
});

test('settled periods and genuinely unsafe paid-debt reversal remain protected, including trial changes', async (t) => {
  const f = correctionFixture(t); f.seedVisit(); f.db.exec("INSERT INTO partner_settlements VALUES(1,2,'2026-10-01','2026-10-31')");
  const before = f.snapshot(); await assert.rejects(f.correct(f.body({ trial: true })), { code: 'ATTENDANCE_FINANCIAL_HISTORY' }); assert.equal(f.snapshot(), before);
  f.db.exec('DELETE FROM partner_settlements; UPDATE child_enrollments SET balance_lessons=0 WHERE id=7');
  const funded = f.snapshot(); await assert.rejects(f.correct(), { code: 'ATTENDANCE_FINANCIAL_HISTORY' }); assert.equal(f.snapshot(), funded);
});

for (const role of ['teacher','parent']) test(`${role} cannot correct attendance even through a direct service call`, async (t) => {
  const f = correctionFixture(t); f.seedVisit(); const before = f.snapshot();
  await assert.rejects(f.correct(f.body(), { roles: [role] }), { code: 'FORBIDDEN' }); assert.equal(f.snapshot(), before);
});

test('partner edits own project but cannot choose foreign source, destination, or enrollment', async (t) => {
  const f = correctionFixture(t); f.seedVisit(); const partner = { roles: ['partner'], projectIds: ['2'] };
  f.db.exec('UPDATE lessons SET project_id_snapshot=3 WHERE id=11'); const before = f.snapshot();
  await assert.rejects(f.correct(f.body({ target: 11 }), partner), { code: 'FORBIDDEN' }); assert.equal(f.snapshot(), before);
  await assert.rejects(f.correct(f.body(), { ...partner, projectIds: ['3'] }), { code: 'FORBIDDEN' });
  f.db.exec('UPDATE child_enrollments SET project_id=3 WHERE id=8');
  await assert.rejects(f.correct(f.body(), partner), { code: 'ENROLLMENT_NOT_FOUND' });
  f.db.exec('UPDATE child_enrollments SET project_id=2 WHERE id=8; UPDATE child_enrollments SET project_id=3 WHERE id=7');
  await assert.rejects(f.correct(f.body(),partner),{code:'ENROLLMENT_NOT_FOUND'});
  f.db.exec('UPDATE child_enrollments SET project_id=2 WHERE id=7'); await f.correct(f.body(), partner);
  assert.equal(present(f)[0].enrollment_id, 8);
});

test('chooser reads only existing available lessons with project/duplicate filters; never materializes', async (t) => {
  const f = correctionFixture(t); f.seedVisit();
  const list = await f.lessons.correctionLessons('8', { from: '2026-10-01', to: '2026-10-31' }, f.context);
  assert.deepEqual(list.map((l) => l.id), ['11']); assert.equal(f.rows('lessons').length, 2);
  await assert.rejects(f.lessons.correctionLessons('8', { from: '2026-10-01', to: '2026-10-31' }, { roles: ['teacher'] }), { code: 'FORBIDDEN' });
  f.db.exec('UPDATE lessons SET project_id_snapshot=3 WHERE id=11');
  assert.deepEqual(await f.lessons.correctionLessons('8', { from: '2026-10-01', to: '2026-10-31' }, { roles: ['partner'], projectIds: ['2'] }), []);
});

for (const endedOn of [null,'2026-10-19']) test(`two corrected mistaken visits allow manual empty direction cleanup with ${endedOn ? 'closed' : 'open'} technical membership and preserve audits`, async (t) => {
  const f = correctionFixture(t); f.seedVisit();
  f.db.exec("INSERT INTO attendances(lesson_id,child_id,enrollment_id,attendance_type,present,is_trial,charged_lessons,marked_at) VALUES(11,8,7,'main',1,1,0,'2026-10-09 15:00:00'); INSERT INTO lesson_roster_members(lesson_id,child_id,roster_type) VALUES(11,8,'main')");
  await f.pay('6000.00', { enrollmentId: 8 });
  await f.correct(); await f.correct(f.body({ source: 11, enrollment: 8, trial: true }), { idempotencyKey: 'second' }, 11);
  f.db.prepare('UPDATE group_memberships SET ended_on=? WHERE enrollment_id=7').run(endedOn);
  assert.equal(f.balance(7), 0); assert.equal(f.balance(8), 3);
  await f.deletions.deleteEnrollment('7', f.context);
  assert.equal(f.db.prepare('SELECT id FROM child_enrollments WHERE id=7').get(), undefined);
  assert.equal(f.rows('audit_log').filter((a) => a.action === 'attendance.correct').length, 2);
  assert.equal(f.rows('audit_log').filter((a) => a.action === 'enrollment.delete-empty').length, 1);
  const archived=JSON.parse(f.rows('audit_log').find((a)=>a.action==='enrollment.delete-empty').before_data);
  assert.equal(archived.memberships[0].started_on,'2026-09-01');assert.equal(archived.ledger.length,2);
  assert.equal(archived.memberships[0].ended_on,endedOn);
  assert.equal(archived.ledger[0].entry_type,'attendance');assert.equal(archived.ledger[1].entry_type,'reversal');
  assert.equal(present(f).length, 2); assert.ok(present(f).every((a) => a.enrollment_id === 8));
});

for (const dependency of ['payment','visit']) test(`real ${dependency} still prevents mistaken direction deletion`, async (t) => {
  const f = correctionFixture(t); f.seedVisit(); await f.correct();
  if (dependency === 'payment') await f.pay();
  else f.db.exec("INSERT INTO attendances(lesson_id,child_id,enrollment_id,present,is_trial,marked_at) VALUES(11,8,7,1,1,'2026-10-09 15:00:00')");
  const before = f.snapshot(); await assert.rejects(f.deletions.deleteEnrollment('7', f.context), { code: 'ENROLLMENT_HAS_HISTORY' }); assert.equal(f.snapshot(), before);
});

test('API router rejects teachers/parents, missing keys and foreign partner targets; director/own partner succeed', async (t) => {
  const f = correctionFixture(t); f.seedVisit();
  const router = createApiRouter(f.pool, { lessons: f.lessons, testAuth(req, _res, next) {
    req.auth = { userId: '1', roles: [req.get('X-Test-Role') ?? 'director'], projectIds: ['2'] }; next();
  } });
  // Exercise the actual Express route/permission stack without opening a network listener.
  const request = (role, body = f.body(), key = 'http-one', url = '/lessons/10/attendance/8/correct', method = 'POST') => new Promise((resolve, reject) => {
    const headers = { 'x-test-role': role, 'idempotency-key': key };
    const req = { method, url, body, query: { from: '2026-10-01', to: '2026-10-31' }, get(name) { return headers[name.toLowerCase()]; } };
    const res = { statusCode: 200, status(value) { this.statusCode = value; return this; }, json(payload) { resolve({ status: this.statusCode, payload }); return this; } };
    router.handle(req, res, (error) => error ? resolve({ status: error.status ?? 500, error }) : reject(new Error('Route not matched')));
  });
  const initial = f.snapshot();
  for (const role of ['teacher','parent']) {
    assert.equal((await request(role)).status, 403);
    assert.equal((await request(role, null, '', '/children/8/attendance-correction-lessons', 'GET')).status, 403);
  }
  assert.equal((await request('director', f.body(), '')).status, 400); assert.equal(f.snapshot(), initial);
  f.db.exec('UPDATE lessons SET project_id_snapshot=3 WHERE id=11');
  assert.equal((await request('partner', f.body({ target: 11 }))).status, 403);
  assert.equal((await request('director')).status, 200);
  assert.equal((await request('partner', f.body({ enrollment: 7 }), 'partner-back')).status, 200);
  assert.equal(f.balance(7), -1); assert.equal(f.balance(8), 0); assert.equal(activeDebits(f).length, 1);
});

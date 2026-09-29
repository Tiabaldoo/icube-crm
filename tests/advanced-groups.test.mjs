import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { attendanceShares, packageUnitPrice, validateGroupSettings, assertGroupCapacity } from '../backend/src/group-settings.mjs';
import { createMysqlCatalog } from '../backend/src/catalog.mjs';
import { createMysqlLessons } from '../backend/src/lessons.mjs';
import { createMysqlPayments } from '../backend/src/payments.mjs';
import { createPartnerSettlements } from '../backend/src/partner-settlements.mjs';
import { moneyCents, moneyDecimal, lessonUnits, lessonDecimal, occurrenceDates } from '../backend/src/lesson-rules.mjs';
import { advancedGroupFields, installAdvancedGroupUi } from '../src/frontend/advanced-groups.mjs';
import { splitSqlStatements } from '../database/migration-runner.mjs';

const settings = { teacherSharePercent: '33.3333', partnerSharePercent: '33.3333', customTaxEnabled: false };
function poolFor(query) {
  let commits = 0; let rollbacks = 0;
  const connection = { query, beginTransaction: async () => {}, commit: async () => { commits++; }, rollback: async () => { rollbacks++; }, release() {} };
  return { query, getConnection: async () => connection, get commits() { return commits; }, get rollbacks() { return rollbacks; } };
}
function lessonRow(extra = {}) {
  return { id: 60, group_id: 10, group_name: 'Индивидуальная', project_id_snapshot: 3, project_name: 'Зебра', direction_id_snapshot: 1,
    direction_name: 'Робототехника', is_mixed_snapshot: 0, site_id_snapshot: 2, site_name: 'Площадка', site_override_id: null,
    planned_teacher_id: 4, actual_teacher_id: 4, planned_teacher_name: 'Учитель', actual_teacher_name: 'Учитель',
    scheduled_starts_at: '2026-09-15 16:00:00', scheduled_ends_at: '2026-09-15 17:30:00', starts_at: '2026-09-15 16:00:00', ends_at: '2026-09-15 17:30:00',
    status: 'in_progress', topic: null, is_intro_group: 0, is_empty_trip: 0, roster_frozen_at: '2026-09-15 16:00:00',
    attendance_applied_at: null, completed_at: null, cancelled_at: null, actual_starts_at: null, actual_ends_at: null, deleted_at: null, lock_version: 1,
    calculation_mode_snapshot: 'attendance_share', teacher_share_percent_snapshot: '33.3333', partner_share_percent_snapshot: '33.3333', custom_tax_enabled_snapshot: 0, tax_percent_snapshot: '4.000', ...extra };
}

test('ordinary settings retain one slot, package of four and standard mode', () => {
  const result = validateGroupSettings({}, {}, { weekday: 2, startTime: '16:00', endTime: '17:30' });
  assert.equal(result.packageLessonCount, 4); assert.equal(result.calculationMode, 'standard'); assert.equal(result.isIndividual, false);
  assert.deepEqual(result.scheduleSlots, []);
});
test('group validation rejects mixed individual, invalid shares, overlapping slots and non-integer package', () => {
  const primary = { weekday: 2, startTime: '16:00', endTime: '17:30' };
  for (const body of [{ isIndividual: true, calculationMode: 'attendance_share', teacherSharePercent: '60', partnerSharePercent: '50' },
    { teacherSharePercent: '-1' }, { packageLessonCount: 0 }, { packageLessonCount: 1.5 }, { calculationMode: 'attendance_share' },
    { scheduleSlots: [{ weekday: 2, startTime: '17:00', endTime: '18:00' }] }]) assert.throws(() => validateGroupSettings(body, {}, primary));
  assert.throws(() => validateGroupSettings({ isIndividual: true }, {}, { ...primary, isMixed: true }), { code: 'INDIVIDUAL_MIXED_NOT_ALLOWED' });
});
test('6600 / 8 = 825; money rounding stays in cents', () => {
  assert.equal(packageUnitPrice('6600.00', 8), '825.00'); assert.equal(packageUnitPrice('4100.00'), '1025.00');
  assert.equal(packageUnitPrice('100.01', 3), '33.34');
});
test('one paid attendance earns 275/275/275; six earn 1650 each, unused balance earns nothing', () => {
  const earned = attendanceShares('825.00', '1.00000000', settings);
  assert.deepEqual(earned, { gross: '825.00', teacher: '275.00', partner: '275.00', tax: '0.00', icube: '275.00' });
  for (const field of ['teacher','partner','icube']) assert.equal(moneyDecimal(moneyCents(earned[field]) * 6n), '1650.00');
});
test('tax ON uses existing 4% and reduces only iCube; remainder absorbs rounded cents', () => {
  const result = attendanceShares('825.00', '1.00000000', { ...settings, customTaxEnabled: true, taxPercent: '4.000' });
  assert.deepEqual(result, { gross: '825.00', teacher: '275.00', partner: '275.00', tax: '33.00', icube: '242.00' });
  const small = attendanceShares('0.05', '1.00000000', settings);
  assert.equal(moneyCents(small.teacher) + moneyCents(small.partner) + moneyCents(small.icube), 5n);
  assert.throws(() => attendanceShares('825.00', '1.00000000', { ...settings, customTaxEnabled: true }), { code: 'TAX_RATE_NOT_CONFIGURED' });
});
test('individual capacity locks group, rejects another open child, allows own and finished memberships', async () => {
  let occupied = true; const calls = [];
  const connection = { query: async (sql, params) => {
    calls.push(sql);
    if (sql.startsWith('SELECT id,is_individual')) return [[{ id: 10, is_individual: 1 }]];
    assert.match(sql, /gm\.ended_on IS NULL/); assert.match(sql, /FOR UPDATE/);
    return [occupied && params.childId !== '50' ? [{ child_id: 50 }] : []];
  } };
  await assert.rejects(assertGroupCapacity(connection, 10, { childId: '51' }), { code: 'INDIVIDUAL_GROUP_FULL' });
  assert.match(calls[0], /FOR UPDATE/);
  await assertGroupCapacity(connection, 10, { childId: '50' });
  occupied = false; await assertGroupCapacity(connection, 10, { childId: '51' });
});

function scheduleFixture() {
  const group = { id: 10, direction_id: 1, project_id: 3, site_id: 2, default_teacher_id: 4, weekday: 2, start_time: '16:00', end_time: '17:30',
    starts_on: '2099-01-01', ends_on: null, is_mixed: 0, schedule_slots: [{ weekday: 5, startTime: '16:00', endTime: '17:30' }] };
  const lessons = []; const calls = []; let nextId = 1;
  const query = async (sql, params = {}) => {
    calls.push({ sql, params });
    if (sql.startsWith('DELETE l FROM lessons')) {
      assert.match(sql, /group_schedule_slots/); assert.match(sql, /l\.roster_frozen_at IS NULL/); assert.match(sql, /l\.lock_version=1/);
      const slots = [{ weekday: group.weekday, startTime: group.start_time, endTime: group.end_time }, ...group.schedule_slots];
      for (let i = lessons.length - 1; i >= 0; i--) {
        const lesson = lessons[i];
        if (lesson.status === 'scheduled' && !lesson.roster_frozen_at && !slots.some((slot) => occurrenceDates({ ...group, weekday: slot.weekday }, lesson.starts_at.slice(0,10), lesson.starts_at.slice(0,10)).length && lesson.starts_at.slice(11,16) === slot.startTime)) lessons.splice(i,1);
      }
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('SELECT g.id,g.is_mixed') || sql.startsWith('SELECT id,is_mixed')) return [[structuredClone(group)]];
    if (sql.startsWith('INSERT IGNORE INTO lessons')) {
      const starts_at = `${params.date} ${params.start}:00`;
      if (!lessons.some((l) => l.scheduled_starts_at === starts_at)) lessons.push(lessonRow({ id: nextId++, scheduled_starts_at: starts_at, starts_at, status: 'scheduled', roster_frozen_at: null }));
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('SELECT l.id FROM lessons')) return [[...lessons.filter((l) => l.scheduled_starts_at === `${params.scheduledDate} ${params.start}:00`).map((l) => ({ id: l.id }))]];
    if (sql.includes('FROM lessons l JOIN study_groups')) return [[...lessons.filter((l) => !params.id || String(l.id) === String(params.id))]];
    if (sql.includes('lesson_roster_members WHERE lesson_id IN') || sql.includes('FROM attendances WHERE lesson_id IN') || sql.includes('FROM salary_accruals sa WHERE')) return [[]];
    throw new Error(sql);
  };
  return { group, lessons, calls, service: createMysqlLessons({ query }) };
}
test('two weekly slots materialize both series; changing/removing extra slot preserves completed and frozen history', async () => {
  const f = scheduleFixture();
  await f.service.materialize('2099-09-01','2099-09-30');
  assert.equal(f.lessons.length, 9); assert.ok(f.calls.filter((c) => c.sql.startsWith('INSERT IGNORE')).some((c) => c.params.start === '16:00'));
  const completed = f.lessons[0]; completed.status = 'completed'; completed.roster_frozen_at = completed.starts_at;
  const before = JSON.stringify(completed);
  f.group.schedule_slots[0] = { weekday: 4, startTime: '18:00', endTime: '19:30' };
  await f.service.materialize('2099-09-01','2099-09-30');
  assert.ok(f.lessons.some((l) => l.starts_at.includes('18:00')));
  assert.ok(f.lessons.filter((l) => l.status === 'scheduled').every((l) => (new Date(`${l.starts_at.slice(0,10)}T00:00:00Z`).getUTCDay() !== 5)));
  f.group.schedule_slots = []; await f.service.materialize('2099-09-01','2099-09-30');
  assert.ok(!f.lessons.some((l) => l.status === 'scheduled' && l.starts_at.includes('18:00')));
  assert.equal(JSON.stringify(completed), before);
});
test('manual historical lesson accepts either slot; same-day slots require exact startTime', async () => {
  const f = scheduleFixture();
  const tuesday = await f.service.create({ groupId: 10, scheduledDate: '2099-09-01' }, { roles: ['director'] });
  const friday = await f.service.create({ groupId: 10, scheduledDate: '2099-09-04' }, { roles: ['director'] });
  assert.notEqual(tuesday.id, friday.id);
  f.group.schedule_slots = [{ weekday: 2, startTime: '18:00', endTime: '19:30' }];
  await assert.rejects(f.service.create({ groupId: 10, scheduledDate: '2099-09-01' }, { roles: ['director'] }), { code: 'OCCURRENCE_OUTSIDE_SCHEDULE' });
  const evening = await f.service.create({ groupId: 10, scheduledDate: '2099-09-01', startTime: '18:00' }, { roles: ['director'] });
  assert.match(evening.startsAt, /18:00/);
});

test('real payment inserts 6600 at 825, credits eight into the existing balance and FIFO lot', async () => {
  let balance = '0.00000000'; let payment; let lot; const calls = [];
  const query = async (sql, params = {}) => {
    calls.push({ sql, params });
    if (sql.includes('FROM child_enrollments e')) return [[{ id: 100, child_id: 50, direction_id: 1, group_id: 10, project_id: 3, current_price: '825.00', balance_lessons: balance, calculation_mode: 'attendance_share' }]];
    if (sql.startsWith('INSERT INTO payments')) { payment = { id: 20, enrollment_id: 100, child_id: 50, child_name: 'Ребёнок', direction_id: 1, direction_name: 'Робототехника', group_id_snapshot: 10, project_id_snapshot: 3, paid_on: params.paidOn, amount: params.amount, price_snapshot: params.price, lessons_credit: params.lessons, method: params.method }; return [{ insertId: 20 }]; }
    if (sql.startsWith('INSERT INTO balance_entries')) return [{ insertId: 21 }];
    if (sql.startsWith('INSERT INTO balance_lots')) { lot = { ...params }; return [{ insertId: 22 }]; }
    if (sql.startsWith('UPDATE child_enrollments SET balance_lessons=')) { balance = lessonDecimal(lessonUnits(balance) + lessonUnits(params.lessons)); return [{ affectedRows: 1 }]; }
    if (sql.includes('FROM payments p JOIN children')) return [[payment]];
    throw new Error(sql);
  };
  const result = await createMysqlPayments(poolFor(query)).create({ enrollmentId: 100, paidOn: '2026-09-15', amount: '6600.00', method: 'cashless' }, { actorUserId: 1 });
  assert.equal(result.lessonsCredit, '8.00000000'); assert.equal(balance, '8.00000000'); assert.equal(lot.remainingLessons, '8.00000000');
  assert.equal(calls.find((c) => c.sql.startsWith('INSERT INTO payments')).params.calculationMode, 'attendance_share');
});

function completionFixture({ trial = false } = {}) {
  const lesson = lessonRow(); const attendance = { id: 200, child_id: 50, enrollment_id: 100, present: 1, is_trial: trial, price_snapshot: null, charged_lessons: '0.00000000' };
  let balance = '8.00000000'; let remaining = '8.00000000'; let salary; const calls = []; let notificationCount = 0;
  const query = async (sql, params = {}) => {
    calls.push({ sql, params });
    if (sql.startsWith('SELECT * FROM lessons WHERE')) return [[lesson]];
    if (sql.startsWith('SELECT * FROM attendances WHERE')) return [[attendance]];
    if (sql.includes('FROM child_enrollments e')) return [[{ id: 100, child_id: 50, direction_id: 1, current_price: '825.00', balance_lessons: balance }]];
    if (sql.startsWith('SELECT be.* FROM balance_entries')) return [[]];
    if (sql.startsWith('SELECT id,remaining_lessons,unit_price FROM balance_lots')) return [[{ id: 22, remaining_lessons: remaining, unit_price: '825.00' }]];
    if (sql.startsWith('INSERT INTO balance_entries')) return [{ insertId: 23 }];
    if (sql.startsWith('UPDATE balance_lots SET remaining_lessons=')) { remaining = lessonDecimal(lessonUnits(remaining) - lessonUnits(params.lessons)); return [{ affectedRows: 1 }]; }
    if (sql.startsWith('UPDATE child_enrollments SET balance_lessons=')) { balance = lessonDecimal(lessonUnits(balance) - lessonUnits('1.00000000')); return [{ affectedRows: 1 }]; }
    if (sql.startsWith('UPDATE attendances SET enrollment_id=')) { attendance.price_snapshot = params.price; attendance.charged_lessons = '1.00000000'; return [{ affectedRows: 1 }]; }
    if (sql.startsWith("UPDATE lessons SET status='completed'")) { lesson.status = 'completed'; return [{ affectedRows: 1 }]; }
    if (sql.startsWith('SELECT * FROM salary_accruals')) return [salary ? [salary] : []];
    if (sql.startsWith('SELECT COUNT(*) present_count')) return [[{ present_count: 1 }]];
    if (sql.startsWith('SELECT price_snapshot,charged_lessons FROM attendances')) return [trial ? [] : [attendance]];
    if (sql.startsWith('INSERT INTO salary_accruals')) { salary = { id: 30, teacher_id: params.teacherId, rate_version_id: params.rateId, accrual_type: params.type, present_children: params.present, total_amount: params.total }; return [{ insertId: 30 }]; }
    if (sql.includes('FROM lessons l JOIN study_groups')) return [[lesson]];
    if (sql.includes('lesson_roster_members WHERE lesson_id IN') || sql.includes('FROM attendances WHERE lesson_id IN') || sql.includes('FROM salary_accruals sa WHERE')) return [[]];
    if (sql.startsWith('INSERT INTO balance_lot_consumptions')) return [{ insertId: 24 }];
    throw new Error(sql);
  };
  return { calls, lesson, attendance, service: createMysqlLessons(poolFor(query), { parentNotifications: { async lessonFinished() { notificationCount++; } } }),
    get balance() { return balance; }, get remaining() { return remaining; }, get salary() { return salary; }, get notificationCount() { return notificationCount; } };
}
test('finish custom lesson debits one via existing FIFO, accrues 275 only, lost-answer retry has no side effects', async () => {
  const f = completionFixture(); await f.service.finish(60, {}, { roles: ['director'] });
  assert.equal(f.balance, '7.00000000'); assert.equal(f.remaining, '7.00000000'); assert.equal(f.attendance.price_snapshot, '825.00');
  assert.equal(f.salary.total_amount, '275.00'); assert.equal(f.salary.accrual_type, 'attendance_share'); assert.equal(f.salary.rate_version_id, null);
  assert.equal(f.calls.some((c) => c.sql.includes('FROM salary_rate_versions')), false);
  await f.service.finish(60, {}, { roles: ['director'] });
  assert.equal(f.balance, '7.00000000'); assert.equal(f.notificationCount, 1);
  assert.equal(f.calls.filter((c) => c.sql.startsWith('INSERT INTO salary_accruals')).length, 1);
});
test('trial completion earns zero custom salary and does not debit balance', async () => {
  const f = completionFixture({ trial: true }); await f.service.finish(60, {}, { roles: ['director'] });
  assert.equal(f.balance, '8.00000000'); assert.equal(f.salary.total_amount, '0.00');
});

function settlementFixture({ visits = 1, cash = '0.00', refund = '0.00', tax = false, ordinary = false } = {}) {
  const calls = [];
  const query = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('FROM projects p LEFT JOIN partners')) return [[{ id: 3, name: 'Зебра', partner_id: 9, partner_name: 'Партнёр' }]];
    if (sql.includes('FROM partner_agreement_versions')) return [[{ id: 1, tax_percent: '4.000', icube_percent: '40.000', partner_percent: '60.000' }]];
    if (sql.includes(') custom_cash')) return [[{ custom_cash: moneyDecimal(moneyCents(cash) - moneyCents(refund)), custom_payments: '6600.00', custom_refunds: refund }]];
    if (sql.includes('FROM attendances a JOIN lessons l')) return [Array.from({ length: visits }, () => ({ ...lessonRow(), group_name: 'Индивидуальная', custom_tax_enabled_snapshot: tax ? 1 : 0, price_snapshot: '825.00', charged_lessons: '1.00000000' }))];
    if (sql.includes('FROM payments WHERE')) { assert.match(sql, /calculation_mode_snapshot='standard'/); return [[{ payments_amount: ordinary ? '10000.00' : '0.00', cash_held_by_partner: ordinary ? '3000.00' : '0.00' }]]; }
    if (sql.includes('FROM refunds')) { assert.match(sql, /p.calculation_mode_snapshot='standard'/); return [[{ refunds_amount: ordinary ? '1000.00' : '0.00' }]]; }
    if (sql.includes('FROM salary_accruals')) { assert.match(sql, /l.calculation_mode_snapshot='standard'/); return [[{ salary_amount: ordinary ? '2000.00' : '0.00' }]]; }
    throw new Error(sql);
  };
  return { calls, preview: () => createPartnerSettlements({ query }).preview({ projectId: 3, from: '2026-09-01', to: '2026-09-30' }) };
}
test('partner entitlement uses six visits, not 6600 payment or ordinary 60/40; tax OFF', async () => {
  const f = settlementFixture({ visits: 6 }); const result = await f.preview();
  assert.equal(result.paymentsAmount, '6600.00'); assert.equal(result.incomeAmount, '4950.00'); assert.equal(result.salaryAmount, '1650.00');
  assert.equal(result.partnerShareAmount, '1650.00'); assert.equal(result.icubeShareAmount, '1650.00'); assert.equal(result.taxAmount, '0.00');
  assert.equal(result.transferAmount, '1650.00'); assert.equal(result.customGroups[0].visits, 6);
  const sql = f.calls.find((c) => c.sql.includes('FROM attendances a JOIN lessons')).sql;
  assert.match(sql, /a.present=TRUE AND a.is_trial=FALSE/); assert.match(sql, /l.deleted_at IS NULL/); assert.match(sql, /l.status='completed'/);
});
test('absence/no visits accrues no shares; cash receipts/refunds only change money holder', async () => {
  const absent = await settlementFixture({ visits: 0 }).preview(); assert.equal(absent.salaryAmount, '0.00'); assert.equal(absent.partnerShareAmount, '0.00');
  const cash = await settlementFixture({ visits: 6, cash: '6600.00', refund: '825.00' }).preview();
  assert.equal(cash.partnerShareAmount, '1650.00'); assert.equal(cash.cashHeldByPartner, '5775.00'); assert.equal(cash.transferAmount, '-4125.00');
  assert.equal((await settlementFixture({ visits: 6 }).preview()).transferAmount, '1650.00');
});
test('partner historical snapshots survive current group price/share edits, tax reduces iCube alone', async () => {
  const fixture = settlementFixture({ visits: 1, tax: true }); const result = await fixture.preview();
  assert.equal(result.partnerShareAmount, '275.00'); assert.equal(result.salaryAmount, '275.00'); assert.equal(result.taxAmount, '33.00'); assert.equal(result.icubeShareAmount, '242.00');
  const sql = fixture.calls.find((c) => c.sql.includes('FROM attendances a JOIN lessons')).sql;
  assert.doesNotMatch(sql, /g\.(?:price|teacher_share_percent|partner_share_percent|custom_tax_enabled)/);
});
test('one project combines unchanged ordinary 60/40 and custom attendance shares without double counting', async () => {
  const result = await settlementFixture({ visits: 6, cash: '6600.00', ordinary: true }).preview();
  assert.equal(result.salaryAmount, '3650.00'); assert.equal(result.taxAmount, '360.00');
  assert.equal(result.partnerShareAmount, '5634.00'); assert.equal(result.icubeShareAmount, '4306.00');
  assert.equal(result.transferAmount, '-3966.00'); assert.equal(result.incomeAmount, '13950.00');
});
test('advanced group UI is collapsed for normal groups, uses existing form/save contract and one modal', () => {
  const normal = advancedGroupFields(); assert.doesNotMatch(normal, /<details[^>]* open/);
  assert.match(advancedGroupFields({ isIndividual: true, packageLessonCount: 8 }), /<details[^>]* open/);
  assert.match(normal, /Расширенные настройки/); assert.match(normal, /Добавить день/); assert.doesNotMatch(normal, /modal-backdrop/);
  const fields = new Map([['#gf-package-count', { value: '8' }], ['#gf-package-price', { value: '6600' }], ['#gf-dir', { value: 'Робототехника' }],
    ['#gf-individual', { checked: true }], ['#gf-calculation-mode', { value: 'attendance_share' }], ['#gf-teacher-share', { value: '33.3333' }], ['#gf-partner-share', { value: '33.3333' }]]);
  const host = { groupForm() {}, group() { return '<h1>Группа</h1>'; } };
  installAdvancedGroupUi({ state: { groups: [] } }, host, { querySelector: (key) => fields.get(key), querySelectorAll: () => [] });
  host.icubeAdvancedGroups.refresh(true); const payload = host.icubeAdvancedGroups.payload();
  assert.equal(payload.packagePrice, '6600'); assert.equal(payload.packageLessonCount, 8); assert.equal(payload.isIndividual, true);
});
test('024 is next migration, has compatible defaults and keeps old migrations untouched', async () => {
  const sql = await readFile(new URL('../database/migrations/024_advanced_group_settings.sql', import.meta.url), 'utf8');
  assert.match(sql, /package_lesson_count SMALLINT UNSIGNED NOT NULL DEFAULT 4/); assert.match(sql, /calculation_mode VARCHAR\(24\) NOT NULL DEFAULT 'standard'/);
  assert.match(sql, /UNIQUE KEY uq_group_extra_slot/); assert.match(sql, /ON DELETE CASCADE/); assert.doesNotMatch(sql, /TRUNCATE|DROP TABLE|DROP DATABASE/);
  assert.equal(splitSqlStatements(sql).length, 6);
});

function catalogFixture() {
  const group = { id: 10, name: 'Группа', direction_id: 1, direction_name: 'Робототехника', site_id: 2, project_id: 3, teacher_id: 4,
    weekday: 2, start_time: '16:00', end_time: '17:30', starts_on: '2026-01-01', ends_on: null, active: true, is_mixed: false,
    is_individual: false, package_lesson_count: 4, calculation_mode: 'standard', price: null };
  let slots = []; let memberCount = 0; const writes = [];
  const query = async (sql, p = {}) => {
    if (sql.includes('FROM study_groups g JOIN directions')) return [[{ ...group, schedule_slots: structuredClone(slots) }]];
    if (sql.startsWith('SELECT id,is_individual')) return [[{ id: 10, is_individual: group.is_individual }]];
    if (sql.startsWith('SELECT COUNT(DISTINCT e.child_id)')) return [[{ member_count: memberCount }]];
    if (sql.startsWith('SELECT e.child_id FROM group_memberships')) return [memberCount ? [{ child_id: 50 }] : []];
    if (sql.startsWith('SELECT d.name FROM group_memberships')) return [[]];
    if (sql.startsWith('SELECT id FROM') || sql.includes('FROM sites s JOIN teacher_projects') || sql.startsWith('SELECT teacher_id')) return [[{ id: 1 }]];
    if (sql.startsWith('UPDATE study_groups')) {
      Object.assign(group, { is_individual: p.isIndividual, package_lesson_count: p.packageLessonCount, calculation_mode: p.calculationMode,
        teacher_share_percent: p.teacherSharePercent, partner_share_percent: p.partnerSharePercent, custom_tax_enabled: p.customTaxEnabled });
      writes.push({ sql, p }); return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('DELETE FROM group_schedule_slots')) { slots = []; return [{ affectedRows: 1 }]; }
    if (sql.startsWith('INSERT INTO group_schedule_slots')) { slots.push({ weekday: p.weekday, startTime: p.startTime, endTime: p.endTime }); return [{ insertId: slots.length }]; }
    if (sql.startsWith('SELECT id,price FROM price_versions')) return [[]];
    if (sql.startsWith('UPDATE price_versions')) return [{ affectedRows: 1 }];
    if (sql.startsWith('INSERT INTO price_versions')) { group.price = p.price; writes.push({ sql, p }); return [{ insertId: 1 }]; }
    throw new Error(sql);
  };
  const pool = poolFor(query);
  return { group, writes, pool, catalog: createMysqlCatalog(pool), set members(count) { memberCount = count; } };
}
test('actual catalog update stores additional slots/settings and versions the 825 unit price', async () => {
  const f = catalogFixture();
  const result = await f.catalog.update('groups', 10, { isIndividual: true, packageLessonCount: 8, packagePrice: '6600.00',
    calculationMode: 'attendance_share', ...settings, scheduleSlots: [{ weekday: 5, startTime: '16:00', endTime: '17:30' }] });
  assert.equal(result.price, '825'); assert.equal(result.packageLessonCount, 8); assert.equal(result.isIndividual, true);
  assert.equal(result.calculationMode, 'attendance_share'); assert.equal(result.scheduleSlots.length, 1);
  assert.equal(f.pool.commits, 1);
  assert.ok(f.writes.some((w) => w.sql.startsWith('INSERT INTO price_versions') && w.p.price === 825));
  const historyWrites = f.writes.filter((w) => /payments|attendances|salary_accruals/.test(w.sql)); assert.equal(historyWrites.length, 0);
});
test('catalog refuses turning an occupied group with two children into individual before writing settings', async () => {
  const f = catalogFixture(); f.members = 2;
  await assert.rejects(f.catalog.update('groups', 10, { isIndividual: true }), { code: 'INDIVIDUAL_GROUP_FULL' });
  assert.equal(f.writes.length, 0); assert.equal(f.pool.rollbacks, 1);
});
test('existing enrollment API blocks another child in individual group without changing membership history', async () => {
  const f = catalogFixture(); f.group.is_individual = true; f.members = 1;
  await assert.rejects(f.catalog.createEnrollment(51, { directionId: 1, projectId: 3, groupId: 10 }), { code: 'INDIVIDUAL_GROUP_FULL' });
  assert.equal(f.pool.rollbacks, 1); assert.equal(f.writes.length, 0);
});
test('advanced form preserves directly mounted required date fields and original save button', () => {
  const date = { value: '2026-09-30' }; let injected; let renders = 0;
  const host = { groupForm() { legacy.state.modal = '<h3>Группа</h3><div class="modal-actions"><button onclick="icubeApi.saveGroup(10)">Сохранить</button></div>'; }, group() { return '<h1>Группа</h1>'; } };
  const legacy = { state: { groups: [{ id: 10, isIndividual: true, packageLessonCount: 8, price: 825 }] }, render() { renders++; } };
  installAdvancedGroupUi(legacy, host, { querySelector: (key) => key === '#gf-end-date' ? date : key === '.modal-actions' ? { insertAdjacentHTML(_position, html) { injected = html; } } : null, querySelectorAll: () => [] });
  host.groupForm(10);
  assert.equal(renders, 0); assert.equal(date.value, '2026-09-30'); assert.match(injected, /Расширенные настройки/);
  assert.match(legacy.state.modal, /icubeApi.saveGroup\(10\)/); assert.doesNotMatch(legacy.state.modal, /modal-backdrop/);
});
test('real shared calendar handles two same-day slots distinctly and retains persisted removed-slot history', async () => {
  const source = await readFile(new URL('../src/frontend/crm-ui.js', import.meta.url), 'utf8');
  const app = { innerHTML: '' };
  const document = { body: { style: {}, classList: { add() {}, remove() {}, contains() { return false; } } }, documentElement: { style: {} },
    head: { appendChild() {} }, getElementById: (id) => id === 'app' ? app : null, createElement: () => ({ style: {}, appendChild() {} }),
    querySelector: (selector) => selector === '#app' ? app : null, querySelectorAll: () => [], addEventListener() {} };
  const context = vm.createContext({ document, console, alert() {}, requestAnimationFrame: (fn) => fn(), setTimeout: () => 0, clearTimeout() {},
    scrollTo() {}, addEventListener() {}, MutationObserver: class { observe() {} disconnect() {} } });
  context.window = context; context.globalThis = context;
  vm.runInContext(source, context);
  const state = context.icubeLegacy.state;
  state.groups = [{ id: 10, direction: 'Робототехника', active: true, project: 'Зебра', teacherId: 4, day: 'Вторник', startTime: '16:00', endTime: '17:30',
    startDate: '2026-01-01', scheduleSlots: [{ weekday: 2, startTime: '18:00', endTime: '19:30' }] }]; state.lessons = [];
  const from = new Date(2026,8,15), to = new Date(2026,8,15);
  const events = context.sharedCalendarEvents(from, to);
  assert.equal(events.length, 2); assert.notEqual(events[0].key, events[1].key); assert.match(events[1].key, /18:00$/);
  state.lessons = [{ id: 60, groupId: 10, teacherId: 4, date: '15.09.2026', scheduledDate: '15.09.2026', time: '18:00–19:30', scheduledTime: '18:00–19:30', occurrenceKey: events[1].key, done: true }];
  state.groups[0].scheduleSlots = [];
  const apiSource = await readFile(new URL('../src/frontend/api-sync.mjs', import.meta.url), 'utf8');
  context.legacy = context.icubeLegacy;
  vm.runInContext(apiSource.slice(apiSource.indexOf('function calendarOccurrenceKey'), apiSource.indexOf('function mapLesson')), context);
  state.lessons[0].occurrenceKey = context.calendarOccurrenceKey(10, '15.09.2026', '18:00');
  const changed = context.sharedCalendarEvents(from, to);
  assert.equal(changed.filter((event) => event.lesson?.id === 60).length, 1); assert.equal(changed.length, 2);
  assert.notEqual(changed[0].key, changed[1].key);
  state.lessons = []; state.deletedOccurrences = [context.calendarOccurrenceKey(10, '15.09.2026', '18:00')];
  const afterDeletion = context.sharedCalendarEvents(from, to);
  assert.equal(afterDeletion.length, 1); assert.equal(afterDeletion[0].time, '16:00–17:30');
});
test('parent payment package label keeps four for ordinary and displays eight for advanced group', async () => {
  const source = await readFile(new URL('../src/frontend/parent-portal.mjs', import.meta.url), 'utf8');
  const noun = source.slice(source.indexOf('function lessonNoun'), source.indexOf('export function parentBalancePresentation'));
  const payments = source.slice(source.indexOf('function paymentsHtml'), source.indexOf('function aboutHtml'));
  const context = vm.createContext({ state: { receiptFile: null }, escapeHtml: String, money: String, empty: String });
  vm.runInContext(`${noun}\n${payments}`, context);
  for (const [count, price, label] of [[4, '4100.00', '4 занятия'], [8, '6600.00', '8 занятий']]) {
    const html = context.paymentsHtml({ homes: [{ child: { name: 'Ребёнок' }, enrollments: [{ direction: 'Робототехника', packageLessonCount: count, subscriptionPrice: price }] }] });
    assert.ok(html.includes(label)); assert.ok(html.includes(price));
  }
});

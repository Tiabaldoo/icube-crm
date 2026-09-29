import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createMysqlCatalog } from '../backend/src/catalog.mjs';
import { createMysqlLessons } from '../backend/src/lessons.mjs';
import { createReleaseNotes, releaseForRoles } from '../backend/src/release-notes.mjs';

function transactional(handler) {
  const connection = { query: handler, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {} };
  return { query: handler, getConnection: async () => connection };
}
function catalogFixture(mixed = false) {
  const group = { id: 10, name: 'Группа', is_mixed: mixed, direction_id: 1, direction_name: 'Робототехника', site_id: 2,
    project_id: 3, teacher_id: 4, weekday: 1, start_time: '10:00', end_time: '11:00', starts_on: '2026-01-01', ends_on: null, active: true, mixed_prices: {} };
  const enrollments = []; const memberships = []; const calls = [];
  const settings = { teacherDirections: true };
  const names = { 1: 'Робототехника', 2: 'Программирование' };
  const handler = async (sql, p = {}) => {
    calls.push({ sql, p });
    if (sql.includes('FROM study_groups g JOIN directions')) return [[{ ...group }]];
    if (sql === 'SELECT id FROM study_groups WHERE id=:groupId FOR UPDATE') return [[{ id: group.id }]];
    if (sql.includes('FROM study_groups WHERE id=:groupId AND (is_mixed')) {
      assert.match(sql, /project_id=:projectId/);
      return [[...((String(p.projectId) === String(group.project_id) && (group.is_mixed || String(p.directionId) === String(group.direction_id))) ? [{ id: 10 }] : [])]];
    }
    if (/^SELECT id FROM (children|directions|sites|projects|teachers)/.test(sql)) return [[{ id: p.id }]];
    if (sql.startsWith('SELECT s.id FROM sites')) return [[{ id: 2 }]];
    if (sql.startsWith('SELECT teacher_id FROM teacher_project_directions')) return [settings.teacherDirections ? [{ teacher_id: 4 }] : []];
    if (sql.startsWith('SELECT d.name FROM group_memberships')) return [[...enrollments.filter((e) => memberships.some((m) => m.enrollmentId === e.id) && String(e.directionId) !== String(p.directionId)).map((e) => ({ name: names[e.directionId] }))]];
    if (sql.startsWith('UPDATE study_groups')) { group.is_mixed = p.isMixed; group.direction_id = p.directionId; return [{ affectedRows: 1 }]; }
    if (sql.startsWith('SELECT id FROM child_enrollments')) return [[...enrollments.filter((e) => String(e.childId) === p.childId && String(e.directionId) === p.directionId).map((e) => ({ id: e.id }))]];
    if (sql.startsWith('INSERT INTO child_enrollments')) { const id = enrollments.length + 100; enrollments.push({ ...p, id }); return [{ insertId: id }]; }
    if (sql.startsWith('INSERT INTO group_memberships')) { memberships.push({ ...p }); return [{ insertId: memberships.length }]; }
    if (sql.includes('FROM children c LEFT JOIN child_guardians')) return [[...enrollments.map((e) => ({ id: e.childId, full_name: `Ребёнок ${e.childId}`, status: 'active' }))]];
    if (sql.includes('FROM child_enrollments e JOIN directions')) return [[...enrollments.map((e) => ({ id: e.id, child_id: e.childId, direction_id: e.directionId, direction_name: names[e.directionId],
      project_id: e.projectId, status: e.status, balance_lessons: '0.00000000', started_on: e.startedOn, group_id: 10 }))]];
    if (sql.startsWith('SELECT l.id FROM lessons')) return [[]];
    if (sql.startsWith('SELECT id,price FROM price_versions')) return [[]];
    if (sql.startsWith('UPDATE price_versions') || sql.startsWith('INSERT INTO price_versions')) return [{ insertId: 1 }];
    throw new Error(sql);
  };
  return { catalog: createMysqlCatalog(transactional(handler)), group, memberships, enrollments, calls, settings };
}
for (const [mixed, direction, allowed] of [[false, 1, true], [false, 2, false], [true, 1, true], [true, 2, true]]) {
  test(`${mixed ? 'mixed' : 'ordinary'} enrollment ${direction}: ${allowed ? 'accepted' : 'rejected'}`, async () => {
    const f = catalogFixture(mixed); const action = f.catalog.createEnrollment(50, { directionId: direction, groupId: 10, projectId: 3 });
    if (!allowed) { await assert.rejects(action, { code: 'GROUP_DIRECTION_MISMATCH' }); assert.equal(f.memberships.length, 0); }
    else { const result = await action; assert.equal(result.directionId, String(direction)); assert.equal(f.memberships.length, 1); }
  });
}
test('both real directions join one mixed group without extra enrollments', async () => {
  const f = catalogFixture(true);
  await f.catalog.createEnrollment(50, { directionId: 1, groupId: 10, projectId: 3 });
  await f.catalog.createEnrollment(51, { directionId: 2, groupId: 10, projectId: 3 });
  assert.deepEqual(f.enrollments.map((e) => e.directionId), ['1', '2']); assert.equal(f.memberships.length, 2);
  assert.equal((await f.catalog.list('groups'))[0].directionName, 'Смешанная');
});
test('mixed membership cannot cross projects', async () => {
  const f = catalogFixture(true);
  await assert.rejects(f.catalog.createEnrollment(50, { directionId: 2, groupId: 10, projectId: 99 }), { code: 'GROUP_DIRECTION_MISMATCH' });
  assert.equal(f.memberships.length, 0);
});
test('ordinary -> mixed retains roster and writes two separate prices', async () => {
  const f = catalogFixture(); await f.catalog.createEnrollment(50, { directionId: 1, groupId: 10, projectId: 3 });
  const before = structuredClone(f.memberships);
  const result = await f.catalog.update('groups', 10, { isMixed: true, mixedPrices: { 1: '1200.00', 2: '1250.00' } });
  assert.equal(result.directionName, 'Смешанная'); assert.deepEqual(f.memberships, before);
  const writes = f.calls.filter(({ sql }) => sql.startsWith('INSERT INTO price_versions'));
  assert.deepEqual(writes.map(({ p }) => [p.directionId, p.price]), [['1', '1200.00'], ['2', '1250.00']]);
  assert.ok(writes.every(({ sql }) => sql.includes("'mixed_group'")));
});
test('mixed -> ordinary rejects incompatible roster before writing', async () => {
  const f = catalogFixture(true); await f.catalog.createEnrollment(50, { directionId: 2, groupId: 10, projectId: 3 });
  await assert.rejects(f.catalog.update('groups', 10, { isMixed: false, directionId: 1 }), { code: 'GROUP_MEMBERS_DIRECTION_MISMATCH' });
  assert.equal(f.group.is_mixed, true); assert.ok(!f.calls.some(({ sql }) => sql.startsWith('UPDATE study_groups')));
});
test('mixed -> ordinary accepts compatible roster and closes mixed prices', async () => {
  const f = catalogFixture(true); await f.catalog.createEnrollment(50, { directionId: 1, groupId: 10, projectId: 3 });
  const result = await f.catalog.update('groups', 10, { isMixed: false, directionId: 1 });
  assert.equal(result.directionName, 'Робототехника'); assert.equal(f.memberships.length, 1);
  assert.ok(f.calls.some(({ sql, p }) => sql.startsWith('UPDATE price_versions') && p.scope === 'mixed_group'));
});

function lessonFixture({ mixed = true, projectId = 3, price1 = '1200.00', price2 = '1250.00', individual = null, status = 'in_progress' } = {}) {
  const calls = []; const debits = [];
  const lesson = { id: 60, group_id: 10, is_mixed_snapshot: mixed, direction_id_snapshot: 1, project_id_snapshot: 3, planned_teacher_id: 4,
    actual_teacher_id: 4, status, starts_at: '2026-09-14 10:00:00', ends_at: '2026-09-14 11:00:00', scheduled_starts_at: '2026-09-14 10:00:00', scheduled_ends_at: '2026-09-14 11:00:00' };
  const enrollments = [{ id: 100, child_id: 50, direction_id: 1, project_id: projectId }, { id: 101, child_id: 51, direction_id: 2, project_id: projectId }];
  const attendance = []; const commands = new Map();
  const query = async (sql, p = {}) => {
    calls.push({ sql, p });
    if (sql.startsWith('SELECT id FROM children WHERE create_idempotency_key')) return [commands.has(p.key) ? [{ id: commands.get(p.key) }] : []];
    if (sql.startsWith('SELECT id FROM directions WHERE name=')) return [['Робототехника','Программирование'].includes(p.name) ? [{ id: p.name === 'Программирование' ? 2 : 1 }] : []];
    if (sql.startsWith('INSERT INTO children')) { commands.set(p.commandKey, 52); return [{ insertId: 52 }]; }
    if (sql.startsWith('INSERT INTO child_enrollments')) { const id = 102; enrollments.push({ id, child_id: p.childId, direction_id: p.directionId, project_id: p.projectId }); return [{ insertId: id }]; }
    if (sql.startsWith('SELECT tp.teacher_id FROM teacher_projects')) {
      assert.match(sql, /tp.active=TRUE/); assert.match(sql, /:isMixed OR tpd.direction_id=:directionId/);
      return [[{ teacher_id: 4 }]];
    }
    if (sql === 'SELECT * FROM lessons WHERE id=:id FOR UPDATE') return [[{ ...lesson }]];
    if (sql.includes('FROM lessons l JOIN study_groups')) return [[{ ...lesson, group_name: 'Группа', direction_name: 'Робототехника' }]];
    if (sql.startsWith('SELECT e.id,e.direction_id FROM child_enrollments')) return [[...enrollments.filter((e) => String(e.child_id) === p.childId && String(e.project_id) === String(p.projectId))]];
    if (sql.startsWith('SELECT e.id,e.child_id,e.direction_id,e.balance_lessons')) {
      assert.match(sql, /pv\.scope_type='mixed_group' AND pv\.direction_id=e\.direction_id/);
      assert.match(sql, /pv\.direction_id=e\.direction_id[\s\S]*pv\.valid_from<=:startsAt/);
      const e = enrollments.find((e) => String(e.id) === String(p.enrollmentId) && String(e.project_id) === String(p.projectId));
      if (!e) return [[]];
      // Model SQL priority; the SQL contract above pins direction, membership and historical date.
      assert.ok(sql.indexOf("scope_type='enrollment'") < sql.indexOf("scope_type='mixed_group'"));
      const price = individual ?? (e.direction_id === 1 ? price1 ?? '1025.00' : price2 ?? '1125.00');
      return [[{ ...e, current_price: price, balance_lessons: '4.00000000' }]];
    }
    if (sql.startsWith('SELECT t.id FROM teachers t JOIN teacher_projects')) { assert.equal(p.isMixed, true); return [[{ id: 4 }]]; }
    if (sql.startsWith('SELECT gm.child_id,gm.enrollment_id')) return [[...enrollments.map((e) => ({ child_id: e.child_id, enrollment_id: e.id }))]];
    if (sql.startsWith('INSERT IGNORE INTO lesson_roster_members')) return [{ affectedRows: 1 }];
    if (sql.startsWith('INSERT IGNORE INTO attendances')) { const id = attendance.length + 200; attendance.push({ id, lesson_id: 60, child_id: p.childId, enrollment_id: p.enrollmentId, attendance_type: 'main', present: 0, is_trial: p.trial }); return [{ insertId: id }]; }
    if (sql.startsWith("UPDATE lessons SET status='in_progress'")) { lesson.status = 'in_progress'; return [{ affectedRows: 1 }]; }
    if (sql.startsWith('SELECT * FROM attendances WHERE lesson_id=:lessonId AND child_id=:childId')) return [[...attendance.filter((a) => String(a.child_id) === String(p.childId))]];
    if (sql.startsWith('UPDATE attendances SET enrollment_id=:enrollmentId,attendance_type=')) { Object.assign(attendance.find((a) => a.id === p.id), { present: p.present, is_trial: p.trial, marked_at: '2026-09-14 10:10:00' }); return [{ affectedRows: 1 }]; }
    if (sql.startsWith('SELECT roster_type FROM lesson_roster_members')) return [[...attendance.filter((a) => String(a.child_id) === String(p.childId)).map((a) => ({ roster_type: a.attendance_type }))]];
    if (sql.includes('FROM attendances a JOIN lessons')) return [[{ id: 1 }]];
    if (sql.startsWith('INSERT INTO lesson_roster_members')) return [{ affectedRows: 1 }];
    if (sql.startsWith('INSERT INTO attendances')) { const id = attendance.length + 200; attendance.push({ id, lesson_id: 60, child_id: p.childId, enrollment_id: p.enrollmentId, attendance_type: 'extra', present: 1, is_trial: p.trial }); return [{ insertId: id }]; }
    if (sql === 'SELECT * FROM attendances WHERE lesson_id=:lessonId FOR UPDATE') return [[...attendance]];
    if (sql.includes('be.attendance_id=:attendanceId')) return [[]];
    if (sql.startsWith('SELECT id,remaining_lessons,unit_price FROM balance_lots')) return [[]];
    if (sql.startsWith('INSERT INTO balance_entries')) { debits.push(p); return [{ insertId: debits.length }]; }
    if (sql.startsWith("UPDATE lessons SET status='completed'")) { lesson.status = 'completed'; return [{ affectedRows: 1 }]; }
    if (sql.startsWith('SELECT COUNT(*) present_count')) return [[{ present_count: attendance.length }]];
    if (sql.includes('FROM salary_rate_versions')) return [[{ id: 1, regular_fixed: '600.00', per_present_child: '100.00', intro_fixed: '600.00', empty_trip_fixed: '300.00' }]];
    if (sql.includes('FROM salary_accruals')) return [[]];
    if (sql.includes('lesson_roster_members WHERE lesson_id IN')) return [[...attendance.map((a) => ({ lesson_id: 60, child_id: a.child_id, roster_type: a.attendance_type }))]];
    if (sql.includes('FROM attendances WHERE lesson_id IN')) return [[...attendance]];
    if (sql.startsWith('INSERT INTO audit_log')) return [{ insertId: 1 }];
    if (sql.startsWith('UPDATE ') || sql.startsWith('INSERT INTO salary_accruals')) return [{ affectedRows: 1 }];
    throw new Error(sql);
  };
  return { service: createMysqlLessons(transactional(query)), attendance, calls, debits };
}
const director = { roles: ['director'], userId: 1 };
test('mixed attendance debits each pinned real enrollment independently', async () => {
  const f = lessonFixture({ status: 'scheduled' });
  await f.service.start(60, {}, director);
  assert.deepEqual(f.attendance.map((a) => a.enrollment_id), ['100', '101']);
  await f.service.putAttendance(60, 50, { present: true, trial: false }, director);
  await f.service.putAttendance(60, 51, { present: true, trial: false }, director);
  await f.service.finish(60, {}, director);
  assert.deepEqual(f.debits.map((p) => [p.enrollmentId, p.price, p.amount]), [[100, '1200.00', '-1200.00'], [101, '1250.00', '-1250.00']]);
  assert.deepEqual(f.calls.filter(({ sql }) => sql.startsWith('UPDATE child_enrollments SET balance_lessons=balance_lessons-')).map(({ p }) => p.id), [100, 101]);
});
for (const [label, options, childId, enrollmentId, expected] of [
  ['robot mixed price', {}, 50, 100, '1200.00'], ['programming mixed price', {}, 51, 101, '1250.00'],
  ['empty robot price falls back to own base', { price1: null }, 50, 100, '1025.00'],
  ['empty mixed price falls back to own base', { price2: null }, 51, 101, '1125.00'],
  ['individual wins over group', { individual: '725.00' }, 51, 101, '725.00'],
  ['ordinary group price preserved', { mixed: false, price1: '1025.00' }, 50, 100, '1025.00'],
]) test(label, async () => {
  const f = lessonFixture(options); await f.service.addExtra(60, { childId, enrollmentId }, director); await f.service.finish(60, {}, director);
  assert.equal(f.debits[0].price, expected);
});
test('ordinary lesson accepts other-direction extra, debits own enrollment and never writes memberships', async () => {
  const f = lessonFixture({ mixed: false });
  await f.service.addExtra(60, { childId: 51, enrollmentId: 101 }, director);
  assert.equal(f.attendance[0].enrollment_id, 101); await f.service.finish(60, {}, director);
  assert.equal(f.debits[0].enrollmentId, 101);
  assert.ok(!f.calls.some(({ sql }) => /^(INSERT|UPDATE|DELETE).*group_memberships/.test(sql)));
});
test('cross-project extra remains forbidden with a substituted enrollment id', async () => {
  const f = lessonFixture({ projectId: 99 });
  await assert.rejects(f.service.addExtra(60, { childId: 51, enrollmentId: 101 }, director), { code: 'ENROLLMENT_REQUIRED' });
  assert.equal(f.attendance.length, 0); assert.equal(f.debits.length, 0);
});
for (const role of ['director', 'partner', 'teacher', 'parent']) test(`release 1.1 role ${role}`, () => {
  const note = releaseForRoles([role]);
  if (role === 'parent') assert.equal(note, null);
  else { assert.equal(note.version, '1.1'); assert.equal(note.sections.length, role === 'teacher' ? 2 : 3); }
});
test('release mixed roles are merged without duplicate sections', () => {
  assert.equal(releaseForRoles(['director', 'teacher', 'partner', 'parent']).sections.length, 3);
});
test('release dismissal persists per user/version across service instances and devices', async () => {
  const seen = new Set();
  const pool = { query: async (sql, p) => {
    const key = `${p.userId}/${p.version}`;
    if (sql.startsWith('SELECT')) return [seen.has(key) ? [{ release_version: p.version }] : []];
    assert.match(sql, /^INSERT IGNORE INTO user_release_views/); seen.add(key); return [{ affectedRows: 1 }];
  } };
  const user = { userId: 1, roles: ['teacher'] }; const service = createReleaseNotes(pool);
  assert.equal((await service.current(user)).version, '1.1'); await service.dismiss('1.1', user); await service.dismiss('1.1', user);
  assert.equal(await createReleaseNotes(pool).current(user), null);
  assert.equal((await service.current({ ...user, userId: 2 })).version, '1.1'); assert.equal(seen.size, 1);
  await assert.rejects(service.dismiss('1.1', { userId: 3, roles: ['parent'] }), { status: 404 });
});
test('migration leaves old groups ordinary, preserves prices, adds no mixed direction and protects current prices', async () => {
  const sql = await readFile(new URL('../database/migrations/023_mixed_groups_release_notes.sql', import.meta.url), 'utf8');
  assert.match(sql, /is_mixed BOOLEAN NOT NULL DEFAULT FALSE/); assert.match(sql, /is_mixed_snapshot BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(sql, /scope_type='mixed_group' AND direction_id IS NOT NULL AND group_id IS NOT NULL/);
  assert.match(sql, /PRIMARY KEY \(user_id,release_version\)/);
  assert.doesNotMatch(sql, /INSERT INTO directions|DELETE FROM|UPDATE payments|UPDATE attendances/i);
  const current = await readFile(new URL('../database/migrations/018_project_teacher_and_current_invariants.sql', import.meta.url), 'utf8');
  assert.match(current, /scope_type.*direction_id.*group_id/);
});

test('release UI uses authenticated API, view/dismiss, server acknowledgement, and skips parent', async () => {
  const { showReleaseNote } = await import('../src/frontend/release-notes.mjs');
  const calls = []; let listener; let removed = false; let root;
  const document = { querySelector() { return null; }, createElement() { root = { dataset: {}, addEventListener(_name, fn) { listener = fn; }, remove() { removed = true; } }; return root; }, body: { append() {} } };
  const api = { request: async (url, options) => { calls.push({ url, options }); return url.endsWith('/current') ? releaseForRoles(['teacher']) : { seen: true }; } };
  await showReleaseNote(api, { roles: ['parent'] }, document); assert.equal(calls.length, 0);
  await showReleaseNote(api, { roles: ['teacher'] }, document); assert.match(root.innerHTML, /Обновление 1.1/); assert.match(root.innerHTML, /Посмотреть/);
  await listener({ target: { closest: (s) => s === '[data-release-open]' ? {} : null } });
  assert.match(root.innerHTML, /Что нового в версии 1.1/); assert.match(root.innerHTML, /Понятно/); assert.doesNotMatch(root.innerHTML, /Смешанные группы/);
  const button = {};
  await listener({ target: { closest: (s) => s === '[data-release-dismiss]' ? button : null } });
  assert.equal(calls[1].url, '/releases/1.1/dismiss'); assert.equal(calls[1].options.method, 'POST'); assert.equal(removed, true);
});

test('mixed teacher needs active project but not both assigned directions', async () => {
  const f = catalogFixture(); f.settings.teacherDirections = false;
  await f.catalog.update('groups', 10, { isMixed: true });
  assert.equal(f.group.is_mixed, true);
  const ordinary = catalogFixture(); ordinary.settings.teacherDirections = false;
  await assert.rejects(ordinary.catalog.update('groups', 10, { name: 'Обычная' }), { code: 'TEACHER_DIRECTION_MISMATCH' });
});
test('assigned mixed lesson permits cross-direction extra for teacher without enlarging lesson access', async () => {
  const own = lessonFixture();
  await own.service.addExtra(60, { childId: 51, enrollmentId: 101 }, { roles: ['teacher'], userId: 7, teacherId: 4 });
  assert.equal(own.attendance[0].enrollment_id, 101);
  const foreign = lessonFixture();
  await assert.rejects(foreign.service.addExtra(60, { childId: 51, enrollmentId: 101 }, { roles: ['teacher'], userId: 9, teacherId: 9 }), { status: 403 });
  assert.equal(foreign.attendance.length, 0);
});
test('all price readers resolve mixed prices by own enrollment direction; historical lesson uses timestamp', async () => {
  for (const name of ['catalog', 'payments', 'balance-transfers', 'parent-portal', 'lessons']) {
    const source = await readFile(new URL(`../backend/src/${name}.mjs`, import.meta.url), 'utf8');
    assert.match(source, /pv\.scope_type='mixed_group' AND pv\.direction_id=e\.direction_id/);
  }
  const lessons = await readFile(new URL('../backend/src/lessons.mjs', import.meta.url), 'utf8');
  assert.match(lessons, /pv\.valid_from<=:startsAt AND \(pv\.valid_to IS NULL OR pv\.valid_to>:startsAt\)/);
  assert.match(lessons, /attendance\.child_id, attendance\.enrollment_id/);
  const stats = await readFile(new URL('../backend/src/statistics.mjs', import.meta.url), 'utf8');
  assert.match(stats, /COALESCE\(ae\.direction_id,l\.direction_id_snapshot\)=:directionId/);
  assert.match(stats, /PARTITION BY a\.child_id,l\.project_id_snapshot,e\.direction_id/);
  assert.match(stats, /CASE WHEN l\.is_mixed_snapshot THEN 'Смешанная'/);
});

test('mixed quick-child keeps a real chosen direction and retry creates no extra enrollment', async () => {
  const f = lessonFixture(); const context = { ...director, idempotencyKey: 'mixed-quick-child-1' };
  const result = await f.service.quickChild(60, { name: 'Новый ребёнок', directionName: 'Программирование' }, context);
  assert.equal(result.childId, '52');
  const inserts = f.calls.filter(({ sql }) => sql.startsWith('INSERT INTO child_enrollments'));
  assert.equal(inserts[0].p.directionId, 2);
  await f.service.quickChild(60, { name: 'Новый ребёнок', directionName: 'Программирование' }, context);
  assert.equal(f.calls.filter(({ sql }) => sql.startsWith('INSERT INTO child_enrollments')).length, 1);
  const invalid = lessonFixture();
  await assert.rejects(invalid.service.quickChild(60, { name: 'Новый ребёнок', directionName: 'Смешанная' }, { ...director, idempotencyKey: 'invalid-mixed-dir' }), { code: 'INVALID_DIRECTION' });
  assert.ok(!invalid.calls.some(({ sql }) => sql.startsWith('INSERT INTO children')));
});

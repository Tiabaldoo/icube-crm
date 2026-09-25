import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createParentPortal } from '../backend/src/parent-portal.mjs';
import { createParentNotifications } from '../backend/src/parent-notifications.mjs';
import { createMysqlLessons } from '../backend/src/lessons.mjs';
import { permissions } from '../backend/src/auth.mjs';
import { ageFromBirthDate, parentAbsenceAction, parentBalancePresentation, parentHomeHtml, parentScheduleCalendar, parentScheduleStatus } from '../src/frontend/parent-portal.mjs';
import { ageOnDate, createBirthdayNotifications } from '../backend/src/birthday-notifications.mjs';
import { localDate, nextDate } from '../scripts/generate-parent-notifications.mjs';

const parent = { userId: '50', roles: ['parent'] };

function portalFixture() {
  const state = {
    accepted: new Set(), materialized: [], notices: new Set(), sql: [],
    documents: [
      { id: 1, document_type: 'privacy_policy', document_version: 'v1', title: 'Privacy', body: 'Text', is_required: 1 },
      { id: 2, document_type: 'personal_data_parent', document_version: 'v1', title: 'Parent', body: 'Text', is_required: 1 },
      { id: 3, document_type: 'personal_data_child_legal_representative', document_version: 'v1', title: 'Child', body: 'Text', is_required: 1 },
    ],
    children: [
      { id: 10, full_name: 'Петя', birth_date: '2018-01-02', school: 'Школа 1', grade: '2Б', status: 'active', group: 100, balance: '4.00000000' },
      { id: 11, full_name: 'Маша', birth_date: '2019-03-04', status: 'active', group: 101, balance: '1.50000000' },
      { id: 12, full_name: 'Чужой ребёнок', birth_date: '2018-05-06', status: 'active', group: 102, balance: '9.00000000' },
    ],
  };
  const linked = new Set([10, 11]);
  async function query(sql, params = {}) {
    state.sql.push(sql);
    if (sql.includes('FROM guardians g JOIN users u') && sql.includes('WHERE g.user_id=')) return [[{ id: 5, user_id: 50, full_name: 'Родитель', phone: null, email: null, login: 'parent@example.test', status: 'active' }]];
    if (sql.includes('FROM parent_documents d LEFT JOIN')) return [state.documents.map((row) => ({ ...row, accepted_at: state.accepted.has(row.id) ? new Date('2026-09-20T00:00:00Z') : null }))];
    if (sql.startsWith('SELECT id FROM parent_documents')) return [state.documents.filter((row) => String(row.id) === String(params.id)).map(({ id }) => ({ id }))];
    if (sql.startsWith('INSERT INTO parent_document_acceptances')) { state.accepted.add(Number(params.documentId)); return [{ affectedRows: 1 }]; }
    if (sql.includes('SELECT c.id,c.full_name,c.birth_date,c.status FROM guardians')) return [state.children.filter((child) => linked.has(child.id))];
    if (sql.includes('SELECT c.id,c.full_name,c.birth_date,c.school,c.grade,c.status,g.id guardian_id')) {
      const child = state.children.find((item) => String(item.id) === String(params.childId) && linked.has(item.id));
      return [[child ? { ...child, guardian_id: 5 } : undefined].filter(Boolean)];
    }
    if (sql.includes('FROM child_enrollments e JOIN directions')) {
      const child = state.children.find((item) => String(item.id) === String(params.childId));
      return [[child ? { id: child.id + 1000, direction_id: 1, balance_lessons: child.balance, status: 'active', direction_name: 'Робототехника',
        group_id: child.group, group_name: `Группа ${child.group}`, weekday: 3, start_time: '17:00:00', end_time: '18:00:00',
        site_name: 'Площадка', teacher_name: 'Учитель', current_price: '1025.00' } : undefined].filter(Boolean)];
    }
    if (sql.startsWith('UPDATE children SET birth_date=')) { const child = state.children.find((item) => String(item.id) === String(params.id)); Object.assign(child, { birth_date: params.birthDate, school: params.school, grade: params.grade }); return [{ affectedRows: 1 }]; }
    if (sql.includes('SELECT l.id,l.starts_at,l.status FROM lessons l') && sql.includes('FOR UPDATE')) return [[String(params.lessonId) === '70' && String(params.childId) === '10' ? { id: 70, starts_at: '2026-09-22 17:00:00', status: 'scheduled' } : undefined].filter(Boolean)];
    if (sql.startsWith('INSERT INTO lesson_child_absence_notices')) { state.notices.add(`${params.lessonId}:${params.childId}`); return [{ affectedRows: 1 }]; }
    if (sql.includes('SELECT id FROM lessons WHERE id=:lessonId') && sql.includes('FOR UPDATE')) return [[String(params.lessonId) === '70' ? { id: 70 } : undefined].filter(Boolean)];
    if (sql.startsWith('UPDATE lesson_child_absence_notices SET cancelled_at=')) { const key = `${params.lessonId}:${params.childId}`; const found = state.notices.delete(key); return [{ affectedRows: found ? 1 : 0 }]; }
    if (sql.includes('FROM lessons l JOIN sites') && sql.includes("l.status='scheduled'")) return [[{ id: 70, starts_at: '2026-09-22 17:00:00', ends_at: '2026-09-22 18:00:00', status: 'scheduled', site_name: 'Площадка', absence_notice: state.notices.has('70:10') ? '1' : '0', can_change_absence: '1' }]];
    if (sql.includes('SELECT l.id,l.group_id,l.scheduled_starts_at')) return [[
      { id: 70, group_id: 100, scheduled_starts_at: '2026-09-22 17:00:00', starts_at: '2026-09-22 17:00:00', ends_at: '2026-09-22 18:00:00', status: 'scheduled', group_name: 'Группа 100', teacher_name: 'Учитель', site_name: 'Площадка', absence_notice: state.notices.has('70:10') ? '1' : '0', attendance_present: null, can_change_absence: '1' },
      { id: 71, group_id: 100, scheduled_starts_at: '2026-09-23 17:00:00', starts_at: '2026-09-24 18:00:00', ends_at: '2026-09-24 19:00:00', status: 'scheduled', group_name: 'Группа 100', teacher_name: 'Учитель', site_name: 'Площадка', absence_notice: '0', attendance_present: null, can_change_absence: '1' },
      { id: 72, group_id: 100, scheduled_starts_at: '2026-09-25 17:00:00', starts_at: '2026-09-25 17:00:00', ends_at: '2026-09-25 18:00:00', status: 'cancelled', group_name: 'Группа 100', teacher_name: 'Учитель', site_name: 'Площадка', absence_notice: '0', attendance_present: '0', can_change_absence: '0' },
      { id: 73, group_id: 100, scheduled_starts_at: '2026-09-26 15:00:00', starts_at: '2026-09-26 17:00:00', ends_at: '2026-09-26 18:00:00', status: 'completed', group_name: 'Группа 100', teacher_name: 'Учитель', site_name: 'Площадка', absence_notice: '1', attendance_present: '1', can_change_absence: '0' },
      { id: 74, group_id: 100, scheduled_starts_at: '2026-09-27 17:00:00', starts_at: '2026-09-27 17:00:00', ends_at: '2026-09-27 18:00:00', status: 'completed', group_name: 'Группа 100', teacher_name: 'Учитель', site_name: 'Площадка', absence_notice: '1', attendance_present: null, can_change_absence: '0' },
    ]];
    if (sql.includes('FROM attendances a JOIN lessons')) {
      const childId = Number(params.childId); return [[{ lesson_id: childId * 10, starts_at: `2026-09-${childId === 10 ? '10' : '11'} 17:00:00`, is_trial: childId === 11, direction_name: 'Робототехника', group_name: `Группа ${childId}` }]];
    }
    if (sql.startsWith("SELECT id,paid_on operation_date")) return [[
      { id: Number(params.childId) * 10, operation_date: '2026-09-10', amount: '4100.00', operation_type: 'payment' },
      { id: Number(params.childId) * 10 + 1, operation_date: '2026-09-11', amount: '1025.00', operation_type: 'refund' },
    ]];
    if (sql.includes('SELECT ph.id,ph.lesson_id,ph.uploaded_at')) return [[{ id: Number(params.childId) * 10, lesson_id: 90, starts_at: '2026-09-12 17:00:00', uploaded_at: '2026-09-12 18:00:00', expires_at: '2026-10-12 18:00:00' }]];
    if (sql.startsWith('SELECT notification_type,enabled')) return [[]];
    if (sql.includes('FROM notifications n LEFT JOIN children')) return [[]];
    throw new Error(`Unexpected parent portal SQL: ${sql}`);
  }
  const connection = { query, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {} };
  const pool = { query, getConnection: async () => connection };
  const service = createParentPortal(pool, { materializeLessons: async (...args) => state.materialized.push(args), contact: { phone: '+70000000000' } });
  return { state, service };
}

test('parent is blocked until every current required document is accepted separately', async () => {
  const fixture = portalFixture();
  assert.equal((await fixture.service.me(parent)).consentRequired, true);
  await assert.rejects(fixture.service.children(parent), { status: 403, code: 'CONSENT_REQUIRED' });
  await fixture.service.acceptDocument(1, parent); await fixture.service.acceptDocument(2, parent);
  await assert.rejects(fixture.service.children(parent), { status: 403, code: 'CONSENT_REQUIRED' });
  await fixture.service.acceptDocument(3, parent);
  assert.deepEqual((await fixture.service.children(parent)).map((child) => child.name), ['Петя', 'Маша']);
  fixture.state.documents.push({ id: 4, document_type: 'privacy_policy', document_version: 'v2', title: 'Privacy v2', body: 'Text', is_required: 1 });
  await assert.rejects(fixture.service.children(parent), { status: 403, code: 'CONSENT_REQUIRED' });
});

test('parent scope rejects direct child id substitution and keeps two children independent', async () => {
  const fixture = portalFixture(); fixture.state.documents.forEach((item) => fixture.state.accepted.add(item.id));
  const petya = await fixture.service.home(10, parent); const masha = await fixture.service.home(11, parent);
  assert.equal(petya.child.name, 'Петя'); assert.equal(petya.enrollments[0].balanceLessons, '4.00000000'); assert.equal(petya.enrollments[0].subscriptionPrice, '4100.00');
  assert.equal(masha.child.name, 'Маша'); assert.equal(masha.enrollments[0].balanceLessons, '1.50000000');
  await assert.rejects(fixture.service.home(12, parent), { status: 404, code: 'CHILD_NOT_FOUND' });
  assert.deepEqual((await fixture.service.attendance(10, parent)).map((row) => row.lessonId), ['100']);
  assert.deepEqual((await fixture.service.attendance(11, parent)).map((row) => row.lessonId), ['110']);
  assert.deepEqual((await fixture.service.payments(10, parent)).map((row) => row.id), ['100', '101']);
  assert.deepEqual((await fixture.service.photos(11, parent)).map((row) => row.id), ['110']);
});

test('parent schedule materializes only linked current group and exposes no future status label', async () => {
  const fixture = portalFixture(); fixture.state.documents.forEach((item) => fixture.state.accepted.add(item.id));
  const rows = await fixture.service.schedule(10, { from: '2026-09-20', to: '2026-10-01' }, parent);
  assert.deepEqual(fixture.state.materialized, [['2026-09-20', '2026-10-01', '100']]);
  assert.equal(parentScheduleStatus(rows[0]), '');
  assert.equal(parentScheduleStatus(rows[1]), 'Перенесено');
  assert.equal(parentScheduleStatus(rows[2]), 'Отменено');
  assert.equal(parentScheduleStatus(rows[3]), 'Проведено');
});

test('parent schedule uses the shared calendar layout in read-only mode and completed overrides moved', () => {
  const rows = [
    { id: '70', startsAt: '2026-09-22T17:00:00', endsAt: '2026-09-22T18:00:00', status: 'scheduled', moved: false, group: 'Группа 1', site: 'Площадка', teacher: 'Учитель' },
    { id: '71', startsAt: '2026-09-24T18:00:00', endsAt: '2026-09-24T19:00:00', status: 'completed', moved: true, present: true, group: 'Группа 1', site: 'Площадка', teacher: 'Учитель' },
  ];
  const html = parentScheduleCalendar(rows, '2026-09-15');
  assert.match(html, /calendar-desktop/); assert.match(html, /calendar calendar-grid/); assert.match(html, /calendar-mobile/);
  assert.match(html, /data-action="schedule-prev"/); assert.match(html, /data-action="lesson-info"/);
  assert.doesNotMatch(html, /attendance|Изменить|Редактировать/);
  assert.equal(parentScheduleStatus(rows[1]), 'Проведено');
  assert.match(html, /badge green">Проведено/); assert.doesNotMatch(html, /badge amber">Перенесено/);
});

test('parent role has no universal CRM or mutation permissions', () => {
  assert.deepEqual([...permissions.parent].sort(), ['own-attendance:read', 'own-children:read', 'own-payments:read']);
  for (const permission of ['children:read', 'children:write', 'lessons:read', 'payments:write', 'salary:read', '*']) assert.equal(permissions.parent.has(permission), false);
});

function adminFixture() {
  const state = {
    users: [], guardians: [{ id: 5, user_id: null, full_name: 'Мама', phone: null, email: null }],
    children: [{ id: 10, full_name: 'Петя', project_id: 2 }, { id: 11, full_name: 'Маша', project_id: 3 }],
    links: [{ child_id: 10, guardian_id: 5, is_primary: 1 }], sessions: [], nextUserId: 50,
  };
  async function query(sql, params = {}) {
    if (sql.startsWith('SELECT c.id,c.full_name FROM children')) return [state.children.filter((child) => String(child.id) === String(params.childId)
      && (params.projectId == null || (child.project_ids ?? [child.project_id]).some((id) => String(id) === String(params.projectId))))];
    if (sql.includes('SELECT cg.guardian_id FROM child_guardians cg JOIN child_enrollments')) {
      const allowed = state.links.some((link) => String(link.guardian_id) === String(params.guardianId)
        && (params.childId == null || String(link.child_id) === String(params.childId))
        && state.children.some((child) => child.id === link.child_id && (child.project_ids ?? [child.project_id]).some((id) => String(id) === String(params.projectId))));
      return [[allowed ? { guardian_id: params.guardianId } : undefined].filter(Boolean)];
    }
    if (sql.startsWith('SELECT 1 FROM child_guardians cg JOIN child_enrollments e')) {
      const foreign = state.links.some((link) => String(link.guardian_id) === String(params.guardianId)
        && state.children.some((child) => child.id === link.child_id && String(child.project_id) !== String(params.projectId)));
      return [[foreign ? { 1: 1 } : undefined].filter(Boolean)];
    }
    if (sql.startsWith('SELECT id FROM users WHERE LOWER(email)')) return [state.users.filter((user) => user.email.toLowerCase() === params.login.toLowerCase()).map(({ id }) => ({ id }))];
    if (sql.startsWith('INSERT INTO users')) { const user = { id: state.nextUserId++, email: params.login, password_hash: params.passwordHash, display_name: params.displayName, status: 'active', token_version: 1 }; state.users.push(user); return [{ insertId: user.id }]; }
    if (sql === "SELECT id FROM roles WHERE code='parent' LIMIT 1") return [[{ id: 4 }]];
    if (sql.startsWith('INSERT INTO user_roles')) return [{ affectedRows: 1 }];
    if (sql.includes('WHERE cg.child_id=:childId AND cg.is_primary=TRUE')) {
      const link = state.links.find((item) => String(item.child_id) === String(params.childId) && item.is_primary);
      const guardian = link && state.guardians.find((item) => item.id === link.guardian_id);
      return [[guardian ? { id: guardian.id, user_id: guardian.user_id, full_name: guardian.full_name } : undefined].filter(Boolean)];
    }
    if (sql.startsWith('UPDATE guardians SET user_id=')) { const guardian = state.guardians.find((item) => String(item.id) === String(params.guardianId)); guardian.user_id = Number(params.userId); guardian.full_name = params.name ?? guardian.full_name; return [{ affectedRows: 1 }]; }
    if (sql.startsWith('INSERT INTO guardians')) { const row = { id: state.guardians.length + 10, user_id: Number(params.userId), full_name: params.name }; state.guardians.push(row); return [{ insertId: row.id }]; }
    if (sql.startsWith('INSERT INTO child_guardians')) { state.links.push({ child_id: Number(params.childId), guardian_id: Number(params.guardianId), is_primary: Number(params.isPrimary) }); return [{ affectedRows: 1 }]; }
    if (sql.startsWith('INSERT IGNORE INTO child_guardians')) {
      const guardian = state.guardians.find((item) => String(item.id) === String(params.guardianId) && item.user_id != null);
      const child = state.children.find((item) => String(item.id) === String(params.childId));
      if (!guardian || !child || state.links.some((item) => String(item.child_id) === String(params.childId) && String(item.guardian_id) === String(params.guardianId))) return [{ affectedRows: 0 }];
      state.links.push({ child_id: Number(params.childId), guardian_id: Number(params.guardianId), is_primary: state.links.some((item) => String(item.child_id) === String(params.childId)) ? 0 : 1 }); return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('SELECT 1 FROM child_guardians')) return [state.links.filter((item) => String(item.child_id) === String(params.childId) && String(item.guardian_id) === String(params.guardianId)).map(() => ({ 1: 1 }))];
    if (sql.startsWith('SELECT is_primary FROM child_guardians')) return [state.links.filter((item) => String(item.child_id) === String(params.childId) && String(item.guardian_id) === String(params.guardianId)).map((item) => ({ is_primary: item.is_primary }))];
    if (sql.startsWith('DELETE FROM child_guardians')) { const before = state.links.length; state.links = state.links.filter((item) => !(String(item.child_id) === String(params.childId) && String(item.guardian_id) === String(params.guardianId))); return [{ affectedRows: before - state.links.length }]; }
    if (sql.startsWith('UPDATE child_guardians SET is_primary=')) { const link = state.links.filter((item) => String(item.child_id) === String(params.childId)).sort((a, b) => a.guardian_id - b.guardian_id)[0]; if (link) link.is_primary = 1; return [{ affectedRows: link ? 1 : 0 }]; }
    if (sql.includes('GROUP_CONCAT') && sql.includes('WHERE cg.child_id=')) {
      return [state.links.filter((link) => String(link.child_id) === String(params.childId)).map((link) => {
        const guardian = state.guardians.find((item) => item.id === link.guardian_id); const user = state.users.find((item) => item.id === guardian.user_id);
        const names = state.links.filter((item) => item.guardian_id === guardian.id).map((item) => state.children.find((child) => child.id === item.child_id).full_name).sort().join(', ');
        return { guardian_id: guardian.id, full_name: guardian.full_name, phone: guardian.phone, email: guardian.email, login: user.email, status: user.status, linked_children: names };
      })];
    }
    if (sql.includes('SELECT g.user_id,u.email FROM guardians')) { const guardian = state.guardians.find((item) => String(item.id) === String(params.guardianId)); const user = guardian && state.users.find((item) => item.id === guardian.user_id); return [[user ? { user_id: user.id, email: user.email } : undefined].filter(Boolean)]; }
    if (sql.startsWith('SELECT user_id FROM guardians')) { const guardian = state.guardians.find((item) => String(item.id) === String(params.guardianId) && item.user_id != null); return [[guardian ? { user_id: guardian.user_id } : undefined].filter(Boolean)]; }
    if (sql.startsWith('UPDATE users SET password_hash=')) { const user = state.users.find((item) => String(item.id) === String(params.userId)); user.password_hash = params.passwordHash; user.status = 'active'; user.token_version += 1; return [{ affectedRows: 1 }]; }
    if (sql.startsWith('UPDATE users SET status=')) { const user = state.users.find((item) => String(item.id) === String(params.userId)); user.status = params.status; user.token_version += 1; return [{ affectedRows: 1 }]; }
    if (sql.startsWith('UPDATE auth_sessions SET revoked_at=')) { state.sessions.filter((item) => String(item.user_id) === String(params.userId)).forEach((item) => { item.revoked_at = new Date(); }); return [{ affectedRows: 1 }]; }
    throw new Error(`Unexpected parent admin SQL: ${sql}`);
  }
  const connection = { query, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {} };
  const pool = { query, getConnection: async () => connection };
  const service = createParentPortal(pool, { createPasswordHash: async (password) => `hash:${password}`,
    makeLogin: () => 'generated@cabinet.test', makePassword: () => 'Random-Password-1' });
  return { state, service };
}

test('director creates one-time credentials, links a second child and reset revokes sessions', async () => {
  const fixture = adminFixture(); const director = { userId: '1', roles: ['director'] };
  const created = await fixture.service.createAccess(10, {}, director);
  assert.deepEqual(created, { guardianId: '5', login: 'generated@cabinet.test', password: 'Random-Password-1' });
  assert.equal(fixture.state.users[0].password_hash, 'hash:Random-Password-1');
  assert.equal(fixture.state.users[0].display_name, 'Мама');
  await fixture.service.linkAccess(11, 5, director);
  const access = await fixture.service.listAccess(11, director);
  assert.deepEqual(access[0].linkedChildren, ['Маша', 'Петя']);
  fixture.state.sessions.push({ user_id: 50, revoked_at: null });
  const reset = await fixture.service.resetPassword(5, director);
  assert.equal(reset.password, 'Random-Password-1'); assert.equal(fixture.state.users[0].token_version, 2); assert.ok(fixture.state.sessions[0].revoked_at);
  fixture.state.sessions.push({ user_id: 50, revoked_at: null });
  assert.deepEqual(await fixture.service.setAccessStatus(5, false, director), { guardianId: '5', status: 'blocked' });
  assert.equal(fixture.state.users[0].status, 'blocked'); assert.ok(fixture.state.sessions[1].revoked_at);
  await fixture.service.unlinkAccess(11, 5, director);
  assert.deepEqual((await fixture.service.listAccess(11, director)), []);
});

function notificationFixture({ disabled = new Set(), balance = '0.00000000' } = {}) {
  const state = { notifications: [], balance };
  async function query(sql, params = {}) {
    assert.doesNotMatch(sql, /gm\.child_id/, 'group_memberships has no child_id column');
    if (sql.includes('FROM child_guardians cg JOIN guardians')) return [disabled.has(params.type) ? [] : [{ user_id: 50, guardian_id: 5, enabled: 1 }]];
    if (sql.startsWith('INSERT IGNORE INTO notifications')) {
      if (state.notifications.some((item) => item.userId === params.userId && item.dedupKey === params.dedupKey)) return [{ affectedRows: 0 }];
      state.notifications.push(params); return [{ affectedRows: 1 }];
    }
    if (sql.includes('SELECT DISTINCT child_id FROM')) return [[{ child_id: 10 }]];
    if (sql.includes('SELECT DISTINCT a.child_id')) return [[{ child_id: 10, enrollment_id: 110, is_trial: 0, balance_lessons: state.balance }]];
    if (sql.includes('SELECT l.id lesson_id,l.starts_at')) return [[{ lesson_id: 70, starts_at: '2026-09-21 13:00:00', child_id: 10, enrollment_id: 110, balance_lessons: state.balance }]];
    throw new Error(`Unexpected notification SQL: ${sql}`);
  }
  const pool = { query };
  return { state, service: createParentNotifications(pool), pool };
}

function lessonOperationFixture({ hasParent = true, disabled = new Set() } = {}) {
  const lesson = {
    id: 70, group_id: 100, direction_id_snapshot: 1, project_id_snapshot: 2, site_id_snapshot: 3,
    site_override_id: null, planned_teacher_id: 5, actual_teacher_id: 5,
    scheduled_starts_at: '2026-09-20 13:00:00', scheduled_ends_at: '2026-09-20 14:00:00',
    starts_at: '2026-09-20 13:00:00', ends_at: '2026-09-20 14:00:00', status: 'scheduled', deleted_at: null,
    topic: null, is_intro_group: 0, is_empty_trip: 0, roster_frozen_at: null, attendance_applied_at: null,
    completed_at: null, cancelled_at: null, lock_version: 1,
  };
  const state = { lesson, notifications: [] };
  async function query(sql, params = {}) {
    assert.doesNotMatch(sql, /gm\.child_id/, 'group_memberships has no child_id column');
    if (sql === 'SELECT * FROM lessons WHERE id=:id FOR UPDATE') return [[{ ...lesson }]];
    if (sql.includes('FROM teachers t JOIN teacher_projects tp')) return [[{ id: params.id }]];
    if (sql.startsWith('UPDATE lessons SET starts_at=')) {
      lesson.starts_at = `${params.date} ${params.start}:00`; lesson.ends_at = `${params.date} ${params.end}:00`;
      lesson.actual_teacher_id = params.teacherId; return [{ affectedRows: 1 }];
    }
    if (sql.startsWith("UPDATE lessons SET status='cancelled'")) { lesson.status = 'cancelled'; lesson.cancelled_at = '2026-09-20 12:00:00'; return [{ affectedRows: 1 }]; }
    if (sql.startsWith('SELECT * FROM salary_accruals WHERE lesson_id=')) return [[]];
    if (sql.includes('SELECT DISTINCT child_id FROM')) {
      assert.match(sql, /SELECT e\.child_id FROM group_memberships gm JOIN child_enrollments e ON e\.id=gm\.enrollment_id/);
      return [[{ child_id: 10 }]];
    }
    if (sql.includes('FROM child_guardians cg JOIN guardians')) return [hasParent && !disabled.has(params.type) ? [{ user_id: 50, guardian_id: 5, enabled: 1 }] : []];
    if (sql.startsWith('INSERT IGNORE INTO notifications')) {
      if (state.notifications.some((item) => item.dedupKey === params.dedupKey && item.userId === params.userId)) return [{ affectedRows: 0 }];
      state.notifications.push(params); return [{ affectedRows: 1 }];
    }
    if (sql.includes('FROM lessons l JOIN study_groups')) return [[{ ...lesson, group_name: 'Группа 1', direction_name: 'Робототехника', project_name: 'iCubeRobots', site_name: 'Площадка', site_override_name: null, planned_teacher_name: 'Учитель', actual_teacher_name: 'Учитель' }]];
    if (sql.includes('FROM lesson_roster_members') || sql.includes('FROM attendances WHERE lesson_id IN') || sql.includes('FROM salary_accruals sa WHERE sa.lesson_id IN')) return [[]];
    throw new Error(`Unexpected lesson operation SQL: ${sql}`);
  }
  const connection = { query, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {} };
  const pool = { query, getConnection: async () => connection };
  const notifications = createParentNotifications(pool);
  return { state, service: createMysqlLessons(pool, { parentNotifications: notifications }) };
}

test('parent notifications respect settings, destinations and deduplicate event triggers', async () => {
  const fixture = notificationFixture({ disabled: new Set(['lesson_finished']) });
  const lesson = { id: 70, group_id: 100, starts_at: new Date('2026-09-21T13:00:00Z') };
  await fixture.service.lessonMoved(fixture.pool, lesson, new Date('2026-09-20T13:00:00Z'));
  await fixture.service.lessonMoved(fixture.pool, lesson, new Date('2026-09-20T13:00:00Z'));
  await fixture.service.lessonCancelled(fixture.pool, lesson);
  await fixture.service.lessonFinished(fixture.pool, lesson);
  assert.equal(fixture.state.notifications.filter((item) => item.type === 'lesson_move').length, 1);
  assert.equal(fixture.state.notifications.find((item) => item.type === 'lesson_move').destination, 'schedule');
  assert.match(fixture.state.notifications.find((item) => item.type === 'lesson_move').body, /перенесено на 21\.09\.2026, 13:00/);
  assert.equal(fixture.state.notifications.filter((item) => item.type === 'lesson_finished').length, 0);
  assert.equal(fixture.state.notifications.filter((item) => item.type === 'last_paid_lesson').length, 1);
  assert.equal(fixture.state.notifications.find((item) => item.type === 'last_paid_lesson').destination, 'payments');
});

test('lesson move and cancellation complete and notify the linked parent', async () => {
  const fixture = lessonOperationFixture();
  const moved = await fixture.service.update(70, { date: '2026-09-21' }, { roles: ['director'] });
  assert.equal(moved.startsAt.slice(0, 10), '2026-09-21');
  const cancelled = await fixture.service.cancel(70, { roles: ['director'] });
  assert.equal(cancelled.status, 'cancelled');
  assert.deepEqual(fixture.state.notifications.map((item) => item.type), ['lesson_move', 'lesson_cancel']);
});

test('missing parent account and disabled notification settings never break lesson operations', async () => {
  const withoutParent = lessonOperationFixture({ hasParent: false });
  await withoutParent.service.update(70, { date: '2026-09-21' }, { roles: ['director'] });
  await withoutParent.service.cancel(70, { roles: ['director'] });
  assert.equal(withoutParent.state.lesson.status, 'cancelled'); assert.deepEqual(withoutParent.state.notifications, []);

  const disabled = lessonOperationFixture({ disabled: new Set(['lesson_move', 'lesson_cancel']) });
  await disabled.service.update(70, { date: '2026-09-21' }, { roles: ['director'] });
  await disabled.service.cancel(70, { roles: ['director'] });
  assert.equal(disabled.state.lesson.status, 'cancelled'); assert.deepEqual(disabled.state.notifications, []);
});

test('day-before scheduler creates reminder and zero-balance payment reminder only once', async () => {
  const fixture = notificationFixture();
  const first = await fixture.service.generateDayBefore('2026-09-21'); const second = await fixture.service.generateDayBefore('2026-09-21');
  assert.equal(first.created, 2); assert.equal(second.created, 0);
  assert.deepEqual(fixture.state.notifications.map((item) => [item.type, item.destination]), [
    ['reminder_day_before', 'schedule'], ['payment_reminder', 'payments'],
  ]);
  const paid = notificationFixture({ balance: '1.00000000' }); await paid.service.generateDayBefore('2026-09-21');
  assert.deepEqual(paid.state.notifications.map((item) => item.type), ['reminder_day_before']);
  const debt = notificationFixture({ balance: '-1.00000000' }); await debt.service.generateDayBefore('2026-09-21');
  assert.deepEqual(debt.state.notifications.map((item) => item.type), ['reminder_day_before', 'payment_reminder']);
});

test('parent notification SQL only references columns present in the real group_memberships schema', async () => {
  const [schema, source] = await Promise.all([
    readFile(new URL('../database/migrations/001_initial.sql', import.meta.url), 'utf8'),
    readFile(new URL('../backend/src/parent-notifications.mjs', import.meta.url), 'utf8'),
  ]);
  const table = schema.match(/CREATE TABLE group_memberships \(([\s\S]*?)\n\) ENGINE=/)?.[1] ?? '';
  const columns = new Set([...table.matchAll(/^\s{2}([a-z_][a-z0-9_]*)\s+[A-Z]/gm)].map((match) => match[1]));
  assert.ok(columns.has('enrollment_id')); assert.equal(columns.has('child_id'), false);
  for (const match of source.matchAll(/gm\.([a-z_][a-z0-9_]*)/g)) assert.ok(columns.has(match[1]), `Unknown group_memberships column: ${match[1]}`);
  assert.doesNotMatch(source, /gm\.child_id/);
});

test('parent migration and UI keep many-to-many links, deduplication and mobile-only read model', async () => {
  const [migration, portal, parentBackend, index, lessons] = await Promise.all([
    readFile(new URL('../database/migrations/016_parent_portal.sql', import.meta.url), 'utf8'),
    readFile(new URL('../src/frontend/parent-portal.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../backend/src/parent-portal.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../backend/src/lessons.mjs', import.meta.url), 'utf8'),
  ]);
  assert.match(migration, /UNIQUE KEY uq_notifications_user_dedup/);
  assert.match(migration, /document_type.*document_version/s);
  assert.match(migration, /ON DELETE SET NULL/);
  assert.doesNotMatch(migration, /DROP DATABASE|DROP TABLE|TRUNCATE/i);
  assert.match(portal, /\/parent\/children\/\$\{childId\}/);
  assert.doesNotMatch(portal, /Предстоит/);
  assert.match(portal, /data-action="notification-setting"/);
  assert.match(portal, /version !== state\.loadVersion/);
  assert.match(parentBackend, /a\.present=TRUE/);
  assert.match(parentBackend, /ph\.deleted_at IS NULL AND ph\.purged_at IS NULL AND ph\.expires_at>NOW\(6\)/);
  assert.ok(index.indexOf('parent-portal.mjs') < index.indexOf('api-sync.mjs'));
  assert.match(lessons, /parentNotifications\.lessonMoved/);
  assert.match(lessons, /parentNotifications\.lessonCancelled/);
  assert.match(lessons, /parentNotifications\.lessonFinished/);
});

test('daily notification scheduler uses project timezone and a persistent 19:00 timer', async () => {
  assert.equal(localDate(new Date('2026-09-20T10:30:00Z'), 'Asia/Sakhalin'), '2026-09-20');
  assert.equal(localDate(new Date('2026-09-20T13:30:00Z'), 'Asia/Sakhalin'), '2026-09-21');
  assert.equal(nextDate('2026-09-30'), '2026-10-01');
  const [service, timer] = await Promise.all([
    readFile(new URL('../deploy/icube-crm-parent-notifications.service', import.meta.url), 'utf8'),
    readFile(new URL('../deploy/icube-crm-parent-notifications.timer', import.meta.url), 'utf8'),
  ]);
  assert.match(service, /Type=oneshot/); assert.match(service, /npm run parent-notifications:daily/);
  assert.match(timer, /OnCalendar=\*-\*-\* 19:00:00 Asia\/Sakhalin/); assert.match(timer, /Persistent=true/);
});

test('parent balance wording preserves fractional values and required color states', () => {
  assert.deepEqual(parentBalancePresentation('4.00000000'), { tone: 'success', text: 'Осталось 4 оплаченных занятия' });
  assert.deepEqual(parentBalancePresentation('2.50000000'), { tone: 'success', text: 'Осталось 2,5 оплаченных занятия' });
  assert.deepEqual(parentBalancePresentation('1.00000000'), { tone: 'warning', text: 'Осталось 1 оплаченное занятие' });
  assert.deepEqual(parentBalancePresentation('0.00000000'), { tone: 'danger', text: 'Оплаченные занятия закончились' });
  assert.deepEqual(parentBalancePresentation('-2.00000000'), { tone: 'danger', text: 'Задолженность: 2 занятия' });
});

test('parent can edit only child birth date, school and grade', async () => {
  const fixture = portalFixture(); fixture.state.documents.forEach((item) => fixture.state.accepted.add(item.id));
  const before = await fixture.service.about(10, parent);
  assert.deepEqual(before.child, { id: '10', name: 'Петя', birthDate: '2018-01-02', school: 'Школа 1', grade: '2Б' });
  const updated = await fixture.service.updateAbout(10, { birthDate: '2018-02-03', school: 'Школа 2', grade: '3А' }, parent);
  assert.deepEqual(updated.child, { id: '10', name: 'Петя', birthDate: '2018-02-03', school: 'Школа 2', grade: '3А' });
  await assert.rejects(fixture.service.updateAbout(10, { name: 'Другое имя' }, parent), { status: 400, code: 'FORBIDDEN_FIELDS' });
  assert.equal(ageFromBirthDate('2018-09-22', '2026-09-21'), 7);
  assert.equal(ageFromBirthDate('2018-09-21', '2026-09-21'), 8);
});

test('absence notice can be set and cancelled only for own future lesson without financial writes', async () => {
  const fixture = portalFixture(); fixture.state.documents.forEach((item) => fixture.state.accepted.add(item.id));
  let schedule = await fixture.service.schedule(10, { from: '2026-09-20', to: '2026-10-01' }, parent);
  assert.equal(schedule[0].absenceNotice, false);
  assert.deepEqual(await fixture.service.setAbsenceNotice(10, 70, parent), { lessonId: '70', childId: '10', active: true });
  assert.equal(fixture.state.notices.has('70:10'), true);
  schedule = await fixture.service.schedule(10, { from: '2026-09-20', to: '2026-10-01' }, parent);
  assert.equal(schedule[0].absenceNotice, true);
  assert.deepEqual(await fixture.service.cancelAbsenceNotice(10, 70, parent), { lessonId: '70', childId: '10', active: false });
  assert.equal(fixture.state.notices.has('70:10'), false);
  schedule = await fixture.service.schedule(10, { from: '2026-09-20', to: '2026-10-01' }, parent);
  assert.equal(schedule[0].absenceNotice, false);
  await assert.rejects(fixture.service.setAbsenceNotice(12, 70, parent), { status: 404, code: 'CHILD_NOT_FOUND' });
  await assert.rejects(fixture.service.setAbsenceNotice(10, 72, parent), { status: 409, code: 'ABSENCE_NOTICE_CLOSED' });
  const mutationSql = fixture.state.sql.filter((sql) => /INSERT INTO lesson_child_absence|UPDATE lesson_child_absence/.test(sql)).join('\n');
  assert.doesNotMatch(mutationSql, /attendances|balance_|salary_/i);
});

test('parent lesson status uses fact after completion and notice only before completion', () => {
  assert.equal(parentScheduleStatus({ status: 'scheduled', absenceNotice: false }), '');
  assert.equal(parentScheduleStatus({ status: 'scheduled', absenceNotice: true }), 'Ребёнка не будет');
  assert.equal(parentScheduleStatus({ status: 'completed', absenceNotice: true, present: true }), 'Проведено');
  assert.equal(parentScheduleStatus({ status: 'completed', absenceNotice: true, present: false }), 'Отсутствовал');
  assert.equal(parentScheduleStatus({ status: 'completed', absenceNotice: false, present: false }), 'Отсутствовал');
  assert.equal(parentScheduleStatus({ status: 'cancelled', absenceNotice: true, present: true }), 'Отменено');
  assert.deepEqual(parentAbsenceAction({ canChangeAbsence: true, absenceNotice: false }), { action: 'absence-set', label: 'Ребёнка не будет', className: 'parent-primary' });
  assert.deepEqual(parentAbsenceAction({ canChangeAbsence: true, absenceNotice: true }), { action: 'absence-cancel', label: 'Отменить отметку', className: 'parent-secondary' });
  assert.equal(parentAbsenceAction({ canChangeAbsence: false, absenceNotice: true }), null);
});

test('parent schedule converts SQL string booleans strictly and joins only active notices', async () => {
  const fixture = portalFixture(); fixture.state.documents.forEach((item) => fixture.state.accepted.add(item.id));
  const rows = await fixture.service.schedule(10, { from: '2026-09-20', to: '2026-10-01' }, parent);
  assert.equal(rows[0].absenceNotice, false); assert.equal(rows[0].canChangeAbsence, true);
  assert.equal(rows[2].absenceNotice, false); assert.equal(rows[2].present, false); assert.equal(rows[2].canChangeAbsence, false);
  assert.equal(rows[3].absenceNotice, true); assert.equal(rows[3].present, true);
  assert.equal(rows[4].present, false); assert.equal(parentScheduleStatus(rows[4]), 'Отсутствовал');
  const source = await readFile(new URL('../backend/src/parent-portal.mjs', import.meta.url), 'utf8');
  assert.match(source, /LEFT JOIN lesson_child_absence_notices an ON an\.lesson_id=l\.id AND an\.child_id=\? AND an\.cancelled_at IS NULL/);
  assert.doesNotMatch(source, /absenceNotice: Boolean\(row\.absence_notice\)/);
});

test('mixed-project child badge keeps iCube blue and uses existing purple badge for Zebra', async () => {
  const source = await readFile(new URL('../src/frontend/crm-ui.js', import.meta.url), 'utf8');
  const overview = source.slice(source.lastIndexOf('function childOverviewV118'), source.indexOf('const payments=', source.lastIndexOf('function childOverviewV118')));
  assert.match(overview, /e\.editable===false\?'gray':e\.project==='Зебра'\?'purple':'blue'/);
  assert.match(source, /badge \$\{p==='Зебра'\?'purple':'blue'\}/);
});

test('parent home next lesson renders absence quick actions from existing parentAbsenceAction rules', () => {
  const base = { child: { name: 'Петя' }, enrollments: [], latestPhoto: null };
  const open = parentHomeHtml({ ...base, nextLesson: { id: '70', startsAt: '2026-09-22T17:00:00', endsAt: '2026-09-22T18:00:00', site: 'Площадка', canChangeAbsence: true, absenceNotice: false } });
  assert.match(open, /data-action="home-next-lesson" data-lesson="70"/);
  assert.match(open, /data-action="absence-set" data-lesson="70" data-origin="home">Ребёнка не будет<\/button>/);
  assert.doesNotMatch(open, /Отменить отметку/);

  const marked = parentHomeHtml({ ...base, nextLesson: { id: '70', startsAt: '2026-09-22T17:00:00', endsAt: '2026-09-22T18:00:00', site: 'Площадка', canChangeAbsence: true, absenceNotice: true } });
  assert.match(marked, /parent-next-absence-status">Ребёнка не будет<\/span>/);
  assert.match(marked, /data-action="absence-cancel" data-lesson="70" data-origin="home">Отменить отметку<\/button>/);

  const closed = parentHomeHtml({ ...base, nextLesson: { id: '70', startsAt: '2026-09-22T17:00:00', endsAt: '2026-09-22T18:00:00', site: 'Площадка', canChangeAbsence: false, absenceNotice: true } });
  assert.doesNotMatch(closed, /absence-set|absence-cancel|parent-next-absence-status/);
});

test('parent home DTO exposes existing absence state for next lesson', async () => {
  const fixture = portalFixture(); fixture.state.documents.forEach((item) => fixture.state.accepted.add(item.id));
  let home = await fixture.service.home(10, parent);
  assert.equal(home.nextLesson.id, '70');
  assert.equal(home.nextLesson.absenceNotice, false);
  assert.equal(home.nextLesson.canChangeAbsence, true);
  await fixture.service.setAbsenceNotice(10, 70, parent);
  home = await fixture.service.home(10, parent);
  assert.equal(home.nextLesson.absenceNotice, true);
});

test('parent next-lesson click loads schedule then opens exact lesson and quick actions reuse existing absence endpoint', async () => {
  const source = await readFile(new URL('../src/frontend/parent-portal.mjs', import.meta.url), 'utf8');
  assert.match(source, /action === 'home-next-lesson'[\s\S]*state\.tab = 'schedule'[\s\S]*state\.scheduleCursor = String\(target\.dataset\.starts[\s\S]*await loadTab\(\); state\.lessonInfo = \(state\.data \?\? \[\]\)\.find\(\(lesson\) => String\(lesson\.id\) === lessonId\)/);
  assert.match(source, /action === 'absence-set' \|\| action === 'absence-cancel'[\s\S]*event\.stopPropagation\(\)[\s\S]*method = action === 'absence-set' \? 'PUT' : 'DELETE'[\s\S]*\/parent\/children\/\$\{state\.childId\}\/lessons\/\$\{lessonId\}\/absence-notice/);
  assert.equal((source.match(/absence-notice/g) ?? []).length >= 1, true);
  assert.doesNotMatch(source, /home-absence|quick-absence|absence-notice\/home/);
});

test('home payment action appears only for zero or debt balance with a subscription price', () => {
  const base = { child: { name: 'Петя' }, nextLesson: null, latestPhoto: null };
  const html = parentHomeHtml({ ...base, enrollments: [
    { direction: 'Робототехника', balanceLessons: '1.00000000', subscriptionPrice: '4100.00' },
    { direction: 'Программирование', balanceLessons: '0.00000000', subscriptionPrice: '4500.00' },
    { direction: 'Индивидуально', balanceLessons: '-1.50000000', subscriptionPrice: '2900.00' },
    { direction: 'Без цены', balanceLessons: '-1.00000000', subscriptionPrice: null },
  ] });
  assert.equal((html.match(/data-action="pay"/g) ?? []).length, 2);
  assert.match(html, /data-amount="4500\.00" data-direction="Программирование"/);
  assert.match(html, /data-amount="2900\.00" data-direction="Индивидуально"/);
  assert.match(html, /Фото с последнего занятия/);
});

test('parent photo section explains 30-day retention and shows group expiry from existing expiresAt data', async () => {
  const [portal, backend] = await Promise.all([
    readFile(new URL('../src/frontend/parent-portal.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../backend/src/parent-portal.mjs', import.meta.url), 'utf8'),
  ]);
  assert.match(portal, /Фотографии хранятся 30 дней\. Чтобы сохранить понравившееся фото, откройте его и нажмите «Скачать»\./);
  assert.doesNotMatch(portal, /Фотографии доступны ограниченное время/);
  assert.match(portal, /photos\.map\(\(photo\) => photo\.expiresAt\)\.filter\(Boolean\)\.sort\(\)\[0\]/);
  assert.match(portal, /фото доступны до \$\{dateRu\(expiresAt\)\}/);
  assert.match(backend, /expiresAt: isoDateTime\(row\.expires_at\)/);
});

test('parent photo viewer centers close control and downloads the current photo without changing arrows', async () => {
  const [portal, css] = await Promise.all([
    readFile(new URL('../src/frontend/parent-portal.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui/parent-portal.css', import.meta.url), 'utf8'),
  ]);
  assert.match(portal, /data-action="viewer-close" aria-label="Закрыть"><\/button><button data-action="viewer-prev"/);
  assert.doesNotMatch(portal, /data-action="viewer-close" aria-label="Закрыть">×<\/button>/);
  assert.match(portal, /<button data-action="viewer-next" aria-label="Следующее">→<\/button>/);
  assert.match(portal, /class="parent-viewer-download" href="\$\{escapeHtml\(photo\.fileUrl\)\}" download="icube-photo-\$\{escapeHtml\(photo\.id\)\}\.jpg" data-action="viewer-download">Скачать<\/a>/);
  assert.match(portal, /action === 'viewer-download'\) event\.stopPropagation\(\)/);
  assert.match(css, /\.parent-viewer>button:first-child::before,\.parent-viewer>button:first-child::after\{[^}]*position:absolute;[^}]*left:50%;top:50%;[^}]*transform-origin:center/);
  assert.match(css, /\.parent-viewer>button:first-child::before\{transform:translate\(-50%,-50%\) rotate\(45deg\)\}/);
  assert.match(css, /\.parent-viewer>button:first-child::after\{transform:translate\(-50%,-50%\) rotate\(-45deg\)\}/);
  assert.match(css, /\.parent-viewer-download\{/);
});

test('latest parent photo uses the first upload from the latest photographed lesson', async () => {
  const source = await readFile(new URL('../backend/src/parent-portal.mjs', import.meta.url), 'utf8');
  assert.match(source, /ORDER BY l\.starts_at DESC,l\.id DESC,ph\.uploaded_at,ph\.id LIMIT 1/);
  assert.match(source, /ph\.deleted_at IS NULL AND ph\.purged_at IS NULL/);
});

test('parent UI moves price and child data to their sections and removes email and bottom tabbar', async () => {
  const [portal, css, access] = await Promise.all([
    readFile(new URL('../src/frontend/parent-portal.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui/parent-portal.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/frontend/parent-access.mjs', import.meta.url), 'utf8'),
  ]);
  const home = portal.slice(portal.indexOf('function parentHomeHtml'), portal.indexOf('function scheduleEventHtml'));
  const payments = portal.slice(portal.indexOf('function paymentsHtml'), portal.indexOf('function aboutHtml'));
  assert.doesNotMatch(home, /Стоимость абонемента|Здравствуйте/);
  assert.match(payments, /Текущая стоимость абонемента/);
  assert.match(portal, /О ребёнке/); assert.match(portal, /data-action="child-about"/);
  assert.doesNotMatch(portal, /name="email"/);
  assert.match(portal, /Написать в MAX/); assert.match(portal, /Позвонить: \$\{escapeHtml\(contact\.phone\)\}/);
  assert.match(css, /\.parent-sidebar/); assert.match(css, /\.parent-menu-button/); assert.match(css, /\.parent-nav\{display:none!important\}/);
  assert.match(css, /\.parent-next-open\{[^}]*cursor:pointer/); assert.match(css, /\.parent-next-actions/);
  const contactButtonCss = css.match(/\.parent-actions a\.parent-contact-button\{([^}]*)\}/)?.[1] ?? '';
  assert.match(contactButtonCss, /background:#fff/); assert.match(contactButtonCss, /border:1px solid #175cd3/);
  assert.match(contactButtonCss, /color:#175cd3!important/); assert.match(contactButtonCss, /-webkit-text-fill-color:#175cd3/);
  assert.match(css, /\.parent-actions a\.parent-contact-button\.primary\{background:#175cd3;color:#fff!important;-webkit-text-fill-color:#fff\}/);
  assert.doesNotMatch(access, /prompt\(/);
  assert.match(access, /отдельный доступ для второго родителя или законного представителя/);
});

test('parent access create and reset share a selectable one-time credentials dialog', async () => {
  const [access, css] = await Promise.all([
    readFile(new URL('../src/frontend/parent-access.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui/parent-portal.css', import.meta.url), 'utf8'),
  ]);
  assert.equal((access.match(/showCredentials\(credentials, '(?:Родительский доступ создан|Новый пароль)'\)/g) ?? []).length, 2);
  assert.match(access, /navigator\.clipboard\?\.writeText/); assert.match(access, /document\.execCommand\('copy'\)/);
  assert.match(access, /Скопировать логин/); assert.match(access, /Скопировать пароль/); assert.match(access, /Скопировать всё/);
  assert.doesNotMatch(access, /window\.alert\(`(?:Родительский доступ создан|Новый пароль)/);
  assert.doesNotMatch(access, /localStorage|sessionStorage/);
  assert.match(css, /user-select:text/);
});

test('birthday daily generation addresses director and current teacher once per child per day', async () => {
  const notifications = new Set(); let recipientSql = '';
  const pool = { query: async (sql, params = {}) => {
    if (sql.includes('FROM children')) return [[{ id: 10, full_name: 'Петя', birth_date: '2017-09-21' }]];
    if (sql.includes("'director' role_code")) { recipientSql = sql; return [[
      { user_id: 1, role_code: 'director' }, { user_id: 2, role_code: 'teacher' }, { user_id: 2, role_code: 'teacher' },
    ]]; }
    if (sql.startsWith('INSERT IGNORE INTO notifications')) {
      const key = `${params.userId}:${params.dedupKey}`; if (notifications.has(key)) return [{ affectedRows: 0 }];
      notifications.add(key); return [{ affectedRows: 1 }];
    }
    throw new Error(`Unexpected birthday SQL: ${sql}`);
  } };
  const service = createBirthdayNotifications(pool);
  assert.equal(ageOnDate('2017-09-21', '2026-09-21'), 9);
  assert.equal((await service.generate('2026-09-21')).created, 2);
  assert.equal((await service.generate('2026-09-21')).created, 0);
  assert.deepEqual([...notifications].sort(), ['1:child_birthday:2026-09-21:10', '2:child_birthday:2026-09-21:10']);
  assert.match(recipientSql, /teacher_projects[\s\S]*tp\.active=TRUE/);
  assert.match(recipientSql, /teacher_project_directions[\s\S]*tpd\.direction_id=sg\.direction_id/);
});

test('birthday age never becomes NaN and Feb 29 is delivered on Feb 28 in a non-leap year', async () => {
  assert.equal(ageOnDate('bad-date', '2026-02-28'), null);
  const bodies = [];
  const pool = { query: async (sql, params = {}) => {
    if (sql.includes('FROM children')) return [[
      { id: 10, full_name: 'Високосный', birth_date: '2016-02-29' },
      { id: 11, full_name: 'Без даты', birth_date: 'bad-date' },
    ]];
    if (sql.includes("'director' role_code")) return [[{ user_id: 1, role_code: 'director' }]];
    if (sql.startsWith('INSERT IGNORE INTO notifications')) { bodies.push(params.body); return [{ affectedRows: 1 }]; }
    throw new Error(`Unexpected birthday SQL: ${sql}`);
  } };
  const result = await createBirthdayNotifications(pool).generate('2026-02-28');
  assert.equal(result.created, 1); assert.match(bodies[0], /10 лет/); assert.doesNotMatch(bodies.join(' '), /NaN/);
});

test('teacher lesson payload exposes only child marker ids and teacher can read addressed notifications', async () => {
  const [lessons, ui] = await Promise.all([
    readFile(new URL('../backend/src/lessons.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/frontend/crm-ui.js', import.meta.url), 'utf8'),
  ]);
  assert.match(lessons, /absenceNoticeChildIds: jsonIds/); assert.match(lessons, /birthdayChildIds: jsonIds/);
  assert.match(lessons, /WHERE an\.lesson_id=l\.id AND an\.cancelled_at IS NULL/);
  assert.match(ui, />Не будет<\/span>/); assert.match(ui, /🎂 День рождения/);
  assert.match(ui, /n\.type==='child_birthday'/);
  assert.equal(permissions.teacher.has('notifications:read'), true);
});

test('partner links only a guardian already available in its own project', async () => {
  const fixture = adminFixture(); const partner = { userId: '9', roles: ['partner'], projectIds: ['2'] };
  await fixture.service.createAccess(10, {}, partner);
  fixture.state.children.push({ id: 12, full_name: 'Второй свой ребёнок', project_id: 2 });
  assert.equal((await fixture.service.linkAccess(12, 5, partner))[0].id, '5');

  fixture.state.users.push({ id: 51, email: 'foreign@test', password_hash: 'x', display_name: 'Чужой', status: 'active', token_version: 1 });
  fixture.state.guardians.push({ id: 6, user_id: 51, full_name: 'Чужой родитель' });
  fixture.state.links.push({ child_id: 11, guardian_id: 6, is_primary: 1 });
  await assert.rejects(fixture.service.linkAccess(10, 6, partner), { status: 403, code: 'FORBIDDEN' });
  await assert.rejects(fixture.service.linkAccess(10, '999', partner), { status: 403, code: 'FORBIDDEN' });
});

test('partner resets and toggles a parent account used only inside its project', async () => {
  const fixture = adminFixture(); const partner = { userId: '9', roles: ['partner'], projectIds: ['2'] };
  await fixture.service.createAccess(10, {}, partner);
  assert.equal((await fixture.service.resetPassword(5, partner, 10)).guardianId, '5');
  assert.equal((await fixture.service.setAccessStatus(5, false, partner, 10)).status, 'blocked');
  assert.equal((await fixture.service.setAccessStatus(5, true, partner, 10)).status, 'active');
});

test('partner manages parent access through an own child while direct child and guardian substitution stay blocked', async () => {
  const fixture = adminFixture(); const partner = { userId: '9', roles: ['partner'], projectIds: ['2'] }; const director = { userId: '1', roles: ['director'] };
  fixture.state.children[0].project_ids = [2, 3];
  await fixture.service.createAccess(10, {}, partner);
  fixture.state.links.push({ child_id: 11, guardian_id: 5, is_primary: 1 });
  assert.equal((await fixture.service.resetPassword(5, partner, 10)).guardianId, '5');
  assert.equal((await fixture.service.setAccessStatus(5, false, partner, 10)).status, 'blocked');
  assert.equal((await fixture.service.setAccessStatus(5, true, partner, 10)).status, 'active');
  await assert.rejects(fixture.service.resetPassword(5, partner, 11), { status: 403, code: 'FORBIDDEN' });
  await assert.rejects(fixture.service.setAccessStatus(5, false, partner, 11), { status: 403, code: 'FORBIDDEN' });
  await assert.rejects(fixture.service.unlinkAccess(11, 5, partner), { status: 403, code: 'FORBIDDEN' });
  fixture.state.users.push({ id: 51, email: 'foreign@test', password_hash: 'x', display_name: 'Чужой', status: 'active', token_version: 1 });
  fixture.state.guardians.push({ id: 6, user_id: 51, full_name: 'Чужой родитель' });
  fixture.state.links.push({ child_id: 11, guardian_id: 6, is_primary: 0 });
  await assert.rejects(fixture.service.resetPassword(6, partner, 10), { status: 403, code: 'FORBIDDEN' });
  await assert.rejects(fixture.service.setAccessStatus(6, false, partner, 10), { status: 403, code: 'FORBIDDEN' });
  const statusBefore = fixture.state.users[0].status;
  await fixture.service.unlinkAccess(10, 5, partner);
  assert.equal(fixture.state.users[0].status, statusBefore);
  assert.equal((await fixture.service.resetPassword(5, director)).guardianId, '5');
  assert.equal((await fixture.service.setAccessStatus(5, false, director)).status, 'blocked');
  assert.equal((await fixture.service.setAccessStatus(5, true, director)).status, 'active');
});

test('migration 017 keeps absence notices separate from attendance and is non-destructive', async () => {
  const migration = await readFile(new URL('../database/migrations/017_parent_absence_notices.sql', import.meta.url), 'utf8');
  assert.match(migration, /CREATE TABLE lesson_child_absence_notices/);
  assert.match(migration, /UNIQUE KEY uq_lesson_child_absence_notice \(lesson_id, child_id\)/);
  assert.match(migration, /cancelled_at DATETIME\(6\)/);
  assert.doesNotMatch(migration, /DROP|TRUNCATE|attendances/i);
});

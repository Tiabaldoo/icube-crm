import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createParentPortal } from '../backend/src/parent-portal.mjs';
import { createParentNotifications } from '../backend/src/parent-notifications.mjs';
import { createMysqlLessons } from '../backend/src/lessons.mjs';
import { permissions } from '../backend/src/auth.mjs';
import { parentScheduleCalendar, parentScheduleStatus } from '../src/frontend/parent-portal.mjs';
import { localDate, nextDate } from '../scripts/generate-parent-notifications.mjs';

const parent = { userId: '50', roles: ['parent'] };

function portalFixture() {
  const state = {
    accepted: new Set(), materialized: [],
    documents: [
      { id: 1, document_type: 'privacy_policy', document_version: 'v1', title: 'Privacy', body: 'Text', is_required: 1 },
      { id: 2, document_type: 'personal_data_parent', document_version: 'v1', title: 'Parent', body: 'Text', is_required: 1 },
      { id: 3, document_type: 'personal_data_child_legal_representative', document_version: 'v1', title: 'Child', body: 'Text', is_required: 1 },
    ],
    children: [
      { id: 10, full_name: 'Петя', birth_date: '2018-01-02', status: 'active', group: 100, balance: '4.00000000' },
      { id: 11, full_name: 'Маша', birth_date: '2019-03-04', status: 'active', group: 101, balance: '1.50000000' },
      { id: 12, full_name: 'Чужой ребёнок', birth_date: '2018-05-06', status: 'active', group: 102, balance: '9.00000000' },
    ],
  };
  const linked = new Set([10, 11]);
  async function query(sql, params = {}) {
    if (sql.includes('FROM guardians g JOIN users u') && sql.includes('WHERE g.user_id=')) return [[{ id: 5, user_id: 50, full_name: 'Родитель', phone: null, email: null, login: 'parent@example.test', status: 'active' }]];
    if (sql.includes('FROM parent_documents d LEFT JOIN')) return [state.documents.map((row) => ({ ...row, accepted_at: state.accepted.has(row.id) ? new Date('2026-09-20T00:00:00Z') : null }))];
    if (sql.startsWith('SELECT id FROM parent_documents')) return [state.documents.filter((row) => String(row.id) === String(params.id)).map(({ id }) => ({ id }))];
    if (sql.startsWith('INSERT INTO parent_document_acceptances')) { state.accepted.add(Number(params.documentId)); return [{ affectedRows: 1 }]; }
    if (sql.includes('SELECT c.id,c.full_name,c.birth_date,c.status FROM guardians')) return [state.children.filter((child) => linked.has(child.id))];
    if (sql.includes('SELECT c.id,c.full_name,c.birth_date,c.status,g.id guardian_id')) {
      const child = state.children.find((item) => String(item.id) === String(params.childId) && linked.has(item.id));
      return [[child ? { ...child, guardian_id: 5 } : undefined].filter(Boolean)];
    }
    if (sql.includes('FROM child_enrollments e JOIN directions')) {
      const child = state.children.find((item) => String(item.id) === String(params.childId));
      return [[child ? { id: child.id + 1000, direction_id: 1, balance_lessons: child.balance, status: 'active', direction_name: 'Робототехника',
        group_id: child.group, group_name: `Группа ${child.group}`, weekday: 3, start_time: '17:00:00', end_time: '18:00:00',
        site_name: 'Площадка', teacher_name: 'Учитель', current_price: '1025.00' } : undefined].filter(Boolean)];
    }
    if (sql.includes('FROM lesson_photos ph') && sql.includes('ORDER BY ph.uploaded_at DESC')) return [[]];
    if (sql.includes('FROM lessons l JOIN sites') && sql.includes("l.status='scheduled'")) return [[{ id: 70, starts_at: '2026-09-22 17:00:00', ends_at: '2026-09-22 18:00:00', status: 'scheduled', site_name: 'Площадка' }]];
    if (sql.includes('SELECT l.id,l.group_id,l.scheduled_starts_at')) return [[
      { id: 70, group_id: 100, scheduled_starts_at: '2026-09-22 17:00:00', starts_at: '2026-09-22 17:00:00', ends_at: '2026-09-22 18:00:00', status: 'scheduled', group_name: 'Группа 100', teacher_name: 'Учитель', site_name: 'Площадка' },
      { id: 71, group_id: 100, scheduled_starts_at: '2026-09-23 17:00:00', starts_at: '2026-09-24 18:00:00', ends_at: '2026-09-24 19:00:00', status: 'scheduled', group_name: 'Группа 100', teacher_name: 'Учитель', site_name: 'Площадка' },
      { id: 72, group_id: 100, scheduled_starts_at: '2026-09-25 17:00:00', starts_at: '2026-09-25 17:00:00', ends_at: '2026-09-25 18:00:00', status: 'cancelled', group_name: 'Группа 100', teacher_name: 'Учитель', site_name: 'Площадка' },
      { id: 73, group_id: 100, scheduled_starts_at: '2026-09-26 15:00:00', starts_at: '2026-09-26 17:00:00', ends_at: '2026-09-26 18:00:00', status: 'completed', group_name: 'Группа 100', teacher_name: 'Учитель', site_name: 'Площадка' },
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
  const pool = { query };
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
    { id: '71', startsAt: '2026-09-24T18:00:00', endsAt: '2026-09-24T19:00:00', status: 'completed', moved: true, group: 'Группа 1', site: 'Площадка', teacher: 'Учитель' },
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
    children: [{ id: 10, full_name: 'Петя' }, { id: 11, full_name: 'Маша' }],
    links: [{ child_id: 10, guardian_id: 5, is_primary: 1 }], sessions: [], nextUserId: 50,
  };
  async function query(sql, params = {}) {
    if (sql.startsWith('SELECT id,full_name FROM children')) return [state.children.filter((child) => String(child.id) === String(params.childId))];
    if (sql.startsWith('SELECT id FROM users WHERE LOWER(email)')) return [state.users.filter((user) => user.email.toLowerCase() === params.login.toLowerCase()).map(({ id }) => ({ id }))];
    if (sql.startsWith('INSERT INTO users')) { const user = { id: state.nextUserId++, email: params.login, password_hash: params.passwordHash, display_name: params.displayName, status: 'active', token_version: 1 }; state.users.push(user); return [{ insertId: user.id }]; }
    if (sql === "SELECT id FROM roles WHERE code='parent' LIMIT 1") return [[{ id: 4 }]];
    if (sql.startsWith('INSERT INTO user_roles')) return [{ affectedRows: 1 }];
    if (sql.includes('WHERE cg.child_id=:childId AND cg.is_primary=TRUE')) {
      const link = state.links.find((item) => String(item.child_id) === String(params.childId) && item.is_primary);
      const guardian = link && state.guardians.find((item) => item.id === link.guardian_id);
      return [[guardian ? { id: guardian.id, user_id: guardian.user_id } : undefined].filter(Boolean)];
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
  const created = await fixture.service.createAccess(10, { name: 'Мама' }, director);
  assert.deepEqual(created, { guardianId: '5', login: 'generated@cabinet.test', password: 'Random-Password-1' });
  assert.equal(fixture.state.users[0].password_hash, 'hash:Random-Password-1');
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
  assert.match(fixture.state.notifications.find((item) => item.type === 'lesson_move').body, /20\.09\.2026 в 13:00.*21\.09\.2026 в 13:00/);
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

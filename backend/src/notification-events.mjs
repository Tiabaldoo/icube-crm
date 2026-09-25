import { notificationTypeConfig, settingsForRole } from './notification-types.mjs';

const same = (left, right) => String(left ?? '') === String(right ?? '');
const displayDate = (value) => {
  const text = String(value ?? '').slice(0, 10);
  const [year, month, day] = text.split('-');
  return year && month && day ? `${day}.${month}.${year}` : text;
};
const displayTime = (value) => String(value ?? '').slice(11, 16);
const moveTarget = (oldValue, newValue) => String(oldValue ?? '').slice(0, 10) === String(newValue ?? '').slice(0, 10)
  ? displayTime(newValue) : `${displayDate(newValue)}, ${displayTime(newValue)}`;

export function crossedDebtThreshold(before, after) {
  return Number(before) > -2 && Number(after) <= -2;
}

export function createNotificationEvents(pool) {
  async function userSetting(connection, userId, type) {
    const config = notificationTypeConfig(type);
    const [rows] = await connection.query(`SELECT enabled FROM user_notification_settings
      WHERE user_id=:userId AND notification_type=:type`, { userId, type });
    return rows.length ? Boolean(rows[0].enabled) : config.defaultEnabled !== false;
  }

  async function enqueueDeliveries(connection, notificationId, userId) {
    await connection.query(`INSERT IGNORE INTO push_deliveries
      (notification_id,subscription_id,status,next_attempt_at)
      SELECT :notificationId,s.id,'pending',NOW(6) FROM web_push_subscriptions s
      WHERE s.user_id=:userId AND s.disabled_at IS NULL`, { notificationId, userId });
  }

  async function createUser(connection, {
    userId, roleCode = null, projectId = null, childId = null, type, title, body,
    entityType = null, entityId = null, destination = null, dedupKey,
    referenceType = null, referenceId = null, actorUserId = null, respectSettings = true,
  }) {
    if (!userId || (actorUserId != null && same(actorUserId, userId))) return null;
    if (respectSettings && !(await userSetting(connection, userId, type))) return null;
    const [result] = await connection.query(`INSERT IGNORE INTO notifications
      (user_id,role_code,recipient_project_id,child_id,notification_type,title,body,entity_type,entity_id,destination,dedup_key,reference_type,reference_id)
      VALUES (:userId,:roleCode,:projectId,:childId,:type,:title,:body,:entityType,:entityId,:destination,:dedupKey,:referenceType,:referenceId)`, {
      userId, roleCode, projectId, childId, type, title, body, entityType, entityId, destination,
      dedupKey, referenceType, referenceId,
    });
    let notificationId = result.insertId ? String(result.insertId) : null;
    if (!notificationId && dedupKey) {
      const [rows] = await connection.query(`SELECT id FROM notifications
        WHERE user_id=:userId AND dedup_key=:dedupKey LIMIT 1`, { userId, dedupKey });
      notificationId = rows[0]?.id == null ? null : String(rows[0].id);
    }
    if (result.affectedRows && notificationId) await enqueueDeliveries(connection, notificationId, userId);
    return result.affectedRows ? notificationId : null;
  }

  async function roleUsers(connection, role) {
    const [rows] = await connection.query(`SELECT DISTINCT u.id user_id FROM users u
      JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id
      WHERE r.code=:role AND u.status='active' AND u.deleted_at IS NULL`, { role });
    return rows;
  }

  async function partnerUsers(connection, projectId) {
    const [rows] = await connection.query(`SELECT DISTINCT u.id user_id FROM projects p
      JOIN partner_users pu ON pu.partner_id=p.partner_id
      JOIN users u ON u.id=pu.user_id
      JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id AND r.code='partner'
      WHERE p.id=:projectId AND p.active=TRUE AND u.status='active' AND u.deleted_at IS NULL`, { projectId });
    return rows;
  }

  async function teacherUser(connection, teacherId) {
    if (teacherId == null) return null;
    const [rows] = await connection.query(`SELECT u.id user_id FROM teachers t JOIN users u ON u.id=t.user_id
      WHERE t.id=:teacherId AND t.deleted_at IS NULL AND t.active=TRUE
        AND u.status='active' AND u.deleted_at IS NULL LIMIT 1`, { teacherId });
    return rows[0] ?? null;
  }

  async function groupMeta(connection, groupId) {
    const [rows] = await connection.query(`SELECT g.id,g.name,g.project_id,g.default_teacher_id
      FROM study_groups g WHERE g.id=:groupId AND g.deleted_at IS NULL LIMIT 1`, { groupId });
    return rows[0] ?? null;
  }

  async function groupWithChild(connection, groupId, childId) {
    const [rows] = await connection.query(`SELECT g.id,g.name,g.project_id,g.default_teacher_id,c.full_name child_name
      FROM study_groups g JOIN children c ON c.id=:childId
      WHERE g.id=:groupId AND g.deleted_at IS NULL LIMIT 1`, { groupId, childId });
    return rows[0] ?? null;
  }

  async function createForDirectors(connection, payload) {
    let count = 0;
    for (const row of await roleUsers(connection, 'director')) {
      if (await createUser(connection, { ...payload, userId: row.user_id, roleCode: 'director' })) count += 1;
    }
    return count;
  }

  async function createForPartners(connection, projectId, payload) {
    let count = 0;
    for (const row of await partnerUsers(connection, projectId)) {
      if (await createUser(connection, { ...payload, userId: row.user_id, roleCode: 'partner', projectId })) count += 1;
    }
    return count;
  }

  async function lessonMoved(connection, { lesson, previousStartsAt, actorUserId }) {
    const group = await groupMeta(connection, lesson.group_id); if (!group) return 0;
    const target = moveTarget(previousStartsAt, lesson.starts_at);
    let count = 0;
    const teacher = await teacherUser(connection, lesson.actual_teacher_id ?? lesson.planned_teacher_id ?? group.default_teacher_id);
    if (teacher) count += Number(Boolean(await createUser(connection, {
      userId: teacher.user_id, roleCode: 'teacher', projectId: group.project_id, type: 'teacher_lesson_moved',
      title: 'Занятие перенесено', body: `Занятие группы «${group.name}» перенесено на ${target}.`,
      entityType: 'lesson', entityId: lesson.id, destination: 'lesson',
      dedupKey: `teacher:lesson_move:${lesson.id}:${String(lesson.starts_at)}`, actorUserId,
    })));
    count += await createForDirectors(connection, {
      type: 'director_lesson_moved', title: 'Занятие перенесено', body: `Занятие группы «${group.name}» перенесено на ${target}.`,
      entityType: 'lesson', entityId: lesson.id, destination: 'lesson',
      dedupKey: `director:lesson_move:${lesson.id}:${String(lesson.starts_at)}`, actorUserId,
    });
    count += await createForPartners(connection, group.project_id, {
      type: 'partner_lesson_moved', title: 'Занятие перенесено', body: `Занятие группы «${group.name}» перенесено на ${target}.`,
      entityType: 'lesson', entityId: lesson.id, destination: 'lesson',
      dedupKey: `partner:lesson_move:${lesson.id}:${String(lesson.starts_at)}`, actorUserId,
    });
    return count;
  }

  async function lessonCancelled(connection, { lesson, actorUserId }) {
    const group = await groupMeta(connection, lesson.group_id); if (!group) return 0;
    let count = 0;
    const teacher = await teacherUser(connection, lesson.actual_teacher_id ?? lesson.planned_teacher_id ?? group.default_teacher_id);
    if (teacher) count += Number(Boolean(await createUser(connection, {
      userId: teacher.user_id, roleCode: 'teacher', projectId: group.project_id, type: 'teacher_lesson_cancelled',
      title: 'Занятие отменено', body: `Занятие группы «${group.name}» отменено.`,
      entityType: 'lesson', entityId: lesson.id, destination: 'lesson',
      dedupKey: `teacher:lesson_cancel:${lesson.id}`, actorUserId,
    })));
    count += await createForDirectors(connection, {
      type: 'director_lesson_cancelled', title: 'Занятие отменено', body: `Занятие группы «${group.name}» отменено.`,
      entityType: 'lesson', entityId: lesson.id, destination: 'lesson',
      dedupKey: `director:lesson_cancel:${lesson.id}`, actorUserId,
    });
    count += await createForPartners(connection, group.project_id, {
      type: 'partner_lesson_cancelled', title: 'Занятие отменено', body: `Занятие группы «${group.name}» отменено.`,
      entityType: 'lesson', entityId: lesson.id, destination: 'lesson',
      dedupKey: `partner:lesson_cancel:${lesson.id}`, actorUserId,
    });
    return count;
  }

  async function quickChildCreated(connection, { lesson, childId, childName, actorUserId }) {
    const group = await groupMeta(connection, lesson.group_id); if (!group) return 0;
    let count = await createForDirectors(connection, {
      type: 'director_quick_child_created', title: 'Новый ребёнок',
      body: `Преподаватель добавил нового ребёнка: ${childName}.`, entityType: 'child', entityId: childId,
      destination: 'child', dedupKey: `director:quick_child:${childId}`, actorUserId,
    });
    count += await createForPartners(connection, group.project_id, {
      type: 'partner_quick_child_created', title: 'Новый ребёнок',
      body: `Преподаватель добавил нового ребёнка: ${childName}.`, entityType: 'child', entityId: childId,
      destination: 'child', dedupKey: `partner:quick_child:${childId}`, actorUserId,
    });
    return count;
  }

  async function childAddedToGroup(connection, { groupId, childId, actorUserId, causeKey = null }) {
    const group = await groupWithChild(connection, groupId, childId); if (!group) return 0;
    const suffix = causeKey ?? `${groupId}:${childId}`;
    let count = 0;
    const teacher = await teacherUser(connection, group.default_teacher_id);
    if (teacher) count += Number(Boolean(await createUser(connection, {
      userId: teacher.user_id, roleCode: 'teacher', projectId: group.project_id, type: 'teacher_child_added',
      title: 'Новый ребёнок в группе', body: `В группу «${group.name}» добавлен ${group.child_name}.`,
      entityType: 'group', entityId: group.id, destination: 'group',
      dedupKey: `teacher:child_added:${suffix}`, actorUserId,
    })));
    count += await createForDirectors(connection, {
      type: 'director_child_added_group', title: 'Ребёнок добавлен в группу',
      body: `${group.child_name} добавлен в группу «${group.name}».`, entityType: 'group', entityId: group.id,
      destination: 'group', dedupKey: `director:child_added:${suffix}`, actorUserId,
    });
    count += await createForPartners(connection, group.project_id, {
      type: 'partner_child_added_group', title: 'Ребёнок добавлен в группу',
      body: `${group.child_name} добавлен в группу «${group.name}».`, entityType: 'group', entityId: group.id,
      destination: 'group', dedupKey: `partner:child_added:${suffix}`, actorUserId,
    });
    return count;
  }

  async function absenceNotice(connection, { lessonId, childId, actorUserId }) {
    const [rows] = await connection.query(`SELECT l.id,l.project_id_snapshot,l.planned_teacher_id,l.actual_teacher_id,
      g.name group_name,c.full_name child_name FROM lessons l JOIN study_groups g ON g.id=l.group_id
      JOIN children c ON c.id=:childId WHERE l.id=:lessonId AND l.deleted_at IS NULL LIMIT 1`, { lessonId, childId });
    const row = rows[0]; if (!row) return 0;
    const teacher = await teacherUser(connection, row.actual_teacher_id ?? row.planned_teacher_id); if (!teacher) return 0;
    return Number(Boolean(await createUser(connection, {
      userId: teacher.user_id, roleCode: 'teacher', projectId: row.project_id_snapshot, type: 'teacher_absence_notice',
      title: 'Ребёнка сегодня не будет', body: `${row.child_name} не придёт на занятие группы «${row.group_name}».`,
      entityType: 'lesson', entityId: row.id, destination: 'lesson',
      dedupKey: `teacher:absence:${row.id}:${childId}`, actorUserId,
    })));
  }

  async function debtThreshold(connection, { enrollmentId, before, after, causeKey, actorUserId }) {
    if (!crossedDebtThreshold(before, after)) return 0;
    const [rows] = await connection.query(`SELECT e.id,e.child_id,c.full_name FROM child_enrollments e
      JOIN children c ON c.id=e.child_id WHERE e.id=:enrollmentId LIMIT 1`, { enrollmentId });
    const row = rows[0]; if (!row) return 0;
    const debt = Math.max(2, Math.abs(Math.floor(Number(after))));
    return createForDirectors(connection, {
      type: 'director_debt_threshold', title: 'Задолженность по занятиям',
      body: `У ${row.full_name} задолженность ${debt} занятия.`, entityType: 'child', entityId: row.child_id,
      destination: 'child', dedupKey: `director:debt:${enrollmentId}:${causeKey}`, actorUserId,
    });
  }

  async function getSettings(userId, roles = []) {
    const role = roles.includes('director') ? 'director' : roles.includes('partner') ? 'partner' : roles.includes('teacher') ? 'teacher' : null;
    if (!role) return [];
    const definitions = settingsForRole(role);
    const [rows] = await pool.query('SELECT notification_type,enabled FROM user_notification_settings WHERE user_id=:userId', { userId });
    const saved = new Map(rows.map((row) => [row.notification_type, Boolean(row.enabled)]));
    return definitions.map((item) => ({ type: item.type, label: item.label,
      enabled: saved.has(item.type) ? saved.get(item.type) : item.defaultEnabled }));
  }

  async function updateSettings(userId, roles, body) {
    const allowed = new Set((await getSettings(userId, roles)).map((item) => item.type));
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      const error = new Error('Некорректные настройки'); error.status = 400; error.code = 'VALIDATION_ERROR'; throw error;
    }
    for (const [type, enabled] of Object.entries(body)) {
      if (!allowed.has(type) || typeof enabled !== 'boolean') {
        const error = new Error('Некорректная настройка уведомления'); error.status = 400; error.code = 'VALIDATION_ERROR'; throw error;
      }
      await pool.query(`INSERT INTO user_notification_settings (user_id,notification_type,enabled)
        VALUES (:userId,:type,:enabled) ON DUPLICATE KEY UPDATE enabled=VALUES(enabled)`, { userId, type, enabled });
    }
    return getSettings(userId, roles);
  }

  return {
    createUser, enqueueDeliveries, userSetting, roleUsers, partnerUsers, teacherUser,
    lessonMoved, lessonCancelled, quickChildCreated, childAddedToGroup, absenceNotice, debtThreshold,
    getSettings, updateSettings,
  };
}

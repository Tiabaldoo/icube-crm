import { randomBytes } from 'node:crypto';
import { hashPassword } from './auth-service.mjs';
import { ApiProblem } from './catalog.mjs';
import { inTransaction } from './db.mjs';

export const PARENT_NOTIFICATION_TYPES = Object.freeze([
  { type: 'reminder_day_before', label: 'Напомнить о занятии вечером накануне', defaultEnabled: true },
  { type: 'lesson_move', label: 'Перенос занятия', defaultEnabled: true },
  { type: 'lesson_cancel', label: 'Отмена занятия', defaultEnabled: true },
  { type: 'last_paid_lesson', label: 'Последнее оплаченное занятие', defaultEnabled: false },
  { type: 'payment_reminder', label: 'Напомнить об оплате перед следующим занятием', defaultEnabled: true },
  { type: 'lesson_finished', label: 'Занятие завершено', defaultEnabled: false },
]);

const typeMap = new Map(PARENT_NOTIFICATION_TYPES.map((item) => [item.type, item]));
const identifier = (value, field = 'id') => {
  const result = String(value ?? '').trim();
  if (!/^[1-9]\d*$/.test(result)) throw new ApiProblem(400, 'VALIDATION_ERROR', `Некорректное поле ${field}`);
  return result;
};
const nullable = (value, max = 255) => {
  const result = String(value ?? '').trim();
  return result ? result.slice(0, max) : null;
};
const isoDate = (value) => value == null ? null : (value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10));
const isoDateTime = (value) => value == null ? null : (value instanceof Date ? value.toISOString() : `${String(value).slice(0, 10)}T${String(value).slice(11, 19)}Z`);
const moneyCents = (value) => {
  const match = String(value ?? '').trim().match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) throw new Error(`Invalid DECIMAL money value: ${value}`);
  return BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
};
const moneyDecimal = (cents) => `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
const weekdayNames = ['','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье'];
const parentOnly = (context = {}) => {
  if (!(context.roles ?? []).includes('parent') || (context.roles ?? []).some((role) => ['director','partner','teacher'].includes(role))) {
    throw new ApiProblem(403, 'FORBIDDEN', 'Раздел доступен только родителю');
  }
  return identifier(context.userId, 'userId');
};
const adminOnly = (context = {}) => {
  if (!(context.roles ?? []).includes('director')) throw new ApiProblem(403, 'FORBIDDEN', 'Управление родительским доступом доступно директору');
  return identifier(context.userId, 'userId');
};

export function generatedParentLogin(random = randomBytes) {
  return `parent-${random(6).toString('hex')}@cabinet.icube.local`;
}
export function generatedParentPassword(random = randomBytes) {
  return `Ic-${random(9).toString('base64url')}`;
}

export function createParentPortal(pool, {
  createPasswordHash = hashPassword,
  makeLogin = generatedParentLogin,
  makePassword = generatedParentPassword,
  contact = {},
  materializeLessons = async () => {},
} = {}) {
  const timeZone = contact.timeZone ?? 'Asia/Sakhalin';
  const localDate = (date = new Date()) => {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(date).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
  const addDays = (date, days) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
  async function guardianForUser(userId, connection = pool) {
    const [rows] = await connection.query(`SELECT g.id,g.user_id,g.full_name,g.phone,g.email,u.email login,u.status
      FROM guardians g JOIN users u ON u.id=g.user_id WHERE g.user_id=:userId LIMIT 1`, { userId });
    if (!rows.length) throw new ApiProblem(403, 'PARENT_ACCOUNT_MISSING', 'Родительский профиль не настроен');
    return rows[0];
  }

  async function assertChild(context, childId, connection = pool) {
    const userId = parentOnly(context); childId = identifier(childId, 'childId');
    const [rows] = await connection.query(`SELECT c.id,c.full_name,c.birth_date,c.status,g.id guardian_id
      FROM guardians g JOIN child_guardians cg ON cg.guardian_id=g.id
      JOIN children c ON c.id=cg.child_id AND c.deleted_at IS NULL
      WHERE g.user_id=:userId AND c.id=:childId LIMIT 1`, { userId, childId });
    if (!rows.length) throw new ApiProblem(404, 'CHILD_NOT_FOUND', 'Ребёнок недоступен');
    return rows[0];
  }

  async function documents(context = {}) {
    const guardian = await guardianForUser(parentOnly(context));
    const [rows] = await pool.query(`SELECT d.id,d.document_type,d.document_version,d.title,d.body,d.document_url,d.is_required,
      a.accepted_at FROM parent_documents d LEFT JOIN parent_document_acceptances a
        ON a.document_id=d.id AND a.guardian_id=:guardianId
      WHERE d.is_active=TRUE ORDER BY d.id`, { guardianId: guardian.id });
    return rows.map((row) => ({ id: String(row.id), type: row.document_type, version: row.document_version,
      title: row.title, body: row.body, url: row.document_url, required: Boolean(row.is_required), acceptedAt: isoDateTime(row.accepted_at) }));
  }

  async function consentRequired(context = {}) {
    return (await documents(context)).some((document) => document.required && !document.acceptedAt);
  }

  async function assertConsents(context = {}) {
    if (await consentRequired(context)) throw new ApiProblem(403, 'CONSENT_REQUIRED', 'Примите актуальные обязательные документы');
  }

  async function acceptDocument(documentId, context = {}, metadata = {}) {
    const guardian = await guardianForUser(parentOnly(context));
    const [documents] = await pool.query('SELECT id FROM parent_documents WHERE id=:id AND is_active=TRUE', { id: identifier(documentId, 'documentId') });
    if (!documents.length) throw new ApiProblem(404, 'DOCUMENT_NOT_FOUND', 'Документ не найден');
    await pool.query(`INSERT INTO parent_document_acceptances (guardian_id,document_id,ip_address,user_agent)
      VALUES (:guardianId,:documentId,:ip,:userAgent)
      ON DUPLICATE KEY UPDATE accepted_at=accepted_at`, {
      guardianId: guardian.id, documentId, ip: nullable(metadata.ip, 64), userAgent: nullable(metadata.userAgent, 512),
    });
    return documentsForMe(context);
  }

  async function children(context = {}) {
    await assertConsents(context); const userId = parentOnly(context);
    const [rows] = await pool.query(`SELECT c.id,c.full_name,c.birth_date,c.status FROM guardians g
      JOIN child_guardians cg ON cg.guardian_id=g.id JOIN children c ON c.id=cg.child_id
      WHERE g.user_id=:userId AND c.deleted_at IS NULL ORDER BY c.full_name,c.id`, { userId });
    return rows.map((row) => ({ id: String(row.id), name: row.full_name, birthDate: isoDate(row.birth_date), status: row.status }));
  }

  async function me(context = {}) {
    const userId = parentOnly(context); const guardian = await guardianForUser(userId);
    const required = await consentRequired(context);
    return { id: String(guardian.id), userId, displayName: guardian.full_name, login: guardian.login,
      phone: guardian.phone, email: guardian.email, status: guardian.status, consentRequired: required,
      children: required ? [] : await children(context),
      contact: { maxUrl: contact.maxUrl ?? null, phone: contact.phone ?? null, paymentQrUrl: contact.paymentQrUrl ?? null } };
  }

  async function enrollmentRows(childId) {
    const [rows] = await pool.query(`SELECT e.id,e.direction_id,e.balance_lessons,e.status,d.name direction_name,
      g.id group_id,g.name group_name,g.weekday,g.start_time,g.end_time,s.name site_name,t.full_name teacher_name,
      COALESCE(e.individual_price,
        (SELECT pv.price FROM price_versions pv WHERE pv.scope_type='group' AND pv.group_id=g.id AND pv.valid_from<=NOW(6) AND (pv.valid_to IS NULL OR pv.valid_to>NOW(6)) ORDER BY pv.valid_from DESC,pv.id DESC LIMIT 1),
        (SELECT pv.price FROM price_versions pv WHERE pv.scope_type='direction' AND pv.direction_id=e.direction_id
          AND (pv.project_id=e.project_id OR pv.project_id IS NULL) AND pv.valid_from<=NOW(6) AND (pv.valid_to IS NULL OR pv.valid_to>NOW(6))
          ORDER BY (pv.project_id IS NOT NULL) DESC,pv.valid_from DESC,pv.id DESC LIMIT 1)) current_price
      FROM child_enrollments e JOIN directions d ON d.id=e.direction_id
      LEFT JOIN group_memberships gm ON gm.id=(SELECT gm2.id FROM group_memberships gm2 WHERE gm2.enrollment_id=e.id
        AND gm2.started_on<=CURRENT_DATE AND gm2.ended_on IS NULL ORDER BY gm2.id DESC LIMIT 1)
      LEFT JOIN study_groups g ON g.id=gm.group_id LEFT JOIN sites s ON s.id=g.site_id LEFT JOIN teachers t ON t.id=g.default_teacher_id
      WHERE e.child_id=:childId AND e.superseded_at IS NULL AND e.status='active' ORDER BY e.id`, { childId });
    return rows.map((row) => ({ id: String(row.id), directionId: String(row.direction_id), direction: row.direction_name,
      status: row.status, balanceLessons: String(row.balance_lessons), subscriptionPrice: row.current_price == null ? null : moneyDecimal(moneyCents(row.current_price) * 4n),
      groupId: row.group_id == null ? null : String(row.group_id), group: row.group_name, teacher: row.teacher_name, site: row.site_name,
      schedule: row.group_id == null ? null : `${weekdayNames[Number(row.weekday)]}, ${String(row.start_time).slice(0, 5)}–${String(row.end_time).slice(0, 5)}` }));
  }

  async function latestPhoto(childId) {
    const [rows] = await pool.query(`SELECT ph.id,ph.lesson_id,ph.uploaded_at,ph.expires_at FROM lesson_photos ph
      JOIN lessons l ON l.id=ph.lesson_id WHERE ph.child_id=:childId AND ph.deleted_at IS NULL AND ph.purged_at IS NULL
        AND ph.expires_at>NOW(6) AND l.deleted_at IS NULL ORDER BY ph.uploaded_at DESC,ph.id DESC LIMIT 1`, { childId });
    const row = rows[0];
    return row ? { id: String(row.id), lessonId: String(row.lesson_id), uploadedAt: isoDateTime(row.uploaded_at),
      expiresAt: isoDateTime(row.expires_at), fileUrl: `/api/v1/parent/photos/${row.id}/file` } : null;
  }

  async function home(childId, context = {}) {
    await assertConsents(context); const child = await assertChild(context, childId);
    const enrollments = await enrollmentRows(child.id);
    const groupIds = enrollments.map((item) => item.groupId).filter(Boolean);
    let nextLesson = null;
    if (groupIds.length) {
      const from = localDate(); const to = addDays(from, 120);
      for (const groupId of groupIds) await materializeLessons(from, to, groupId);
      const [rows] = await pool.query(`SELECT l.id,l.starts_at,l.ends_at,l.status,COALESCE(os.name,s.name) site_name
        FROM lessons l JOIN sites s ON s.id=l.site_id_snapshot LEFT JOIN sites os ON os.id=l.site_override_id
        WHERE l.group_id IN (${groupIds.map(() => '?').join(',')}) AND l.deleted_at IS NULL AND l.status='scheduled' AND l.starts_at>=NOW(6)
        ORDER BY l.starts_at,l.id LIMIT 1`, groupIds);
      if (rows[0]) nextLesson = { id: String(rows[0].id), startsAt: isoDateTime(rows[0].starts_at), endsAt: isoDateTime(rows[0].ends_at), site: rows[0].site_name };
    }
    return { child: { id: String(child.id), name: child.full_name, birthDate: isoDate(child.birth_date) }, enrollments,
      nextLesson, latestPhoto: await latestPhoto(child.id) };
  }

  async function schedule(childId, filters = {}, context = {}) {
    await assertConsents(context); const child = await assertChild(context, childId);
    const today = localDate();
    const from = /^\d{4}-\d{2}-\d{2}$/.test(String(filters.from ?? '')) ? filters.from : today;
    const to = /^\d{4}-\d{2}-\d{2}$/.test(String(filters.to ?? '')) ? filters.to : addDays(today, 120);
    const enrollments = await enrollmentRows(child.id); const groupIds = enrollments.map((item) => item.groupId).filter(Boolean);
    if (!groupIds.length) return [];
    for (const groupId of groupIds) await materializeLessons(from, to, groupId);
    const [rows] = await pool.query(`SELECT l.id,l.group_id,l.scheduled_starts_at,l.starts_at,l.ends_at,l.status,l.planned_teacher_id,
      g.name group_name,t.full_name teacher_name,COALESCE(os.name,s.name) site_name
      FROM lessons l JOIN study_groups g ON g.id=l.group_id JOIN teachers t ON t.id=COALESCE(l.actual_teacher_id,l.planned_teacher_id)
      JOIN sites s ON s.id=l.site_id_snapshot LEFT JOIN sites os ON os.id=l.site_override_id
      WHERE l.group_id IN (${groupIds.map(() => '?').join(',')}) AND l.deleted_at IS NULL
        AND l.starts_at>=CONCAT(?,' 00:00:00') AND l.starts_at<DATE_ADD(?,INTERVAL 1 DAY)
      ORDER BY l.starts_at,l.id`, [...groupIds, from, to]);
    return rows.map((row) => ({ id: String(row.id), groupId: String(row.group_id), group: row.group_name,
      startsAt: isoDateTime(row.starts_at), endsAt: isoDateTime(row.ends_at), site: row.site_name, teacher: row.teacher_name,
      status: row.status, moved: String(row.starts_at) !== String(row.scheduled_starts_at) }));
  }

  async function attendance(childId, context = {}) {
    await assertConsents(context); const child = await assertChild(context, childId);
    const [rows] = await pool.query(`SELECT l.id lesson_id,l.starts_at,a.is_trial,d.name direction_name,g.name group_name
      FROM attendances a JOIN lessons l ON l.id=a.lesson_id JOIN study_groups g ON g.id=l.group_id
      JOIN directions d ON d.id=l.direction_id_snapshot WHERE a.child_id=:childId AND a.present=TRUE
        AND l.status='completed' AND l.deleted_at IS NULL ORDER BY l.starts_at DESC,l.id DESC`, { childId: child.id });
    return rows.map((row) => ({ lessonId: String(row.lesson_id), startsAt: isoDateTime(row.starts_at),
      direction: row.direction_name, group: row.group_name, trial: Boolean(row.is_trial) }));
  }

  async function payments(childId, context = {}) {
    await assertConsents(context); const child = await assertChild(context, childId);
    const [rows] = await pool.query(`SELECT id,paid_on operation_date,amount,'payment' operation_type FROM payments
      WHERE child_id=:childId AND deleted_at IS NULL UNION ALL
      SELECT id,refunded_on operation_date,amount,'refund' operation_type FROM refunds WHERE child_id=:childId
      ORDER BY operation_date DESC,id DESC`, { childId: child.id });
    return rows.map((row) => ({ id: String(row.id), date: isoDate(row.operation_date), amount: String(row.amount), type: row.operation_type }));
  }

  async function photos(childId, context = {}) {
    await assertConsents(context); const child = await assertChild(context, childId);
    const [rows] = await pool.query(`SELECT ph.id,ph.lesson_id,ph.uploaded_at,ph.expires_at,l.starts_at
      FROM lesson_photos ph JOIN lessons l ON l.id=ph.lesson_id
      WHERE ph.child_id=:childId AND ph.deleted_at IS NULL AND ph.purged_at IS NULL AND ph.expires_at>NOW(6)
        AND l.deleted_at IS NULL ORDER BY l.starts_at DESC,ph.uploaded_at,ph.id`, { childId: child.id });
    return rows.map((row) => ({ id: String(row.id), lessonId: String(row.lesson_id), lessonAt: isoDateTime(row.starts_at),
      uploadedAt: isoDateTime(row.uploaded_at), expiresAt: isoDateTime(row.expires_at), fileUrl: `/api/v1/parent/photos/${row.id}/file` }));
  }

  async function profile(context = {}) {
    await assertConsents(context); const guardian = await guardianForUser(parentOnly(context));
    return { name: guardian.full_name, phone: guardian.phone, email: guardian.email, login: guardian.login };
  }

  async function updateProfile(body, context = {}) {
    await assertConsents(context); const guardian = await guardianForUser(parentOnly(context));
    await pool.query('UPDATE guardians SET full_name=:name,phone=:phone,email=:email WHERE id=:id', {
      id: guardian.id, name: nullable(body.name), phone: nullable(body.phone, 32), email: nullable(body.email, 254),
    });
    if (nullable(body.name)) await pool.query('UPDATE users SET display_name=:name WHERE id=:userId', { name: nullable(body.name), userId: guardian.user_id });
    return profile(context);
  }

  async function notificationSettings(context = {}) {
    await assertConsents(context); const guardian = await guardianForUser(parentOnly(context));
    const [rows] = await pool.query('SELECT notification_type,enabled FROM parent_notification_settings WHERE guardian_id=:guardianId', { guardianId: guardian.id });
    const saved = new Map(rows.map((row) => [row.notification_type, Boolean(row.enabled)]));
    return PARENT_NOTIFICATION_TYPES.map((item) => ({ ...item, enabled: saved.has(item.type) ? saved.get(item.type) : item.defaultEnabled }));
  }

  async function updateNotificationSettings(body, context = {}) {
    await assertConsents(context); const guardian = await guardianForUser(parentOnly(context));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiProblem(400, 'VALIDATION_ERROR', 'Некорректные настройки');
    for (const [type, enabled] of Object.entries(body)) {
      if (!typeMap.has(type) || typeof enabled !== 'boolean') throw new ApiProblem(400, 'VALIDATION_ERROR', 'Некорректная настройка уведомления');
      await pool.query(`INSERT INTO parent_notification_settings (guardian_id,notification_type,enabled)
        VALUES (:guardianId,:type,:enabled) ON DUPLICATE KEY UPDATE enabled=VALUES(enabled)`, { guardianId: guardian.id, type, enabled });
    }
    return notificationSettings(context);
  }

  async function notifications(context = {}) {
    await assertConsents(context); const userId = parentOnly(context);
    const [rows] = await pool.query(`SELECT n.id,n.child_id,c.full_name child_name,n.notification_type,n.title,n.body,n.destination,n.created_at,n.read_at
      FROM notifications n LEFT JOIN children c ON c.id=n.child_id WHERE n.user_id=:userId AND n.dismissed_at IS NULL
      ORDER BY n.created_at DESC,n.id DESC LIMIT 100`, { userId });
    return rows.map((row) => ({ id: String(row.id), childId: row.child_id == null ? null : String(row.child_id), childName: row.child_name,
      type: row.notification_type, title: row.title, body: row.body, destination: row.destination,
      createdAt: isoDateTime(row.created_at), readAt: isoDateTime(row.read_at) }));
  }

  async function markNotificationRead(notificationId, context = {}) {
    await assertConsents(context); const userId = parentOnly(context); const id = identifier(notificationId, 'notificationId');
    const [result] = await pool.query(`UPDATE notifications SET read_at=COALESCE(read_at,NOW(6))
      WHERE id=:id AND user_id=:userId AND dismissed_at IS NULL`, { id, userId });
    if (!result.affectedRows) throw new ApiProblem(404, 'NOT_FOUND', 'Уведомление не найдено');
    return { id, read: true };
  }

  async function documentsForMe(context = {}) { return { documents: await documents(context), consentRequired: await consentRequired(context) }; }

  async function listAccess(childId, context = {}) {
    adminOnly(context); childId = identifier(childId, 'childId');
    const [rows] = await pool.query(`SELECT g.id guardian_id,g.full_name,g.phone,g.email,u.email login,u.status,
      GROUP_CONCAT(DISTINCT c2.full_name ORDER BY c2.full_name SEPARATOR ', ') linked_children
      FROM child_guardians cg JOIN guardians g ON g.id=cg.guardian_id JOIN users u ON u.id=g.user_id
      LEFT JOIN child_guardians cg2 ON cg2.guardian_id=g.id LEFT JOIN children c2 ON c2.id=cg2.child_id
      WHERE cg.child_id=:childId GROUP BY g.id,g.full_name,g.phone,g.email,u.email,u.status ORDER BY g.id`, { childId });
    return rows.map((row) => ({ id: String(row.guardian_id), name: row.full_name, phone: row.phone, email: row.email,
      login: row.login, status: row.status, linkedChildren: row.linked_children ? row.linked_children.split(', ') : [] }));
  }

  async function searchAccess(query, context = {}) {
    adminOnly(context); const value = `%${String(query ?? '').trim().slice(0, 100)}%`;
    const [rows] = await pool.query(`SELECT g.id guardian_id,g.full_name,u.email login,u.status,
      GROUP_CONCAT(DISTINCT c.full_name ORDER BY c.full_name SEPARATOR ', ') linked_children
      FROM guardians g JOIN users u ON u.id=g.user_id JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id AND r.code='parent'
      LEFT JOIN child_guardians cg ON cg.guardian_id=g.id LEFT JOIN children c ON c.id=cg.child_id
      WHERE g.full_name LIKE :query OR u.email LIKE :query GROUP BY g.id,g.full_name,u.email,u.status ORDER BY g.full_name,u.email LIMIT 20`, { query: value });
    return rows.map((row) => ({ id: String(row.guardian_id), name: row.full_name, login: row.login, status: row.status,
      linkedChildren: row.linked_children ? row.linked_children.split(', ') : [] }));
  }

  async function createAccess(childId, body = {}, context = {}) {
    const actorId = adminOnly(context); childId = identifier(childId, 'childId'); const password = makePassword(); const passwordHash = await createPasswordHash(password);
    let login; let guardianId;
    await inTransaction(pool, async (connection) => {
      const [children] = await connection.query('SELECT id,full_name FROM children WHERE id=:childId AND deleted_at IS NULL FOR UPDATE', { childId });
      if (!children.length) throw new ApiProblem(404, 'NOT_FOUND', 'Ребёнок не найден');
      for (let attempt = 0; attempt < 5; attempt += 1) {
        login = makeLogin();
        const [duplicate] = await connection.query('SELECT id FROM users WHERE LOWER(email)=LOWER(:login) LIMIT 1', { login });
        if (!duplicate.length) break;
        login = null;
      }
      if (!login) throw new ApiProblem(409, 'LOGIN_GENERATION_FAILED', 'Не удалось создать уникальный логин');
      const [created] = await connection.query(`INSERT INTO users (email,password_hash,display_name,status)
        VALUES (:login,:passwordHash,:displayName,'active')`, { login, passwordHash, displayName: nullable(body.name) ?? `Родитель: ${children[0].full_name}` });
      const [role] = await connection.query("SELECT id FROM roles WHERE code='parent' LIMIT 1");
      if (!role.length) throw new Error('Роль parent не найдена');
      await connection.query('INSERT INTO user_roles (user_id,role_id,granted_by_user_id) VALUES (:userId,:roleId,:actorId)', { userId: created.insertId, roleId: role[0].id, actorId });
      const [primary] = await connection.query(`SELECT g.id,g.user_id FROM guardians g JOIN child_guardians cg ON cg.guardian_id=g.id
        WHERE cg.child_id=:childId AND cg.is_primary=TRUE LIMIT 1 FOR UPDATE`, { childId });
      if (primary[0] && primary[0].user_id == null) {
        guardianId = primary[0].id;
        await connection.query('UPDATE guardians SET user_id=:userId,full_name=COALESCE(:name,full_name) WHERE id=:guardianId', { userId: created.insertId, name: nullable(body.name), guardianId });
      } else {
        const [guardian] = await connection.query('INSERT INTO guardians (user_id,full_name) VALUES (:userId,:name)', { userId: created.insertId, name: nullable(body.name) });
        guardianId = guardian.insertId;
        await connection.query(`INSERT INTO child_guardians (child_id,guardian_id,is_primary,can_receive_notifications)
          VALUES (:childId,:guardianId,:isPrimary,TRUE)`, { childId, guardianId, isPrimary: primary.length === 0 });
      }
    });
    return { guardianId: String(guardianId), login, password };
  }

  async function linkAccess(childId, guardianId, context = {}) {
    adminOnly(context); childId = identifier(childId, 'childId'); guardianId = identifier(guardianId, 'guardianId');
    const [result] = await pool.query(`INSERT IGNORE INTO child_guardians (child_id,guardian_id,is_primary,can_receive_notifications)
      SELECT :childId,:guardianId,NOT EXISTS(SELECT 1 FROM child_guardians WHERE child_id=:childId),TRUE
      FROM guardians g JOIN users u ON u.id=g.user_id
      JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id AND r.code='parent'
      WHERE g.id=:guardianId AND u.deleted_at IS NULL`, { childId, guardianId });
    if (!result.affectedRows) {
      const [existing] = await pool.query('SELECT 1 FROM child_guardians WHERE child_id=:childId AND guardian_id=:guardianId', { childId, guardianId });
      if (!existing.length) throw new ApiProblem(404, 'NOT_FOUND', 'Ребёнок или родительский аккаунт не найден');
    }
    return listAccess(childId, context);
  }

  async function unlinkAccess(childId, guardianId, context = {}) {
    adminOnly(context); childId = identifier(childId, 'childId'); guardianId = identifier(guardianId, 'guardianId');
    await inTransaction(pool, async (connection) => {
      const [rows] = await connection.query(`SELECT is_primary FROM child_guardians
        WHERE child_id=:childId AND guardian_id=:guardianId FOR UPDATE`, { childId, guardianId });
      if (!rows.length) throw new ApiProblem(404, 'NOT_FOUND', 'Связь с ребёнком не найдена');
      await connection.query('DELETE FROM child_guardians WHERE child_id=:childId AND guardian_id=:guardianId', { childId, guardianId });
      if (rows[0].is_primary) await connection.query(`UPDATE child_guardians SET is_primary=TRUE
        WHERE child_id=:childId ORDER BY guardian_id LIMIT 1`, { childId });
    });
    return null;
  }

  async function resetPassword(guardianId, context = {}) {
    adminOnly(context); guardianId = identifier(guardianId, 'guardianId'); const password = makePassword(); const passwordHash = await createPasswordHash(password);
    const [rows] = await pool.query(`SELECT g.user_id,u.email FROM guardians g JOIN users u ON u.id=g.user_id WHERE g.id=:guardianId`, { guardianId });
    if (!rows.length) throw new ApiProblem(404, 'NOT_FOUND', 'Родительский аккаунт не найден');
    await inTransaction(pool, async (connection) => {
      await connection.query("UPDATE users SET password_hash=:passwordHash,status='active',token_version=token_version+1 WHERE id=:userId", { passwordHash, userId: rows[0].user_id });
      await connection.query('UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,NOW(6)) WHERE user_id=:userId', { userId: rows[0].user_id });
    });
    return { guardianId, login: rows[0].email, password };
  }

  async function setAccessStatus(guardianId, enabled, context = {}) {
    adminOnly(context); guardianId = identifier(guardianId, 'guardianId');
    if (typeof enabled !== 'boolean') throw new ApiProblem(400, 'VALIDATION_ERROR', 'Поле enabled должно быть boolean');
    const [rows] = await pool.query('SELECT user_id FROM guardians WHERE id=:guardianId AND user_id IS NOT NULL', { guardianId });
    if (!rows.length) throw new ApiProblem(404, 'NOT_FOUND', 'Родительский аккаунт не найден');
    await inTransaction(pool, async (connection) => {
      await connection.query("UPDATE users SET status=:status,token_version=token_version+1 WHERE id=:userId", { status: enabled ? 'active' : 'blocked', userId: rows[0].user_id });
      await connection.query('UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,NOW(6)) WHERE user_id=:userId', { userId: rows[0].user_id });
    });
    return { guardianId, status: enabled ? 'active' : 'blocked' };
  }

  return { me, children, home, schedule, attendance, payments, photos, profile, updateProfile,
    notificationSettings, updateNotificationSettings, notifications, markNotificationRead,
    documents: documentsForMe, acceptDocument, assertChild, assertConsents,
    listAccess, searchAccess, createAccess, linkAccess, unlinkAccess, resetPassword, setAccessStatus };
}

import { PARENT_NOTIFICATION_TYPES } from './parent-portal.mjs';
import { createNotificationEvents } from './notification-events.mjs';

const defaults = new Map(PARENT_NOTIFICATION_TYPES.map((item) => [item.type, item.defaultEnabled]));
const timestamp = (value) => value instanceof Date ? value.toISOString().replace('T', ' ') : String(value ?? '').replace('T', ' ');
const clock = (value) => timestamp(value).slice(11, 16);
const dateRu = (value) => timestamp(value).slice(0, 10).split('-').reverse().join('.');
const eventStamp = (value) => (value instanceof Date ? value.toISOString() : String(value)).replace(/\D/g, '').slice(0, 14);

export const PARENT_NOTIFICATION_TEMPLATES = Object.freeze({
  reminder_day_before: ({ startsAt }) => ({
    title: 'Занятие завтра',
    body: `Завтра занятие по расписанию в ${clock(startsAt)}. Если ребёнка не будет, отметьте это в расписании.`,
    destination: 'schedule',
  }),
  lesson_move: ({ previousStartsAt, startsAt }) => ({
    title: 'Занятие перенесено',
    body: `Занятие ${dateRu(previousStartsAt)} в ${clock(previousStartsAt)} перенесено на ${dateRu(startsAt)} в ${clock(startsAt)}. Актуальное расписание можно посмотреть в календаре.`,
    destination: 'schedule',
  }),
  lesson_cancel: ({ startsAt }) => ({
    title: 'Занятие отменено',
    body: `Занятие ${dateRu(startsAt)} в ${clock(startsAt)} отменено. Актуальное расписание можно посмотреть в календаре.`,
    destination: 'schedule',
  }),
  last_paid_lesson: () => ({
    title: 'Абонемент закончился',
    body: 'Сегодня прошло последнее оплаченное занятие. Пожалуйста, оплатите следующий абонемент до следующего занятия.',
    destination: 'payments',
  }),
  payment_reminder: ({ startsAt }) => ({
    title: 'Напоминание об оплате',
    body: `Завтра занятие в ${clock(startsAt)}. Оплаченных занятий не осталось — пожалуйста, оплатите абонемент.`,
    destination: 'payments',
  }),
  lesson_finished: () => ({
    title: 'Как прошло занятие',
    body: 'В личном кабинете доступны новые фотографии с занятия.',
    destination: 'photos',
  }),
});

export function createParentNotifications(pool, { notificationEvents = createNotificationEvents(pool) } = {}) {
  async function recipients(connection, childId, type) {
    const [rows] = await connection.query(`SELECT DISTINCT u.id user_id,g.id guardian_id,
      COALESCE(s.enabled,:defaultEnabled) enabled
      FROM child_guardians cg JOIN guardians g ON g.id=cg.guardian_id
      JOIN users u ON u.id=g.user_id AND u.status='active' AND u.deleted_at IS NULL
      JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id AND r.code='parent'
      LEFT JOIN parent_notification_settings s ON s.guardian_id=g.id AND s.notification_type=:type
      WHERE cg.child_id=:childId AND cg.can_receive_notifications=TRUE`, {
      childId, type, defaultEnabled: defaults.get(type) ? 1 : 0,
    });
    return rows.filter((row) => Boolean(row.enabled));
  }

  async function createForChild(connection, { childId, type, data = {}, referenceType, referenceId, dedupKey }) {
    const template = PARENT_NOTIFICATION_TEMPLATES[type];
    if (!template) throw new Error(`Unknown parent notification type: ${type}`);
    const message = template(data);
    let created = 0;
    for (const recipient of await recipients(connection, childId, type)) {
      const notificationId = await notificationEvents.createUser(connection, {
        userId: recipient.user_id, roleCode: 'parent', childId, type, title: message.title, body: message.body,
        entityType: referenceType, entityId: referenceId, destination: message.destination, dedupKey,
        referenceType, referenceId, respectSettings: false,
      });
      created += Number(Boolean(notificationId));
    }
    return created;
  }

  async function lessonChildren(connection, lesson) {
    const [rows] = await connection.query(`SELECT DISTINCT child_id FROM (
      SELECT lrm.child_id FROM lesson_roster_members lrm WHERE lrm.lesson_id=:lessonId
      UNION ALL
      SELECT e.child_id FROM group_memberships gm JOIN child_enrollments e ON e.id=gm.enrollment_id
        WHERE gm.group_id=:groupId AND gm.started_on<=DATE(:startsAt)
          AND (gm.ended_on IS NULL OR gm.ended_on>=DATE(:startsAt)) AND e.status='active' AND e.superseded_at IS NULL
    ) children`, { lessonId: lesson.id, groupId: lesson.group_id, startsAt: lesson.starts_at });
    return rows.map((row) => row.child_id);
  }

  async function lessonMoved(connection, lesson, previousStartsAt) {
    let created = 0;
    for (const childId of await lessonChildren(connection, lesson)) created += await createForChild(connection, {
      childId, type: 'lesson_move', data: { previousStartsAt, startsAt: lesson.starts_at },
      referenceType: 'lesson', referenceId: lesson.id,
      dedupKey: `parent:lesson_move:${lesson.id}:${eventStamp(lesson.starts_at)}`,
    });
    return created;
  }

  async function lessonCancelled(connection, lesson) {
    let created = 0;
    for (const childId of await lessonChildren(connection, lesson)) created += await createForChild(connection, {
      childId, type: 'lesson_cancel', data: { startsAt: lesson.starts_at }, referenceType: 'lesson', referenceId: lesson.id,
      dedupKey: `parent:lesson_cancel:${lesson.id}`,
    });
    return created;
  }

  async function lessonFinished(connection, lesson) {
    const [rows] = await connection.query(`SELECT DISTINCT a.child_id,a.enrollment_id,a.is_trial,e.balance_lessons
      FROM attendances a LEFT JOIN child_enrollments e ON e.id=a.enrollment_id
      WHERE a.lesson_id=:lessonId AND a.present=TRUE`, { lessonId: lesson.id });
    let created = 0;
    for (const row of rows) {
      if (!row.is_trial && String(row.balance_lessons) === '0.00000000') created += await createForChild(connection, {
        childId: row.child_id, type: 'last_paid_lesson', referenceType: 'lesson', referenceId: lesson.id,
        dedupKey: `parent:last_paid_lesson:${lesson.id}:${row.enrollment_id}`,
      });
    }
    return created;
  }

  async function photoAvailable(connection, lesson, childId) {
    return createForChild(connection, {
      childId, type: 'lesson_finished', referenceType: 'lesson', referenceId: lesson.id,
      dedupKey: `parent:lesson_finished:${lesson.id}:${childId}`,
    });
  }

  async function generateDayBefore(targetDate, connection = pool) {
    const [rows] = await connection.query(`SELECT l.id lesson_id,l.starts_at,e.child_id,e.id enrollment_id,e.balance_lessons
      FROM lessons l JOIN group_memberships gm ON gm.group_id=l.group_id
        AND gm.started_on<=DATE(l.starts_at) AND (gm.ended_on IS NULL OR gm.ended_on>=DATE(l.starts_at))
      JOIN child_enrollments e ON e.id=gm.enrollment_id AND e.status='active' AND e.superseded_at IS NULL
      JOIN children c ON c.id=e.child_id AND c.deleted_at IS NULL
      WHERE DATE(l.starts_at)=:targetDate AND l.status='scheduled' AND l.deleted_at IS NULL
      ORDER BY l.id,e.child_id`, { targetDate });
    let created = 0;
    for (const row of rows) {
      created += await createForChild(connection, {
        childId: row.child_id, type: 'reminder_day_before', data: { startsAt: row.starts_at },
        referenceType: 'lesson', referenceId: row.lesson_id,
        dedupKey: `parent:reminder_day_before:${row.lesson_id}:${row.child_id}`,
      });
      if (/^-/.test(String(row.balance_lessons)) || /^0+(?:\.0+)?$/.test(String(row.balance_lessons))) {
        created += await createForChild(connection, {
          childId: row.child_id, type: 'payment_reminder', data: { startsAt: row.starts_at },
          referenceType: 'lesson', referenceId: row.lesson_id,
          dedupKey: `parent:payment_reminder:${row.lesson_id}:${row.enrollment_id}`,
        });
      }
    }
    return { targetDate, candidates: rows.length, created };
  }

  return { createForChild, lessonMoved, lessonCancelled, lessonFinished, photoAvailable, generateDayBefore };
}

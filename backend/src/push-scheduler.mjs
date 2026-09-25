import { addCalendarDays, birthdayMatchesDate, businessDate, BUSINESS_TIME_ZONE } from '../shared/business-time.mjs';
import { inTransaction } from './db.mjs';
import { createNotificationEvents } from './notification-events.mjs';

function businessParts(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}:${parts.second}`,
    sql: `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}` };
}

export function createPushScheduler(pool, {
  notificationEvents = createNotificationEvents(pool), parentNotifications = null,
  reminderTime = '19:00', now = () => new Date(),
} = {}) {
  async function lessonRows(connection, sqlNow) {
    const [rows] = await connection.query(`SELECT l.id,l.group_id,l.project_id_snapshot,l.planned_teacher_id,l.actual_teacher_id,l.starts_at,l.ends_at,l.status,
      g.name group_name,g.default_teacher_id FROM lessons l JOIN study_groups g ON g.id=l.group_id
      WHERE l.deleted_at IS NULL AND (
        (l.status='scheduled' AND l.starts_at BETWEEN :now AND DATE_ADD(:now,INTERVAL 60 MINUTE))
        OR (l.status='scheduled' AND l.starts_at<=:now AND l.starts_at>DATE_SUB(:now,INTERVAL 4 HOUR))
        OR (l.status NOT IN ('completed','cancelled') AND l.ends_at<=:now AND l.ends_at>DATE_SUB(:now,INTERVAL 8 HOUR))
      ) ORDER BY l.starts_at,l.id`, { now: sqlNow });
    return rows;
  }

  async function generateLessons(connection, parts) {
    let created = 0;
    const directors = await notificationEvents.roleUsers(connection, 'director');
    for (const lesson of await lessonRows(connection, parts.sql)) {
      const teacher = await notificationEvents.teacherUser(connection,
        lesson.actual_teacher_id ?? lesson.planned_teacher_id ?? lesson.default_teacher_id);
      const start = String(lesson.starts_at).slice(11, 16);
      if (lesson.status === 'scheduled' && String(lesson.starts_at) > parts.sql) {
        if (teacher) created += Number(Boolean(await notificationEvents.createUser(connection, {
          userId: teacher.user_id, roleCode: 'teacher', projectId: lesson.project_id_snapshot,
          type: 'teacher_lesson_soon', title: 'Скоро занятие',
          body: `Сегодня в ${start} занятие группы «${lesson.group_name}».`,
          entityType: 'lesson', entityId: lesson.id, destination: 'lesson',
          dedupKey: `teacher:lesson_soon:${lesson.id}`,
        })));
      }
      if (lesson.status === 'scheduled' && String(lesson.starts_at) <= parts.sql) {
        const minutesLate = (new Date(String(parts.sql).replace(' ', 'T') + '+11:00') - new Date(String(lesson.starts_at).replace(' ', 'T') + '+11:00')) / 60000;
        if (teacher && minutesLate >= 0 && minutesLate < 15) created += Number(Boolean(await notificationEvents.createUser(connection, {
          userId: teacher.user_id, roleCode: 'teacher', projectId: lesson.project_id_snapshot,
          type: 'teacher_lesson_start_reminder', title: 'Начните занятие',
          body: `Не забудьте начать занятие группы «${lesson.group_name}».`,
          entityType: 'lesson', entityId: lesson.id, destination: 'lesson',
          dedupKey: `teacher:start:${lesson.id}`,
        })));
        if (minutesLate >= 15) {
          for (const director of directors) created += Number(Boolean(await notificationEvents.createUser(connection, {
            userId: director.user_id, roleCode: 'director', type: 'director_lesson_not_started',
            title: 'Занятие не начато', body: `Занятие группы «${lesson.group_name}» ещё не начато.`,
            entityType: 'lesson', entityId: lesson.id, destination: 'lesson',
            dedupKey: `director:lesson_not_started:${lesson.id}`,
          })));
          for (const partner of await notificationEvents.partnerUsers(connection, lesson.project_id_snapshot)) {
            created += Number(Boolean(await notificationEvents.createUser(connection, {
              userId: partner.user_id, roleCode: 'partner', projectId: lesson.project_id_snapshot,
              type: 'partner_lesson_not_started', title: 'Занятие не начато',
              body: `Занятие группы «${lesson.group_name}» ещё не начато.`,
              entityType: 'lesson', entityId: lesson.id, destination: 'lesson',
              dedupKey: `partner:lesson_not_started:${lesson.id}`,
            })));
          }
        }
      }
      if (!['completed', 'cancelled'].includes(lesson.status) && String(lesson.ends_at) <= parts.sql) {
        const minutesLate = (new Date(String(parts.sql).replace(' ', 'T') + '+11:00') - new Date(String(lesson.ends_at).replace(' ', 'T') + '+11:00')) / 60000;
        if (teacher && minutesLate >= 0 && minutesLate < 30) created += Number(Boolean(await notificationEvents.createUser(connection, {
          userId: teacher.user_id, roleCode: 'teacher', projectId: lesson.project_id_snapshot,
          type: 'teacher_lesson_finish_reminder', title: 'Завершите занятие',
          body: `Не забудьте завершить занятие группы «${lesson.group_name}».`,
          entityType: 'lesson', entityId: lesson.id, destination: 'lesson',
          dedupKey: `teacher:finish:${lesson.id}`,
        })));
        if (minutesLate >= 30) {
          for (const director of directors) created += Number(Boolean(await notificationEvents.createUser(connection, {
            userId: director.user_id, roleCode: 'director', type: 'director_lesson_not_finished',
            title: 'Занятие не завершено', body: `Занятие группы «${lesson.group_name}» ещё не завершено.`,
            entityType: 'lesson', entityId: lesson.id, destination: 'lesson',
            dedupKey: `director:lesson_not_finished:${lesson.id}`,
          })));
          for (const partner of await notificationEvents.partnerUsers(connection, lesson.project_id_snapshot)) {
            created += Number(Boolean(await notificationEvents.createUser(connection, {
              userId: partner.user_id, roleCode: 'partner', projectId: lesson.project_id_snapshot,
              type: 'partner_lesson_not_finished', title: 'Занятие не завершено',
              body: `Занятие группы «${lesson.group_name}» ещё не завершено.`,
              entityType: 'lesson', entityId: lesson.id, destination: 'lesson',
              dedupKey: `partner:lesson_not_finished:${lesson.id}`,
            })));
          }
        }
      }
    }
    return created;
  }

  async function generateBirthdays(connection, parts) {
    const [rows] = await connection.query(`SELECT DISTINCT l.id lesson_id,l.project_id_snapshot,l.planned_teacher_id,l.actual_teacher_id,
      g.default_teacher_id,c.id child_id,c.full_name,c.birth_date
      FROM lessons l JOIN study_groups g ON g.id=l.group_id
      JOIN child_enrollments e ON e.project_id=l.project_id_snapshot AND e.direction_id=l.direction_id_snapshot AND e.status='active'
        AND e.superseded_at IS NULL
      JOIN group_memberships gm ON gm.enrollment_id=e.id AND gm.group_id=l.group_id
        AND gm.started_on<=DATE(l.starts_at) AND (gm.ended_on IS NULL OR gm.ended_on>=DATE(l.starts_at))
      JOIN children c ON c.id=e.child_id AND c.deleted_at IS NULL
      WHERE l.deleted_at IS NULL AND l.status<>'cancelled' AND DATE(l.starts_at)=:day
        AND l.starts_at BETWEEN :now AND DATE_ADD(:now,INTERVAL 60 MINUTE)`, { day: parts.day, now: parts.sql });
    let created = 0; const seen = new Set();
    for (const row of rows) {
      if (!birthdayMatchesDate(row.birth_date, parts.day)) continue;
      const teacherId = row.actual_teacher_id ?? row.planned_teacher_id ?? row.default_teacher_id;
      const key = `${teacherId}:${row.child_id}:${parts.day}`; if (seen.has(key)) continue; seen.add(key);
      const teacher = await notificationEvents.teacherUser(connection, teacherId); if (!teacher) continue;
      created += Number(Boolean(await notificationEvents.createUser(connection, {
        userId: teacher.user_id, roleCode: 'teacher', projectId: row.project_id_snapshot,
        type: 'teacher_child_birthday', title: 'Сегодня день рождения',
        body: `У ${row.full_name} сегодня день рождения.`,
        entityType: 'child', entityId: row.child_id, destination: 'child',
        dedupKey: `teacher:birthday:${teacherId}:${row.child_id}:${parts.day}`,
      })));
    }
    return created;
  }

  async function generate() {
    const parts = businessParts(now());
    let created = await inTransaction(pool, async (connection) =>
      (await generateLessons(connection, parts)) + (await generateBirthdays(connection, parts)));
    if (parentNotifications && parts.time.slice(0, 5) >= reminderTime) {
      created += await parentNotifications.generateDayBefore(addCalendarDays(parts.day, 1));
    }
    return { created, businessDate: parts.day, businessTime: parts.time.slice(0, 5) };
  }

  return { generate, generateLessons, generateBirthdays, businessParts };
}

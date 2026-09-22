import { ApiProblem } from './catalog.mjs';
import { ageOnDate as safeAgeOnDate, birthdayMatchesDate, parseCalendarDate } from '../../src/shared/business-time.mjs';

export const ageOnDate = safeAgeOnDate;

export function createBirthdayNotifications(pool) {
  async function generate(day, connection = pool) {
    try { day = parseCalendarDate(day); } catch { throw new ApiProblem(400, 'VALIDATION_ERROR', 'Некорректная дата запуска уведомлений'); }
    const [children] = await connection.query(`SELECT id,full_name,birth_date FROM children
      WHERE deleted_at IS NULL AND status<>'archived' AND birth_date IS NOT NULL AND (
        DATE_FORMAT(birth_date,'%m-%d')=DATE_FORMAT(:day,'%m-%d') OR
        (DATE_FORMAT(birth_date,'%m-%d')='02-29' AND DATE_FORMAT(:day,'%m-%d')='02-28' AND DAY(LAST_DAY(:day))=28)
      ) ORDER BY id`, { day });
    let created = 0;
    for (const child of children) {
      const [recipients] = await connection.query(`SELECT DISTINCT u.id user_id,'director' role_code
        FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id AND r.code='director'
        WHERE u.status='active' AND u.deleted_at IS NULL
        UNION
        SELECT DISTINCT u.id user_id,'teacher' role_code FROM child_enrollments e
        JOIN group_memberships gm ON gm.enrollment_id=e.id JOIN study_groups sg ON sg.id=gm.group_id AND sg.active=TRUE
        JOIN teacher_projects tp ON tp.teacher_id=sg.default_teacher_id AND tp.project_id=sg.project_id AND tp.active=TRUE
        JOIN teachers t ON t.id=sg.default_teacher_id AND t.deleted_at IS NULL
        JOIN users u ON u.id=t.user_id AND u.status='active' AND u.deleted_at IS NULL
        WHERE e.child_id=:childId AND e.status='active' AND e.superseded_at IS NULL
          AND gm.started_on<=:day AND (gm.ended_on IS NULL OR gm.ended_on>=:day)`, { childId: child.id, day });
      const age = ageOnDate(child.birth_date, day);
      if (!birthdayMatchesDate(child.birth_date, day)) continue;
      for (const recipient of recipients) {
        const [result] = await connection.query(`INSERT IGNORE INTO notifications
          (user_id,role_code,child_id,notification_type,title,body,entity_type,entity_id,destination,dedup_key,reference_type,reference_id)
          VALUES (:userId,:roleCode,:childId,'child_birthday','День рождения',:body,'child',:childId,'children',:dedupKey,'child',:childId)`, {
          userId: recipient.user_id, roleCode: recipient.role_code, childId: child.id,
          body: age == null ? `🎂 Сегодня день рождения у ${child.full_name}.`
            : `🎂 Сегодня день рождения у ${child.full_name} — ${age} лет.`, dedupKey: `child_birthday:${day}:${child.id}`,
        });
        created += Number(result.affectedRows ?? 0);
      }
    }
    return { day, candidates: children.length, created };
  }
  return { generate };
}

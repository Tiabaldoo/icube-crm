export function ageOnDate(birthDate, onDate) {
  const [birthYear, birthMonth, birthDay] = String(birthDate).slice(0, 10).split('-').map(Number);
  const [year, month, day] = String(onDate).slice(0, 10).split('-').map(Number);
  let age = year - birthYear;
  if (month < birthMonth || (month === birthMonth && day < birthDay)) age -= 1;
  return age;
}

export function createBirthdayNotifications(pool) {
  async function generate(day, connection = pool) {
    const [children] = await connection.query(`SELECT id,full_name,birth_date FROM children
      WHERE deleted_at IS NULL AND birth_date IS NOT NULL
        AND DATE_FORMAT(birth_date,'%m-%d')=DATE_FORMAT(:day,'%m-%d') ORDER BY id`, { day });
    let created = 0;
    for (const child of children) {
      const [recipients] = await connection.query(`SELECT DISTINCT u.id user_id,'director' role_code
        FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id AND r.code='director'
        WHERE u.status='active' AND u.deleted_at IS NULL
        UNION
        SELECT DISTINCT u.id user_id,'teacher' role_code FROM child_enrollments e
        JOIN group_memberships gm ON gm.enrollment_id=e.id JOIN study_groups sg ON sg.id=gm.group_id AND sg.active=TRUE
        JOIN teachers t ON t.id=sg.default_teacher_id AND t.active=TRUE AND t.deleted_at IS NULL
        JOIN users u ON u.id=t.user_id AND u.status='active' AND u.deleted_at IS NULL
        WHERE e.child_id=:childId AND e.status='active' AND e.superseded_at IS NULL
          AND gm.started_on<=:day AND (gm.ended_on IS NULL OR gm.ended_on>=:day)`, { childId: child.id, day });
      const age = ageOnDate(child.birth_date, day);
      for (const recipient of recipients) {
        const [result] = await connection.query(`INSERT IGNORE INTO notifications
          (user_id,role_code,child_id,notification_type,title,body,entity_type,entity_id,destination,dedup_key,reference_type,reference_id)
          VALUES (:userId,:roleCode,:childId,'child_birthday','День рождения',:body,'child',:childId,'children',:dedupKey,'child',:childId)`, {
          userId: recipient.user_id, roleCode: recipient.role_code, childId: child.id,
          body: `🎂 Сегодня день рождения у ${child.full_name} — ${age} лет.`, dedupKey: `child_birthday:${day}:${child.id}`,
        });
        created += Number(result.affectedRows ?? 0);
      }
    }
    return { day, candidates: children.length, created };
  }
  return { generate };
}

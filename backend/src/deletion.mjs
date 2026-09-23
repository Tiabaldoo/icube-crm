import { inTransaction } from './db.mjs';
import { ApiProblem } from './catalog.mjs';

const numericId = (value, field = 'id') => {
  const result = String(value ?? '').trim();
  if (!/^[1-9]\d*$/.test(result)) throw new ApiProblem(400, 'VALIDATION_ERROR', `Некорректное поле ${field}`);
  return result;
};
const hasAny = (dependencies) => Object.values(dependencies).some((value) => Number(value) > 0);
const dependencyLabels = { memberships: 'участники', lessons: 'занятия', attendances: 'посещения', quickChildren: 'дети из занятия',
  childStatusHistory: 'история статусов детей', enrollmentStatusHistory: 'история направлений', payments: 'оплаты', refunds: 'возвраты',
  balanceTransfers: 'переносы баланса', projectTransfers: 'межпроектные переводы', balanceEffects: 'операции баланса', balance: 'ненулевой баланс' };
const dependencyNames = (dependencies) => Object.entries(dependencies).filter(([, value]) => Number(value) > 0)
  .map(([name, value]) => `${dependencyLabels[name] ?? name}: ${value}`).join(', ');

export function createDeletionService(pool) {
  async function rows(sql, params = {}) { const [result] = await pool.query(sql, params); return result; }
  async function one(sql, params = {}) { return (await rows(sql, params))[0] ?? null; }
  async function ensureExists(table, resourceId, label) {
    const found = await one(`SELECT id FROM ${table} WHERE id=:id AND deleted_at IS NULL LIMIT 1`, { id: resourceId });
    if (!found) throw new ApiProblem(404, 'NOT_FOUND', `${label} не найдена`);
  }

  async function purgeEnrollmentLedger(connection, enrollmentId) {
    await connection.query(`DELETE blc FROM balance_lot_consumptions blc
      LEFT JOIN balance_lots bl ON bl.id=blc.balance_lot_id
      LEFT JOIN balance_entries be ON be.id=blc.balance_entry_id
      WHERE bl.enrollment_id=:id OR be.enrollment_id=:id`, { id: enrollmentId });
    await connection.query('DELETE FROM balance_lots WHERE enrollment_id=:id', { id: enrollmentId });
    await connection.query(`DELETE reversal FROM balance_entries reversal
      JOIN balance_entries original ON original.id=reversal.reversal_of_entry_id WHERE original.enrollment_id=:id`, { id: enrollmentId });
    await connection.query('DELETE FROM balance_entries WHERE enrollment_id=:id', { id: enrollmentId });
  }

  async function deleteSite(rawId) {
    const siteId = numericId(rawId, 'siteId');
    await ensureExists('sites', siteId, 'Площадка');
    const dependencies = await one(`SELECT
      (SELECT COUNT(*) FROM study_groups WHERE site_id=:id) groupCount,
      (SELECT COUNT(*) FROM lessons WHERE (site_id_snapshot=:id OR site_override_id=:id) AND deleted_at IS NULL) lessons`, { id: siteId });
    if (hasAny(dependencies)) throw new ApiProblem(409, 'SITE_HAS_DEPENDENCIES', 'Нельзя удалить площадку, потому что есть связанные группы или занятия/история.', dependencies);
    try { await pool.query('DELETE FROM sites WHERE id=:id', { id: siteId }); }
    catch (error) {
      if (error?.code === 'ER_ROW_IS_REFERENCED_2') throw new ApiProblem(409, 'SITE_HAS_DEPENDENCIES', 'Нельзя удалить площадку, потому что есть связанные группы или занятия/история.');
      throw error;
    }
    return null;
  }

  async function deleteTeacher(rawId) {
    const teacherId = numericId(rawId, 'teacherId');
    await ensureExists('teachers', teacherId, 'Преподаватель');
    const dependencies = await one(`SELECT
      (SELECT COUNT(*) FROM study_groups WHERE default_teacher_id=:id) groupCount,
      (SELECT COUNT(*) FROM lessons WHERE deleted_at IS NULL AND (planned_teacher_id=:id OR actual_teacher_id=:id)) lessons,
      (SELECT COUNT(*) FROM salary_rate_versions WHERE teacher_id=:id) salaryRateVersions,
      (SELECT COUNT(*) FROM salary_accruals WHERE teacher_id=:id) salaryAccruals`, { id: teacherId });
    if (hasAny(dependencies)) throw new ApiProblem(409, 'TEACHER_HAS_DEPENDENCIES', 'Нельзя удалить преподавателя, потому что есть связанные группы, занятия или история начислений.', dependencies);
    try {
      await inTransaction(pool, async (connection) => {
        const [teachers] = await connection.query('SELECT user_id FROM teachers WHERE id=:id AND deleted_at IS NULL FOR UPDATE', { id: teacherId });
        const userId = teachers[0]?.user_id ?? null;
        await connection.query('DELETE FROM teacher_project_directions WHERE teacher_id=:id', { id: teacherId });
        await connection.query('DELETE FROM teacher_directions WHERE teacher_id=:id', { id: teacherId });
        await connection.query('DELETE FROM teacher_projects WHERE teacher_id=:id', { id: teacherId });
        if (userId != null) {
          const [teacherRoles] = await connection.query("SELECT id FROM roles WHERE code='teacher' LIMIT 1");
          const teacherRoleId = teacherRoles[0]?.id ?? null;
          if (teacherRoleId != null) await connection.query('DELETE FROM user_roles WHERE user_id=:userId AND role_id=:roleId', { userId, roleId: teacherRoleId });
          await connection.query('UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,NOW(6)) WHERE user_id=:userId', { userId });
          const [remainingRoles] = await connection.query('SELECT COUNT(*) role_count FROM user_roles WHERE user_id=:userId', { userId });
          if (Number(remainingRoles[0]?.role_count ?? 0) > 0) {
            await connection.query('UPDATE users SET token_version=token_version+1 WHERE id=:userId', { userId });
          } else {
            await connection.query("UPDATE users SET status='blocked',deleted_at=COALESCE(deleted_at,NOW(6)),token_version=token_version+1 WHERE id=:userId", { userId });
          }
        }
        await connection.query('DELETE FROM teachers WHERE id=:id', { id: teacherId });
      });
    } catch (error) {
      if (error?.code === 'ER_ROW_IS_REFERENCED_2') throw new ApiProblem(409, 'TEACHER_HAS_DEPENDENCIES', 'Нельзя удалить преподавателя, потому что есть связанные группы, занятия или история начислений.');
      throw error;
    }
    return null;
  }

  async function deleteGroup(rawId, context = {}) {
    const groupId = numericId(rawId, 'groupId');
    try {
      await inTransaction(pool, async (connection) => {
        const [groups] = await connection.query('SELECT id FROM study_groups WHERE id=:id AND deleted_at IS NULL FOR UPDATE', { id: groupId });
        if (!groups.length) throw new ApiProblem(404, 'NOT_FOUND', 'Группа не найдена');
        let notifyProject = null;
        if ((context.roles ?? []).includes('director')) {
          const [owners] = await connection.query(`SELECT g.project_id,g.name FROM study_groups g JOIN projects p ON p.id=g.project_id
            WHERE g.id=:id AND p.code<>'icube-robots'`, { id: groupId });
          notifyProject = owners[0] ?? null;
        }
        await connection.query(`DELETE l FROM lessons l WHERE l.group_id=:id
          AND l.status='scheduled' AND l.scheduled_starts_at>NOW(6) AND l.actual_starts_at IS NULL
          AND l.roster_frozen_at IS NULL AND l.attendance_applied_at IS NULL AND l.completed_at IS NULL AND l.cancelled_at IS NULL
          AND l.lock_version=1
          AND NOT EXISTS (SELECT 1 FROM lesson_roster_members r WHERE r.lesson_id=l.id)
          AND NOT EXISTS (SELECT 1 FROM attendances a WHERE a.lesson_id=l.id)
          AND NOT EXISTS (SELECT 1 FROM lesson_photos ph WHERE ph.lesson_id=l.id)
          AND NOT EXISTS (SELECT 1 FROM salary_accruals sa WHERE sa.lesson_id=l.id)`, { id: groupId });
        const [safeLessons] = await connection.query(`SELECT l.id FROM lessons l WHERE l.group_id=:id AND l.deleted_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM attendances a WHERE a.lesson_id=l.id AND a.marked_at IS NOT NULL)
          AND NOT EXISTS (SELECT 1 FROM lesson_photos ph WHERE ph.lesson_id=l.id AND ph.deleted_at IS NULL)
          AND NOT EXISTS (SELECT 1 FROM salary_accruals sa WHERE sa.lesson_id=l.id AND sa.reversed_at IS NULL AND sa.total_amount<>0)
          AND NOT EXISTS (SELECT 1 FROM children c WHERE c.created_from_lesson_id=l.id)
          AND NOT EXISTS (
            SELECT 1 FROM attendances a JOIN balance_entries debit ON debit.attendance_id=a.id
            LEFT JOIN balance_entries reversal ON reversal.reversal_of_entry_id=debit.id
            WHERE a.lesson_id=l.id AND debit.entry_type<>'reversal' AND reversal.id IS NULL
              AND (debit.lessons_delta<>0 OR debit.amount_delta<>0)
          ) FOR UPDATE`, { id: groupId });
        for (const lesson of safeLessons) {
          await connection.query(`DELETE blc FROM balance_lot_consumptions blc JOIN balance_entries debit ON debit.id=blc.balance_entry_id
            JOIN attendances a ON a.id=debit.attendance_id WHERE a.lesson_id=:lessonId`, { lessonId: lesson.id });
          await connection.query(`DELETE reversal FROM balance_entries reversal JOIN balance_entries debit ON debit.id=reversal.reversal_of_entry_id
            JOIN attendances a ON a.id=debit.attendance_id WHERE a.lesson_id=:lessonId`, { lessonId: lesson.id });
          await connection.query(`DELETE debit FROM balance_entries debit JOIN attendances a ON a.id=debit.attendance_id
            WHERE a.lesson_id=:lessonId`, { lessonId: lesson.id });
          await connection.query('UPDATE salary_accruals SET supersedes_accrual_id=NULL WHERE lesson_id=:lessonId', { lessonId: lesson.id });
          await connection.query('DELETE FROM salary_accruals WHERE lesson_id=:lessonId', { lessonId: lesson.id });
          await connection.query('DELETE FROM lesson_photos WHERE lesson_id=:lessonId', { lessonId: lesson.id });
          await connection.query('DELETE FROM attendances WHERE lesson_id=:lessonId', { lessonId: lesson.id });
          await connection.query('DELETE FROM lesson_roster_members WHERE lesson_id=:lessonId', { lessonId: lesson.id });
          await connection.query('DELETE FROM lessons WHERE id=:lessonId', { lessonId: lesson.id });
        }
        await connection.query('DELETE FROM group_memberships WHERE group_id=:id', { id: groupId });
        const [dependencyRows] = await connection.query(`SELECT
          (SELECT COUNT(*) FROM group_memberships WHERE group_id=:id) memberships,
          (SELECT COUNT(*) FROM lessons WHERE group_id=:id AND deleted_at IS NULL) lessons,
          (SELECT COUNT(*) FROM attendances a JOIN lessons l ON l.id=a.lesson_id WHERE l.group_id=:id AND l.deleted_at IS NULL AND a.marked_at IS NOT NULL) attendances,
          (SELECT COUNT(*) FROM children c JOIN lessons l ON l.id=c.created_from_lesson_id WHERE l.group_id=:id) quickChildren,
          (SELECT COUNT(*) FROM child_status_history WHERE group_id_snapshot=:id) childStatusHistory,
          (SELECT COUNT(*) FROM enrollment_status_history WHERE group_id_snapshot=:id) enrollmentStatusHistory,
          (SELECT COUNT(*) FROM payments WHERE group_id_snapshot=:id AND deleted_at IS NULL) payments,
          (SELECT COUNT(*) FROM refunds WHERE group_id_snapshot=:id AND deleted_at IS NULL) refunds`, { id: groupId });
        const dependencies = dependencyRows[0] ?? {};
        if (hasAny(dependencies)) throw new ApiProblem(409, 'GROUP_HAS_DEPENDENCIES', `Нельзя удалить группу. Остались зависимости: ${dependencyNames(dependencies)}.`, dependencies);
        await connection.query('DELETE FROM lessons WHERE group_id=:id AND deleted_at IS NOT NULL', { id: groupId });
        await connection.query('DELETE FROM price_versions WHERE group_id=:id', { id: groupId });
        await connection.query('DELETE FROM study_groups WHERE id=:id', { id: groupId });
        if (notifyProject) await connection.query(`INSERT INTO notifications
          (role_code,recipient_project_id,notification_type,title,body,entity_type,entity_id)
          VALUES ('partner',:projectId,'project_change',:title,:body,'group',:groupId)`, {
          projectId: notifyProject.project_id, title: 'Группа удалена директором',
          body: `Директор удалил группу «${notifyProject.name}» вашего проекта.`, groupId,
        });
      });
    } catch (error) {
      if (error?.code === 'ER_ROW_IS_REFERENCED_2') throw new ApiProblem(409, 'GROUP_HAS_DEPENDENCIES', 'Нельзя удалить группу, потому что есть участники, занятия, посещения, оплаты или другая история.');
      throw error;
    }
    return null;
  }

  async function deleteEnrollment(rawId) {
    const enrollmentId = numericId(rawId, 'enrollmentId');
    try {
      await inTransaction(pool, async (connection) => {
        const [foundRows] = await connection.query('SELECT id,child_id,balance_lessons FROM child_enrollments WHERE id=:id FOR UPDATE', { id: enrollmentId });
        const enrollment = foundRows[0];
        if (!enrollment) throw new ApiProblem(404, 'NOT_FOUND', 'Направление ребёнка не найдено');

        const [childEnrollments] = await connection.query('SELECT id FROM child_enrollments WHERE child_id=:childId FOR UPDATE', { childId: enrollment.child_id });
        if (childEnrollments.length <= 1) throw new ApiProblem(409, 'LAST_ENROLLMENT', 'Нельзя удалить последнее направление ребёнка. Сначала добавьте другое направление или удалите карточку ребёнка, если она создана ошибочно.');

        const [dependencyRows] = await connection.query(`SELECT
          (SELECT COUNT(*) FROM payments WHERE enrollment_id=:id AND deleted_at IS NULL) payments,
          (SELECT COUNT(*) FROM refunds WHERE enrollment_id=:id AND deleted_at IS NULL) refunds,
          (SELECT COUNT(*) FROM attendances WHERE enrollment_id=:id AND marked_at IS NOT NULL) attendances,
          (SELECT COUNT(*) FROM group_memberships WHERE enrollment_id=:id AND ended_on IS NULL) memberships,
          (SELECT COUNT(*) FROM balance_transfers WHERE source_enrollment_id=:id OR target_enrollment_id=:id) balanceTransfers,
          (SELECT COUNT(*) FROM enrollment_project_transfers WHERE source_enrollment_id=:id OR target_enrollment_id=:id) projectTransfers,
          (SELECT COUNT(*) FROM balance_entries original
            LEFT JOIN balance_entries reversal ON reversal.reversal_of_entry_id=original.id
            WHERE original.enrollment_id=:id AND original.entry_type<>'reversal' AND reversal.id IS NULL
              AND (original.lessons_delta<>0 OR original.amount_delta<>0)) balanceEffects`, { id: enrollmentId });
        const dependencies = dependencyRows[0] ?? {};
        dependencies.balance = Number(enrollment.balance_lessons) === 0 ? 0 : 1;
        if (hasAny(dependencies)) throw new ApiProblem(409, 'ENROLLMENT_HAS_HISTORY', `Нельзя удалить направление. Остались зависимости: ${dependencyNames(dependencies)}.`, dependencies);

        await purgeEnrollmentLedger(connection, enrollmentId);
        await connection.query('DELETE FROM attendances WHERE enrollment_id=:id AND marked_at IS NULL', { id: enrollmentId });
        await connection.query('DELETE FROM group_memberships WHERE enrollment_id=:id', { id: enrollmentId });
        await connection.query('DELETE FROM enrollment_status_history WHERE enrollment_id=:id', { id: enrollmentId });
        await connection.query('DELETE FROM price_versions WHERE enrollment_id=:id', { id: enrollmentId });
        await connection.query('DELETE FROM child_enrollments WHERE id=:id', { id: enrollmentId });
      });
    } catch (error) {
      if (error?.code === 'ER_ROW_IS_REFERENCED_2') throw new ApiProblem(409, 'ENROLLMENT_HAS_HISTORY', 'Нельзя удалить направление ребёнка, потому что по нему уже есть оплаты, посещения или другая история.');
      throw error;
    }
    return null;
  }

  return { deleteSite, deleteTeacher, deleteGroup, deleteEnrollment };
}

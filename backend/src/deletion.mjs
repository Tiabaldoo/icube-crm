import { inTransaction } from './db.mjs';
import { ApiProblem } from './catalog.mjs';

const numericId = (value, field = 'id') => {
  const result = String(value ?? '').trim();
  if (!/^[1-9]\d*$/.test(result)) throw new ApiProblem(400, 'VALIDATION_ERROR', `Некорректное поле ${field}`);
  return result;
};
const hasAny = (dependencies) => Object.values(dependencies).some((value) => Number(value) > 0);

export function createDeletionService(pool) {
  async function rows(sql, params = {}) { const [result] = await pool.query(sql, params); return result; }
  async function one(sql, params = {}) { return (await rows(sql, params))[0] ?? null; }
  async function ensureExists(table, resourceId, label) {
    const found = await one(`SELECT id FROM ${table} WHERE id=:id AND deleted_at IS NULL LIMIT 1`, { id: resourceId });
    if (!found) throw new ApiProblem(404, 'NOT_FOUND', `${label} не найдена`);
  }

  async function deleteSite(rawId) {
    const siteId = numericId(rawId, 'siteId');
    await ensureExists('sites', siteId, 'Площадка');
    const dependencies = await one(`SELECT
      (SELECT COUNT(*) FROM study_groups WHERE site_id=:id) groupCount,
      (SELECT COUNT(*) FROM lessons WHERE site_id_snapshot=:id) lessons`, { id: siteId });
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
      (SELECT COUNT(*) FROM lessons WHERE planned_teacher_id=:id OR actual_teacher_id=:id) lessons,
      (SELECT COUNT(*) FROM salary_rate_versions WHERE teacher_id=:id) salaryRateVersions,
      (SELECT COUNT(*) FROM salary_accruals WHERE teacher_id=:id) salaryAccruals,
      (SELECT COUNT(*) FROM teachers WHERE id=:id AND user_id IS NOT NULL) userAccounts`, { id: teacherId });
    if (hasAny(dependencies)) throw new ApiProblem(409, 'TEACHER_HAS_DEPENDENCIES', 'Нельзя удалить преподавателя, потому что он назначен в группы, связан с аккаунтом или фигурирует в занятиях/истории.', dependencies);
    try {
      await inTransaction(pool, async (connection) => {
        await connection.query('DELETE FROM teacher_directions WHERE teacher_id=:id', { id: teacherId });
        await connection.query('DELETE FROM teachers WHERE id=:id', { id: teacherId });
      });
    } catch (error) {
      if (error?.code === 'ER_ROW_IS_REFERENCED_2') throw new ApiProblem(409, 'TEACHER_HAS_DEPENDENCIES', 'Нельзя удалить преподавателя, потому что он назначен в группы или фигурирует в занятиях/истории.');
      throw error;
    }
    return null;
  }

  async function deleteGroup(rawId) {
    const groupId = numericId(rawId, 'groupId');
    await ensureExists('study_groups', groupId, 'Группа');
    const dependencies = await one(`SELECT
      (SELECT COUNT(*) FROM group_memberships WHERE group_id=:id) memberships,
      (SELECT COUNT(*) FROM lessons WHERE group_id=:id) lessons,
      (SELECT COUNT(*) FROM attendances a JOIN lessons l ON l.id=a.lesson_id WHERE l.group_id=:id) attendances,
      (SELECT COUNT(*) FROM price_versions WHERE group_id=:id) priceVersions,
      (SELECT COUNT(*) FROM child_status_history WHERE group_id_snapshot=:id) childStatusHistory,
      (SELECT COUNT(*) FROM enrollment_status_history WHERE group_id_snapshot=:id) enrollmentStatusHistory,
      (SELECT COUNT(*) FROM payments WHERE group_id_snapshot=:id) payments,
      (SELECT COUNT(*) FROM refunds WHERE group_id_snapshot=:id) refunds`, { id: groupId });
    if (hasAny(dependencies)) throw new ApiProblem(409, 'GROUP_HAS_DEPENDENCIES', 'Нельзя удалить группу, потому что есть участники, занятия, посещения, оплаты или другая история.', dependencies);
    try { await pool.query('DELETE FROM study_groups WHERE id=:id', { id: groupId }); }
    catch (error) {
      if (error?.code === 'ER_ROW_IS_REFERENCED_2') throw new ApiProblem(409, 'GROUP_HAS_DEPENDENCIES', 'Нельзя удалить группу, потому что есть участники, занятия, посещения, оплаты или другая история.');
      throw error;
    }
    return null;
  }

  return { deleteSite, deleteTeacher, deleteGroup };
}

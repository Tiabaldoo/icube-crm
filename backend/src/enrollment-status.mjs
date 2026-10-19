import { ApiProblem } from './catalog.mjs';
import { businessDate } from '../../src/shared/business-time.mjs';
import { partnerProjectId } from './project-scope.mjs';
import { assertGroupCapacity } from './group-settings.mjs';

export const enrollmentStatuses = new Set(['lead', 'active', 'paused', 'finished']);
export function aggregateChildStatus(enrollments, fallback) {
  return ['active', 'paused', 'lead', 'finished'].find(status => enrollments.some(e => e.status === status)) ?? fallback;
}

export async function lockStatusChild(connection, childId) {
  const [rows] = await connection.query('SELECT id,status FROM children WHERE id=:childId AND deleted_at IS NULL FOR UPDATE', { childId });
  if (!rows.length) throw new ApiProblem(404, 'NOT_FOUND', 'Ребёнок не найден');
  return rows[0];
}

export async function lockEnrollmentStatusChild(connection, enrollmentId) {
  const [rows] = await connection.query('SELECT child_id FROM child_enrollments WHERE id=:enrollmentId', { enrollmentId });
  if (!rows.length) throw new ApiProblem(404, 'NOT_FOUND', 'Направление ребёнка не найдено');
  await lockStatusChild(connection, rows[0].child_id);
}

export async function refreshChildStatus(connection, childId, actorId = null) {
  const child = await lockStatusChild(connection, childId);
  const [enrollments] = await connection.query(`SELECT id,status FROM child_enrollments
    WHERE child_id=:childId AND superseded_at IS NULL ORDER BY id FOR UPDATE`, { childId });
  const status = aggregateChildStatus(enrollments, child.status);
  if (status !== child.status) {
    await connection.query('UPDATE children SET status=:status WHERE id=:childId', { childId, status });
    await connection.query(`INSERT INTO child_status_history (child_id,old_status,new_status,changed_by_user_id)
      VALUES (:childId,:old,:next,:actorId)`, { childId, old: child.status, next: status, actorId });
  }
  return status;
}

export async function setEnrollmentStatus(connection, enrollment, status, actorId = null) {
  if (!enrollmentStatuses.has(status)) throw new ApiProblem(400, 'VALIDATION_ERROR', 'Некорректный статус направления');
  if (enrollment.status === status) return;
  const [groups] = await connection.query('SELECT group_id FROM group_memberships WHERE enrollment_id=:id AND ended_on IS NULL ORDER BY id DESC LIMIT 1', {id: enrollment.id});
  if (enrollment.status === 'finished' && status !== 'finished' && groups.length) {
    await assertGroupCapacity(connection, groups[0].group_id, {childId:enrollment.child_id,enrollmentId:enrollment.id});
  }
  await connection.query('UPDATE child_enrollments SET status=:status,ended_on=CASE WHEN :endedOn<started_on THEN started_on ELSE :endedOn END WHERE id=:id', {
    id: enrollment.id, status, endedOn: status === 'finished' ? businessDate() : null,
  });
  await connection.query(`INSERT INTO enrollment_status_history
    (enrollment_id,old_status,new_status,direction_id_snapshot,group_id_snapshot,project_id_snapshot,changed_by_user_id)
    VALUES (:id,:old,:next,:directionId,:groupId,:projectId,:actorId)`, {
    id: enrollment.id, old: enrollment.status, next: status, directionId: enrollment.direction_id,
    groupId: groups[0]?.group_id ?? null, projectId: enrollment.project_id, actorId,
  });
}

// Caller owns the transaction. No memberships or financial rows are written.
export async function applyChildStatus(connection, childId, body, context) {
  if (!(context.roles ?? []).some(role => ['director', 'partner'].includes(role))) {
    throw new ApiProblem(403, 'FORBIDDEN', 'Изменение статусов недоступно');
  }
  if (!enrollmentStatuses.has(body.status)) throw new ApiProblem(400, 'VALIDATION_ERROR', 'Некорректный статус');
  await lockStatusChild(connection, childId);
  const [rows] = await connection.query(`SELECT e.id,e.child_id,e.status,e.direction_id,e.project_id,
    (SELECT gm.group_id FROM group_memberships gm WHERE gm.enrollment_id=e.id AND gm.ended_on IS NULL ORDER BY gm.id DESC LIMIT 1) group_id
    FROM child_enrollments e WHERE e.child_id=:childId AND e.superseded_at IS NULL ORDER BY e.id FOR UPDATE`, { childId });
  const projectId = partnerProjectId(context);
  const owned = rows.filter(e => projectId == null || String(e.project_id) === String(projectId));
  if (!owned.length) throw new ApiProblem(403, 'FORBIDDEN', 'Нет доступных направлений текущего проекта');
  let targets = owned;
  if (['active', 'lead'].includes(body.status)) {
    if (!Array.isArray(body.enrollmentIds) || !body.enrollmentIds.length) {
      throw new ApiProblem(400, 'STATUS_SELECTION_REQUIRED', 'Выберите хотя бы одно направление');
    }
    const ids = new Set(body.enrollmentIds.map(String));
    targets = owned.filter(e => ids.has(String(e.id)));
    if (targets.length !== ids.size) throw new ApiProblem(403, 'FORBIDDEN', 'Выбрано недоступное направление');
  } else if (body.status === 'paused') {
    targets = owned.filter(e => e.status !== 'finished');
    if (!targets.length) throw new ApiProblem(409, 'NO_UNFINISHED_ENROLLMENTS',
      'Все доступные направления завершены. Чтобы возобновить направление на паузе, измените его статус в «Настройках направления».');
  }
  for (const e of targets) await setEnrollmentStatus(connection, e, body.status, context.userId ?? null);
  return refreshChildStatus(connection, childId, context.userId ?? null);
}

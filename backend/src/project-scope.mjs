import { ApiProblem } from './catalog.mjs';

export function partnerProjectId(context = {}) {
  if (!(context.roles ?? []).includes('partner') || (context.roles ?? []).includes('director')) return null;
  const ids = context.projectIds ?? [];
  if (ids.length !== 1) throw new ApiProblem(403, 'FORBIDDEN', 'Партнёр не связан с одним активным проектом');
  return String(ids[0]);
}

export function assertProjectScope(context, projectId) {
  const owned = partnerProjectId(context);
  if (owned && String(projectId ?? '') !== owned) throw new ApiProblem(403, 'FORBIDDEN', 'Объект другого проекта недоступен');
}

const ownershipSql = {
  sites: 'SELECT project_id FROM sites WHERE id=:id AND deleted_at IS NULL',
  groups: 'SELECT project_id FROM study_groups WHERE id=:id AND deleted_at IS NULL',
  enrollments: 'SELECT project_id FROM child_enrollments WHERE id=:id',
  payments: 'SELECT project_id_snapshot project_id FROM payments WHERE id=:id AND deleted_at IS NULL',
  refunds: 'SELECT project_id_snapshot project_id FROM refunds WHERE id=:id AND deleted_at IS NULL',
  lessons: 'SELECT project_id_snapshot project_id FROM lessons WHERE id=:id AND deleted_at IS NULL',
  teachers: 'SELECT project_id FROM teacher_projects WHERE teacher_id=:id',
  children: `SELECT project_id FROM child_enrollments WHERE child_id=:id AND superseded_at IS NULL`,
  transfers: `SELECT se.project_id source_project_id,te.project_id target_project_id
    FROM balance_transfers bt JOIN child_enrollments se ON se.id=bt.source_enrollment_id
    JOIN child_enrollments te ON te.id=bt.target_enrollment_id WHERE bt.id=:id`,
};

export async function assertOwned(pool, resource, rawId, context, { exclusiveChild = false } = {}) {
  const owned = partnerProjectId(context);
  if (!owned) return;
  const id = String(rawId ?? '');
  if (!/^[1-9]\d*$/.test(id)) throw new ApiProblem(400, 'VALIDATION_ERROR', 'Некорректный id');
  const [rows] = await pool.query(ownershipSql[resource], { id });
  const allowed = rows.some((row) => resource === 'transfers'
    ? String(row.source_project_id) === owned && String(row.target_project_id) === owned
    : String(row.project_id) === owned);
  if (!allowed || (exclusiveChild && rows.some((row) => String(row.project_id) !== owned))) {
    throw new ApiProblem(403, 'FORBIDDEN', 'Объект другого проекта недоступен');
  }
}

import { ApiProblem } from './catalog.mjs';
import { partnerProjectId } from './project-scope.mjs';

const identifier = (value) => {
  const result = String(value ?? '').trim();
  if (!/^[1-9]\d*$/.test(result)) throw new ApiProblem(400, 'VALIDATION_ERROR', 'Некорректный id уведомления');
  return result;
};
const hasRole = (context, role) => (context.roles ?? []).includes(role);
const isoDateTime = (value) => {
  if (value == null) return null;
  if (typeof value !== 'string') return value.toISOString();
  return `${value.slice(0, 10)}T${value.slice(11, 19)}Z`;
};

export function createNotifications(pool) {
  function scope(context = {}) {
    if (!hasRole(context, 'director') && !hasRole(context, 'partner')) {
      throw new ApiProblem(403, 'FORBIDDEN', 'Уведомления недоступны');
    }
    const projectId = partnerProjectId(context);
    return { userId: context.userId ?? null, roleCode: projectId ? 'partner' : 'director', projectId };
  }

  async function list(context = {}) {
    const params = scope(context);
    const [rows] = await pool.query(`SELECT id,notification_type,title,body,entity_type,entity_id,created_at,read_at
      FROM notifications WHERE (user_id=:userId OR (user_id IS NULL AND role_code=:roleCode))
        AND (:projectId IS NULL OR recipient_project_id=:projectId)
        AND dismissed_at IS NULL
      ORDER BY created_at DESC,id DESC LIMIT 50`, params);
    return rows.map((row) => ({
      id: String(row.id), type: row.notification_type, title: row.title, body: row.body,
      entityType: row.entity_type, entityId: row.entity_id == null ? null : String(row.entity_id),
      createdAt: isoDateTime(row.created_at), readAt: isoDateTime(row.read_at),
    }));
  }

  async function markRead(notificationId, context = {}) {
    const id = identifier(notificationId);
    const params = scope(context);
    const [rows] = await pool.query(`SELECT id,user_id,role_code,recipient_project_id,read_at
      FROM notifications WHERE id=:id AND dismissed_at IS NULL`, { id });
    const notification = rows[0];
    if (!notification) throw new ApiProblem(404, 'NOT_FOUND', 'Уведомление не найдено');

    const addressedToActor = notification.user_id != null
      ? String(notification.user_id) === String(params.userId)
      : notification.role_code === params.roleCode;
    const projectAllowed = params.projectId == null
      || String(notification.recipient_project_id ?? '') === String(params.projectId);
    if (!addressedToActor || !projectAllowed) {
      throw new ApiProblem(403, 'FORBIDDEN', 'Уведомление другого проекта недоступно');
    }

    await pool.query('UPDATE notifications SET read_at=COALESCE(read_at,NOW(6)) WHERE id=:id', { id });
    return { id, read: true };
  }

  return { list, markRead };
}

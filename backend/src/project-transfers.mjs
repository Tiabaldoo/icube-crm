import { inTransaction } from './db.mjs';
import { ApiProblem } from './catalog.mjs';
import { lessonUnits } from './lesson-rules.mjs';
import { assertProjectScope, partnerProjectId } from './project-scope.mjs';

const identifier = (value, field) => {
  const result = String(value ?? '');
  if (!/^[1-9]\d*$/.test(result)) throw new ApiProblem(400, 'VALIDATION_ERROR', `Некорректный ${field}`);
  return result;
};

export function createProjectTransfers(pool, balanceTransfers) {
  async function create(enrollmentId, body, context) {
    enrollmentId = identifier(enrollmentId, 'enrollmentId');
    const targetProjectId = identifier(body.projectId, 'projectId');
    return inTransaction(pool, async (connection) => {
      const [sources] = await connection.query(`SELECT e.*,c.full_name,d.name direction_name,p.name source_project_name
        FROM child_enrollments e JOIN children c ON c.id=e.child_id JOIN directions d ON d.id=e.direction_id
        JOIN projects p ON p.id=e.project_id WHERE e.id=:id FOR UPDATE`, { id: enrollmentId });
      const source = sources[0];
      if (!source || source.superseded_at != null) throw new ApiProblem(404, 'NOT_FOUND', 'Текущее направление не найдено');
      assertProjectScope(context, source.project_id);
      const [targets] = await connection.query('SELECT id,name,code FROM projects WHERE id=:id AND active=TRUE', { id: targetProjectId });
      const target = targets[0];
      if (!target) throw new ApiProblem(404, 'PROJECT_NOT_FOUND', 'Целевой проект не найден');
      if (String(source.project_id) === targetProjectId) throw new ApiProblem(409, 'SAME_PROJECT', 'Направление уже принадлежит этому проекту');
      if (partnerProjectId(context) && target.code !== 'icube-robots') {
        throw new ApiProblem(403, 'FORBIDDEN', 'Партнёр может переводить направление только в iCubeRobots');
      }
      if (lessonUnits(String(source.balance_lessons)) < 0n) {
        throw new ApiProblem(409, 'NEGATIVE_BALANCE', 'Перед межпроектным переносом необходимо закрыть долг направления');
      }
      const [current] = await connection.query(`SELECT id FROM child_enrollments WHERE child_id=:childId
        AND direction_id=:directionId AND superseded_at IS NULL AND id<>:id FOR UPDATE`, {
        childId: source.child_id, directionId: source.direction_id, id: source.id,
      });
      if (current.length) throw new ApiProblem(409, 'ENROLLMENT_EXISTS', 'У ребёнка уже есть активная запись этого направления');
      const [membership] = await connection.query(`SELECT gm.id,gm.group_id,g.name FROM group_memberships gm JOIN study_groups g ON g.id=gm.group_id
        WHERE gm.enrollment_id=:id AND gm.ended_on IS NULL ORDER BY gm.started_on DESC,gm.id DESC LIMIT 1 FOR UPDATE`, { id: enrollmentId });
      await connection.query(`UPDATE child_enrollments SET status='finished',ended_on=CURDATE(),superseded_at=NOW(6) WHERE id=:id`, { id: enrollmentId });
      if (source.status !== 'finished') await connection.query(`INSERT INTO enrollment_status_history
        (enrollment_id,old_status,new_status,direction_id_snapshot,group_id_snapshot,project_id_snapshot,changed_by_user_id)
        VALUES (:enrollmentId,:oldStatus,'finished',:directionId,:groupId,:projectId,:actorId)`, {
        enrollmentId, oldStatus: source.status, directionId: source.direction_id,
        groupId: membership[0]?.group_id ?? null, projectId: source.project_id, actorId: context.userId,
      });
      await connection.query('UPDATE group_memberships SET ended_on=CURDATE() WHERE enrollment_id=:id AND ended_on IS NULL', { id: enrollmentId });
      const [inserted] = await connection.query(`INSERT INTO child_enrollments
        (child_id,direction_id,project_id,status,individual_price,started_on)
        VALUES (:childId,:directionId,:projectId,'active',:price,CURDATE())`, {
        childId: source.child_id, directionId: source.direction_id, projectId: targetProjectId, price: source.individual_price,
      });
      const newEnrollmentId = String(inserted.insertId);
      if (source.individual_price != null) await connection.query(`INSERT INTO price_versions
        (scope_type,enrollment_id,price,valid_from) VALUES ('enrollment',:id,:price,NOW(6))`, {
        id: newEnrollmentId, price: source.individual_price,
      });
      let moneyTransfer = null;
      if (lessonUnits(String(source.balance_lessons)) > 0n) {
        moneyTransfer = await balanceTransfers.create({ sourceEnrollmentId: enrollmentId, targetEnrollmentId: newEnrollmentId }, {
          actorUserId: context.userId, connection,
        });
      }
      const [result] = await connection.query(`INSERT INTO enrollment_project_transfers
        (child_id,source_enrollment_id,target_enrollment_id,source_project_id,target_project_id,balance_transfer_id,created_by_user_id)
        VALUES (:childId,:sourceId,:targetId,:sourceProjectId,:targetProjectId,:balanceTransferId,:actorId)`, {
        childId: source.child_id, sourceId: enrollmentId, targetId: newEnrollmentId, sourceProjectId: source.project_id,
        targetProjectId, balanceTransferId: moneyTransfer?.id ?? null, actorId: context.userId,
      });
      const recipientRole = target.code === 'icube-robots' ? 'director' : 'partner';
      await connection.query(`INSERT INTO notifications(role_code,recipient_project_id,notification_type,title,body,entity_type,entity_id)
        VALUES (:roleCode,:recipientProjectId,'project_transfer',:title,:body,'child',:childId)`, {
        roleCode: recipientRole, recipientProjectId: recipientRole === 'partner' ? targetProjectId : null,
        title: 'Ребёнок переведён в проект',
        body: `Ребёнок ${source.full_name} переведён из ${source.source_project_name} в ${target.name}. Необходимо определить группу.`,
        childId: source.child_id,
      });
      return { id: String(result.insertId), childId: String(source.child_id), sourceEnrollmentId: enrollmentId,
        targetEnrollmentId: newEnrollmentId, sourceProjectId: String(source.project_id), targetProjectId,
        balanceTransferId: moneyTransfer?.id ?? null, removedGroupName: membership[0]?.name ?? null };
    });
  }
  return { create };
}

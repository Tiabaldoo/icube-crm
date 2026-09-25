import { inTransaction } from './db.mjs';
import { ApiProblem } from './catalog.mjs';
import { lessonUnits } from './lesson-rules.mjs';
import { normalizeMoney } from './payments.mjs';
import { assertProjectScope } from './project-scope.mjs';
import { businessDate } from '../../src/shared/business-time.mjs';

const identifier = (value, field = 'id') => {
  const result = String(value ?? '').trim();
  if (!/^[1-9]\d*$/.test(result)) throw new ApiProblem(400, 'VALIDATION_ERROR', `Некорректное поле ${field}`);
  return result;
};

const statuses = new Set(['active', 'paused', 'finished']);
const samePrice = (left, right) => left == null && right == null
  || left != null && right != null && normalizeMoney(left) === normalizeMoney(right);

function mysqlError(error) {
  if (error instanceof ApiProblem) return error;
  if (error?.code === 'ER_DUP_ENTRY') return new ApiProblem(409, 'ENROLLMENT_EXISTS', 'У ребёнка уже есть это направление');
  if (error?.code === 'ER_NO_REFERENCED_ROW_2') return new ApiProblem(400, 'INVALID_REFERENCE', 'Связанная запись не найдена');
  return error;
}

export function createEnrollmentChanges(pool, balanceTransfers, { notificationEvents = null } = {}) {
  async function changeDirection(sourceEnrollmentId, body, context = {}) {
    sourceEnrollmentId = identifier(sourceEnrollmentId, 'enrollmentId');
    const targetDirectionId = identifier(body.directionId, 'directionId');
    const targetStatus = body.status ?? 'active';
    if (!statuses.has(targetStatus) || targetStatus === 'finished') {
      throw new ApiProblem(400, 'VALIDATION_ERROR', 'Новое направление должно быть активным или на паузе');
    }
    const requestedPrice = body.individualPrice === undefined || body.individualPrice === '' || body.individualPrice == null
      ? null : normalizeMoney(body.individualPrice, 'individualPrice');
    const operationDate = businessDate();

    try {
      return await inTransaction(pool, async (connection) => {
        const [sources] = await connection.query('SELECT * FROM child_enrollments WHERE id=:id FOR UPDATE', { id: sourceEnrollmentId });
        const source = sources[0];
        if (!source) throw new ApiProblem(404, 'NOT_FOUND', 'Направление ребёнка не найдено');
        assertProjectScope(context, source.project_id);

        const [directions] = await connection.query('SELECT id FROM directions WHERE id=:id AND active=TRUE', { id: targetDirectionId });
        if (!directions.length) throw new ApiProblem(404, 'DIRECTION_NOT_FOUND', 'Новое направление не найдено');
        const targetGroupId = body.groupId == null || body.groupId === '' ? null : identifier(body.groupId, 'groupId');
        if (targetGroupId != null) {
          const [groups] = await connection.query(`SELECT id FROM study_groups
            WHERE id=:groupId AND direction_id=:directionId AND project_id=:projectId AND deleted_at IS NULL`, {
            groupId: targetGroupId, directionId: targetDirectionId, projectId: source.project_id,
          });
          if (!groups.length) throw new ApiProblem(400, 'GROUP_DIRECTION_MISMATCH', 'Группа относится к другому направлению или проекту');
        }

        const [targets] = await connection.query(`SELECT * FROM child_enrollments
          WHERE child_id=:childId AND direction_id=:directionId AND superseded_at IS NULL AND id<>:sourceId
          ORDER BY id DESC LIMIT 1 FOR UPDATE`, {
          childId: source.child_id, directionId: targetDirectionId, sourceId: sourceEnrollmentId,
        });
        let target = targets[0] ?? null;
        if (target && String(target.project_id) !== String(source.project_id)) {
          throw new ApiProblem(409, 'PROJECT_TRANSFER_REQUIRED', 'Направление уже существует в другом проекте');
        }

        const sameDirection = String(source.direction_id) === targetDirectionId;
        if (sameDirection && samePrice(source.individual_price, requestedPrice)) {
          throw new ApiProblem(400, 'PRICE_NOT_CHANGED', 'Индивидуальная цена не изменилась');
        }

        if (source.status === 'finished' || source.superseded_at != null) {
          if (target) {
            const [completed] = await connection.query(`SELECT id FROM balance_transfers
              WHERE source_enrollment_id=:sourceId AND target_enrollment_id=:targetId LIMIT 1`, {
              sourceId: sourceEnrollmentId, targetId: target.id,
            });
            if (completed.length || lessonUnits(String(source.balance_lessons)) === 0n) {
              return { childId: String(source.child_id), sourceEnrollmentId, targetEnrollmentId: String(target.id),
                balanceTransferId: completed[0] == null ? null : String(completed[0].id), repeated: true };
            }
          }
          throw new ApiProblem(409, 'ENROLLMENT_ALREADY_CHANGED', 'Направление уже было изменено');
        }

        const sourceBalance = lessonUnits(String(source.balance_lessons));
        if (sameDirection && sourceBalance < 0n) {
          throw new ApiProblem(409, 'NEGATIVE_BALANCE', 'Нельзя изменить цену при отрицательном балансе');
        }
        if (target && !samePrice(target.individual_price, requestedPrice)
          && lessonUnits(String(target.balance_lessons)) !== 0n) {
          throw new ApiProblem(409, 'TARGET_HAS_BALANCE', 'Сначала нужно очистить остаток существующего нового направления');
        }

        const [membershipRows] = await connection.query(`SELECT id,group_id FROM group_memberships
          WHERE enrollment_id=:id AND ended_on IS NULL ORDER BY started_on DESC,id DESC LIMIT 1 FOR UPDATE`, { id: sourceEnrollmentId });
        const sourceGroupId = membershipRows[0]?.group_id ?? null;
        await connection.query(`UPDATE child_enrollments SET status='finished',ended_on=GREATEST(:businessDate,started_on),
          superseded_at=IF(:sameDirection,NOW(6),superseded_at) WHERE id=:id`, {
          id: sourceEnrollmentId, sameDirection, businessDate: operationDate,
        });
        await connection.query(`UPDATE group_memberships SET ended_on=GREATEST(:businessDate,started_on)
          WHERE enrollment_id=:id AND ended_on IS NULL`, { id: sourceEnrollmentId, businessDate: operationDate });
        if (source.status !== 'finished') {
          await connection.query(`INSERT INTO enrollment_status_history
            (enrollment_id,old_status,new_status,direction_id_snapshot,group_id_snapshot,project_id_snapshot,changed_by_user_id)
            VALUES (:id,:old,'finished',:directionId,:groupId,:projectId,:actorId)`, {
            id: sourceEnrollmentId, old: source.status, directionId: source.direction_id, groupId: sourceGroupId,
            projectId: source.project_id, actorId: context.userId ?? null,
          });
        }

        if (target) {
          const [targetMemberships] = await connection.query(`SELECT id,group_id FROM group_memberships
            WHERE enrollment_id=:id AND ended_on IS NULL ORDER BY started_on DESC,id DESC LIMIT 1 FOR UPDATE`, { id: target.id });
          await connection.query(`UPDATE child_enrollments SET status=:status,individual_price=:price,ended_on=NULL WHERE id=:id`, {
            id: target.id, status: targetStatus, price: requestedPrice,
          });
          if (target.status !== targetStatus) {
            await connection.query(`INSERT INTO enrollment_status_history
              (enrollment_id,old_status,new_status,direction_id_snapshot,group_id_snapshot,project_id_snapshot,changed_by_user_id)
              VALUES (:id,:old,:next,:directionId,:groupId,:projectId,:actorId)`, {
              id: target.id, old: target.status, next: targetStatus, directionId: target.direction_id,
              groupId: targetGroupId, projectId: target.project_id, actorId: context.userId ?? null,
            });
          }
          if (!samePrice(target.individual_price, requestedPrice)) {
            await connection.query(`UPDATE price_versions SET valid_to=NOW(6)
              WHERE scope_type='enrollment' AND enrollment_id=:id AND valid_to IS NULL`, { id: target.id });
            if (requestedPrice != null) await connection.query(`INSERT INTO price_versions
              (scope_type,enrollment_id,price,valid_from,created_by_user_id)
              VALUES ('enrollment',:id,:price,NOW(6),:actorId)`, { id: target.id, price: requestedPrice, actorId: context.userId ?? null });
          }
          if (String(targetMemberships[0]?.group_id ?? '') !== String(targetGroupId ?? '')) {
            await connection.query(`UPDATE group_memberships SET ended_on=GREATEST(:businessDate,started_on)
              WHERE enrollment_id=:id AND ended_on IS NULL`, { id: target.id, businessDate: operationDate });
            if (targetGroupId != null) {
              const [membershipResult] = await connection.query(`INSERT INTO group_memberships
                (enrollment_id,group_id,started_on) VALUES (:id,:groupId,:businessDate)`, {
                id: target.id, groupId: targetGroupId, businessDate: operationDate,
              });
              if (notificationEvents) await notificationEvents.childAddedToGroup(connection, {
                groupId: targetGroupId, childId: source.child_id, actorUserId: context.userId,
                causeKey: `membership-${membershipResult.insertId}`,
              });
            }
          }
        } else {
          const [inserted] = await connection.query(`INSERT INTO child_enrollments
            (child_id,direction_id,project_id,status,individual_price,started_on)
            VALUES (:childId,:directionId,:projectId,:status,:price,:businessDate)`, {
            childId: source.child_id, directionId: targetDirectionId, projectId: source.project_id,
            status: targetStatus, price: requestedPrice, businessDate: operationDate,
          });
          target = { id: inserted.insertId, balance_lessons: '0.00000000' };
          if (requestedPrice != null) await connection.query(`INSERT INTO price_versions
            (scope_type,enrollment_id,price,valid_from,created_by_user_id)
            VALUES ('enrollment',:id,:price,NOW(6),:actorId)`, { id: target.id, price: requestedPrice, actorId: context.userId ?? null });
          if (targetGroupId != null) {
            const [membershipResult] = await connection.query(`INSERT INTO group_memberships
              (enrollment_id,group_id,started_on) VALUES (:id,:groupId,:businessDate)`, {
              id: target.id, groupId: targetGroupId, businessDate: operationDate,
            });
            if (notificationEvents) await notificationEvents.childAddedToGroup(connection, {
              groupId: targetGroupId, childId: source.child_id, actorUserId: context.userId,
              causeKey: `membership-${membershipResult.insertId}`,
            });
          }
        }

        let transfer = null;
        if (sourceBalance > 0n) {
          transfer = await balanceTransfers.create({ sourceEnrollmentId, targetEnrollmentId: String(target.id) }, {
            actorUserId: context.userId, idempotencyKey: context.idempotencyKey,
            connection, allowSameDirection: sameDirection,
          });
        }
        return { childId: String(source.child_id), sourceEnrollmentId, targetEnrollmentId: String(target.id),
          balanceTransferId: transfer?.id ?? null, repeated: false };
      });
    } catch (error) { throw mysqlError(error); }
  }

  return { changeDirection };
}

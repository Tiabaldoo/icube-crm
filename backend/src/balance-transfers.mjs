import { inTransaction } from './db.mjs';
import { ApiProblem } from './catalog.mjs';
import { calculateLessonsCredit, normalizeMoney } from './payments.mjs';
import { lessonDecimal, lessonUnits, moneyCents, moneyDecimal, planFifoConsumption } from './lesson-rules.mjs';
import { scopedIdempotencyKey } from './idempotency.mjs';

const identifier = (value, field = 'id') => {
  const result = String(value ?? '').trim();
  if (!/^[1-9]\d*$/.test(result)) throw new ApiProblem(400, 'VALIDATION_ERROR', `Некорректное поле ${field}`);
  return result;
};

const mapTransfer = (row) => ({
  id: String(row.id), childId: String(row.child_id), sourceEnrollmentId: String(row.source_enrollment_id),
  targetEnrollmentId: String(row.target_enrollment_id), transferredAmount: String(row.transferred_amount),
  targetPriceSnapshot: String(row.target_price_snapshot), targetLessonsCredit: String(row.target_lessons_credit),
  transferredAt: typeof row.transferred_at === 'string' ? row.transferred_at : row.transferred_at.toISOString(),
  sourceDirectionName: row.source_direction_name ?? null, targetDirectionName: row.target_direction_name ?? null,
  automaticChangeDirection: Boolean(row.automatic_change_direction),
});

function mysqlError(error) {
  if (error instanceof ApiProblem) return error;
  if (error?.code === 'ER_DUP_ENTRY') return new ApiProblem(409, 'TRANSFER_ALREADY_EXISTS', 'Этот перенос уже выполнен');
  if (error?.code === 'ER_NO_REFERENCED_ROW_2') return new ApiProblem(400, 'INVALID_REFERENCE', 'Связанная запись не найдена');
  if (error?.code === 'ER_ROW_IS_REFERENCED_2') return new ApiProblem(409, 'TRANSFER_HAS_PROJECT_HISTORY', 'Денежный перенос связан с переводом направления между проектами');
  return error;
}

export function calculateTransferPlan(balanceLessons, lots, targetPrice) {
  const balance = lessonUnits(balanceLessons);
  if (balance <= 0n) throw new ApiProblem(409, 'NO_TRANSFERABLE_BALANCE', 'У старого направления нет положительного остатка');
  const totalLots = lots.reduce((sum, lot) => sum + lessonUnits(lot.remainingLessons ?? lot.remaining_lessons), 0n);
  if (totalLots < balance) throw new ApiProblem(409, 'BALANCE_LEDGER_INCONSISTENT', 'Положительный баланс не подтверждён историческими лотами');
  let debt = totalLots - balance; const debtAdjustments = []; const transferableLots = [];
  for (const lot of lots) {
    const available = lessonUnits(lot.remainingLessons ?? lot.remaining_lessons);
    const absorbed = debt < available ? debt : available; debt -= absorbed;
    if (absorbed > 0n) debtAdjustments.push({ lotId: String(lot.id), lessons: lessonDecimal(absorbed) });
    const transferable = available - absorbed;
    if (transferable > 0n) transferableLots.push({ ...lot, remaining_lessons: lessonDecimal(transferable) });
  }
  const consumption = planFifoConsumption(transferableLots, lessonDecimal(balance), '0.00');
  if (lessonUnits(consumption.uncoveredLessons) !== 0n) throw new ApiProblem(409, 'BALANCE_LEDGER_INCONSISTENT', 'Положительный баланс не подтверждён историческими лотами');
  const amount = moneyDecimal(moneyCents(consumption.amount));
  if (moneyCents(amount) <= 0n) throw new ApiProblem(409, 'NO_TRANSFERABLE_BALANCE', 'У старого направления нет денежного остатка для переноса');
  const price = normalizeMoney(targetPrice, 'targetPrice');
  return { sourceBalance: lessonDecimal(balance), amount, targetPrice: price,
    targetCredit: calculateLessonsCredit(amount, price), debtAdjustments, consumptions: consumption.consumptions };
}

export function fundedTransferLessons(credit, balanceBefore) {
  const creditUnits = lessonUnits(credit); const balanceUnits = lessonUnits(balanceBefore ?? '0');
  const funded = balanceUnits < 0n ? creditUnits + balanceUnits : creditUnits;
  return lessonDecimal(funded > 0n ? funded : 0n);
}

export function createBalanceTransfers(pool) {
  const enrollmentSql = `SELECT e.id,e.child_id,e.direction_id,e.project_id,e.status,e.balance_lessons,
    COALESCE(
      (SELECT pv.price FROM price_versions pv WHERE pv.scope_type='enrollment' AND pv.enrollment_id=e.id AND pv.valid_from<=NOW(6) AND (pv.valid_to IS NULL OR pv.valid_to>NOW(6)) ORDER BY pv.valid_from DESC,pv.id DESC LIMIT 1),
      CASE WHEN NOT EXISTS (SELECT 1 FROM price_versions pv WHERE pv.scope_type='enrollment' AND pv.enrollment_id=e.id) THEN e.individual_price END,
      (SELECT pv.price FROM price_versions pv WHERE pv.scope_type='group' AND pv.group_id=gm.group_id AND pv.valid_from<=NOW(6) AND (pv.valid_to IS NULL OR pv.valid_to>NOW(6)) ORDER BY pv.valid_from DESC,pv.id DESC LIMIT 1),
      (SELECT pv.price FROM price_versions pv WHERE pv.scope_type='direction' AND pv.direction_id=e.direction_id
        AND (pv.project_id=e.project_id OR pv.project_id IS NULL) AND pv.valid_from<=NOW(6)
        AND (pv.valid_to IS NULL OR pv.valid_to>NOW(6))
        ORDER BY (pv.project_id IS NOT NULL) DESC,pv.valid_from DESC,pv.id DESC LIMIT 1)
    ) current_price
    FROM child_enrollments e
    LEFT JOIN group_memberships gm ON gm.id=(SELECT gm2.id FROM group_memberships gm2 WHERE gm2.enrollment_id=e.id AND gm2.started_on<=CURDATE() AND (gm2.ended_on IS NULL OR gm2.ended_on>=CURDATE()) ORDER BY gm2.started_on DESC,gm2.id DESC LIMIT 1)
    WHERE e.id IN (:sourceId,:targetId) ORDER BY e.id FOR UPDATE`;

  async function loadPlan(connection, sourceId, targetId, { allowSameDirection = false } = {}) {
    sourceId = identifier(sourceId, 'sourceEnrollmentId'); targetId = identifier(targetId, 'targetEnrollmentId');
    if (sourceId === targetId) throw new ApiProblem(400, 'SAME_ENROLLMENT', 'Направления переноса должны отличаться');
    const [rows] = await connection.query(enrollmentSql, { sourceId, targetId });
    const source = rows.find((row) => String(row.id) === sourceId); const target = rows.find((row) => String(row.id) === targetId);
    if (!source || !target) throw new ApiProblem(404, 'ENROLLMENT_NOT_FOUND', 'Направление ребёнка не найдено');
    if (String(source.child_id) !== String(target.child_id)) throw new ApiProblem(409, 'DIFFERENT_CHILDREN', 'Перенос возможен только между направлениями одного ребёнка');
    if (!allowSameDirection && String(source.direction_id) === String(target.direction_id) && String(source.project_id) === String(target.project_id)) {
      throw new ApiProblem(409, 'SAME_DIRECTION', 'Перенос между одинаковыми направлениями одного проекта невозможен');
    }
    if (source.status !== 'finished') throw new ApiProblem(409, 'SOURCE_NOT_FINISHED', 'Старое направление должно иметь статус «Закончил»');
    if (target.status === 'finished') throw new ApiProblem(409, 'TARGET_FINISHED', 'Новое направление не должно иметь статус «Закончил»');
    const sourceBalance = lessonUnits(String(source.balance_lessons));
    if (sourceBalance <= 0n) throw new ApiProblem(409, 'NO_TRANSFERABLE_BALANCE', 'У старого направления нет положительного остатка');
    if (target.current_price == null) throw new ApiProblem(409, 'PRICE_NOT_CONFIGURED', 'Для нового направления не настроена цена занятия');
    const [lots] = await connection.query(`SELECT id,remaining_lessons,unit_price FROM balance_lots
      WHERE enrollment_id=:sourceId AND remaining_lessons>0 ORDER BY created_at,id FOR UPDATE`, { sourceId });
    return { source, target, lots, ...calculateTransferPlan(lessonDecimal(sourceBalance), lots, target.current_price) };
  }

  async function preview(sourceId, targetId) {
    try { return await inTransaction(pool, async (connection) => {
      const plan = await loadPlan(connection, sourceId, targetId);
      return { sourceEnrollmentId: String(plan.source.id), targetEnrollmentId: String(plan.target.id),
        transferableAmount: plan.amount, targetPriceSnapshot: plan.targetPrice, targetLessonsCredit: plan.targetCredit };
    }); } catch (error) { throw mysqlError(error); }
  }

  async function list(filters = {}) {
    const conditions = []; const params = {};
    if (filters.childId != null && filters.childId !== '') { conditions.push('bt.child_id=:childId'); params.childId = identifier(filters.childId, 'childId'); }
    if (filters.projectId != null && filters.projectId !== '') { conditions.push('se.project_id=:projectId AND te.project_id=:projectId'); params.projectId = identifier(filters.projectId, 'projectId'); }
    const [rows] = await pool.query(`SELECT bt.*,sd.name source_direction_name,td.name target_direction_name,
      EXISTS (
        SELECT 1 FROM enrollment_status_history esh
        WHERE esh.enrollment_id=bt.source_enrollment_id
          AND esh.old_status IN ('active','paused') AND esh.new_status='finished'
          AND esh.changed_by_user_id <=> bt.created_by_user_id
          AND esh.changed_at BETWEEN bt.transferred_at - INTERVAL 5 SECOND AND bt.transferred_at
      ) automatic_change_direction
      FROM balance_transfers bt
      JOIN child_enrollments se ON se.id=bt.source_enrollment_id JOIN directions sd ON sd.id=se.direction_id
      JOIN child_enrollments te ON te.id=bt.target_enrollment_id JOIN directions td ON td.id=te.direction_id
      ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''} ORDER BY bt.transferred_at DESC,bt.id DESC`, params);
    return rows.map(mapTransfer);
  }

  async function getByIdempotencyKey(key, executor = pool) {
    if (!key) return null;
    const [rows] = await executor.query(`SELECT bt.* FROM balance_entries be JOIN balance_transfers bt ON bt.id=be.transfer_id
      WHERE be.idempotency_key=:key AND be.entry_type='transfer_out' LIMIT 1`, { key });
    return rows[0] ? mapTransfer(rows[0]) : null;
  }

  async function operationIdempotencyKey(body, context) {
    if (context.idempotencyKey == null) return null;
    const sourceId = identifier(body.sourceEnrollmentId, 'sourceEnrollmentId');
    const targetId = identifier(body.targetEnrollmentId, 'targetEnrollmentId');
    const [rows] = await (context.connection ?? pool).query(`SELECT id,project_id FROM child_enrollments
      WHERE id IN (:sourceId,:targetId) ORDER BY id`, { sourceId, targetId });
    const source = rows.find((row) => String(row.id) === sourceId); const target = rows.find((row) => String(row.id) === targetId);
    if (!source || !target) throw new ApiProblem(404, 'ENROLLMENT_NOT_FOUND', 'Направление ребёнка не найдено');
    return scopedIdempotencyKey({
      key: context.idempotencyKey, actorUserId: context.actorUserId, operation: 'balance-transfer',
      projectId: `${source.project_id}->${target.project_id}`, entity: `${sourceId}->${targetId}`,
    });
  }

  async function create(body, context = {}) {
    const idempotencyKey = await operationIdempotencyKey(body, context);
    const existing = await getByIdempotencyKey(idempotencyKey, context.connection ?? pool); if (existing) return existing;
    try {
      const transferId = await (context.connection ? async (fn) => fn(context.connection) : (fn) => inTransaction(pool, fn))(async (connection) => {
        const plan = await loadPlan(connection, body.sourceEnrollmentId, body.targetEnrollmentId, context);
        const [transfer] = await connection.query(`INSERT INTO balance_transfers
          (child_id,source_enrollment_id,target_enrollment_id,transferred_amount,target_price_snapshot,target_lessons_credit,created_by_user_id)
          VALUES (:childId,:sourceId,:targetId,:amount,:targetPrice,:targetCredit,:actorId)`, {
          childId: plan.source.child_id, sourceId: plan.source.id, targetId: plan.target.id, amount: plan.amount,
          targetPrice: plan.targetPrice, targetCredit: plan.targetCredit, actorId: context.actorUserId ?? null,
        });
        const [outEntry] = await connection.query(`INSERT INTO balance_entries
          (enrollment_id,entry_type,lessons_delta,amount_delta,transfer_id,idempotency_key,occurred_at,created_by_user_id)
          VALUES (:sourceId,'transfer_out',:lessons,:amount,:transferId,:idempotencyKey,NOW(6),:actorId)`, {
          sourceId: plan.source.id, lessons: lessonDecimal(-lessonUnits(plan.sourceBalance)), amount: moneyDecimal(-moneyCents(plan.amount)),
          transferId: transfer.insertId, idempotencyKey, actorId: context.actorUserId ?? null,
        });
        const reductions = new Map();
        for (const item of [...plan.debtAdjustments, ...plan.consumptions]) {
          reductions.set(String(item.lotId), (reductions.get(String(item.lotId)) ?? 0n) + lessonUnits(item.lessons));
        }
        for (const item of plan.debtAdjustments) {
          await connection.query('UPDATE balance_lots SET remaining_lessons=remaining_lessons-:lessons WHERE id=:id', { id: item.lotId, lessons: item.lessons });
        }
        for (const item of plan.consumptions) {
          await connection.query('UPDATE balance_lots SET remaining_lessons=remaining_lessons-:lessons WHERE id=:id', { id: item.lotId, lessons: item.lessons });
          await connection.query(`INSERT INTO balance_lot_consumptions (balance_lot_id,balance_entry_id,lessons,amount)
            VALUES (:lotId,:entryId,:lessons,:amount)`, { lotId: item.lotId, entryId: outEntry.insertId, lessons: item.lessons, amount: item.amount });
        }
        await connection.query('UPDATE child_enrollments SET balance_lessons=0 WHERE id=:id', { id: plan.source.id });
        const [inEntry] = await connection.query(`INSERT INTO balance_entries
          (enrollment_id,entry_type,lessons_delta,amount_delta,unit_price_snapshot,transfer_id,occurred_at,created_by_user_id)
          VALUES (:targetId,'transfer_in',:lessons,:amount,:price,:transferId,NOW(6),:actorId)`, {
          targetId: plan.target.id, lessons: plan.targetCredit, amount: plan.amount, price: plan.targetPrice,
          transferId: transfer.insertId, actorId: context.actorUserId ?? null,
        });
        const targetLotLessons = fundedTransferLessons(plan.targetCredit, plan.target.balance_lessons);
        await connection.query('UPDATE child_enrollments SET balance_lessons=balance_lessons+:lessons WHERE id=:id', { id: plan.target.id, lessons: plan.targetCredit });
        const [targetLot] = await connection.query(`INSERT INTO balance_lots
          (enrollment_id,source_balance_entry_id,original_lessons,remaining_lessons,unit_price)
          VALUES (:targetId,:entryId,:lessons,:remainingLessons,:price)`, {
          targetId: plan.target.id, entryId: inEntry.insertId, lessons: plan.targetCredit, remainingLessons: targetLotLessons, price: plan.targetPrice,
        });
        const lotById = new Map(plan.lots.map((lot) => [String(lot.id), lot]));
        for (const [lotId, reducedUnits] of reductions) {
          const before = lessonUnits(String(lotById.get(lotId).remaining_lessons));
          await connection.query(`INSERT INTO balance_transfer_lot_changes
            (transfer_id,balance_lot_id,change_type,lessons_delta,remaining_before,remaining_after)
            VALUES (:transferId,:lotId,'source_reduction',:lessons,:before,:after)`, {
            transferId: transfer.insertId, lotId, lessons: lessonDecimal(reducedUnits), before: lessonDecimal(before), after: lessonDecimal(before - reducedUnits),
          });
        }
        await connection.query(`INSERT INTO balance_transfer_lot_changes
          (transfer_id,balance_lot_id,change_type,lessons_delta,remaining_before,remaining_after)
          VALUES (:transferId,:lotId,'target_created',:lessons,'0.00000000',:remainingAfter)`, {
          transferId: transfer.insertId, lotId: targetLot.insertId, lessons: plan.targetCredit, remainingAfter: targetLotLessons,
        });
        return String(transfer.insertId);
      });
      const [rows] = await (context.connection ?? pool).query('SELECT * FROM balance_transfers WHERE id=:id', { id: transferId });
      return mapTransfer(rows[0]);
    } catch (error) {
      if (error?.code === 'ER_DUP_ENTRY' && idempotencyKey) {
        const repeated = await getByIdempotencyKey(idempotencyKey, context.connection ?? pool);
        if (repeated) return repeated;
      }
      throw mysqlError(error);
    }
  }

  async function remove(rawTransferId) {
    const transferId = identifier(rawTransferId);
    try {
      await inTransaction(pool, async (connection) => {
        const [transfers] = await connection.query('SELECT * FROM balance_transfers WHERE id=:id FOR UPDATE', { id: transferId });
        if (!transfers.length) throw new ApiProblem(404, 'NOT_FOUND', 'Перенос не найден или уже отменён');
        const transfer = transfers[0];
        await connection.query('SELECT id FROM child_enrollments WHERE id IN (:sourceId,:targetId) ORDER BY id FOR UPDATE', {
          sourceId: transfer.source_enrollment_id, targetId: transfer.target_enrollment_id,
        });
        const [entries] = await connection.query(`SELECT id,enrollment_id,entry_type,lessons_delta FROM balance_entries
          WHERE transfer_id=:id AND entry_type IN ('transfer_out','transfer_in') ORDER BY id FOR UPDATE`, { id: transferId });
        const outEntry = entries.find((entry) => entry.entry_type === 'transfer_out');
        const inEntry = entries.find((entry) => entry.entry_type === 'transfer_in');
        if (!outEntry || !inEntry || entries.length !== 2) throw new ApiProblem(409, 'TRANSFER_LEDGER_INCONSISTENT', 'Перенос нельзя восстановить однозначно');
        const [changes] = await connection.query(`SELECT c.*,bl.original_lessons,bl.remaining_lessons,bl.source_balance_entry_id
          FROM balance_transfer_lot_changes c JOIN balance_lots bl ON bl.id=c.balance_lot_id
          WHERE c.transfer_id=:id ORDER BY c.id FOR UPDATE`, { id: transferId });
        const targetChange = changes.find((change) => change.change_type === 'target_created');
        const sourceChanges = changes.filter((change) => change.change_type === 'source_reduction');
        if (!targetChange || !sourceChanges.length || String(targetChange.source_balance_entry_id) !== String(inEntry.id)) {
          throw new ApiProblem(409, 'TRANSFER_REVERSAL_UNAVAILABLE', 'Нельзя отменить перенос: для него нет полной истории изменения остатка.');
        }
        const [dependencies] = await connection.query(`SELECT 1 FROM balance_lot_consumptions
          WHERE balance_lot_id=:lotId LIMIT 1 FOR UPDATE`, { lotId: targetChange.balance_lot_id });
        const [entryDependencies] = await connection.query(`SELECT 1 FROM balance_entries
          WHERE reversal_of_entry_id IN (:outEntryId,:inEntryId) LIMIT 1 FOR UPDATE`, { outEntryId: outEntry.id, inEntryId: inEntry.id });
        if (dependencies.length || entryDependencies.length || lessonUnits(String(targetChange.remaining_lessons)) !== lessonUnits(String(targetChange.remaining_after))) {
          throw new ApiProblem(409, 'TRANSFER_ALREADY_USED', 'Нельзя отменить перенос: перенесённый остаток уже использован.');
        }
        for (const change of sourceChanges) {
          if (lessonUnits(String(change.remaining_lessons)) !== lessonUnits(String(change.remaining_after))) {
            throw new ApiProblem(409, 'TRANSFER_ALREADY_USED', 'Нельзя отменить перенос: после переноса изменилась финансовая история исходного направления.');
          }
          const restored = lessonUnits(String(change.remaining_lessons)) + lessonUnits(String(change.lessons_delta));
          if (restored > lessonUnits(String(change.original_lessons))) throw new ApiProblem(409, 'TRANSFER_LEDGER_INCONSISTENT', 'Исходная партия не может быть восстановлена точно');
        }
        for (const change of sourceChanges) {
          await connection.query('UPDATE balance_lots SET remaining_lessons=remaining_lessons+:lessons WHERE id=:id', { id: change.balance_lot_id, lessons: String(change.lessons_delta) });
        }
        await connection.query('UPDATE child_enrollments SET balance_lessons=balance_lessons-:lessons WHERE id=:id', { id: transfer.target_enrollment_id, lessons: String(inEntry.lessons_delta) });
        await connection.query('UPDATE child_enrollments SET balance_lessons=balance_lessons+:lessons WHERE id=:id', { id: transfer.source_enrollment_id, lessons: lessonDecimal(-lessonUnits(String(outEntry.lessons_delta))) });
        await connection.query('DELETE FROM balance_lot_consumptions WHERE balance_entry_id=:entryId', { entryId: outEntry.id });
        await connection.query('DELETE FROM balance_transfer_lot_changes WHERE transfer_id=:id', { id: transferId });
        await connection.query('DELETE FROM balance_lots WHERE id=:id', { id: targetChange.balance_lot_id });
        await connection.query('DELETE FROM balance_entries WHERE transfer_id=:id', { id: transferId });
        await connection.query('DELETE FROM balance_transfers WHERE id=:id', { id: transferId });
      });
      return null;
    } catch (error) { throw mysqlError(error); }
  }

  return { list, preview, create, remove };
}

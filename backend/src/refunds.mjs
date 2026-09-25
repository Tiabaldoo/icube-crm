import { inTransaction } from './db.mjs';
import { ApiProblem } from './catalog.mjs';
import { calculateLessonsCredit, normalizeMoney } from './payments.mjs';
import { lessonDecimal, lessonUnits, moneyCents, moneyDecimal } from './lesson-rules.mjs';
import { parseCalendarDate } from '../../src/shared/business-time.mjs';
import { scopedIdempotencyKey } from './idempotency.mjs';
import { loadPaymentLineage } from './balance-lineage.mjs';

function identifier(value, field = 'id') {
  const result = String(value ?? '').trim();
  if (!/^[1-9]\d*$/.test(result)) throw new ApiProblem(400, 'VALIDATION_ERROR', `Некорректное поле ${field}`);
  return result;
}
function refundDate(value) {
  try { return parseCalendarDate(value, 'Некорректная дата возврата'); }
  catch { throw new ApiProblem(400, 'VALIDATION_ERROR', 'Некорректная дата возврата'); }
}
const isoDate = (value) => typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
const mapRefund = (row) => ({
  id: String(row.id), paymentId: String(row.payment_id), enrollmentId: String(row.enrollment_id),
  childId: String(row.child_id), childName: row.child_name, directionId: String(row.direction_id), directionName: row.direction_name,
  groupId: row.group_id_snapshot == null ? null : String(row.group_id_snapshot),
  projectId: row.project_id_snapshot == null ? null : String(row.project_id_snapshot),
  refundedOn: isoDate(row.refunded_on), amount: String(row.amount), priceSnapshot: String(row.price_snapshot),
  lessonsDebit: String(row.lessons_debit), reason: row.reason, paymentMethod: row.payment_method,
});
function mysqlError(error) {
  if (error instanceof ApiProblem) return error;
  if (error?.code === 'ER_DUP_ENTRY') return new ApiProblem(409, 'CONFLICT', 'Операция уже существует');
  if (error?.code === 'ER_NO_REFERENCED_ROW_2') return new ApiProblem(400, 'INVALID_REFERENCE', 'Связанная запись не найдена');
  if (error?.code === 'ER_ROW_IS_REFERENCED_2') return new ApiProblem(409, 'REFUND_HAS_HISTORY', 'Возврат связан с последующей историей');
  return error;
}

export function createMysqlRefunds(pool) {
  const refundSelect = `SELECT r.id,r.payment_id,r.enrollment_id,r.child_id,c.full_name child_name,
    r.direction_id,d.name direction_name,r.group_id_snapshot,r.project_id_snapshot,r.refunded_on,r.amount,
    r.price_snapshot,r.lessons_debit,r.reason,p.method payment_method
    FROM refunds r JOIN payments p ON p.id=r.payment_id JOIN children c ON c.id=r.child_id JOIN directions d ON d.id=r.direction_id`;
  async function queryRows(sql, params = {}) { const [rows] = await pool.query(sql, params); return rows; }
  async function list(filters = {}) {
    const conditions = ['r.deleted_at IS NULL']; const params = {};
    for (const [field, column] of [['childId', 'r.child_id'], ['enrollmentId', 'r.enrollment_id'], ['paymentId', 'r.payment_id']]) {
      if (filters[field] != null && filters[field] !== '') { conditions.push(`${column}=:${field}`); params[field] = identifier(filters[field], field); }
    }
    if (filters.projectId != null && filters.projectId !== '') { conditions.push('r.project_id_snapshot=:projectId'); params.projectId = identifier(filters.projectId, 'projectId'); }
    return (await queryRows(`${refundSelect} WHERE ${conditions.join(' AND ')} ORDER BY r.refunded_on DESC,r.id DESC`, params)).map(mapRefund);
  }
  async function get(refundId) {
    const rows = await queryRows(`${refundSelect} WHERE r.id=:id AND r.deleted_at IS NULL`, { id: identifier(refundId) });
    if (!rows.length) throw new ApiProblem(404, 'NOT_FOUND', 'Возврат не найден');
    return mapRefund(rows[0]);
  }
  function refundPlan(lineage, amount) {
    let left = moneyCents(amount);
    const items = [];
    for (const allocation of lineage.allocations) {
      if (left <= 0n) break;
      const chunk = allocation.availableCents < left ? allocation.availableCents : left;
      if (chunk <= 0n) continue;
      const amountText = moneyDecimal(chunk);
      const lessons = calculateLessonsCredit(amountText, allocation.unitPrice);
      if (lessonUnits(lessons) > lessonUnits(allocation.remainingLessons)) {
        throw new ApiProblem(409, 'REFUND_LEDGER_INCONSISTENT', 'Недостаточно остатка в текущей партии для возврата');
      }
      items.push({ ...allocation, amount: amountText, lessons });
      left -= chunk;
    }
    if (left > 0n) throw new ApiProblem(409, 'REFUND_LEDGER_INCONSISTENT', 'Денежный остаток оплаты не найден в текущих партиях');
    return items;
  }

  async function create(body, context = {}) {
    try {
      const refundId = await inTransaction(pool, async (connection) => {
        const paymentId = identifier(body.paymentId, 'paymentId');
        const date = refundDate(body.refundedOn);
        const amount = normalizeMoney(body.amount);
        const [payments] = await connection.query(`SELECT id,enrollment_id,child_id,direction_id,group_id_snapshot,project_id_snapshot,
          paid_on,amount,price_snapshot,method FROM payments WHERE id=:id AND deleted_at IS NULL FOR UPDATE`, { id: paymentId });
        if (!payments.length) throw new ApiProblem(404, 'PAYMENT_NOT_FOUND', 'Оплата не найдена');
        const payment = payments[0];
        if (date < isoDate(payment.paid_on)) throw new ApiProblem(400, 'REFUND_BEFORE_PAYMENT', 'Дата возврата не может быть раньше даты оплаты');
        const idempotencyKey = context.idempotencyKey == null ? null : scopedIdempotencyKey({
          key: context.idempotencyKey, actorUserId: context.actorUserId, operation: 'refund',
          projectId: payment.project_id_snapshot, entity: payment.id,
        });
        if (idempotencyKey) {
          const [existing] = await connection.query(`SELECT refund_id FROM balance_entries
            WHERE idempotency_key=:idempotencyKey AND entry_type='refund' LIMIT 1`, { idempotencyKey });
          if (existing.length) return String(existing[0].refund_id);
        }

        const [totals] = await connection.query(`SELECT COALESCE(SUM(amount),0) refunded_amount FROM refunds
          WHERE payment_id=:paymentId AND deleted_at IS NULL`, { paymentId });
        const lineage = await loadPaymentLineage(connection, paymentId, { lock: true, payment });
        if (!lineage) throw new ApiProblem(409, 'REFUND_LEDGER_INCONSISTENT', 'Не удалось восстановить денежную историю оплаты');
        const paymentLeft = moneyCents(String(payment.amount)) - moneyCents(String(totals[0].refunded_amount));
        const availableCents = lineage.availableCents < paymentLeft ? lineage.availableCents : paymentLeft;
        const available = moneyDecimal(availableCents > 0n ? availableCents : 0n);
        if (moneyCents(amount) > availableCents) {
          throw new ApiProblem(409, 'REFUND_EXCEEDS_AVAILABLE', `Доступно к возврату не более ${available} ₽`);
        }

        const applications = refundPlan(lineage, amount);
        const lessons = calculateLessonsCredit(amount, payment.price_snapshot);
        const [result] = await connection.query(`INSERT INTO refunds
          (enrollment_id,child_id,direction_id,payment_id,group_id_snapshot,project_id_snapshot,refunded_on,amount,price_snapshot,lessons_debit,reason,created_by_user_id)
          VALUES (:enrollmentId,:childId,:directionId,:paymentId,:groupId,:projectId,:refundedOn,:amount,:price,:lessons,:reason,:actorId)`, {
          enrollmentId: payment.enrollment_id, childId: payment.child_id, directionId: payment.direction_id, paymentId,
          groupId: payment.group_id_snapshot, projectId: payment.project_id_snapshot, refundedOn: date, amount,
          price: String(payment.price_snapshot), lessons, reason: body.reason == null || body.reason === '' ? null : String(body.reason).trim(),
          actorId: context.actorUserId ?? null,
        });
        const [entry] = await connection.query(`INSERT INTO balance_entries
          (enrollment_id,entry_type,lessons_delta,amount_delta,unit_price_snapshot,refund_id,idempotency_key,occurred_at,created_by_user_id)
          VALUES (:enrollmentId,'refund',:lessons,:amount,:price,:refundId,:idempotencyKey,CONCAT(:refundedOn,' 12:00:00'),:actorId)`, {
          enrollmentId: payment.enrollment_id, lessons: lessonDecimal(-lessonUnits(lessons)), amount: `-${amount}`,
          price: String(payment.price_snapshot), refundId: result.insertId, idempotencyKey,
          refundedOn: date, actorId: context.actorUserId ?? null,
        });

        const enrollmentDebits = new Map();
        for (const application of applications) {
          await connection.query('UPDATE balance_lots SET remaining_lessons=remaining_lessons-:lessons WHERE id=:id', {
            id: application.lotId, lessons: application.lessons,
          });
          await connection.query(`INSERT INTO balance_lot_consumptions (balance_lot_id,balance_entry_id,lessons,amount)
            VALUES (:lotId,:entryId,:lessons,:amount)`, {
            lotId: application.lotId, entryId: entry.insertId, lessons: application.lessons, amount: application.amount,
          });
          const key = String(application.enrollmentId);
          enrollmentDebits.set(key, (enrollmentDebits.get(key) ?? 0n) + lessonUnits(application.lessons));
        }
        for (const enrollmentId of [...enrollmentDebits.keys()].sort((a, b) => Number(a) - Number(b))) {
          await connection.query('UPDATE child_enrollments SET balance_lessons=balance_lessons-:lessons WHERE id=:id', {
            id: enrollmentId, lessons: lessonDecimal(enrollmentDebits.get(enrollmentId)),
          });
        }
        return String(result.insertId);
      });
      return get(refundId);
    } catch (error) { throw mysqlError(error); }
  }

  async function remove(refundId) {
    refundId = identifier(refundId);
    try {
      await inTransaction(pool, async (connection) => {
        const [refunds] = await connection.query('SELECT * FROM refunds WHERE id=:id AND deleted_at IS NULL FOR UPDATE', { id: refundId });
        if (!refunds.length) throw new ApiProblem(404, 'NOT_FOUND', 'Возврат не найден');
        const refund = refunds[0];
        const [entries] = await connection.query(`SELECT id FROM balance_entries WHERE refund_id=:id AND entry_type='refund' FOR UPDATE`, { id: refundId });
        if (entries.length !== 1) throw new ApiProblem(409, 'REFUND_LEDGER_INCONSISTENT', 'Не найдена единственная запись баланса возврата');
        const entryId = entries[0].id;

        const [applications] = await connection.query(`SELECT blc.id,blc.balance_lot_id,blc.lessons,blc.amount,
            bl.enrollment_id,bl.original_lessons,bl.remaining_lessons
          FROM balance_lot_consumptions blc JOIN balance_lots bl ON bl.id=blc.balance_lot_id
          WHERE blc.balance_entry_id=:entryId ORDER BY bl.id FOR UPDATE`, { entryId });

        if (applications.length) {
          const [dependencies] = await connection.query(`SELECT 1 FROM balance_lot_consumptions applied
            JOIN balance_lot_consumptions later ON later.balance_lot_id=applied.balance_lot_id AND later.id>applied.id
            WHERE applied.balance_entry_id=:entryId LIMIT 1 FOR UPDATE`, { entryId });
          if (dependencies.length) throw new ApiProblem(409, 'REFUND_HAS_HISTORY', 'Возврат связан с последующей финансовой историей');

          const enrollmentCredits = new Map();
          for (const application of applications) {
            if (lessonUnits(String(application.remaining_lessons)) + lessonUnits(String(application.lessons)) > lessonUnits(String(application.original_lessons))) {
              throw new ApiProblem(409, 'REFUND_LEDGER_INCONSISTENT', 'Партия возврата не может быть безопасно восстановлена');
            }
            await connection.query('UPDATE balance_lots SET remaining_lessons=remaining_lessons+:lessons WHERE id=:id', {
              id: application.balance_lot_id, lessons: String(application.lessons),
            });
            const key = String(application.enrollment_id);
            enrollmentCredits.set(key, (enrollmentCredits.get(key) ?? 0n) + lessonUnits(String(application.lessons)));
          }
          for (const enrollmentId of [...enrollmentCredits.keys()].sort((a, b) => Number(a) - Number(b))) {
            await connection.query('UPDATE child_enrollments SET balance_lessons=balance_lessons+:lessons WHERE id=:id', {
              id: enrollmentId, lessons: lessonDecimal(enrollmentCredits.get(enrollmentId)),
            });
          }
          await connection.query('DELETE FROM balance_lot_consumptions WHERE balance_entry_id=:entryId', { entryId });
        } else {
          const [dependencies] = await connection.query(`SELECT 1 FROM balance_entries be
            LEFT JOIN balance_lot_consumptions blc ON blc.balance_entry_id=be.id
            WHERE (be.reversal_of_entry_id=:entryId OR blc.balance_entry_id=:entryId) LIMIT 1`, { entryId });
          if (dependencies.length) throw new ApiProblem(409, 'REFUND_HAS_HISTORY', 'Возврат связан с последующей финансовой историей');
          const [lots] = await connection.query(`SELECT bl.id,bl.original_lessons,bl.remaining_lessons FROM balance_entries be
            JOIN balance_lots bl ON bl.source_balance_entry_id=be.id
            WHERE be.payment_id=:paymentId AND be.entry_type='payment' FOR UPDATE`, { paymentId: refund.payment_id });
          if (lots.length !== 1 || lessonUnits(String(lots[0].remaining_lessons)) + lessonUnits(String(refund.lessons_debit)) > lessonUnits(String(lots[0].original_lessons))) {
            throw new ApiProblem(409, 'REFUND_LEDGER_INCONSISTENT', 'Партия исходной оплаты не может быть безопасно восстановлена');
          }
          await connection.query('SELECT id FROM child_enrollments WHERE id=:id FOR UPDATE', { id: refund.enrollment_id });
          await connection.query('UPDATE balance_lots SET remaining_lessons=remaining_lessons+:lessons WHERE id=:id', { id: lots[0].id, lessons: String(refund.lessons_debit) });
          await connection.query('UPDATE child_enrollments SET balance_lessons=balance_lessons+:lessons WHERE id=:id', { id: refund.enrollment_id, lessons: String(refund.lessons_debit) });
        }
        await connection.query('DELETE FROM balance_entries WHERE id=:id', { id: entryId });
        await connection.query('DELETE FROM refunds WHERE id=:id', { id: refundId });
      });
      return null;
    } catch (error) { throw mysqlError(error); }
  }
  return { list, get, create, remove };
}

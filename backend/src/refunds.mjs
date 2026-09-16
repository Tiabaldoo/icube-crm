import { inTransaction } from './db.mjs';
import { ApiProblem } from './catalog.mjs';
import { calculateLessonsCredit, normalizeMoney, refundablePaymentAmount } from './payments.mjs';
import { lessonDecimal, lessonUnits } from './lesson-rules.mjs';

function identifier(value, field = 'id') {
  const result = String(value ?? '').trim();
  if (!/^[1-9]\d*$/.test(result)) throw new ApiProblem(400, 'VALIDATION_ERROR', `Некорректное поле ${field}`);
  return result;
}
function refundDate(value) {
  const result = String(value ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new ApiProblem(400, 'VALIDATION_ERROR', 'Некорректная дата возврата');
  return result;
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
  async function create(body, context = {}) {
    try {
      const refundId = await inTransaction(pool, async (connection) => {
        const paymentId = identifier(body.paymentId, 'paymentId');
        const date = refundDate(body.refundedOn);
        const amount = normalizeMoney(body.amount);
        const [payments] = await connection.query(`SELECT id,enrollment_id,child_id,direction_id,group_id_snapshot,project_id_snapshot,
          amount,price_snapshot,method FROM payments WHERE id=:id AND deleted_at IS NULL FOR UPDATE`, { id: paymentId });
        if (!payments.length) throw new ApiProblem(404, 'PAYMENT_NOT_FOUND', 'Оплата не найдена');
        const payment = payments[0];
        const [enrollments] = await connection.query('SELECT id,balance_lessons FROM child_enrollments WHERE id=:id FOR UPDATE', { id: payment.enrollment_id });
        if (!enrollments.length) throw new ApiProblem(409, 'REFUND_LEDGER_INCONSISTENT', 'Направление оплаты не найдено');
        const [lots] = await connection.query(`SELECT bl.id,bl.original_lessons,bl.remaining_lessons,bl.unit_price
          FROM balance_entries be JOIN balance_lots bl ON bl.source_balance_entry_id=be.id
          WHERE be.payment_id=:paymentId AND be.entry_type='payment' FOR UPDATE`, { paymentId });
        if (lots.length !== 1) throw new ApiProblem(409, 'REFUND_LEDGER_INCONSISTENT', 'Не найдена единственная партия баланса исходной оплаты');
        const [totals] = await connection.query(`SELECT COALESCE(SUM(amount),0) refunded_amount FROM refunds
          WHERE payment_id=:paymentId AND deleted_at IS NULL`, { paymentId });
        const available = refundablePaymentAmount({ paymentAmount: payment.amount, refundedAmount: totals[0].refunded_amount,
          remainingLessons: lots[0].remaining_lessons, priceSnapshot: payment.price_snapshot });
        if (BigInt(amount.replace('.', '')) > BigInt(available.replace('.', ''))) {
          throw new ApiProblem(409, 'REFUND_EXCEEDS_AVAILABLE', `Доступно к возврату не более ${available} ₽`);
        }
        const lessons = calculateLessonsCredit(amount, payment.price_snapshot);
        if (lessonUnits(lessons) > lessonUnits(String(lots[0].remaining_lessons))) {
          throw new ApiProblem(409, 'REFUND_EXCEEDS_AVAILABLE', `Доступно к возврату не более ${available} ₽`);
        }
        const [result] = await connection.query(`INSERT INTO refunds
          (enrollment_id,child_id,direction_id,payment_id,group_id_snapshot,project_id_snapshot,refunded_on,amount,price_snapshot,lessons_debit,reason,created_by_user_id)
          VALUES (:enrollmentId,:childId,:directionId,:paymentId,:groupId,:projectId,:refundedOn,:amount,:price,:lessons,:reason,:actorId)`, {
          enrollmentId: payment.enrollment_id, childId: payment.child_id, directionId: payment.direction_id, paymentId,
          groupId: payment.group_id_snapshot, projectId: payment.project_id_snapshot, refundedOn: date, amount,
          price: String(payment.price_snapshot), lessons, reason: body.reason == null || body.reason === '' ? null : String(body.reason).trim(),
          actorId: context.actorUserId ?? null,
        });
        await connection.query(`INSERT INTO balance_entries
          (enrollment_id,entry_type,lessons_delta,amount_delta,unit_price_snapshot,refund_id,idempotency_key,occurred_at,created_by_user_id)
          VALUES (:enrollmentId,'refund',:lessons,:amount,:price,:refundId,:idempotencyKey,CONCAT(:refundedOn,' 12:00:00'),:actorId)`, {
          enrollmentId: payment.enrollment_id, lessons: lessonDecimal(-lessonUnits(lessons)), amount: `-${amount}`,
          price: String(payment.price_snapshot), refundId: result.insertId, idempotencyKey: context.idempotencyKey ?? null,
          refundedOn: date, actorId: context.actorUserId ?? null,
        });
        await connection.query('UPDATE balance_lots SET remaining_lessons=remaining_lessons-:lessons WHERE id=:id', { id: lots[0].id, lessons });
        await connection.query('UPDATE child_enrollments SET balance_lessons=balance_lessons-:lessons WHERE id=:id', { id: payment.enrollment_id, lessons });
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
        const [dependencies] = await connection.query(`SELECT 1 FROM balance_entries be
          LEFT JOIN balance_lot_consumptions blc ON blc.balance_entry_id=be.id
          WHERE (be.reversal_of_entry_id=:entryId OR blc.balance_entry_id=:entryId) LIMIT 1`, { entryId: entries[0].id });
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
        await connection.query('DELETE FROM balance_entries WHERE id=:id', { id: entries[0].id });
        await connection.query('DELETE FROM refunds WHERE id=:id', { id: refundId });
      });
      return null;
    } catch (error) { throw mysqlError(error); }
  }
  return { list, get, create, remove };
}

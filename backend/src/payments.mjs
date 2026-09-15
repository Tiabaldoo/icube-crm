import { inTransaction } from './db.mjs';
import { ApiProblem } from './catalog.mjs';
import { lessonDecimal, lessonUnits } from './lesson-rules.mjs';

const SCALE = 100000000n;
const methods = new Set(['cashless', 'cash']);

function identifier(value, field = 'id') {
  const result = String(value ?? '').trim();
  if (!/^[1-9]\d*$/.test(result)) throw new ApiProblem(400, 'VALIDATION_ERROR', `Некорректное поле ${field}`);
  return result;
}

export function normalizeMoney(value, field = 'amount') {
  const match = String(value ?? '').trim().match(/^(\d{1,11})(?:[.,](\d{1,2}))?$/);
  if (!match) throw new ApiProblem(400, 'VALIDATION_ERROR', `Некорректное поле ${field}`);
  const cents = BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
  if (cents <= 0n) throw new ApiProblem(400, 'VALIDATION_ERROR', `${field} должно быть больше нуля`);
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}

export function calculateLessonsCredit(amount, price) {
  const amountCents = BigInt(normalizeMoney(amount).replace('.', ''));
  const priceCents = BigInt(normalizeMoney(price, 'priceSnapshot').replace('.', ''));
  const scaled = (amountCents * SCALE + priceCents / 2n) / priceCents;
  return `${scaled / SCALE}.${String(scaled % SCALE).padStart(8, '0')}`;
}

function paidOn(value) {
  const result = String(value ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new ApiProblem(400, 'VALIDATION_ERROR', 'Некорректная дата оплаты');
  return result;
}
function paymentMethod(value) {
  if (!methods.has(value)) throw new ApiProblem(400, 'VALIDATION_ERROR', 'Некорректный способ оплаты');
  return value;
}
function mysqlError(error) {
  if (error instanceof ApiProblem) return error;
  if (error?.code === 'ER_DUP_ENTRY') return new ApiProblem(409, 'CONFLICT', 'Операция уже существует');
  if (error?.code === 'ER_NO_REFERENCED_ROW_2') return new ApiProblem(400, 'INVALID_REFERENCE', 'Связанная запись не найдена');
  if (error?.code === 'ER_ROW_IS_REFERENCED_2') return new ApiProblem(409, 'PAYMENT_HAS_HISTORY', 'Оплата уже связана с другой исторической операцией');
  return error;
}
const isoDate = (value) => typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
const mapPayment = (row) => ({
  id: String(row.id), enrollmentId: String(row.enrollment_id), childId: String(row.child_id), childName: row.child_name,
  directionId: String(row.direction_id), directionName: row.direction_name,
  groupId: row.group_id_snapshot == null ? null : String(row.group_id_snapshot),
  projectId: row.project_id_snapshot == null ? null : String(row.project_id_snapshot),
  paidOn: isoDate(row.paid_on), amount: String(row.amount), priceSnapshot: String(row.price_snapshot),
  lessonsCredit: String(row.lessons_credit), method: row.method, note: row.note,
});
function fundedLessons(credit, balanceBefore) {
  const creditUnits = lessonUnits(credit); const balanceUnits = lessonUnits(balanceBefore ?? '0');
  const available = balanceUnits < 0n ? creditUnits + balanceUnits : creditUnits;
  return lessonDecimal(available > 0n ? available : 0n);
}

export function createMysqlPayments(pool) {
  const paymentSelect = `SELECT p.id,p.enrollment_id,p.child_id,c.full_name child_name,p.direction_id,d.name direction_name,
    p.group_id_snapshot,p.project_id_snapshot,p.paid_on,p.amount,p.price_snapshot,p.lessons_credit,p.method,p.note
    FROM payments p JOIN children c ON c.id=p.child_id JOIN directions d ON d.id=p.direction_id`;
  async function queryRows(sql, params = {}) { const [rows] = await pool.query(sql, params); return rows; }
  async function list(filters = {}) {
    const conditions = ['p.deleted_at IS NULL']; const params = {};
    if (filters.childId != null && filters.childId !== '') { conditions.push('p.child_id=:childId'); params.childId = identifier(filters.childId, 'childId'); }
    if (filters.enrollmentId != null && filters.enrollmentId !== '') { conditions.push('p.enrollment_id=:enrollmentId'); params.enrollmentId = identifier(filters.enrollmentId, 'enrollmentId'); }
    return (await queryRows(`${paymentSelect} WHERE ${conditions.join(' AND ')} ORDER BY p.paid_on DESC,p.id DESC`, params)).map(mapPayment);
  }
  async function get(paymentId) {
    const rows = await queryRows(`${paymentSelect} WHERE p.id=:id AND p.deleted_at IS NULL`, { id: identifier(paymentId) });
    if (!rows.length) throw new ApiProblem(404, 'NOT_FOUND', 'Оплата не найдена');
    return mapPayment(rows[0]);
  }
  async function lockEnrollment(connection, enrollmentId, { requirePrice = true, priceDate = isoDate(new Date()) } = {}) {
    const [rows] = await connection.query(`SELECT e.id,e.child_id,e.direction_id,e.individual_price,e.balance_lessons,gm.group_id,g.project_id,
      COALESCE(
        (SELECT pv.price FROM price_versions pv WHERE pv.scope_type='enrollment' AND pv.enrollment_id=e.id AND pv.valid_from<DATE_ADD(:priceDate,INTERVAL 1 DAY) AND (pv.valid_to IS NULL OR pv.valid_to>=DATE_ADD(:priceDate,INTERVAL 1 DAY)) ORDER BY pv.valid_from DESC,pv.id DESC LIMIT 1),
        CASE WHEN NOT EXISTS (SELECT 1 FROM price_versions pv WHERE pv.scope_type='enrollment' AND pv.enrollment_id=e.id) THEN e.individual_price END,
        (SELECT pv.price FROM price_versions pv WHERE pv.scope_type='group' AND pv.group_id=gm.group_id AND pv.valid_from<DATE_ADD(:priceDate,INTERVAL 1 DAY) AND (pv.valid_to IS NULL OR pv.valid_to>=DATE_ADD(:priceDate,INTERVAL 1 DAY)) ORDER BY pv.valid_from DESC,pv.id DESC LIMIT 1),
        (SELECT pv.price FROM price_versions pv WHERE pv.scope_type='direction' AND pv.direction_id=e.direction_id AND pv.valid_from<DATE_ADD(:priceDate,INTERVAL 1 DAY) AND (pv.valid_to IS NULL OR pv.valid_to>=DATE_ADD(:priceDate,INTERVAL 1 DAY)) ORDER BY pv.valid_from DESC,pv.id DESC LIMIT 1)
      ) current_price
      FROM child_enrollments e
      LEFT JOIN group_memberships gm ON gm.id=(SELECT gm2.id FROM group_memberships gm2 WHERE gm2.enrollment_id=e.id AND gm2.started_on<=:priceDate AND (gm2.ended_on IS NULL OR gm2.ended_on>=:priceDate) ORDER BY gm2.started_on DESC,gm2.id DESC LIMIT 1)
      LEFT JOIN study_groups g ON g.id=gm.group_id WHERE e.id=:id FOR UPDATE`, { id: identifier(enrollmentId, 'enrollmentId'), priceDate });
    if (!rows.length) throw new ApiProblem(404, 'ENROLLMENT_NOT_FOUND', 'Направление ребёнка не найдено');
    if (requirePrice && rows[0].current_price == null) throw new ApiProblem(409, 'PRICE_NOT_CONFIGURED', 'Для направления не настроена цена занятия');
    return rows[0];
  }
  async function create(body, context = {}) {
    try {
      const paymentId = await inTransaction(pool, async (connection) => {
        const date = paidOn(body.paidOn);
        const enrollment = await lockEnrollment(connection, body.enrollmentId, { priceDate: date });
        const amount = normalizeMoney(body.amount);
        const price = normalizeMoney(enrollment.current_price, 'priceSnapshot');
        const lessons = calculateLessonsCredit(amount, price);
        const lotLessons = fundedLessons(lessons, enrollment.balance_lessons);
        const method = paymentMethod(body.method);
        const [result] = await connection.query(`INSERT INTO payments
          (enrollment_id,child_id,direction_id,group_id_snapshot,project_id_snapshot,paid_on,amount,price_snapshot,lessons_credit,method,note,created_by_user_id)
          VALUES (:enrollmentId,:childId,:directionId,:groupId,:projectId,:paidOn,:amount,:price,:lessons,:method,:note,:actorId)`, {
          enrollmentId: enrollment.id, childId: enrollment.child_id, directionId: enrollment.direction_id,
          groupId: enrollment.group_id, projectId: enrollment.project_id, paidOn: date, amount, price, lessons, method,
          note: body.note == null || body.note === '' ? null : String(body.note).trim(), actorId: context.actorUserId ?? null,
        });
        const [entryResult] = await connection.query(`INSERT INTO balance_entries
          (enrollment_id,entry_type,lessons_delta,amount_delta,unit_price_snapshot,payment_id,idempotency_key,occurred_at,created_by_user_id)
          VALUES (:enrollmentId,'payment',:lessons,:amount,:price,:paymentId,:idempotencyKey,CONCAT(:paidOn,' 12:00:00'),:actorId)`, {
          enrollmentId: enrollment.id, lessons, amount, price, paymentId: result.insertId,
          idempotencyKey: context.idempotencyKey ?? null, paidOn: date, actorId: context.actorUserId ?? null,
        });
        await connection.query(`INSERT INTO balance_lots
          (enrollment_id,source_balance_entry_id,original_lessons,remaining_lessons,unit_price)
          VALUES (:enrollmentId,:entryId,:lessons,:remainingLessons,:price)`, {
          enrollmentId: enrollment.id, entryId: entryResult.insertId, lessons, remainingLessons: lotLessons, price,
        });
        await connection.query('UPDATE child_enrollments SET balance_lessons=balance_lessons+:lessons WHERE id=:id', { id: enrollment.id, lessons });
        return String(result.insertId);
      });
      return get(paymentId);
    } catch (error) { throw mysqlError(error); }
  }
  async function update(paymentId, body, context = {}) {
    paymentId = identifier(paymentId);
    try {
      await inTransaction(pool, async (connection) => {
        const [payments] = await connection.query('SELECT * FROM payments WHERE id=:id AND deleted_at IS NULL FOR UPDATE', { id: paymentId });
        if (!payments.length) throw new ApiProblem(404, 'NOT_FOUND', 'Оплата не найдена');
        const old = payments[0];
        const date = paidOn(body.paidOn ?? isoDate(old.paid_on));
        const oldEnrollment = await lockEnrollment(connection, old.enrollment_id, { requirePrice: false, priceDate: date });
        const targetId = identifier(body.enrollmentId ?? old.enrollment_id, 'enrollmentId');
        const target = String(oldEnrollment.id) === targetId ? oldEnrollment : await lockEnrollment(connection, targetId, { requirePrice: body.priceSnapshot === undefined, priceDate: date });
        const amount = normalizeMoney(body.amount ?? old.amount);
        const price = body.priceSnapshot === undefined
          ? normalizeMoney(String(old.enrollment_id) === targetId ? old.price_snapshot : target.current_price, 'priceSnapshot')
          : normalizeMoney(body.priceSnapshot, 'priceSnapshot');
        const lessons = calculateLessonsCredit(amount, price);
        const targetBalanceBefore = String(old.enrollment_id) === targetId
          ? lessonDecimal(lessonUnits(String(oldEnrollment.balance_lessons)) - lessonUnits(String(old.lessons_credit)))
          : String(target.balance_lessons);
        const lotLessons = fundedLessons(lessons, targetBalanceBefore);
        const method = paymentMethod(body.method ?? old.method);
        await connection.query('UPDATE child_enrollments SET balance_lessons=balance_lessons-:lessons WHERE id=:id', { id: old.enrollment_id, lessons: String(old.lessons_credit) });
        await connection.query('UPDATE child_enrollments SET balance_lessons=balance_lessons+:lessons WHERE id=:id', { id: target.id, lessons });
        await connection.query(`UPDATE payments SET enrollment_id=:enrollmentId,child_id=:childId,direction_id=:directionId,
          group_id_snapshot=:groupId,project_id_snapshot=:projectId,paid_on=:paidOn,amount=:amount,
          price_snapshot=:price,lessons_credit=:lessons,method=:method,note=:note WHERE id=:id`, {
          id: paymentId, enrollmentId: target.id, childId: target.child_id, directionId: target.direction_id,
          groupId: target.group_id, projectId: target.project_id, paidOn: date, amount, price, lessons, method,
          note: body.note === undefined ? old.note : body.note == null || body.note === '' ? null : String(body.note).trim(),
        });
        const [entries] = await connection.query(`SELECT id FROM balance_entries WHERE payment_id=:paymentId AND entry_type='payment' FOR UPDATE`, { paymentId });
        if (entries.length !== 1) throw new ApiProblem(409, 'PAYMENT_LEDGER_INCONSISTENT', 'Не найдена единственная запись баланса для оплаты');
        const [lots] = await connection.query('SELECT id FROM balance_lots WHERE source_balance_entry_id=:entryId FOR UPDATE', { entryId: entries[0].id });
        if (lots.length > 1) throw new ApiProblem(409, 'PAYMENT_LEDGER_INCONSISTENT', 'Для оплаты найдено несколько партий баланса');
        if (lots.length) {
          const [consumptions] = await connection.query('SELECT id FROM balance_lot_consumptions WHERE balance_lot_id=:lotId LIMIT 1', { lotId: lots[0].id });
          if (consumptions.length) throw new ApiProblem(409, 'PAYMENT_HAS_HISTORY', 'Оплата уже использована в финансовой истории');
        }
        await connection.query(`UPDATE balance_entries SET enrollment_id=:enrollmentId,lessons_delta=:lessons,
          amount_delta=:amount,unit_price_snapshot=:price,occurred_at=CONCAT(:paidOn,' 12:00:00'),created_by_user_id=COALESCE(:actorId,created_by_user_id)
          WHERE id=:entryId`, { enrollmentId: target.id, lessons, amount, price, paidOn: date, actorId: context.actorUserId ?? null, entryId: entries[0].id });
        if (lots.length) {
          await connection.query(`UPDATE balance_lots SET enrollment_id=:enrollmentId,original_lessons=:lessons,
            remaining_lessons=:remainingLessons,unit_price=:price WHERE id=:lotId`, { enrollmentId: target.id, lessons, remainingLessons: lotLessons, price, lotId: lots[0].id });
        } else {
          await connection.query(`INSERT INTO balance_lots
            (enrollment_id,source_balance_entry_id,original_lessons,remaining_lessons,unit_price)
            VALUES (:enrollmentId,:entryId,:lessons,:remainingLessons,:price)`, {
            enrollmentId: target.id, entryId: entries[0].id, lessons, remainingLessons: lotLessons, price,
          });
        }
      });
      return get(paymentId);
    } catch (error) { throw mysqlError(error); }
  }
  async function remove(paymentId) {
    paymentId = identifier(paymentId);
    try {
      await inTransaction(pool, async (connection) => {
        const [payments] = await connection.query('SELECT * FROM payments WHERE id=:id AND deleted_at IS NULL FOR UPDATE', { id: paymentId });
        if (!payments.length) throw new ApiProblem(404, 'NOT_FOUND', 'Оплата не найдена');
        const payment = payments[0]; await lockEnrollment(connection, payment.enrollment_id, { requirePrice: false });
        const [refunds] = await connection.query('SELECT id FROM refunds WHERE payment_id=:id LIMIT 1', { id: paymentId });
        if (refunds.length) throw new ApiProblem(409, 'PAYMENT_HAS_HISTORY', 'Оплату с возвратом удалить нельзя');
        const [entries] = await connection.query(`SELECT id FROM balance_entries WHERE payment_id=:id AND entry_type='payment' FOR UPDATE`, { id: paymentId });
        if (entries.length !== 1) throw new ApiProblem(409, 'PAYMENT_LEDGER_INCONSISTENT', 'Не найдена единственная запись баланса для оплаты');
        const [activeConsumptions] = await connection.query(`SELECT blc.id FROM balance_lot_consumptions blc
          JOIN balance_lots bl ON bl.id=blc.balance_lot_id
          JOIN balance_entries debit ON debit.id=blc.balance_entry_id
          LEFT JOIN balance_entries reversal ON reversal.reversal_of_entry_id=debit.id
          WHERE bl.source_balance_entry_id=:id AND reversal.id IS NULL LIMIT 1`, { id: entries[0].id });
        if (activeConsumptions.length) throw new ApiProblem(409, 'PAYMENT_HAS_HISTORY', 'Оплата ещё используется в активной финансовой истории');
        await connection.query('UPDATE child_enrollments SET balance_lessons=balance_lessons-:lessons WHERE id=:id', { id: payment.enrollment_id, lessons: String(payment.lessons_credit) });
        await connection.query(`DELETE blc FROM balance_lot_consumptions blc
          JOIN balance_lots bl ON bl.id=blc.balance_lot_id WHERE bl.source_balance_entry_id=:id`, { id: entries[0].id });
        await connection.query('DELETE FROM balance_lots WHERE source_balance_entry_id=:id', { id: entries[0].id });
        await connection.query('DELETE FROM balance_entries WHERE id=:id', { id: entries[0].id });
        await connection.query('DELETE FROM payments WHERE id=:id', { id: paymentId });
      });
      return null;
    } catch (error) { throw mysqlError(error); }
  }
  async function balances(filters = {}) {
    const params = {}; let where = '';
    if (filters.childId != null && filters.childId !== '') { params.childId = identifier(filters.childId, 'childId'); where = 'WHERE e.child_id=:childId'; }
    const rows = await queryRows(`SELECT e.id enrollment_id,e.child_id,c.full_name child_name,e.direction_id,d.name direction_name,e.balance_lessons
      FROM child_enrollments e JOIN children c ON c.id=e.child_id JOIN directions d ON d.id=e.direction_id ${where} ORDER BY c.full_name,d.name`, params);
    return rows.map((row) => ({ enrollmentId: String(row.enrollment_id), childId: String(row.child_id), childName: row.child_name,
      directionId: String(row.direction_id), directionName: row.direction_name, balanceLessons: String(row.balance_lessons) }));
  }
  return { list, get, create, update, remove, balances };
}

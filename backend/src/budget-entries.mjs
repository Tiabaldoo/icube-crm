import { createHash } from 'node:crypto';
import { ApiProblem } from './catalog.mjs';
import { inTransaction } from './db.mjs';
import { scopedIdempotencyKey } from './idempotency.mjs';
import { moneyCents, moneyDecimal } from './lesson-rules.mjs';
import { parseCalendarDate } from '../../src/shared/business-time.mjs';

export function assertBudgetDirector(context = {}) {
  if (!(context.roles ?? []).includes('director')) throw new ApiProblem(403, 'FORBIDDEN', 'Мой бюджет доступен только директору');
}
export function budgetPeriod(raw) {
  let from; let to;
  try { from = parseCalendarDate(raw.from); to = parseCalendarDate(raw.to); }
  catch { throw new ApiProblem(400, 'VALIDATION_ERROR', 'Укажите корректные даты бюджета'); }
  if (from > to) throw new ApiProblem(400, 'VALIDATION_ERROR', 'Дата начала бюджета должна быть не позже даты окончания');
  return { from, to };
}
const identifier = (value) => {
  if (!/^[1-9]\d*$/.test(String(value))) throw new ApiProblem(400, 'VALIDATION_ERROR', 'Некорректная операция бюджета');
  return String(value);
};
function payload(body = {}) {
  if (!['income', 'expense'].includes(body.type)) throw new ApiProblem(400, 'VALIDATION_ERROR', 'Выберите доход или расход');
  let date;
  try { date = parseCalendarDate(body.date); }
  catch { throw new ApiProblem(400, 'VALIDATION_ERROR', 'Укажите корректную дату операции'); }
  if (!/^\d{1,11}(?:\.\d{1,2})?$/.test(String(body.amount ?? '')) || moneyCents(String(body.amount)) <= 0n) {
    throw new ApiProblem(400, 'VALIDATION_ERROR', 'Сумма должна быть положительной, не более двух знаков после запятой');
  }
  if (body.purpose != null && typeof body.purpose !== 'string') throw new ApiProblem(400, 'VALIDATION_ERROR', 'Некорректное назначение');
  const purpose = (body.purpose ?? '').trim();
  if (purpose.length > 1000) throw new ApiProblem(400, 'VALIDATION_ERROR', 'Назначение — не более 1000 символов');
  return { type: body.type, date, amount: moneyDecimal(moneyCents(String(body.amount))), purpose: purpose || null };
}
const view = (row) => ({ id: String(row.id), type: row.entry_type, date: String(row.occurred_on).slice(0, 10), amount: String(row.amount),
  purpose: row.purpose ?? '', createdBy: String(row.created_by_user_id), deleted: row.deleted_at != null });

export function createBudgetEntries(pool) {
  async function list(raw, context = {}) {
    assertBudgetDirector(context); const period = budgetPeriod(raw);
    const [rows] = await pool.query(`SELECT * FROM director_budget_entries
      WHERE deleted_at IS NULL AND occurred_on BETWEEN :from AND :to ORDER BY occurred_on DESC,id DESC`, period);
    return rows.map(view);
  }
  async function create(body, context = {}) {
    assertBudgetDirector(context); const value = payload(body);
    const requestKey = scopedIdempotencyKey({ key: context.idempotencyKey, actorUserId: context.userId, operation: 'director-budget-entry' });
    const fingerprint = createHash('sha256').update(JSON.stringify(value)).digest('hex');
    return inTransaction(pool, async (connection) => {
      await connection.query(`INSERT INTO director_budget_entries
        (entry_type,occurred_on,amount,purpose,created_by_user_id,request_key,request_fingerprint)
        VALUES (:type,:date,:amount,:purpose,:actorId,:requestKey,:fingerprint) ON DUPLICATE KEY UPDATE id=id`, {
        ...value, actorId: context.userId, requestKey, fingerprint,
      });
      const [rows] = await connection.query('SELECT * FROM director_budget_entries WHERE request_key=:requestKey FOR UPDATE', { requestKey });
      if (rows[0].request_fingerprint !== fingerprint) throw new ApiProblem(409, 'IDEMPOTENCY_CONFLICT', 'Этот запрос уже использован для другой операции бюджета');
      return view(rows[0]);
    });
  }
  async function update(id, body, context = {}) {
    assertBudgetDirector(context); id = identifier(id); const value = payload(body);
    return inTransaction(pool, async (connection) => {
      const [rows] = await connection.query('SELECT * FROM director_budget_entries WHERE id=:id AND deleted_at IS NULL FOR UPDATE', { id });
      if (!rows.length) throw new ApiProblem(404, 'NOT_FOUND', 'Операция бюджета не найдена');
      await connection.query(`UPDATE director_budget_entries SET entry_type=:type,occurred_on=:date,amount=:amount,purpose=:purpose WHERE id=:id`, { id, ...value });
      return { ...view(rows[0]), ...value, purpose: value.purpose ?? '' };
    });
  }
  async function remove(id, context = {}) {
    assertBudgetDirector(context); id = identifier(id);
    await pool.query('UPDATE director_budget_entries SET deleted_at=COALESCE(deleted_at,NOW(6)) WHERE id=:id', { id });
  }
  return { list, create, update, remove };
}

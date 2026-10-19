import { ApiProblem } from './catalog.mjs';
import { lessonDecimal, lessonUnits, moneyCents, planFifoConsumption } from './lesson-rules.mjs';

const inconsistent = () => new ApiProblem(409, 'PAYMENT_LEDGER_INCONSISTENT',
  'Финансовая история направления не позволяет однозначно пересчитать FIFO. Требуется проверка администратором проекта.');
const transferHistory = () => new ApiProblem(409, 'PAYMENT_TRANSFER_HISTORY',
  'Изменение суммы затронет связанный перенос остатка. Сначала требуется согласованная корректировка цепочки переноса.');

// Reallocate funding, not attendance charges. Ledger amounts, attendance snapshots,
// salaries and refunds stay intact. Returned money is reserved for its source payment;
// the remaining credit funds actual visits in their original booking/FIFO order.
export function planPaymentFunding({ entries, lots, consumptions, balance }) {
  if (entries.some((e) => ['transfer_in', 'transfer_out'].includes(e.entry_type))) throw transferHistory();
  const reversed = new Set(entries.filter((e) => e.reversal_of_entry_id != null).map((e) => String(e.reversal_of_entry_id)));
  const active = entries.filter((e) => e.entry_type !== 'reversal' && !reversed.has(String(e.id)));
  if (active.some((e) => !['payment', 'attendance', 'refund'].includes(e.entry_type))) throw inconsistent();
  const total = entries.reduce((sum, e) => sum + lessonUnits(String(e.lessons_delta)), 0n);
  if (total !== lessonUnits(String(balance))) throw inconsistent();
  const reserved = new Map();
  const sources = new Map();
  for (const entry of active.filter((e) => e.entry_type === 'payment')) {
    const linked = lots.filter((l) => String(l.source_balance_entry_id) === String(entry.id));
    if (linked.length !== 1 || lessonUnits(String(entry.lessons_delta)) <= 0n
      || moneyCents(String(linked[0].unit_price)) !== moneyCents(String(entry.unit_price_snapshot))) throw inconsistent();
    sources.set(String(entry.payment_id), linked[0]);
  }
  for (const entry of active.filter((e) => e.entry_type === 'refund')) {
    const lot = sources.get(String(entry.refund_payment_id));
    const applied = consumptions.filter((c) => String(c.balance_entry_id) === String(entry.id));
    const units = -lessonUnits(String(entry.lessons_delta));
    if (!lot || units <= 0n || applied.length !== 1 || String(applied[0].balance_lot_id) !== String(lot.id)
      || lessonUnits(String(applied[0].lessons)) !== units) throw inconsistent();
    reserved.set(String(lot.id), (reserved.get(String(lot.id)) ?? 0n) + units);
  }
  if (lots.length !== sources.size) throw inconsistent();
  const remaining = new Map(lots.map((l) => [String(l.id), 0n]));
  const originals = new Map(); const allocations = []; let running = 0n;
  const available = new Set();
  for (const entry of active.slice().sort((a, b) => Number(a.id) - Number(b.id))) {
    if (entry.entry_type === 'refund') continue; // Reserved once, at its source.
    if (entry.entry_type === 'payment') {
      const lot = sources.get(String(entry.payment_id)); const key = String(lot.id);
      const original = lessonUnits(String(entry.lessons_delta));
      const credit = original - (reserved.get(key) ?? 0n);
      if (credit < 0n) throw inconsistent();
      originals.set(key, original);
      const funded = credit + (running < 0n ? running : 0n);
      remaining.set(key, funded > 0n ? funded : 0n);
      available.add(key); running += credit;
    } else {
      const debit = -lessonUnits(String(entry.lessons_delta));
      if (debit <= 0n) throw inconsistent();
      const fifo = lots.filter((l) => available.has(String(l.id)))
        .map((l) => ({ ...l, remaining_lessons: lessonDecimal(remaining.get(String(l.id))) }));
      const plan = planFifoConsumption(fifo, lessonDecimal(debit));
      for (const item of plan.consumptions) {
        remaining.set(item.lotId, remaining.get(item.lotId) - lessonUnits(item.lessons));
        allocations.push({ ...item, entryId: entry.id });
      }
      running -= debit;
    }
  }
  if (running !== total) throw inconsistent();
  return { lots: lots.map((l) => ({ id: l.id, original: lessonDecimal(originals.get(String(l.id))),
    remaining: lessonDecimal(remaining.get(String(l.id))) })), allocations,
    attendanceEntryIds: active.filter((e) => e.entry_type === 'attendance').map((e) => String(e.id)) };
}

export async function rebuildPaymentFunding(connection, enrollmentId) {
  const [enrollments] = await connection.query('SELECT id,balance_lessons FROM child_enrollments WHERE id=:id FOR UPDATE', { id: enrollmentId });
  if (enrollments.length !== 1) throw inconsistent();
  const [entries] = await connection.query(`SELECT be.*,r.payment_id refund_payment_id FROM balance_entries be
    LEFT JOIN refunds r ON r.id=be.refund_id AND r.deleted_at IS NULL
    WHERE be.enrollment_id=:enrollmentId ORDER BY be.id FOR UPDATE`, { enrollmentId });
  const [lots] = await connection.query(`SELECT id,source_balance_entry_id,original_lessons,remaining_lessons,unit_price
    FROM balance_lots WHERE enrollment_id=:enrollmentId ORDER BY created_at,id FOR UPDATE`, { enrollmentId });
  const [consumptions] = await connection.query(`SELECT blc.* FROM balance_lot_consumptions blc
    JOIN balance_lots bl ON bl.id=blc.balance_lot_id WHERE bl.enrollment_id=:enrollmentId ORDER BY blc.id FOR UPDATE`, { enrollmentId });
  const plan = planPaymentFunding({ entries, lots, consumptions, balance: enrollments[0].balance_lessons });
  const active = new Set(plan.attendanceEntryIds);
  const key = (lotId, entryId) => `${lotId}:${entryId}`;
  const wanted = new Map(plan.allocations.map((a) => [key(a.lotId, a.entryId), a]));
  for (const old of consumptions.filter((c) => active.has(String(c.balance_entry_id)))) {
    const item = wanted.get(key(old.balance_lot_id, old.balance_entry_id));
    if (!item) await connection.query('DELETE FROM balance_lot_consumptions WHERE id=:id', { id: old.id });
    else {
      if (lessonUnits(String(old.lessons)) !== lessonUnits(item.lessons) || moneyCents(String(old.amount)) !== moneyCents(item.amount)) {
        await connection.query('UPDATE balance_lot_consumptions SET lessons=:lessons,amount=:amount WHERE id=:id', { id: old.id, lessons: item.lessons, amount: item.amount });
      }
      wanted.delete(key(old.balance_lot_id, old.balance_entry_id));
    }
  }
  for (const item of wanted.values()) await connection.query(`INSERT INTO balance_lot_consumptions
    (balance_lot_id,balance_entry_id,lessons,amount) VALUES (:lotId,:entryId,:lessons,:amount)`, item);
  for (const lot of plan.lots) await connection.query(`UPDATE balance_lots SET original_lessons=:original,
    remaining_lessons=:remaining WHERE id=:id`, lot);
}

import { lessonUnits, moneyCents, moneyDecimal } from './lesson-rules.mjs';

const SCALE = 100000000n;

function centsFromLessons(lessons, price) {
  const units = lessonUnits(String(lessons));
  const cents = moneyCents(String(price));
  return (units * cents + SCALE / 2n) / SCALE;
}

function cloneSegments(segments = []) {
  return segments.map((segment) => ({ paymentId: segment.paymentId == null ? null : String(segment.paymentId), cents: BigInt(segment.cents) }));
}

function mergeTail(segments) {
  const out = [];
  for (const segment of segments) {
    if (segment.cents <= 0n) continue;
    const last = out[out.length - 1];
    if (last && last.paymentId === segment.paymentId) last.cents += segment.cents;
    else out.push({ paymentId: segment.paymentId, cents: segment.cents });
  }
  return out;
}

function consumeFifo(segments, requested) {
  let left = BigInt(requested);
  const taken = [];
  while (left > 0n && segments.length) {
    const segment = segments[0];
    const amount = segment.cents < left ? segment.cents : left;
    if (amount > 0n) taken.push({ paymentId: segment.paymentId, cents: amount });
    segment.cents -= amount;
    left -= amount;
    if (segment.cents === 0n) segments.shift();
  }
  return { taken: mergeTail(taken), missing: left };
}

function consumePayment(segments, paymentId, requested) {
  const wanted = String(paymentId);
  let left = BigInt(requested);
  for (let i = 0; i < segments.length && left > 0n; i += 1) {
    const segment = segments[i];
    if (segment.paymentId !== wanted) continue;
    const amount = segment.cents < left ? segment.cents : left;
    segment.cents -= amount;
    left -= amount;
  }
  for (let i = segments.length - 1; i >= 0; i -= 1) if (segments[i].cents === 0n) segments.splice(i, 1);
  return left;
}

function eventKey(value) {
  if (value instanceof Date) return value.getTime();
  const text = String(value ?? '').replace(' ', 'T');
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/.test(text) ? text : `${text}Z`;
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function buildPaymentLineage({ lots, consumptions, paymentId }) {
  const lotById = new Map(lots.map((lot) => [String(lot.id), lot]));
  const activeConsumptions = consumptions.filter((row) => row.reversal_id == null);
  const consumptionByLot = new Map();
  for (const row of activeConsumptions) {
    const key = String(row.balance_lot_id);
    if (!consumptionByLot.has(key)) consumptionByLot.set(key, []);
    consumptionByLot.get(key).push(row);
  }

  const capacities = new Map();
  for (const lot of lots) {
    const current = centsFromLessons(lot.remaining_lessons, lot.unit_price);
    const used = (consumptionByLot.get(String(lot.id)) ?? []).reduce((sum, row) => sum + moneyCents(String(row.amount)), 0n);
    capacities.set(String(lot.id), current + used);
  }

  const events = [];
  for (const lot of lots) {
    events.push({
      kind: 'lot',
      entryId: Number(lot.source_balance_entry_id),
      occurredAt: lot.source_occurred_at,
      lotId: String(lot.id),
      entryType: lot.source_entry_type,
      paymentId: lot.source_payment_id == null ? null : String(lot.source_payment_id),
      transferId: lot.source_transfer_id == null ? null : String(lot.source_transfer_id),
    });
  }
  const grouped = new Map();
  for (const row of activeConsumptions) {
    const key = String(row.balance_entry_id);
    if (!grouped.has(key)) grouped.set(key, {
      kind: 'consume', entryId: Number(row.balance_entry_id), occurredAt: row.occurred_at,
      entryType: row.entry_type, transferId: row.transfer_id == null ? null : String(row.transfer_id),
      refundPaymentId: row.refund_payment_id == null ? null : String(row.refund_payment_id), rows: [],
    });
    grouped.get(key).rows.push(row);
  }
  events.push(...grouped.values());
  events.sort((a, b) => eventKey(a.occurredAt) - eventKey(b.occurredAt) || a.entryId - b.entryId || (a.kind === 'consume' ? -1 : 1));

  const queues = new Map();
  const moved = new Map();

  for (const event of events) {
    if (event.kind === 'lot') {
      const capacity = capacities.get(event.lotId) ?? 0n;
      if (event.entryType === 'transfer_in') {
        const incoming = cloneSegments(moved.get(event.transferId) ?? []);
        const total = incoming.reduce((sum, segment) => sum + segment.cents, 0n);
        if (total < capacity) incoming.push({ paymentId: null, cents: capacity - total });
        else if (total > capacity) consumeFifo(incoming, total - capacity);
        queues.set(event.lotId, mergeTail(incoming));
      } else {
        queues.set(event.lotId, capacity > 0n ? [{ paymentId: event.paymentId, cents: capacity }] : []);
      }
      continue;
    }

    const transferSegments = [];
    const rows = event.rows.slice().sort((a, b) => Number(a.id) - Number(b.id));
    for (const row of rows) {
      const lotId = String(row.balance_lot_id);
      const queue = queues.get(lotId) ?? [];
      const amount = moneyCents(String(row.amount));
      if (event.entryType === 'refund' && event.refundPaymentId != null) {
        const missing = consumePayment(queue, event.refundPaymentId, amount);
        if (missing > 0n) consumeFifo(queue, missing);
      } else {
        const result = consumeFifo(queue, amount);
        if (event.entryType === 'transfer_out') transferSegments.push(...result.taken);
      }
      queues.set(lotId, mergeTail(queue));
    }
    if (event.entryType === 'transfer_out' && event.transferId != null) moved.set(event.transferId, mergeTail(transferSegments));
  }

  const wanted = String(paymentId);
  const allocations = [];
  let available = 0n;
  for (const [lotId, segments] of queues) {
    const cents = segments.filter((segment) => segment.paymentId === wanted).reduce((sum, segment) => sum + segment.cents, 0n);
    if (cents <= 0n) continue;
    const lot = lotById.get(lotId);
    allocations.push({
      lotId,
      enrollmentId: String(lot.enrollment_id),
      unitPrice: String(lot.unit_price),
      remainingLessons: String(lot.remaining_lessons),
      availableCents: cents,
      createdAt: lot.created_at,
    });
    available += cents;
  }
  allocations.sort((a, b) => eventKey(a.createdAt) - eventKey(b.createdAt) || Number(a.lotId) - Number(b.lotId));
  return { availableCents: available, availableAmount: moneyDecimal(available), allocations };
}

export async function loadPaymentLineage(connection, paymentId, { lock = false, payment = null } = {}) {
  let sourcePayment = payment;
  if (!sourcePayment) {
    const [rows] = await connection.query(`SELECT id,child_id,amount FROM payments
      WHERE id=:paymentId AND deleted_at IS NULL${lock ? ' FOR UPDATE' : ''}`, { paymentId });
    sourcePayment = rows[0] ?? null;
  }
  if (!sourcePayment) return null;
  const childId = sourcePayment.child_id;

  if (lock) await connection.query('SELECT id FROM child_enrollments WHERE child_id=:childId ORDER BY id FOR UPDATE', { childId });

  const [lots] = await connection.query(`SELECT bl.id,bl.enrollment_id,bl.source_balance_entry_id,bl.original_lessons,bl.remaining_lessons,bl.unit_price,bl.created_at,
      src.entry_type source_entry_type,src.payment_id source_payment_id,src.transfer_id source_transfer_id,src.occurred_at source_occurred_at
    FROM balance_lots bl
    JOIN child_enrollments e ON e.id=bl.enrollment_id
    JOIN balance_entries src ON src.id=bl.source_balance_entry_id
    WHERE e.child_id=:childId
    ORDER BY bl.id${lock ? ' FOR UPDATE' : ''}`, { childId });

  const [consumptions] = await connection.query(`SELECT blc.id,blc.balance_lot_id,blc.balance_entry_id,blc.lessons,blc.amount,
      be.entry_type,be.transfer_id,be.refund_id,be.occurred_at,
      r.payment_id refund_payment_id,reversal.id reversal_id
    FROM balance_lot_consumptions blc
    JOIN balance_lots bl ON bl.id=blc.balance_lot_id
    JOIN child_enrollments e ON e.id=bl.enrollment_id
    JOIN balance_entries be ON be.id=blc.balance_entry_id
    LEFT JOIN refunds r ON r.id=be.refund_id AND r.deleted_at IS NULL
    LEFT JOIN balance_entries reversal ON reversal.reversal_of_entry_id=be.id
    WHERE e.child_id=:childId
    ORDER BY be.occurred_at,be.id,blc.id${lock ? ' FOR UPDATE' : ''}`, { childId });

  return buildPaymentLineage({ lots, consumptions, paymentId });
}

import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPaymentLineage } from '../backend/src/balance-lineage.mjs';
import { createMysqlRefunds } from '../backend/src/refunds.mjs';
import { createMysqlPayments } from '../backend/src/payments.mjs';
import { lessonDecimal, lessonUnits } from '../backend/src/lesson-rules.mjs';

const paymentLot = (id, enrollmentId, entryId, paymentId, remaining, price, at) => ({
  id, enrollment_id: enrollmentId, source_balance_entry_id: entryId, original_lessons: price === '1025.00' ? '4.00000000' : remaining,
  remaining_lessons: remaining, unit_price: price, created_at: at,
  source_entry_type: 'payment', source_payment_id: paymentId, source_transfer_id: null, source_occurred_at: at,
});
const transferLot = (id, enrollmentId, entryId, transferId, original, remaining, price, at) => ({
  id, enrollment_id: enrollmentId, source_balance_entry_id: entryId, original_lessons: original,
  remaining_lessons: remaining, unit_price: price, created_at: at,
  source_entry_type: 'transfer_in', source_payment_id: null, source_transfer_id: transferId, source_occurred_at: at,
});
const consumption = (id, lotId, entryId, type, amount, lessons, at, extra = {}) => ({
  id, balance_lot_id: lotId, balance_entry_id: entryId, entry_type: type, amount, lessons, occurred_at: at,
  transfer_id: extra.transferId ?? null, refund_id: extra.refundId ?? null, refund_payment_id: extra.refundPaymentId ?? null,
  reversal_id: extra.reversalId ?? null,
});

test('A: payment 4100 @1025 после transfer @1125 остаётся refundable на 4100, refund 1025 оставляет 3075', () => {
  const lots = [
    paymentLot(20, 7, 12, 11, '0.00000000', '1025.00', '2026-09-01 12:00:00'),
    transferLot(21, 8, 14, 70, '3.64444444', '3.64444444', '1125.00', '2026-09-10 12:00:01'),
  ];
  const moved = consumption(100, 20, 13, 'transfer_out', '4100.00', '4.00000000', '2026-09-10 12:00:00', { transferId: 70 });
  assert.equal(buildPaymentLineage({ lots, consumptions: [moved], paymentId: 11 }).availableAmount, '4100.00');

  lots[1].remaining_lessons = '2.73333333';
  const refund = consumption(101, 21, 15, 'refund', '1025.00', '0.91111111', '2026-09-15 12:00:00',
    { refundId: 30, refundPaymentId: 11 });
  const after = buildPaymentLineage({ lots, consumptions: [moved, refund], paymentId: 11 });
  assert.equal(after.availableAmount, '3075.00');
  assert.equal(after.allocations[0].lotId, '21');
});

test('B: partial refund 500 после transfer оставляет 3600 monetary value', () => {
  const lots = [
    paymentLot(20, 7, 12, 11, '0.00000000', '1025.00', '2026-09-01 12:00:00'),
    transferLot(21, 8, 14, 70, '3.64444444', '3.20000000', '1125.00', '2026-09-10 12:00:01'),
  ];
  const rows = [
    consumption(100, 20, 13, 'transfer_out', '4100.00', '4.00000000', '2026-09-10 12:00:00', { transferId: 70 }),
    consumption(101, 21, 15, 'refund', '500.00', '0.44444444', '2026-09-15 12:00:00', { refundId: 30, refundPaymentId: 11 }),
  ];
  assert.equal(buildPaymentLineage({ lots, consumptions: rows, paymentId: 11 }).availableAmount, '3600.00');
});

test('C: attendance после transfer уменьшает refundable исходной payment по денежной стоимости', () => {
  const lots = [
    paymentLot(20, 7, 12, 11, '0.00000000', '1025.00', '2026-09-01 12:00:00'),
    transferLot(21, 8, 14, 70, '3.64444444', '2.64444444', '1125.00', '2026-09-10 12:00:01'),
  ];
  const rows = [
    consumption(100, 20, 13, 'transfer_out', '4100.00', '4.00000000', '2026-09-10 12:00:00', { transferId: 70 }),
    consumption(101, 21, 15, 'attendance', '1125.00', '1.00000000', '2026-09-12 12:00:00'),
  ];
  assert.equal(buildPaymentLineage({ lots, consumptions: rows, paymentId: 11 }).availableAmount, '2975.00');
});

test('D: payment A нельзя вернуть из value payment B после объединения и FIFO attendance', () => {
  const lots = [
    { ...paymentLot(20, 7, 12, 11, '0.00000000', '1025.00', '2026-09-01 12:00:00'), original_lessons: '2.00000000' },
    { ...paymentLot(22, 7, 16, 12, '0.00000000', '1025.00', '2026-09-02 12:00:00'), original_lessons: '2.00000000' },
    transferLot(21, 8, 14, 70, '3.64444444', '1.64444444', '1125.00', '2026-09-10 12:00:01'),
  ];
  const rows = [
    consumption(100, 20, 13, 'transfer_out', '2050.00', '2.00000000', '2026-09-10 12:00:00', { transferId: 70 }),
    consumption(101, 22, 13, 'transfer_out', '2050.00', '2.00000000', '2026-09-10 12:00:00', { transferId: 70 }),
    consumption(102, 21, 15, 'attendance', '2250.00', '2.00000000', '2026-09-12 12:00:00'),
  ];
  assert.equal(buildPaymentLineage({ lots, consumptions: rows, paymentId: 11 }).availableAmount, '0.00');
  assert.equal(buildPaymentLineage({ lots, consumptions: rows, paymentId: 12 }).availableAmount, '1850.00');
});

test('E: multi-hop A → B → C сохраняет provenance исходной payment', () => {
  const lots = [
    paymentLot(20, 7, 12, 11, '0.00000000', '1025.00', '2026-09-01 12:00:00'),
    transferLot(21, 8, 14, 70, '3.64444444', '0.00000000', '1125.00', '2026-09-10 12:00:01'),
    transferLot(22, 9, 16, 71, '4.10000000', '4.10000000', '1000.00', '2026-09-20 12:00:01'),
  ];
  const rows = [
    consumption(100, 20, 13, 'transfer_out', '4100.00', '4.00000000', '2026-09-10 12:00:00', { transferId: 70 }),
    consumption(101, 21, 15, 'transfer_out', '4100.00', '3.64444444', '2026-09-20 12:00:00', { transferId: 71 }),
  ];
  const result = buildPaymentLineage({ lots, consumptions: rows, paymentId: 11 });
  assert.equal(result.availableAmount, '4100.00');
  assert.equal(result.allocations[0].lotId, '22');
});

test('F: несколько partial refunds суммарно уменьшают provenance конкретной payment', () => {
  const lots = [
    paymentLot(20, 7, 12, 11, '0.00000000', '1025.00', '2026-09-01 12:00:00'),
    transferLot(21, 8, 14, 70, '3.64444444', '1.84444444', '1125.00', '2026-09-10 12:00:01'),
  ];
  const rows = [
    consumption(100, 20, 13, 'transfer_out', '4100.00', '4.00000000', '2026-09-10 12:00:00', { transferId: 70 }),
    consumption(101, 21, 15, 'refund', '1000.00', '0.88888889', '2026-09-15 12:00:00', { refundId: 30, refundPaymentId: 11 }),
    consumption(102, 21, 17, 'refund', '1025.00', '0.91111111', '2026-09-16 12:00:00', { refundId: 31, refundPaymentId: 11 }),
  ];
  assert.equal(buildPaymentLineage({ lots, consumptions: rows, paymentId: 11 }).availableAmount, '2075.00');
});

function transferredRefundFixture() {
  let nextRefundId = 30;
  let nextEntryId = 50;
  let nextConsumptionId = 200;
  const state = {
    payment: { id: 11, enrollment_id: 7, child_id: 8, direction_id: 1, group_id_snapshot: 9, project_id_snapshot: 2,
      paid_on: '2026-09-01', amount: '4100.00', price_snapshot: '1025.00', lessons_credit: '4.00000000', method: 'cashless', note: null },
    enrollments: new Map([['7', '0.00000000'], ['8', '3.64444444']]),
    lots: [
      paymentLot(20, 7, 12, 11, '0.00000000', '1025.00', '2026-09-01 12:00:00'),
      transferLot(21, 8, 14, 70, '3.64444444', '3.64444444', '1125.00', '2026-09-10 12:00:01'),
    ],
    consumptions: [consumption(100, 20, 13, 'transfer_out', '4100.00', '4.00000000', '2026-09-10 12:00:00', { transferId: 70 })],
    refunds: [], entries: [],
  };
  const changeLessons = (current, delta) => lessonDecimal(lessonUnits(current) + lessonUnits(delta));
  const lot = (id) => state.lots.find((item) => String(item.id) === String(id));
  async function query(sql, params = {}) {
    if (sql.includes('FROM payments WHERE id=') && sql.includes('FOR UPDATE')) return [[state.payment]];
    if (sql.startsWith('SELECT id,child_id,amount FROM payments')) return [[state.payment]];
    if (sql.startsWith('SELECT id FROM child_enrollments WHERE child_id=')) return [[{ id: 7 }, { id: 8 }]];
    if (sql.startsWith('SELECT bl.id,bl.enrollment_id,bl.source_balance_entry_id')) return [[...state.lots]];
    if (sql.startsWith('SELECT blc.id,blc.balance_lot_id,blc.balance_entry_id')) return [[...state.consumptions]];
    if (sql.startsWith('SELECT refund_id FROM balance_entries')) {
      const entry = state.entries.find((item) => item.idempotency_key === params.idempotencyKey);
      return [[entry ? { refund_id: entry.refund_id } : undefined].filter(Boolean)];
    }
    if (sql.includes('COALESCE(SUM(amount),0) refunded_amount')) {
      const cents = state.refunds.reduce((sum, item) => sum + BigInt(item.amount.replace('.', '')), 0n);
      return [[{ refunded_amount: `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}` }]];
    }
    if (sql.startsWith('INSERT INTO refunds')) {
      const row = { id: nextRefundId++, payment_id: Number(params.paymentId), enrollment_id: 7, child_id: 8, direction_id: 1,
        group_id_snapshot: 9, project_id_snapshot: 2, refunded_on: params.refundedOn, amount: params.amount,
        price_snapshot: params.price, lessons_debit: params.lessons, reason: params.reason, deleted_at: null };
      state.refunds.push(row); return [{ insertId: row.id }];
    }
    if (sql.startsWith('INSERT INTO balance_entries')) {
      const row = { id: nextEntryId++, refund_id: params.refundId, entry_type: 'refund', idempotency_key: params.idempotencyKey ?? null,
        occurred_at: params.refundedOn + ' 12:00:00' };
      state.entries.push(row); return [{ insertId: row.id }];
    }
    if (sql.startsWith('UPDATE balance_lots SET remaining_lessons=remaining_lessons-')) {
      const item = lot(params.id); item.remaining_lessons = changeLessons(item.remaining_lessons, `-${params.lessons}`); return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('INSERT INTO balance_lot_consumptions')) {
      const entry = state.entries.find((item) => String(item.id) === String(params.entryId));
      const row = consumption(nextConsumptionId++, Number(params.lotId), Number(params.entryId), 'refund', params.amount, params.lessons,
        entry.occurred_at, { refundId: entry.refund_id, refundPaymentId: 11 });
      state.consumptions.push(row); return [{ insertId: row.id }];
    }
    if (sql.startsWith('UPDATE child_enrollments SET balance_lessons=balance_lessons-')) {
      const id = String(params.id); state.enrollments.set(id, changeLessons(state.enrollments.get(id), `-${params.lessons}`)); return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('SELECT * FROM refunds WHERE')) return [[state.refunds.find((row) => String(row.id) === String(params.id))].filter(Boolean)];
    if (sql.includes("WHERE refund_id=:id AND entry_type='refund'")) return [[state.entries.find((row) => String(row.refund_id) === String(params.id))].filter(Boolean)];
    if (sql.startsWith('SELECT blc.id,blc.balance_lot_id,blc.lessons,blc.amount')) {
      return [[...state.consumptions.filter((row) => String(row.balance_entry_id) === String(params.entryId)).map((row) => {
        const item = lot(row.balance_lot_id); return { ...row, enrollment_id: item.enrollment_id, original_lessons: item.original_lessons, remaining_lessons: item.remaining_lessons };
      })]];
    }
    if (sql.includes('JOIN balance_lot_consumptions later')) {
      const applied = state.consumptions.filter((row) => String(row.balance_entry_id) === String(params.entryId));
      const dependent = applied.some((row) => state.consumptions.some((later) => String(later.balance_lot_id) === String(row.balance_lot_id) && later.id > row.id));
      return [dependent ? [{ 1: 1 }] : []];
    }
    if (sql.startsWith('UPDATE balance_lots SET remaining_lessons=remaining_lessons+')) {
      const item = lot(params.id); item.remaining_lessons = changeLessons(item.remaining_lessons, params.lessons); return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('UPDATE child_enrollments SET balance_lessons=balance_lessons+')) {
      const id = String(params.id); state.enrollments.set(id, changeLessons(state.enrollments.get(id), params.lessons)); return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('DELETE FROM balance_lot_consumptions WHERE balance_entry_id=')) {
      state.consumptions = state.consumptions.filter((row) => String(row.balance_entry_id) !== String(params.entryId)); return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('DELETE FROM balance_entries')) {
      state.entries = state.entries.filter((row) => String(row.id) !== String(params.id)); return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('DELETE FROM refunds')) {
      state.refunds = state.refunds.filter((row) => String(row.id) !== String(params.id)); return [{ affectedRows: 1 }];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  }
  const connection = { query, async beginTransaction() {}, async commit() {}, async rollback() {}, release() {} };
  const pool = {
    getConnection: async () => connection,
    query: async (sql, params = {}) => {
      if (sql.includes('FROM refunds r JOIN payments')) {
        return [[...state.refunds.filter((row) => !params.id || String(row.id) === String(params.id)).map((row) => ({
          ...row, child_name: 'Иван', direction_name: 'Робототехника', payment_method: 'cashless',
        }))]];
      }
      if (sql.includes('FROM payments p JOIN children')) {
        const cents = state.refunds.reduce((sum, item) => sum + BigInt(item.amount.replace('.', '')), 0n);
        return [[{ ...state.payment, child_name: 'Иван', direction_name: 'Робототехника',
          refunded_amount: `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`, remaining_lessons: '0.00000000' }]];
      }
      return query(sql, params);
    },
  };
  return { state, refunds: createMysqlRefunds(pool), payments: createMysqlPayments(pool) };
}

test('A backend: refund после transfer сохраняет historical snapshots и снимает value с target lot', async () => {
  const f = transferredRefundFixture();
  assert.equal((await f.payments.get(11)).refundableAmount, '4100.00');
  const refund = await f.refunds.create({ paymentId: 11, refundedOn: '2026-09-15', amount: '1025.00' });
  assert.equal(refund.priceSnapshot, '1025.00');
  assert.equal(refund.lessonsDebit, '1.00000000');
  assert.equal(f.state.lots[1].remaining_lessons, '2.73333333');
  assert.equal(f.state.enrollments.get('8'), '2.73333333');
  assert.equal(f.state.enrollments.get('7'), '0.00000000');
  assert.equal((await f.payments.get(11)).refundableAmount, '3075.00');
});

test('B backend: partial refund 500 после transfer даёт target balance 3.2', async () => {
  const f = transferredRefundFixture();
  const refund = await f.refunds.create({ paymentId: 11, refundedOn: '2026-09-15', amount: '500.00' });
  assert.equal(refund.lessonsDebit, '0.48780488');
  assert.equal(f.state.lots[1].remaining_lessons, '3.20000000');
  assert.equal(f.state.enrollments.get('8'), '3.20000000');
});

test('G: delete refund после transfer точно восстанавливает descendant lot и блокируется при последующей истории', async () => {
  const f = transferredRefundFixture();
  const refund = await f.refunds.create({ paymentId: 11, refundedOn: '2026-09-15', amount: '1025.00' });
  await f.refunds.remove(refund.id);
  assert.equal(f.state.lots[1].remaining_lessons, '3.64444444');
  assert.equal(f.state.enrollments.get('8'), '3.64444444');
  await assert.rejects(() => f.refunds.remove(refund.id), (error) => error.code === 'NOT_FOUND');

  const blocked = transferredRefundFixture();
  const blockedRefund = await blocked.refunds.create({ paymentId: 11, refundedOn: '2026-09-15', amount: '1025.00' });
  blocked.state.consumptions.push(consumption(999, 21, 88, 'attendance', '1125.00', '1.00000000', '2026-09-16 12:00:00'));
  await assert.rejects(() => blocked.refunds.remove(blockedRefund.id), (error) => error.code === 'REFUND_HAS_HISTORY' && error.status === 409);
});

test('H: одинаковый idempotency key после transfer создаёт один refund и один ledger effect', async () => {
  const f = transferredRefundFixture();
  const context = { actorUserId: 7, idempotencyKey: 'transferred-refund-1' };
  const first = await f.refunds.create({ paymentId: 11, refundedOn: '2026-09-15', amount: '1025.00' }, context);
  const second = await f.refunds.create({ paymentId: 11, refundedOn: '2026-09-15', amount: '1025.00' }, context);
  assert.equal(second.id, first.id);
  assert.equal(f.state.refunds.length, 1);
  assert.equal(f.state.entries.length, 1);
  assert.equal(f.state.consumptions.filter((row) => row.entry_type === 'refund').length, 1);
  assert.equal(f.state.lots[1].remaining_lessons, '2.73333333');
});

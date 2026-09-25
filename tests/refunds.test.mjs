import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMysqlPayments, refundablePaymentAmount } from '../backend/src/payments.mjs';
import { createMysqlRefunds } from '../backend/src/refunds.mjs';
import { lessonDecimal, lessonUnits } from '../backend/src/lesson-rules.mjs';

function fixture({ amount = '4100.00', price = '1025.00', lessons = '4.00000000', remaining = lessons, balance = remaining, method = 'cashless' } = {}) {
  let nextRefundId = 30; let nextEntryId = 50;
  const state = {
    payment: { id: 11, enrollment_id: 7, child_id: 8, direction_id: 1, group_id_snapshot: 9, project_id_snapshot: 2,
      paid_on: '2026-09-01', amount, price_snapshot: price, lessons_credit: lessons, method, note: null, deleted_at: null },
    lot: { id: 20, original_lessons: lessons, remaining_lessons: remaining, unit_price: price },
    enrollment: { id: 7, child_id: 8, balance_lessons: balance }, refunds: [], entries: [], consumptions: [], paymentDeleted: false,
  };
  const changeLessons = (current, delta) => lessonDecimal(lessonUnits(current) + lessonUnits(delta));
  const refundRow = (refund) => ({ ...refund, child_name: 'Иван', direction_name: 'Робототехника', payment_method: state.payment.method });
  async function query(sql, params = {}) {
    if (sql.includes('FROM payments WHERE id=') && sql.includes('FOR UPDATE')) return [[state.paymentDeleted ? undefined : state.payment].filter(Boolean)];
    if (sql.includes('FROM child_enrollments e')) return [[{ ...state.enrollment, child_id: 8, direction_id: 1, group_id: 9, project_id: 2, current_price: '9999.00' }]];
    if (sql.startsWith('SELECT id,balance_lessons FROM child_enrollments')) return [[state.enrollment]];
    if (sql.startsWith('SELECT id FROM child_enrollments WHERE child_id=')) return [[{ id: 7 }]];
    if (sql.startsWith('SELECT id FROM child_enrollments')) return [[{ id: 7 }]];
    if (sql.startsWith('SELECT bl.id,bl.enrollment_id,bl.source_balance_entry_id')) return [[{
      ...state.lot, enrollment_id: 7, source_balance_entry_id: 12, created_at: '2026-09-01 12:00:00',
      source_entry_type: 'payment', source_payment_id: 11, source_transfer_id: null, source_occurred_at: '2026-09-01 12:00:00',
    }]];
    if (sql.startsWith('SELECT blc.id,blc.balance_lot_id,blc.balance_entry_id')) return [[...state.consumptions.map((item) => {
      const entry = state.entries.find((x) => String(x.id) === String(item.balance_entry_id));
      const refund = entry ? state.refunds.find((x) => String(x.id) === String(entry.refund_id)) : null;
      return { ...item, entry_type: entry?.entry_type ?? 'refund', transfer_id: null, refund_id: entry?.refund_id ?? null,
        occurred_at: entry?.occurred_at ?? '2026-09-15 12:00:00', refund_payment_id: refund?.payment_id ?? null, reversal_id: null };
    })]];
    if (sql.includes('FROM balance_entries be') && sql.includes('JOIN balance_lots bl') && sql.includes('be.payment_id')) return [[state.lot]];
    if (sql.startsWith('SELECT refund_id FROM balance_entries')) {
      const entry = state.entries.find((item) => item.idempotency_key === params.idempotencyKey);
      return [[entry ? { refund_id: entry.refund_id } : undefined].filter(Boolean)];
    }
    if (sql.includes('COALESCE(SUM(amount),0) refunded_amount')) {
      const cents = state.refunds.reduce((sum, item) => sum + BigInt(item.amount.replace('.', '')), 0n);
      return [[{ refunded_amount: `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}` }]];
    }
    if (sql.startsWith('INSERT INTO refunds')) {
      const refund = { id: nextRefundId++, payment_id: Number(params.paymentId), enrollment_id: 7, child_id: 8, direction_id: 1,
        group_id_snapshot: 9, project_id_snapshot: 2, refunded_on: params.refundedOn, amount: params.amount,
        price_snapshot: params.price, lessons_debit: params.lessons, reason: params.reason, deleted_at: null };
      state.refunds.push(refund); return [{ insertId: refund.id }];
    }
    if (sql.startsWith('INSERT INTO balance_entries')) {
      const entry = { id: nextEntryId++, refund_id: params.refundId, entry_type: 'refund', lessons_delta: params.lessons,
        amount_delta: params.amount, idempotency_key: params.idempotencyKey ?? null, occurred_at: params.refundedOn + ' 12:00:00' };
      state.entries.push(entry); return [{ insertId: entry.id }];
    }
    if (sql.startsWith('UPDATE balance_lots SET remaining_lessons=remaining_lessons-')) {
      state.lot.remaining_lessons = changeLessons(state.lot.remaining_lessons, `-${params.lessons}`); return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('INSERT INTO balance_lot_consumptions')) {
      const item = { id: 100 + state.consumptions.length, balance_lot_id: Number(params.lotId), balance_entry_id: Number(params.entryId),
        lessons: params.lessons, amount: params.amount };
      state.consumptions.push(item); return [{ insertId: item.id }];
    }
    if (sql.startsWith('UPDATE balance_lots SET remaining_lessons=remaining_lessons+')) {
      state.lot.remaining_lessons = changeLessons(state.lot.remaining_lessons, params.lessons); return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('UPDATE child_enrollments SET balance_lessons=balance_lessons-')) {
      state.enrollment.balance_lessons = changeLessons(state.enrollment.balance_lessons, `-${params.lessons}`); return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('UPDATE child_enrollments SET balance_lessons=balance_lessons+')) {
      state.enrollment.balance_lessons = changeLessons(state.enrollment.balance_lessons, params.lessons); return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('SELECT * FROM refunds')) return [[state.refunds.find((item) => String(item.id) === String(params.id))].filter(Boolean)];
    if (sql.includes("WHERE refund_id=:id AND entry_type='refund'")) return [[state.entries.find((item) => String(item.refund_id) === String(params.id))].filter(Boolean)];
    if (sql.startsWith('SELECT blc.id,blc.balance_lot_id,blc.lessons,blc.amount')) return [[...state.consumptions
      .filter((item) => String(item.balance_entry_id) === String(params.entryId))
      .map((item) => ({ ...item, enrollment_id: 7, original_lessons: state.lot.original_lessons, remaining_lessons: state.lot.remaining_lessons }))]];
    if (sql.includes('JOIN balance_lot_consumptions later')) return [[]];
    if (sql.includes('be.reversal_of_entry_id=:entryId')) return [[]];
    if (sql.startsWith('DELETE FROM balance_lot_consumptions WHERE balance_entry_id=')) {
      state.consumptions = state.consumptions.filter((item) => String(item.balance_entry_id) !== String(params.entryId)); return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('DELETE FROM balance_entries')) { state.entries = state.entries.filter((item) => String(item.id) !== String(params.id)); return [{ affectedRows: 1 }]; }
    if (sql.startsWith('DELETE FROM refunds')) { state.refunds = state.refunds.filter((item) => String(item.id) !== String(params.id)); return [{ affectedRows: 1 }]; }
    if (sql.startsWith('SELECT id FROM refunds')) return [state.refunds.length ? [{ id: state.refunds[0].id }] : []];
    if (sql.includes("WHERE payment_id=:id AND entry_type='payment'")) return [[{ id: 12 }]];
    if (sql.startsWith('SELECT blc.id FROM balance_lot_consumptions')) return [[]];
    if (sql.startsWith('DELETE blc FROM balance_lot_consumptions') || sql.startsWith('DELETE FROM balance_lots')) return [{ affectedRows: 1 }];
    if (sql.startsWith('DELETE FROM payments')) { state.paymentDeleted = true; return [{ affectedRows: 1 }]; }
    throw new Error(`Неожиданный SQL: ${sql}`);
  }
  const connection = { query, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {} };
  const pool = {
    getConnection: async () => connection,
    query: async (sql, params = {}) => {
      if (sql.includes('FROM refunds r JOIN payments')) {
        const rows = state.refunds.filter((item) => !params.id || String(item.id) === String(params.id)).map(refundRow); return [rows];
      }
      if (sql.includes('FROM payments p JOIN children')) {
        const cents = state.refunds.reduce((sum, item) => sum + BigInt(item.amount.replace('.', '')), 0n);
        return [[{ ...state.payment, child_name: 'Иван', direction_name: 'Робототехника',
          refunded_amount: `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`, remaining_lessons: state.lot.remaining_lessons }]];
      }
      if (sql.startsWith('SELECT id,child_id,amount FROM payments')) return [[state.paymentDeleted ? undefined : state.payment].filter(Boolean)];
      return query(sql, params);
    },
  };
  return { state, refunds: createMysqlRefunds(pool), payments: createMysqlPayments(pool), restoreAttendance(lessonCount = '1.00000000') {
    state.lot.remaining_lessons = changeLessons(state.lot.remaining_lessons, lessonCount);
    state.enrollment.balance_lessons = changeLessons(state.enrollment.balance_lessons, lessonCount);
  } };
}

test('полный refund неиспользованной оплаты и его удаление точно меняют lot и баланс', async () => {
  const f = fixture();
  const refund = await f.refunds.create({ paymentId: 11, refundedOn: '2026-09-15', amount: '4100.00' });
  assert.equal(refund.lessonsDebit, '4.00000000'); assert.equal(refund.priceSnapshot, '1025.00');
  assert.equal(f.state.lot.remaining_lessons, '0.00000000'); assert.equal(f.state.enrollment.balance_lessons, '0.00000000');
  await f.refunds.remove(refund.id);
  assert.equal(f.state.lot.remaining_lessons, '4.00000000'); assert.equal(f.state.enrollment.balance_lessons, '4.00000000');
});

test('частичные refunds суммируются и не могут превысить оплату', async () => {
  const f = fixture();
  await f.refunds.create({ paymentId: 11, refundedOn: '2026-09-15', amount: '1025.00' });
  await f.refunds.create({ paymentId: 11, refundedOn: '2026-09-16', amount: '1025.00' });
  assert.equal(f.state.lot.remaining_lessons, '2.00000000');
  await assert.rejects(() => f.refunds.create({ paymentId: 11, refundedOn: '2026-09-17', amount: '2050.01' }), { code: 'REFUND_EXCEEDS_AVAILABLE', status: 409 });
});

test('consumed часть недоступна, а reversal attendance снова делает её refundable', async () => {
  const f = fixture({ remaining: '2.00000000', balance: '2.00000000' });
  assert.equal(refundablePaymentAmount({ paymentAmount: '4100.00', remainingLessons: '2.00000000', priceSnapshot: '1025.00' }), '2050.00');
  await assert.rejects(() => f.refunds.create({ paymentId: 11, refundedOn: '2026-09-15', amount: '3075.00' }), { code: 'REFUND_EXCEEDS_AVAILABLE' });
  f.restoreAttendance('1.00000000');
  const refund = await f.refunds.create({ paymentId: 11, refundedOn: '2026-09-15', amount: '3075.00' });
  assert.equal(refund.lessonsDebit, '3.00000000');
});

test('payment с refund не удаляется, после удаления refund удаляется', async () => {
  const f = fixture();
  const refund = await f.refunds.create({ paymentId: 11, refundedOn: '2026-09-15', amount: '1025.00' });
  await assert.rejects(() => f.payments.remove(11), { code: 'PAYMENT_HAS_HISTORY', status: 409 });
  await f.refunds.remove(refund.id);
  await f.payments.remove(11);
  assert.equal(f.state.paymentDeleted, true); assert.equal(f.state.enrollment.balance_lessons, '0.00000000');
});

test('refund использует historical price и сохраняет cash/cashless snapshot исходной оплаты', async () => {
  for (const method of ['cash', 'cashless']) {
    const f = fixture({ method });
    const refund = await f.refunds.create({ paymentId: 11, refundedOn: '2026-10-01', amount: '2050.00' });
    assert.equal(refund.priceSnapshot, '1025.00'); assert.equal(refund.lessonsDebit, '2.00000000'); assert.equal(refund.paymentMethod, method);
  }
});

test('refund отклоняет невозможную дату и дату раньше исходной оплаты', async () => {
  const f = fixture();
  await assert.rejects(() => f.refunds.create({ paymentId: 11, refundedOn: '2026-02-31', amount: '1025.00' }), { code: 'VALIDATION_ERROR' });
  await assert.rejects(() => f.refunds.create({ paymentId: 11, refundedOn: '2026-08-31', amount: '1025.00' }), { code: 'REFUND_BEFORE_PAYMENT' });
  const sameDay = await f.refunds.create({ paymentId: 11, refundedOn: '2026-09-01', amount: '1025.00' });
  assert.equal(sameDay.refundedOn, '2026-09-01');
});

test('повтор refund с тем же scoped key возвращает исходную операцию', async () => {
  const f = fixture();
  const context = { actorUserId: 7, idempotencyKey: 'refund-submit-1' };
  const first = await f.refunds.create({ paymentId: 11, refundedOn: '2026-09-15', amount: '1025.00' }, context);
  const repeated = await f.refunds.create({ paymentId: 11, refundedOn: '2026-09-15', amount: '1025.00' }, context);
  assert.equal(repeated.id, first.id); assert.equal(f.state.refunds.length, 1); assert.equal(f.state.entries.length, 1);
});

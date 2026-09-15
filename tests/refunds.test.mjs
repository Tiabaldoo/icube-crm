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
    enrollment: { id: 7, balance_lessons: balance }, refunds: [], entries: [], paymentDeleted: false,
  };
  const changeLessons = (current, delta) => lessonDecimal(lessonUnits(current) + lessonUnits(delta));
  const refundRow = (refund) => ({ ...refund, child_name: 'Иван', direction_name: 'Робототехника', payment_method: state.payment.method });
  async function query(sql, params = {}) {
    if (sql.includes('FROM payments WHERE id=') && sql.includes('FOR UPDATE')) return [[state.paymentDeleted ? undefined : state.payment].filter(Boolean)];
    if (sql.includes('FROM child_enrollments e')) return [[{ ...state.enrollment, child_id: 8, direction_id: 1, group_id: 9, project_id: 2, current_price: '9999.00' }]];
    if (sql.startsWith('SELECT id,balance_lessons FROM child_enrollments')) return [[state.enrollment]];
    if (sql.startsWith('SELECT id FROM child_enrollments')) return [[{ id: 7 }]];
    if (sql.includes('FROM balance_entries be') && sql.includes('JOIN balance_lots bl') && sql.includes('be.payment_id')) return [[state.lot]];
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
      const entry = { id: nextEntryId++, refund_id: params.refundId, entry_type: 'refund', lessons_delta: params.lessons, amount_delta: params.amount };
      state.entries.push(entry); return [{ insertId: entry.id }];
    }
    if (sql.startsWith('UPDATE balance_lots SET remaining_lessons=remaining_lessons-')) {
      state.lot.remaining_lessons = changeLessons(state.lot.remaining_lessons, `-${params.lessons}`); return [{ affectedRows: 1 }];
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
    if (sql.includes('be.reversal_of_entry_id=:entryId')) return [[]];
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
      if (sql.includes('FROM payments p JOIN children')) return [[{ ...state.payment, child_name: 'Иван', direction_name: 'Робототехника', refunded_amount: '0.00', remaining_lessons: state.lot.remaining_lessons }]];
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

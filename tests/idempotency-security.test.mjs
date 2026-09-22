import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scopedIdempotencyKey } from '../backend/src/idempotency.mjs';
import { createMysqlPayments } from '../backend/src/payments.mjs';

function paymentFixture() {
  const state = {
    enrollments: new Map([
      ['10', { id: 10, child_id: 5, direction_id: 1, project_id: 2, group_id: 7, balance_lessons: '0.00000000', current_price: '1025.00', superseded_at: null }],
      ['11', { id: 11, child_id: 6, direction_id: 1, project_id: 2, group_id: 8, balance_lessons: '0.00000000', current_price: '1025.00', superseded_at: null }],
    ]),
    payments: [], entries: [], nextPayment: 90, nextEntry: 190,
  };
  async function query(sql, params = {}) {
    if (sql.includes('FROM child_enrollments e') && sql.includes('FOR UPDATE')) return [[state.enrollments.get(String(params.id))]];
    if (sql.startsWith('SELECT payment_id FROM balance_entries')) {
      const entry = state.entries.find((item) => item.idempotency_key === params.idempotencyKey);
      return [[entry ? { payment_id: entry.payment_id } : undefined].filter(Boolean)];
    }
    if (sql.startsWith('INSERT INTO payments')) {
      const item = { id: state.nextPayment++, enrollment_id: Number(params.enrollmentId), child_id: Number(params.childId),
        direction_id: Number(params.directionId), group_id_snapshot: params.groupId, project_id_snapshot: Number(params.projectId),
        paid_on: params.paidOn, amount: params.amount, price_snapshot: params.price, lessons_credit: params.lessons,
        method: params.method, note: params.note };
      state.payments.push(item); return [{ insertId: item.id }];
    }
    if (sql.startsWith('INSERT INTO balance_entries')) {
      const item = { id: state.nextEntry++, payment_id: Number(params.paymentId), idempotency_key: params.idempotencyKey };
      state.entries.push(item); return [{ insertId: item.id }];
    }
    if (sql.startsWith('INSERT INTO balance_lots')) return [{ insertId: 290 }];
    if (sql.startsWith('UPDATE child_enrollments SET balance_lessons=')) return [{ affectedRows: 1 }];
    if (sql.includes('FROM payments p JOIN children c')) {
      const item = state.payments.find((payment) => String(payment.id) === String(params.id));
      return [[item ? { ...item, child_name: `Child ${item.child_id}`, direction_name: 'Робототехника', refunded_amount: '0.00', remaining_lessons: item.lessons_credit } : undefined].filter(Boolean)];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  }
  const connection = { query, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {} };
  return { state, service: createMysqlPayments({ query, getConnection: async () => connection }) };
}

test('double payment возвращает одну операцию без двойного начисления', async () => {
  const f = paymentFixture(); const body = { enrollmentId: 10, paidOn: '2026-09-20', amount: '4100', method: 'cashless' };
  const context = { actorUserId: 4, idempotencyKey: 'payment-submit-1' };
  const first = await f.service.create(body, context); const repeated = await f.service.create(body, context);
  assert.equal(repeated.id, first.id); assert.equal(f.state.payments.length, 1); assert.equal(f.state.entries.length, 1);
});

test('scoped keys различают пользователей, типы и сущности', () => {
  const base = { key: 'same-browser-key', actorUserId: 4, operation: 'payment', projectId: 2, entity: 10 };
  const value = scopedIdempotencyKey(base);
  assert.notEqual(value, scopedIdempotencyKey({ ...base, actorUserId: 5 }));
  assert.notEqual(value, scopedIdempotencyKey({ ...base, operation: 'refund' }));
  assert.notEqual(value, scopedIdempotencyKey({ ...base, entity: 11 }));
  assert.notEqual(value, scopedIdempotencyKey({ ...base, projectId: 3 }));
});

test('один raw key для разных enrollment не склеивает оплаты', async () => {
  const f = paymentFixture(); const context = { actorUserId: 4, idempotencyKey: 'same-browser-key' };
  const first = await f.service.create({ enrollmentId: 10, paidOn: '2026-09-20', amount: '4100', method: 'cashless' }, context);
  const second = await f.service.create({ enrollmentId: 11, paidOn: '2026-09-20', amount: '4100', method: 'cashless' }, context);
  assert.notEqual(first.id, second.id); assert.equal(f.state.payments.length, 2);
});

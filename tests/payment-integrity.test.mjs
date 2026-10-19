import test from 'node:test';
import assert from 'node:assert/strict';
import { financeFixture } from './helpers/finance-sql-fixture.mjs';

for (const [name, used, amount, expectedBalance, remaining] of [
  ['unused', 0, '3375.00', 3, 3], ['partly used', 2, '3375.00', 1, 1],
  ['below used volume', 3, '2250.00', -1, 0], ['fully used', 4, '5625.00', 1, 1], ['fully used reduction', 4, '2250.00', -2, 0],
]) test(`payment correction: ${name}, final ledger/FIFO and replay`, async (t) => {
  const f = financeFixture(t); const payment = await f.pay();
  if (used) f.visits(used);
  const visits = f.rows('attendances'); const charges = f.rows('balance_entries').filter((e) => e.entry_type === 'attendance');
  f.db.exec("UPDATE price_versions SET price='9999.00' WHERE scope_type='group'; UPDATE group_memberships SET group_id=99");
  for (let i = 0; i < 2; i++) {
    const saved = await f.payments.update(payment.id, { amount });
    assert.equal(saved.priceSnapshot, '1125.00'); assert.equal(saved.groupId, '9'); assert.equal(saved.method, 'cashless');
    assert.equal(f.balance(), expectedBalance);
    assert.equal(Number(f.rows('balance_lots')[0].remaining_lessons), remaining);
    assert.deepEqual(f.rows('attendances'), visits);
    assert.deepEqual(f.rows('balance_entries').filter((e) => e.entry_type === 'attendance'), charges);
    assert.equal(f.rows('balance_entries').filter((e) => e.entry_type === 'payment').length, 1);
  }
});

test('reduction below used volume reallocates other payment FIFO without double debits', async (t) => {
  const f = financeFixture(t); const first = await f.pay(); const second = await f.pay('4500.00'); f.visits(3);
  await f.payments.update(first.id, { amount: '2250.00' });
  assert.equal(f.balance(), 3);
  assert.deepEqual(f.rows('balance_lots').map((l) => Number(l.remaining_lessons)), [0, 3]);
  assert.equal(f.rows('balance_lot_consumptions').length, 3);
  assert.equal((await f.payments.get(second.id)).refundableAmount, '3375.00');
  const refund = await f.refunds.create({ paymentId: second.id, amount: '3375', refundedOn: '2026-10-19' });
  assert.equal(refund.amount, '3375.00'); assert.equal(f.balance(), 0);
});

test('correction after refunds reserves actual returned money, rejects impossible correction atomically', async (t) => {
  const f = financeFixture(t); const payment = await f.pay(); f.visits(2);
  await f.refunds.create({ paymentId: payment.id, amount: '1125', refundedOn: '2026-10-18' });
  const refunds = f.rows('refunds');
  await f.payments.update(payment.id, { amount: '2250', method: 'cash' });
  assert.equal(f.balance(), -1); assert.deepEqual(f.rows('refunds'), refunds);
  assert.equal((await f.payments.get(payment.id)).refundableAmount, '0.00');
  const before = ['payments','child_enrollments','balance_lots','balance_entries','balance_lot_consumptions'].map(f.rows);
  await assert.rejects(f.payments.update(payment.id, { amount: '1000' }), { code: 'PAYMENT_BELOW_REFUNDED' });
  assert.deepEqual(['payments','child_enrollments','balance_lots','balance_entries','balance_lot_consumptions'].map(f.rows), before);
  await f.payments.update(payment.id, { amount: '4500' });
  assert.equal(f.balance(), 1); assert.equal((await f.payments.get(payment.id)).refundableAmount, '1125.00');
});

test('funding failure rolls back payment, balances, lots and allocations together', async (t) => {
  const f = financeFixture(t); const payment = await f.pay(); f.visits(3);
  const before = ['payments','child_enrollments','balance_lots','balance_entries','balance_lot_consumptions'].map(f.rows);
  f.failAt('UPDATE balance_lots SET original_lessons=');
  await assert.rejects(f.payments.update(payment.id, { amount: '2250' }), /injected funding failure/);
  assert.deepEqual(['payments','child_enrollments','balance_lots','balance_entries','balance_lot_consumptions'].map(f.rows), before);
});

test('financial transfer dependency blocks amount only; metadata cannot refill consumed source lot', async (t) => {
  const f = financeFixture(t); const payment = await f.pay(); f.visits(2);
  f.db.exec('INSERT INTO balance_transfer_lot_changes VALUES(1,1)');
  const before = f.rows('balance_lots');
  await assert.rejects(f.payments.update(payment.id, { amount: '3375' }), { code: 'PAYMENT_TRANSFER_HISTORY' });
  await f.payments.update(payment.id, { method: 'cash', note: 'Уточнение способа' });
  assert.deepEqual(f.rows('balance_lots'), before); assert.equal(f.balance(), 2);
  assert.equal((await f.payments.get(payment.id)).method, 'cash');
});

test('historical price cannot be replaced through API and independent directions remain separate', async (t) => {
  const f = financeFixture(t); const payment = await f.pay(); await f.pay('4500', { enrollmentId: 8 });
  await assert.rejects(f.payments.update(payment.id, { priceSnapshot: '1500' }), { code: 'PAYMENT_PRICE_LOCKED' });
  await f.payments.update(payment.id, { amount: '9000' });
  assert.equal(f.balance(), 8); assert.equal(f.balance(8), 3);
  assert.equal(f.rows('balance_lots').length, 2);
});

test('removing a funded visit after payment reduction reconciles debt and preserves other visits', async (t) => {
  const f = financeFixture(t); const payment = await f.pay(); f.visits(3);
  // The first visit belongs to this lesson; the other two are historical lessons.
  f.db.exec('UPDATE attendances SET lesson_id=10+id-1');
  await f.payments.update(payment.id, { amount: '2250' });
  await f.lessons.removeAttendance(10, 8, { roles: ['director'], userId: 1 });
  assert.equal(f.balance(), 0);
  assert.equal(Number(f.rows('balance_lots')[0].remaining_lessons), 0);
  assert.equal(f.rows('attendances').filter((a) => a.present).length, 2);
  assert.equal(f.rows('balance_entries').filter((e) => e.entry_type === 'reversal').length, 1);
  await f.lessons.putAttendance(10, 8, { present: true }, { roles: ['director'], userId: 1 });
  await f.lessons.putAttendance(10, 8, { present: true }, { roles: ['director'], userId: 1 });
  assert.equal(f.balance(), -1); assert.equal(Number(f.rows('balance_lots')[0].remaining_lessons), 0);
  await f.lessons.removeAttendance(10, 8, { roles: ['director'], userId: 1 });
  assert.equal(f.balance(), 0); assert.equal(f.rows('attendances').filter((a) => a.present).length, 2);
});

test('individual eight-lesson package retains historical mode and price on amount edit', async (t) => {
  const f = financeFixture(t, { price: '825.00', packageCount: 8, mode: 'attendance_share' });
  assert.deepEqual(await f.payments.quote(7, '2026-10-15'), { currentPrice: '825.00', subscriptionAmount: '6600.00' });
  const payment = await f.pay('6600'); f.visits(2, { price: '825.00' });
  f.db.exec("UPDATE price_versions SET price='1100.00' WHERE scope_type='group'; UPDATE study_groups SET calculation_mode='standard',package_lesson_count=6");
  await f.payments.update(payment.id, { amount: '4950' });
  assert.equal(f.balance(), 4); assert.equal(f.rows('payments')[0].calculation_mode_snapshot, 'attendance_share');
  assert.equal(f.rows('payments')[0].price_snapshot, '825.00');
});

test('refund availability after corrected payment and backdated visits follows actual remaining funding', async (t) => {
  const f = financeFixture(t); const payment = await f.pay('4500', { paidOn: '2026-10-18' }); f.visits(2);
  await f.payments.update(payment.id, { amount: '3375' });
  await f.refunds.create({ paymentId: payment.id, amount: '1125', refundedOn: '2026-10-19' });
  assert.equal(f.balance(), 0); assert.equal(Number(f.rows('balance_lots')[0].remaining_lessons), 0);
  await assert.rejects(f.refunds.create({ paymentId: payment.id, amount: '1125', refundedOn: '2026-10-19' }), { code: 'REFUND_EXCEEDS_AVAILABLE' });
  assert.equal(f.rows('refunds').length, 1);
});

test('editing a payment that covered earlier debt cannot refill funds or misattribute later payments', async (t) => {
  const f = financeFixture(t); f.visits(3, { paymentId: null });
  const first = await f.pay(); const second = await f.pay();
  assert.deepEqual(f.rows('balance_lots').map((l) => Number(l.remaining_lessons)), [1, 4]);
  await f.payments.update(first.id, { amount: '2250' });
  assert.equal(f.balance(), 3);
  assert.deepEqual(f.rows('balance_lots').map((l) => Number(l.remaining_lessons)), [0, 3]);
  assert.equal((await f.payments.get(first.id)).refundableAmount, '0.00');
  assert.equal((await f.payments.get(second.id)).refundableAmount, '3375.00');
  assert.equal(f.rows('attendances').filter((a) => a.present).length, 3);
});

test('unrelated incoming transfer does not block a correction confined to the payment’s free lot', async (t) => {
  const f = financeFixture(t); const payment = await f.pay(); f.visits(2);
  f.db.exec(`INSERT INTO balance_entries(enrollment_id,entry_type,lessons_delta,amount_delta,unit_price_snapshot,transfer_id,occurred_at)
    VALUES(7,'transfer_in','3.00000000','4500.00','1500.00',10,'2026-10-18');
    INSERT INTO balance_lots(enrollment_id,source_balance_entry_id,original_lessons,remaining_lessons,unit_price)
    VALUES(7,last_insert_rowid(),'3.00000000','3.00000000','1500.00');
    UPDATE child_enrollments SET balance_lessons=balance_lessons+3 WHERE id=7;`);
  const incoming = f.rows('balance_lots')[1]; const allocations = f.rows('balance_lot_consumptions');
  await f.payments.update(payment.id, { amount: '3375' });
  assert.equal(f.balance(), 4); assert.equal(Number(f.rows('balance_lots')[0].remaining_lessons), 1);
  assert.deepEqual(f.rows('balance_lots')[1], incoming); assert.deepEqual(f.rows('balance_lot_consumptions'), allocations);
});

test('fully refunded payment can be increased, with exactly one newly refundable remainder', async (t) => {
  const f = financeFixture(t); const payment = await f.pay();
  await f.refunds.create({ paymentId: payment.id, amount: '2250', refundedOn: '2026-10-18' });
  await f.refunds.create({ paymentId: payment.id, amount: '2250', refundedOn: '2026-10-19' });
  await f.payments.update(payment.id, { amount: '5625' });
  assert.equal(f.balance(), 1); assert.equal((await f.payments.get(payment.id)).refundableAmount, '1125.00');
  await f.refunds.create({ paymentId: payment.id, amount: '1125', refundedOn: '2026-10-19' });
  assert.equal(f.balance(), 0); assert.equal(f.rows('refunds').length, 3);
  await assert.rejects(f.refunds.create({ paymentId: payment.id, amount: '0.01', refundedOn: '2026-10-19' }), { code: 'REFUND_EXCEEDS_AVAILABLE' });
});

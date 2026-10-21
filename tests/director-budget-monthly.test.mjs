import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { budgetFixture } from './helpers/budget-fixture.mjs';
import { createApiRouter } from '../backend/src/routes.mjs';

test('monthly budget returns twelve business-calendar months and rolls over at Sakhalin midnight/New Year', async (t) => {
  let instant = new Date('2026-12-31T12:59:59Z');
  const f = budgetFixture(t, { now: () => instant });
  let result = await f.service.monthly({ from: '2000-01-01', to: '2000-01-02' }, f.context);
  assert.equal(result.months.length, 12);
  assert.deepEqual(result.months[0], { month: '2026-01', from: '2026-01-01', to: '2026-01-31', result: '0.00' });
  assert.equal(result.months.at(-1).month, '2026-12');
  instant = new Date('2026-12-31T13:00:00Z');
  result = await f.service.monthly({}, f.context);
  assert.equal(result.months[0].month, '2026-02');
  assert.equal(result.months.at(-1).month, '2027-01');
  assert.equal(result.months[0].to, '2026-02-28');
});

test('every monthly bar equals the ordinary budget including receipts, refunds, salaries, rent, taxes, partner obligations and manual entries', async (t) => {
  const f = budgetFixture(t);
  f.child(1);
  f.payment(1, { date: '2026-09-30', amount: '10000.01' });
  f.payment(2, { date: '2026-10-01', project: 3, amount: '6600.00', mode: 'attendance_share' });
  f.payment(3, { date: '2026-08-01', project: 3, amount: '3000.00', method: 'cash' });
  f.refund(1, { date: '2026-09-30', amount: '100.01' });
  f.lesson(1, '2026-09-30'); f.salary(1, '1000.00');
  f.lesson(2, '2026-10-01', { project: 3, group: 99, mode: 'attendance_share' }); f.visit(2, 1); f.salary(2, '275.00');
  f.db.exec("UPDATE lessons SET teacher_share_percent_snapshot='33.3333',partner_share_percent_snapshot='33.3333'; UPDATE attendances SET price_snapshot='825.00'");
  await f.manual.create({ type: 'expense', date: '2026-07-15', amount: '500.01' }, f.context);
  await f.manual.create({ type: 'income', date: '2026-09-01', amount: '200.02' }, { ...f.context, idempotencyKey: 'monthly-income' });
  const before = f.snapshot(); const changes = f.db.prepare('SELECT total_changes() n').get().n;
  const result = await f.service.monthly({}, f.context);
  for (const row of result.months) {
    const ordinary = await f.get({ from: row.from, to: row.to });
    assert.equal(row.result, ordinary.totals.result, row.month);
  }
  assert.equal(result.months.find((row) => row.month === '2026-07').result, '-500.01');
  assert.equal(result.months.find((row) => row.month === '2026-06').result, '0.00');
  assert.ok(Number(result.months.at(-1).result) > 0);
  assert.equal(f.snapshot(), before); assert.equal(f.db.prepare('SELECT total_changes() n').get().n, changes);
});

test('manual creation, moving/editing and deletion change the corresponding months without changing project receipts', async (t) => {
  const f = budgetFixture(t);
  const amounts = async () => (await f.service.monthly({}, f.context)).months.map((row) => row.result);
  const before = await amounts();
  const entry = await f.manual.create({ type: 'income', date: '2026-09-01', amount: '123.45' }, f.context);
  const created = await amounts(); assert.equal(created[10], '123.45'); assert.equal(created[11], '0.00');
  await f.manual.update(entry.id, { type: 'expense', date: '2026-10-01', amount: '300.01' }, f.context);
  const edited = await amounts(); assert.equal(edited[10], '0.00'); assert.equal(edited[11], '-300.01');
  await f.manual.remove(entry.id, f.context); assert.deepEqual(await amounts(), before);
  assert.equal((await f.get()).totals.payments, '0.00');
});

test('monthly API is one director-only read request and equals the service response', async (t) => {
  const f = budgetFixture(t);
  for (const role of ['partner', 'teacher', 'parent']) {
    const auth = { userId: '1', roles: [role] };
    await assert.rejects(f.service.monthly({}, auth), { code: 'FORBIDDEN' });
    const router = createApiRouter(f.pool, { directorBudget: f.service, testAuth(req, _res, next) { req.auth = auth; next(); } });
    const response = await new Promise((resolve, reject) => router.handle({ method: 'GET', url: '/statistics/budget/monthly', query: {} }, {
      status(code) { this.code = code; return this; }, json(body) { resolve({ status: this.code, body }); },
    }, reject));
    assert.equal(response.status, 403);
  }
  assert.equal(f.calls.length, 0, 'denied roles never query financial data');
  const expected = await f.service.monthly({}, f.context);
  const router = createApiRouter(f.pool, { directorBudget: f.service, testAuth(req, _res, next) { req.auth = f.context; next(); } });
  const actual = await new Promise((resolve, reject) => router.handle({ method: 'GET', url: '/statistics/budget/monthly', query: { from: '1900-01-01' }, get: () => undefined }, {
    status(code) { this.code = code; return this; }, json(body) { resolve({ status: this.code, data: body.data }); },
  }, reject));
  assert.equal(actual.status, 200); assert.deepEqual(actual.data, expected);
});

test('monthly reuses the one financial report with a bounded query count independent of children and lessons', async (t) => {
  const f = budgetFixture(t); await f.service.monthly({}, f.context); const count = f.calls.length;
  for (let id = 1; id <= 20; id++) { f.child(id); f.lesson(id, '2026-10-01'); f.visit(id, id); }
  f.calls.length = 0; await f.service.monthly({}, f.context);
  assert.equal(f.calls.length, count);
  assert.ok(f.calls.every(({ sql }) => /^SELECT/.test(sql)));
  const source = await readFile(new URL('../backend/src/director-budget.mjs', import.meta.url), 'utf8');
  assert.equal((source.match(/SELECT 'payments' kind/g) ?? []).length, 1);
  assert.equal((source.match(/return calculateDirectorBudget\(/g) ?? []).length, 1);
});

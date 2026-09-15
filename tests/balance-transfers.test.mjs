import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { calculateTransferPlan, createBalanceTransfers } from '../backend/src/balance-transfers.mjs';
import { createMysqlCatalog } from '../backend/src/catalog.mjs';

test('3 × 1025 ₽ переносятся как 3075 ₽ и 2.73333333 занятия по 1125 ₽', () => {
  const plan = calculateTransferPlan('3.00000000', [{ id: 1, remaining_lessons: '3.00000000', unit_price: '1025.00' }], '1125.00');
  assert.equal(plan.amount, '3075.00'); assert.equal(plan.targetCredit, '2.73333333');
});

test('стоимость берётся из remaining lots разных исторических цен, а не из текущей цены source', () => {
  const plan = calculateTransferPlan('3.00000000', [
    { id: 1, remaining_lessons: '1.00000000', unit_price: '1025.00' },
    { id: 2, remaining_lessons: '2.00000000', unit_price: '1125.00' },
  ], '1000.00');
  assert.equal(plan.amount, '3275.00'); assert.equal(plan.targetCredit, '3.27500000');
});

test('положительный баланс ограничивает lots после долга и не переносит лишнюю стоимость', () => {
  const plan = calculateTransferPlan('2.00000000', [{ id: 1, remaining_lessons: '3.00000000', unit_price: '1025.00' }], '1125.00');
  assert.equal(plan.amount, '2050.00'); assert.equal(plan.debtAdjustments[0].lessons, '1.00000000'); assert.equal(plan.consumptions[0].lessons, '2.00000000');
});

test('долг поглощает старые lots по FIFO до расчёта денежного переноса', () => {
  const plan = calculateTransferPlan('2.00000000', [
    { id: 1, remaining_lessons: '1.00000000', unit_price: '1025.00' },
    { id: 2, remaining_lessons: '2.00000000', unit_price: '1125.00' },
  ], '1000.00');
  assert.equal(plan.debtAdjustments[0].lotId, '1'); assert.equal(plan.amount, '2250.00');
});

function fixture(overrides = {}) {
  const state = {
    source: { id: 9, child_id: 8, direction_id: 1, status: 'finished', balance_lessons: '3.00000000', current_price: '9999.00' },
    target: { id: 10, child_id: 8, direction_id: 2, status: 'active', balance_lessons: '1.00000000', current_price: '1125.00' },
    lots: [{ id: 60, remaining_lessons: '3.00000000', unit_price: '1025.00' }], transfers: [], entries: [], calls: [],
    ...overrides,
  };
  let nextEntry = 80;
  const query = async (sql, params = {}) => {
    state.calls.push({ sql, params });
    if (sql.includes('FROM balance_entries be JOIN balance_transfers bt')) {
      const entry = state.entries.find((item) => item.idempotencyKey === params.key);
      return [entry ? [state.transfers.find((item) => item.id === entry.transferId)] : []];
    }
    if (sql.includes('FROM child_enrollments e') && sql.includes('FOR UPDATE')) return [[state.source, state.target]];
    if (sql.startsWith('SELECT id,remaining_lessons,unit_price FROM balance_lots')) return [[...state.lots]];
    if (sql.startsWith('INSERT INTO balance_transfers')) {
      const item = { id: 70, child_id: params.childId, source_enrollment_id: params.sourceId, target_enrollment_id: params.targetId,
        transferred_amount: params.amount, target_price_snapshot: params.targetPrice, target_lessons_credit: params.targetCredit,
        transferred_at: '2026-09-15 12:00:00.000000' };
      state.transfers.push(item); return [{ insertId: item.id }];
    }
    if (sql.startsWith('INSERT INTO balance_entries')) {
      const item = { id: nextEntry++, transferId: params.transferId, type: sql.includes("'transfer_out'") ? 'out' : 'in', idempotencyKey: params.idempotencyKey ?? null, ...params };
      state.entries.push(item); return [{ insertId: item.id }];
    }
    if (sql.startsWith('UPDATE balance_lots')) { state.lots.find((item) => String(item.id) === String(params.id)).remaining_lessons = '0.00000000'; return [{ affectedRows: 1 }]; }
    if (sql.startsWith('INSERT INTO balance_lot_consumptions')) return [{ insertId: 90 }];
    if (sql === 'UPDATE child_enrollments SET balance_lessons=0 WHERE id=:id') { state.source.balance_lessons = '0.00000000'; return [{ affectedRows: 1 }]; }
    if (sql.startsWith('UPDATE child_enrollments SET balance_lessons=balance_lessons+')) { state.target.balance_lessons = '3.73333333'; return [{ affectedRows: 1 }]; }
    if (sql.startsWith('INSERT INTO balance_lots')) { state.targetLot = params; return [{ insertId: 61 }]; }
    if (sql.startsWith('SELECT * FROM balance_transfers WHERE')) return [[state.transfers[0]]];
    throw new Error(`Неожиданный SQL: ${sql}`);
  };
  const connection = { query, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {} };
  return { state, service: createBalanceTransfers({ query, getConnection: async () => connection }) };
}

test('transfer одной транзакцией обнуляет source, пополняет target и создаёт новый lot', async () => {
  const { state, service } = fixture();
  const result = await service.create({ sourceEnrollmentId: 9, targetEnrollmentId: 10 }, { idempotencyKey: 'transfer-1' });
  assert.equal(result.transferredAmount, '3075.00'); assert.equal(result.targetPriceSnapshot, '1125.00');
  assert.equal(state.source.balance_lessons, '0.00000000'); assert.equal(state.target.balance_lessons, '3.73333333');
  assert.equal(state.targetLot.lessons, '2.73333333'); assert.equal(state.targetLot.price, '1125.00');
  assert.deepEqual(state.entries.map((item) => item.type), ['out', 'in']);
  assert.equal(state.calls.some(({ sql }) => /UPDATE (?:payments|refunds|attendances)/.test(sql)), false);
  await service.create({ sourceEnrollmentId: 9, targetEnrollmentId: 10 }, { idempotencyKey: 'transfer-1' });
  assert.equal(state.transfers.length, 1); assert.equal(state.entries.length, 2);
});

for (const [name, overrides, code] of [
  ['между разными детьми', { target: { id: 10, child_id: 99, direction_id: 2, status: 'active', balance_lessons: '0.00000000', current_price: '1125.00' } }, 'DIFFERENT_CHILDREN'],
  ['из active source', { source: { id: 9, child_id: 8, direction_id: 1, status: 'active', balance_lessons: '3.00000000', current_price: '1025.00' } }, 'SOURCE_NOT_FINISHED'],
  ['в finished target', { target: { id: 10, child_id: 8, direction_id: 2, status: 'finished', balance_lessons: '0.00000000', current_price: '1125.00' } }, 'TARGET_FINISHED'],
]) test(`нельзя переносить ${name}`, async () => {
  const { service } = fixture(overrides);
  await assert.rejects(service.create({ sourceEnrollmentId: 9, targetEnrollmentId: 10 }), (error) => error.code === code);
});

test('PATCH enrollment не переписывает направление существующей финансовой истории', async () => {
  let mutated = false;
  const query = async (sql) => {
    if (sql.startsWith('SELECT * FROM child_enrollments')) return [[{ id: 9, child_id: 8, direction_id: 1, status: 'active', individual_price: null }]];
    if (sql.startsWith('UPDATE child_enrollments')) { mutated = true; return [{ affectedRows: 1 }]; }
    throw new Error(`Неожиданный SQL: ${sql}`);
  };
  const connection = { query, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {} };
  await assert.rejects(createMysqlCatalog({ query, getConnection: async () => connection }).updateEnrollment(9, { directionId: 2 }),
    (error) => error.code === 'DIRECTION_CHANGE_REQUIRES_NEW_ENROLLMENT');
  assert.equal(mutated, false);
});

test('router подключает preview и POST переноса к реальному сервису', async () => {
  const routes = await readFile(new URL('../backend/src/routes.mjs', import.meta.url), 'utf8');
  assert.match(routes, /router\.get\('\/balance-transfers\/preview'[\s\S]*?balanceTransfers\.preview/);
  assert.match(routes, /router\.post\('\/balance-transfers'[\s\S]*?balanceTransfers\.create/);
  assert.doesNotMatch(routes, /notImplemented\('balance-transfers'\)/);
});

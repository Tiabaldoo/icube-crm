import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { calculateTransferPlan, createBalanceTransfers, fundedTransferLessons } from '../backend/src/balance-transfers.mjs';
import { createMysqlCatalog } from '../backend/src/catalog.mjs';
import { lessonDecimal, lessonUnits } from '../backend/src/lesson-rules.mjs';

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

test('target -1 + 2.73333333 создаёт lot с остатком 1.73333333', () => {
  assert.equal(fundedTransferLessons('2.73333333', '-1.00000000'), '1.73333333');
});

test('target -3 + 2 оставляет balance -1 и lot remaining 0', () => {
  assert.equal(fundedTransferLessons('2.00000000', '-3.00000000'), '0.00000000');
});

test('target с нулевым или положительным балансом сохраняет весь transfer credit в lot', () => {
  assert.equal(fundedTransferLessons('2.73333333', '0.00000000'), '2.73333333');
  assert.equal(fundedTransferLessons('2.73333333', '1.00000000'), '2.73333333');
});

function fixture(overrides = {}) {
  const state = {
    source: { id: 9, child_id: 8, direction_id: 1, project_id: 1, status: 'finished', balance_lessons: '3.00000000', current_price: '9999.00' },
    target: { id: 10, child_id: 8, direction_id: 2, project_id: 1, status: 'active', balance_lessons: '1.00000000', current_price: '1125.00' },
    lots: [{ id: 60, remaining_lessons: '3.00000000', unit_price: '1025.00' }], transfers: [], entries: [], lotChanges: [], calls: [],
    ...overrides,
  };
  let nextEntry = 80;
  const units = (value) => { const [whole, fraction = ''] = String(value).split('.'); return BigInt(whole) * 100000000n + BigInt(`${whole.startsWith('-') ? '-' : ''}${fraction.padEnd(8, '0')}`); };
  const decimal = (value) => `${value < 0n ? '-' : ''}${(value < 0n ? -value : value) / 100000000n}.${String((value < 0n ? -value : value) % 100000000n).padStart(8, '0')}`;
  const query = async (sql, params = {}) => {
    state.calls.push({ sql, params });
    if (sql.includes('FROM balance_entries be JOIN balance_transfers bt')) {
      const entry = state.entries.find((item) => item.idempotencyKey === params.key);
      return [entry ? [state.transfers.find((item) => item.id === entry.transferId)] : []];
    }
    if (sql.startsWith('SELECT id,project_id FROM child_enrollments')) return [[state.source, state.target]];
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
    if (sql.startsWith('UPDATE child_enrollments SET balance_lessons=balance_lessons+')) { state.target.balance_lessons = decimal(units(state.target.balance_lessons) + units(params.lessons)); return [{ affectedRows: 1 }]; }
    if (sql.startsWith('INSERT INTO balance_lots')) { state.targetLot = params; return [{ insertId: 61 }]; }
    if (sql.startsWith('INSERT INTO balance_transfer_lot_changes')) { state.lotChanges.push(params); return [{ insertId: 100 + state.lotChanges.length }]; }
    if (sql.startsWith('SELECT * FROM balance_transfers WHERE')) return [[state.transfers[0]]];
    throw new Error(`Неожиданный SQL: ${sql}`);
  };
  const connection = { query, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {} };
  return { state, service: createBalanceTransfers({ query, getConnection: async () => connection }, { notificationEvents }) };
}

test('transfer одной транзакцией обнуляет source, пополняет target и создаёт новый lot', async () => {
  const { state, service } = fixture();
  const result = await service.create({ sourceEnrollmentId: 9, targetEnrollmentId: 10 }, { idempotencyKey: 'transfer-1', actorUserId: 5 });
  assert.equal(result.transferredAmount, '3075.00'); assert.equal(result.targetPriceSnapshot, '1125.00');
  assert.equal(state.source.balance_lessons, '0.00000000'); assert.equal(state.target.balance_lessons, '3.73333333');
  assert.equal(state.targetLot.lessons, '2.73333333'); assert.equal(state.targetLot.remainingLessons, '2.73333333'); assert.equal(state.targetLot.price, '1125.00');
  assert.deepEqual(state.entries.map((item) => item.type), ['out', 'in']);
  assert.equal(state.calls.some(({ sql }) => /UPDATE (?:payments|refunds|attendances)/.test(sql)), false);
  await service.create({ sourceEnrollmentId: 9, targetEnrollmentId: 10 }, { idempotencyKey: 'transfer-1', actorUserId: 5 });
  assert.equal(state.transfers.length, 1); assert.equal(state.entries.length, 2);
});

test('target debt -1 поглощает часть transfer credit в новом lot', async () => {
  const { state, service } = fixture({ target: { id: 10, child_id: 8, direction_id: 2, status: 'active', balance_lessons: '-1.00000000', current_price: '1125.00' } });
  await service.create({ sourceEnrollmentId: 9, targetEnrollmentId: 10 });
  assert.equal(state.target.balance_lessons, '1.73333333'); assert.equal(state.targetLot.lessons, '2.73333333');
  assert.equal(state.targetLot.remainingLessons, '1.73333333');
});

test('target debt больше transfer credit оставляет отрицательный balance и пустой lot', async () => {
  const { state, service } = fixture({
    source: { id: 9, child_id: 8, direction_id: 1, status: 'finished', balance_lessons: '2.00000000', current_price: '9999.00' },
    target: { id: 10, child_id: 8, direction_id: 2, status: 'active', balance_lessons: '-3.00000000', current_price: '1000.00' },
    lots: [{ id: 60, remaining_lessons: '2.00000000', unit_price: '1000.00' }],
  });
  await service.create({ sourceEnrollmentId: 9, targetEnrollmentId: 10 });
  assert.equal(state.target.balance_lessons, '-1.00000000'); assert.equal(state.targetLot.lessons, '2.00000000');
  assert.equal(state.targetLot.remainingLessons, '0.00000000');
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
  assert.match(routes, /router\.delete\('\/balance-transfers\/:id'[\s\S]*?balanceTransfers\.remove/);
  assert.doesNotMatch(routes, /notImplemented\('balance-transfers'\)/);
});

function reversalFixture({ sourceBalance = '0.00000000', sourceDebit = '-3.00000000', targetBalance = '2.73333333', sourceLots, targetRemaining = '2.73333333', targetCurrentRemaining = targetRemaining, targetUsed = false, automatic = false, notificationEvents = null } = {}) {
  const state = {
    transfer: { id: 70, source_enrollment_id: 9, target_enrollment_id: 10 },
    balances: { 9: sourceBalance, 10: targetBalance },
    lots: sourceLots ?? [{ id: 60, original_lessons: '3.00000000', remaining_lessons: '0.00000000', source_balance_entry_id: 40 }],
    targetLot: { id: 61, original_lessons: '2.73333333', remaining_lessons: targetCurrentRemaining, source_balance_entry_id: 81 },
    deletedConsumptions: false,
  };
  const units = (value) => lessonUnits(String(value));
  const decimal = (value) => lessonDecimal(value);
  const changes = [
    ...state.lots.map((lot) => ({ transfer_id: 70, balance_lot_id: lot.id, change_type: 'source_reduction', lessons_delta: lot.original_lessons,
      remaining_before: lot.original_lessons, remaining_after: '0.00000000', ...lot })),
    { transfer_id: 70, balance_lot_id: 61, change_type: 'target_created', lessons_delta: '2.73333333', remaining_before: '0.00000000', ...state.targetLot, remaining_after: targetRemaining },
  ];
  const query = async (sql, params = {}) => {
    if (sql.startsWith('SELECT bt.*') && sql.includes('FROM balance_transfers bt WHERE bt.id=:id FOR UPDATE')) return [state.transfer ? [{ ...state.transfer, automatic_change_direction: automatic ? 1 : 0 }] : []];
    if (sql.startsWith('SELECT id,enrollment_id,entry_type,lessons_delta FROM balance_entries')) return [[
      { id: 80, enrollment_id: 9, entry_type: 'transfer_out', lessons_delta: sourceDebit },
      { id: 81, enrollment_id: 10, entry_type: 'transfer_in', lessons_delta: '2.73333333' },
    ]];
    if (sql.startsWith('SELECT c.*,bl.original_lessons')) return [[...changes]];
    if (sql.startsWith('SELECT 1 FROM balance_lot_consumptions')) return [targetUsed ? [{ id: 1 }] : []];
    if (sql.startsWith('SELECT 1 FROM balance_entries')) return [[]];
    if (sql.startsWith('SELECT id,balance_lessons FROM child_enrollments')) return [[
      { id: 9, balance_lessons: state.balances[9] }, { id: 10, balance_lessons: state.balances[10] },
    ]];
    if (sql.startsWith('SELECT id FROM child_enrollments')) return [[{ id: 9 }, { id: 10 }]];
    if (sql.startsWith('UPDATE balance_lots SET remaining_lessons=remaining_lessons+')) {
      const lot = state.lots.find((item) => String(item.id) === String(params.id)); lot.remaining_lessons = decimal(units(lot.remaining_lessons) + units(params.lessons)); return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('UPDATE child_enrollments SET balance_lessons=balance_lessons-')) { state.balances[10] = decimal(units(state.balances[10]) - units(params.lessons)); return [{ affectedRows: 1 }]; }
    if (sql.startsWith('UPDATE child_enrollments SET balance_lessons=balance_lessons+')) { state.balances[9] = decimal(units(state.balances[9]) + units(params.lessons)); return [{ affectedRows: 1 }]; }
    if (sql.startsWith('DELETE FROM balance_lot_consumptions')) { state.deletedConsumptions = true; return [{ affectedRows: 1 }]; }
    if (sql.startsWith('DELETE FROM balance_transfer_lot_changes')) return [{ affectedRows: changes.length }];
    if (sql.startsWith('DELETE FROM balance_lots')) { state.targetLot = null; return [{ affectedRows: 1 }]; }
    if (sql.startsWith('DELETE FROM balance_entries')) return [{ affectedRows: 2 }];
    if (sql.startsWith('DELETE FROM balance_transfers')) { state.transfer = null; return [{ affectedRows: 1 }]; }
    throw new Error(`Неожиданный SQL: ${sql}`);
  };
  const connection = { query, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {} };
  return { state, service: createBalanceTransfers({ query, getConnection: async () => connection }) };
}

test('отмена transfer точно восстанавливает balances, source lots и удаляет target lot', async () => {
  const { state, service } = reversalFixture(); await service.remove(70);
  assert.equal(state.balances[9], '3.00000000'); assert.equal(state.balances[10], '0.00000000');
  assert.equal(state.lots[0].remaining_lessons, '3.00000000'); assert.equal(state.targetLot, null);
  assert.equal(state.deletedConsumptions, true); assert.equal(state.transfer, null);
});

test('автоматический change-direction transfer нельзя отменить отдельно', async () => {
  const { state, service } = reversalFixture({ automatic: true });
  await assert.rejects(service.remove(70), (error) => error.status === 409
    && error.code === 'AUTOMATIC_TRANSFER_NOT_REVERSIBLE'
    && error.message === 'Этот перенос создан автоматически при изменении направления или цены и отдельно не отменяется.');
  assert.equal(state.balances[9], '0.00000000');
  assert.equal(state.balances[10], '2.73333333');
  assert.notEqual(state.transfer, null);
  assert.notEqual(state.targetLot, null);
});

test('mixed historical lots и поглощённый source debt восстанавливаются фактическими lot changes', async () => {
  const sourceLots = [
    { id: 60, original_lessons: '1.00000000', remaining_lessons: '0.00000000', source_balance_entry_id: 40 },
    { id: 62, original_lessons: '2.00000000', remaining_lessons: '0.00000000', source_balance_entry_id: 41 },
  ];
  const { state, service } = reversalFixture({ sourceLots, sourceDebit: '-2.00000000' }); await service.remove(70);
  assert.deepEqual(state.lots.map((lot) => lot.remaining_lessons), ['1.00000000', '2.00000000']);
  assert.equal(state.balances[9], '2.00000000');
});

test('старый долг target полностью возвращается после отмены transfer', async () => {
  const { state, service } = reversalFixture({ targetBalance: '1.73333333', targetRemaining: '1.73333333' }); await service.remove(70);
  assert.equal(state.balances[10], '-1.00000000');
});

test('отмена transfer уведомляет о crossing target balance через -2 без изменения reversal-математики', async () => {
  const calls = [];
  const notificationEvents = { async debtThreshold(_connection, payload) { calls.push(payload); } };
  const { state, service } = reversalFixture({
    targetBalance: '-1.00000000', targetRemaining: '0.00000000', notificationEvents,
  });
  await service.remove(70, { actorUserId: 6 });
  assert.equal(state.balances[10], '-3.73333333');
  assert.deepEqual(calls, [{
    enrollmentId: 10, before: '-1.00000000', after: '-3.73333333',
    causeKey: 'balance-transfer-remove-70', actorUserId: 6,
  }]);
});

test('target lot, consumed посещением, блокирует отмену', async () => {
  const blocked = reversalFixture({ targetUsed: true });
  await assert.rejects(blocked.service.remove(70), (error) => error.code === 'TRANSFER_ALREADY_USED');
  assert.notEqual(blocked.state.transfer, null);
});

test('target lot, уменьшенный следующим transfer, блокирует отмену', async () => {
  const blocked = reversalFixture({ targetCurrentRemaining: '1.00000000' });
  const targetChange = blocked.state;
  await assert.rejects(blocked.service.remove(70), (error) => error.code === 'TRANSFER_ALREADY_USED');
  assert.notEqual(targetChange.transfer, null);
});

test('изменённый после transfer source lot блокирует отмену без частичного rollback', async () => {
  const blocked = reversalFixture({ sourceLots: [
    { id: 60, original_lessons: '3.00000000', remaining_lessons: '1.00000000', source_balance_entry_id: 40 },
  ] });
  await assert.rejects(blocked.service.remove(70), (error) => error.status === 409 && error.code === 'TRANSFER_ALREADY_USED'
    && error.message === 'Нельзя отменить перенос: после переноса изменилась финансовая история исходного направления.');
  assert.equal(blocked.state.balances[9], '0.00000000'); assert.equal(blocked.state.balances[10], '2.73333333');
  assert.equal(blocked.state.lots[0].remaining_lessons, '1.00000000'); assert.notEqual(blocked.state.targetLot, null);
  assert.equal(blocked.state.deletedConsumptions, false); assert.notEqual(blocked.state.transfer, null);
});

test('повторная отмена не меняет ledger', async () => {
  const completed = reversalFixture(); await completed.service.remove(70);
  await assert.rejects(completed.service.remove(70), (error) => error.code === 'NOT_FOUND');
  assert.equal(completed.state.balances[9], '3.00000000');
});


test('список переносов отличает automatic change-direction по существующей истории статуса', async () => {
  let queryText = '';
  const service = createBalanceTransfers({ query: async (sql) => {
    queryText = sql;
    return [[
      { id: 70, child_id: 8, source_enrollment_id: 9, target_enrollment_id: 10, transferred_amount: '3075.00',
        target_price_snapshot: '1125.00', target_lessons_credit: '2.73333333', transferred_at: '2026-09-23 12:00:00.000000',
        source_direction_name: 'Робототехника', target_direction_name: 'Программирование', automatic_change_direction: 1 },
      { id: 71, child_id: 8, source_enrollment_id: 11, target_enrollment_id: 10, transferred_amount: '1025.00',
        target_price_snapshot: '1125.00', target_lessons_credit: '0.91111111', transferred_at: '2026-09-23 13:00:00.000000',
        source_direction_name: 'Робототехника', target_direction_name: 'Программирование', automatic_change_direction: 0 },
    ]];
  } });
  const rows = await service.list();
  assert.equal(rows[0].automaticChangeDirection, true);
  assert.equal(rows[1].automaticChangeDirection, false);
  assert.match(queryText, /enrollment_status_history/);
  assert.match(queryText, /old_status IN \('active','paused'\) AND esh\.new_status='finished'/);
  assert.match(queryText, /changed_by_user_id <=> bt\.created_by_user_id/);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createBalanceTransfers } from '../backend/src/balance-transfers.mjs';
import { createMysqlCatalog } from '../backend/src/catalog.mjs';
import { createEnrollmentChanges } from '../backend/src/enrollment-changes.mjs';

const clone = (value) => structuredClone(value);

function fixture({ existingTarget = false, failTransfer = false, sourceStartedOn = '2026-01-01', membershipStartedOn = '2026-01-01' } = {}) {
  const state = {
    enrollments: [{ id: 9, child_id: 8, direction_id: 1, project_id: 1, status: 'active', individual_price: null,
      balance_lessons: '4.00000000', superseded_at: null, started_on: sourceStartedOn, ended_on: null }],
    memberships: [{ id: 31, enrollment_id: 9, group_id: 41, started_on: membershipStartedOn, ended_on: null }],
    lots: [{ id: 60, enrollment_id: 9, remaining_lessons: '4.00000000', original_lessons: '4.00000000', unit_price: '1025.00', source_balance_entry_id: 50 }],
    transfers: [], entries: [], lotChanges: [], nextEnrollmentId: 10, nextTransferId: 70, nextEntryId: 80, nextLotId: 61,
    commits: 0, rollbacks: 0, calls: [], historical: { paymentPrice: '1025.00', attendancePrice: '1025.00' },
  };
  if (existingTarget) state.enrollments.push({ id: 10, child_id: 8, direction_id: 2, project_id: 1, status: 'finished',
    individual_price: null, balance_lessons: '0.00000000', superseded_at: null, ended_on: '2026-09-01' });

  const units = (value) => {
    const match = String(value).match(/^(-?)(\d+)(?:\.(\d+))?$/); const absolute = BigInt(match[2]) * 100000000n + BigInt((match[3] ?? '').padEnd(8, '0').slice(0, 8));
    return match[1] ? -absolute : absolute;
  };
  const decimal = (value) => `${value < 0n ? '-' : ''}${(value < 0n ? -value : value) / 100000000n}.${String((value < 0n ? -value : value) % 100000000n).padStart(8, '0')}`;
  const enrollment = (rawId) => state.enrollments.find((item) => String(item.id) === String(rawId));
  const currentPrice = (item) => item.individual_price ?? (Number(item.direction_id) === 2 ? '1125.00' : '1025.00');

  const query = async (sql, params = {}) => {
    state.calls.push({ sql, params: clone(params) });
    if (sql === 'SELECT * FROM child_enrollments WHERE id=:id FOR UPDATE') return [[clone(enrollment(params.id))].filter(Boolean)];
    if (sql === 'SELECT id FROM directions WHERE id=:id AND active=TRUE') return [[{ id: params.id }]];
    if (sql.includes('FROM study_groups') && sql.includes('direction_id=:directionId')) return [[{ id: params.groupId }]];
    if (sql.startsWith('SELECT * FROM child_enrollments\n          WHERE child_id=')) return [[...state.enrollments.filter((item) => String(item.child_id) === String(params.childId)
      && String(item.direction_id) === String(params.directionId) && item.superseded_at == null && String(item.id) !== String(params.sourceId)).sort((a, b) => b.id - a.id).slice(0, 1).map(clone)]];
    if (sql.startsWith('SELECT id FROM balance_transfers\n')) return [[...state.transfers.filter((item) => String(item.source_enrollment_id) === String(params.sourceId)
      && String(item.target_enrollment_id) === String(params.targetId)).slice(0, 1).map(({ id }) => ({ id }))]];
    if (sql.includes('FROM child_enrollments e') && sql.includes('WHERE e.id IN (:sourceId,:targetId)')) {
      const selected = [params.sourceId, params.targetId].map((rawId) => {
        const item = clone(enrollment(rawId)); item.current_price = currentPrice(item); return item;
      }).sort((a, b) => a.id - b.id);
      return [selected];
    }
    if (sql.includes('FROM group_memberships') && sql.includes('FOR UPDATE')) return [[...state.memberships.filter((item) => String(item.enrollment_id) === String(params.id) && item.ended_on == null).slice(-1).map(clone)]];
    if (sql.startsWith("UPDATE child_enrollments SET status='finished'")) {
      const item = enrollment(params.id); item.status = 'finished'; item.ended_on = item.started_on > params.businessDate ? item.started_on : params.businessDate;
      if (params.sameDirection) item.superseded_at = `${params.businessDate} 12:00:00.000000`; return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('UPDATE group_memberships SET ended_on=GREATEST(')) {
      for (const item of state.memberships) if (String(item.enrollment_id) === String(params.id) && item.ended_on == null) {
        item.ended_on = item.started_on > params.businessDate ? item.started_on : params.businessDate;
      }
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('INSERT INTO enrollment_status_history')) return [{ insertId: 1 }];
    if (sql.startsWith('UPDATE child_enrollments SET status=:status,individual_price=')) {
      const item = enrollment(params.id); item.status = params.status; item.individual_price = params.price; item.ended_on = null; return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('UPDATE price_versions SET valid_to=')) return [{ affectedRows: 1 }];
    if (sql.startsWith('INSERT INTO price_versions')) return [{ insertId: 1 }];
    if (sql.startsWith('INSERT INTO child_enrollments')) {
      const item = { id: state.nextEnrollmentId++, child_id: params.childId, direction_id: Number(params.directionId), project_id: params.projectId,
        status: params.status, individual_price: params.price, balance_lessons: '0.00000000', superseded_at: null,
        started_on: params.businessDate, ended_on: null };
      state.enrollments.push(item); return [{ insertId: item.id }];
    }
    if (sql.startsWith('INSERT INTO group_memberships')) {
      state.memberships.push({ id: state.memberships.length + 40, enrollment_id: Number(params.id), group_id: Number(params.groupId),
        started_on: params.businessDate, ended_on: null }); return [{ insertId: 1 }];
    }
    if (sql.startsWith('SELECT id,project_id FROM child_enrollments')) return [[clone(enrollment(params.sourceId)), clone(enrollment(params.targetId))]];
    if (sql.includes('FROM balance_entries be JOIN balance_transfers bt')) {
      const entry = state.entries.find((item) => item.idempotency_key === params.key);
      return [entry ? [clone(state.transfers.find((item) => item.id === entry.transfer_id))] : []];
    }
    if (sql.startsWith('SELECT id,remaining_lessons,unit_price FROM balance_lots')) return [[...state.lots.filter((item) => String(item.enrollment_id) === String(params.sourceId) && units(item.remaining_lessons) > 0n).map(clone)]];
    if (sql.startsWith('INSERT INTO balance_transfers')) {
      if (failTransfer) throw new Error('transfer failed');
      const item = { id: state.nextTransferId++, child_id: params.childId, source_enrollment_id: Number(params.sourceId), target_enrollment_id: Number(params.targetId),
        transferred_amount: params.amount, target_price_snapshot: params.targetPrice, target_lessons_credit: params.targetCredit,
        transferred_at: '2026-09-23 12:00:00.000000' };
      state.transfers.push(item); return [{ insertId: item.id }];
    }
    if (sql.startsWith('INSERT INTO balance_entries')) {
      const item = { id: state.nextEntryId++, transfer_id: params.transferId, idempotency_key: params.idempotencyKey ?? null };
      state.entries.push(item); return [{ insertId: item.id }];
    }
    if (sql === 'UPDATE balance_lots SET remaining_lessons=remaining_lessons-:lessons WHERE id=:id') {
      const lot = state.lots.find((item) => String(item.id) === String(params.id)); lot.remaining_lessons = decimal(units(lot.remaining_lessons) - units(params.lessons)); return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('INSERT INTO balance_lot_consumptions')) return [{ insertId: 1 }];
    if (sql === 'UPDATE child_enrollments SET balance_lessons=0 WHERE id=:id') { enrollment(params.id).balance_lessons = '0.00000000'; return [{ affectedRows: 1 }]; }
    if (sql.startsWith('UPDATE child_enrollments SET balance_lessons=balance_lessons+')) {
      const item = enrollment(params.id); item.balance_lessons = decimal(units(item.balance_lessons) + units(params.lessons)); return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('INSERT INTO balance_lots')) {
      const item = { id: state.nextLotId++, enrollment_id: Number(params.targetId), source_balance_entry_id: params.entryId,
        original_lessons: params.lessons, remaining_lessons: params.remainingLessons, unit_price: params.price };
      state.lots.push(item); return [{ insertId: item.id }];
    }
    if (sql.startsWith('INSERT INTO balance_transfer_lot_changes')) { state.lotChanges.push(clone(params)); return [{ insertId: state.lotChanges.length }]; }
    if (sql.startsWith('SELECT * FROM balance_transfers WHERE id=:id')) return [[clone(state.transfers.find((item) => String(item.id) === String(params.id)))]];
    throw new Error(`Unexpected SQL: ${sql}`);
  };

  let snapshot;
  const connection = { query, async beginTransaction() { snapshot = clone(state); }, async commit() { state.commits += 1; snapshot = null; }, async rollback() {
    const rollbackCount = state.rollbacks + 1; for (const key of Object.keys(state)) delete state[key]; Object.assign(state, snapshot); state.rollbacks = rollbackCount;
  }, release() {} };
  const pool = { query, getConnection: async () => connection };
  const transfers = createBalanceTransfers(pool);
  return { state, service: createEnrollmentChanges(pool, transfers) };
}

const context = (key) => ({ roles: ['director'], userId: '7', idempotencyKey: key });

test('смена направления атомарно переносит 4 × 1025 ₽ в 3.64444444 занятия по 1125 ₽', async () => {
  const { state, service } = fixture();
  const result = await service.changeDirection(9, { directionId: 2, groupId: 42, status: 'active', individualPrice: null }, context('direction-1'));
  assert.equal(state.enrollments.find((item) => item.id === 9).status, 'finished');
  const target = state.enrollments.find((item) => String(item.id) === result.targetEnrollmentId);
  assert.equal(target.balance_lessons, '3.64444444'); assert.equal(state.transfers[0].transferred_amount, '4100.00');
  assert.equal(state.transfers[0].target_price_snapshot, '1125.00'); assert.equal(state.transfers.length, 1);
  assert.deepEqual(state.historical, { paymentPrice: '1025.00', attendancePrice: '1025.00' });
  assert.equal(state.calls.some(({ sql }) => /UPDATE (?:payments|attendances)/.test(sql)), false);
});

test('смена направления закрывает future enrollment и membership не раньше их started_on', async () => {
  const { state, service } = fixture({ sourceStartedOn: '2099-10-10', membershipStartedOn: '2099-11-11' });
  const result = await service.changeDirection(9,
    { directionId: 2, groupId: 42, status: 'active', individualPrice: null }, context('future-direction'));
  const source = state.enrollments.find((item) => item.id === 9);
  const membership = state.memberships.find((item) => item.id === 31);
  const target = state.enrollments.find((item) => String(item.id) === result.targetEnrollmentId);
  assert.equal(source.ended_on, '2099-10-10');
  assert.equal(membership.ended_on, '2099-11-11');
  assert.ok(source.ended_on >= source.started_on);
  assert.ok(membership.ended_on >= membership.started_on);
  assert.equal(target.balance_lessons, '3.64444444');
});

test('повтор смены направления не создаёт target и transfer второй раз', async () => {
  const { state, service } = fixture(); const body = { directionId: 2, status: 'active', individualPrice: null };
  const first = await service.changeDirection(9, body, context('same-command'));
  const second = await service.changeDirection(9, body, context('same-command'));
  assert.equal(second.targetEnrollmentId, first.targetEnrollmentId); assert.equal(second.repeated, true);
  assert.equal(state.enrollments.filter((item) => item.direction_id === 2).length, 1); assert.equal(state.transfers.length, 1);
});

test('существующий target enrollment используется без создания дубля', async () => {
  const { state, service } = fixture({ existingTarget: true }); state.nextEnrollmentId = 11;
  const result = await service.changeDirection(9, { directionId: 2, status: 'active', individualPrice: null }, context('existing-target'));
  assert.equal(result.targetEnrollmentId, '10'); assert.equal(state.enrollments.length, 2);
  assert.equal(state.enrollments.find((item) => item.id === 10).balance_lessons, '3.64444444');
});

test('ошибка transfer откатывает закрытие source и создание target', async () => {
  const { state, service } = fixture({ failTransfer: true });
  await assert.rejects(service.changeDirection(9, { directionId: 2, status: 'active', individualPrice: null }, context('rollback')), /transfer failed/);
  assert.equal(state.enrollments.length, 1); assert.equal(state.enrollments[0].status, 'active'); assert.equal(state.enrollments[0].balance_lessons, '4.00000000');
  assert.equal(state.memberships[0].ended_on, null); assert.equal(state.transfers.length, 0); assert.equal(state.commits, 0); assert.equal(state.rollbacks, 1);
});

test('индивидуальная цена 2900 / 4 сохраняет 4100 ₽ и возврат к обычной цене снова пересчитывает остаток', async () => {
  const { state, service } = fixture();
  const individual = await service.changeDirection(9, { directionId: 1, status: 'active', individualPrice: '725.00' }, context('price-725'));
  const repriced = state.enrollments.find((item) => String(item.id) === individual.targetEnrollmentId);
  assert.equal(repriced.individual_price, '725.00'); assert.equal(repriced.balance_lessons, '5.65517241');
  const ordinary = await service.changeDirection(repriced.id, { directionId: 1, status: 'active', individualPrice: null }, context('price-standard'));
  assert.equal(state.enrollments.find((item) => String(item.id) === ordinary.targetEnrollmentId).balance_lessons, '4.00000000');
  assert.deepEqual(state.historical, { paymentPrice: '1025.00', attendancePrice: '1025.00' }); assert.equal(state.transfers.length, 2);
});

test('изменение индивидуальной цены закрывает future enrollment и membership корректной датой', async () => {
  const { state, service } = fixture({ sourceStartedOn: '2099-10-10', membershipStartedOn: '2099-11-11' });
  const result = await service.changeDirection(9,
    { directionId: 1, groupId: 41, status: 'active', individualPrice: '725.00' }, context('future-price'));
  const source = state.enrollments.find((item) => item.id === 9);
  const membership = state.memberships.find((item) => item.id === 31);
  assert.equal(source.ended_on, '2099-10-10');
  assert.equal(membership.ended_on, '2099-11-11');
  assert.ok(source.ended_on >= source.started_on);
  assert.ok(membership.ended_on >= membership.started_on);
  assert.equal(state.enrollments.find((item) => String(item.id) === result.targetEnrollmentId).balance_lessons, '5.65517241');
});

test('frontend отправляет смену направления и цены одним атомарным запросом', async () => {
  const source = await readFile(new URL('../src/frontend/api-sync.mjs', import.meta.url), 'utf8');
  const save = source.slice(source.indexOf('async function saveEnrollment'), source.indexOf('async function addEnrollment'));
  assert.match(save, /individual \? packagePrice \/ 4 : null/);
  assert.match(save, /\/enrollments\/\$\{enrollment\.id\}\/change-direction/);
  assert.doesNotMatch(save, /api\.createEnrollment/); assert.doesNotMatch(save, /existingTarget/);
  assert.ok(save.indexOf('legacy.state.modal = null') > save.indexOf('await api.request'));
});

test('router требует idempotency key для атомарной смены направления', async () => {
  const source = await readFile(new URL('../backend/src/routes.mjs', import.meta.url), 'utf8');
  assert.match(source, /router\.post\('\/enrollments\/:id\/change-direction'[\s\S]*?requireIdempotencyKey/);
});

test('обычный PATCH не может сохранить новую цену без атомарного переноса ненулевого остатка', async () => {
  let mutated = false; let rollbacks = 0;
  const query = async (sql) => {
    if (sql === 'SELECT * FROM child_enrollments WHERE id=:id FOR UPDATE') return [[{ id: 9, child_id: 8, direction_id: 1,
      project_id: 1, status: 'active', individual_price: null, balance_lessons: '4.00000000', superseded_at: null }]];
    if (sql.startsWith('UPDATE child_enrollments')) { mutated = true; return [{ affectedRows: 1 }]; }
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  const connection = { query, async beginTransaction() {}, async commit() {}, async rollback() { rollbacks += 1; }, release() {} };
  const catalog = createMysqlCatalog({ query, getConnection: async () => connection });
  await assert.rejects(catalog.updateEnrollment(9, { individualPrice: 725 }, { roles: ['director'] }),
    (error) => error.code === 'PRICE_CHANGE_REQUIRES_ATOMIC_UPDATE');
  assert.equal(mutated, false); assert.equal(rollbacks, 1);
});

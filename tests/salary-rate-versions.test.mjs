import test from 'node:test';
import assert from 'node:assert/strict';
import { createSalaryRateVersions } from '../backend/src/salary-rate-versions.mjs';

function fakePool(handler) {
  return {
    query: async (sql, params) => [await handler(sql, params)],
    getConnection: async () => ({
      query: async (sql, params) => [await handler(sql, params)],
      beginTransaction: async () => {},
      commit: async () => {},
      rollback: async () => {},
      release: () => {},
    }),
  };
}

const currentRow = {
  id: 7,
  regular_fixed: '600.00',
  per_present_child: '100.00',
  intro_fixed: '600.00',
  empty_trip_fixed: '300.00',
  valid_from: '2026-01-01 00:00:00.000000',
  created_by_user_id: null,
};

function handler({ operations = [], current = currentRow } = {}) {
  return async (sql, params = {}) => {
    operations.push({ sql, params });
    if (sql.startsWith('SELECT id,regular_fixed') && sql.includes('FROM salary_rate_versions')) return [current];
    if (sql.startsWith('SELECT NOW(6) effective_at')) return [{ effective_at: '2026-09-14 10:00:00.000000' }];
    if (sql.startsWith('UPDATE salary_rate_versions SET valid_to')) return { affectedRows: 1 };
    if (sql.startsWith('INSERT INTO salary_rate_versions')) return { insertId: 8 };
    throw new Error(`Unexpected SQL: ${sql}`);
  };
}

test('актуальные глобальные ставки зарплаты читаются из API-сервиса', async () => {
  const service = createSalaryRateVersions(fakePool(handler()));
  assert.deepEqual(await service.list(), [
    { key: 'regular_fixed', value: '600.00', versionId: '7', validFrom: currentRow.valid_from },
    { key: 'per_present_child', value: '100.00', versionId: '7', validFrom: currentRow.valid_from },
    { key: 'intro_fixed', value: '600.00', versionId: '7', validFrom: currentRow.valid_from },
    { key: 'empty_trip_fixed', value: '300.00', versionId: '7', validFrom: currentRow.valid_from },
  ]);
});

test('изменение ставки закрывает старую версию и создаёт новую без удаления истории', async () => {
  const operations = [];
  const service = createSalaryRateVersions(fakePool(handler({ operations })));
  const saved = await service.create({ key: 'regular_fixed', value: '700' });
  assert.equal(saved.value, '700.00');
  assert.equal(operations.some(({ sql }) => sql.startsWith('UPDATE salary_rate_versions SET valid_to')), true);
  assert.equal(operations.some(({ sql }) => sql.startsWith('INSERT INTO salary_rate_versions')), true);
  assert.equal(operations.some(({ sql }) => /^DELETE\s+FROM\s+salary_rate_versions/i.test(sql)), false);
  const insert = operations.find(({ sql }) => sql.startsWith('INSERT INTO salary_rate_versions'));
  assert.deepEqual(insert.params, {
    regularFixed: '700.00', perPresentChild: '100.00', introFixed: '600.00', emptyTripFixed: '300.00',
    effectiveAt: '2026-09-14 10:00:00.000000', actorId: null,
  });
});

test('сохранение того же значения не создаёт дубликат версии', async () => {
  const operations = [];
  const service = createSalaryRateVersions(fakePool(handler({ operations })));
  const saved = await service.create({ key: 'per_present_child', value: '100.00' });
  assert.equal(saved.value, '100.00');
  assert.equal(operations.some(({ sql }) => sql.startsWith('UPDATE salary_rate_versions SET valid_to')), false);
  assert.equal(operations.some(({ sql }) => sql.startsWith('INSERT INTO salary_rate_versions')), false);
});

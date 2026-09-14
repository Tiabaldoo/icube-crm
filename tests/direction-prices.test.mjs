import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDirectionPriceVersions, packagePriceToLessonPrice } from '../backend/src/price-versions.mjs';
import { createMysqlPayments } from '../backend/src/payments.mjs';

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

function priceVersionHandler({ onSql = () => {}, prices = { '1': '1025.00', '2': '1125.00' } } = {}) {
  return async (sql, params = {}) => {
    onSql(sql, params);
    if (sql.startsWith('SELECT id,code,name FROM directions')) {
      const programming = String(params.directionId) === '2';
      return [{ id: params.directionId, code: programming ? 'programming' : 'robotics', name: programming ? 'Программирование' : 'Робототехника' }];
    }
    if (sql.startsWith('SELECT id,price,valid_from FROM price_versions')) {
      return [{ id: Number(params.directionId) + 10, price: prices[String(params.directionId)], valid_from: '2026-01-01 00:00:00.000000' }];
    }
    if (sql.startsWith('SELECT NOW(6) effective_at')) return [{ effective_at: '2026-09-14 08:00:00.000000' }];
    if (sql.startsWith('UPDATE price_versions SET valid_to')) return { affectedRows: 1 };
    if (sql.startsWith('INSERT INTO price_versions')) return { insertId: Number(params.directionId) + 20 };
    throw new Error(`Unexpected SQL: ${sql}`);
  };
}

test('4100 ₽ / 4 сохраняется как 1025 ₽ за занятие', () => {
  assert.equal(packagePriceToLessonPrice('4100'), '1025.00');
});

test('изменение 4100 → 5000 закрывает старую версию и создаёт новую без удаления истории', async () => {
  const operations = [];
  const service = createDirectionPriceVersions(fakePool(priceVersionHandler({ onSql(sql, params) { operations.push({ sql, params }); } })));
  await service.create({ directionId: 1, packagePrice: '5000' });
  assert.equal(operations.some(({ sql }) => sql.startsWith('UPDATE price_versions SET valid_to')), true);
  assert.equal(operations.some(({ sql }) => sql.startsWith('INSERT INTO price_versions')), true);
  assert.equal(operations.some(({ sql }) => sql.startsWith('DELETE FROM price_versions')), false);
});

test('актуальная цена после изменения 4100 → 5000 равна 1250 ₽ за занятие', async () => {
  const service = createDirectionPriceVersions(fakePool(priceVersionHandler()));
  const saved = await service.create({ directionId: 1, packagePrice: '5000' });
  assert.equal(saved.price, '1250.00');
  assert.equal(saved.packagePrice, '5000.00');
});

test('изменение базовой цены не меняет price_snapshot старой оплаты', async () => {
  const sqlLog = [];
  const oldPayment = { price_snapshot: '1025.00' };
  const service = createDirectionPriceVersions(fakePool(priceVersionHandler({ onSql(sql) { sqlLog.push(sql); } })));
  await service.create({ directionId: 1, packagePrice: '5000' });
  assert.equal(oldPayment.price_snapshot, '1025.00');
  assert.equal(sqlLog.some((sql) => /UPDATE\s+payments/i.test(sql)), false);
});

test('оплата задним числом до изменения цены использует старую версию', async () => {
  let insertedPrice = null;
  let paymentId = 90;
  const pool = fakePool(async (sql, params = {}) => {
    if (sql.includes('FROM child_enrollments e') && sql.includes('current_price')) {
      assert.equal(params.priceDate, '2026-09-10');
      assert.match(sql, /pv\.valid_from<DATE_ADD\(:priceDate,INTERVAL 1 DAY\)/);
      assert.match(sql, /pv\.valid_to IS NULL OR pv\.valid_to>=DATE_ADD\(:priceDate,INTERVAL 1 DAY\)/);
      return [{ id: 10, child_id: 5, direction_id: 1, individual_price: null, group_id: null, project_id: null, current_price: '1025.00' }];
    }
    if (sql.startsWith('INSERT INTO payments')) { insertedPrice = params.price; return { insertId: paymentId }; }
    if (sql.startsWith('INSERT INTO balance_entries')) return { insertId: 190 };
    if (sql.startsWith('INSERT INTO balance_lots')) return { insertId: 290 };
    if (sql.startsWith('UPDATE child_enrollments SET balance_lessons')) return { affectedRows: 1 };
    if (sql.includes('FROM payments p JOIN children c')) return [{
      id: paymentId, enrollment_id: 10, child_id: 5, child_name: 'Тест', direction_id: 1, direction_name: 'Робототехника',
      group_id_snapshot: null, project_id_snapshot: null, paid_on: '2026-09-10', amount: '4100.00',
      price_snapshot: insertedPrice, lessons_credit: '4.00000000', method: 'cashless', note: null,
    }];
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  const payments = createMysqlPayments(pool);
  const saved = await payments.create({ enrollmentId: 10, paidOn: '2026-09-10', amount: '4100', method: 'cashless' });
  assert.equal(insertedPrice, '1025.00');
  assert.equal(saved.priceSnapshot, '1025.00');
});

test('робототехника и программирование меняются независимо', async () => {
  const inserts = [];
  const service = createDirectionPriceVersions(fakePool(priceVersionHandler({ onSql(sql, params) {
    if (sql.startsWith('INSERT INTO price_versions')) inserts.push({ ...params });
  } })));
  await service.create({ directionId: 1, packagePrice: '5000' });
  await service.create({ directionId: 2, packagePrice: '4800' });
  assert.deepEqual(inserts.map((item) => ({ directionId: String(item.directionId), price: item.price })), [
    { directionId: '1', price: '1250.00' },
    { directionId: '2', price: '1200.00' },
  ]);
});

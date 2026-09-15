import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculatePartnerSettlement, createPartnerSettlements } from '../backend/src/partner-settlements.mjs';
import { createMysqlCatalog } from '../backend/src/catalog.mjs';

test('формула 10000 - 1000, налог 4%, salary 2000, доли 40/60 и cash 3000 даёт transfer 984', () => {
  assert.deepEqual(calculatePartnerSettlement({ paymentsAmount: '10000.00', refundsAmount: '1000.00', cashHeldByPartner: '3000.00', salaryAmount: '2000.00', taxPercent: '4.000', icubePercent: '40.000', partnerPercent: '60.000' }), {
    paymentsAmount: '10000.00', refundsAmount: '1000.00', incomeAmount: '9000.00', cashHeldByPartner: '3000.00',
    taxAmount: '360.00', salaryAmount: '2000.00', distributableAmount: '6640.00', icubeShareAmount: '2656.00',
    partnerShareAmount: '3984.00', transferAmount: '984.00',
  });
});

test('отрицательный income имеет нулевой налог, отрицательный transfer сохраняет знак', () => {
  const result = calculatePartnerSettlement({ paymentsAmount: '500.00', refundsAmount: '1000.00', cashHeldByPartner: '100.00', salaryAmount: '0.00', taxPercent: '4.000', icubePercent: '40.000', partnerPercent: '60.000' });
  assert.equal(result.incomeAmount, '-500.00'); assert.equal(result.taxAmount, '0.00');
  assert.equal(result.partnerShareAmount, '-300.00'); assert.equal(result.icubeShareAmount, '-200.00'); assert.equal(result.transferAmount, '-400.00');
});

test('live calculation агрегирует только historical project snapshots и актуальную salary', async () => {
  const calls = [];
  const pool = { query: async (sql, params = {}) => {
    calls.push({ sql, params });
    if (sql.includes('FROM projects p LEFT JOIN partners')) return [[{ id: 2, name: 'Зебра', partner_id: 9, partner_name: 'Партнёр' }]];
    if (sql.includes('FROM partner_agreement_versions')) return [[{ id: 5, tax_percent: '4.000', icube_percent: '40.000', partner_percent: '60.000' }]];
    if (sql.includes('FROM payments WHERE')) return [[{ payments_amount: '10000.00', cash_held_by_partner: '3000.00' }]];
    if (sql.includes('FROM refunds')) return [[{ refunds_amount: '1000.00' }]];
    if (sql.includes('FROM salary_accruals')) return [[{ salary_amount: '2000.00' }]];
    throw new Error(`Неожиданный SQL: ${sql}`);
  } };
  const result = await createPartnerSettlements(pool).preview({ projectId: 2, from: '2026-08-26', to: '2026-09-25' });
  assert.equal(result.transferAmount, '984.00'); assert.equal(result.agreementVersionId, '5');
  const paymentSql = calls.find(({ sql }) => sql.includes('FROM payments WHERE')).sql;
  assert.match(paymentSql, /project_id_snapshot=:projectId/); assert.match(paymentSql, /paid_on BETWEEN :from AND :to/);
  assert.match(paymentSql, /method='cash'/); assert.match(paymentSql, /deleted_at IS NULL/);
  const refundSql = calls.find(({ sql }) => sql.includes('FROM refunds')).sql;
  assert.match(refundSql, /project_id_snapshot=:projectId/); assert.match(refundSql, /refunded_on BETWEEN :from AND :to/);
  const salarySql = calls.find(({ sql }) => sql.includes('FROM salary_accruals')).sql;
  assert.match(salarySql, /sa\.reversed_at IS NULL/); assert.match(salarySql, /l\.project_id_snapshot=:projectId/);
  assert.match(salarySql, /DATE\(l\.starts_at\) BETWEEN :from AND :to/); assert.match(salarySql, /l\.deleted_at IS NULL/);
  assert.equal(calls.some(({ sql }) => /study_groups/.test(sql)), false);
});

test('пустой период возвращает корректные нули', async () => {
  const pool = { query: async (sql) => {
    if (sql.includes('FROM projects p LEFT JOIN partners')) return [[{ id: 2, name: 'Проект', partner_id: 9, partner_name: 'Партнёр' }]];
    if (sql.includes('FROM partner_agreement_versions')) return [[{ id: 5, tax_percent: '4.000', icube_percent: '40.000', partner_percent: '60.000' }]];
    if (sql.includes('FROM payments WHERE')) return [[{ payments_amount: '0.00', cash_held_by_partner: '0.00' }]];
    if (sql.includes('FROM refunds')) return [[{ refunds_amount: '0.00' }]];
    if (sql.includes('FROM salary_accruals')) return [[{ salary_amount: '0.00' }]];
    throw new Error(`Неожиданный SQL: ${sql}`);
  } };
  const result = await createPartnerSettlements(pool).preview({ projectId: 2, from: '2026-08-26', to: '2026-09-25' });
  assert.equal(result.incomeAmount, '0.00'); assert.equal(result.transferAmount, '0.00');
});

test('первое назначение группы заполняет только пустые snapshots payment и refund', async () => {
  const snapshotSql = [];
  const query = async (sql, params = {}) => {
    if (sql.startsWith('SELECT * FROM child_enrollments')) return [[{ id: 9, child_id: 8, direction_id: 1, status: 'active', individual_price: null }]];
    if (sql.startsWith('SELECT id,group_id FROM group_memberships')) return [[]];
    if (sql.startsWith('SELECT id FROM directions')) return [[{ id: 1 }]];
    if (sql.startsWith('SELECT id FROM study_groups')) return [[{ id: 5 }]];
    if (sql.startsWith('UPDATE payments p') || sql.startsWith('UPDATE refunds r')) { snapshotSql.push({ sql, params }); return [{ affectedRows: 1 }]; }
    if (sql.startsWith('UPDATE') || sql.startsWith('INSERT INTO group_memberships')) return [{ affectedRows: 1 }];
    if (sql.includes('FROM children c LEFT JOIN child_guardians')) return [[{ id: 8, full_name: 'Ребёнок', status: 'active', needs_director_review: 0 }]];
    if (sql.includes('FROM child_enrollments e JOIN directions')) return [[{ id: 9, child_id: 8, direction_id: 1, direction_name: 'Робототехника', status: 'active', individual_price: null, balance_lessons: '1.00000000', group_id: 5 }]];
    throw new Error(`Неожиданный SQL: ${sql}`);
  };
  const connection = { query, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {} };
  await createMysqlCatalog({ query, getConnection: async () => connection }).updateEnrollment(9, { groupId: 5 });
  assert.equal(snapshotSql.length, 2);
  for (const item of snapshotSql) {
    assert.match(item.sql, /COALESCE\([^,]+,g\.project_id\)/); assert.match(item.sql, /project_id_snapshot IS NULL/);
    assert.equal(item.params.enrollmentId, '9'); assert.equal(item.params.groupId, '5');
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { createApiRouter } from '../backend/src/routes.mjs';

function settlementPool() {
  const calls = [];
  const query = async (sql, params = {}) => {
    calls.push({ sql, params });
    if (sql.includes('FROM projects p LEFT JOIN partners')) {
      const own = String(params.projectId) === '2';
      return [[{ id: Number(params.projectId), name: own ? 'Зебра' : 'iCubeRobots', partner_id: 9, partner_name: 'Партнёр' }]];
    }
    if (sql.includes('FROM partner_agreement_versions')) return [[{ id: 5, tax_percent: '4.000', icube_percent: '40.000', partner_percent: '60.000' }]];
    if (sql.includes('FROM payments WHERE')) return [[{ payments_amount: '10000.00', cash_held_by_partner: '3000.00' }]];
    if (sql.includes('FROM refunds')) return [[{ refunds_amount: '1000.00' }]];
    if (sql.includes('FROM salary_accruals')) return [[{ salary_amount: '2000.00' }]];
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  return { pool: { query }, calls };
}

async function withServer(run) {
  const { pool, calls } = settlementPool();
  const testAuth = (request, _response, next) => {
    const role = request.get('x-test-role') || 'director';
    request.auth = {
      userId: role === 'partner' ? '17' : '1',
      roles: [role],
      projectIds: role === 'partner' ? ['2'] : [],
    };
    next();
  };
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createApiRouter(pool, { testAuth }));
  app.use((error, _request, response, _next) => response.status(error.status ?? 500).json({ error: { code: error.code ?? 'INTERNAL_ERROR', message: error.message } }));
  const server = await new Promise((resolve, reject) => {
    const instance = app.listen(0, '127.0.0.1', (error) => error ? reject(error) : resolve(instance));
  });
  try {
    await run(`http://127.0.0.1:${server.address().port}/api/v1`, calls);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('partner settlement read is scoped to auth project and matches director calculation', async () => {
  await withServer(async (baseUrl, calls) => {
    const period = 'from=2026-08-26&to=2026-09-25';
    const partnerResponse = await fetch(`${baseUrl}/partner-settlements?${period}&projectId=1`, { headers: { 'x-test-role': 'partner' } });
    assert.equal(partnerResponse.status, 200);
    const partner = (await partnerResponse.json()).data;
    assert.equal(partner.projectId, '2');
    assert.equal(partner.projectName, 'Зебра');

    const directorResponse = await fetch(`${baseUrl}/partner-settlements?${period}&projectId=2`, { headers: { 'x-test-role': 'director' } });
    assert.equal(directorResponse.status, 200);
    const director = (await directorResponse.json()).data;

    assert.deepEqual(partner, director);
    assert.equal(partner.transferAmount, '984.00');
    const projectReads = calls.filter(({ sql }) => sql.includes('FROM projects p LEFT JOIN partners'));
    assert.deepEqual(projectReads.map(({ params }) => String(params.projectId)), ['2', '2']);
  });
});

test('partner settlement endpoint accepts own scoped read without a frontend projectId', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/partner-settlements?from=2026-08-26&to=2026-09-25`, { headers: { 'x-test-role': 'partner' } });
    assert.equal(response.status, 200);
    const result = (await response.json()).data;
    assert.equal(result.projectId, '2');
  });
});

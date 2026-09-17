import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import express from 'express';
import { createApiRouter } from '../backend/src/routes.mjs';

const calls = [];
const partnerSettlements = {
  async preview(filters) {
    const normalized = { projectId: String(filters.projectId), from: String(filters.from), to: String(filters.to) };
    calls.push(normalized);
    return {
      projectId: normalized.projectId,
      periodFrom: normalized.from,
      periodTo: normalized.to,
      projectName: 'Зебра',
      paymentsAmount: '10000.00',
      refundsAmount: '1000.00',
      incomeAmount: '9000.00',
      taxPercent: '4.000',
      taxAmount: '360.00',
      salaryAmount: '2000.00',
      distributableAmount: '6640.00',
      icubePercent: '40.000',
      icubeShareAmount: '2656.00',
      partnerPercent: '60.000',
      partnerShareAmount: '3984.00',
      cashHeldByPartner: '3000.00',
      transferAmount: '984.00',
    };
  },
};

let server; let baseUrl;
before(async () => {
  const pool = { query: async (sql) => { throw new Error(`Unexpected SQL in settlement scope test: ${sql}`); } };
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createApiRouter(pool, {
    partnerSettlements,
    testAuth(request, _response, next) {
      const role = request.get('x-test-role') || 'partner';
      request.auth = role === 'director'
        ? { userId: '1', displayName: 'Директор', roles: ['director'], projectIds: [] }
        : { userId: '17', displayName: 'Партнёр', roles: ['partner'], projectIds: ['2'] };
      next();
    },
  }));
  app.use((error, _request, response, _next) => response.status(error.status ?? 500).json({ error: { code: error.code ?? 'INTERNAL_ERROR', message: error.message } }));
  await new Promise((resolve, reject) => { server = app.listen(0, '127.0.0.1', (error) => error ? reject(error) : resolve()); });
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
});
after(() => new Promise((resolve) => server.close(resolve)));

async function settlement(query, role = 'partner') {
  const response = await fetch(`${baseUrl}/partner-settlements?${query}`, { headers: { 'x-test-role': role } });
  return { response, payload: await response.json() };
}

test('partner can read settlement for own project and backend injects auth project', async () => {
  calls.length = 0;
  const result = await settlement('from=2026-08-26&to=2026-09-25');
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.projectId, '2');
  assert.deepEqual(calls.at(-1), { projectId: '2', from: '2026-08-26', to: '2026-09-25' });
});

test('partner cannot select another project with a direct query parameter', async () => {
  calls.length = 0;
  const result = await settlement('projectId=1&from=2026-08-26&to=2026-09-25');
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.projectId, '2');
  assert.equal(calls.at(-1).projectId, '2');
});

test('director still selects project explicitly', async () => {
  calls.length = 0;
  const result = await settlement('projectId=2&from=2026-08-26&to=2026-09-25', 'director');
  assert.equal(result.response.status, 200);
  assert.deepEqual(calls.at(-1), { projectId: '2', from: '2026-08-26', to: '2026-09-25' });
});

test('partner and director receive the same read-model for the same project and period', async () => {
  const partner = await settlement('from=2026-08-26&to=2026-09-25');
  const director = await settlement('projectId=2&from=2026-08-26&to=2026-09-25', 'director');
  assert.equal(partner.response.status, 200);
  assert.equal(director.response.status, 200);
  assert.deepEqual(partner.payload.data, director.payload.data);
});

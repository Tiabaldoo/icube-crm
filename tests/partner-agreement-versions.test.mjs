import test from 'node:test';
import assert from 'node:assert/strict';
import { createPartnerAgreementVersions } from '../backend/src/partner-agreement-versions.mjs';

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

const project = { id: 2, code: 'zebra', partner_id: 9 };
const current = {
  id: 5,
  project_id: 2,
  project_code: 'zebra',
  partner_id: 9,
  tax_percent: '4.000',
  icube_percent: '40.000',
  partner_percent: '60.000',
  valid_from: '2026-01-01 00:00:00.000000',
};

function makeHandler({ operations = [], agreement = current, projectRow = project } = {}) {
  return async (sql, params = {}) => {
    operations.push({ sql, params });
    if (sql.includes('FROM projects')) return projectRow ? [projectRow] : [];
    if (sql.includes('FROM partner_agreement_versions pav')) return agreement ? [agreement] : [];
    if (sql.startsWith('SELECT NOW(6) effective_at')) return [{ effective_at: '2026-09-14 12:00:00.000000' }];
    if (sql.startsWith('UPDATE partner_agreement_versions SET valid_to')) return { affectedRows: 1 };
    if (sql.startsWith('INSERT INTO partner_agreement_versions')) return { insertId: 6 };
    throw new Error(`Unexpected SQL: ${sql}`);
  };
}

test('актуальные условия zebra читаются и стартовые 4 / 40 / 60 возвращаются точно', async () => {
  const service = createPartnerAgreementVersions(fakePool(makeHandler()));
  assert.deepEqual(await service.list(), {
    projectId: '2', projectCode: 'zebra', partnerId: '9',
    taxPercent: '4.000', icubePercent: '40.000', partnerPercent: '60.000',
    versionId: '5', validFrom: current.valid_from,
  });
});

test('изменение условий закрывает старую версию и создаёт новую без удаления истории', async () => {
  const operations = [];
  const service = createPartnerAgreementVersions(fakePool(makeHandler({ operations })));
  const saved = await service.create({ projectCode: 'zebra', taxPercent: '5', icubePercent: '40', partnerPercent: '60' });
  assert.equal(saved.taxPercent, '5.000');
  assert.equal(saved.icubePercent, '40.000');
  assert.equal(saved.partnerPercent, '60.000');
  assert.equal(operations.some(({ sql }) => sql.startsWith('UPDATE partner_agreement_versions SET valid_to')), true);
  assert.equal(operations.some(({ sql }) => sql.startsWith('INSERT INTO partner_agreement_versions')), true);
  assert.equal(operations.some(({ sql }) => /^DELETE\s+FROM\s+partner_agreement_versions/i.test(sql)), false);
  const update = operations.find(({ sql }) => sql.startsWith('UPDATE partner_agreement_versions SET valid_to'));
  const insert = operations.find(({ sql }) => sql.startsWith('INSERT INTO partner_agreement_versions'));
  assert.equal(update.params.effectiveAt, insert.params.effectiveAt);
  assert.equal(insert.params.projectId, 2);
  assert.equal(insert.params.partnerId, 9);
});

test('сохранение тех же условий не создаёт новую версию', async () => {
  const operations = [];
  const service = createPartnerAgreementVersions(fakePool(makeHandler({ operations })));
  await service.create({ projectCode: 'zebra', taxPercent: '4.000', icubePercent: '40', partnerPercent: '60' });
  assert.equal(operations.some(({ sql }) => sql.startsWith('UPDATE partner_agreement_versions SET valid_to')), false);
  assert.equal(operations.some(({ sql }) => sql.startsWith('INSERT INTO partner_agreement_versions')), false);
});

test('доли 40 + 60 проходят, а 40 + 50 отклоняются сервером', async () => {
  const service = createPartnerAgreementVersions(fakePool(makeHandler()));
  await assert.doesNotReject(() => service.create({ projectCode: 'zebra', taxPercent: '4', icubePercent: '40', partnerPercent: '60' }));
  await assert.rejects(
    () => service.create({ projectCode: 'zebra', taxPercent: '4', icubePercent: '40', partnerPercent: '50' }),
    /Доли iCube и партнёра в сумме должны составлять 100%/,
  );
});

test('zebra без partner_id возвращает понятную ошибку конфигурации', async () => {
  const service = createPartnerAgreementVersions(fakePool(makeHandler({ projectRow: { id: 2, code: 'zebra', partner_id: null } })));
  await assert.rejects(() => service.list(), /У проекта «Зебра» не назначен партнёр/);
});

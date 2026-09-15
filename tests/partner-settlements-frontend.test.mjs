import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';

test('partner UI использует серверный расчёт, отрицательный transfer и динамический период 26—25', async () => {
  const originalWindow = globalThis.window; const originalDocument = globalThis.document; const originalFetch = globalThis.fetch;
  const controls = { '#partner-project': { value: '2' }, '#partner-from': { value: '2026-08-26' }, '#partner-to': { value: '2026-09-25' } };
  let settlementUrl;
  const resources = {
    projects: [{ id: '1', code: 'icube', name: 'iCubeRobots', partnerId: null, active: true }, { id: '2', code: 'zebra', name: 'Зебра', partnerId: '9', active: true }],
    directions: [], sites: [], teachers: [], groups: [], children: [], payments: [], refunds: [], lessons: [], 'lesson-deletions': [], notifications: [],
  };
  globalThis.window = { icubeLegacy: { state: {}, render() {}, pageHead(title, description) { return `<header>${title}${description}</header>`; } }, alert() {} };
  globalThis.document = { querySelector(selector) { return controls[selector] ?? null; } };
  globalThis.fetch = async (url) => {
    const path = String(url).replace('/api/v1/', '');
    if (path.startsWith('partner-settlements?')) {
      settlementUrl = path; return { ok: true, status: 200, async json() { return { data: {
        projectId: '2', projectName: 'Зебра', partnerId: '9', partnerName: 'Партнёр', periodFrom: '2026-08-26', periodTo: '2026-09-25',
        agreementVersionId: '5', taxPercent: '4.000', icubePercent: '40.000', partnerPercent: '60.000', paymentsAmount: '500.00',
        refundsAmount: '1000.00', incomeAmount: '-500.00', cashHeldByPartner: '100.00', taxAmount: '0.00', salaryAmount: '0.00',
        distributableAmount: '-500.00', icubeShareAmount: '-200.00', partnerShareAmount: '-300.00', transferAmount: '-400.00',
      } }; } };
    }
    const resource = path.split('?')[0]; return { ok: true, status: 200, async json() { return { data: resources[resource] ?? [] }; } };
  };
  try {
    const module = await import(`../src/frontend/api-sync.mjs?partner=${Date.now()}`); await globalThis.window.icubeApi.reload();
    assert.deepEqual(module.partnerDefaultPeriod(new Date(2026, 8, 15)), { from: '2026-08-26', to: '2026-09-25' });
    await globalThis.window.icubeApi.calculatePartnerSettlement();
    assert.match(settlementUrl, /projectId=2&from=2026-08-26&to=2026-09-25/);
    const page = globalThis.window.partner();
    assert.match(page, /Партнёр должен передать iCube/); assert.match(page, /400,00/);
    assert.doesNotMatch(page, /type="number"/); assert.doesNotMatch(page, /partnerCash/);
  } finally { globalThis.window = originalWindow; globalThis.document = originalDocument; globalThis.fetch = originalFetch; }
});

test('API bridge не рассчитывает partner settlement из frontend-state и не использует ручной cash', async () => {
  const source = await readFile(new URL('../src/frontend/api-sync.mjs', import.meta.url), 'utf8');
  assert.match(source, /api\.list\('partner-settlements'/);
  assert.match(source, /directories\.projects\.filter\(\(project\) => project\.partnerId != null\)/);
  assert.doesNotMatch(source, /partnerCash|partnerCalc|partnerSalary/);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';

test('frontend получает statistics с сервера, использует календарный месяц и не считает legacy state', async () => {
  const originalWindow = globalThis.window; const originalDocument = globalThis.document; const originalFetch = globalThis.fetch;
  const controls = { '#stats-from': { value: '2026-09-01' }, '#stats-to': { value: '2026-09-30' }, '#stats-project': { value: 'all' }, '#stats-direction': { value: 'all' } };
  let statisticsUrl;
  const empty = { projects: [{ id: '1', name: 'iCube' }], directions: [{ id: '2', name: 'Робототехника' }], sites: [], teachers: [], groups: [], children: [], payments: [], refunds: [], lessons: [], 'lesson-deletions': [], notifications: [], 'balance-transfers': [] };
  const statistics = { period: { from: '2026-09-01', to: '2026-09-30' }, filters: { projectId: null, directionId: null },
    summary: { completedLessons: 2, visits: 3, absences: 1, attendancePercent: '75.0', newChildren: 1, leftChildren: 0, activeChildren: 6, averageOccupancyPercent: '75.0' }, groups: [] };
  globalThis.window = { icubeLegacy: { state: {}, render() {}, pageHead(title) { return `<header>${title}</header>`; } }, child() { return '<main>child</main>'; }, alert() {} };
  globalThis.document = { querySelector(selector) { return controls[selector] ?? null; } };
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url).replace('/api/v1/', '');
    if (path.startsWith('statistics?')) { statisticsUrl = path; return { ok: true, status: 200, async json() { return { data: statistics }; } }; }
    const resource = path.split('?')[0]; return { ok: true, status: options.method === 'DELETE' ? 204 : 200, async json() { return { data: empty[resource] ?? [] }; } };
  };
  try {
    const module = await import(`../src/frontend/api-sync.mjs?statistics=${Date.now()}`); await globalThis.window.icubeApi.reload();
    assert.deepEqual(module.statisticsDefaultPeriod(new Date(2026, 8, 15)), { from: '2026-09-01', to: '2026-09-30' });
    await globalThis.window.icubeApi.loadStatistics();
    assert.match(statisticsUrl, /from=2026-09-01&to=2026-09-30&projectId=all&directionId=all/);
    const page = globalThis.window.stats(); assert.match(page, /Проведено занятий/); assert.match(page, />2</); assert.match(page, /75\.0%/);
  } finally { globalThis.window = originalWindow; globalThis.document = originalDocument; globalThis.fetch = originalFetch; }
});

test('statistics bridge не использует prototype aggregators', async () => {
  const source = await readFile(new URL('../src/frontend/api-sync.mjs', import.meta.url), 'utf8');
  assert.match(source, /api\.list\('statistics'/); assert.match(source, /window\.stats = statisticsPage/);
  assert.doesNotMatch(source, /attendanceSummary|newChildren\(|leftEvents|groupStats/);
});

test('карточка ребёнка отменяет transfer через DELETE и затем делает server reload', async () => {
  const originalWindow = globalThis.window; const originalDocument = globalThis.document; const originalFetch = globalThis.fetch;
  let deleted = false;
  const child = { id: '7', name: 'Ребёнок', status: 'active', needsDirectorReview: false, guardian: null, enrollments: [
    { id: '9', directionId: '1', directionName: 'Робототехника', groupId: null, status: 'finished', individualPrice: null, currentPrice: '1025.00', balanceLessons: '0.00000000' },
    { id: '10', directionId: '2', directionName: 'Программирование', groupId: null, status: 'active', individualPrice: null, currentPrice: '1125.00', balanceLessons: '2.00000000' },
  ] };
  const resources = { projects: [], directions: [], sites: [], teachers: [], groups: [], children: [child], payments: [], refunds: [], lessons: [], 'lesson-deletions': [], notifications: [],
    'balance-transfers': [{ id: '70', childId: '7', sourceEnrollmentId: '9', targetEnrollmentId: '10', sourceDirectionName: 'Робототехника', targetDirectionName: 'Программирование', transferredAmount: '2050.00', targetLessonsCredit: '1.82222222', transferredAt: '2026-09-15 12:00:00' }] };
  globalThis.window = { icubeLegacy: { state: { selectedChild: 7, childTab: 'overview' }, render() {}, pageHead() { return ''; } }, child() { return '<main>Карточка</main>'; }, alert() {} };
  globalThis.document = { querySelector() { return null; } };
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url).replace('/api/v1/', '');
    if (path === 'balance-transfers/70' && options.method === 'DELETE') { deleted = true; resources['balance-transfers'] = []; return { ok: true, status: 204, async json() { return null; } }; }
    if (path.startsWith('statistics?')) return { ok: true, status: 200, async json() { return { data: { summary: {}, groups: [] } }; } };
    return { ok: true, status: 200, async json() { return { data: resources[path.split('?')[0]] ?? [] }; } };
  };
  try {
    await import(`../src/frontend/api-sync.mjs?transfer-reversal=${Date.now()}`); await globalThis.window.icubeApi.reload();
    assert.match(globalThis.window.child(), /Отменить перенос/);
    globalThis.window.icubeApi.cancelBalanceTransferPrompt(70); assert.match(globalThis.window.icubeLegacy.state.modal, /Остаток будет возвращён/);
    await globalThis.window.icubeApi.cancelBalanceTransfer(70); assert.equal(deleted, true); assert.doesNotMatch(globalThis.window.child(), /Отменить перенос/);
  } finally { globalThis.window = originalWindow; globalThis.document = originalDocument; globalThis.fetch = originalFetch; }
});

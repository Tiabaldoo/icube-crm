import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const report = {
  period: { from: '2026-09-01', to: '2026-09-30' },
  selectedSiteId: null,
  totalLessons: 24,
  totalAmount: '8000.00',
  sites: [
    { siteId: '5', siteName: 'Школа №1', lessonCount: 16, amount: '4800.00' },
    { siteId: '8', siteName: 'ДК «Океан»', lessonCount: 8, amount: '3200.00' },
  ],
  details: [
    { lessonId: '101', startsAt: '2026-09-05T17:00:00Z', endsAt: '2026-09-05T18:30:00Z',
      groupId: '7', groupName: 'Роботы · Пт 17:00', directionId: '1', directionName: 'Робототехника',
      siteId: '5', siteName: 'Школа №1', introGroup: false, rentRate: '300.00', amount: '300.00' },
  ],
};

function setupFrontend({ role = 'director', rentResponse = report, rentFail = false } = {}) {
  const original = {
    window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch, MutationObserver: globalThis.MutationObserver,
  };
  const controls = new Map();
  const requests = [];
  const alerts = [];
  const state = {
    role,
    projects: [{ id: 1, code: 'icube-robots', name: 'iCubeRobots' }, { id: 2, code: 'zebra', name: 'Зебра' }],
    sites: [
      { id: 5, projectId: 1, name: 'Школа №1', active: true, rentPerLesson: '300.00', rentConfigured: true },
      { id: 8, projectId: 1, name: 'ДК «Океан»', active: false, rentPerLesson: '400.00', rentConfigured: true },
      { id: 9, projectId: 2, name: 'Зебра', active: true },
    ],
    teachers: [], groups: [], children: [], lessons: [], payments: [], refunds: [], balanceTransfers: [],
    rentSiteId: 'all', rentDateFrom: '2026-09-01', rentDateTo: '2026-09-30',
    rentReport: report, rentReportLoading: false, rentReportError: null, rentDetailsOpen: false,
  };
  globalThis.window = {
    icubeLegacy: {
      state,
      render() {},
      pageHead(title, subtitle) { return `<div class="page-head"><h1>${title}</h1><div>${subtitle}</div></div>`; },
    },
    alert(message) { alerts.push(String(message)); },
    confirm() { return true; },
    addEventListener() {},
  };
  globalThis.document = {
    querySelector(selector) {
      if (selector === '#app') return null;
      return controls.get(selector) ?? null;
    },
    querySelectorAll() { return []; },
    getElementById() { return null; },
    body: { classList: { add() {}, remove() {}, contains() { return false; } }, style: {} },
    documentElement: { style: {} },
    head: { appendChild() {} },
    createElement() { return { dataset: {}, style: {}, appendChild() {}, addEventListener() {}, querySelector() { return null; } }; },
  };
  globalThis.MutationObserver = class { observe() {} disconnect() {} };
  globalThis.fetch = async (url, options = {}) => {
    const parsed = new URL(String(url), 'http://crm.test');
    requests.push({ path: parsed.pathname, search: parsed.search, method: options.method ?? 'GET', body: options.body });
    if (parsed.pathname.endsWith('/site-rent-report')) {
      if (rentFail) return { ok: false, status: 503, async json() { return { error: { code: 'TEMPORARY', message: 'temporary' } }; } };
      return { ok: true, status: 200, async json() { return { data: structuredClone(rentResponse) }; } };
    }
    return { ok: true, status: 200, async json() { return { data: [] }; } };
  };
  return {
    state, controls, requests, alerts,
    set(selector, value) { controls.set(selector, { value: String(value) }); },
    restore() {
      globalThis.window = original.window;
      globalThis.document = original.document;
      globalThis.fetch = original.fetch;
      globalThis.MutationObserver = original.MutationObserver;
    },
  };
}

async function loadApi(label) {
  return import(`../src/frontend/api-sync.mjs?site-rent-${label}=${Date.now()}-${Math.random()}`);
}

test('rent default period is the current local calendar month', async () => {
  const setup = setupFrontend();
  try {
    const mod = await loadApi('default-period');
    assert.deepEqual(mod.rentDefaultPeriod(new Date(2026, 8, 18, 23, 30)), { from: '2026-09-01', to: '2026-09-30' });
    assert.deepEqual(mod.rentDefaultPeriod(new Date(2026, 1, 3, 1, 0)), { from: '2026-02-01', to: '2026-02-28' });
  } finally { setup.restore(); }
});

test('Все площадки omits siteId and successful Calculate commits applied filters', async () => {
  const setup = setupFrontend();
  try {
    setup.set('#rent-site', 'all');
    setup.set('#rent-from', '2026-09-01');
    setup.set('#rent-to', '2026-09-30');
    await loadApi('all-sites');
    await globalThis.window.icubeApi.calculateSiteRentReport();

    const request = setup.requests.find((item) => item.path.endsWith('/site-rent-report'));
    const params = new URLSearchParams(request.search);
    assert.equal(params.get('from'), '2026-09-01');
    assert.equal(params.get('to'), '2026-09-30');
    assert.equal(params.has('siteId'), false);
    assert.equal(setup.state.rentSiteId, 'all');
    assert.equal(setup.state.rentReport.totalLessons, 24);
    assert.equal(setup.state.rentReport.totalAmount, '8000.00');
  } finally { setup.restore(); }
});

test('specific site request sends numeric siteId', async () => {
  const setup = setupFrontend();
  try {
    setup.set('#rent-site', '5');
    setup.set('#rent-from', '2026-08-01');
    setup.set('#rent-to', '2026-08-31');
    await loadApi('site-filter');
    await globalThis.window.icubeApi.calculateSiteRentReport();
    const request = setup.requests.find((item) => item.path.endsWith('/site-rent-report'));
    assert.equal(new URLSearchParams(request.search).get('siteId'), '5');
    assert.equal(setup.state.rentSiteId, '5');
    assert.equal(setup.state.rentDateFrom, '2026-08-01');
    assert.equal(setup.state.rentDateTo, '2026-08-31');
  } finally { setup.restore(); }
});

test('failed rent calculation preserves previous report and applied filters', async () => {
  const setup = setupFrontend({ rentFail: true });
  try {
    const previous = setup.state.rentReport;
    setup.set('#rent-site', '5');
    setup.set('#rent-from', '2026-10-01');
    setup.set('#rent-to', '2026-10-31');
    await loadApi('failed');
    await globalThis.window.icubeApi.calculateSiteRentReport();

    assert.equal(setup.state.rentReport, previous);
    assert.equal(setup.state.rentSiteId, 'all');
    assert.equal(setup.state.rentDateFrom, '2026-09-01');
    assert.equal(setup.state.rentDateTo, '2026-09-30');
    assert.match(setup.state.rentReportError, /Не удалось рассчитать аренду/);
    assert.equal(setup.state.rentReportLoading, false);
  } finally { setup.restore(); }
});

test('invalid reversed rent period is rejected before API request', async () => {
  const setup = setupFrontend();
  try {
    setup.set('#rent-site', 'all');
    setup.set('#rent-from', '2026-10-01');
    setup.set('#rent-to', '2026-09-30');
    await loadApi('invalid-range');
    await globalThis.window.icubeApi.calculateSiteRentReport();
    assert.equal(setup.requests.some((item) => item.path.endsWith('/site-rent-report')), false);
    assert.equal(setup.alerts.at(-1), 'Дата начала периода должна быть не позже даты окончания');
  } finally { setup.restore(); }
});

test('rent page shows summary, inactive iCube site, details and zero-request toggle', async () => {
  const setup = setupFrontend();
  try {
    await loadApi('page');
    let page = globalThis.window.icubeRentPage();
    assert.match(page, /Расчёты аренды/);
    assert.match(page, /Школа №1/);
    assert.match(page, /ДК «Океан» · неактивна/);
    assert.doesNotMatch(page, />Зебра<\/option>/);
    assert.match(page, /24 занятия/);
    assert.match(page, /8[\s ]000,00 ₽/);
    assert.match(page, /Подробная сводка/);
    assert.doesNotMatch(page, /05\.09\.2026 · 17:00–18:30/);

    const before = setup.requests.length;
    globalThis.window.icubeApi.toggleSiteRentDetails();
    assert.equal(setup.requests.length, before);
    page = globalThis.window.icubeRentPage();
    assert.match(page, /Скрыть подробности/);
    assert.match(page, /05\.09\.2026 · 17:00–18:30/);
    assert.match(page, /300,00 ₽/);
  } finally { setup.restore(); }
});

test('partner and teacher page state cannot render rent page or request report through refresh', async () => {
  for (const role of ['partner', 'teacher']) {
    const setup = setupFrontend({ role });
    try {
      await loadApi(`no-rent-${role}`);
      assert.equal(globalThis.window.icubeRentPage(), '');
      const before = setup.requests.length;
      const result = await globalThis.window.icubeApi.refreshSiteRentReport();
      assert.equal(result, false);
      assert.equal(setup.requests.length, before);
    } finally { setup.restore(); }
  }
});

test('site form/request source exposes rent only for director iCube sites', async () => {
  const [ui, sync] = await Promise.all([
    readFile(new URL('../src/frontend/crm-ui.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/frontend/api-sync.mjs', import.meta.url), 'utf8'),
  ]);
  assert.match(ui, /Аренда за проведённое занятие, ₽/);
  assert.match(ui, /id="sf-rent" type="number" min="0" step="0\.01"/);
  assert.match(ui, /state\.role==='director'/);
  assert.match(ui, /project\?\.code==='icube-robots'/);
  assert.match(ui, /первая ставка для площадки/i);
  assert.match(ui, /новую историческую версию/);
  assert.match(sync, /legacy\.state\.role === 'director' && project\?\.code === 'icube-robots'/);
  assert.match(sync, /body\.rentPerLesson = rent/);
});

test('desktop and mobile navigation expose rent only outside partner filter', async () => {
  const ui = await readFile(new URL('../src/frontend/crm-ui.js', import.meta.url), 'utf8');
  assert.match(ui, /\['rent','Расчёты аренды'\]/);
  assert.match(ui, /\['partner','rent','stats','settings'\]/);
});

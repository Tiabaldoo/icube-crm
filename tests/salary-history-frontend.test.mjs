import assert from 'node:assert/strict';
import test from 'node:test';

function setupFrontend({ role = 'director', responseRows = [], fail = false } = {}) {
  const original = {
    window: globalThis.window,
    document: globalThis.document,
    fetch: globalThis.fetch,
    MutationObserver: globalThis.MutationObserver,
  };
  const controls = new Map();
  const requests = [];
  const alerts = [];
  const state = {
    role,
    projects: [{ id: 1, name: 'iCubeRobots' }, { id: 2, name: 'Зебра' }],
    teachers: [{ id: 5, name: 'Иванов Сергей', active: true }],
    groups: [], children: [], sites: [], lessons: [], payments: [], refunds: [], balanceTransfers: [],
    salaryTeacher: '5', salaryProjectId: '1', salaryDateFrom: '2026-09-11', salaryDateTo: '2026-10-10',
    salaryReportRows: [{ id: 1, totalAmount: '900.00', calc: { total: 900 } }],
    salaryReportTotal: 900,
  };
  globalThis.window = {
    icubeLegacy: { state, render() {} },
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
    requests.push({ path: parsed.pathname, search: parsed.search, method: options.method ?? 'GET' });
    if (parsed.pathname.endsWith('/salary-accruals')) {
      if (fail) return { ok: false, status: 503, async json() { return { error: { code: 'TEMPORARY', message: 'temporary' } }; } };
      return { ok: true, status: 200, async json() { return { data: responseRows }; } };
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

async function loadApi(setup, label) {
  await import(`../src/frontend/api-sync.mjs?salary-history-${label}=${Date.now()}-${Math.random()}`);
  return setup;
}

const historicalRow = {
  id: '91', lessonId: '44', teacherId: '5', rateVersionId: '7', type: 'regular',
  presentChildren: 3, fixedAmount: '600.00', childrenAmount: '300.00', totalAmount: '900.00',
  startsAt: '2025-01-15T10:00:00Z', groupId: '12', groupName: 'Историческая группа',
  projectId: '1', projectName: 'iCubeRobots', siteId: '8', siteName: 'ДК «Океан»',
};

test('Apply requests arbitrary historical dates and numeric director projectId, then commits server rows', async () => {
  const setup = setupFrontend({ responseRows: [historicalRow] });
  try {
    setup.set('#salary-teacher', '5');
    setup.set('#salary-project', '1');
    setup.set('#salary-from', '2025-01-01');
    setup.set('#salary-to', '2025-01-31');
    await loadApi(setup, 'director-project');
    await globalThis.window.icubeApi.applySalaryFilters();

    const request = setup.requests.find((item) => item.path.endsWith('/salary-accruals'));
    const params = new URLSearchParams(request.search);
    assert.equal(params.get('teacherId'), '5');
    assert.equal(params.get('from'), '2025-01-01');
    assert.equal(params.get('to'), '2025-01-31');
    assert.equal(params.get('projectId'), '1');
    assert.equal(setup.state.salaryDateFrom, '2025-01-01');
    assert.equal(setup.state.salaryDateTo, '2025-01-31');
    assert.equal(setup.state.salaryReportRows[0].groupName, 'Историческая группа');
    assert.equal(setup.state.salaryReportRows[0].siteName, 'ДК «Океан»');
    assert.equal(setup.state.salaryReportRows[0].calc.fixed, 600);
    assert.equal(setup.state.salaryReportRows[0].calc.childrenPay, 300);
    assert.equal(setup.state.salaryReportRows[0].calc.total, 900);
    assert.equal(setup.state.salaryReportTotal, 900);
    assert.deepEqual(setup.state.lessons, []);
  } finally { setup.restore(); }
});

test('director Все omits projectId and partner frontend never sends arbitrary projectId', async () => {
  for (const [role, projectValue] of [['director', 'all'], ['partner', '1']]) {
    const setup = setupFrontend({ role, responseRows: [] });
    try {
      setup.set('#salary-teacher', '5');
      if (role === 'director') setup.set('#salary-project', projectValue);
      setup.set('#salary-from', '2026-08-26');
      setup.set('#salary-to', '2026-09-25');
      await loadApi(setup, `scope-${role}`);
      await globalThis.window.icubeApi.applySalaryFilters();
      const request = setup.requests.find((item) => item.path.endsWith('/salary-accruals'));
      const params = new URLSearchParams(request.search);
      assert.equal(params.has('projectId'), false);
    } finally { setup.restore(); }
  }
});

test('failed Apply preserves previous applied period, rows and total', async () => {
  const setup = setupFrontend({ fail: true });
  try {
    setup.set('#salary-teacher', '5');
    setup.set('#salary-project', '1');
    setup.set('#salary-from', '2026-10-11');
    setup.set('#salary-to', '2026-11-10');
    const previousRows = setup.state.salaryReportRows;
    await loadApi(setup, 'failed-apply');
    await globalThis.window.icubeApi.applySalaryFilters();

    assert.equal(setup.state.salaryDateFrom, '2026-09-11');
    assert.equal(setup.state.salaryDateTo, '2026-10-10');
    assert.equal(setup.state.salaryReportRows, previousRows);
    assert.equal(setup.state.salaryReportTotal, 900);
    assert.match(setup.state.salaryReportError, /Не удалось загрузить зарплату за выбранный период/);
    assert.equal(setup.state.salaryReportLoading, false);
  } finally { setup.restore(); }
});

test('invalid reversed frontend period is rejected without salary request', async () => {
  const setup = setupFrontend();
  try {
    setup.set('#salary-teacher', '5');
    setup.set('#salary-project', '1');
    setup.set('#salary-from', '2026-10-10');
    setup.set('#salary-to', '2026-09-11');
    await loadApi(setup, 'reversed');
    await globalThis.window.icubeApi.applySalaryFilters();
    assert.equal(setup.requests.some((item) => item.path.endsWith('/salary-accruals')), false);
    assert.equal(setup.alerts.at(-1), 'Дата начала периода должна быть не позже даты окончания');
  } finally { setup.restore(); }
});

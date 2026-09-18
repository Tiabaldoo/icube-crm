import assert from 'node:assert/strict';
import test from 'node:test';

function installEnvironment({
  role = 'director',
  failSalaryGetCount = 0,
  failPartnerGetCount = 0,
  failSalaryPostKey = null,
  failPartnerPost = false,
} = {}) {
  const original = {
    window: globalThis.window,
    document: globalThis.document,
    fetch: globalThis.fetch,
    MutationObserver: globalThis.MutationObserver,
  };
  const calls = [];
  const alerts = [];
  const controls = new Map();
  const state = {
    page: 'dashboard',
    settings: {
      robotPrice: 1025,
      codePrice: 1125,
      salaryFix: 600,
      salaryChild: 100,
      salaryIntro: 600,
      salaryEmpty: 300,
      tax: 4,
      icubeShare: 40,
      partnerShare: 60,
    },
  };
  const salary = [
    { key: 'regular_fixed', value: '700.00', versionId: '10', validFrom: '2026-09-01' },
    { key: 'per_present_child', value: '120.00', versionId: '10', validFrom: '2026-09-01' },
    { key: 'intro_fixed', value: '650.00', versionId: '10', validFrom: '2026-09-01' },
    { key: 'empty_trip_fixed', value: '350.00', versionId: '10', validFrom: '2026-09-01' },
  ];
  let partner = {
    projectId: '2',
    projectCode: 'zebra',
    partnerId: '9',
    taxPercent: '4.000',
    icubePercent: '40.000',
    partnerPercent: '60.000',
    versionId: '20',
    validFrom: '2026-09-01',
  };
  const prices = [
    { directionId: '1', directionCode: 'robotics', directionName: 'Робототехника', price: '1025.00', packagePrice: '4100.00' },
    { directionId: '2', directionCode: 'programming', directionName: 'Программирование', price: '1125.00', packagePrice: '4500.00' },
  ];
  let salaryGetFailures = failSalaryGetCount;
  let partnerGetFailures = failPartnerGetCount;

  const ok = (data) => ({ ok: true, status: 200, async json() { return { data }; } });
  const problem = (status, code, message) => ({ ok: false, status, async json() { return { error: { code, message } }; } });
  const money = (value) => Number(value).toFixed(2);
  const percent = (value) => Number(value).toFixed(3);

  globalThis.window = {
    icubeAuthReady: Promise.resolve({ roles: [role] }),
    icubeLegacy: { state, render() {} },
    icubeApi: { async reload() {} },
    navTo() {},
    addEventListener() {},
    confirm() { return true; },
    alert(message) { alerts.push(String(message)); },
  };
  globalThis.document = {
    querySelector(selector) {
      if (selector === '#app') return {};
      return controls.get(selector) ?? null;
    },
    querySelectorAll() { return []; },
    createElement() {
      return {
        dataset: {}, style: {}, hidden: false, textContent: '', className: '',
        appendChild() {}, append() {}, addEventListener() {}, querySelector() { return null; },
      };
    },
  };
  globalThis.MutationObserver = class { constructor(callback) { this.callback = callback; } observe() {} disconnect() {} };
  globalThis.fetch = async (url, options = {}) => {
    const parsed = new URL(String(url), 'http://crm.test');
    const path = parsed.pathname.replace(/^\/api\/v1\//, '');
    const method = options.method ?? 'GET';
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ method, path, body });

    if (path === 'price-versions' && method === 'GET') return ok(prices.map((item) => ({ ...item })));
    if (path === 'salary-rate-versions' && method === 'GET') {
      if (salaryGetFailures > 0) {
        salaryGetFailures -= 1;
        return problem(503, 'TEMPORARY_ERROR', 'salary unavailable');
      }
      return ok(salary.map((item) => ({ ...item })));
    }
    if (path === 'partner-agreement-versions' && method === 'GET') {
      if (partnerGetFailures > 0) {
        partnerGetFailures -= 1;
        return problem(503, 'TEMPORARY_ERROR', 'partner unavailable');
      }
      return ok({ ...partner });
    }
    if (path === 'salary-rate-versions' && method === 'POST') {
      if (body.key === failSalaryPostKey) return problem(500, 'SAVE_FAILED', 'salary save failed');
      const item = salary.find((rate) => rate.key === body.key);
      if (item) item.value = money(body.value);
      return ok({ ...(item ?? {}), key: body.key, value: money(body.value) });
    }
    if (path === 'partner-agreement-versions' && method === 'POST') {
      if (failPartnerPost) return problem(500, 'SAVE_FAILED', 'partner save failed');
      partner = {
        ...partner,
        taxPercent: percent(body.taxPercent),
        icubePercent: percent(body.icubePercent),
        partnerPercent: percent(body.partnerPercent),
        versionId: String(Number(partner.versionId) + 1),
      };
      return ok({ ...partner });
    }
    if (path === 'price-versions' && method === 'POST') return ok(body);
    return ok([]);
  };

  return {
    state,
    salary,
    get partner() { return partner; },
    calls,
    alerts,
    controls,
    setControl(selector, value) { controls.set(selector, { value: String(value) }); },
    restore() {
      globalThis.window = original.window;
      globalThis.document = original.document;
      globalThis.fetch = original.fetch;
      globalThis.MutationObserver = original.MutationObserver;
    },
  };
}

async function loadSettings(setup, label) {
  await import(`../src/frontend/direction-price-settings.mjs?${label}=${Date.now()}-${Math.random()}`);
  if (globalThis.window.icubeFinancialSettingsReady) await globalThis.window.icubeFinancialSettingsReady;
  return setup;
}

function setSalaryControls(setup, values) {
  setup.setControl('#settings-salary-fixed', values.regular_fixed);
  setup.setControl('#settings-salary-child', values.per_present_child);
  setup.setControl('#settings-salary-intro', values.intro_fixed);
  setup.setControl('#settings-salary-empty', values.empty_trip_fixed);
}

function setPartnerControls(setup, values) {
  setup.setControl('#settings-partner-tax', values.taxPercent);
  setup.setControl('#settings-partner-icube', values.icubePercent);
  setup.setControl('#settings-partner-share', values.partnerPercent);
}

test('director loads salary rates and Zebra agreement from server values instead of legacy defaults', async () => {
  const setup = installEnvironment();
  try {
    await loadSettings(setup, 'load-values');
    assert.equal(setup.state.settings.salaryFix, 700);
    assert.equal(setup.state.settings.salaryChild, 120);
    assert.equal(setup.state.settings.salaryIntro, 650);
    assert.equal(setup.state.settings.salaryEmpty, 350);
    assert.equal(setup.state.settings.tax, 4);
    assert.equal(setup.state.settings.icubeShare, 40);
    assert.equal(setup.state.settings.partnerShare, 60);
    assert.equal(setup.state.serverSalaryRates.regular_fixed.value, '700.00');
    assert.equal(setup.state.serverPartnerAgreement.projectCode, 'zebra');
  } finally { setup.restore(); }
});

test('editing salary inputs alone does not POST or mutate confirmed server state', async () => {
  const setup = installEnvironment();
  try {
    await loadSettings(setup, 'edit-only');
    const before = setup.calls.length;
    setSalaryControls(setup, {
      regular_fixed: '750',
      per_present_child: '120',
      intro_fixed: '650',
      empty_trip_fixed: '350',
    });
    assert.equal(setup.calls.slice(before).filter((call) => call.method === 'POST').length, 0);
    assert.equal(setup.state.serverSalaryRates.regular_fixed.value, '700.00');
    assert.equal(setup.state.settings.salaryFix, 700);
  } finally { setup.restore(); }
});

test('one changed salary rate creates exactly one version and then reloads server rates', async () => {
  const setup = installEnvironment();
  try {
    await loadSettings(setup, 'one-salary');
    setSalaryControls(setup, {
      regular_fixed: '750',
      per_present_child: '120',
      intro_fixed: '650',
      empty_trip_fixed: '350',
    });
    const before = setup.calls.length;
    await globalThis.window.saveSalarySettings();
    const relevant = setup.calls.slice(before).filter((call) => call.path === 'salary-rate-versions');
    assert.deepEqual(relevant.map((call) => [call.method, call.body?.key ?? null, call.body?.value ?? null]), [
      ['POST', 'regular_fixed', '750'],
      ['GET', null, null],
    ]);
    assert.equal(setup.state.settings.salaryFix, 750);
    assert.equal(setup.state.serverSalaryRates.regular_fixed.value, '750.00');
  } finally { setup.restore(); }
});

test('multiple salary changes POST sequentially and final state comes from repeated GET', async () => {
  const setup = installEnvironment();
  try {
    await loadSettings(setup, 'multi-salary');
    setSalaryControls(setup, {
      regular_fixed: '760',
      per_present_child: '120',
      intro_fixed: '650',
      empty_trip_fixed: '360',
    });
    const before = setup.calls.length;
    await globalThis.window.saveSalarySettings();
    const relevant = setup.calls.slice(before).filter((call) => call.path === 'salary-rate-versions');
    assert.deepEqual(relevant.map((call) => `${call.method}:${call.body?.key ?? ''}`), [
      'POST:regular_fixed',
      'POST:empty_trip_fixed',
      'GET:',
    ]);
    assert.equal(setup.state.settings.salaryFix, 760);
    assert.equal(setup.state.settings.salaryEmpty, 360);
  } finally { setup.restore(); }
});

test('partial salary save failure reloads actual server state and does not report fake values', async () => {
  const setup = installEnvironment({ failSalaryPostKey: 'empty_trip_fixed' });
  try {
    await loadSettings(setup, 'salary-error');
    setSalaryControls(setup, {
      regular_fixed: '750',
      per_present_child: '120',
      intro_fixed: '650',
      empty_trip_fixed: '360',
    });
    const before = setup.calls.length;
    await globalThis.window.saveSalarySettings();
    const relevant = setup.calls.slice(before).filter((call) => call.path === 'salary-rate-versions');
    assert.deepEqual(relevant.map((call) => `${call.method}:${call.body?.key ?? ''}`), [
      'POST:regular_fixed',
      'POST:empty_trip_fixed',
      'GET:',
    ]);
    assert.equal(setup.state.settings.salaryFix, 750);
    assert.equal(setup.state.settings.salaryEmpty, 350);
    assert.match(setup.alerts.at(-1), /salary save failed/);
  } finally { setup.restore(); }
});

test('partner agreement saves one version, preserves decimals and reloads server agreement', async () => {
  const setup = installEnvironment();
  try {
    await loadSettings(setup, 'partner-save');
    setPartnerControls(setup, { taxPercent: '5', icubePercent: '45', partnerPercent: '55' });
    const before = setup.calls.length;
    await globalThis.window.savePartnerSettings();
    const relevant = setup.calls.slice(before).filter((call) => call.path === 'partner-agreement-versions');
    assert.equal(relevant.length, 2);
    assert.deepEqual(relevant[0], {
      method: 'POST',
      path: 'partner-agreement-versions',
      body: { projectId: '2', taxPercent: '5', icubePercent: '45', partnerPercent: '55' },
    });
    assert.equal(relevant[1].method, 'GET');
    assert.equal(setup.state.settings.tax, 5);
    assert.equal(setup.state.settings.icubeShare, 45);
    assert.equal(setup.state.settings.partnerShare, 55);
  } finally { setup.restore(); }
});

test('invalid partner shares are rejected before POST', async () => {
  const setup = installEnvironment();
  try {
    await loadSettings(setup, 'partner-validation');
    setPartnerControls(setup, { taxPercent: '4', icubePercent: '40', partnerPercent: '50' });
    const before = setup.calls.length;
    await globalThis.window.savePartnerSettings();
    assert.equal(setup.calls.slice(before).filter((call) => call.method === 'POST').length, 0);
    assert.equal(setup.alerts.at(-1), 'Доли iCube и партнёра в сумме должны составлять 100%.');
  } finally { setup.restore(); }
});

test('unchanged salary and partner values create no new versions', async () => {
  const setup = installEnvironment();
  try {
    await loadSettings(setup, 'no-changes');
    setSalaryControls(setup, {
      regular_fixed: '700',
      per_present_child: '120',
      intro_fixed: '650',
      empty_trip_fixed: '350',
    });
    setPartnerControls(setup, { taxPercent: '4', icubePercent: '40', partnerPercent: '60' });
    const before = setup.calls.length;
    await globalThis.window.saveSalarySettings();
    await globalThis.window.savePartnerSettings();
    assert.equal(setup.calls.slice(before).filter((call) => call.method === 'POST').length, 0);
  } finally { setup.restore(); }
});

test('salary settings GET failure does not break director load and does not replace legacy values with fake data', async () => {
  const setup = installEnvironment({ failSalaryGetCount: 1 });
  try {
    await loadSettings(setup, 'salary-load-error');
    assert.equal(setup.state.settings.salaryFix, 600);
    assert.equal(setup.state.serverSalaryRates, null);
    assert.equal(setup.state.settingsLoadErrors.salary, 'Не удалось загрузить ставки зарплаты. Обновите страницу или попробуйте ещё раз.');
    assert.equal(setup.state.settings.tax, 4);
  } finally { setup.restore(); }
});

test('partner and teacher do not request director financial settings', async () => {
  for (const role of ['partner', 'teacher']) {
    const setup = installEnvironment({ role });
    try {
      await loadSettings(setup, `role-${role}`);
      assert.equal(setup.calls.some((call) => ['salary-rate-versions', 'partner-agreement-versions', 'price-versions'].includes(call.path)), false);
      assert.equal(globalThis.window.icubeFinancialSettingsReady, undefined);
    } finally { setup.restore(); }
  }
});

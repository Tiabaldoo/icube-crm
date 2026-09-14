import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('единый frontend загружается и рендерит все текущие разделы', async () => {
  const source = await readFile(new URL('../src/frontend/crm-ui.js', import.meta.url), 'utf8');
  const app = { innerHTML: '' };
  const elementsById = new Map([['app', app]]);
  const classNames = new Set();
  const document = {
    body: {
      style: {},
      classList: {
        add: (...names) => names.forEach((name) => classNames.add(name)),
        remove: (...names) => names.forEach((name) => classNames.delete(name)),
        contains: (name) => classNames.has(name),
      },
    },
    documentElement: { style: {} },
    head: { appendChild(element) { if (element.id) elementsById.set(element.id, element); } },
    getElementById: (id) => elementsById.get(id) ?? null,
    createElement: () => ({ style: {}, className: '', textContent: '', appendChild: () => {} }),
    querySelector(selector) {
      if (selector === '#app') return app;
      if (selector === '.modal-backdrop') return app.innerHTML.includes('modal-backdrop') ? {} : null;
      return null;
    },
    querySelectorAll: () => [],
    addEventListener: () => {},
  };
  const context = vm.createContext({
    console,
    document,
    alert: () => {},
    requestAnimationFrame: (callback) => callback(),
    setTimeout: () => 0,
    clearTimeout: () => {},
    scrollY: 0,
    pageYOffset: 0,
    scrollTo: () => {},
    addEventListener: () => {},
    Intl,
    Date,
    Math,
    Map,
    Set,
    Object,
    Array,
    Number,
    String,
    Boolean,
    RegExp,
    JSON,
    MutationObserver: class { observe() {} disconnect() {} },
  });
  context.window = context;
  context.globalThis = context;

  vm.runInContext(`${source}\n;globalThis.__crmProbe={state,render,groupChildren};`, context, { filename: 'crm-ui.js' });
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const localIso = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  assert.equal(context.__crmProbe.state.salaryDateTo, todayIso);
  assert.equal(context.__crmProbe.state.partnerDateFrom, localIso(new Date(today.getFullYear(), today.getMonth() - 1, 26)));
  assert.equal(context.__crmProbe.state.partnerDateTo, localIso(new Date(today.getFullYear(), today.getMonth(), 25)));
  const pages = ['dashboard', 'children', 'groups', 'calendar', 'payments', 'refunds', 'balances', 'teachers', 'sites', 'salary', 'partner', 'stats', 'settings'];
  for (const page of pages) {
    context.__crmProbe.state.role = 'director';
    context.__crmProbe.state.page = page;
    context.__crmProbe.render();
    assert.match(app.innerHTML, /app-shell/, `раздел ${page} не отрендерился`);
  }
  context.__crmProbe.state.role = 'teacher';
  context.__crmProbe.state.page = 'teacherToday';
  context.__crmProbe.render();
  assert.match(app.innerHTML, /teacher-shell/);

  const savedChildren = context.__crmProbe.state.children;
  context.__crmProbe.state.children = [
    { status: 'Активный', enrollments: [{ groupId: 999, status: 'Пауза' }] },
    { status: 'Лид', enrollments: [{ groupId: 999 }] },
  ];
  assert.equal(context.__crmProbe.groupChildren(999).length, 1);
  context.__crmProbe.state.children = savedChildren;
});

test('фактические save handlers подключены к API namespace', async () => {
  const [uiSource, indexSource] = await Promise.all([
    readFile(new URL('../src/frontend/crm-ui.js', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
  ]);
  assert.ok(indexSource.indexOf('crm-ui.js') < indexSource.indexOf('api-sync.mjs'));
  for (const handler of ['saveSite', 'saveTeacher', 'saveGroup', 'saveChild', 'saveEnrollment', 'addEnrollment', 'deleteChild']) {
    assert.match(uiSource, new RegExp(`onclick="icubeApi\\.${handler}\\(`), `форма не вызывает icubeApi.${handler}`);
  }

  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalFetch = globalThis.fetch;
  const state = { sites: [], teachers: [], groups: [], children: [], selectedChild: null, selectedGroup: null };
  globalThis.window = { icubeLegacy: { state, render() {} }, alert() {} };
  globalThis.document = { querySelector() { return null; } };
  globalThis.fetch = async () => ({ ok: true, status: 200, async json() { return { data: [] }; } });
  try {
    await import(`../src/frontend/api-sync.mjs?smoke=${Date.now()}`);
    await globalThis.window.icubeApi.reload();
    const aliases = {
      saveSite: 'saveSite', saveTeacher: 'saveTeacher', saveGroupV111: 'saveGroup', saveChildV111: 'saveChild',
      saveManagedDirection: 'saveEnrollment', saveAddedDirectionV132: 'addEnrollment',
      deleteChildPrompt: 'deleteChildPrompt', confirmDeleteChild: 'deleteChild',
      paymentForm: 'paymentForm', refreshPaymentDirections: 'refreshPaymentDirections', updatePaymentCalc: 'updatePaymentCalc',
      savePaymentV116: 'savePayment', deletePayment: 'deletePaymentPrompt', confirmDeletePayment: 'deletePayment',
      deleteChildPayment: 'deleteChildPaymentPrompt', confirmDeleteChildPayment: 'confirmDeleteChildPayment',
    };
    for (const [legacyName, apiName] of Object.entries(aliases)) {
      assert.equal(globalThis.window[legacyName], globalThis.window.icubeApi[apiName], `${legacyName} остался legacy handler`);
    }
  } finally {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    globalThis.fetch = originalFetch;
  }
});

test('после сохранения базовых цен настройки обновляют общее CRM-состояние без двойного render', async () => {
  const source = await readFile(new URL('../src/frontend/direction-price-settings.mjs', import.meta.url), 'utf8');
  assert.match(source, /await window\.icubeApi\.reload\(\{ render: false \}\);/);
  assert.match(source, /state\.page = 'settings';\s*legacy\.render\(\);/);
  assert.doesNotMatch(source, /await loadPrices\(\{ render: true \}\);/);
});

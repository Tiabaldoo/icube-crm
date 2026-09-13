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

  vm.runInContext(`${source}\n;globalThis.__crmProbe={state,render};`, context, { filename: 'crm-ui.js' });
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  assert.equal(context.__crmProbe.state.salaryDateTo, todayIso);
  assert.equal(context.__crmProbe.state.partnerDateTo, todayIso);
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
});

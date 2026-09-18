import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const uiUrl = new URL('../src/frontend/crm-ui.js', import.meta.url);

function salaryContext(source) {
  const app = { innerHTML: '' };
  const controls = new Map();
  const elementsById = new Map([['app', app]]);
  const classNames = new Set();
  const document = {
    body: { style: {}, classList: {
      add: (...names) => names.forEach((name) => classNames.add(name)),
      remove: (...names) => names.forEach((name) => classNames.delete(name)),
      contains: (name) => classNames.has(name),
    } },
    documentElement: { style: {} },
    head: { appendChild(element) { if (element.id) elementsById.set(element.id, element); } },
    getElementById: (id) => elementsById.get(id) ?? null,
    createElement: () => ({ style: {}, className: '', textContent: '', appendChild() {} }),
    querySelector(selector) {
      if (controls.has(selector)) return controls.get(selector);
      if (selector === '#app') return app;
      if (selector === '.modal-backdrop') return app.innerHTML.includes('modal-backdrop') ? {} : null;
      return null;
    },
    querySelectorAll: () => [],
    addEventListener() {},
  };
  const context = vm.createContext({
    console, document, alert() {}, requestAnimationFrame: (callback) => callback(),
    setTimeout: () => 0, clearTimeout() {}, scrollY: 0, pageYOffset: 0, scrollTo() {}, addEventListener() {},
    Intl, Date, Math, Map, Set, Object, Array, Number, String, Boolean, RegExp, JSON,
    MutationObserver: class { observe() {} disconnect() {} },
  });
  context.window = context;
  context.globalThis = context;
  vm.runInContext(`${source}\n;globalThis.__salaryProbe={state};`, context, { filename: 'crm-ui.js' });
  return { context, state: context.__salaryProbe.state, controls };
}

function reportRow({
  id = 91,
  lessonId = 44,
  teacherId = 5,
  projectId = 1,
  projectName = 'iCubeRobots',
  groupId = 12,
  groupName = 'Историческая группа',
  siteId = 8,
  siteName = 'ДК «Океан»',
  date = '15.01.2025',
  time = '10:00',
  type = 'Обычное занятие',
  children = 3,
  fixed = 600,
  childrenPay = 300,
  total = 900,
} = {}) {
  return {
    id, lessonId, teacherId, projectId, projectName, groupId, groupName, siteId, siteName,
    date, time, totalAmount: total.toFixed(2),
    lesson: { id: lessonId, date, time, groupId, groupName, projectId, project: projectName, projectName, siteId, siteName },
    group: { id: groupId, name: groupName, projectId, project: projectName, siteId, siteName },
    calc: { type, children, fixed, childrenPay, total },
  };
}

test('salary default periods follow current 11-10 iCube and 26-25 Zebra cycles', async () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  globalThis.window = { icubeLegacy: { state: {} } };
  globalThis.document = { querySelector() { return null; } };
  try {
    const module = await import(`../src/frontend/api-sync.mjs?salary-period=${Date.now()}`);
    assert.deepEqual(module.salaryDefaultPeriod('iCubeRobots', new Date(2026, 8, 5)), { from: '2026-08-11', to: '2026-09-10' });
    assert.deepEqual(module.salaryDefaultPeriod('iCubeRobots', new Date(2026, 8, 18)), { from: '2026-09-11', to: '2026-10-10' });
    assert.deepEqual(module.salaryDefaultPeriod('Зебра', new Date(2026, 8, 18)), { from: '2026-08-26', to: '2026-09-25' });
    assert.deepEqual(module.salaryDefaultPeriod('Зебра', new Date(2026, 8, 28)), { from: '2026-09-26', to: '2026-10-25' });
  } finally {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
  }
});

test('salary page renders historical server rows with state.lessons empty', async () => {
  const source = await readFile(uiUrl, 'utf8');
  const { context, state } = salaryContext(source);
  state.role = 'director';
  state.projects = [{ id: 1, name: 'iCubeRobots' }, { id: 2, name: 'Зебра' }];
  state.teachers = [{ id: 5, name: 'Иванов Сергей', active: true }];
  state.salaryTeacher = '5';
  state.salaryProjectId = '1';
  state.salaryDateFrom = '2025-01-01';
  state.salaryDateTo = '2025-01-31';
  state.lessons = [];
  state.groups = [];
  state.sites = [];
  state.salaryReportRows = [reportRow()];
  state.salaryReportTotal = 900;

  const html = context.salary();
  assert.match(html, /Историческая группа/);
  assert.match(html, /ДК «Океан»/);
  assert.match(html, /600 ₽/);
  assert.match(html, /300 ₽/);
  assert.match(html, /900 ₽/);
  assert.doesNotMatch(html, /За выбранный период начислений нет/);
});

test('salary page keeps project selector for director and hides it and PDF for partner', async () => {
  const source = await readFile(uiUrl, 'utf8');
  const { context, state } = salaryContext(source);
  state.projects = [{ id: 1, name: 'iCubeRobots' }, { id: 2, name: 'Зебра' }];
  state.teachers = [{ id: 5, name: 'Иванов Сергей', active: true }];
  state.salaryTeacher = '5';
  state.salaryReportRows = [];
  state.salaryReportTotal = 0;

  state.role = 'director';
  let html = context.salary();
  assert.match(html, /<option value="all"/);
  assert.match(html, />iCube<\/option>/);
  assert.match(html, />Зебра<\/option>/);
  assert.match(html, /Печать \/ PDF/);

  state.role = 'partner';
  html = context.salary();
  assert.doesNotMatch(html, /id="salary-project"/);
  assert.doesNotMatch(html, /Печать \/ PDF/);
});

test('legacy Apply delegates to the API bridge and does not commit form values itself', async () => {
  const source = await readFile(uiUrl, 'utf8');
  const { context, state, controls } = salaryContext(source);
  state.salaryTeacher = '5';
  state.salaryProjectId = '1';
  state.salaryDateFrom = '2026-09-11';
  state.salaryDateTo = '2026-10-10';
  controls.set('#salary-from', { value: '2026-09-01' });
  controls.set('#salary-to', { value: '2026-09-30' });
  let calls = 0;
  context.icubeApi = { applySalaryFilters() { calls += 1; } };
  context.applySalaryFilters();
  assert.equal(calls, 1);
  assert.equal(state.salaryDateFrom, '2026-09-11');
  assert.equal(state.salaryDateTo, '2026-10-10');
});

test('salary PDF uses the applied historical server report and ignores unapplied inputs', async () => {
  const source = await readFile(uiUrl, 'utf8');
  const { context, state, controls } = salaryContext(source);
  state.role = 'director';
  state.projects = [{ id: 1, name: 'iCubeRobots' }];
  state.teachers = [{ id: 5, name: 'Иванов Сергей', active: true }];
  state.salaryTeacher = '5';
  state.salaryProjectId = '1';
  state.salaryDateFrom = '2025-01-01';
  state.salaryDateTo = '2025-01-31';
  state.salaryReportRows = [reportRow()];
  state.salaryReportTotal = 900;
  state.lessons = [];
  controls.set('#salary-from', { value: '2025-02-01' });
  controls.set('#salary-to', { value: '2025-02-28' });

  let printed = '';
  context.open = () => ({
    document: { open() {}, write(value) { printed = value; }, close() {} },
    focus() {}, print() {},
  });
  context.printSalaryAppliedV122();

  assert.match(printed, /Период:<\/b> 01\.01\.2025 – 31\.01\.2025/);
  assert.match(printed, /Историческая группа/);
  assert.match(printed, /ДК «Океан»/);
  assert.match(printed, /iCube/);
  assert.match(printed, /Обычное занятие/);
  assert.match(printed, /900 ₽/);
  assert.doesNotMatch(printed, /01\.02\.2025/);
});

test('salary empty server report is a successful zero state and loading disables Apply/PDF', async () => {
  const source = await readFile(uiUrl, 'utf8');
  const { context, state } = salaryContext(source);
  state.role = 'director';
  state.teachers = [{ id: 5, name: 'Иванов Сергей', active: true }];
  state.salaryTeacher = '5';
  state.salaryReportRows = [];
  state.salaryReportTotal = 0;
  let html = context.salary();
  assert.match(html, /За выбранный период начислений нет/);
  assert.match(html, /Итого за период/);
  assert.match(html, /0 ₽/);

  state.salaryReportLoading = true;
  html = context.salary();
  assert.match(html, /Загрузка…/);
  assert.match(html, /onclick="printSalaryAppliedV122\(\)" disabled/);
});

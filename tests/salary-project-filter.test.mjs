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

test('salary project filter supports all, iCube, Zebra and totals only filtered rows', async () => {
  const source = await readFile(uiUrl, 'utf8');
  const { context, state } = salaryContext(source);
  state.projects = [
    { id: 1, name: 'iCubeRobots', active: true },
    { id: 2, name: 'Зебра', active: true },
  ];
  state.groups = [
    { id: 11, name: 'iCube группа', projectId: 1, project: 'iCubeRobots', siteId: 1 },
    { id: 22, name: 'Зебра группа', projectId: 2, project: 'Зебра', siteId: 2 },
  ];
  state.sites = [{ id: 1, name: 'Школа' }, { id: 2, name: 'Зебра' }];
  state.teachers = [{ id: 5, name: 'Иванов Сергей', active: true }];
  state.salaryTeacher = '5';
  state.salaryDateFrom = '2026-09-01';
  state.salaryDateTo = '2026-09-30';
  state.lessons = [
    { id: 101, date: '15.09.2026', time: '10:00–11:30', groupId: 11, projectId: 1, teacherId: 5, done: true, cancelled: false, emptyTrip: false, intro: false, attendance: { 1: true }, extras: [], salarySnapshot: { fix: 600, child: 100, intro: 600, empty: 300 } },
    { id: 102, date: '16.09.2026', time: '10:00–11:30', groupId: 22, projectId: 2, teacherId: 5, done: true, cancelled: false, emptyTrip: false, intro: false, attendance: { 1: true, 2: true }, extras: [], salarySnapshot: { fix: 600, child: 100, intro: 600, empty: 300 } },
  ];

  state.salaryProjectId = 'all';
  let html = context.salary();
  assert.match(html, /<option value="all" selected>Все<\/option>/);
  assert.match(html, />iCube<\/option>/);
  assert.match(html, />Зебра<\/option>/);
  assert.match(html, /iCube группа/);
  assert.match(html, /Зебра группа/);
  assert.match(html, /Итого за период/);
  assert.match(html, /1[^0-9]?500 ₽/);

  state.salaryProjectId = '1';
  html = context.salary();
  assert.match(html, /iCube группа/);
  assert.doesNotMatch(html, /Зебра группа/);
  assert.match(html, /700 ₽/);

  state.salaryProjectId = '2';
  html = context.salary();
  assert.doesNotMatch(html, /iCube группа/);
  assert.match(html, /Зебра группа/);
  assert.match(html, /800 ₽/);
});

test('salary project change updates default dates but Apply preserves manual dates', async () => {
  const source = await readFile(uiUrl, 'utf8');
  const { context, state, controls } = salaryContext(source);
  state.projects = [{ id: 1, name: 'iCubeRobots' }, { id: 2, name: 'Зебра' }];
  const from = { value: '2026-09-01' };
  const to = { value: '2026-09-18' };
  controls.set('#salary-from', from);
  controls.set('#salary-to', to);
  controls.set('#salary-teacher', { value: '5' });
  controls.set('#salary-project', { value: '1' });

  context.icubeSalaryDefaultPeriod = (name) => name === 'iCubeRobots'
    ? { from: '2026-09-11', to: '2026-10-10' }
    : { from: '2026-08-26', to: '2026-09-25' };

  context.setSalaryProjectDefaults('1');
  assert.equal(from.value, '2026-09-11');
  assert.equal(to.value, '2026-10-10');

  from.value = '2026-09-15';
  to.value = '2026-09-30';
  context.applySalaryFilters();
  assert.equal(state.salaryProjectId, '1');
  assert.equal(state.salaryDateFrom, '2026-09-15');
  assert.equal(state.salaryDateTo, '2026-09-30');
});

test('salary UI removes the two long explanatory notes and keeps PDF unimplemented', async () => {
  const source = await readFile(uiUrl, 'utf8');
  assert.doesNotMatch(source, /Пустой выезд считается отдельным начислением и не требует статуса «Проведено»/);
  assert.doesNotMatch(source, /Обычное занятие:[^\n]*Пустой выезд:[^\n]*Отменённое занятие без отметки «Пустой выезд» не оплачивается/);
  assert.doesNotMatch(source, /jspdf|pdfkit|print\(/i);
});

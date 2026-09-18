import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const moduleUrl = new URL('../src/frontend/context-help.mjs', import.meta.url);
const cssUrl = new URL('../src/ui/styles.css', import.meta.url);
const indexUrl = new URL('../index.html', import.meta.url);

test('context help covers director pages and entity cards', async () => {
  const { getContextHelp } = await import(moduleUrl);
  for (const page of ['dashboard','children','groups','calendar','payments','salary','stats','settings']) {
    assert.ok(getContextHelp('director', page), page);
  }
  for (const page of ['child','group','lesson']) assert.ok(getContextHelp('director', page), page);
});

test('partner gets project-scoped help and no director-only topics', async () => {
  const { getContextHelp } = await import(moduleUrl);
  for (const page of ['dashboard','children','groups','calendar','payments','refunds','balances','teachers','sites','salary','settlements']) {
    assert.ok(getContextHelp('partner', page), page);
  }
  for (const page of ['partner','stats','settings']) assert.equal(getContextHelp('partner', page), null, page);
  const salary = JSON.stringify(getContextHelp('partner', 'salary'));
  assert.match(salary, /Проект определяется вашей учётной записью/);
  assert.doesNotMatch(salary, /Директор выбирает проект/);
});

test('teacher help covers Today, Calendar and Lesson only', async () => {
  const { getContextHelp } = await import(moduleUrl);
  for (const page of ['teacherToday','teacherCalendar','teacherLesson']) assert.ok(getContextHelp('teacher', page), page);
  assert.equal(getContextHelp('teacher', 'payments'), null);
  assert.equal(getContextHelp('teacher', 'children'), null);
});

test('role-specific help contains the important current CRM rules', async () => {
  const { getContextHelp } = await import(moduleUrl);
  const directorSalary = JSON.stringify(getContextHelp('director', 'salary'));
  assert.match(directorSalary, /«Все», «iCube» или «Зебра»/);
  assert.match(directorSalary, /Печать \/ PDF/);
  assert.match(directorSalary, /старого периода/);
  assert.match(directorSalary, /Старые начисления/);

  const child = JSON.stringify(getContextHelp('director', 'child'));
  assert.match(child, /Физически удалить ребёнка можно только если у него нет/);
  assert.match(child, /бизнес-истории/);

  const site = JSON.stringify(getContextHelp('director', 'sites'));
  assert.match(site, /связанных групп/);
  assert.match(site, /исторических занятий/);

  const teacher = JSON.stringify(getContextHelp('director', 'teachers'));
  assert.match(teacher, /Группы, занятия, зарплата, учётная запись/);
  assert.match(teacher, /неактивным/);

  const group = JSON.stringify(getContextHelp('director', 'group'));
  assert.match(group, /Физическое удаление/);
  assert.match(group, /без занятий, участников и другой бизнес-истории/);

  const settlements = JSON.stringify(getContextHelp('partner', 'settlements'));
  assert.match(settlements, /Наличные/);
  assert.match(settlements, /К получению от iCube/);
  assert.match(settlements, /К переводу в iCube/);

  const settings = JSON.stringify(getContextHelp('director', 'settings'));
  assert.match(settings, /историческую версию/);
  assert.match(settings, /Сохранить цены/);
  assert.match(settings, /Сохранить ставки/);
  assert.match(settings, /Сохранить условия/);
  assert.match(settings, /ровно 100%/);

  const lesson = JSON.stringify(getContextHelp('teacher', 'teacherLesson'));
  for (const phrase of ['Начать занятие','посещаемость','ознакомительное посещение','добавить','нового ребёнка','Завершить занятие']) {
    assert.match(lesson.toLowerCase(), new RegExp(phrase.toLowerCase()), phrase);
  }
});

test('unknown page has no help content', async () => {
  const { getContextHelp } = await import(moduleUrl);
  assert.equal(getContextHelp('director', 'somethingUnknown'), null);
  assert.equal(getContextHelp('unknownRole', 'dashboard'), null);
});

test('help modal has four practical sections and temporary teacher notice', async () => {
  const { getContextHelp, renderContextHelpHtml } = await import(moduleUrl);
  const html = renderContextHelpHtml(getContextHelp('teacher', 'teacherLesson'), { temporaryTeacher: true });
  for (const title of ['Что здесь можно делать','Как пользоваться','Важные правила','Если что-то не получается']) assert.match(html, new RegExp(title));
  assert.match(html, /Сейчас вы просматриваете интерфейс преподавателя/);
});

test('open and close help leave page state unchanged and Escape closes it', async () => {
  const mod = await import(moduleUrl);
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalMutationObserver = globalThis.MutationObserver;

  class ClassList {
    constructor() { this.values = new Set(); }
    add(value) { this.values.add(value); }
    remove(value) { this.values.delete(value); }
    contains(value) { return this.values.has(value); }
  }
  class Element {
    constructor(className = '') {
      this.className = className;
      this.dataset = {};
      this.classList = new ClassList();
      this.listeners = {};
      this.parentElement = null;
      this.children = [];
      this._html = '';
    }
    set innerHTML(value) { this._html = String(value); }
    get innerHTML() { return this._html; }
    addEventListener(type, handler) { this.listeners[type] = handler; }
    appendChild(child) { child.parentElement = this; this.children.push(child); if (this === body) backdrop = child; return child; }
    querySelector(selector) {
      if (selector === '.context-help-close' || selector === '.context-help-done') {
        const child = new Element(selector.slice(1));
        child.focus = () => {};
        return child;
      }
      return null;
    }
    querySelectorAll() { return []; }
    remove() { if (this === backdrop) backdrop = null; }
  }

  let backdrop = null;
  const body = new Element('body');
  body.classList = new ClassList();
  const app = new Element('app');
  const listeners = {};
  const pageState = { role: 'director', page: 'salary', authUser: { roles: ['director'] } };
  globalThis.window = { icubeLegacy: { state: pageState } };
  globalThis.document = {
    body,
    activeElement: { focus() {} },
    createElement: () => new Element(),
    querySelector(selector) {
      if (selector === '#app') return app;
      if (selector === '.context-help-backdrop') return backdrop;
      return null;
    },
    querySelectorAll() { return []; },
    addEventListener(type, handler) { listeners[type] = handler; },
  };
  globalThis.MutationObserver = class { observe() {} };

  try {
    mod.installContextHelp();
    assert.equal(mod.openContextHelp(), true);
    assert.equal(pageState.page, 'salary');
    assert.ok(backdrop);
    assert.match(backdrop.innerHTML, /Зарплата — справка/);
    listeners.keydown({ key: 'Escape' });
    assert.equal(backdrop, null);
    assert.equal(pageState.page, 'salary');

    assert.equal(mod.openContextHelp(), true);
    mod.closeContextHelp();
    assert.equal(backdrop, null);
    assert.equal(pageState.page, 'salary');
  } finally {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    globalThis.MutationObserver = originalMutationObserver;
  }
});

test('context help is static frontend content with accessible button and no API calls', async () => {
  const source = await readFile(moduleUrl, 'utf8');
  assert.match(source, /state\?\.role/);
  assert.match(source, /state\?\.page/);
  assert.match(source, /role="dialog" aria-modal="true"/);
  assert.match(source, /aria-label', 'Справка по странице'/);
  assert.match(source, /aria-label="Закрыть справку"/);
  assert.match(source, /event\.key === 'Escape'/);
  assert.doesNotMatch(source, /fetch\(|ApiClient|api\.request|api\.list|salary-accruals/);
  assert.doesNotMatch(source, /if\s*\(\s*title\s*===/);
});

test('context help module is loaded and mobile modal CSS is responsive', async () => {
  const index = await readFile(indexUrl, 'utf8');
  const css = await readFile(cssUrl, 'utf8');
  assert.match(index, /src\/frontend\/context-help\.mjs/);
  assert.ok(index.indexOf('context-help.mjs') > index.indexOf('direction-price-settings.mjs'));
  assert.match(css, /\.context-help-modal\{[^}]*max-height:80vh/);
  assert.match(css, /@media\(max-width:760px\)[\s\S]*?\.context-help-modal\{[^}]*max-height:85dvh/);
  assert.match(css, /overflow-y:auto/);
  assert.match(css, /body\.context-help-open\{overflow:hidden/);
});

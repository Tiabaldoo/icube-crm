import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('child search matches card fields instantly with normalized tokens and exact class numbers', async () => {
  const source = await readFile(new URL('../src/frontend/crm-ui.js', import.meta.url), 'utf8');
  const app = { innerHTML: '' };
  const rows = [1, 2, 3].map((childId) => ({ dataset: { childId: String(childId) }, style: {} }));
  const document = {
    body: { style: {}, classList: { add() {}, remove() {}, contains() { return false; } } },
    documentElement: { style: {} }, head: { appendChild() {} },
    getElementById(id) { return id === 'app' ? app : null; },
    createElement() { return { style: {}, appendChild() {} }; },
    querySelector(selector) { return selector === '#app' ? app : null; },
    querySelectorAll(selector) { return selector === '#childRows .row.clickable' ? rows : []; },
    addEventListener() {},
  };
  const context = vm.createContext({ console, document, alert() {}, requestAnimationFrame(callback) { callback(); },
    setTimeout() { return 0; }, clearTimeout() {}, scrollTo() {}, addEventListener() {},
    MutationObserver: class { observe() {} disconnect() {} } });
  context.window = context;
  context.globalThis = context;
  vm.runInContext(`${source}\n;globalThis.probe={state,children,filterRows,childMatchesSearch};`, context);
  const children = [
    { id: 1, name: 'Иванов Артём', parent: 'Мария Петрова', phone: '+7 (924) 18-00-00',
      school: 'Школа №1', grade: '2А', status: 'Активный', enrollments: [] },
    { id: 2, name: 'Пётр Кодеров', parent: 'Анна Иванова', phone: '8 (914) 55-00-00',
      school: 'ДК Новотроицкое', grade: '12', status: 'Лид', enrollments: [] },
    { id: 3, name: 'Ёлкин Фёдор', parent: 'Ольга', phone: '',
      school: 'Садовая', grade: '3Б', status: 'Пауза', enrollments: [] },
  ];
  context.probe.state.children = children;
  context.probe.state.childProjectFilter = 'all';
  context.probe.state.childStatusFilter = 'all';
  context.probe.state.childDirectionFilter = 'all';
  const matches = (id, query) => context.probe.childMatchesSearch(children.find((child) => child.id === id), query);
  for (const query of ['иванов', 'ПЕТРОВА', '892418', 'школа1', 'школа 1', '2а', 'иванов школа1']) {
    assert.equal(matches(1, query), true, query);
  }
  for (const query of ['дк', 'дк ново', 'новотроиц']) assert.equal(matches(2, query), true, query);
  assert.equal(matches(3, 'елкин'), true, 'ё и е равнозначны');
  assert.equal(matches(1, '2'), true);
  assert.equal(matches(2, '2'), false, 'класс 12 не совпадает с запросом 2');
  assert.equal(matches(2, 'иванов школа1'), false, 'каждый токен должен найтись в одной карточке');
  context.probe.state.childSearch = 'иванов школа1';
  const html = context.probe.children();
  assert.match(html, /data-child-id="1"(?! style="display:none")/);
  assert.match(html, /data-child-id="2" style="display:none"/);
  context.probe.filterRows('дк ново');
  assert.deepEqual(rows.map((row) => row.style.display), ['none', 'grid', 'none']);
  context.probe.state.childSearch = '';
  context.probe.state.childStatusFilter = 'Лид';
  assert.match(context.probe.children(), /Пётр Кодеров/);
  assert.doesNotMatch(context.probe.children(), /Иванов Артём/);
});

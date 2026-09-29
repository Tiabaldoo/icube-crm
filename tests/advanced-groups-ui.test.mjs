import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { groupScheduleLabel, installAdvancedGroupUi } from '../src/frontend/advanced-groups.mjs';
import { installQuickStatusUi } from '../src/frontend/quick-status.mjs';

const crmSource = await readFile(new URL('../src/frontend/crm-ui.js', import.meta.url), 'utf8');
const apiSource = await readFile(new URL('../src/frontend/api-sync.mjs', import.meta.url), 'utf8');
const group = { id: 10, name: 'Сохранённое имя', direction: 'Программирование', active: true, project: 'Зебра', siteId: 2, teacherId: 4,
  day: 'Понедельник', startTime: '15:30', endTime: '16:15', startDate: '2026-01-01', scheduleSlots: [] };

function groupUi(extra = {}, role = 'director') {
  const app = { innerHTML: '' };
  const document = { body: { style: {}, classList: { add() {}, remove() {}, contains() { return false; } } }, documentElement: { style: {} },
    head: { appendChild() {} }, getElementById: (id) => id === 'app' ? app : null, createElement: () => ({ style: {}, appendChild() {} }),
    querySelector: (selector) => selector === '#app' ? app : null, querySelectorAll: () => [], addEventListener() {} };
  const context = vm.createContext({ document, console, alert() {}, requestAnimationFrame: (fn) => fn(), setTimeout: () => 0, clearTimeout() {},
    scrollTo() {}, addEventListener() {}, MutationObserver: class { observe() {} disconnect() {} } });
  context.window = context; context.globalThis = context;
  vm.runInContext(crmSource, context);
  Object.assign(context.icubeLegacy.state, { role, groups: [{ ...group, ...extra }], children: [],
    sites: [{ id: 2, name: 'Зебра' }], teachers: [{ id: 4, name: 'Преподаватель' }], selectedGroup: 10 });
  installQuickStatusUi(context.icubeLegacy, context, document);
  installAdvancedGroupUi(context.icubeLegacy, context, document);
  return context;
}

test('ordinary group card keeps its existing title and stored name', () => {
  const ui = groupUi();
  assert.match(ui.groups(), /<h3[^>]*>Зебра · Пн 15:30<\/h3>/);
  assert.doesNotMatch(ui.groups(), />Индивидуальная</);
  assert.equal(ui.icubeLegacy.state.groups[0].name, 'Сохранённое имя');
});
test('individual badge uses existing style beside project and direction; quick status still works for both roles', () => {
  for (const role of ['director', 'partner']) {
    const ui = groupUi({ isIndividual: true }, role);
    assert.match(ui.groups(), /badge purple">Программирование<\/span>[\s\S]*badge purple">Зебра<\/span>[\s\S]*badge purple">Индивидуальная<\/span>/);
    assert.match(ui.group(), /quick-status-badge[^>]*onclick="icubeQuickGroupStatus\(10,this\)"/);
  }
});
test('primary and extra weekly slots both appear in the group card title', () => {
  const ui = groupUi({ scheduleSlots: [{ weekday: 5, startTime: '15:30', endTime: '16:15' }] });
  assert.match(ui.groups(), /<h3[^>]*>Зебра · Пн 15:30 · Пт 15:30<\/h3>/);
  assert.equal(ui.groupTitle(ui.icubeLegacy.state.groups[0]), 'Зебра · Пн 15:30', 'calendar/general title remains unchanged');
  assert.equal(ui.icubeLegacy.state.groups[0].name, 'Сохранённое имя');
});
test('three slots sort by weekday and then start time without mutating the stored schedule', () => {
  const extra = [{ weekday: 5, startTime: '15:30', endTime: '16:15' }, { weekday: 3, startTime: '15:30', endTime: '16:15' }];
  const ui = groupUi({ scheduleSlots: extra });
  assert.match(ui.groups(), /Зебра · Пн 15:30 · Ср 15:30 · Пт 15:30<\/h3>/);
  assert.equal(groupScheduleLabel({ ...group, day: 'Среда', scheduleSlots: [extra[0], { weekday: 3, startTime: '10:00' }] }), 'Ср 10:00 · Ср 15:30 · Пт 15:30');
  assert.deepEqual(ui.icubeLegacy.state.groups[0].scheduleSlots, extra);
  const mixed = groupUi({ isMixed: true, direction: 'Смешанная', scheduleSlots: extra });
  assert.match(mixed.groups(), /badge mixed">Смешанная/);
  assert.match(mixed.groups(), /Зебра · Пн 15:30 · Ср 15:30 · Пт 15:30/);
});

const customGroups = [
  { groupId: '10', groupName: 'Сохранённое имя', visits: 6, gross: '4950.00', teacher: '1650.00', partner: '1650.00', tax: '0.00', icube: '1650.00' },
  { groupId: '11', groupName: 'Вторая группа', visits: 1, gross: '825.00', teacher: '275.00', partner: '275.00', tax: '0.00', icube: '275.00' },
];
function settlementUi(custom = []) {
  const result = { projectName: 'Зебра', partnerName: 'Партнёр', periodFrom: '2026-09-01', periodTo: '2026-09-30',
    paymentsAmount: '6600.00', refundsAmount: '825.00', incomeAmount: '4950.00', salaryAmount: '1650.00', taxAmount: '0.00', taxPercent: '4.000',
    distributableAmount: '3300.00', icubeShareAmount: '1650.00', partnerShareAmount: '1650.00', icubePercent: '40.000', partnerPercent: '60.000',
    cashHeldByPartner: '825.00', transferAmount: '825.00', customGroups: structuredClone(custom) };
  const context = vm.createContext({ legacy: { state: { partnerSettlement: result, groups: [{ ...group, scheduleSlots: [{ weekday: 5, startTime: '15:30' }] },
    { ...group, id: 11, direction: 'Робототехника' }] } }, html: String, isoToRu: String, displayMoney: (value) => `${value} ₽`, groupScheduleLabel });
  vm.runInContext(apiSource.slice(apiSource.indexOf('function settlementContent'), apiSource.indexOf('function partnerPage')), context);
  return { context, result };
}
test('empty customGroups renders no individual calculation wrapper', () => {
  const { context } = settlementUi();
  assert.doesNotMatch(context.settlementContent(), /Расчёт индивидуальных групп|<details/);
});
test('custom groups render inside one closed details wrapper with direction and all slots', () => {
  const { context } = settlementUi(customGroups);
  const output = context.settlementContent();
  assert.equal((output.match(/<details\b/g) ?? []).length, 1);
  assert.match(output, /<details class="advanced-group-settings"><summary>Расчёт индивидуальных групп · 2<\/summary>/);
  assert.doesNotMatch(output, /<details[^>]*\bopen\b/);
  assert.match(output, /Программирование · Пн 15:30 · Пт 15:30/);
  assert.match(output, /Робототехника · Пн 15:30/);
});
test('collapsed details retain every existing custom field and server amount for every group', () => {
  const { context } = settlementUi(customGroups);
  const details = context.settlementContent().match(/<details\b[\s\S]*?<\/details>/)[0];
  for (const label of ['Посещений','Заработанная стоимость','Преподавателю','Партнёру','Налог','iCube']) assert.equal(details.split(`<span>${label}</span>`).length - 1, 2);
  for (const item of customGroups) {
    assert.ok(details.includes(`<b>${item.visits}</b>`));
    for (const field of ['gross','teacher','partner','tax','icube']) assert.ok(details.includes(`<b>${item[field]} ₽</b>`));
  }
});
test('director and partner settlement totals are unchanged by the custom details wrapper', () => {
  const { context, result } = settlementUi(customGroups); const before = structuredClone(result);
  for (const partnerView of [false, true]) {
    const output = context.settlementContent({ partnerView });
    assert.match(output, /<span>Доля партнёра<\/span><b>1650\.00 ₽<\/b>/);
    assert.match(output, /<span>Наличные у партнёра<\/span><b>825\.00 ₽<\/b>/);
    assert.match(output, partnerView ? /К получению/ : /Перевести партнёру/);
    assert.match(output, /partner-final-pay[\s\S]*<b>825 ₽<\/b>/);
    assert.deepEqual(result, before);
  }
});

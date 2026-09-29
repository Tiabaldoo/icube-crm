import { parentGroupDisplayName, parentScheduleCalendar } from '../src/frontend/parent-portal.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { groupDisplayName, groupRegularScheduleLabel, groupScheduleLabel, installAdvancedGroupUi } from '../src/frontend/advanced-groups.mjs';
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
  assert.match(ui.groups(), /<h3[^>]*>Программирование · Пн 15:30<\/h3>/);
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
  assert.match(ui.groups(), /<h3[^>]*>Программирование · Пн 15:30 · Пт 15:30<\/h3>/);
  assert.equal(ui.groupTitle(ui.icubeLegacy.state.groups[0]), 'Программирование · Пн 15:30 · Пт 15:30', 'general title uses the same helper');
  assert.equal(ui.icubeLegacy.state.groups[0].name, 'Сохранённое имя');
});
test('three slots sort by weekday and then start time without mutating the stored schedule', () => {
  const extra = [{ weekday: 5, startTime: '15:30', endTime: '16:15' }, { weekday: 3, startTime: '15:30', endTime: '16:15' }];
  const ui = groupUi({ scheduleSlots: extra });
  assert.match(ui.groups(), /Программирование · Пн 15:30 · Ср 15:30 · Пт 15:30<\/h3>/);
  assert.equal(groupScheduleLabel({ ...group, day: 'Среда', scheduleSlots: [extra[0], { weekday: 3, startTime: '10:00' }] }), 'Ср 10:00 · Ср 15:30 · Пт 15:30');
  assert.deepEqual(ui.icubeLegacy.state.groups[0].scheduleSlots, extra);
  const mixed = groupUi({ isMixed: true, direction: 'Смешанная', scheduleSlots: extra });
  assert.match(mixed.groups(), /badge mixed">Смешанная/);
  assert.match(mixed.groups(), /Смешанная · Пн 15:30 · Ср 15:30 · Пт 15:30/);
});

test('group schedule card has a dedicated spacing class after the upper cards', () => {
  const ui = groupUi({ scheduleSlots: [{ weekday: 3, startTime: '16:15', endTime: '17:00' }] });
  assert.match(ui.group(), /<\/div><div class="card pad group-schedule-card"><b>Расписание группы<\/b>/);
  assert.doesNotMatch(groupUi().group(), /group-schedule-card/);
});
function lessonUi(extra = {}) {
  const ui = groupUi({ name: 'Программирование · Пн 15:30', ...extra });
  Object.assign(ui.icubeLegacy.state, { selectedLesson: 20, lessons: [{ id: 20, groupId: 10, teacherId: 4, date: '30.09.2026',
    time: '15:30–16:15', attendance: {}, extras: [], photos: {}, trialChildren: {}, started: false, done: false, cancelled: false }] });
  return ui;
}
test('single-slot lesson group line retains its previous display title', () => {
  const ui = lessonUi();
  assert.match(ui.lesson(), /<span>Группа<\/span><b>Программирование · Пн 15:30<\/b>/);
  assert.equal(ui.icubeLegacy.state.groups[0].name, 'Программирование · Пн 15:30');
});
test('multi-slot lesson group line uses every slot via the shared schedule helper', () => {
  const ui = lessonUi({ scheduleSlots: [{ weekday: 3, startTime: '16:15', endTime: '17:00' }] });
  assert.match(ui.lesson(), /<span>Группа<\/span><b>Программирование · Пн 15:30 · Ср 16:15<\/b>/);
  assert.equal(ui.icubeLegacy.state.groups[0].name, 'Программирование · Пн 15:30');
  assert.equal(ui.groupTitle(ui.icubeLegacy.state.groups[0]), 'Программирование · Пн 15:30 · Ср 16:15', 'calendar title uses the same helper');
});
test('lesson group title sorts three slots by weekday and then time without changing stored data', () => {
  const slots = [{ weekday: 5, startTime: '15:30', endTime: '16:15' }, { weekday: 3, startTime: '10:00', endTime: '10:45' }];
  const ui = lessonUi({ day: 'Среда', startTime: '16:15', endTime: '17:00', scheduleSlots: slots });
  assert.match(ui.lesson(), /<span>Группа<\/span><b>Программирование · Ср 10:00 · Ср 16:15 · Пт 15:30<\/b>/);
  assert.deepEqual(ui.icubeLegacy.state.groups[0].scheduleSlots, slots);
});
test('schedule spacing is a global card rule with no breakpoint-specific or inline override', async () => {
  const css = await readFile(new URL('../src/ui/styles.css', import.meta.url), 'utf8');
  assert.match(css, /^\.group-schedule-card\{margin-top:16px\}/m);
  assert.equal((css.match(/\.group-schedule-card\{/g) ?? []).length, 1);
  const source = await readFile(new URL('../src/frontend/advanced-groups.mjs', import.meta.url), 'utf8');
  assert.match(source, /<div class="card pad group-schedule-card"><b>Расписание группы/);
  assert.doesNotMatch(source, /class="card pad group-schedule-card" style=/);
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
    { ...group, id: 11, direction: 'Робототехника' }] } }, html: String, isoToRu: String, displayMoney: (value) => `${value} ₽`, groupScheduleLabel, groupDisplayName });
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

const extraSlot = { weekday: 3, startTime: '16:15', endTime: '17:00' };
test('common display helper handles single, multiple and sorted equal-weekday slots without changing stored name', () => {
  assert.equal(groupDisplayName(group), 'Программирование · Пн 15:30');
  const multi = { ...group, scheduleSlots: [extraSlot] };
  assert.equal(groupDisplayName(multi), 'Программирование · Пн 15:30 · Ср 16:15');
  const three = { ...group, day: 'Среда', startTime: '16:15', scheduleSlots: [{ weekday: 5, startTime: '15:30' }, { weekday: 3, startTime: '10:00' }] };
  const before = structuredClone(three);
  assert.equal(groupDisplayName(three), 'Программирование · Ср 10:00 · Ср 16:15 · Пт 15:30');
  assert.deepEqual(three, before);
});

test('group page regular schedule shows all slots, single-slot punctuation is unchanged', () => {
  const ui = groupUi({ scheduleSlots: [extraSlot] });
  assert.match(ui.group(), /Регулярное расписание<\/span><b>Понедельник 15:30–16:15 · Среда 16:15–17:00<\/b>/);
  assert.match(groupUi().group(), /Регулярное расписание<\/span><b>Понедельник, 15:30–16:15<\/b>/);
  assert.equal(groupRegularScheduleLabel(group), 'Понедельник, 15:30–16:15');
});

test('child overview, breadcrumb, mobile/desktop list and enrollment dropdown use complete group title', () => {
  const ui = groupUi({ scheduleSlots: [extraSlot] });
  const state = ui.icubeLegacy.state;
  state.selectedChild = 30; state.childTab = 'overview';
  state.children = [{ id: 30, name: 'Тестовый Ребёнок', status: 'Активный', school: 'Школа', grade: '3', parent: 'Родитель',
    enrollments: [{ id: 40, direction: 'Программирование', directionId: 2, project: 'Зебра', groupId: 10, effectiveGroupId: 10, status: 'Активный', balance: 4, individualPrice: null, groupName: 'Устаревшее имя' }] }];
  const title = 'Программирование · Пн 15:30 · Ср 16:15';
  assert.ok(ui.child().includes(title));
  assert.ok(ui.children().includes(title));
  assert.doesNotMatch(ui.children(), /Устаревшее имя/);
  ui.enrollmentForm(30, 'Программирование');
  const select = { innerHTML: '' };
  ui.document.querySelector = (selector) => selector === '#ef-group' ? select : selector === '#ef-dir' ? { value: 'Программирование' } : null;
  ui.refreshEnrollmentGroups(10);
  assert.match(select.innerHTML, /<option value="10"[^>]*>Программирование · Пн 15:30 · Ср 16:15<\/option>/);
  assert.equal(state.groups[0].name, 'Сохранённое имя');
});

test('teacher lesson and today list show complete group title while keeping actual occurrence time', () => {
  const ui = lessonUi({ scheduleSlots: [extraSlot] });
  const state = ui.icubeLegacy.state;
  state.role = 'teacher'; state.teacherId = 4;
  assert.match(ui.teacherLesson(), /Программирование · Пн 15:30 · Ср 16:15/);
  const lesson = state.lessons[0];
  ui.sharedCalendarEvents = () => [{ key: '20', groupId: 10, teacherId: 4, date: lesson.date, time: '18:00–18:45', lesson }];
  assert.match(ui.teacherToday(), /Программирование · Пн 15:30 · Ср 16:15/);
  assert.match(ui.teacherToday(), /teacher-time">18:00</);
});

test('display reads no longer access raw group names in classic UI or local multi-slot title builders', () => {
  // The first hidden prototype render runs before modules install the shared helper.
  const bootstrap = 'function groupTitle(g){return g ? g.name : \'Без группы\';}';
  assert.ok(crmSource.includes(bootstrap));
  assert.doesNotMatch(crmSource.replace(bootstrap, '').replace("if (!g.day && !g.weekday) return g.name || 'Без группы';", ''), /\b(?:g|group|x\.group|item\.group)\??\.name\b/);
  assert.doesNotMatch(apiSource, /\$\{current\.direction\} · \$\{groupScheduleLabel/);
  assert.doesNotMatch(crmSource, /icubeAdvancedGroups\?\.(?:cardTitle|lessonTitle)/);
});


test('parent calendar and about labels use complete schedule through the common helper, including moved actual time', () => {
  const enrollment = { groupId: '10', group: 'Программирование · Пн 15:30', direction: 'Программирование',
    schedule: 'Понедельник, 15:30–16:15; Среда, 16:15–17:00' };
  assert.equal(parentGroupDisplayName(enrollment), 'Программирование · Пн 15:30 · Ср 16:15');
  assert.equal(parentGroupDisplayName({ groupId: '10', group: enrollment.group }, [enrollment]), 'Программирование · Пн 15:30 · Ср 16:15');
  const output = parentScheduleCalendar([{ id: '1', groupId: '10', group: parentGroupDisplayName(enrollment), startsAt: '2026-09-30 18:00:00', endsAt: '2026-09-30 18:45:00', moved: true, status: 'scheduled' }], '2026-09-30');
  assert.match(output, /18:00 · Программирование · Пн 15:30 · Ср 16:15/);
  assert.match(output, /Перенесено/);
  const single = { ...enrollment, schedule: 'Понедельник, 15:30–16:15' };
  assert.equal(parentGroupDisplayName(single), 'Программирование · Пн 15:30');
});


test('parent attendance renders a multi-slot group title once, without a direction prefix', async () => {
  const source = await readFile(new URL('../src/frontend/parent-portal.mjs', import.meta.url), 'utf8');
  const renderer = source.slice(source.indexOf('function attendanceHtml('), source.indexOf('export function paymentsHtml'));
  const context = vm.createContext({ parentGroupDisplayName, escapeHtml: String, dateRu: String, empty: String });
  vm.runInContext(renderer, context);
  const output = context.attendanceHtml([{ direction: 'Программирование', group: 'Программирование · Пн 15:30',
    schedule: 'Понедельник, 15:30–16:15; Среда, 16:15–17:00', startsAt: '2026-09-30 16:15:00', trial: false }]);
  assert.match(output, /<span>Программирование · Пн 15:30 · Ср 16:15<\/span>/);
  assert.doesNotMatch(output, /Программирование · Программирование/);
  assert.doesNotMatch(renderer, /escapeHtml\(row\.direction\)/);
});

test('UI display helpers and their groupTitle alias have no adjacent manual direction prefix', async () => {
  const parentSource = await readFile(new URL('../src/frontend/parent-portal.mjs', import.meta.url), 'utf8');
  const templatePrefix = /\$\{(?:html|escapeHtml)\([^}]*\.direction(?:Name)?\)\} · \$\{(?:html|escapeHtml)\((?:groupDisplayName|displayGroup|parentGroupDisplayName)\(/;
  assert.doesNotMatch(parentSource, templatePrefix);
  assert.doesNotMatch(apiSource, templatePrefix);
  assert.doesNotMatch(crmSource, /esc\([^)]*\.direction\)\+' · '\+esc\(groupTitle\(/);
});

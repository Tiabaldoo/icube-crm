import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { groupBalanceBadges, installQuickStatusUi } from '../src/frontend/quick-status.mjs';

for (const [balance, color] of [['4', 'green'], ['2', 'green'], ['1', 'amber'], ['0', 'red'], ['-1', 'red'], ['1.23333333', 'amber']]) {
  test(`group balance ${balance}: exact value and ${color}`, () => {
    const child = { enrollments: [{ groupId: 999, balance: 99 }, { groupId: 10, direction: 'Программирование', balanceText: balance }] };
    const before = JSON.stringify(child); const html = groupBalanceBadges(child, 10);
    assert.match(html, new RegExp(`badge ${color} group-balance-badge`));
    assert.ok(html.includes(`>${balance}</span>`)); assert.doesNotMatch(html, /99<|занятий|осталось/);
    assert.equal(JSON.stringify(child), before);
  });
}
test('mixed group shows pinned enrollments independently, never first enrollment or sum', () => {
  const html = groupBalanceBadges({ enrollments: [{ groupId: 20, direction: 'Робототехника', balance: 8 },
    { groupId: 10, direction: 'Программирование', balanceText: '3.64444444' }] }, 10);
  assert.match(html, /title="Программирование">3.64444444/); assert.doesNotMatch(html, /Робототехника|>8</);
});
function fixture(statusBadge = (s) => ({ Лид: 'blue', Активный: 'green', Пауза: 'amber', Закончил: 'gray' })[s]) {
  const fields = new Map(); const saves = []; const listeners = {}; const roots = [];
  const state = { role: 'director', selectedChild: 8, selectedGroup: 10,
    children: [{ id: 8, status: 'Активный' }], groups: [{ id: 10, active: true }] };
  let forms = 0; let changed = 0;
  const document = { documentElement: {}, body: { append(root) { roots.push(root); } },
    querySelector(s) { return fields.get(s); }, addEventListener(name, fn) { listeners[name] = fn; },
    createElement() {
      const root = { style: {}, buttons: [], setAttribute() {},
        set innerHTML(value) { this.html = value; this.buttons = [...value.matchAll(/data-quick-status="([^"]+)"/g)].map((m) => ({ dataset: { quickStatus: m[1] }, focus() {} })); },
        get innerHTML() { return this.html; },
        addEventListener(_type, fn) { this.click = fn; }, getBoundingClientRect() { return { width: 160, height: 192 }; },
        querySelectorAll() { return this.buttons; }, querySelector() { return this.buttons[0]; },
        contains(target) { return target === this; }, remove() { this.removed = true; },
      }; return root;
    } };
  const host = { innerWidth: 360, innerHeight: 640,
    child() { return `<span class="badge green">${state.children[0].status}</span>`; }, group() { return '<span class="badge green">Активна</span>'; },
    childForm() { forms++; }, groupForm() {
      forms++;
      const modal = { classList: new Set() };
      fields.set('#gf-end-date-wrap', { classList: new Set(), closest: () => modal, scrollIntoView() {} });
      fields.set('.modal', modal);
      fields.set('#gf-end-date', { focus() { this.focused = true; } });
      fields.set('#gf-active', { value: 'true', onchange() { changed++; } });
    },
    icubeApi: { async saveChild(id, options) { saves.push(['child', id, options]); state.children[0].status = options.status; return { id }; },
      async saveGroup(id, options) { saves.push(['group', id, options]); state.groups[0].active = options.active; return { id }; } } };
  const childForm = host.childForm; const groupForm = host.groupForm;
  installQuickStatusUi({ state, statusBadge }, host, document);
  const anchor = { getBoundingClientRect: () => ({ left: 320, bottom: 620 }) };
  async function choose(value) { roots.at(-1).click({ target: { closest: () => ({ dataset: { quickStatus: value } }) } }); await new Promise((resolve) => setImmediate(resolve)); }
  return { state, host, fields, saves, roots, anchor, listeners, choose, childForm, groupForm, get forms() { return forms; }, get changed() { return changed; } };
}
test('child popover uses the real CRM lexical helper through its bridge, not window.statusBadge', async () => {
  const source = await readFile(new URL('../src/frontend/crm-ui.js', import.meta.url), 'utf8');
  const context = vm.createContext({ state: {}, effectivePrice() {}, pageHead() {} });
  context.window = context;
  vm.runInContext(source.match(/^const statusBadge=.*$/m)[0] + '\n' + source.match(/^window.icubeLegacy = .*$/m)[0], context);
  assert.equal(context.statusBadge, undefined);
  assert.equal(typeof context.icubeLegacy.statusBadge, 'function');
  const f = fixture(context.icubeLegacy.statusBadge);
  assert.equal(f.host.statusBadge, undefined);
  f.host.icubeQuickChildStatus(8, f.anchor);
  assert.equal(f.roots.length, 1);
  for (const [color, label] of [['blue', 'Лид'], ['green', 'Активный'], ['amber', 'Пауза'], ['gray', 'Закончил']]) {
    assert.match(f.roots[0].innerHTML, new RegExp(`class="badge ${color}"[^>]*>${label}`));
  }
  await f.choose('Пауза');
  assert.deepEqual(f.saves, [['child', 8, { status: 'Пауза' }]]);
  assert.equal(f.roots[0].removed, true);
});
test('child badge opens compact colored popover; immediate save delegates and updates badge without a form', async () => {
  const f = fixture(); assert.match(f.host.child(), /icubeQuickChildStatus\(8,this\)/);
  f.host.icubeQuickChildStatus(8, f.anchor);
  const root = f.roots[0]; assert.match(root.innerHTML, /badge blue/); assert.match(root.innerHTML, /badge amber/);
  assert.doesNotMatch(root.innerHTML, /Сохранить|Отмена|form-grid/); assert.equal(root.buttons.length, 4);
  assert.equal(root.style.left, '192px'); assert.equal(root.style.top, '440px');
  await f.choose('Пауза'); assert.deepEqual(f.saves, [['child', 8, { status: 'Пауза' }]]);
  assert.equal(root.removed, true); assert.equal(f.forms, 0);
  assert.match(f.host.child(), /icubeQuickChildStatus\(8,this\)[\s\S]*Пауза/);
  assert.equal(f.host.childForm, f.childForm);
});
test('same status closes without saving; outside click and Escape close the popover', async () => {
  const f = fixture(); f.host.icubeQuickChildStatus(8, f.anchor); await f.choose('Активный');
  assert.equal(f.saves.length, 0); assert.equal(f.roots[0].removed, true);
  f.host.icubeQuickChildStatus(8, f.anchor); f.listeners.click({ target: { closest: () => null } }); assert.equal(f.roots[1].removed, true);
  f.host.icubeQuickChildStatus(8, f.anchor); f.listeners.keydown({ key: 'Escape' }); assert.equal(f.roots[2].removed, true);
});
test('group popover activation saves immediately; deactivation opens unchanged existing date flow', async () => {
  const f = fixture(); assert.match(f.host.group(), /icubeQuickGroupStatus\(10,this\)/);
  f.state.groups[0].active = false; f.host.icubeQuickGroupStatus(10, f.anchor); assert.equal(f.roots[0].buttons.length, 2);
  await f.choose('true'); assert.deepEqual(f.saves, [['group', 10, { active: true }]]); assert.equal(f.forms, 0);
  f.host.icubeQuickGroupStatus(10, f.anchor); await f.choose('false');
  assert.equal(f.saves.length, 1); assert.equal(f.forms, 1); assert.equal(f.changed, 1);
  assert.equal(f.fields.get('#gf-active').value, 'false'); assert.equal(f.host.groupForm, f.groupForm);
  assert.ok(f.fields.get('.modal').classList.has('quick-group-deactivation'));
  assert.ok(f.fields.get('#gf-end-date-wrap').classList.has('quick-deactivation-date'));
  assert.equal(f.fields.get('#gf-end-date').focused, true);
  f.host.groupForm(10);
  assert.equal(f.fields.get('.modal').classList.has('quick-group-deactivation'), false);
  assert.equal(f.fields.get('#gf-end-date-wrap').classList.has('quick-deactivation-date'), false);
  assert.equal(f.fields.get('#gf-end-date').focused, undefined);
});
test('failed save retains the popover and re-enables choices', async () => {
  const f = fixture(); f.host.icubeApi.saveChild = async () => undefined;
  f.host.icubeQuickChildStatus(8, f.anchor); await f.choose('Пауза');
  assert.ok(!f.roots[0].removed); assert.ok(f.roots[0].buttons.every((button) => !button.disabled));
});
test('read-only role cannot open quick status popover', () => {
  const f = fixture(); f.state.role = 'teacher'; assert.doesNotMatch(f.host.child(), /icubeQuickChildStatus/);
  f.host.icubeQuickChildStatus(8, f.anchor); assert.equal(f.roots.length, 0);
});
test('quick group uses real saveGroup validation and payload; no missing end-date bypass', async () => {
  const source = await readFile(new URL('../src/frontend/api-sync.mjs', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('async function saveGroup('), source.indexOf('async function saveChild('));
  const alerts = []; const updates = []; const values = { '#gf-dir': 'Робототехника', '#gf-project': 'iCubeRobots', '#gf-start-date': '2026-09-01',
    '#gf-active': 'false', '#gf-end-date': '', '#gf-start': '10:00', '#gf-end': '11:00', '#gf-day': 'Понедельник', '#gf-price': '', '#gf-site': '2', '#gf-teacher': '4' };
  const context = vm.createContext({ groupSavePending: false, element: () => null, value: (s) => values[s],
    directories: { directions: [{ id: 1, name: 'Робототехника' }], projects: [{ id: 3, name: 'iCubeRobots' }] },
    byName: (items, name) => items.find((item) => item.name === name), dayNames: ['Понедельник'], dayShortNames: ['Пн'],
    legacy: { state: { groups: [{ id: 10 }], modal: 'status' } }, window: { alert(message) { alerts.push(message); } },
    api: { async update(resource, id, payload) { updates.push({ resource, id, payload }); return { id }; } }, reload: async () => {}, fail(error) { throw error; } });
  vm.runInContext(body, context); await context.saveGroup(10);
  assert.equal(updates.length, 0); assert.match(alerts[0], /дату окончания/); assert.equal(context.legacy.state.modal, 'status');
  values['#gf-end-date'] = '2026-09-29'; await context.saveGroup(10);
  assert.equal(updates[0].resource, 'groups'); assert.equal(updates[0].payload.endsOn, '2026-09-29');
  assert.equal(updates[0].payload.active, false); assert.equal(context.legacy.state.modal, null);
});

test('quick child uses original atomic with-enrollment save and server reload, no separate status request', async () => {
  const source = await readFile(new URL('../src/frontend/api-sync.mjs', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('async function saveChild('), source.indexOf('async function saveEnrollment('));
  const calls = []; let reloads = 0;
  const values = { '#cf-name': 'Иван Иванов', '#cf-birth': '2017-01-01', '#cf-school': 'Школа', '#cf-grade': '3',
    '#cf-status': 'Пауза', '#cf-note': 'Примечание', '#cf-parent': 'Родитель', '#cf-phone': '79000000000', '#cf-group': '10', '#cf-direction': 'Робототехника' };
  const enrollment = { id: 40, groupId: 10, editable: true, direction: 'Робототехника', balance: 4 };
  const context = vm.createContext({ childSavePending: false, childStatusToApi: { 'Пауза': 'paused' }, value: (s) => values[s] ?? '',
    legacy: { state: { children: [{ id: 8, enrollments: [enrollment] }], modal: 'status' } },
    api: { async request(path, options) { calls.push({ path, options }); return { id: 8 }; } },
    reload: async () => { reloads++; }, fail(error) { throw error; }, ApiError: Error });
  vm.runInContext(body, context); await context.saveChild(8);
  assert.equal(calls.length, 1); assert.equal(calls[0].path, '/children/8/with-enrollment');
  assert.equal(calls[0].options.method, 'PATCH'); assert.equal(calls[0].options.body.child.status, 'paused');
  assert.equal(calls[0].options.body.enrollmentId, 40); assert.equal(calls[0].options.body.enrollment.groupId, 10);
  assert.equal(enrollment.balance, 4); assert.equal(reloads, 1); assert.equal(context.legacy.state.modal, null);
});

test('popover child status uses existing saveChild without form fields or membership changes', async () => {
  const source = await readFile(new URL('../src/frontend/api-sync.mjs', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('async function saveChild('), source.indexOf('async function saveEnrollment('));
  const calls = []; let reloads = 0;
  const enrollment = { id: 40, groupId: 10, editable: true, direction: 'Робототехника', balance: 4 };
  const context = vm.createContext({ childSavePending: false, childStatusToApi: { 'Пауза': 'paused' }, value() { throw new Error('No form expected'); },
    legacy: { state: { children: [{ id: 8, enrollments: [enrollment] }], modal: null } },
    api: { async request(path, options) { calls.push({ path, options }); return { id: 8 }; } },
    reload: async () => { reloads++; }, fail(error) { throw error; }, ApiError: Error });
  vm.runInContext(body, context); const saved = await context.saveChild(8, { status: 'Пауза' });
  assert.equal(saved.id, 8); assert.equal(calls[0].path, '/children/8/with-enrollment');
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].options.body)), { child: { status: 'paused' }, enrollmentId: 40, enrollment: {} });
  assert.equal(reloads, 1); assert.equal(enrollment.groupId, 10); assert.equal(enrollment.balance, 4);
});
test('popover activation uses existing saveGroup update and server reload without unrelated fields', async () => {
  const source = await readFile(new URL('../src/frontend/api-sync.mjs', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('async function saveGroup('), source.indexOf('async function saveChild('));
  const calls = []; let reloads = 0;
  const context = vm.createContext({ groupSavePending: false, element: () => null, value() { throw new Error('No form expected'); },
    legacy: { state: {} }, api: { async update(resource, id, payload) { calls.push({ resource, id, payload }); return { id }; } },
    reload: async () => { reloads++; }, fail(error) { throw error; } });
  vm.runInContext(body, context); await context.saveGroup(10, { active: true });
  assert.equal(calls[0].resource, 'groups'); assert.equal(calls[0].payload.active, true); assert.equal(calls[0].payload.endsOn, null);
  assert.equal(reloads, 1);
});

for (const [direction, directionId] of [['Робототехника', '1'], ['Программирование', '2']]) test(`create ${direction} child in mixed group keeps the real enrollment direction`, async () => {
  const source = await readFile(new URL('../src/frontend/api-sync.mjs', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('async function saveChild('), source.indexOf('async function saveEnrollment('));
  const calls = []; const values = { '#cf-name': 'Новый ребёнок', '#cf-status': 'Лид', '#cf-direction': direction, '#cf-group': '10', '#cf-project': '3' };
  const context = vm.createContext({ childSavePending: false, childCreateKey: null, operationKey: () => 'create-child-key',
    childStatusToApi: { 'Лид': 'lead' }, value: (s) => values[s] ?? '',
    directories: { directions: [{ id: '1', name: 'Робототехника' }, { id: '2', name: 'Программирование' }] },
    byName: (items, name) => items.find((item) => item.name === name), legacy: { state: {} },
    api: { async request(path, options) { calls.push({ path, options }); return { id: 8 }; } },
    reload: async () => {}, fail(error) { throw error; }, ApiError: Error });
  vm.runInContext(body, context); await context.saveChild(null);
  assert.equal(calls[0].path, '/children-with-enrollment'); assert.equal(calls[0].options.body.enrollment.directionId, directionId);
  assert.equal(calls[0].options.body.enrollment.groupId, 10); assert.equal(calls[0].options.body.enrollment.projectId, '3');
});

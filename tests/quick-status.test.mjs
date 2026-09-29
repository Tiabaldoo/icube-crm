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
function fixture() {
  const fields = new Map(); const nodes = []; const saves = [];
  const state = { role: 'director', selectedChild: 8, selectedGroup: 10,
    children: [{ id: 8, status: 'Активный' }], groups: [{ id: 10, active: true }] };
  const save = { setAttribute(key, value) { this[key] = value; } }; const modal = { classList: { add() {} } }; const heading = {};
  const document = { querySelector(selector) { return fields.get(selector) ?? ({ '.modal': modal, '.modal h3': heading, '.modal .modal-actions .btn.primary': save })[selector]; }, querySelectorAll() { return nodes; } };
  function form(type) {
    fields.clear(); nodes.length = 0;
    const status = { id: 'status', hidden: false }; const unrelated = { id: 'name', hidden: false };
    const end = { id: 'gf-end-date-wrap', hidden: false }; nodes.push(status, unrelated, end);
    fields.set(type === 'child' ? '#cf-status' : '#gf-active', { value: type === 'child' ? state.children[0].status : String(state.groups[0].active), closest() { return status; }, focus() {} });
    fields.set('#gf-end-date', { value: '' });
  }
  const host = { child() { return `<span class="badge green">${state.children[0].status}</span>`; }, group() { return '<span class="badge green">Активна</span>'; },
    childForm() { form('child'); }, groupForm() { form('group'); }, closeModal() { state.modal = null; },
    icubeApi: { async saveChild(id) { saves.push(['child', id]); state.children[0].status = fields.get('#cf-status').value; },
      async saveGroup(id) { saves.push(['group', id]); state.groups[0].active = fields.get('#gf-active').value === 'true'; } } };
  installQuickStatusUi({ state }, host, document);
  return { state, host, document, fields, nodes, saves, save };
}
test('child badge opens condensed existing form; same status no request; save delegates and updates badge on every render', async () => {
  const f = fixture(); assert.match(f.host.child(), /icubeQuickChildStatus\(8\)/);
  assert.match(f.host.child(), /icubeQuickChildStatus\(8\)/);
  f.host.icubeQuickChildStatus(8); assert.equal(f.nodes[1].hidden, true);
  assert.equal(f.save.onclick, 'icubeSaveQuickStatus()');
  await f.host.icubeSaveQuickStatus(); assert.equal(f.saves.length, 0);
  f.fields.get('#cf-status').value = 'Пауза'; await f.host.icubeSaveQuickStatus(); assert.deepEqual(f.saves, [['child', 8]]);
  assert.match(f.host.child(), /icubeQuickChildStatus\(8\)[\s\S]*Пауза/);
});
test('group badge opens existing group form, preserves end-date controls and delegates original save', async () => {
  const f = fixture(); assert.match(f.host.group(), /icubeQuickGroupStatus\(10\)/);
  f.host.icubeQuickGroupStatus(10); assert.equal(f.nodes[1].hidden, true); assert.equal(f.nodes[2].hidden, false);
  await f.host.icubeSaveQuickStatus(); assert.equal(f.saves.length, 0);
  f.fields.get('#gf-active').value = 'false'; await f.host.icubeSaveQuickStatus(); assert.deepEqual(f.saves, [['group', 10]]);
});
test('read-only roles get no status action and cannot call quick save', async () => {
  const f = fixture(); f.state.role = 'teacher'; assert.doesNotMatch(f.host.child(), /icubeQuickChildStatus/);
  f.host.icubeQuickChildStatus(8); await f.host.icubeSaveQuickStatus(); assert.equal(f.saves.length, 0);
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

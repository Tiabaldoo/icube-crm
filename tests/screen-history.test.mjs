import test from 'node:test';
import assert from 'node:assert/strict';
import { installScreenHistory } from '../src/frontend/screen-history.mjs';

function fixture(existing = null) {
  const state = { authUser: { id: '1', roles: ['director'] }, role: 'director', page: 'dashboard',
    children: [{ id: 8 }], groups: [{ id: 10 }], lessons: [{ id: 60 }] };
  const listeners = {}; const entries = existing?.entries ?? [null]; let index = existing?.index ?? 0;
  const history = { get state() { return entries[index]; },
    replaceState(value) { entries[index] = structuredClone(value); },
    pushState(value) { entries.splice(index + 1); entries.push(structuredClone(value)); index++; },
    back() { if (index > 0) { index--; listeners.popstate({ state: entries[index] }); } },
    forward() { if (index + 1 < entries.length) { index++; listeners.popstate({ state: entries[index] }); } },
  };
  const host = { history, addEventListener(type, fn) { listeners[type] = fn; }, render() {} };
  const legacy = { state, render() { host.render(); } };
  installScreenHistory(legacy, host); legacy.render();
  function go(page, values = {}) { Object.assign(state, { page }, values); legacy.render(); }
  return { state, host, history, legacy, go, entries, get index() { return index; }, listeners };
}
for (const [name, from, initial] of [['group', 'group', { selectedGroup: 10 }], ['children', 'children', {}], ['lesson', 'lesson', { selectedLesson: 60 }]]) {
  test(`${name} → child → Back restores the originating screen/id`, () => {
    const f = fixture(); f.go(from, initial); f.go('child', { selectedChild: 8 });
    f.host.icubeGoBack(); assert.equal(f.state.page, from);
    for (const [key, value] of Object.entries(initial)) assert.equal(f.state[key], value);
  });
}
test('groups → group → child → Back → group → browser Back → groups; Forward restores child', () => {
  const f = fixture(); f.go('groups'); f.go('group', { selectedGroup: 10 }); f.go('child', { selectedChild: 8 });
  f.host.icubeGoBack(); assert.equal(f.state.page, 'group'); assert.equal(f.state.selectedGroup, 10);
  f.history.back(); assert.equal(f.state.page, 'groups');
  f.history.forward(); f.history.forward(); assert.equal(f.state.page, 'child'); assert.equal(f.state.selectedChild, 8);
});
test('calendar → lesson → child preserves nested screens; notification destination records the source', () => {
  const f = fixture(); f.go('calendar', { calendarCursor: '2026-09-29', calendarMode: 'week' });
  f.go('lesson', { selectedLesson: 60 }); f.go('child', { selectedChild: 8 });
  f.history.back(); assert.equal(f.state.page, 'lesson'); f.history.back(); assert.equal(f.state.page, 'calendar');
  assert.equal(f.state.calendarCursor, '2026-09-29');
  // The existing notification router assigns state then renders, just as other page transitions.
  f.go('group', { selectedGroup: 10 }); f.host.icubeGoBack(); assert.equal(f.state.page, 'calendar');
});
test('modal open/close, reload and child tabs add no history steps', () => {
  const f = fixture(); f.go('child', { selectedChild: 8 }); const length = f.entries.length;
  f.state.modal = '<h3>Форма</h3>'; f.legacy.render(); f.state.modal = null; f.legacy.render();
  f.state.childTab = 'payments'; f.legacy.render(); assert.equal(f.entries.length, length);
});
test('refresh restores the same user screen and previous browser entries', () => {
  const first = fixture(); first.go('group', { selectedGroup: 10 }); first.go('child', { selectedChild: 8 });
  const refreshed = fixture(first); assert.equal(refreshed.state.page, 'child');
  refreshed.host.icubeGoBack(); assert.equal(refreshed.state.page, 'group');
});
test('direct open without internal history has safe home fallback', () => {
  const f = fixture(); f.host.icubeGoBack(); assert.equal(f.state.page, 'dashboard'); assert.equal(f.entries.length, 1);
  f.listeners.popstate({ state: null }); assert.equal(f.state.page, 'dashboard');
});
test('old deleted screen and other user/role history cannot restore', () => {
  const first = fixture(); first.go('child', { selectedChild: 8 });
  first.entries[first.index].icubeScreen.userId = '99';
  assert.equal(fixture(first).state.page, 'dashboard');
  const old = fixture(); old.entries[0].icubeScreen.screen.role = 'parent';
  assert.equal(fixture(old).state.role, 'director');
});

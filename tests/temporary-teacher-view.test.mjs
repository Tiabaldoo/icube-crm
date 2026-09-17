import assert from 'node:assert/strict';
import test from 'node:test';
import { parentRoleFromProfile, returnToParentDashboard } from '../src/frontend/temporary-teacher-view.mjs';

test('director temporary teacher-view returns to director dashboard', () => {
  const state = { role: 'teacher', page: 'teacherLesson', modal: '<div>test</div>' };
  assert.equal(parentRoleFromProfile({ roles: ['director'] }), 'director');
  assert.equal(returnToParentDashboard(state, { roles: ['director'] }), true);
  assert.equal(state.role, 'director');
  assert.equal(state.page, 'dashboard');
  assert.equal(state.modal, null);
});

test('partner temporary teacher-view returns to partner dashboard', () => {
  const state = { role: 'teacher', page: 'teacherLesson', modal: null };
  assert.equal(parentRoleFromProfile({ roles: ['partner'] }), 'partner');
  assert.equal(returnToParentDashboard(state, { roles: ['partner'] }), true);
  assert.equal(state.role, 'partner');
  assert.equal(state.page, 'dashboard');
});

test('real teacher does not receive parent-role return behavior', () => {
  const state = { role: 'teacher', page: 'teacherLesson', modal: null };
  assert.equal(parentRoleFromProfile({ roles: ['teacher'] }), null);
  assert.equal(returnToParentDashboard(state, { roles: ['teacher'] }), false);
  assert.equal(state.role, 'teacher');
  assert.equal(state.page, 'teacherLesson');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('teacher form has one delete button and deletion installer does not add a second teacher delete', async () => {
  const [ui, sync] = await Promise.all([
    readFile(new URL('../src/frontend/crm-ui.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/frontend/api-sync.mjs', import.meta.url), 'utf8'),
  ]);
  const start = ui.indexOf('window.teacherForm = function');
  const end = ui.indexOf('window.saveTeacher = function', start);
  const form = ui.slice(start, end);
  assert.equal((form.match(/>Удалить<\/button>/g) ?? []).length, 1);
  const deletionStart = sync.indexOf('function installDeletionUi()');
  const deletionEnd = sync.indexOf('function installPersistentCalendarBridge()', deletionStart);
  const deletionInstaller = sync.slice(deletionStart, deletionEnd);
  assert.doesNotMatch(deletionInstaller, /installDeleteButton\('teacherForm'/);
  assert.match(deletionInstaller, /installDeleteButton\('siteForm'/);
  assert.match(deletionInstaller, /installDeleteButton\('groupForm'/);
});

async function runSaveTeacherScenario({ role, confirmResult = true, existingStatus = 'active', selectedStatus = 'none', resourceId = 7 }) {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalFetch = globalThis.fetch;
  let updateCount = 0;
  let confirmCount = 0;

  const state = {
    role,
    sites: [], groups: [], children: [], payments: [], refunds: [], lessons: [], notifications: [],
    projects: [],
    teachers: [],
  };
  const teacher = {
    id: '7', name: 'Иванов', phone: '+7', active: existingStatus === 'active',
    projectIds: ['2'], directions: [{ id: '10', name: 'Робототехника' }],
    projectSettings: [{ projectId: '2', status: existingStatus, active: existingStatus === 'active',
      directions: [{ id: '10', name: 'Робототехника' }] }],
    access: null,
  };
  const resources = {
    projects: [{ id: '2', code: 'zebra', name: 'Зебра', active: true }],
    directions: [{ id: '10', code: 'robotics', name: 'Робототехника', active: true }],
    sites: [], teachers: [teacher], groups: [], children: [], payments: [], refunds: [], lessons: [],
    'lesson-deletions': [], notifications: [], 'balance-transfers': [], statistics: [],
    'sites/venues': [],
  };
  const controls = {
    '#tf-name': { value: 'Иванов' },
    '#tf-phone': { value: '+7' },
    '#tf-project-status-2': { value: selectedStatus },
  };
  const block = {
    dataset: { teacherProject: '2' },
    querySelectorAll(selector) {
      if (selector === '[data-teacher-direction]:checked' && selectedStatus !== 'none') {
        return [{ dataset: { teacherDirection: 'Робототехника' } }];
      }
      return [];
    },
  };

  globalThis.window = {
    icubeLegacy: { state, render() {} },
    alert() {},
    confirm() { confirmCount += 1; return confirmResult; },
    sharedCalendarEvents() { return []; },
  };
  globalThis.document = {
    querySelector(selector) { return controls[selector] ?? null; },
    querySelectorAll(selector) { return selector === '[data-teacher-project]' ? [block] : []; },
  };
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url).replace(/^.*\/api\/v1\//, '').split('?')[0];
    if (path === 'teachers/7' && options.method === 'PATCH') {
      updateCount += 1;
      return { ok: true, status: 200, async json() { return { data: teacher }; } };
    }
    if (path === 'dashboard/daily') return { ok: true, status: 200, async json() { return { data: {} }; } };
    return { ok: true, status: 200, async json() { return { data: resources[path] ?? [] }; } };
  };

  try {
    await import(`../src/frontend/api-sync.mjs?teacher-partner-confirm=${role}-${confirmResult}-${existingStatus}-${selectedStatus}-${Date.now()}-${Math.random()}`);
    await globalThis.window.icubeApi.reload();
    globalThis.window.icubeLegacy.state.role = role;
    await globalThis.window.icubeApi.saveTeacher(resourceId, false);
    return { updateCount, confirmCount };
  } finally {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    globalThis.fetch = originalFetch;
  }
}

test('partner gets confirm when existing project membership changes active or inactive to none', async () => {
  for (const existingStatus of ['active', 'inactive']) {
    const result = await runSaveTeacherScenario({ role: 'partner', confirmResult: true, existingStatus });
    assert.equal(result.confirmCount, 1);
    assert.equal(result.updateCount, 1);
  }
});

test('partner cancel keeps form data unsaved and does not call teacher update API', async () => {
  const result = await runSaveTeacherScenario({ role: 'partner', confirmResult: false });
  assert.equal(result.confirmCount, 1);
  assert.equal(result.updateCount, 0);
});

test('director does not get partner project removal confirm', async () => {
  const result = await runSaveTeacherScenario({ role: 'director', confirmResult: false });
  assert.equal(result.confirmCount, 0);
  assert.equal(result.updateCount, 1);
});

test('partner does not get confirm for create or unchanged none membership', async () => {
  const created = await runSaveTeacherScenario({ role: 'partner', confirmResult: false, resourceId: null, existingStatus: 'none', selectedStatus: 'none' });
  assert.equal(created.confirmCount, 0);
  const unchanged = await runSaveTeacherScenario({ role: 'partner', confirmResult: false, existingStatus: 'none', selectedStatus: 'none' });
  assert.equal(unchanged.confirmCount, 0);
});

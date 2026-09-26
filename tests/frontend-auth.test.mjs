import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

function globals(profileResponse) {
  const original = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch };
  const app = { innerHTML: '', style: { visibility: 'hidden' } };
  const state = { sites: [], teachers: [], groups: [], children: [], payments: [], refunds: [], lessons: [], settings: {} };
  const calls = [];
  const resources = {
    groups: [{ id: '4', name: 'Группа', directionId: '1', directionName: 'Робототехника', siteId: '2', siteName: 'Площадка',
      projectId: '3', projectName: 'iCubeRobots', teacherId: '7', teacherName: 'Учитель', weekday: 1, startTime: '10:00', endTime: '11:00', startsOn: '2026-09-01', active: true, price: null }],
    children: [], lessons: [], 'lesson-deletions': [], projects: [], directions: [], sites: [], teachers: [], payments: [], refunds: [], notifications: [],
    'balance-transfers': [], statistics: { summary: {}, groups: [] },
  };
  const legacy = { state, render() {
    if (state.role === 'teacher' && globalThis.window.teacherShell) app.innerHTML = globalThis.window.teacherShell('<main>Занятия</main>');
    else app.innerHTML = globalThis.window.shell ? globalThis.window.shell('<main>CRM</main>') : '<div class="app-shell">CRM</div>';
  } };
  globalThis.window = {
    icubeLegacy: legacy, alert() {}, confirm() { return true; }, sharedCalendarEvents() { return []; },
    shell(content) { return `<div class="app-shell"><div><select class="role-switch"><option>Директор</option></select><div class="muted mini">Режим прототипа</div></div>${content}</div>`; },
    teacherShell(content) { return `<div class="teacher-shell">${content}</div>`; }, openLesson() {},
  };
  globalThis.document = { querySelector(selector) { return selector === '#app' ? app : null; }, querySelectorAll() { return []; } };
  globalThis.fetch = async (url) => {
    const path = String(url).replace('/api/v1', ''); calls.push(path);
    if (path === '/auth/me') return profileResponse;
    const resource = path.slice(1).split('?')[0]; return { ok: true, status: 200, async json() { return { data: resources[resource] ?? [] }; } };
  };
  return { app, state, calls, restore() { Object.assign(globalThis, original); } };
}

test('неавторизованный frontend показывает вход и не запрашивает CRM до /auth/me', async () => {
  const setup = globals({ ok: false, status: 401, async json() { return { error: { code: 'UNAUTHENTICATED', message: 'Требуется вход' } }; } });
  try {
    await import(`../src/frontend/api-sync.mjs?auth-login=${Date.now()}`);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(setup.calls, ['/auth/me']);
    assert.match(setup.app.innerHTML, /id="auth-login"/); assert.match(setup.app.innerHTML, /id="auth-password"/);
    assert.equal(setup.app.style.visibility, 'visible');
  } finally { setup.restore(); }
});

test('teacher получает ограниченную навигацию и frontend не запрашивает финансовые разделы', async () => {
  const profile = { id: '2', displayName: 'Иванов Сергей', roles: ['teacher'], teacherId: '7' };
  const setup = globals({ ok: true, status: 200, async json() { return { data: profile }; } });
  try {
    await import(`../src/frontend/api-sync.mjs?auth-teacher=${Date.now()}`);
    await globalThis.window.icubeAuthReady;
    assert.equal(setup.state.role, 'teacher'); assert.equal(setup.state.prototypeTeacherId, 7);
    assert.match(setup.app.innerHTML, /Сегодня/); assert.match(setup.app.innerHTML, /Календарь/); assert.match(setup.app.innerHTML, /Выйти/);
    assert.doesNotMatch(setup.app.innerHTML, /Вернуться на главную/);
    assert.doesNotMatch(setup.app.innerHTML, /role-switch|Платежи|Статистика|Настройки|Выберите преподавателя/);
    assert.deepEqual(new Set(setup.calls.slice(1)), new Set(['/groups', '/children', '/lessons', '/lesson-deletions']));
  } finally { setup.restore(); }
});

test('director сохраняет полный CRM и teacher-mode остаётся только переключением интерфейса', async () => {
  const profile = { id: '1', displayName: 'Ирина Директор', roles: ['director'], teacherId: null };
  const setup = globals({ ok: true, status: 200, async json() { return { data: profile }; } });
  try {
    await import(`../src/frontend/api-sync.mjs?auth-director=${Date.now()}`);
    await globalThis.window.icubeAuthReady;
    assert.equal(setup.state.role, 'director'); assert.match(setup.app.innerHTML, /Ирина Директор/); assert.match(setup.app.innerHTML, /Выйти/);
    assert.doesNotMatch(setup.app.innerHTML, /role-switch|Режим прототипа/);
    assert.ok(setup.calls.some((path) => path === '/payments')); assert.ok(setup.calls.some((path) => path.startsWith('/statistics?')));
    setup.state.lessons = [{ id: 10, teacherId: 7 }]; setup.state.teachers = [{ id: 7, name: 'Учитель А' }]; setup.state.selectedLesson = 10; setup.state.role = 'teacher'; setup.state.page = 'teacherLesson';
    setup.state.authUser = profile; setup.app.innerHTML = globalThis.window.teacherShell('<main>Урок</main>');
    assert.match(setup.app.innerHTML, /Вернуться на главную/); assert.match(setup.app.innerHTML, /Выйти/); assert.doesNotMatch(setup.app.innerHTML, /Выберите преподавателя/);
  } finally { setup.restore(); }
});

test('partner temporary teacher-view возвращается на партнёрскую главную без logout', async () => {
  const profile = { id: '3', displayName: 'Партнёр Зебры', roles: ['partner'], teacherId: null, projectIds: ['3'] };
  const setup = globals({ ok: true, status: 200, async json() { return { data: profile }; } });
  try {
    await import(`../src/frontend/api-sync.mjs?auth-partner-teacher=${Date.now()}`);
    await globalThis.window.icubeAuthReady;
    assert.equal(setup.state.role, 'partner');
    const scopeBefore = setup.state.calendarProject;

    setup.state.lessons = [{ id: 10, teacherId: 7 }];
    setup.state.teachers = [{ id: 7, name: 'Учитель А' }];
    setup.state.selectedLesson = 10;
    setup.state.role = 'teacher';
    setup.state.page = 'teacherLesson';
    setup.app.innerHTML = globalThis.window.teacherShell('<main>Урок</main>');

    assert.match(setup.app.innerHTML, /Вернуться на главную/);
    assert.match(setup.app.innerHTML, /Выйти/);
    globalThis.window.icubeReturnToHome();
    assert.equal(setup.state.role, 'partner');
    assert.equal(setup.state.page, 'dashboard');
    assert.equal(setup.state.calendarProject, scopeBefore);
    assert.equal(setup.calls.includes('/auth/logout'), false);
  } finally { setup.restore(); }
});

test('auth frontend содержит управление доступом преподавателя и понятную обработку 401/403', async () => {
  const source = await readFile(new URL('../src/frontend/api-sync.mjs', import.meta.url), 'utf8');
  assert.match(source, /Доступ в систему/); assert.match(source, /Создать доступ/); assert.match(source, /Сбросить пароль/); assert.match(source, /Отключить доступ/);
  assert.match(source, /error\.status === 401/); assert.match(source, /Недостаточно прав|error\.message/);
  assert.match(source, /api\.request\('\/auth\/me'/); assert.match(source, /api\.request\('\/auth\/logout'/);
});

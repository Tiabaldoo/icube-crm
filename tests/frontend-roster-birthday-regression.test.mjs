import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function loadFrontend() {
  const source = await readFile(new URL('../src/frontend/crm-ui.js', import.meta.url), 'utf8');
  const app = { innerHTML: '' };
  const elementsById = new Map([['app', app]]);
  const classNames = new Set();
  const document = {
    body: {
      style: {},
      classList: {
        add: (...names) => names.forEach((name) => classNames.add(name)),
        remove: (...names) => names.forEach((name) => classNames.delete(name)),
        contains: (name) => classNames.has(name),
      },
    },
    documentElement: { style: {} },
    head: { appendChild(element) { if (element.id) elementsById.set(element.id, element); } },
    getElementById: (id) => elementsById.get(id) ?? null,
    createElement: () => ({ style: {}, className: '', textContent: '', appendChild: () => {} }),
    querySelector(selector) {
      if (selector === '#app') return app;
      if (selector === '.modal-backdrop') return app.innerHTML.includes('modal-backdrop') ? {} : null;
      return null;
    },
    querySelectorAll: () => [],
    addEventListener: () => {},
  };
  const context = vm.createContext({
    console,
    document,
    alert: () => {},
    requestAnimationFrame: (callback) => callback(),
    setTimeout: () => 0,
    clearTimeout: () => {},
    scrollY: 0,
    pageYOffset: 0,
    scrollTo: () => {},
    addEventListener: () => {},
    Intl,
    Date,
    Math,
    Map,
    Set,
    Object,
    Array,
    Number,
    String,
    Boolean,
    RegExp,
    JSON,
    MutationObserver: class { observe() {} disconnect() {} },
  });
  context.window = context;
  context.globalThis = context;
  vm.runInContext(`${source}\n;globalThis.__regressionProbe={state};`, context, { filename: 'crm-ui.js' });
  return { context, state: context.__regressionProbe.state };
}

function lessonFixture(overrides = {}) {
  return {
    id: 50,
    groupId: 4,
    projectId: 1,
    teacherId: 1,
    date: '03.09.2026',
    time: '18:00–19:00',
    scheduledDate: '03.09.2026',
    scheduledTime: '18:00–19:00',
    started: false,
    done: false,
    cancelled: false,
    moved: false,
    attendance: {},
    extras: [],
    photos: {},
    trialChildren: {},
    absenceNoticeChildIds: [],
    birthdayChildIds: [],
    groupRosterFrozenV146: false,
    groupChildIdsV146: [],
    effectiveGroupChildIds: [],
    ...overrides,
  };
}

test('lesson renderers use the lesson effective/frozen roster instead of current group membership', async () => {
  const { context, state } = await loadFrontend();
  state.role = 'director';
  state.groups = [
    { id: 4, name: 'Основная', direction: 'Робототехника', project: 'iCubeRobots', projectId: 1, siteId: 2, teacherId: 1, time: '18:00–19:00', active: true },
    { id: 99, name: 'Другая', direction: 'Робототехника', project: 'iCubeRobots', projectId: 1, siteId: 2, teacherId: 1, time: '19:00–20:00', active: true },
  ];
  state.sites = [{ id: 2, name: 'Школа' }];
  state.teachers = [{ id: 1, name: 'Учитель', active: true }];
  state.children = [{
    id: 8,
    name: 'Иванов Иван',
    status: 'Активный',
    enrollments: [{
      id: 80,
      direction: 'Робототехника',
      projectId: 1,
      groupId: 4,
      effectiveGroupId: 4,
      groupStartedOn: '2026-09-10',
      status: 'Активный',
    }],
  }];

  const beforeMembership = lessonFixture({ id: 50, date: '03.09.2026', scheduledDate: '03.09.2026', effectiveGroupChildIds: [] });
  state.lessons = [beforeMembership];
  state.selectedLesson = 50;
  assert.doesNotMatch(context.lesson(), /Иванов Иван/, 'director lesson excludes child before started_on');
  const beforeTeacher = context.teacherLesson();
  assert.match(beforeTeacher, /Основная группа/, 'pre-start preview is rendered');
  assert.doesNotMatch(beforeTeacher, /Иванов Иван/, 'teacher lesson and pre-start preview exclude child before started_on');

  const onMembershipDay = lessonFixture({ id: 51, date: '10.09.2026', scheduledDate: '10.09.2026', effectiveGroupChildIds: [8] });
  state.lessons = [onMembershipDay];
  state.selectedLesson = 51;
  assert.match(context.lesson(), /Иванов Иван/, 'director lesson includes child on started_on');
  assert.match(context.teacherLesson(), /Иванов Иван/, 'teacher lesson and pre-start preview include child on started_on');

  const frozen = lessonFixture({
    id: 52,
    started: true,
    groupRosterFrozenV146: true,
    groupChildIdsV146: [8],
    effectiveGroupChildIds: [],
    attendance: { 8: false },
  });
  state.children[0].enrollments[0].groupId = 99;
  state.children[0].enrollments[0].effectiveGroupId = 99;
  state.lessons = [frozen];
  state.selectedLesson = 52;
  const frozenSnapshot = [...frozen.groupChildIdsV146];
  assert.match(context.lesson(), /Иванов Иван/, 'director lesson keeps frozen roster after current membership changes');
  assert.match(context.teacherLesson(), /Иванов Иван/, 'teacher lesson keeps frozen roster after current membership changes');
  assert.deepEqual(frozen.groupChildIdsV146, frozenSnapshot, 'rendering does not recalculate frozen roster');
  assert.equal(state.children[0].enrollments[0].effectiveGroupId, 99, 'temporary lesson roster does not alter current membership');
});

test('teacherToday shows only birthday notifications from the current Sakhalin business day and keeps history intact', async () => {
  const { context, state } = await loadFrontend();
  state.prototypeTeacherId = 1;
  state.teachers = [{ id: 1, name: 'Учитель', active: true }];
  state.lessons = [];
  context.sharedCalendarEvents = () => [];

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Sakhalin', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const values = {};
  parts.forEach((part) => { if (part.type !== 'literal') values[part.type] = part.value; });
  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);
  const todayCreatedAt = new Date(Date.UTC(year, month - 1, day, 1)).toISOString();
  const previousCreatedAt = new Date(Date.UTC(year, month - 1, day - 1, 1)).toISOString();

  state.notifications = [
    { id: 'today', type: 'child_birthday', body: 'TODAY_BIRTHDAY', createdAt: todayCreatedAt },
    { id: 'old', type: 'child_birthday', body: 'OLD_BIRTHDAY', createdAt: previousCreatedAt },
  ];

  const html = context.teacherToday();
  assert.match(html, /TODAY_BIRTHDAY/, 'today birthday is shown on teacherToday');
  assert.doesNotMatch(html, /OLD_BIRTHDAY/, 'past birthday is not shown on teacherToday');
  assert.equal(state.notifications.some((item) => item.id === 'old'), true, 'past birthday stays in notification history state');
});

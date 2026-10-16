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

function seedAttendanceChild(state) {
  state.role = 'director';
  state.groups = [{ id: 4, direction: 'Робототехника', projectId: 1, project: 'iCubeRobots', teacherId: 1, siteId: 2, active: true, time: '18:00–19:00' }];
  state.sites = [{ id: 2, name: 'Школа' }]; state.teachers = [{ id: 1, name: 'Учитель' }];
  state.children = [{ id: 8, name: 'Иванов Иван', status: 'Активный', birth: '',
    enrollments: [{ id: 80, direction: 'Робототехника', projectId: 1, project: 'iCubeRobots', groupId: 4, status: 'Активный', balance: 4 }] }];
}

async function installLessonMapping(context) {
  const source = await readFile(new URL('../src/frontend/api-sync.mjs', import.meta.url), 'utf8');
  context.legacy = context.icubeLegacy;
  const dates = source.match(/^const (?:isoToRu|timestampDate|timestampTime) = .*;$/gm).join('\n');
  vm.runInContext(dates + '\n' + source.slice(source.indexOf('function calendarOccurrenceKey'), source.indexOf('const salaryTypeLabel'))
    + '\n' + source.slice(source.indexOf('window.icubeLessonChildDirection ='), source.indexOf('window.icubeLessonOffline =')), context);
}

function attendanceLessonDto({ id = '166287', date = '2026-10-16', trial = false, type = 'main', amount = '1125.00', direction = 'Робототехника' } = {}) {
  return { id, groupId: '4', directionId: '1', directionName: 'Робототехника', projectId: '1',
    plannedTeacherId: '1', actualTeacherId: '1', siteId: '2', status: 'completed',
    startsAt: `${date}T12:30:00+11:00`, endsAt: `${date}T14:00:00+11:00`,
    scheduledStartsAt: `${date}T12:30:00+11:00`, scheduledEndsAt: `${date}T14:00:00+11:00`,
    attendanceAppliedAt: `${date}T14:00:00+11:00`, rosterFrozenAt: `${date}T12:30:00+11:00`,
    roster: [{ childId: '8', type }], attendances: [{ id: `attendance-${id}`, childId: '8', enrollmentId: '80', directionName: direction,
      type, present: true, trial, priceSnapshot: trial ? null : '1125.00', chargedLessons: trial ? '0.00000000' : '1.00000000', chargedAmount: trial ? null : amount }] };
}

function visitTableRow(html, lessonId) {
  return html.split('<div class="row"').find((row) => row.includes(`deleteVisitPrompt(8,${lessonId})`));
}

test('visit type stays with its attendance after sorting and deleting the neighbouring visit', async () => {
  const { context, state } = await loadFrontend(); seedAttendanceChild(state); await installLessonMapping(context);
  const intro = context.mapLesson(attendanceLessonDto({ id: '80', date: '2026-10-09', trial: true }));
  const paid = context.mapLesson(attendanceLessonDto());
  state.lessons = [intro, paid]; state.selectedChild = 8; state.childTab = 'visits';
  const before = JSON.stringify(state.lessons);
  for (const sort of ['desc', 'asc']) {
    state.childLedgerSort = { visits: sort };
    const html = context.child();
    assert.match(visitTableRow(html, 80), /09\.10\.2026.*Ознакомительное/);
    assert.doesNotMatch(visitTableRow(html, 166287), /Ознакомительное/);
    assert.equal(html.indexOf('09.10.2026') < html.indexOf('16.10.2026'), sort === 'asc');
  }
  assert.equal(JSON.stringify(state.lessons), before, 'rendering never changes saved trial flags');
  paid.attendance[8] = false; // Server result after deleting the neighbouring paid visit.
  const afterDelete = context.child();
  assert.match(visitTableRow(afterDelete, 80), /09\.10\.2026.*Ознакомительное/);
  assert.equal(visitTableRow(afterDelete, 166287), undefined);
  assert.equal(intro.trialChildren[8], true); assert.equal(paid.trialChildren[8], false);
  const sameDayPaid = context.mapLesson(attendanceLessonDto({ id: '81', date: '2026-10-09' }));
  state.lessons = [sameDayPaid, intro]; state.childTab = 'overview';
  const overviewRows = context.child().split('<div class="kpi-line clickable"');
  assert.doesNotMatch(overviewRows.find((row) => row.includes('state.selectedLesson=81;')), /Ознакомительное/);
  assert.match(overviewRows.find((row) => row.includes('state.selectedLesson=80;')), /Ознакомительное/);
});

test('mixed visit direction uses the pinned enrollment and does not invent a missing direction', async () => {
  for (const type of ['main', 'extra']) {
    const { context, state } = await loadFrontend(); seedAttendanceChild(state); await installLessonMapping(context);
    Object.assign(state.groups[0], { direction: 'Смешанная', isMixed: true });
    state.children[0].enrollments = [{ id: 81, direction: 'Робототехника', projectId: 1, balance: 0, groupId: 99 },
      { id: 80, direction: 'Программирование', projectId: 1, balance: 3, groupId: 4, currentPrice: 1125 }];
    const dto = attendanceLessonDto({ type, direction: 'Программирование' });
    Object.assign(dto, { isMixed: true, directionName: 'Смешанная' });
    const lesson = context.mapLesson(dto); state.lessons = [lesson]; state.selectedChild = 8; state.childTab = 'visits';
    const before = JSON.stringify({ children: state.children, lessons: state.lessons });
    assert.match(visitTableRow(context.child(), 166287), /<div>Программирование<\/div>/);
    assert.equal(context.missingDirectionIssuesV137().length, 0);
    assert.doesNotMatch(context.child(), /Нужно добавить направление/);
    state.childTab = 'overview'; assert.match(context.child(), /16\.10\.2026 · Программирование/);
    assert.equal(JSON.stringify({ children: state.children, lessons: state.lessons }), before);
    delete lesson.attendanceDetailsByChild[8].directionName;
    assert.equal(context.icubeLessonChildDirection(lesson, 8), 'Программирование', 'existing enrollment pin also resolves direction');
    assert.equal(context.missingDirectionIssuesV137().length, 0);
    lesson.attendanceDetailsByChild[8].directionName = 'Программирование';
    state.children[0].enrollments.pop();
    assert.equal(context.missingDirectionIssuesV137().length, 1, 'a genuinely missing paid direction still warns');
  }
});

test('visit deletion dialog uses the active historical debit amount rather than a current or group price', async () => {
  const { context, state } = await loadFrontend(); seedAttendanceChild(state); await installLessonMapping(context);
  Object.assign(state.groups[0], { direction: 'Смешанная', isMixed: true });
  Object.assign(state.children[0].enrollments[0], { direction: 'Программирование', currentPrice: 1900 });
  state.settings.robotPrice = 1025; state.selectedChild = 8;
  for (const amount of ['1125.00', '900.00']) {
    const dto = attendanceLessonDto({ amount, direction: 'Программирование' });
    Object.assign(dto, { isMixed: true, directionName: 'Смешанная' });
    const lesson = context.mapLesson(dto); state.lessons = [lesson];
    const before = JSON.stringify({ children: state.children, lessons: state.lessons });
    context.deleteVisitPrompt(8, lesson.id);
    const displayedAmount = state.modal.match(/За него было списано <b>([^<]+)<\/b>/)?.[1];
    assert.equal(displayedAmount?.replace(/\s/g, ''), `${Number(amount)}₽`);
    assert.match(state.modal, /Программирование/);
    assert.equal(JSON.stringify({ children: state.children, lessons: state.lessons }), before, 'opening a dialog never changes money');
  }
  state.lessons[0].attendanceDetailsByChild[8].chargedAmount = null;
  context.deleteVisitPrompt(8, state.lessons[0].id);
  assert.match(state.modal, /точная сумма сейчас недоступна/); assert.doesNotMatch(state.modal, /За него было списано/);
});

for (const extra of [false, true]) test(`child visit history omits cleared ${extra ? 'extra' : 'main'} presence while lesson keeps participant`, async () => {
  const { context, state } = await loadFrontend();
  seedAttendanceChild(state);
  const child = state.children[0]; const group = state.groups[0];
  const lesson = lessonFixture({ groupId: group.id, teacherId: group.teacherId, started: true, done: true, attendanceApplied: true,
    groupRosterFrozenV146: true, groupChildIdsV146: extra ? [] : [child.id],
    attendance: extra ? {} : { [child.id]: true }, extras: extra ? [{ childId: child.id, present: true, trial: false }] : [] });
  state.lessons = [lesson]; state.selectedLesson = lesson.id; state.selectedChild = child.id; state.childTab = 'visits';
  assert.match(context.child(), /deleteVisitPrompt\(/);
  if (extra) lesson.extras[0].present = false; else lesson.attendance[child.id] = false;
  assert.doesNotMatch(context.child(), /deleteVisitPrompt\(/);
  assert.match(context.lesson(), new RegExp(child.name));
  assert.equal(extra ? lesson.extras.length : lesson.groupChildIdsV146.length, 1);
});

test('teacher-created ordinary participant has a visible unchecked trial control', async () => {
  const { context, state } = await loadFrontend(); seedAttendanceChild(state); const child = state.children[0];
  const lesson = lessonFixture({ started: true, extras: [{ childId: child.id, present: true, trial: false, createdByTeacher: true }] });
  state.lessons = [lesson];
  const markup = context.studentCheck(child, lesson, true, lesson.extras[0]);
  assert.match(markup, /Ознакомительное/);
  const trialInput = markup.match(/<input type="checkbox"([^>]*?)onchange="toggleVisitTrialV121/);
  assert.ok(trialInput); assert.doesNotMatch(trialInput[1], /checked/);
});

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

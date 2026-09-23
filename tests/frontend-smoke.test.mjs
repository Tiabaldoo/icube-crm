import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { installDashboardUi } from '../src/frontend/dashboard-ui.mjs';

test('единый frontend загружается и рендерит все текущие разделы', async () => {
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

  vm.runInContext(`${source}\n;globalThis.__crmProbe={state,render,groupChildren};`, context, { filename: 'crm-ui.js' });
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const localIso = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  assert.equal(context.__crmProbe.state.salaryDateTo, todayIso);
  assert.equal(context.__crmProbe.state.partnerDateFrom, localIso(new Date(today.getFullYear(), today.getMonth() - 1, 26)));
  assert.equal(context.__crmProbe.state.partnerDateTo, localIso(new Date(today.getFullYear(), today.getMonth(), 25)));
  const pages = ['dashboard', 'children', 'groups', 'calendar', 'payments', 'refunds', 'balances', 'teachers', 'sites', 'salary', 'partner', 'stats', 'settings'];
  for (const page of pages) {
    context.__crmProbe.state.role = 'director';
    context.__crmProbe.state.page = page;
    context.__crmProbe.render();
    assert.match(app.innerHTML, /app-shell/, `раздел ${page} не отрендерился`);
  }
  const savedSalaryState = {
    teachers: context.__crmProbe.state.teachers,
    salaryTeacher: context.__crmProbe.state.salaryTeacher,
    salaryReportRows: context.__crmProbe.state.salaryReportRows,
    salaryReportTotal: context.__crmProbe.state.salaryReportTotal,
  };
  context.__crmProbe.state.teachers = [
    { id: 101, name: 'Активный преподаватель', active: true },
    { id: 102, name: 'Исторический преподаватель', active: false },
  ];
  context.__crmProbe.state.salaryReportRows = [];
  context.__crmProbe.state.salaryReportTotal = 0;
  context.__crmProbe.state.salaryTeacher = '101';
  assert.match(context.salary(), /Активный преподаватель/);
  assert.doesNotMatch(context.salary(), /Исторический преподаватель/);
  context.__crmProbe.state.salaryTeacher = '102';
  assert.match(context.salary(), /Исторический преподаватель · неактивен/);
  Object.assign(context.__crmProbe.state, savedSalaryState);
  const dateText = `${String(today.getDate()).padStart(2, '0')}.${String(today.getMonth() + 1).padStart(2, '0')}.${today.getFullYear()}`;
  context.__crmProbe.state.calendarCursor = todayIso;
  context.__crmProbe.state.calendarProject = 'iCubeRobots';
  context.__crmProbe.state.calendarForeignGroups = [{ id: 999, name: 'Чужая группа', project: 'iCubeRobots', direction: 'Робототехника' }];
  context.sharedCalendarEvents = () => [{ key: `999|${dateText}`, groupId: 999, project: 'iCubeRobots', date: dateText,
    time: '10:00–11:00', lesson: { readOnly: true, siteName: 'Школа' } }];
  context.__crmProbe.state.role = 'partner';
  context.__crmProbe.state.page = 'calendar';
  context.__crmProbe.render();
  assert.match(app.innerHTML, /calendar-event-site">Школа/, 'read-only занятие другого проекта видно в календаре партнёра');
  assert.match(app.innerHTML, /10:00 · \(Р\)/, 'read-only занятие сохраняет время и короткое направление');
  assert.doesNotMatch(app.innerHTML, /onclick="navTo\('(partner|stats|settings)'\)"/, 'партнёру не показаны директорские разделы');
  context.__crmProbe.state.role = 'teacher';
  context.__crmProbe.state.page = 'teacherToday';
  context.__crmProbe.render();
  assert.match(app.innerHTML, /teacher-shell/);

  const savedChildren = context.__crmProbe.state.children;
  context.__crmProbe.state.children = [
    { status: 'Активный', enrollments: [{ groupId: 999, status: 'Пауза' }] },
    { status: 'Лид', enrollments: [{ groupId: 999 }] },
  ];
  assert.equal(context.__crmProbe.groupChildren(999).length, 1);
  context.__crmProbe.state.children = savedChildren;

  assert.match(context.lessonAttendanceBadge({ done: true, cancelled: false }, 8, true), />Был</);
  assert.match(context.lessonAttendanceBadge({ done: true, cancelled: false }, 8, false), /Отсутствовал/);
  assert.match(context.lessonAttendanceBadge({ done: true, cancelled: false }, 8, undefined), /Отсутствовал/);
  assert.match(context.lessonAttendanceBadge({ done: false, cancelled: false, absenceNoticeChildIds: [8] }, 8, false), /Не будет/);
  assert.match(context.lessonAttendanceBadge({ done: false, cancelled: false, absenceNoticeChildIds: [] }, 8, false), /Не отмечен/);
  assert.doesNotMatch(context.lessonAttendanceBadge({ done: false, cancelled: true, absenceNoticeChildIds: [8] }, 8, false), /Отсутствовал|Не будет/);

  const savedLessonState = {
    groups: context.__crmProbe.state.groups, sites: context.__crmProbe.state.sites,
    children: context.__crmProbe.state.children, lessons: context.__crmProbe.state.lessons,
    selectedLesson: context.__crmProbe.state.selectedLesson,
  };
  context.__crmProbe.state.groups = [{ id: 4, name: 'Техническое имя', direction: 'Робототехника', project: 'Зебра', siteId: 2, day: 'Пятница', startTime: '18:00', time: '18:00–19:00' }];
  context.__crmProbe.state.sites = [{ id: 2, name: 'Зебра' }];
  context.__crmProbe.state.children = [{ id: 8, name: 'Иванов Иван', status: 'Активный', enrollments: [{ direction: 'Робототехника', groupId: 4, status: 'Активный' }] }];
  context.__crmProbe.state.lessons = [{ id: 50, groupId: 4, date: '25.09.2026', time: '18:00–19:00', scheduledDate: '25.09.2026', scheduledTime: '18:00–19:00',
    started: false, done: false, cancelled: false, attendance: {}, extras: [], photos: {}, trialChildren: {}, absenceNoticeChildIds: [8], birthdayChildIds: [] }];
  context.__crmProbe.state.selectedLesson = 50;
  assert.match(context.teacherLesson(), /Иванов Иван[\s\S]*Не будет/, 'teacher prestart показывает активную отметку отсутствия');
  assert.match(context.studentCheck(context.__crmProbe.state.children[0], { ...context.__crmProbe.state.lessons[0], started: true }, false), /Не будет/,
    'teacher attendance row показывает активную отметку отсутствия');
  context.__crmProbe.state.lessons[0].absenceNoticeChildIds = [];
  assert.doesNotMatch(context.teacherLesson(), /Не будет/, 'teacher prestart не показывает метку без notice');
  assert.doesNotMatch(context.studentCheck(context.__crmProbe.state.children[0], { ...context.__crmProbe.state.lessons[0], started: true }, false), /Не будет/,
    'teacher attendance row не показывает отменённую отметку');
  Object.assign(context.__crmProbe.state, savedLessonState);

  const savedChildState = {
    role: context.__crmProbe.state.role, childTab: context.__crmProbe.state.childTab,
    selectedChild: context.__crmProbe.state.selectedChild, children: context.__crmProbe.state.children,
    groups: context.__crmProbe.state.groups, sites: context.__crmProbe.state.sites,
    lessons: context.__crmProbe.state.lessons, payments: context.__crmProbe.state.payments,
    refunds: context.__crmProbe.state.refunds, childLedgerSort: context.__crmProbe.state.childLedgerSort,
  };
  context.__crmProbe.state.role = 'director';
  context.__crmProbe.state.childTab = 'overview';
  context.__crmProbe.state.selectedChild = 20;
  context.__crmProbe.state.groups = [
    { id: 10, name: 'Техническое имя 1', siteId: 1, day: 'Среда', startTime: '15:30' },
    { id: 11, name: 'Техническое имя 2', siteId: 2, day: 'Пятница', startTime: '18:00' },
  ];
  context.__crmProbe.state.sites = [{ id: 1, name: 'Школа №1' }, { id: 2, name: 'Зебра' }];
  context.__crmProbe.state.lessons = [];
  context.__crmProbe.state.payments = [];
  context.__crmProbe.state.children = [{ id: 20, name: 'Смешанный ребёнок', school: '', grade: '', parent: '', phone: '', status: 'Активный', enrollments: [
    { id: 70, direction: 'Робототехника', projectId: '1', project: 'iCubeRobots', groupId: 10, siteName: 'Школа №1', weekday: 3, startTime: '15:30', status: 'Активный', editable: true, balance: 3, price: 1025 },
    { id: 71, direction: 'Программирование', projectId: '2', project: 'Зебра', groupId: 11, siteName: 'Зебра', weekday: 5, startTime: '18:00', status: 'Активный', editable: true, balance: 1, price: 1125 },
  ] }];
  let childHtml = context.child();
  assert.match(childHtml, /badge blue[^>]*>iCubeRobots</);
  assert.match(childHtml, /badge purple[^>]*>Зебра</);
  assert.match(childHtml, /Школа №1 · Ср 15:30/);
  assert.match(childHtml, /Зебра · Пт 18:00/);
  assert.doesNotMatch(childHtml, /Техническое имя [12]/, 'карточка не показывает техническое имя группы');

  context.__crmProbe.state.children[0].enrollments[1].projectId = '1';
  context.__crmProbe.state.children[0].enrollments[1].project = 'iCubeRobots';
  childHtml = context.child();
  assert.doesNotMatch(childHtml, /badge blue[^>]*>iCubeRobots</, 'в одном активном проекте project badge скрыт');

  context.__crmProbe.state.role = 'partner';
  context.__crmProbe.state.children[0].enrollments[1] = { id: 71, direction: 'Программирование', projectId: '2', project: 'Зебра', groupId: 11,
    siteName: 'Зебра', weekday: 5, startTime: '18:00', status: 'Активный', editable: true, balance: 1, price: 1125 };
  context.__crmProbe.state.children[0].enrollments[0].editable = false;
  context.__crmProbe.state.children[0].enrollments[0].balance = null;
  childHtml = context.child();
  assert.match(childHtml, /badge gray[^>]*>iCubeRobots/);
  assert.match(childHtml, /Другой проект/);
  assert.equal((childHtml.match(/>\+ Оплата<\/button>/g) ?? []).length, 1, 'foreign enrollment не получает финансовые действия');
  assert.equal((childHtml.match(/>Изменить направление \/ цену<\/button>/g) ?? []).length, 1, 'foreign enrollment не получает mutation controls');

  context.__crmProbe.state.role = 'director';
  context.__crmProbe.state.childLedgerSort = { payments: 'desc', visits: 'desc', refunds: 'desc' };
  context.__crmProbe.state.payments = [
    { id: 1, childId: 20, direction: 'Робототехника', amount: 1000, lessons: 1, method: 'Безналичный расчёт', date: '01.09.2026', paidOn: '2026-09-01' },
    { id: 2, childId: 20, direction: 'Робототехника', amount: 2000, lessons: 2, method: 'Безналичный расчёт', date: '20.09.2026', paidOn: '2026-09-20' },
  ];
  context.__crmProbe.state.refunds = [
    { id: 3, childId: 20, direction: 'Робототехника', amount: 500, price: 1000, lessons: 0.5, date: '03.09.2026', refundedOn: '2026-09-03' },
    { id: 4, childId: 20, direction: 'Робототехника', amount: 700, price: 1000, lessons: 0.7, date: '21.09.2026', refundedOn: '2026-09-21' },
  ];
  context.__crmProbe.state.groups = [{ id: 10, name: 'Группа', direction: 'Робототехника', siteId: 1 }];
  context.__crmProbe.state.lessons = [
    { id: 31, groupId: 10, date: '05.09.2026', time: '10:00–11:00', cancelled: false, attendance: {20:true}, extras: [] },
    { id: 32, groupId: 10, date: '22.09.2026', time: '10:00–11:00', cancelled: false, attendance: {20:true}, extras: [] },
  ];

  context.__crmProbe.state.childTab = 'payments';
  childHtml = context.child();
  assert.match(childHtml, /Сначала новые/);
  assert.ok(childHtml.indexOf('20.09.2026') < childHtml.indexOf('01.09.2026'), 'оплаты: новые сверху');
  context.setChildLedgerSort('payments', 'asc');
  childHtml = context.child();
  assert.ok(childHtml.indexOf('01.09.2026') < childHtml.indexOf('20.09.2026'), 'оплаты: старые сверху');

  context.__crmProbe.state.childTab = 'visits';
  context.__crmProbe.state.childLedgerSort.visits = 'desc';
  childHtml = context.child();
  assert.match(childHtml, /Сначала новые/);
  assert.ok(childHtml.indexOf('22.09.2026') < childHtml.indexOf('05.09.2026'), 'посещения: новые сверху');
  context.setChildLedgerSort('visits', 'asc');
  childHtml = context.child();
  assert.ok(childHtml.indexOf('05.09.2026') < childHtml.indexOf('22.09.2026'), 'посещения: старые сверху');

  context.__crmProbe.state.childTab = 'refunds';
  context.__crmProbe.state.childLedgerSort.refunds = 'desc';
  childHtml = context.child();
  assert.match(childHtml, /Сначала новые/);
  assert.ok(childHtml.indexOf('21.09.2026') < childHtml.indexOf('03.09.2026'), 'возвраты: новые сверху');
  context.setChildLedgerSort('refunds', 'asc');
  childHtml = context.child();
  assert.ok(childHtml.indexOf('03.09.2026') < childHtml.indexOf('21.09.2026'), 'возвраты: старые сверху');

  const payload = '<img src=x onerror=alert(1)>';
  context.__crmProbe.state.role = 'director'; context.__crmProbe.state.page = 'children';
  context.__crmProbe.state.children = [{ id: 99, name: payload, school: '""><script>alert(2)</script>', grade: '5&А', parent: payload,
    phone: '+7 <b>1</b>', status: 'Активный', note: payload, enrollments: [{ direction: 'Робототехника', project: 'iCubeRobots', projectId: 1, groupId: null, balance: 0, status: 'Активный' }] }];
  context.__crmProbe.render();
  assert.doesNotMatch(app.innerHTML, /<img src=x|<script>alert|<[^>]+\sonerror=/);
  assert.match(app.innerHTML, /&lt;img src=x onerror=alert\(1\)&gt;/);
  context.__crmProbe.state.selectedChild = 99; context.__crmProbe.state.childTab = 'overview'; context.__crmProbe.state.page = 'child';
  context.__crmProbe.render();
  assert.doesNotMatch(app.innerHTML, /<img src=x|<[^>]+\sonerror=/); assert.match(app.innerHTML, /5&amp;А/);
  context.__crmProbe.state.projects = [{ id: 1, code: 'icube-robots', name: payload, active: true }];
  context.__crmProbe.state.sites = [{ id: 31, projectId: 1, name: payload, shortName: payload, type: payload, address: payload, note: payload, active: true }];
  context.__crmProbe.state.teachers = [{ id: 7, name: payload, active: true, directions: [] }];
  context.__crmProbe.state.groups = [{ id: 41, name: payload, direction: payload, project: payload, projectId: 1, siteId: 31, teacherId: 7,
    day: 'Среда', startTime: '10:00', endTime: '11:00', active: true }];
  for (const renderPage of [context.groups, context.sites, context.teachers]) {
    const rendered = renderPage(); assert.doesNotMatch(rendered, /<img\s+src=x/i); assert.match(rendered, /&lt;img src=x onerror=alert\(1\)&gt;/);
  }
  context.__crmProbe.state.selectedGroup = 41;
  const groupHtml = context.group(); assert.doesNotMatch(groupHtml, /<img\s+src=x/i); assert.match(groupHtml, /&lt;img src=x onerror=alert\(1\)&gt;/);
  context.__crmProbe.state.lessons = [{ id: 51, groupId: 41, teacherId: 7, date: '22.09.2026', time: '10:00–11:00', scheduledDate: '22.09.2026', scheduledTime: '10:00–11:00',
    siteName: payload, topic: payload, status: 'Идёт', started: true, done: false, cancelled: false, moved: false, attendance: {}, extras: [], photos: {}, trialChildren: {} }];
  context.__crmProbe.state.selectedLesson = 51;
  for (const rendered of [context.lesson(), context.teacherLesson()]) {
    assert.doesNotMatch(rendered, /<img\s+src=x/i); assert.match(rendered, /&lt;img src=x onerror=alert\(1\)&gt;/);
  }
  context.__crmProbe.state.salaryTeacher = 7;
  context.__crmProbe.state.salaryReportRows = [{ lesson: { date: '22.09.2026', time: '10:00–11:00', groupName: payload, siteName: payload, projectName: payload },
    group: null, calc: { type: 'Обычное занятие', children: 1, fixed: 600, childrenPay: 100, total: 700 } }];
  context.__crmProbe.state.salaryReportTotal = 700; context.__crmProbe.state.page = 'salary';
  context.__crmProbe.render();
  assert.doesNotMatch(app.innerHTML, /<img src=x|<[^>]+\sonerror=/); assert.match(app.innerHTML, /&lt;img src=x onerror=alert\(1\)&gt;/);
  Object.assign(context.__crmProbe.state, savedChildState);
});

test('dashboard notification renders editable text as text', () => {
  const payload = '<img src=x onerror=alert(1)>';
  const state = { role: 'director', projects: [], children: [], groups: [], payments: [], lessons: [], sites: [], teachers: [],
    notifications: [{ id: 1, title: payload, body: payload, readAt: null, entityType: null, entityId: null }] };
  const windowObject = { icubeLegacy: { state, pageHead: () => '', render() {} }, alert() {} };
  installDashboardUi({ windowObject, api: { request: async () => ({}) } });
  const rendered = windowObject.serverDashboard();
  assert.doesNotMatch(rendered, /<img src=x|<[^>]+\sonerror=/);
  assert.equal((rendered.match(/&lt;img src=x onerror=alert\(1\)&gt;/g) ?? []).length, 2);
});

test('фактические save handlers подключены к API namespace', async () => {
  const [uiSource, indexSource] = await Promise.all([
    readFile(new URL('../src/frontend/crm-ui.js', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
  ]);
  assert.ok(indexSource.indexOf('crm-ui.js') < indexSource.indexOf('api-sync.mjs'));
  for (const handler of ['saveSite', 'saveTeacher', 'saveGroup', 'saveChild', 'saveEnrollment', 'addEnrollment', 'deleteChild']) {
    assert.match(uiSource, new RegExp(`onclick="icubeApi\\.${handler}\\(`), `форма не вызывает icubeApi.${handler}`);
  }

  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalFetch = globalThis.fetch;
  const state = { sites: [], teachers: [], groups: [], children: [], selectedChild: null, selectedGroup: null };
  globalThis.window = { icubeLegacy: { state, render() {} }, alert() {} };
  globalThis.document = { querySelector() { return null; } };
  globalThis.fetch = async () => ({ ok: true, status: 200, async json() { return { data: [] }; } });
  try {
    await import(`../src/frontend/api-sync.mjs?smoke=${Date.now()}`);
    await globalThis.window.icubeApi.reload();
    const aliases = {
      saveSite: 'saveSite', saveTeacher: 'saveTeacher', saveGroupV111: 'saveGroup', saveChildV111: 'saveChild',
      saveManagedDirection: 'saveEnrollment', saveAddedDirectionV132: 'addEnrollment',
      deleteChildPrompt: 'deleteChildPrompt', confirmDeleteChild: 'deleteChild',
      paymentForm: 'paymentForm', refreshPaymentDirections: 'refreshPaymentDirections', updatePaymentCalc: 'updatePaymentCalc',
      savePaymentV116: 'savePayment', deletePayment: 'deletePaymentPrompt', confirmDeletePayment: 'deletePayment',
      deleteChildPayment: 'deleteChildPaymentPrompt', confirmDeleteChildPayment: 'confirmDeleteChildPayment',
      saveRefund: 'saveRefund', saveRefundForChild: 'saveRefund', confirmDeleteRefund: 'deleteRefund',
      openUnifiedCalendarEvent: 'openCalendarEvent', startLesson: 'startLesson', attend: 'attend',
      toggleExtraAttendanceV138: 'toggleExtraAttendance', toggleVisitTrialV121: 'toggleTrial',
      addExtra: 'addExtra', removeExtraFromLessonV138: 'removeExtra', saveTeacherQuickChildV121: 'saveQuickChild',
      confirmTeacherCreatedChild: 'confirmTeacherCreatedChild',
      finishLesson: 'finishLesson', confirmFinish: 'confirmFinishLesson', saveLessonEdit: 'saveLessonEdit',
      confirmAddChildren: 'confirmAddChildren', deleteLessonConfirmed: 'deleteLesson',
      transferDirectionBalanceFormV142: 'transferDirectionBalanceForm', confirmTransferDirectionBalanceV142: 'confirmBalanceTransfer',
      lToggle: 'lessonToggle', confirmDeleteVisitV121: 'deleteVisit', salaryCalculation: 'salaryCalculation',
    };
    for (const [legacyName, apiName] of Object.entries(aliases)) {
      assert.equal(globalThis.window[legacyName], globalThis.window.icubeApi[apiName], `${legacyName} остался legacy handler`);
    }
    assert.equal(typeof globalThis.window.refundPayment, 'function');
    assert.equal(typeof globalThis.window.icubeApi.refundForm, 'function');
  } finally {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    globalThis.fetch = originalFetch;
  }
});

test('сохранение группы защищено от двойного submit и использует явное короткое название дня', async () => {
  const [apiSyncSource, uiSource] = await Promise.all([
    readFile(new URL('../src/frontend/api-sync.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/frontend/crm-ui.js', import.meta.url), 'utf8'),
  ]);
  assert.match(apiSyncSource, /\['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'\]/);
  for (const [full, short] of [['Понедельник', 'Пн'], ['Вторник', 'Вт'], ['Среда', 'Ср'], ['Четверг', 'Чт'], ['Пятница', 'Пт'], ['Суббота', 'Сб'], ['Воскресенье', 'Вс']]) {
    assert.match(uiSource, new RegExp(`'${full}':'${short}'`));
  }
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalFetch = globalThis.fetch;
  const values = {
    '#gf-dir': 'Робототехника', '#gf-project': 'iCubeRobots', '#gf-start-date': '2026-09-14', '#gf-active': 'true',
    '#gf-end-date': '', '#gf-start': '10:00', '#gf-end': '11:00', '#gf-site': '2', '#gf-teacher': '3', '#gf-price': '', '#gf-day': 'Вторник',
  };
  const submit = { disabled: false, isConnected: true };
  const resources = {
    projects: [{ id: '1', code: 'icube', name: 'iCubeRobots', active: true }],
    directions: [{ id: '1', code: 'robotics', name: 'Робототехника', active: true }],
    sites: [], teachers: [], groups: [], children: [], payments: [], lessons: [], notifications: [],
  };
  let releasePost;
  const postGate = new Promise((resolve) => { releasePost = resolve; });
  let postCount = 0;
  let postedBody;
  globalThis.window = { icubeLegacy: { state: { sites: [], teachers: [], groups: [], children: [], payments: [], lessons: [] }, render() {} }, alert() {}, sharedCalendarEvents() { return []; } };
  globalThis.document = { querySelector(selector) { if (selector === '#gf-submit') return submit; return selector in values ? { value: values[selector] } : null; } };
  globalThis.fetch = async (url, options = {}) => {
    const resource = String(url).split('/').pop().split('?')[0];
    if (options.method === 'POST' && resource === 'groups') {
      postCount += 1;
      postedBody = JSON.parse(options.body);
      await postGate;
      const saved = { id: '9', ...postedBody, directionName: 'Робототехника', siteName: 'Площадка', projectName: 'iCubeRobots', teacherName: 'Преподаватель', price: null };
      resources.groups = [saved];
      return { ok: true, status: 201, async json() { return { data: saved }; } };
    }
    return { ok: true, status: 200, async json() { return { data: resources[resource] ?? [] }; } };
  };
  try {
    await import(`../src/frontend/api-sync.mjs?double-submit=${Date.now()}`);
    await globalThis.window.icubeApi.reload();
    const first = globalThis.window.icubeApi.saveGroup(null);
    const second = globalThis.window.icubeApi.saveGroup(null);
    await Promise.resolve();
    assert.equal(postCount, 1);
    assert.equal(submit.disabled, true);
    releasePost();
    await Promise.all([first, second]);
    assert.equal(postedBody.name, 'Роботы · Вт 10:00');
    assert.equal(submit.disabled, false);
  } finally {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    globalThis.fetch = originalFetch;
  }
});

test('серверные прошлые и перенесённые проведённые занятия остаются видимыми и открываются', async () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalFetch = globalThis.fetch;
  const group = { id: '4', name: 'Роботы · Пн 10:00', directionId: '1', directionName: 'Робототехника', siteId: '2', siteName: 'Площадка', projectId: '1', projectName: 'iCubeRobots', teacherId: '3', teacherName: 'Преподаватель', weekday: 5, startTime: '18:00', endTime: '19:00', startsOn: '2026-01-01', endsOn: null, active: true, price: null };
  const lesson = (id, scheduled, actual, status) => ({
    id: String(id), groupId: '4', directionId: '1', projectId: '1', siteId: '2', plannedTeacherId: '3', actualTeacherId: '3',
    scheduledStartsAt: `${scheduled}:00Z`, scheduledEndsAt: `${scheduled.slice(0, 11)}11:00:00Z`, startsAt: `${actual}:00Z`, endsAt: `${actual.slice(0, 11)}19:00:00Z`,
    status, topic: null, introGroup: false, emptyTrip: false, rosterFrozenAt: status === 'completed' ? `${scheduled}:00Z` : null,
    attendanceAppliedAt: status === 'completed' ? `${actual.slice(0, 11)}19:00:00Z` : null, roster: [], attendances: [],
  });
  const resources = {
    projects: [{ id: '1', code: 'icube', name: 'iCubeRobots', active: true }], directions: [{ id: '1', code: 'robotics', name: 'Робототехника', active: true }],
    sites: [], teachers: [], groups: [group], children: [], payments: [], notifications: [],
    lessons: [lesson(50, '2026-09-14T10:00', '2026-09-18T18:00', 'completed'), lesson(51, '2026-08-10T10:00', '2026-08-10T10:00', 'scheduled')],
  };
  globalThis.window = { icubeLegacy: { state: { sites: [], teachers: [], groups: [], children: [], payments: [], lessons: [] }, render() {} }, alert() {}, sharedCalendarEvents() { return []; } };
  globalThis.document = { querySelector() { return null; } };
  globalThis.fetch = async (url) => {
    const resource = String(url).split('/').pop().split('?')[0];
    return { ok: true, status: 200, async json() { return { data: resources[resource] ?? [] }; } };
  };
  try {
    await import(`../src/frontend/api-sync.mjs?calendar-history=${Date.now()}`);
    await globalThis.window.icubeApi.reload();
    const events = globalThis.window.sharedCalendarEvents(new Date(2026, 7, 1), new Date(2026, 8, 30), null);
    const moved = events.find((event) => event.lesson?.id === 50);
    assert.equal(moved.done, true);
    assert.equal(moved.date, '18.09.2026');
    assert.equal(events.some((event) => event.lesson?.id === 51), true);
    await globalThis.window.icubeApi.openCalendarEvent('4|14.09.2026', 'director');
    assert.equal(globalThis.window.icubeLegacy.state.selectedLesson, 50);
    assert.equal(globalThis.window.icubeLegacy.state.page, 'lesson');
    await globalThis.window.icubeApi.openCalendarEvent('4|10.08.2026', 'teacher');
    assert.equal(globalThis.window.icubeLegacy.state.selectedLesson, 51);
    assert.equal(globalThis.window.icubeLegacy.state.page, 'teacherLesson');
    const uiSource = await readFile(new URL('../src/frontend/crm-ui.js', import.meta.url), 'utf8');
    assert.match(uiSource, /if\(e\.done\) return '<span class="badge green">Проведено<\/span>';\s*if\(e\.moved\)/);
  } finally {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    globalThis.fetch = originalFetch;
  }
});

test('teacher today merge принимает Date-границы, исключает историю и заменяет materialized occurrence серверным lesson', async () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalFetch = globalThis.fetch;
  const originalMutationObserver = globalThis.MutationObserver;
  const todayLesson = { id: 50, groupId: 4, teacherId: 3, occurrenceKey: '4|23.09.2026', scheduledDate: '23.09.2026',
    scheduledTime: '10:00–11:00', date: '23.09.2026', time: '10:00–11:00', cancelled: false, moved: false, done: false };
  const historicalLesson = { ...todayLesson, id: 51, occurrenceKey: '4|01.09.2026', scheduledDate: '01.09.2026', date: '01.09.2026' };
  const foreignLesson = { ...todayLesson, id: 52, teacherId: 8, occurrenceKey: '5|23.09.2026', groupId: 5 };
  let includeScheduledOccurrence = true;
  const state = { role: 'teacher', sites: [], teachers: [{ id: 3, name: 'Учитель', active: true }], groups: [
    { id: 4, name: 'Группа', project: 'iCubeRobots', siteId: 2, teacherId: 3 },
    { id: 5, name: 'Чужая группа', project: 'iCubeRobots', siteId: 2, teacherId: 8 },
  ], children: [], payments: [], refunds: [], balanceTransfers: [], lessons: [todayLesson, historicalLesson, foreignLesson] };
  globalThis.window = {
    icubeLegacy: { state, render() {} }, alert() {}, addEventListener() {},
    sharedCalendarEvents() {
      return includeScheduledOccurrence ? [{ key: '4|23.09.2026', groupId: 4, project: 'iCubeRobots', teacherId: 3,
        scheduledDate: '23.09.2026', scheduledTime: '10:00–11:00', date: '23.09.2026', time: '10:00–11:00', lesson: null }] : [];
    },
  };
  globalThis.document = { querySelector() { return null; }, querySelectorAll() { return []; } };
  globalThis.MutationObserver = class { observe() {} disconnect() {} };
  globalThis.fetch = async () => ({ ok: true, status: 200, async json() { return { data: [] }; } });
  try {
    await import(`../src/frontend/api-sync.mjs?teacher-today-range=${Date.now()}-${Math.random()}`);
    const date = new Date(2026, 8, 23, 12);
    const events = globalThis.window.sharedCalendarEvents(date, date, 3);
    assert.equal(events.length, 1);
    assert.equal(events[0].lesson.id, 50);
    assert.equal(events.some((event) => event.lesson?.id === 51), false);
    assert.equal(events.some((event) => event.lesson?.id === 52), false);
    includeScheduledOccurrence = false;
    state.lessons = [historicalLesson, foreignLesson];
    assert.equal(globalThis.window.sharedCalendarEvents(date, date, 3).length, 0);
  } finally {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    globalThis.fetch = originalFetch;
    globalThis.MutationObserver = originalMutationObserver;
  }
});

test('кнопка удаления посещения вызывает отдельный DELETE API и затем reload', async () => {
  const [frontend, routes] = await Promise.all([
    readFile(new URL('../src/frontend/api-sync.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../backend/src/routes.mjs', import.meta.url), 'utf8'),
  ]);
  assert.match(frontend, /async function deleteVisitApi[\s\S]*?\/attendance\/\$\{Number\(childId\)\}`,[\s\S]*?method: 'DELETE'[\s\S]*?await reload\(\{ render: false \}\)/);
  assert.match(routes, /router\.delete\('\/lessons\/:id\/attendance\/:childId'/);
});

test('добавление ребёнка из карточки группы сохраняет membership через enrollment API и reload', async () => {
  const originalWindow = globalThis.window; const originalDocument = globalThis.document; const originalFetch = globalThis.fetch;
  const group = { id: '4', name: 'Группа', directionId: '1', directionName: 'Робототехника', siteId: '2', siteName: 'Площадка', projectId: '1', projectName: 'iCubeRobots', teacherId: '3', teacherName: 'Преподаватель', weekday: 1, startTime: '10:00', endTime: '11:00', startsOn: '2026-01-01', endsOn: null, active: true, price: null };
  const child = { id: '8', name: 'Иван', status: 'active', guardian: null, enrollments: [{ id: '9', directionId: '1', directionName: 'Робототехника', groupId: null, status: 'active', individualPrice: null, currentPrice: '1025.00', balanceLessons: '0.00000000' }] };
  const resources = { projects: [], directions: [], sites: [], teachers: [], groups: [group], children: [child], payments: [], refunds: [], lessons: [], 'lesson-deletions': [], notifications: [] };
  let patchBody; let renders = 0;
  globalThis.window = { icubeLegacy: { state: { sites: [], teachers: [], groups: [], children: [], payments: [], refunds: [], lessons: [], addChildrenGroupId: 4 }, render() { renders += 1; } }, alert() {} };
  globalThis.document = { querySelector() { return null; }, querySelectorAll(selector) { return selector === '.ac-check:checked' ? [{ value: '8' }] : []; } };
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url).replace('/api/v1/', '');
    if (path === 'enrollments/9' && options.method === 'PATCH') {
      patchBody = JSON.parse(options.body); child.enrollments[0].groupId = String(patchBody.groupId);
      return { ok: true, status: 200, async json() { return { data: child.enrollments[0] }; } };
    }
    const resource = path.split('?')[0];
    return { ok: true, status: 200, async json() { return { data: resources[resource] ?? [] }; } };
  };
  try {
    await import(`../src/frontend/api-sync.mjs?group-membership=${Date.now()}`);
    await globalThis.window.icubeApi.reload();
    globalThis.window.icubeLegacy.state.addChildrenGroupId = 4;
    await globalThis.window.icubeApi.confirmAddChildren();
    assert.deepEqual(patchBody, { groupId: 4 });
    assert.equal(globalThis.window.icubeLegacy.state.children[0].enrollments[0].groupId, 4);
    assert.equal(globalThis.window.icubeLegacy.state.page, 'group'); assert.ok(renders > 0);
  } finally { globalThis.window = originalWindow; globalThis.document = originalDocument; globalThis.fetch = originalFetch; }
});

test('перенос остатка вызывает API и не меняет локальный баланс до серверного reload', async () => {
  const originalWindow = globalThis.window; const originalDocument = globalThis.document; const originalFetch = globalThis.fetch;
  const source = { id: '9', directionId: '1', directionName: 'Робототехника', groupId: null, status: 'finished', individualPrice: null, currentPrice: '1025.00', balanceLessons: '3.00000000' };
  const target = { id: '10', directionId: '2', directionName: 'Программирование', groupId: null, status: 'active', individualPrice: null, currentPrice: '1125.00', balanceLessons: '0.00000000' };
  const child = { id: '8', name: 'Иван', status: 'active', guardian: null, enrollments: [source, target] };
  const resources = { projects: [], directions: [], sites: [], teachers: [], groups: [], children: [child], payments: [], refunds: [], lessons: [], 'lesson-deletions': [], notifications: [] };
  const controls = { '#tb-target': { value: '10' }, '#tb-preview': { dataset: {}, innerHTML: '', textContent: '' }, '#tb-submit': { disabled: false, isConnected: true } };
  let posted; let localBalanceAtPost;
  globalThis.window = { icubeLegacy: { state: { sites: [], teachers: [], groups: [], children: [], payments: [], refunds: [], lessons: [] }, render() {} }, alert() {} };
  globalThis.document = { querySelector(selector) { return controls[selector] ?? null; } };
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url).replace('/api/v1/', '');
    if (path.startsWith('balance-transfers/preview')) return { ok: true, status: 200, async json() { return { data: { transferableAmount: '3075.00', targetPriceSnapshot: '1125.00', targetLessonsCredit: '2.73333333' } }; } };
    if (path === 'balance-transfers' && options.method === 'POST') {
      posted = JSON.parse(options.body); localBalanceAtPost = globalThis.window.icubeLegacy.state.children[0].enrollments[0].balance;
      source.balanceLessons = '0.00000000'; target.balanceLessons = '2.73333333';
      return { ok: true, status: 201, async json() { return { data: { id: '1' } }; } };
    }
    const resource = path.split('?')[0]; return { ok: true, status: 200, async json() { return { data: resources[resource] ?? [] }; } };
  };
  try {
    await import(`../src/frontend/api-sync.mjs?balance-transfer=${Date.now()}`); await globalThis.window.icubeApi.reload();
    await globalThis.window.icubeApi.transferDirectionBalanceForm(8, 'Робототехника');
    assert.equal(globalThis.window.icubeLegacy.state.children[0].enrollments[0].balance, 3);
    await globalThis.window.icubeApi.confirmBalanceTransfer(9);
    assert.deepEqual(posted, { sourceEnrollmentId: 9, targetEnrollmentId: '10' }); assert.equal(localBalanceAtPost, 3);
    assert.equal(globalThis.window.icubeLegacy.state.children[0].enrollments[0].balance, 0);
  } finally { globalThis.window = originalWindow; globalThis.document = originalDocument; globalThis.fetch = originalFetch; }
});

test('подтверждение удаления занятия предупреждает о числе присутствующих', async () => {
  const source = await readFile(new URL('../src/frontend/crm-ui.js', import.meta.url), 'utf8');
  assert.match(source, /На занятии отмечено присутствующих: <b>'\+presentIds\.size/);
  assert.match(source, /восстановлен баланс и отменено начисление зарплаты/);
  assert.doesNotMatch(source, /source\.balance=0;[\s\S]*?target\.balance=/);
});

test('настройки сохраняют цены, зарплату и партнёрство отдельными server-backed действиями и сохраняют dirty-state', async () => {
  const source = await readFile(new URL('../src/frontend/direction-price-settings.mjs', import.meta.url), 'utf8');
  assert.match(source, /ensureAction\(priceBlock, 'prices', 'Сохранить цены', savePrices\)/);
  assert.match(source, /ensureAction\(salaryBlock, 'salary', 'Сохранить ставки', saveSalaryRates\)/);
  assert.match(source, /ensureAction\(partnerBlock, 'partner', 'Сохранить условия', savePartnerAgreement\)/);
  assert.match(source, /api\.create\('price-versions'/);
  assert.match(source, /api\.create\('salary-rate-versions'/);
  assert.match(source, /api\.create\('partner-agreement-versions'/);
  assert.match(source, /input\.addEventListener\('input', recalculateDirty\)/);
  assert.match(source, /dirty = Object\.keys\(baseline\)\.some/);
  assert.match(source, /await window\.icubeApi\.reload\(\{ render: false \}\);/);
  assert.match(source, /addEventListener\('beforeunload'/);
  assert.match(source, /event\.preventDefault\(\);\s*event\.returnValue = '';/);
  assert.match(source, /Есть несохранённые изменения\. Уйти без сохранения\?/);
  assert.match(source, /window\.navTo = function \(page\)/);
});

test('родительский доступ рендерится только на вкладке Обзор карточки ребёнка', async () => {
  const source = await readFile(new URL('../src/frontend/parent-access.mjs', import.meta.url), 'utf8');
  assert.match(source, /legacy\.state\.childTab !== 'overview'/);
  assert.match(source, /return `\$\{base\}\$\{accessBlock\(legacy\.state\.selectedChild\)\}`/);
});

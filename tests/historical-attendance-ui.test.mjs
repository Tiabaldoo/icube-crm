import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../src/frontend/api-sync.mjs', import.meta.url), 'utf8');
function ui() {
  const lesson = { id: '10', groupId: '9', groupName: 'Смешанная', projectId: '2', lockVersion: 0, directionName: 'Смешанная', startsAt: '2026-10-16T10:00:00+11:00', endsAt: '2026-10-16T11:00:00+11:00',
    attendances: [{ childId: '8', enrollmentId: '7', present: true, trial: true, correctionVersion: 'a'.repeat(64) }] };
  const state = { role: 'director', children: [{ id: 8, name: 'Ребёнок', enrollments: [{ id: 7, direction: 'Робототехника', projectId: 2 }, { id: 8, direction: 'Программирование', projectId: 2 }, { id: 9, direction: 'Чужое', projectId: 3, editable: false }] }], lessons: [], payments: [] };
  const calls = []; const alerts = []; let failure = null; let deferred = null; let availableLessons = null;
  const api = { async get() { return lesson; }, async request(path, options) {
    calls.push({ path, options });
    if (failure) throw new Error(failure);
    if (options?.method === 'POST') { if (deferred) await deferred; return {}; }
    return availableLessons ?? [{ ...lesson, id: '11', groupName: 'Другая группа', startsAt: '2026-10-09T15:00:00+11:00', endsAt: '2026-10-09T16:00:00+11:00' },
      { ...lesson, id: '12', groupName: 'Вторая группа', startsAt: '2026-10-09T17:00:00+11:00', endsAt: '2026-10-09T18:00:00+11:00' }];
  } };
  const context = vm.createContext({ legacy: { state, render() {} }, api, Date, Set, console,
    html: (v) => String(v ?? '').replaceAll('<','&lt;'), isoToRu: (v) => v.split('-').reverse().join('.'), timestampDate: (v) => v.slice(0,10), timestampTime: (v) => v.slice(11,16),
    dayShortNames: ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'], operationKey: () => 'stable-request', mapLesson: (v) => ({ ...v, id: Number(v.id) }),
    reload: async () => {}, fail: (error) => alerts.push(error.message), businessDate: () => '2026-10-20', setTimeout() {},
    paymentCreateKey: null, paymentSavePending: false,
  });
  context.window = context; context.alert = (message) => alerts.push(message);
  context.deleteVisitPrompt = () => { state.modal = '<h3>Удалить посещение?</h3><button onclick="closeModal()">Отмена</button><button onclick="existingDelete()">Удалить</button>'; };
  const start = source.indexOf('// Historical corrections use online'); const end = source.indexOf('\nfunction salaryCalculationApi', start);
  vm.runInContext(source.slice(start, end), context);
  vm.runInContext(source.slice(source.indexOf('function paymentForm('), source.indexOf('\nfunction refreshPaymentDirections')), context);
  return { context, state, lesson, calls, alerts, setAvailableLessons(lessons) { availableLessons = lessons; }, failWith(message) { failure = message; }, waitFor(promise) { deferred = promise; } };
}

test('visit form pins attendance identity/type and scope; no free date; delete reuses existing confirmation', async () => {
  const f = ui(); await f.context.editVisit(8, 10);
  assert.match(f.state.modal, /Изменить посещение/); assert.match(f.state.modal, /16\.10\.2026/);
  assert.match(f.state.modal, /Робототехника/); assert.match(f.state.modal, /Программирование/); assert.doesNotMatch(f.state.modal, /Чужое/);
  assert.match(f.state.modal, /id="visit-trial"[^>]* checked(?:\s|>)/); assert.doesNotMatch(f.state.modal, /type="date"/);
  assert.match(f.state.modal, /Открыть занятие/); assert.match(f.state.modal, /Удалить посещение/);
  f.context.changeVisitField('enrollmentId','8'); f.context.deleteEditedVisit();
  assert.match(f.state.modal, /Удалить посещение\?/); assert.match(f.state.modal, /existingDelete/);
  f.context.renderVisitEdit(); assert.match(f.state.modal, /value="8" selected/);
});

test('mini calendar reads existing lessons, highlights dates, selects one of multiple groups and navigates months', async () => {
  const f = ui(); await f.context.editVisit(8,10); await f.context.visitCalendarMonth(0);
  assert.match(f.calls[0].path, /from=2026-10-01&to=2026-10-31/);
  assert.match(f.state.modal, /visitCalendarDate\('2026-10-01'\)" disabled/);
  assert.match(f.state.modal, /visitCalendarDate\('2026-10-09'\)"/);
  f.context.visitCalendarDate('2026-10-09'); assert.match(f.state.modal, /Другая группа/); assert.match(f.state.modal, /Вторая группа/);
  f.context.chooseVisitLesson('12'); assert.match(f.state.modal, /09\.10\.2026 · 17:00–18:00 · Вторая группа/);
  await f.context.visitCalendarMonth(-1); assert.match(f.calls[1].path, /from=2026-09-01&to=2026-09-30/);
  assert.doesNotMatch(f.state.modal, /type="date"/);
});

test('reopened editor shows the original own-group lesson returned by the chooser and submits the return move', async () => {
  const f=ui();const original={...f.lesson,groupName:'Своя группа',startsAt:'2026-10-10T10:00:00+11:00',endsAt:'2026-10-10T11:00:00+11:00'};
  Object.assign(f.lesson,{id:'11',groupName:'Другая группа',startsAt:'2026-10-12T15:00:00+11:00',endsAt:'2026-10-12T16:00:00+11:00'});
  f.setAvailableLessons([original]);await f.context.editVisit(8,11);await f.context.visitCalendarMonth(0);
  assert.match(f.state.modal,/visitCalendarDate\('2026-10-10'\)"/);
  f.context.visitCalendarDate('2026-10-10');assert.match(f.state.modal,/Своя группа/);f.context.chooseVisitLesson('10');
  assert.match(f.state.modal,/10\.10\.2026 · 10:00–11:00 · Своя группа/);await f.context.saveVisitEdit();
  const request=f.calls.find((call)=>call.options?.method==='POST');assert.equal(request.path,'/lessons/11/attendance/8/correct');assert.equal(request.options.body.targetLessonId,'10');
  assert.equal(f.state.childTab,'visits');assert.equal(f.state.modal,null);
});

test('save preserves draft on error; double click is suppressed; retry uses same key/revision and refreshes child card', async () => {
  const f = ui(); await f.context.editVisit(8,10); f.context.changeVisitField('enrollmentId','8'); f.context.changeVisitField('trial',false);
  f.failWith('Историческая цена недоступна'); await f.context.saveVisitEdit();
  assert.match(f.state.modal, /Историческая цена недоступна/); assert.match(f.state.modal, /value="8" selected/);
  assert.doesNotMatch(f.state.modal, /id="visit-trial"[^>]* checked(?:\s|>)/); assert.equal(f.alerts.length, 0);
  f.failWith(null); let resolve; f.waitFor(new Promise((done) => { resolve = done; }));
  const first = f.context.saveVisitEdit(); await f.context.saveVisitEdit(); assert.equal(f.calls.length, 2); resolve(); await first;
  assert.equal(f.calls[0].options.idempotencyKey, f.calls[1].options.idempotencyKey);
  assert.equal(f.calls[1].options.body.expectedRevision, 'a'.repeat(64)); assert.equal(f.calls[1].options.body.enrollmentId,'8');
  assert.equal(f.state.modal,null); assert.equal(f.state.childTab,'visits'); assert.equal(f.state.selectedChild,8); assert.deepEqual(f.alerts,['Посещение изменено']);
});

for (const role of ['teacher','parent']) test(`${role} cannot open the new edit interface`, async () => {
  const f = ui(); f.state.role = role; await f.context.editVisit(8,10); assert.equal(f.state.modal, undefined); assert.equal(f.calls.length, 0);
});

test('payment editor exposes existing refund/delete actions without writing or changing historical price', () => {
  const f = ui(); f.state.payments = [{ id: 46, childId: 8, enrollmentId: 7, amount: 4500, price: 1125, lessons: 4, paidOn: '2026-10-15', refundableAmount: 3375 }];
  const before = JSON.stringify(f.state.payments); f.context.paymentForm(8,null,46);
  assert.match(f.state.modal, /icubeApi.refundForm\(46\)/); assert.match(f.state.modal, /Оформить возврат/);
  assert.match(f.state.modal, /icubeApi.deletePaymentPrompt\(46\)/); assert.match(f.state.modal, /Удалить оплату/);
  assert.match(f.state.modal, /id="pf-price"[^>]*value="1125" readonly/); assert.equal(JSON.stringify(f.state.payments), before); assert.equal(f.calls.length,0);
  f.state.payments[0].refundableAmount = 0; f.context.paymentForm(8,null,46); assert.doesNotMatch(f.state.modal, /Оформить возврат/);
});

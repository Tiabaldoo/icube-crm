import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { ApiError } from '../src/data/api-client.mjs';
import { createLessonActionQueue, createMemoryLessonActionStore } from '../src/data/lesson-action-queue.mjs';

const action = (type, lessonId = '10', extra = {}) => ({ type, lessonId, body: {}, ...extra });

test('offline attendance changes are persistent and coalesce to the last present/trial state', async () => {
  const store = createMemoryLessonActionStore(); const sent = [];
  const offline = createLessonActionQueue({ store, isOnline: () => false, send: async (record) => sent.push(record) });
  await offline.enqueue(action('attendance', '10', { childId: '7', body: { present: true, trial: false } }));
  await offline.enqueue(action('attendance', '10', { childId: '7', body: { present: false, trial: true } }));
  await offline.enqueue(action('attendance', '10', { childId: '7', body: { present: true, trial: true } }));
  assert.equal((await store.all()).length, 1);
  assert.deepEqual((await store.all())[0].body, { present: true, trial: true });

  const afterReload = createLessonActionQueue({ store, isOnline: () => true, send: async (record) => sent.push(record) });
  await afterReload.sync();
  assert.equal(sent.length, 1); assert.deepEqual(sent[0].body, { present: true, trial: true });
  assert.equal((await store.all()).length, 0);
});

test('offline start and finish survive reload and finish is sent after lesson changes', async () => {
  const store = createMemoryLessonActionStore(); const sent = [];
  const offline = createLessonActionQueue({ store, isOnline: () => false, send: async () => {} });
  await offline.enqueue(action('start', '10', { body: { actualTeacherId: 3 } }));
  await offline.enqueue(action('attendance', '10', { childId: '7', body: { present: true, trial: false } }));
  await offline.enqueue(action('finish', '10', { body: { topic: 'Роботы' } }));

  const afterReload = createLessonActionQueue({ store, isOnline: () => true, send: async (record) => sent.push(record.type) });
  await afterReload.sync();
  assert.deepEqual(sent, ['start', 'attendance', 'finish']);
});

test('lost quick-child response retries idempotently and remaps dependent actions', async () => {
  const store = createMemoryLessonActionStore(); let online = false; let firstReplyLost = true; let created = 0; const calls = [];
  const queue = createLessonActionQueue({ store, isOnline: () => online, send: async (record) => {
    calls.push({ type: record.type, childId: record.childId });
    if (record.type === 'quick-child') {
      if (created === 0) created += 1;
      if (firstReplyLost) { firstReplyLost = false; throw new TypeError('network lost'); }
      return { childId: '91' };
    }
    return {};
  } });
  await queue.enqueue(action('quick-child', '10', { id: 'quick-command', tempChildId: '-100', body: { name: 'Новый Ребёнок' } }));
  await queue.enqueue(action('attendance', '10', { childId: '-100', body: { present: true, trial: true } }));
  await queue.enqueue(action('finish', '10'));
  online = true; await queue.sync();
  assert.equal((await queue.records()).length, 3, 'network failure keeps the command and dependencies');
  await queue.sync();
  assert.equal(created, 1); assert.deepEqual(calls.map((item) => item.type), ['quick-child', 'quick-child', 'attendance', 'finish']);
  assert.equal(calls[2].childId, '91'); assert.equal((await queue.records()).length, 0);
  assert.deepEqual(await queue.mappings(), [{ localChildId: '-100', serverChildId: '91' }]);
});

test('a permanent conflict remains visible while an independent lesson still synchronizes', async () => {
  const store = createMemoryLessonActionStore(); const sent = [];
  const queue = createLessonActionQueue({ store, isOnline: () => true, send: async (record) => {
    sent.push(record.lessonId);
    if (record.lessonId === '10') throw new ApiError('Занятие отменено', { status: 409, code: 'LESSON_FINAL' });
  } });
  await queue.enqueue(action('attendance', '10', { childId: '1', body: { present: true, trial: false } }));
  await queue.enqueue(action('start', '11'));
  await queue.sync();
  const remaining = await queue.records();
  assert.deepEqual(sent, ['10', '11']); assert.equal(remaining.length, 1);
  assert.equal(remaining[0].state, 'error'); assert.equal(remaining[0].lastError, 'Занятие отменено');
});

test('a failed child action does not block an independent child in the same lesson but still blocks finish', async () => {
  const store = createMemoryLessonActionStore(); const sent = [];
  const queue = createLessonActionQueue({ store, isOnline: () => true, send: async (record) => {
    sent.push(`${record.type}:${record.childId ?? ''}`);
    if (record.childId === '1') throw new ApiError('Ребёнок не входит в занятие', { status: 409, code: 'CHILD_NOT_IN_LESSON' });
  } });
  await queue.enqueue(action('attendance', '10', { childId: '1', body: { present: true, trial: false } }));
  await queue.enqueue(action('attendance', '10', { childId: '2', body: { present: true, trial: false } }));
  await queue.enqueue(action('finish', '10'));
  await queue.sync();
  assert.deepEqual(sent, ['attendance:1', 'attendance:2']);
  assert.deepEqual((await queue.records()).map((item) => item.type), ['attendance', 'finish']);
});

test('online teacher action sends immediately through the same queue and drains it', async () => {
  const store = createMemoryLessonActionStore(); const sent = [];
  const queue = createLessonActionQueue({ store, isOnline: () => true, send: async (record) => sent.push(record.type) });
  await queue.enqueue(action('add-extra', '10', { childId: '8', body: { childId: '8' } }));
  await queue.sync();
  assert.deepEqual(sent, ['add-extra']); assert.equal((await queue.records()).length, 0);
});

test('teacher quick-child UI sends the queued command, remaps the child and reloads server attendance', async () => {
  const original = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch, MutationObserver: globalThis.MutationObserver };
  const app = { style: {}, innerHTML: '' }; const requests = []; let created = false;
  const group = { id: '4', name: 'Роботы', directionId: '1', directionName: 'Робототехника', siteId: '2', siteName: 'Площадка',
    projectId: '1', projectName: 'iCubeRobots', teacherId: '5', teacherName: 'Учитель', weekday: 3, startTime: '10:00', endTime: '11:00',
    startsOn: '2026-09-01', endsOn: null, active: true, price: null };
  const lesson = () => ({ id: '61', groupId: '4', groupName: 'Роботы', directionId: '1', directionName: 'Робототехника', projectId: '1', projectName: 'iCubeRobots',
    siteId: '2', siteName: 'Площадка', plannedTeacherId: '5', plannedTeacherName: 'Учитель', actualTeacherId: '5', actualTeacherName: 'Учитель',
    scheduledStartsAt: '2026-09-23T10:00:00+11:00', scheduledEndsAt: '2026-09-23T11:00:00+11:00', startsAt: '2026-09-23T10:00:00+11:00', endsAt: '2026-09-23T11:00:00+11:00',
    status: 'in_progress', topic: '', introGroup: false, emptyTrip: false, rosterFrozenAt: '2026-09-23T10:00:00+11:00', attendanceAppliedAt: null,
    roster: created ? [{ childId: '91', type: 'extra' }] : [], attendances: created ? [{ id: '93', childId: '91', enrollmentId: '92', type: 'extra', present: true, trial: true }] : [] });
  const child = () => ({ id: '91', name: 'Новый Ребёнок', birthDate: null, school: null, grade: null, status: 'lead', note: null,
    needsDirectorReview: true, guardian: { name: null, phone: null }, enrollments: [{ id: '92', directionId: '1', projectId: '1', projectName: 'iCubeRobots',
      directionName: 'Робототехника', groupId: null, groupName: null, status: 'active', startedOn: '2026-09-23', endedOn: null }] });
  const state = { role: 'teacher', page: 'teacherLesson', selectedLesson: 61, sites: [], teachers: [], groups: [], children: [], lessons: [], payments: [], refunds: [], balanceTransfers: [] };
  globalThis.window = { icubeLegacy: { state, render() {} }, alert() {}, addEventListener() {}, sharedCalendarEvents() { return []; } };
  globalThis.document = {
    querySelector(selector) {
      if (selector === '#app') return app;
      if (selector === '#tqc-name') return { value: 'Новый Ребёнок' };
      if (selector === '#tqc-phone') return { value: '' };
      return null;
    },
    querySelectorAll() { return []; },
  };
  globalThis.MutationObserver = class { observe() {} disconnect() {} };
  globalThis.fetch = async (url, options = {}) => {
    const path = new URL(String(url), 'http://crm.test').pathname.replace('/api/v1', '');
    requests.push({ path, method: options.method ?? 'GET', idempotencyKey: options.headers?.['Idempotency-Key'] });
    let data = [];
    if (path === '/auth/me') data = { id: '20', displayName: 'Учитель', roles: ['teacher'], teacherId: '5', projectIds: [] };
    else if (path === '/groups') data = [group];
    else if (path === '/children') data = created ? [child()] : [];
    else if (path === '/lessons') data = [lesson()];
    else if (path === '/lesson-deletions') data = [];
    else if (path === '/lessons/61/quick-child' && options.method === 'POST') { created = true; data = { childId: '91', lesson: lesson() }; }
    return { ok: true, status: path === '/lessons/61/quick-child' ? 201 : 200, async json() { return { data }; } };
  };
  try {
    await import(`../src/frontend/api-sync.mjs?teacher-quick-child=${Date.now()}-${Math.random()}`);
    await globalThis.window.icubeAuthReady;
    state.selectedLesson = 61; state.page = 'teacherLesson';
    await globalThis.window.icubeApi.saveQuickChild();
    const command = requests.find((request) => request.path === '/lessons/61/quick-child');
    assert.equal(command.method, 'POST'); assert.ok(command.idempotencyKey);
    assert.equal(state.children.some((item) => item.id === 91), true);
    assert.equal(state.lessons[0].extras.some((item) => item.childId === 91 && item.present && item.trial), true);
  } finally {
    globalThis.window = original.window; globalThis.document = original.document;
    globalThis.fetch = original.fetch; globalThis.MutationObserver = original.MutationObserver;
  }
});

test('frontend and backend keep IndexedDB, photo coexistence and quick-child idempotency contracts', async () => {
  const [queueSource, syncSource, photosSource, lessonsSource, routesSource, notificationsSource] = await Promise.all([
    readFile(new URL('../src/data/lesson-action-queue.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/frontend/api-sync.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/frontend/lesson-photos.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../backend/src/lessons.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../backend/src/routes.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../backend/src/parent-notifications.mjs', import.meta.url), 'utf8'),
  ]);
  assert.match(queueSource, /indexedDb\.open\(DB_NAME, 1\)/);
  assert.match(syncSource, /window\.addEventListener\?\.\('online'/);
  assert.match(syncSource, /type: 'finish'/); assert.match(syncSource, /idempotencyKey: action\.id/);
  assert.match(photosSource, /remapChildId/); assert.match(photosSource, /icubeLessonOffline\?\.sync/);
  assert.match(lessonsSource, /operation: 'lesson\.quick-child'/);
  assert.match(lessonsSource, /create_idempotency_key/);
  assert.match(routesSource, /quick-child[\s\S]{0,300}requireIdempotencyKey/);
  assert.match(notificationsSource, /title: 'Как прошло занятие'/);
  assert.match(notificationsSource, /В личном кабинете доступны новые фотографии с занятия\./);
});

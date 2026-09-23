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
  assert.match(notificationsSource, /В личном кабинете доступна информация о занятии и новые фотографии\./);
});

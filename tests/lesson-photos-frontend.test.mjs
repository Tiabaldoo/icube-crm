import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { ApiError } from '../src/data/api-client.mjs';

const previous = { window: globalThis.window, document: globalThis.document, setTimeout: globalThis.setTimeout };
const state = { lessons: [], children: [], selectedLesson: null, modal: null };
globalThis.window = {
  icubeLegacy: { state, render() {} },
  studentCheck(child) { return `<div><button class="photo" onclick="togglePhoto(${child.id})">📷 Фото</button></div>`; },
  lesson() { return '<main>lesson</main>'; }, openLesson() {}, addEventListener() {}, alert() {},
};
globalThis.document = { createElement() { return {}; } };
globalThis.setTimeout = () => 0;
const photosModule = await import(`../src/frontend/lesson-photos.mjs?test=${Date.now()}`);

test.after(() => {
  globalThis.window = previous.window; globalThis.document = previous.document; globalThis.setTimeout = previous.setTimeout;
});

test('photo control renders one, multiple and the five-photo limit', () => {
  const child = { id: 4, name: 'Ребёнок' };
  const lesson = { photos: { 4: [{ id: '1', fileUrl: '/one.jpg' }] } };
  assert.match(photosModule.default?.control?.(child, lesson, true) ?? window.icubePhotos.control(child, lesson, true), /\+ Добавить ещё/);
  lesson.photos[4].push({ id: '2', fileUrl: '/two.jpg' });
  assert.equal((window.icubePhotos.control(child, lesson, true).match(/<button class="lesson-photo-thumb/g) ?? []).length, 2);
  lesson.photos[4].push({ id: '3', fileUrl: '/3.jpg' }, { id: '4', fileUrl: '/4.jpg' }, { id: '5', fileUrl: '/5.jpg' });
  const full = window.icubePhotos.control(child, lesson, true);
  assert.match(full, /Максимум 5 фото/); assert.doesNotMatch(full, /Добавить ещё/);
  assert.doesNotMatch(window.icubePhotos.control(child, { photos: { 4: [{ id: '1', fileUrl: '/one.jpg' }] }, done: true }, true), /Добавить ещё/);
});

test('pending offline photo counts as present, permanent error does not', () => {
  const lesson = { photos: { 4: [{ localId: 'a', status: 'waiting' }], 5: [{ localId: 'b', status: 'error' }], 6: [{ id: 'old', expired: true }] } };
  assert.equal(photosModule.hasPhoto(lesson, 4), true);
  assert.equal(photosModule.hasPhoto(lesson, 5), false);
  assert.equal(photosModule.hasPhoto(lesson, 6), false);
  assert.equal(photosModule.pendingCount(lesson), 1);
});

test('network and 5xx retry later, permanent 4xx stops automatic retry', () => {
  assert.equal(photosModule.photoUploadRetryable(new TypeError('offline')), true);
  assert.equal(photosModule.photoUploadRetryable(new ApiError('server', { status: 503 })), true);
  assert.equal(photosModule.photoUploadRetryable(new ApiError('invalid', { status: 415 })), false);
});

test('frontend source keeps IndexedDB blobs, optimization and reconnect retry contracts', async () => {
  const [source, sync, index] = await Promise.all([
    readFile(new URL('../src/frontend/lesson-photos.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/frontend/api-sync.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
  ]);
  assert.match(source, /indexedDb\.open\(DB_NAME, 1\)/);
  assert.match(source, /maxSide = 1600, quality = 0\.84/);
  assert.match(source, /canvas\.toBlob\(resolve, 'image\/jpeg'/);
  assert.match(source, /input\.capture = 'environment'/);
  assert.match(source, /window\.addEventListener\('online'/);
  assert.match(source, /window\.icubeAuthReady\?\.then/);
  assert.match(source, /pendingForLesson\(lesson\.id\).*record\.state !== 'error'/s);
  assert.match(source, /state: photoUploadRetryable\(error\) \? 'waiting' : 'error'/);
  assert.match(source, /'X-Upload-Id': record\.id/); assert.match(source, /'X-Captured-At': record\.createdAt/);
  assert.match(source, /navigator\.share/); assert.match(source, /link\.download/);
  assert.match(sync, /icubePhotos\?\.hasPhoto/); assert.match(sync, /фото ожидают загрузки/);
  assert.ok(index.indexOf('api-sync.mjs') < index.indexOf('lesson-photos.mjs'));
});

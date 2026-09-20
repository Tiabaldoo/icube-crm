import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { ApiError } from '../src/data/api-client.mjs';

const previous = { window: globalThis.window, document: globalThis.document, setTimeout: globalThis.setTimeout, fetch: globalThis.fetch };
const fetchCalls = [];
globalThis.fetch = async (url, options = {}) => {
  fetchCalls.push({ url: String(url), method: options.method ?? 'GET' });
  return { ok: true, status: options.method === 'DELETE' ? 204 : 200, json: async () => ({ data: [] }) };
};
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
  globalThis.window = previous.window; globalThis.document = previous.document; globalThis.setTimeout = previous.setTimeout; globalThis.fetch = previous.fetch;
});

test('compact photo control renders 0, 1, 3 and 5-photo states', () => {
  const child = { id: 4, name: 'Ребёнок' };

  const empty = window.icubePhotos.control(child, { photos: {} }, true);
  assert.match(empty, />📷\+<\/button>/); assert.doesNotMatch(empty, /<button class="lesson-photo-summary /);

  const one = window.icubePhotos.control(child, { photos: { 4: [{ id: '1', fileUrl: '/one.jpg' }] } }, true);
  assert.equal((one.match(/<button class="lesson-photo-summary /g) ?? []).length, 1);
  assert.doesNotMatch(one, /lesson-photo-count/); assert.match(one, /aria-label="Открыть фотографии: 1"/);
  assert.match(one, /is-uploaded/); assert.match(one, /lesson-photo-state-mark">✓<\/span>/);
  assert.match(one, />📷\+<\/button>/);

  const three = window.icubePhotos.control(child, { photos: { 4: [
    { id: '1', fileUrl: '/one.jpg' }, { id: '2', fileUrl: '/two.jpg' }, { id: '3', fileUrl: '/three.jpg' },
  ] } }, true);
  assert.equal((three.match(/<button class="lesson-photo-summary /g) ?? []).length, 1);
  assert.match(three, /is-stack/); assert.match(three, /<span class="lesson-photo-count">3<\/span>/);
  assert.match(three, /aria-label="Открыть фотографии: 3"/);

  const five = window.icubePhotos.control(child, { photos: { 4: [
    { id: '1', fileUrl: '/1.jpg' }, { id: '2', fileUrl: '/2.jpg' }, { id: '3', fileUrl: '/3.jpg' },
    { id: '4', fileUrl: '/4.jpg' }, { id: '5', fileUrl: '/5.jpg' },
  ] } }, true);
  assert.match(five, /<span class="lesson-photo-count">5<\/span>/);
  assert.doesNotMatch(five, /lesson-photo-add"/);
  assert.doesNotMatch(five, />📷\+<\/button>/);

  const absent = window.icubePhotos.control(child, { photos: {} }, false);
  assert.doesNotMatch(absent, />📷\+<\/button>/);
  const completed = window.icubePhotos.control(child, { photos: {}, done: true }, true);
  assert.match(completed, />📷\+<\/button>/);
});

test('photo stack gallery shows uploaded, pending, error and expired statuses and keeps existing actions', () => {
  state.lessons = [{ id: 10, photos: { 4: [
    { id: '1', fileUrl: '/one.jpg', canReplace: true, canDelete: true, expiresAt: '2026-10-19T00:00:00Z' },
    { localId: 'local-2', previewUrl: '/pending.jpg', status: 'waiting' },
    { localId: 'local-3', previewUrl: '/error.jpg', status: 'error', error: 'offline' },
    { id: '4', expired: true },
  ] } }];
  state.selectedLesson = 10; state.modal = null;

  window.icubePhotos.gallery(4);
  assert.match(state.modal, /Фотографии · 4/);
  assert.equal((state.modal.match(/lesson-photo-gallery-item/g) ?? []).length, 4);
  assert.match(state.modal, /lesson-photo-gallery-item is-uploaded/);
  assert.match(state.modal, /lesson-photo-state-mark">✓<\/span>/);
  assert.match(state.modal, /lesson-photo-gallery-item is-waiting/);
  assert.match(state.modal, /lesson-photo-state-mark">↻<\/span>/);
  assert.match(state.modal, /lesson-photo-gallery-item is-error/);
  assert.match(state.modal, /lesson-photo-state-mark">!<\/span>/);
  assert.match(state.modal, /lesson-photo-gallery-item is-expired/);
  assert.match(state.modal, /lesson-photo-state-mark">×<\/span>/);

  window.icubePhotos.open(4, '1');
  assert.match(state.modal, />Скачать<\/button>/);
  assert.match(state.modal, /icubePhotos\.capture\(4,'1'\)/);
  assert.match(state.modal, /icubePhotos\.remove\('1'\)/);
});

test('server photo deletion waits for modal confirmation and cancel makes no request', async () => {
  fetchCalls.length = 0;
  state.lessons = [{ id: 10, photos: { 4: [{ id: '1', fileUrl: '/api/v1/lessons/10/photos/1/file', canDelete: true }] } }];
  state.selectedLesson = 10; state.modal = null;
  window.icubePhotos.remove('1');
  assert.match(state.modal, /Удалить фотографию\?/);
  assert.match(state.modal, /Восстановить её будет нельзя/);
  assert.match(state.modal, /class="btn danger"/);
  assert.equal(fetchCalls.some((call) => call.method === 'DELETE'), false);
  state.modal = null;
  assert.equal(fetchCalls.some((call) => call.method === 'DELETE'), false);

  window.icubePhotos.remove('1');
  await window.icubePhotos.confirmRemove('1');
  assert.equal(fetchCalls.some((call) => call.method === 'DELETE' && call.url.endsWith('/lessons/10/photos/1')), true);
});

test('pending local photo deletion also requires confirmation first', () => {
  fetchCalls.length = 0;
  state.lessons = [{ id: 10, photos: { 4: [{ localId: 'local-1', status: 'waiting' }] } }];
  state.selectedLesson = 10; state.modal = null;
  window.icubePhotos.remove(null, 'local-1');
  assert.match(state.modal, /Удалить фотографию\?/);
  assert.match(state.modal, /ещё не была загружена в CRM/);
  assert.match(state.modal, /confirmRemove\(null,'local-1'\)/);
  assert.equal(fetchCalls.length, 0);
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

test('lesson child card uses explicit six-slot grid without display contents or nth-of-type layout', async () => {
  const [styles, uiSource, photoSource] = await Promise.all([
    readFile(new URL('../src/ui/styles.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/frontend/crm-ui.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/frontend/lesson-photos.mjs', import.meta.url), 'utf8'),
  ]);
  const marker = '/* ===== Fixed lesson student grid v1.1.26 ===== */';
  const start = styles.indexOf(marker);
  assert.ok(start >= 0);
  const fixed = styles.slice(start);

  assert.match(fixed, /grid-template-columns:32px minmax\(0,1fr\) 52px!important;/);
  assert.match(fixed, /grid-template-rows:52px 34px!important;/);
  assert.match(fixed, />\.lesson-student-attendance-slot\{[\s\S]*grid-column:1!important;[\s\S]*grid-row:1!important;/);
  assert.match(fixed, /\.teacher-content \.student-check\.lesson-student-card>\.lesson-student-name-cell\{[\s\S]*grid-column:2!important;[\s\S]*grid-row:1!important;/);
  assert.match(fixed, />\.lesson-photo-summary-slot\{[\s\S]*grid-column:3!important;[\s\S]*grid-row:1!important;/);
  assert.match(fixed, />\.lesson-student-more-slot\{[\s\S]*grid-column:1!important;[\s\S]*grid-row:2!important;/);
  assert.match(fixed, />\.lesson-student-trial-slot\{[\s\S]*grid-column:2!important;[\s\S]*grid-row:2!important;/);
  assert.match(fixed, />\.lesson-photo-add-slot\{[\s\S]*grid-column:3!important;[\s\S]*grid-row:2!important;/);
  assert.doesNotMatch(fixed, /display:contents/);
  assert.doesNotMatch(fixed, /nth-of-type/);

  assert.match(fixed, /\.student-more,[\s\S]*width:30px!important;[\s\S]*height:30px!important;[\s\S]*max-height:30px!important;[\s\S]*border-radius:9px!important;/);
  assert.match(fixed, /\.lesson-student-name\{[\s\S]*white-space:nowrap!important;[\s\S]*overflow:hidden!important;[\s\S]*text-overflow:ellipsis!important;[\s\S]*text-align:left!important;/);
  assert.match(fixed, /\.lesson-student-trial\.is-active\{[\s\S]*background:var\(--amberbg\)!important;[\s\S]*color:var\(--amber\)!important;/);
  assert.doesNotMatch(fixed, /lesson-student-trial\.is-active\{[^}]*#eff6ff/);
  assert.match(fixed, /\.lesson-photo-summary\.is-uploaded \.lesson-photo-state-mark,[\s\S]*background:var\(--green\);/);
  assert.match(fixed, /translate\(-4px,3px\) rotate\(-5deg\)/);
  assert.match(fixed, /translate\(4px,3px\) rotate\(5deg\)/);

  const finalStudent = uiSource.slice(uiSource.lastIndexOf('window.studentCheck=function(c,l,extra,e){'));
  for (const cls of ['lesson-student-attendance-slot','lesson-student-name-cell','lesson-photo-control-slot','lesson-student-more-slot','lesson-student-trial-slot']) {
    assert.match(finalStudent, new RegExp(cls));
  }
  assert.doesNotMatch(finalStudent.slice(0, finalStudent.indexOf('function currentTeacherId')), /badge amber/);
  assert.match(photoSource, /lesson-photo-control-slot/);
  assert.match(photoSource, /lesson-photo-summary-slot/);
  assert.match(photoSource, /lesson-photo-add-slot/);
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
  assert.doesNotMatch(source, /window\.confirm\s*\(/);
  assert.match(source, /function removePhoto\([\s\S]*legacy\.state\.modal/);
  assert.match(source, /function confirmRemove\([\s\S]*method: 'DELETE'/);
  assert.match(sync, /icubePhotos\?\.hasPhoto/); assert.match(sync, /фото ожидают загрузки/);
  assert.ok(index.indexOf('api-sync.mjs') < index.indexOf('lesson-photos.mjs'));
});

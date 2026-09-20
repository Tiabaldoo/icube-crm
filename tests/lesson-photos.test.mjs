import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import express from 'express';
import { createLessonPhotoService, detectImage, imageDimensions } from '../backend/src/lesson-photos.mjs';
import { createApiRouter } from '../backend/src/routes.mjs';

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xd9]);
const director = { roles: ['director'], userId: '1' };
const teacher = { roles: ['teacher'], userId: '9', teacherId: '7' };
const partner = { roles: ['partner'], userId: '12', projectIds: ['2'] };
let uploadSequence = 0;
const uploadInput = (overrides = {}) => ({ childId: 20, buffer: jpeg, mimeType: 'image/jpeg',
  clientUploadId: `test-upload-${++uploadSequence}`, capturedAt: '2026-09-19T12:00:00.000Z', ...overrides });

function memoryPool({ lesson = {}, present = true, photos = [] } = {}) {
  const state = {
    lesson: { id: 10, status: 'in_progress', project_id_snapshot: 2, planned_teacher_id: 7, actual_teacher_id: 7, ...lesson },
    photos: photos.map((photo, index) => ({ id: index + 1, lesson_id: 10, child_id: 20, storage_key: `2026/09/${index + 1}.jpg`, mime_type: 'image/jpeg',
      size_bytes: jpeg.length, width: 1, height: 1, original_filename: 'photo.jpg', uploaded_by_user_id: 9,
      client_upload_id: `existing-${index + 1}`,
      uploaded_at: new Date('2026-09-19T00:00:00Z'), expires_at: new Date('2026-10-19T00:00:00Z'), deleted_at: null, purged_at: null, ...photo })),
    present,
  };
  let nextId = state.photos.length + 1;
  async function query(sql, params = {}) {
    if (sql.includes('FROM lessons WHERE id=')) return [[state.lesson]];
    if (sql.includes('FROM attendances a WHERE')) return [state.present ? [{ id: 30 }] : []];
    if (sql.includes('SELECT COUNT(*) count FROM lesson_photos')) return [[{ count: state.photos.filter((photo) => !photo.deleted_at && !photo.purged_at && photo.expires_at > new Date('2026-09-19T12:00:00Z')).length }]];
    if (sql.includes('WHERE client_upload_id=')) return [state.photos.filter((photo) => photo.client_upload_id === params.clientUploadId)];
    if (sql.startsWith('INSERT INTO lesson_photos')) {
      const row = { id: nextId++, lesson_id: Number(params.lessonId), child_id: Number(params.childId), storage_key: params.storageKey,
        mime_type: params.mimeType, size_bytes: params.sizeBytes, client_upload_id: params.clientUploadId, width: params.width, height: params.height,
        original_filename: params.originalFilename, uploaded_by_user_id: Number(params.actorId), uploaded_at: params.uploadedAt,
        expires_at: params.expiresAt, deleted_at: null, purged_at: null };
      state.photos.push(row); return [{ insertId: row.id }];
    }
    if (sql.includes('SELECT * FROM lesson_photos WHERE lesson_id=')) return [state.photos.filter((photo) => !photo.deleted_at)];
    if (sql.includes('SELECT * FROM lesson_photos WHERE id=')) return [state.photos.filter((photo) => String(photo.id) === String(params.photoId) && !photo.deleted_at)];
    if (sql.startsWith('UPDATE lesson_photos SET deleted_at=COALESCE')) { const photo = state.photos.find((item) => item.id === params.id); photo.deleted_at ??= new Date(); photo.purged_at = new Date(); return [{ affectedRows: 1 }]; }
    if (sql.startsWith('UPDATE lesson_photos SET deleted_at=')) { const photo = state.photos.find((item) => String(item.id) === String(params.id)); if (photo) photo.deleted_at = new Date(); return [{ affectedRows: photo ? 1 : 0 }]; }
    if (sql.startsWith('UPDATE lesson_photos SET purged_at=')) { const photo = state.photos.find((item) => String(item.id) === String(params.id)); if (photo) photo.purged_at = new Date(); return [{ affectedRows: photo ? 1 : 0 }]; }
    if (sql.startsWith('SELECT id,storage_key FROM lesson_photos')) return [state.photos.filter((photo) => !photo.purged_at && (photo.deleted_at || photo.expires_at <= new Date('2026-09-19T12:00:00Z'))).map((photo) => ({ id: photo.id, storage_key: photo.storage_key }))];
    if (sql.startsWith('SELECT storage_key FROM lesson_photos')) return [state.photos.map(({ storage_key }) => ({ storage_key }))];
    if (sql.startsWith('DELETE FROM lesson_photos')) { state.photos.length = 0; return [{ affectedRows: 1 }]; }
    throw new Error(`Unexpected SQL: ${sql}`);
  }
  const connection = { query, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {} };
  return { state, query, getConnection: async () => connection, connection };
}

async function fixture(options = {}) {
  const storageDir = await mkdtemp(path.join(tmpdir(), 'icube-photos-'));
  const pool = memoryPool(options);
  const service = createLessonPhotoService(pool, { storageDir, maxUploadBytes: 1024, retentionDays: 30,
    now: () => new Date('2026-09-19T12:00:00Z') });
  return { storageDir, pool, service, async close() { await rm(storageDir, { recursive: true, force: true }); } };
}

test('image validation recognizes safe formats and dimensions', () => {
  assert.equal(detectImage(jpeg).mime, 'image/jpeg');
  assert.deepEqual(imageDimensions(jpeg, 'image/jpeg'), { width: 1, height: 1 });
  assert.equal(detectImage(Buffer.from('<svg></svg>')), null);
});

test('photo upload stores a child-bound optimized file and returns protected metadata', async (t) => {
  const f = await fixture(); t.after(f.close);
  const photo = await f.service.upload(10, uploadInput({ originalFilename: '../камера.jpg' }), teacher);
  assert.equal(photo.childId, '20'); assert.equal(photo.width, 1); assert.match(photo.fileUrl, /^\/api\/v1\/lessons\/10\/photos\/\d+\/file$/);
  assert.equal(photo.expiresAt, '2026-10-19T12:00:00.000Z');
  assert.deepEqual(await readFile(path.join(f.storageDir, f.pool.state.photos[0].storage_key)), jpeg);
});

test('invalid mime and oversized files are rejected before storage', async (t) => {
  const f = await fixture(); t.after(f.close);
  await assert.rejects(f.service.upload(10, uploadInput({ buffer: Buffer.from('<html>'), mimeType: 'text/html' }), director), { status: 415, code: 'PHOTO_TYPE_INVALID' });
  await assert.rejects(f.service.upload(10, uploadInput({ buffer: Buffer.alloc(1025) }), director), { status: 413, code: 'PHOTO_TOO_LARGE' });
});

test('teacher and partner cannot access a foreign lesson', async (t) => {
  const f = await fixture(); t.after(f.close);
  await assert.rejects(f.service.list(10, { roles: ['teacher'], userId: '8', teacherId: '99' }), { status: 403, code: 'FORBIDDEN' });
  await assert.rejects(f.service.list(10, { ...partner, projectIds: ['1'] }), { status: 403, code: 'FORBIDDEN' });
  await assert.rejects(f.service.upload(10, uploadInput(), { roles: ['teacher'], userId: '8', teacherId: '99' }), { status: 403, code: 'FORBIDDEN' });
  await assert.rejects(f.service.upload(10, uploadInput(), { ...partner, projectIds: ['1'] }), { status: 403, code: 'FORBIDDEN' });
  await assert.rejects(f.service.file(10, 1, { ...partner, projectIds: ['1'] }), { status: 403, code: 'FORBIDDEN' });
  await assert.rejects(f.service.list(10, { roles: [], userId: '8' }), { status: 403, code: 'FORBIDDEN' });
  assert.deepEqual(await f.service.list(10, partner), []);
});

test('upload requires actual presence and enforces five photos per lesson and child', async (t) => {
  const absent = await fixture({ present: false }); t.after(absent.close);
  await assert.rejects(absent.service.upload(10, uploadInput(), teacher), { status: 409, code: 'CHILD_NOT_PRESENT' });
  const full = await fixture({ photos: Array.from({ length: 5 }, () => ({})) }); t.after(full.close);
  await assert.rejects(full.service.upload(10, uploadInput(), teacher), { status: 409, code: 'PHOTO_LIMIT' });
});

test('completed lesson allows new uploads for director, teacher and partner with lesson access', async (t) => {
  for (const [label, context] of [['director', director], ['teacher', teacher], ['partner', partner]]) {
    const f = await fixture({ lesson: { status: 'completed', completed_at: new Date('2026-09-19T13:00:00Z') } }); t.after(f.close);
    const photo = await f.service.upload(10, uploadInput({ clientUploadId: `completed-${label}`, capturedAt: '2026-09-19T14:00:00Z' }), context);
    assert.ok(photo.id, label);
  }
});

test('teacher, director and partner can delete photos after completion within lesson access', async (t) => {
  for (const [label, context] of [['teacher', teacher], ['director', director], ['partner', partner]]) {
    const f = await fixture({ lesson: { status: 'completed', completed_at: new Date('2026-09-19T13:00:00Z') },
      photos: [{ uploaded_by_user_id: label === 'teacher' ? 1 : 9 }] }); t.after(f.close);
    await f.service.remove(10, 1, context);
    assert.ok(f.pool.state.photos[0].deleted_at, label);
  }
});

test('completed photo metadata allows replace for all scoped roles and teacher can replace any accessible photo', async (t) => {
  const f = await fixture({ lesson: { status: 'completed', completed_at: new Date('2026-09-19T13:00:00Z') },
    photos: [{ uploaded_by_user_id: 1 }] }); t.after(f.close);
  for (const context of [teacher, director, partner]) {
    const [metadata] = await f.service.list(10, context);
    assert.equal(metadata.canDelete, true); assert.equal(metadata.canReplace, true);
  }
  const replacement = await f.service.upload(10, uploadInput({ replacePhotoId: 1, capturedAt: '2026-09-19T14:05:00Z' }), teacher);
  assert.notEqual(replacement.id, '1'); assert.ok(f.pool.state.photos[0].deleted_at);
});

test('offline photo captured after finish uploads idempotently after completion', async (t) => {
  const f = await fixture({ lesson: { status: 'completed', completed_at: new Date('2026-09-19T13:00:00Z') } }); t.after(f.close);
  const input = uploadInput({ clientUploadId: 'offline-upload-1', capturedAt: '2026-09-19T14:00:00Z' });
  const first = await f.service.upload(10, input, teacher);
  const repeated = await f.service.upload(10, input, teacher);
  assert.equal(repeated.id, first.id); assert.equal(f.pool.state.photos.length, 1);
});

test('download checks access and returns the stored file', async (t) => {
  const f = await fixture({ photos: [{}] }); t.after(f.close);
  const key = f.pool.state.photos[0].storage_key; await mkdir(path.dirname(path.join(f.storageDir, key)), { recursive: true }); await writeFile(path.join(f.storageDir, key), jpeg);
  const result = await f.service.file(10, 1, teacher); assert.deepEqual(result.data, jpeg); assert.equal(result.mimeType, 'image/jpeg');
  await assert.rejects(f.service.file(10, 1, { roles: ['teacher'], teacherId: '99' }), { status: 403 });
});

test('expired photo is not downloadable and cleanup purges file but keeps metadata', async (t) => {
  const f = await fixture({ photos: [{ expires_at: new Date('2026-09-18T00:00:00Z') }] }); t.after(f.close);
  const key = f.pool.state.photos[0].storage_key; await mkdir(path.dirname(path.join(f.storageDir, key)), { recursive: true }); await writeFile(path.join(f.storageDir, key), jpeg);
  await assert.rejects(f.service.file(10, 1, director), { status: 410, code: 'PHOTO_EXPIRED' });
  assert.deepEqual(await f.service.cleanupExpired(), { selected: 1, purged: 1, failed: [] });
  assert.ok(f.pool.state.photos[0].purged_at); assert.equal(f.pool.state.photos[0].deleted_at, null);
  const [metadata] = await f.service.list(10, director); assert.equal(metadata.expired, true); assert.equal(metadata.fileUrl, null);
  await assert.rejects(readFile(path.join(f.storageDir, key)), { code: 'ENOENT' });
});

test('expired metadata does not consume one of five active photo slots', async (t) => {
  const f = await fixture({ photos: [
    { expires_at: new Date('2026-09-18T00:00:00Z'), purged_at: new Date('2026-09-19T00:00:00Z') },
    ...Array.from({ length: 4 }, () => ({})),
  ] }); t.after(f.close);
  const photo = await f.service.upload(10, uploadInput(), director);
  assert.ok(photo.id); assert.equal(f.pool.state.photos.length, 6);
});

test('deleting a lesson purges physical files and photo rows', async (t) => {
  const f = await fixture({ photos: [{}, {}] }); t.after(f.close);
  for (const photo of f.pool.state.photos) { await mkdir(path.dirname(path.join(f.storageDir, photo.storage_key)), { recursive: true }); await writeFile(path.join(f.storageDir, photo.storage_key), jpeg); }
  await f.service.purgeLesson(f.pool.connection, 10);
  assert.equal(f.pool.state.photos.length, 0);
  for (const key of ['2026/09/1.jpg', '2026/09/2.jpg']) await assert.rejects(readFile(path.join(f.storageDir, key)), { code: 'ENOENT' });
});

test('photo HTTP routes accept raw image, serve protected bytes and delete metadata', async (t) => {
  const calls = [];
  const lessonPhotos = {
    maxUploadBytes: 1024,
    async list() { return [{ id: '1' }]; },
    async upload(lessonId, input, context) { calls.push({ type: 'upload', lessonId, input, context }); return { id: '1' }; },
    async file() { return { data: jpeg, mimeType: 'image/jpeg', filename: 'photo.jpg' }; },
    async remove(lessonId, photoId) { calls.push({ type: 'remove', lessonId, photoId }); },
  };
  const app = express();
  app.use('/api/v1', createApiRouter({ query: async () => [[]] }, {
    lessonPhotos, lessons: {}, testAuth: (request, _response, next) => { request.auth = director; next(); },
  }));
  app.use((error, _request, response, _next) => response.status(error.status ?? 500).json({ error: { code: error.code, message: error.message } }));
  const server = await new Promise((resolve) => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  t.after(() => server.close()); const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const uploaded = await fetch(`${base}/lessons/10/photos`, { method: 'POST', headers: { 'content-type': 'image/jpeg', 'x-child-id': '20', 'x-upload-id': 'http-upload-1', 'x-captured-at': '2026-09-19T12:00:00Z' }, body: jpeg });
  assert.equal(uploaded.status, 201); assert.ok(Buffer.isBuffer(calls[0].input.buffer)); assert.equal(calls[0].input.clientUploadId, 'http-upload-1');
  const downloaded = await fetch(`${base}/lessons/10/photos/1/file`); assert.equal(downloaded.status, 200); assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), jpeg);
  const deleted = await fetch(`${base}/lessons/10/photos/1`, { method: 'DELETE' }); assert.equal(deleted.status, 204); assert.equal(calls[1].type, 'remove');
});

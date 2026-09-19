import { ApiClient, ApiError } from '../data/api-client.mjs';

const api = new ApiClient();
const DB_NAME = 'icube-crm-photo-queue';
const STORE = 'photos';
const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const MAX_PHOTOS = 5;
const allowedInput = new Set(['image/jpeg', 'image/png', 'image/webp']);
const staged = new Map();
const objectUrls = new Map();
const legacy = window.icubeLegacy;

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const id = () => globalThis.crypto?.randomUUID?.() ?? `photo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const currentLesson = () => legacy.state.lessons.find((lesson) => lesson.id === Number(legacy.state.selectedLesson));

export function createPhotoQueue(indexedDb = globalThis.indexedDB) {
  let dbPromise;
  function database() {
    if (!indexedDb) return Promise.reject(new Error('IndexedDB недоступен'));
    dbPromise ??= new Promise((resolve, reject) => {
      const request = indexedDb.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('lessonId', 'lessonId');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return dbPromise;
  }
  async function transaction(mode, operation) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode); const store = tx.objectStore(STORE);
      let result;
      try { result = operation(store); } catch (error) { reject(error); return; }
      tx.oncomplete = () => resolve(result?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
  return {
    put: (record) => transaction('readwrite', (store) => store.put(record)),
    remove: (recordId) => transaction('readwrite', (store) => store.delete(recordId)),
    all: () => transaction('readonly', (store) => store.getAll()),
  };
}

const queue = createPhotoQueue();

async function bitmapFor(file) {
  if (globalThis.createImageBitmap) return createImageBitmap(file, { imageOrientation: 'from-image' });
  return new Promise((resolve, reject) => {
    const image = new Image(); const url = URL.createObjectURL(file);
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Не удалось прочитать изображение')); };
    image.src = url;
  });
}

export async function optimizePhoto(file, { maxSide = 1600, quality = 0.84 } = {}) {
  if (!allowedInput.has(file.type)) throw new Error('Поддерживаются только JPEG, PNG и WebP');
  if (file.size > MAX_SOURCE_BYTES) throw new Error('Исходная фотография должна быть не больше 15 МБ');
  const bitmap = await bitmapFor(file);
  const sourceWidth = bitmap.width || bitmap.naturalWidth; const sourceHeight = bitmap.height || bitmap.naturalHeight;
  const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale)); const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
  context.fillStyle = '#fff'; context.fillRect(0, 0, width, height); context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error('Браузер не смог оптимизировать фотографию');
  return { blob, width, height, filename: `${String(file.name || 'photo').replace(/\.[^.]+$/, '')}.jpg` };
}

function photoItems(lesson, childId) {
  const value = lesson?.photos?.[childId];
  return Array.isArray(value) ? value : [];
}

function setServerPhotos(lesson, photos) {
  const pending = Object.values(lesson.photos ?? {}).flat().filter((photo) => photo?.localId);
  lesson.photos = {};
  for (const photo of photos) (lesson.photos[Number(photo.childId)] ??= []).push(photo);
  for (const photo of pending) (lesson.photos[Number(photo.childId)] ??= []).push(photo);
}

function localPreview(record) {
  if (!objectUrls.has(record.id)) objectUrls.set(record.id, URL.createObjectURL(record.blob));
  return objectUrls.get(record.id);
}

async function pendingForLesson(lessonId) {
  return (await queue.all()).filter((record) => String(record.lessonId) === String(lessonId));
}

async function hydratePending(lesson) {
  const records = await pendingForLesson(lesson.id);
  for (const childId of Object.keys(lesson.photos ?? {})) lesson.photos[childId] = photoItems(lesson, childId).filter((photo) => !photo.localId);
  for (const record of records) (lesson.photos[Number(record.childId)] ??= []).push({
    localId: record.id, childId: String(record.childId), status: record.state, previewUrl: localPreview(record),
    error: record.lastError ?? null, createdAt: record.createdAt,
  });
}

export async function loadLessonPhotos(lessonId, { render = true, retry = true } = {}) {
  const lesson = legacy.state.lessons.find((item) => item.id === Number(lessonId));
  if (!lesson || lesson.readOnly) return;
  try {
    const photos = await api.request(`/lessons/${lesson.id}/photos`);
    setServerPhotos(lesson, photos); await hydratePending(lesson);
    if (retry && navigator.onLine) {
      const records = (await pendingForLesson(lesson.id)).filter((record) => record.state !== 'error');
      if (records.length) {
        for (const record of records) await sendRecord({ ...record, state: 'uploading' });
        return loadLessonPhotos(lesson.id, { render, retry: false });
      }
    }
    if (render) legacy.render();
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 401)) console.error(error);
    await hydratePending(lesson).catch(() => {});
    if (render) legacy.render();
  }
}

export function photoUploadRetryable(error) { return !(error instanceof ApiError) || error.status >= 500 || error.status === 429; }

async function sendRecord(record) {
  try {
    const photo = await api.requestRaw(`/lessons/${record.lessonId}/photos`, {
      body: record.blob,
      headers: {
        'Content-Type': record.blob.type || 'image/jpeg', 'X-Child-Id': String(record.childId),
        'X-Original-Filename': encodeURIComponent(record.filename || 'photo.jpg'),
        'X-Upload-Id': record.id, 'X-Captured-At': record.createdAt,
        ...(record.replacePhotoId ? { 'X-Replaces-Photo-Id': String(record.replacePhotoId) } : {}),
      },
    });
    await queue.remove(record.id); const url = objectUrls.get(record.id); if (url) URL.revokeObjectURL(url); objectUrls.delete(record.id);
    return { photo };
  } catch (error) {
      const next = { ...record, state: photoUploadRetryable(error) ? 'waiting' : 'error', retryCount: Number(record.retryCount ?? 0) + 1,
      lastError: error.message || 'Не удалось загрузить фотографию', updatedAt: new Date().toISOString() };
    await queue.put(next);
    return { error, record: next };
  }
}

async function enqueueAndUpload(lesson, childId, optimized, replacePhotoId = null) {
  const record = { id: id(), lessonId: String(lesson.id), childId: String(childId), blob: optimized.blob,
    filename: optimized.filename, width: optimized.width, height: optimized.height, replacePhotoId,
    state: 'uploading', retryCount: 0, createdAt: new Date().toISOString(), lastError: null };
  await queue.put(record); await hydratePending(lesson); legacy.state.modal = null; legacy.render();
  const result = await sendRecord(record);
  await loadLessonPhotos(lesson.id);
  return result;
}

function saveToDevice(file) {
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    navigator.share({ files: [file], title: 'Фотография занятия' }).catch(() => {}); return;
  }
  const url = URL.createObjectURL(file); const link = document.createElement('a');
  link.href = url; link.download = file.name || 'lesson-photo.jpg'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function openFilePicker(childId, replacePhotoId = null) {
  const lesson = currentLesson(); if (!lesson) return;
  if (photoItems(lesson, childId).filter((photo) => !photo.expired).length >= MAX_PHOTOS && !replacePhotoId) return window.alert('Можно добавить не больше 5 фотографий.');
  const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/jpeg,image/png,image/webp'; input.capture = 'environment';
  input.onchange = async () => {
    const file = input.files?.[0]; if (!file) return;
    try {
      const optimized = await optimizePhoto(file); const token = id(); const previewUrl = URL.createObjectURL(optimized.blob);
      staged.set(token, { file, optimized, childId, replacePhotoId, previewUrl });
      legacy.state.modal = `<h3>Фотография</h3><img src="${previewUrl}" alt="Превью" class="lesson-photo-preview"><div class="muted mini" style="margin-top:8px">В CRM будет загружена оптимизированная JPEG-копия без EXIF и геолокации.</div>
        <div class="modal-actions lesson-photo-actions"><button class="btn" onclick="icubePhotos.retake('${token}')">Переснять</button><button class="btn primary" onclick="icubePhotos.confirm('${token}',false)">Загрузить в CRM</button><button class="btn primary" onclick="icubePhotos.confirm('${token}',true)">Загрузить и сохранить копию</button></div>`;
      legacy.render();
    } catch (error) { window.alert(error.message); }
  };
  input.click();
}

async function confirm(token, saveCopy) {
  const value = staged.get(token); const lesson = currentLesson(); if (!value || !lesson) return;
  if (saveCopy) saveToDevice(value.file);
  URL.revokeObjectURL(value.previewUrl); staged.delete(token);
  const result = await enqueueAndUpload(lesson, value.childId, value.optimized, value.replacePhotoId);
  if (result.error && !photoUploadRetryable(result.error)) window.alert(result.error.message);
}

function retake(token) {
  const value = staged.get(token); if (!value) return;
  URL.revokeObjectURL(value.previewUrl); staged.delete(token); legacy.state.modal = null; openFilePicker(value.childId, value.replacePhotoId);
}

async function removePhoto(photoId, localId = null) {
  const lesson = currentLesson(); if (!lesson) return;
  try {
    if (localId) { await queue.remove(localId); const url = objectUrls.get(localId); if (url) URL.revokeObjectURL(url); objectUrls.delete(localId); }
    else await api.request(`/lessons/${lesson.id}/photos/${photoId}`, { method: 'DELETE' });
    legacy.state.modal = null; await loadLessonPhotos(lesson.id);
  } catch (error) { window.alert(error.message); }
}

async function retry(localId) {
  const record = (await queue.all()).find((item) => item.id === localId); if (!record) return;
  await queue.put({ ...record, state: 'uploading', lastError: null });
  const lesson = legacy.state.lessons.find((item) => item.id === Number(record.lessonId)); if (lesson) { await hydratePending(lesson); legacy.render(); }
  await sendRecord(record); if (lesson) await loadLessonPhotos(lesson.id);
}

async function retryAll() {
  if (!navigator.onLine) return;
  const records = (await queue.all()).filter((record) => record.state !== 'error');
  for (const record of records) await sendRecord({ ...record, state: 'uploading' });
  const lesson = currentLesson(); if (lesson) await loadLessonPhotos(lesson.id);
}

async function download(photoId) {
  const lesson = currentLesson(); const photo = Object.values(lesson?.photos ?? {}).flat().find((item) => String(item.id) === String(photoId));
  if (!lesson || !photo?.fileUrl) return;
  try {
    const blob = await api.blob(photo.fileUrl.replace('/api/v1', '')); const file = new File([blob], photo.originalFilename || `lesson-photo-${photo.id}.jpg`, { type: blob.type });
    saveToDevice(file);
  } catch (error) { window.alert(error.message); }
}

function openPhoto(childId, key) {
  const lesson = currentLesson(); const photo = photoItems(lesson, childId).find((item) => String(item.id ?? item.localId) === String(key)); if (!photo) return;
  const status = photo.localId ? (photo.status === 'error' ? `Ошибка: ${esc(photo.error)}` : 'Фото сохранено на устройстве · ожидает загрузки') : photo.expired ? 'Срок хранения фотографии истёк' : `Доступно до ${new Date(photo.expiresAt).toLocaleDateString('ru-RU')}`;
  const source = photo.previewUrl || photo.fileUrl;
  legacy.state.modal = `<h3>Фотография</h3>${source ? `<img src="${esc(source)}" alt="Фотография ребёнка" class="lesson-photo-preview">` : '<div class="lesson-photo-expired">Файл удалён по сроку хранения</div>'}<div class="muted mini" style="margin-top:8px">${status}</div><div class="modal-actions lesson-photo-actions">
    ${photo.localId ? `<button class="btn primary" onclick="icubePhotos.retry('${photo.localId}')">Повторить загрузку</button><button class="btn danger" onclick="icubePhotos.remove(null,'${photo.localId}')">Удалить</button>` : `${photo.fileUrl ? `<button class="btn" onclick="icubePhotos.download('${photo.id}')">Скачать</button>` : ''}${photo.canReplace ? `<button class="btn" onclick="icubePhotos.capture(${childId},'${photo.id}')">Заменить</button>` : ''}${photo.canDelete ? `<button class="btn danger" onclick="icubePhotos.remove('${photo.id}')">Удалить</button>` : ''}`}
    <button class="btn" onclick="closeModal()">Закрыть</button></div>`;
  legacy.render();
}

function control(child, lesson, present) {
  const photos = photoItems(lesson, child.id); const count = photos.filter((photo) => !photo.expired).length;
  const thumbs = photos.map((photo) => `<button class="lesson-photo-thumb ${photo.localId ? `is-${photo.status}` : ''} ${photo.expired ? 'is-expired' : ''}" onclick="icubePhotos.open(${child.id},'${esc(photo.id ?? photo.localId)}')" title="Открыть фотографию">${photo.previewUrl || photo.fileUrl ? `<img src="${esc(photo.previewUrl || photo.fileUrl)}" alt="Фото">` : '<span class="lesson-photo-expired-mark">⌛</span>'}<span>${photo.localId ? (photo.status === 'error' ? '!' : '↻') : photo.expired ? '×' : '✓'}</span></button>`).join('');
  const add = present && !lesson.done && count < MAX_PHOTOS ? `<button class="photo ${count ? 'done' : ''}" onclick="icubePhotos.capture(${child.id})">${count ? '+ Добавить ещё' : '📷 Добавить фото'}</button>` : '';
  return `<div class="lesson-photo-control"><div class="lesson-photo-thumbs">${thumbs}</div>${add}${count >= MAX_PHOTOS ? '<span class="muted mini">Максимум 5 фото</span>' : ''}</div>`;
}

export function hasPhoto(lesson, childId) { return photoItems(lesson, childId).some((photo) => (!photo.localId && !photo.expired) || photo.status === 'waiting' || photo.status === 'uploading'); }
export function pendingCount(lesson) { return Object.values(lesson?.photos ?? {}).flat().filter((photo) => photo?.localId && photo.status !== 'error').length; }

const originalStudentCheck = window.studentCheck;
if (typeof originalStudentCheck === 'function') window.studentCheck = function (child, lesson, extra, enrollment) {
  const output = originalStudentCheck(child, lesson, extra, enrollment);
  const extraRow = extra ? (lesson.extras ?? []).find((item) => Number(item.childId) === Number(child.id)) : null;
  const present = extra ? extraRow?.present !== false : Boolean(lesson.attendance?.[child.id]);
  return output.replace(/<button class="photo[^>]*onclick="togglePhoto\([^)]*\)"[^>]*>.*?<\/button>/, control(child, lesson, present));
};

const originalLesson = window.lesson;
if (typeof originalLesson === 'function') window.lesson = function () {
  const output = originalLesson(); const lesson = currentLesson(); if (!lesson || lesson.readOnly) return output;
  const children = [...new Set(Object.keys(lesson.photos ?? {}).map(Number))].map((childId) => legacy.state.children.find((child) => child.id === childId)).filter(Boolean);
  if (!children.length) return output;
  return `${output}<div class="card pad" style="margin-top:16px"><h2>Фотографии занятия</h2>${children.map((child) => `<div class="kpi-line"><b>${esc(child.name)}</b>${control(child, lesson, false)}</div>`).join('')}</div>`;
};

const originalOpenLesson = window.openLesson;
if (typeof originalOpenLesson === 'function') window.openLesson = function (lessonId, teacher = false) {
  originalOpenLesson(lessonId, teacher); loadLessonPhotos(lessonId);
};

window.togglePhoto = (childId) => openFilePicker(childId);
window.icubePhotos = { capture: openFilePicker, confirm, retake, open: openPhoto, remove: removePhoto, retry, retryAll, download,
  loadLessonPhotos, hasPhoto, pendingCount, control };
window.addEventListener('online', () => retryAll().catch(console.error));
window.icubeAuthReady?.then((profile) => { if (profile) retryAll().catch(console.error); });

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildTeacherOfflineSnapshot, createMemoryTeacherSnapshotStore, loadTeacherOfflineSnapshot,
  restoreTeacherOfflineSnapshot, saveTeacherOfflineSnapshot, teacherSnapshotMatchesProfile,
} from '../src/frontend/offline-teacher-snapshot.mjs';
import { createLessonActionQueue, createMemoryLessonActionStore } from '../src/data/lesson-action-queue.mjs';

const teacherProfile = { id: '2', displayName: 'Учитель', roles: ['teacher'], teacherId: '7', projectIds: [] };
const teacherState = () => ({
  selectedLesson: 90,
  groups: [{ id: 4, name: 'Роботы', direction: 'Робототехника', project: 'iCubeRobots', projectId: 2, siteId: 3, teacherId: 7, active: true }],
  sites: [{ id: 3, name: 'Школа' }, { id: 99, name: 'Лишняя площадка' }],
  teachers: [{ id: 7, name: 'Учитель', active: true }],
  children: [
    { id: 8, name: 'Ребёнок', enrollments: [{ groupId: 4, direction: 'Робототехника', status: 'Активный' }] },
    { id: 9, name: 'Лишний', enrollments: [{ groupId: 99, direction: 'Программирование', status: 'Активный' }] },
  ],
  lessons: [{
    id: 90, groupId: 4, teacherId: 7, siteId: 3, date: '25.09.2026', scheduledDate: '25.09.2026',
    attendance: { 8: false }, trialChildren: { 8: false }, extras: [], topic: '', status: 'Запланировано',
    started: false, done: false, groupChildIdsV146: [8], groupRosterFrozenV146: true, groupRosterFrozenAtV146: '2026-09-25T00:00:00Z',
  }, {
    id: 91, groupId: 4, teacherId: 7, siteId: 3, date: '20.11.2026', scheduledDate: '20.11.2026',
    attendance: {}, trialChildren: {}, extras: [], topic: '', status: 'Запланировано', started: false, done: false,
  }],
  deletedOccurrences: ['4|26.09.2026', '4|20.11.2026'],
  calendarForeignGroups: [],
  payments: [{ id: 1 }], refunds: [{ id: 1 }], balanceTransfers: [{ id: 1 }], statistics: { secret: true },
});

test('A: manifest валиден и содержит install metadata и обязательные icons', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
  assert.equal(manifest.name, 'iCube CRM');
  assert.equal(manifest.short_name, 'iCube CRM');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192'));
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512' && String(icon.purpose).includes('maskable')));
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(index, /rel="manifest" href="\.\/manifest\.webmanifest"/);
  assert.match(index, /apple-mobile-web-app-capable/);
  assert.match(index, /apple-touch-icon/);
  assert.match(index, /pwa-register\.mjs/);
});

test('A2: placeholder PNG icons имеют реальные install-размеры', async () => {
  for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
    const bytes = await readFile(new URL(`../icons/${name}`, import.meta.url));
    assert.equal(bytes.subarray(1, 4).toString('ascii'), 'PNG');
    assert.equal(bytes.readUInt32BE(16), size);
    assert.equal(bytes.readUInt32BE(20), size);
    assert.equal(bytes.subarray(-8).toString('hex'), '49454e44ae426082');
  }
});

test('B: service worker versionирует shell, чистит старые cache, кеширует critical assets и не перехватывает API', async () => {
  const source = await readFile(new URL('../service-worker.js', import.meta.url), 'utf8');
  for (const asset of ['index.html','manifest.webmanifest','crm-ui.js','api-sync.mjs','lesson-action-queue.mjs','offline-teacher-snapshot.mjs','icon-192.png','icon-512.png']) {
    assert.match(source, new RegExp(asset.replaceAll('.', '\\.')));
  }
  assert.match(source, /CACHE_NAME = 'icube-crm-shell-v\d+-/);
  assert.match(source, /key\.startsWith\(CACHE_PREFIX\).*key !== CACHE_NAME/s);
  assert.match(source, /request\.mode === 'navigate'/);
  assert.match(source, /cache\.match\(fallbackUrl\)/);
  assert.match(source, /url\.pathname\.includes\('\/api\/'\).*return/s);
  assert.doesNotMatch(source, /skipWaiting\(/);
});

test('C: online teacher state сохраняется и восстанавливает cold offline UI state без финансов', async () => {
  const store = createMemoryTeacherSnapshotStore();
  const source = teacherState();
  const snapshot = await saveTeacherOfflineSnapshot(teacherProfile, source, { store, now: new Date('2026-09-25T00:00:00Z') });
  assert.equal(snapshot.teacherId, '7');
  assert.equal(snapshot.payload.lessons.length, 1);
  assert.equal(snapshot.payload.children.length, 1);
  const reloaded = await loadTeacherOfflineSnapshot({ store });
  const fresh = { groups: [], sites: [], teachers: [], children: [], lessons: [], payments: [{ id: 99 }], refunds: [{ id: 99 }] };
  const profile = restoreTeacherOfflineSnapshot(reloaded, fresh);
  assert.equal(profile.teacherId, '7');
  assert.equal(fresh.groups[0].id, 4);
  assert.equal(fresh.children[0].id, 8);
  assert.equal(fresh.lessons[0].id, 90);
  assert.deepEqual(fresh.payments, []);
  assert.deepEqual(fresh.refunds, []);
});

test('D: первый offline launch без snapshot даёт null, а startup содержит понятный offline экран', async () => {
  const store = createMemoryTeacherSnapshotStore();
  assert.equal(await loadTeacherOfflineSnapshot({ store }), null);
  assert.equal(restoreTeacherOfflineSnapshot(null, {}), null);
  const source = await readFile(new URL('../src/frontend/api-sync.mjs', import.meta.url), 'utf8');
  assert.match(source, /Для первого входа и загрузки занятий требуется интернет\./);
});

test('E: cold restored lesson использует существующую lesson-action-queue и после reconnect отправляет start → attendance → finish', async () => {
  const snapshot = buildTeacherOfflineSnapshot(teacherProfile, teacherState(), { now: new Date('2026-09-25T00:00:00Z') });
  const coldState = {};
  restoreTeacherOfflineSnapshot(snapshot, coldState);
  assert.equal(coldState.lessons[0].id, 90);

  const store = createMemoryLessonActionStore();
  let online = false;
  const offlineQueue = createLessonActionQueue({ store, isOnline: () => online, send: async () => { throw new Error('offline send'); } });
  await offlineQueue.enqueue({ type: 'start', lessonId: 90, body: { actualTeacherId: 7 } });
  await offlineQueue.enqueue({ type: 'attendance', lessonId: 90, childId: 8, body: { present: true, trial: false } });
  await offlineQueue.enqueue({ type: 'finish', lessonId: 90, body: { topic: 'Тест' } });
  await offlineQueue.sync();
  assert.deepEqual((await offlineQueue.records()).map((item) => item.type), ['start', 'attendance', 'finish']);

  const sent = [];
  online = true;
  const reopenedQueue = createLessonActionQueue({ store, isOnline: () => online, send: async (record) => { sent.push(record.type); return {}; } });
  await reopenedQueue.sync();
  assert.deepEqual(sent, ['start', 'attendance', 'finish']);
  assert.equal((await reopenedQueue.records()).length, 0);
});

test('F: snapshot teacher A не совпадает с teacher B', () => {
  const snapshot = buildTeacherOfflineSnapshot(teacherProfile, teacherState(), { now: new Date('2026-09-25T00:00:00Z') });
  assert.equal(teacherSnapshotMatchesProfile(snapshot, teacherProfile), true);
  assert.equal(teacherSnapshotMatchesProfile(snapshot, { ...teacherProfile, id: '3', teacherId: '8' }), false);
});


test('reconnect lesson/photo sync проходит через проверку cold offline session', async () => {
  const source = await readFile(new URL('../src/frontend/api-sync.mjs', import.meta.url), 'utf8');
  assert.match(source, /async function syncLessonActionsWithSession\(\)[\s\S]*?validateColdOfflineSession\(\)[\s\S]*?lessonActions\.sync\(\)/);
  assert.match(source, /window\.icubeLessonOffline = \{[\s\S]*?sync: \(\) => syncLessonActionsWithSession\(\)/);
  assert.match(source, /coldOfflineValidationPromise/);
});

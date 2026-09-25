import { addCalendarDays, businessDate } from '../shared/business-time.mjs';

export const TEACHER_SNAPSHOT_SCHEMA_VERSION = 1;
export const TEACHER_SNAPSHOT_DB_NAME = 'icube-crm-offline-bootstrap';
const STORE = 'snapshots';
const CURRENT_KEY = 'teacher-current';

const clone = (value) => {
  if (value == null) return value;
  if (globalThis.structuredClone) return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

function ruToIso(value) {
  const match = String(value ?? '').match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : String(value ?? '').slice(0, 10);
}

function profileUserId(profile) {
  return String(profile?.id ?? profile?.userId ?? '');
}

export function isOfflineTeacherProfile(profile) {
  const roles = profile?.roles ?? [];
  return Boolean(profile?.teacherId && roles.includes('teacher')
    && !roles.includes('director') && !roles.includes('partner') && !roles.includes('parent'));
}

export function teacherSnapshotMatchesProfile(snapshot, profile) {
  if (!snapshot || !profile) return false;
  return String(snapshot.userId) === profileUserId(profile)
    && String(snapshot.teacherId) === String(profile.teacherId ?? '')
    && isOfflineTeacherProfile(profile);
}

export function createMemoryTeacherSnapshotStore(initial = null) {
  let current = initial ? clone(initial) : null;
  return {
    async get() { return current ? clone(current) : null; },
    async put(value) { current = clone(value); },
    async clear() { current = null; },
  };
}

export function createTeacherSnapshotStore(indexedDb = globalThis.indexedDB) {
  let dbPromise;
  function database() {
    if (!indexedDb) return Promise.reject(new Error('IndexedDB недоступен'));
    dbPromise ??= new Promise((resolve, reject) => {
      const request = indexedDb.open(TEACHER_SNAPSHOT_DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'key' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return dbPromise;
  }
  async function transact(mode, operation) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      let request;
      try { request = operation(store); } catch (error) { reject(error); return; }
      tx.oncomplete = () => resolve(request?.result ?? null);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
  return {
    get: () => transact('readonly', (store) => store.get(CURRENT_KEY)),
    put: (value) => transact('readwrite', (store) => store.put({ ...value, key: CURRENT_KEY })),
    clear: () => transact('readwrite', (store) => store.delete(CURRENT_KEY)),
  };
}

let defaultStore;
const storeOrDefault = (store) => store ?? (defaultStore ??= createTeacherSnapshotStore());

function selectedTeacherLessons(state, now = new Date()) {
  const from = addCalendarDays(businessDate(now), -14);
  const to = addCalendarDays(businessDate(now), 14);
  const selectedId = state.selectedLesson == null ? null : Number(state.selectedLesson);
  return (state.lessons ?? []).filter((lesson) => {
    const date = ruToIso(lesson.scheduledDate || lesson.date);
    return (date >= from && date <= to) || (lesson.started && !lesson.done) || Number(lesson.id) === selectedId;
  });
}

function selectedDeletedOccurrences(state, now = new Date()) {
  const from = addCalendarDays(businessDate(now), -14);
  const to = addCalendarDays(businessDate(now), 14);
  return (state.deletedOccurrences ?? []).filter((value) => {
    const [, rawDate = ''] = String(value).split('|');
    const date = ruToIso(rawDate);
    return date >= from && date <= to;
  });
}

export function buildTeacherOfflineSnapshot(profile, state, { now = new Date() } = {}) {
  if (!isOfflineTeacherProfile(profile)) return null;
  const lessons = selectedTeacherLessons(state, now);
  const groupIds = new Set(lessons.map((lesson) => Number(lesson.groupId)));
  for (const group of state.groups ?? []) {
    if (Number(group.teacherId) === Number(profile.teacherId)) groupIds.add(Number(group.id));
  }
  const groups = (state.groups ?? []).filter((group) => groupIds.has(Number(group.id)));
  const siteIds = new Set(groups.map((group) => Number(group.siteId)));
  for (const lesson of lessons) if (lesson.siteId != null) siteIds.add(Number(lesson.siteId));
  const childIds = new Set();
  for (const lesson of lessons) {
    for (const childId of lesson.groupChildIdsV146 ?? []) childIds.add(Number(childId));
    for (const childId of Object.keys(lesson.attendance ?? {})) childIds.add(Number(childId));
    for (const extra of lesson.extras ?? []) childIds.add(Number(extra.childId));
  }
  for (const child of state.children ?? []) {
    if ((child.enrollments ?? []).some((enrollment) => groupIds.has(Number(enrollment.groupId)))) childIds.add(Number(child.id));
  }
  const safeProfile = {
    id: profileUserId(profile), displayName: String(profile.displayName ?? 'Преподаватель'),
    roles: ['teacher'], teacherId: String(profile.teacherId), projectIds: clone(profile.projectIds ?? []),
  };
  return {
    schemaVersion: TEACHER_SNAPSHOT_SCHEMA_VERSION,
    savedAt: now.toISOString(),
    userId: safeProfile.id,
    role: 'teacher',
    teacherId: safeProfile.teacherId,
    profile: safeProfile,
    payload: {
      groups: clone(groups),
      sites: clone((state.sites ?? []).filter((site) => siteIds.has(Number(site.id)))),
      teachers: clone((state.teachers ?? []).filter((teacher) => Number(teacher.id) === Number(profile.teacherId))),
      children: clone((state.children ?? []).filter((child) => childIds.has(Number(child.id)))),
      lessons: clone(lessons),
      deletedOccurrences: clone(selectedDeletedOccurrences(state, now)),
      calendarForeignGroups: clone(state.calendarForeignGroups ?? []),
      prototypeTeacherId: Number(profile.teacherId),
    },
  };
}

export async function saveTeacherOfflineSnapshot(profile, state, { store, now } = {}) {
  const snapshot = buildTeacherOfflineSnapshot(profile, state, { now });
  if (!snapshot) return null;
  await storeOrDefault(store).put(snapshot);
  return snapshot;
}

export async function loadTeacherOfflineSnapshot({ store } = {}) {
  const snapshot = await storeOrDefault(store).get();
  if (!snapshot || snapshot.schemaVersion !== TEACHER_SNAPSHOT_SCHEMA_VERSION || snapshot.role !== 'teacher'
    || !snapshot.userId || !snapshot.teacherId || !snapshot.payload) return null;
  return snapshot;
}

export async function clearTeacherOfflineSnapshot({ store } = {}) {
  await storeOrDefault(store).clear();
}

export function restoreTeacherOfflineSnapshot(snapshot, state) {
  if (!snapshot || snapshot.schemaVersion !== TEACHER_SNAPSHOT_SCHEMA_VERSION || snapshot.role !== 'teacher' || !snapshot.payload) return null;
  const payload = clone(snapshot.payload);
  state.sites = payload.sites ?? [];
  state.teachers = payload.teachers ?? [];
  state.groups = payload.groups ?? [];
  state.children = payload.children ?? [];
  state.lessons = payload.lessons ?? [];
  state.deletedOccurrences = payload.deletedOccurrences ?? [];
  state.calendarForeignGroups = payload.calendarForeignGroups ?? [];
  state.prototypeTeacherId = Number(payload.prototypeTeacherId ?? snapshot.teacherId);
  state.payments = [];
  state.refunds = [];
  state.balanceTransfers = [];
  state.statistics = null;
  state.notifications = [];
  state.dailySummary = null;
  state.salaryReportRows = [];
  state.rentReport = null;
  return clone(snapshot.profile);
}

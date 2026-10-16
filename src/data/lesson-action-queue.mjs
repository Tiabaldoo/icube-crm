import { ApiError } from './api-client.mjs';

const DB_NAME = 'icube-crm-lesson-action-queue';
const STORE = 'actions';
const MAPPINGS = 'childMappings';
let sequence = 0;

const actionId = () => globalThis.crypto?.randomUUID?.() ?? `lesson-action-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const actionOrder = () => String(Date.now() * 1000 + sequence++ % 1000).padStart(16, '0');
const sorted = (items) => [...items].sort((left, right) => String(left.order).localeCompare(String(right.order)) || String(left.id).localeCompare(String(right.id)));
const dependsOn = (failed, current) => {
  const failedChildId = failed.childId ?? failed.tempChildId;
  return failed.type === 'start' || current.type === 'finish'
    || (failedChildId != null && String(failedChildId) === String(current.childId));
};

export function lessonActionRetryable(error) {
  return !(error instanceof ApiError) || error.status >= 500 || error.status === 408 || error.status === 429;
}

export function createLessonActionStore(indexedDb = globalThis.indexedDB) {
  let dbPromise;
  function database() {
    if (!indexedDb) return Promise.reject(new Error('IndexedDB недоступен'));
    dbPromise ??= new Promise((resolve, reject) => {
      const request = indexedDb.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('lessonId', 'lessonId');
        request.result.createObjectStore(MAPPINGS, { keyPath: 'localChildId' });
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
      let request;
      try { request = operation(store); } catch (error) { reject(error); return; }
      tx.oncomplete = () => resolve(request?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
  async function replaceChildId(localChildId, serverChildId, ownerId) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE, MAPPINGS], 'readwrite'); const store = tx.objectStore(STORE); const request = store.getAll();
      request.onsuccess = () => {
        for (const record of request.result) {
          if (String(record.childId) !== String(localChildId) || record.ownerId !== ownerId) continue;
          store.put({ ...record, childId: String(serverChildId), body: { ...record.body, childId: String(serverChildId) } });
        }
        tx.objectStore(MAPPINGS).put({ localChildId: String(localChildId), serverChildId: String(serverChildId), ownerId, createdAt: new Date().toISOString() });
      };
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    });
  }
  return {
    put: (record) => transaction('readwrite', (store) => store.put(record)),
    remove: (id) => transaction('readwrite', (store) => store.delete(id)),
    all: () => transaction('readonly', (store) => store.getAll()),
    replaceChildId,
    mappings: async () => {
      const db = await database();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(MAPPINGS, 'readonly'); const request = tx.objectStore(MAPPINGS).getAll();
        tx.oncomplete = () => resolve(request.result); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
      });
    },
    removeMapping: async (localChildId) => {
      const db = await database();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(MAPPINGS, 'readwrite'); tx.objectStore(MAPPINGS).delete(String(localChildId));
        tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
      });
    },
    putMapping: async (mapping) => {
      const db = await database();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(MAPPINGS, 'readwrite'); tx.objectStore(MAPPINGS).put(mapping);
        tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
      });
    },
  };
}

export function createMemoryLessonActionStore(initial = []) {
  const records = new Map(initial.map((record) => [record.id, structuredClone(record)]));
  const mappings = new Map();
  return {
    async put(record) { records.set(record.id, structuredClone(record)); },
    async remove(id) { records.delete(id); },
    async all() { return [...records.values()].map((record) => structuredClone(record)); },
    async replaceChildId(localChildId, serverChildId, ownerId) {
      for (const record of records.values()) if (String(record.childId) === String(localChildId) && record.ownerId === ownerId) {
        records.set(record.id, { ...record, childId: String(serverChildId), body: { ...record.body, childId: String(serverChildId) } });
      }
      mappings.set(String(localChildId), { localChildId: String(localChildId), serverChildId: String(serverChildId), ownerId });
    },
    async mappings() { return [...mappings.values()].map((value) => ({ ...value })); },
    async removeMapping(localChildId) { mappings.delete(String(localChildId)); },
    async putMapping(mapping) { mappings.set(String(mapping.localChildId), structuredClone(mapping)); },
  };
}

export function createLessonActionQueue({
  store = createLessonActionStore(), send, isOnline = () => globalThis.navigator?.onLine !== false,
  onStatus = () => {}, onChildResolved = async () => {}, onSynced = async () => {}, makeId = actionId,
  getOwner = () => 'standalone', onConflict = async () => {},
} = {}) {
  let syncPromise = null;
  let enqueuePromise = Promise.resolve();
  let generation = 0;
  const ownerId = () => getOwner() == null ? null : String(getOwner());
  const owned = (record) => ownerId() != null && String(record.ownerId ?? '') === ownerId();

  async function records() { return sorted(await store.all()); }
  async function publish() {
    const items = await records(); const status = {
      pending: items.filter((item) => owned(item) && item.state !== 'error').length,
      failed: items.filter((item) => owned(item) && item.state === 'error').length,
      held: items.filter((item) => !owned(item)).length,
      total: items.length,
    };
    onStatus(status, items); return status;
  }
  async function enqueueNow(input, actor) {
    if (!actor) throw new Error('Для сохранения изменения требуется пользователь');
    generation += 1;
    const items = await records();
    if (input.type === 'attendance') {
      // A remove/add or finish is a semantic boundary: never move a later mark before it.
      const latest = [...items].reverse().find((item) => item.ownerId === actor && String(item.lessonId) === String(input.lessonId)
        && (String(item.childId) === String(input.childId) || ['start', 'finish'].includes(item.type)));
      const existing = latest?.type === 'attendance' && latest.state !== 'sending' ? latest : null;
      if (existing) {
        const next = { ...existing, body: { ...input.body }, state: 'pending', lastError: null, updatedAt: new Date().toISOString() };
        await store.put(next); await publish(); return next;
      }
    }
    const now = new Date().toISOString();
    const record = { ...input, ownerId: actor, id: input.id ?? makeId(), order: input.order ?? actionOrder(), lessonId: String(input.lessonId),
      childId: input.childId == null ? null : String(input.childId), state: 'pending', retryCount: 0, lastError: null, createdAt: now, updatedAt: now };
    await store.put(record); await publish(); return record;
  }
  function enqueue(input) {
    const actor = ownerId();
    return exclusive(() => enqueueNow(input, actor));
  }
  function exclusive(operation) {
    const next = enqueuePromise.then(operation);
    enqueuePromise = next.catch(() => {});
    return next;
  }
  async function adoptLegacyOwner(actor) {
    if (actor == null) return;
    for (const record of await records()) if (record.ownerId == null) await store.put({ ...record, ownerId: String(actor) });
    for (const mapping of await store.mappings?.() ?? []) if (mapping.ownerId == null) await store.putMapping?.({ ...mapping, ownerId: String(actor) });
  }
  async function pendingForLesson(lessonId) { return (await records()).filter((item) => owned(item) && String(item.lessonId) === String(lessonId)); }
  async function readyForPhoto(lessonId, childId) {
    if (Number(childId) < 0) return false;
    return !(await pendingForLesson(lessonId)).some((item) => item.type !== 'finish');
  }
  async function mappings() { return (await store.mappings?.() ?? []).filter((mapping) => owned(mapping)); }
  async function acknowledgeMapping(localChildId) { await store.removeMapping?.(localChildId); }
  async function syncNow() {
    if (!isOnline()) { await publish(); return; }
    const actor = ownerId();
    const touched = new Set(); const blockers = new Map(); const resolvedChildren = new Map();
    for (const current of await records()) {
      if (ownerId() !== actor) break;
      if (!owned(current)) continue;
      // Read again: enqueue may have updated a pending record during an earlier send.
      const fresh = (await records()).find((item) => item.id === current.id);
      if (!fresh) continue;
      Object.assign(current, fresh);
      const lessonId = String(current.lessonId);
      const failed = blockers.get(lessonId) ?? [];
      if (current.state === 'error') { failed.push(current); blockers.set(lessonId, failed); continue; }
      if (failed.some((item) => dependsOn(item, current))) continue;
      if (!isOnline()) break;
      const sending = await exclusive(async () => {
        const latest = (await records()).find((item) => item.id === current.id);
        if (!latest || latest.state === 'error' || !owned(latest) || ownerId() !== actor) return null;
        const resolvedChildId = resolvedChildren.get(String(latest.childId));
        const claimed = { ...latest, ...(resolvedChildId ? { childId: resolvedChildId, body: { ...latest.body, childId: resolvedChildId } } : {}),
          state: 'sending', updatedAt: new Date().toISOString() };
        await store.put(claimed); return claimed;
      });
      if (!sending) continue;
      await publish();
      if (ownerId() !== actor) { await store.put({ ...sending, state: 'pending' }); break; }
      try {
        const result = await send(sending);
        if (sending.type === 'quick-child') {
          const serverChildId = result?.childId;
          if (!serverChildId) throw new Error('Сервер не вернул ID созданного ребёнка');
          await store.replaceChildId(sending.tempChildId, serverChildId, actor);
          resolvedChildren.set(String(sending.tempChildId), String(serverChildId));
          if (ownerId() === actor) await onChildResolved(sending.lessonId, sending.tempChildId, String(serverChildId));
        }
        await store.remove(sending.id); touched.add(lessonId);
      } catch (error) {
        const retryable = lessonActionRetryable(error);
        await store.put({ ...sending, state: retryable ? 'pending' : 'error', retryCount: Number(sending.retryCount ?? 0) + 1,
          lastError: error.message || 'Не удалось отправить изменение', errorCode: error.code ?? null, updatedAt: new Date().toISOString() });
        failed.push(sending); blockers.set(lessonId, failed);
        if (!retryable && ownerId() === actor) await onConflict(sending, error);
      }
      await publish();
    }
    if (touched.size && ownerId() === actor) await onSynced([...touched]);
    await publish();
  }
  function sync() {
    if (!syncPromise) syncPromise = (async () => {
      let observed;
      do { observed = generation; await syncNow(); } while (generation !== observed && isOnline());
    })().finally(() => { syncPromise = null; });
    return syncPromise;
  }
  async function retry(lessonId = null) {
    for (const record of await records()) {
      if (!owned(record)) continue;
      if (record.state !== 'error' || (lessonId != null && String(record.lessonId) !== String(lessonId))) continue;
      await store.put({ ...record, state: 'pending', lastError: null, errorCode: null, updatedAt: new Date().toISOString() });
    }
    await publish(); return sync();
  }
  async function optimisticRecords(lessonId = null) {
    const blockers = []; const result = [];
    for (const record of await records()) {
      if (!owned(record) || (lessonId != null && String(record.lessonId) !== String(lessonId))) continue;
      if (record.state === 'error') { blockers.push(record); continue; }
      if (blockers.some((failed) => failed.lessonId === record.lessonId && dependsOn(failed, record))) continue;
      result.push(record);
    }
    return result;
  }
  return { enqueue, sync, retry, records, pendingForLesson, readyForPhoto, mappings, acknowledgeMapping, publish, adoptLegacyOwner,
    owns: owned, optimisticRecords };
}

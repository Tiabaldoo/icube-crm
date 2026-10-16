import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { updateBlocker, watchUpdates } from '../src/frontend/pwa-register.mjs';
import { createLessonActionQueue, createMemoryLessonActionStore } from '../src/data/lesson-action-queue.mjs';

const base = 'https://crm.example.test/crm/';
const shellSource = await readFile(new URL('../src/frontend/pwa-shell.js', import.meta.url), 'utf8');
const workerSource = await readFile(new URL('../service-worker.js', import.meta.url), 'utf8');
const registerSource = await readFile(new URL('../src/frontend/pwa-register.mjs', import.meta.url), 'utf8');
const tick = () => new Promise(setImmediate);

function memoryCaches(names = []) {
  const data = new Map(names.map((name) => [name, new Map()])); const deleted = [];
  const key = (value) => typeof value === 'string' ? value : value.url;
  return { data, deleted, async keys() { return [...data.keys()]; },
    async delete(name) { deleted.push(name); return data.delete(name); },
    async open(name) {
      if (!data.has(name)) data.set(name, new Map());
      const rows = data.get(name);
      return { async put(url, response) { rows.set(key(url), response.clone()); }, async match(url) { return rows.get(key(url))?.clone(); } };
    } };
}

function shellFixture({ href = `${base}service-worker.js`, caches = memoryCaches() } = {}) {
  let online = true; let changed = ''; const fetched = []; const handlers = new Map();
  const windows = [{ id: 'page' }]; const messages = []; let skipped = 0; let claimed = 0;
  const fetch = async (request, options = {}) => {
    fetched.push({ url: typeof request === 'string' ? request : request.url, options });
    if (!online) throw new Error('offline');
    const url = new URL(typeof request === 'string' ? request : request.url);
    return new Response(`${url.pathname}:${url.pathname.endsWith('api-sync.mjs') ? changed : ''}`, { status: 200 });
  };
  const context = vm.createContext({ URL, Request, Response, TextEncoder, Uint8Array, crypto: webcrypto, caches, fetch, console,
    self: { location: new URL(href), registration: { scope: base },
      addEventListener(type, listener) { handlers.set(type, listener); },
      async skipWaiting() { skipped++; },
      clients: { async matchAll() { return windows; }, async claim() { claimed++; } } },
    importScripts() { vm.runInContext(shellSource, context); } });
  vm.runInContext(workerSource, context);
  return { context, caches, fetched, windows, messages, get skipped() { return skipped; }, get claimed() { return claimed; },
    set online(value) { online = value; }, set changed(value) { changed = value; },
    prepare: () => context.icubePwaShell.prepare({ baseUrl: base }),
    async event(type, extra = {}) {
      let pending; let response;
      handlers.get(type)({ waitUntil(value) { pending = value; }, respondWith(value) { response = value; }, ...extra });
      await pending; return response;
    }, source: { id: 'page', postMessage(message) { messages.push(message); } } };
}

class Target {
  listeners = new Map();
  addEventListener(type, listener) { const items = this.listeners.get(type) ?? []; items.push(listener); this.listeners.set(type, items); }
  async fire(type, event = {}) { for (const listener of this.listeners.get(type) ?? []) await listener(event); await tick(); }
}

function pageFixture() {
  const document = new Target(); document.fields = []; document.modal = false; document.body = { children: [], append(el) { this.children.push(el); } };
  document.querySelector = () => document.modal ? {} : null; document.querySelectorAll = () => document.fields;
  document.createElement = () => ({ style: {}, children: [], setAttribute() {}, addEventListener() {},
    append(...items) { this.children.push(...items); }, querySelector() { return this.children[0]; } });
  let reloads = 0; let photo = false; let state = { pending: 0, saving: false, draft: false };
  const host = { navigator: { onLine: true }, location: { reload() { reloads++; } },
    icubePwaUpdateState: async () => state, icubePhotos: { hasUnsynced: async () => photo } };
  const sent = []; const registration = new Target(); registration.waiting = { postMessage(message) { sent.push(message); } };
  const serviceWorker = new Target();
  return { host, document, registration, serviceWorker, sent, get reloads() { return reloads; },
    set state(value) { state = value; }, set photo(value) { photo = value; },
    watch: (options = {}) => watchUpdates(registration, serviceWorker, { host, document, ...options }) };
}

test('frontend release changes automatically when an asset changes; identical reopen uses the same cache version', async () => {
  const f = shellFixture(); const first = await f.prepare(); const same = await f.prepare();
  assert.match(first.release, /^[a-f0-9]{64}$/); assert.equal(first.release, same.release);
  f.changed = 'new frontend without editing service-worker.js'; const next = await f.prepare();
  assert.notEqual(next.release, first.release); assert.notEqual(next.cacheName, first.cacheName);
  assert.ok(f.fetched.every(({ options }) => options.cache === 'no-cache'));
  assert.ok(f.fetched.every(({ url }) => new URL(url).searchParams.get('__pwa_probe') === '1'));
  const marker = await (await f.caches.open(next.cacheName)).match(`${base}__pwa_release__`);
  assert.equal((await marker.json()).release, next.release);
});

test('single shell inventory covers index assets and every browser module import, including mixed-group UI', async () => {
  const { context } = shellFixture(); const paths = [...context.icubePwaShell.paths];
  const urls = new Set(paths.map((path) => new URL(path, base).href));
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(index, /20260930-11|\?v=\d/);
  for (const [, path] of index.matchAll(/(?:src|href)="(\.\/[^"?]+)"/g)) assert.ok(urls.has(new URL(path, base).href), path);
  for (const path of paths.filter((path) => path.endsWith('.mjs'))) {
    const source = await readFile(new URL(`../${path.slice(2)}`, import.meta.url), 'utf8');
    for (const [, imported] of source.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)) {
      assert.ok(urls.has(new URL(imported, new URL(path, base)).href), `${path} -> ${imported}`);
    }
  }
});

test('unversioned v2 worker migration precaches fresh assets but never activates or reloads without approval', async () => {
  const f = shellFixture({ caches: memoryCaches(['icube-crm-shell-v2-20260930-11', 'unrelated-photo-cache']) });
  await f.event('install'); assert.equal(f.skipped, 0); assert.equal(f.caches.deleted.length, 0);
  f.windows.push({ id: 'other-pwa' });
  await f.event('message', { data: { type: 'PWA_ACTIVATE_UPDATE' }, source: f.source });
  assert.equal(f.skipped, 0); assert.equal(f.messages[0].type, 'PWA_UPDATE_BLOCKED');
  f.windows.pop(); await f.event('message', { data: { type: 'PWA_ACTIVATE_UPDATE' }, source: f.source });
  assert.equal(f.skipped, 1); await f.event('activate'); assert.equal(f.claimed, 1);
  assert.equal(f.caches.data.has('icube-crm-shell-v2-20260930-11'), false);
  assert.equal(f.caches.data.has('unrelated-photo-cache'), true);
});

test('versioned installation uses only a completely prepared matching shell and survives a cold offline open', async () => {
  const first = shellFixture(); const prepared = await first.prepare();
  const f = shellFixture({ href: `${base}service-worker.js?v=${prepared.release}`, caches: first.caches }); f.online = false;
  await f.event('install'); assert.equal(f.fetched.length, 0);
  const page = await f.event('fetch', { request: { method: 'GET', mode: 'navigate', url: base } });
  assert.match(await page.text(), /index\.html/);
  const module = await f.event('fetch', { request: { method: 'GET', url: `${base}src/frontend/advanced-groups.mjs?v=20260930-11` } });
  assert.match(await module.text(), /advanced-groups\.mjs/);
  assert.equal(await f.event('fetch', { request: { method: 'GET', url: `${base}api/v1/children` } }), undefined);
  assert.equal(await f.event('fetch', { request: { method: 'POST', url: `${base}api/v1/lessons` } }), undefined);
  assert.equal(await f.event('fetch', { request: { method: 'GET', url: `${base}index.html?__pwa_probe=1` } }), undefined,
    'release probes never accept an offline cache response');
});

test('failed online check preserves the last offline shell; a racing deployment cannot install a different release', async () => {
  const f = shellFixture(); const previous = await f.prepare(); f.online = false;
  await assert.rejects(f.prepare(), /offline/); assert.ok(f.caches.data.has(previous.cacheName)); assert.deepEqual(f.caches.deleted, []);
  const race = shellFixture({ href: `${base}service-worker.js?v=${'f'.repeat(64)}`, caches: f.caches });
  await assert.rejects(race.event('install'), /Frontend changed during update/);
  assert.equal(race.skipped, 0); assert.ok(race.caches.data.has(previous.cacheName));
  assert.equal(race.caches.data.get(`icube-crm-shell-v3-${'f'.repeat(64)}`).size, 0, 'wrong-version install never writes assets into its target cache');
});

test('pending, failed and other-owner offline lesson commands block refresh without mutating IndexedDB records', async () => {
  const store = createMemoryLessonActionStore();
  const queue = createLessonActionQueue({ store, getOwner: () => 'other-user', isOnline: () => false });
  await queue.enqueue({ type: 'attendance', lessonId: 90, childId: 8, body: { present: true } });
  const records = await queue.records(); const f = pageFixture();
  f.host.icubePwaUpdateState = async () => ({ pending: (await queue.records()).length });
  const watch = f.watch(); assert.equal(await watch.apply(), false);
  assert.equal(f.sent.length, 0); assert.equal(f.reloads, 0); assert.deepEqual(await queue.records(), records);
  await store.put({ ...records[0], state: 'error' }); assert.equal(await watch.apply(), false);
  await store.remove(records[0].id); assert.equal(await watch.apply(), true);
  assert.equal(f.sent[0].type, 'PWA_ACTIVATE_UPDATE');
});

test('photos, unsaved topic/form, in-flight save, edited field and storage failure all block updating', async () => {
  const f = pageFixture(); const watch = f.watch();
  for (const state of [{ draft: true }, { saving: true }, { pending: 1 }]) {
    f.state = state; assert.equal(await watch.apply(), false);
  }
  f.state = {}; f.photo = true; assert.equal(await watch.apply(), false); f.photo = false;
  f.document.fields = [{ value: 'unsaved topic', defaultValue: '', tagName: 'TEXTAREA' }];
  assert.equal(await watch.apply(), false); f.document.fields = [];
  f.document.modal = true; assert.equal(await watch.apply(), false); f.document.modal = false;
  f.host.icubePhotos.hasUnsynced = async () => { throw new Error('IDB unavailable'); };
  assert.equal(await watch.apply(), false); assert.equal(f.reloads, 0); assert.deepEqual(f.sent, []);
});

test('first selected option without selected attribute is not mistaken for unsaved input', async () => {
  const f = pageFixture(); f.document.fields = [{ tagName: 'SELECT', options: [{ selected: true, defaultSelected: false }] }];
  assert.equal(await updateBlocker(f.host, f.document), null);
});

test('controller changes do not reload automatically; explicit safe update reloads at most once', async () => {
  const f = pageFixture(); const watch = f.watch(); watch.offer();
  assert.equal(f.document.body.children.length, 1);
  await f.serviceWorker.fire('controllerchange'); assert.equal(f.reloads, 0);
  assert.equal(await watch.apply(), true);
  await f.serviceWorker.fire('controllerchange'); await f.serviceWorker.fire('controllerchange');
  assert.equal(f.reloads, 1);
});

test('an edit or unsynced command arriving during activation cancels reload until the user retries', async () => {
  const f = pageFixture(); const watch = f.watch(); await watch.apply();
  await f.document.fire('input'); f.state = { pending: 1 };
  await f.serviceWorker.fire('controllerchange'); assert.equal(f.reloads, 0);
  f.state = {}; f.registration.waiting = null;
  assert.equal(await watch.apply(), true); assert.equal(f.reloads, 1);
});

test('input arriving while the final IndexedDB safety check is pending prevents reload', async () => {
  const f = pageFixture(); let finish; let calls = 0;
  const watch = f.watch({ canUpdate: () => ++calls === 1 ? Promise.resolve(null) : new Promise((resolve) => { finish = resolve; }) });
  await watch.apply(); const change = f.serviceWorker.fire('controllerchange');
  await f.document.fire('click'); finish(null); await change;
  assert.equal(f.reloads, 0);
});

test('another open CRM/PWA window blocks activation and does not trigger a later surprise reload', async () => {
  const f = pageFixture(); const watch = f.watch(); await watch.apply();
  await f.serviceWorker.fire('message', { data: { type: 'PWA_UPDATE_BLOCKED' } });
  await f.serviceWorker.fire('controllerchange'); assert.equal(f.reloads, 0);
});

test('reopening registers the same hashed worker without a new install; new frontend bytes change its URL', async () => {
  const f = shellFixture(); let current; let installs = 0; let watches = 0;
  const registration = {}; const calls = [];
  const sw = { async register(url, options) { calls.push({ url, options }); if (url !== current) installs++; current = url; return registration; },
    async getRegistration() { return registration; } };
  f.context.location = new URL(base); f.context.navigator = { onLine: true };
  f.context.watchUpdates = () => { watches++; return { offer() {} }; };
  vm.runInContext('let updateWatch;\n' + registerSource.slice(registerSource.indexOf('export async function registerPwa'), registerSource.indexOf('if (globalThis.window)')).replace('export async', 'async'), f.context);
  await f.context.registerPwa(sw); await f.context.registerPwa(sw);
  assert.equal(installs, 1); assert.equal(watches, 1); assert.equal(calls[0].options.updateViaCache, 'none');
  f.changed = 'next release'; await f.context.registerPwa(sw); assert.equal(installs, 2);
  f.context.navigator.onLine = false; const reads = f.fetched.length;
  await f.context.registerPwa(sw); assert.equal(f.fetched.length, reads); assert.equal(installs, 2);
});

test('returning from the browser back-forward cache and reconnecting check for a new release without reloading', async () => {
  const host = new Target(); const document = new Target(); document.visibilityState = 'visible'; let checks = 0;
  const context = vm.createContext({ window: host, document, navigator: { onLine: true }, Date, console, registerPwa: async () => { checks++; } });
  vm.runInContext(registerSource.slice(registerSource.indexOf('if (globalThis.window)')), context);
  await host.fire('load'); assert.equal(checks, 1);
  await host.fire('focus'); assert.equal(checks, 1, 'focus does not continuously redownload the shell');
  await host.fire('pageshow', { persisted: true }); assert.equal(checks, 2);
  await host.fire('online'); assert.equal(checks, 3);
});

test('update path never clears user data, sessions or push subscriptions; safety readers cover persistent queues', async () => {
  const api = await readFile(new URL('../src/frontend/api-sync.mjs', import.meta.url), 'utf8');
  const photos = await readFile(new URL('../src/frontend/lesson-photos.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(registerSource + shellSource + workerSource, /indexedDB\.deleteDatabase|\.unregister\(|\.unsubscribe\(|localStorage\.clear|sessionStorage\.clear/);
  assert.match(api, /icubePwaUpdateState[\s\S]*lessonActions\.records\(\)[\s\S]*lesson\.topic !== lesson\.syncedTopic/);
  assert.match(photos, /hasUnsynced:[^\n]*preparingPhoto[^\n]*staged\.size[^\n]*queue\.all\(\)/);
});

test('real application guard protects unsaved topics across rerenders and older cold offline snapshots', async () => {
  const source = await readFile(new URL('../src/frontend/api-sync.mjs', import.meta.url), 'utf8');
  const state = { lessons: [{ topic: 'saved', syncedTopic: 'saved' }], modal: null, pendingGroupDraft: { oldClosedForm: true } };
  const context = vm.createContext({ window: {}, legacy: { state, render() {} }, console,
    lessonActions: { records: async () => [], publish: async () => {} },
    groupSavePending: false, childSavePending: false, paymentSavePending: false, refundSavePending: false, balanceTransferPending: false, lessonActionPending: 0,
    loadTeacherOfflineSnapshot: async () => ({}), restoreTeacherOfflineSnapshot: () => ({}),
    applyAuthProfile() {}, reapplyQueuedLessonState: async () => {}, handlePushDeepLink: async () => {} });
  const start = source.indexOf('window.icubePwaUpdateState =');
  vm.runInContext(source.slice(start, source.indexOf('window.addEventListener', start)), context);
  assert.equal((await context.window.icubePwaUpdateState()).draft, false, 'an old closed group draft does not prevent all future updates');
  state.lessons[0].topic = 'unsaved after rerender'; assert.equal((await context.window.icubePwaUpdateState()).draft, true);
  delete state.lessons[0].syncedTopic; state.lessons[0].topic = 'old offline topic';
  vm.runInContext(source.slice(source.indexOf('async function restoreColdOfflineTeacher'), source.indexOf('async function settleAuthReady')), context);
  await context.restoreColdOfflineTeacher(); assert.equal(state.lessons[0].syncedTopic, 'old offline topic');
  state.lessons[0].topic = 'new unsaved topic'; assert.equal((await context.window.icubePwaUpdateState()).draft, true);
});

test('a lesson command still being committed to IndexedDB blocks update before it appears in the queue', async () => {
  const source = await readFile(new URL('../src/frontend/api-sync.mjs', import.meta.url), 'utf8');
  let commit; const context = vm.createContext({ window: {}, legacy: { state: { lessons: [] }, render() {} },
    lessonActionPending: 0, groupSavePending: false, childSavePending: false, paymentSavePending: false, refundSavePending: false, balanceTransferPending: false,
    lessonActions: { records: async () => [], enqueue: () => new Promise((resolve) => { commit = resolve; }), sync: async () => {} }, applyLessonAction() {} });
  const start = source.indexOf('window.icubePwaUpdateState =');
  vm.runInContext(source.slice(start, source.indexOf('window.addEventListener', start))
    + source.slice(source.indexOf('async function queueLessonAction'), source.indexOf('async function reloadLesson')), context);
  const saving = context.queueLessonAction({ type: 'attendance' });
  assert.equal((await context.window.icubePwaUpdateState()).saving, true);
  commit({}); await saving; assert.equal((await context.window.icubePwaUpdateState()).saving, false);
});

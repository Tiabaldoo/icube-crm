importScripts('./src/frontend/pwa-shell.js');
const CACHE_PREFIX = 'icube-crm-shell-';
const release = new URL(self.location.href).searchParams.get('v');
// The unversioned URL is retained for the existing v2 registration's migration.
const CACHE_NAME = icubePwaShell.prefix + (/^[a-f0-9]{64}$/.test(release ?? '') ? release : 'migration');
const STATIC_PATHS = icubePwaShell.paths;

const scopedUrl = (path) => new URL(path, self.registration.scope).href;
const shellUrl = () => scopedUrl('./index.html');
const staticUrls = () => new Set(STATIC_PATHS.map(scopedUrl));

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const marker = await cache.match(scopedUrl(icubePwaShell.marker));
    if (marker && (await marker.json()).release === release
      && (await Promise.all(STATIC_PATHS.map((path) => cache.match(scopedUrl(path))))).every(Boolean)) return;
    await icubePwaShell.prepare({ baseUrl: self.registration.scope, cacheName: CACHE_NAME, expectedRelease: release });
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys
    .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
    .map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'PWA_ACTIVATE_UPDATE') return;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Older pages cannot answer a safety check. Never replace their shell under
    // an open form/offline action in another tab or installed PWA window.
    if (windows.some((client) => client.id !== event.source?.id)) {
      event.source?.postMessage({ type: 'PWA_UPDATE_BLOCKED' }); return;
    }
    await self.skipWaiting();
  })());
});

async function networkFirst(request, fallbackUrl = request.url) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Shell request failed: ${response.status}`);
    if (response.ok) await cache.put(fallbackUrl, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(fallbackUrl);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/api/')) return;
  if (url.searchParams.has('__pwa_probe')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, shellUrl()));
    return;
  }

  // Accept old ?v=20260930-11 URLs too; cache keys are canonical in v3.
  url.search = ''; url.hash = '';
  if (staticUrls().has(url.href)) event.respondWith(networkFirst(request, url.href));
});


self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data?.json?.() ?? {}; }
  catch { payload = { title: 'АйКуб', body: event.data?.text?.() ?? '' }; }
  const title = payload.title || 'АйКуб';
  const options = {
    body: payload.body || '',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    tag: payload.tag || undefined,
    data: {
      notificationId: payload.notificationId ?? null,
      destination: payload.destination ?? 'home',
      entityType: payload.entityType ?? null,
      entityId: payload.entityId ?? null,
      type: payload.type ?? null,
    },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data ?? {};
  const target = new URL('./', self.registration.scope);
  if (data.notificationId) target.searchParams.set('pushNotification', String(data.notificationId));
  if (data.destination) target.searchParams.set('destination', String(data.destination));
  if (data.entityType) target.searchParams.set('entityType', String(data.entityType));
  if (data.entityId) target.searchParams.set('entityId', String(data.entityId));
  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === target.origin);
    if (existing) {
      if ('navigate' in existing) await existing.navigate(target.href);
      return existing.focus();
    }
    return clients.openWindow(target.href);
  })());
});

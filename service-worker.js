const CACHE_PREFIX = 'icube-crm-shell-';
const CACHE_NAME = 'icube-crm-shell-v2-20260926-1';
const RELEASE_ID = CACHE_NAME.slice('icube-crm-shell-v2-'.length);
const versioned = (path) => `${path}?v=${RELEASE_ID}`;
const STATIC_PATHS = [
  './',
  './index.html',
  './manifest.webmanifest',
  versioned('./src/ui/styles.css'),
  versioned('./src/ui/dashboard.css'),
  versioned('./src/ui/parent-portal.css'),
  versioned('./src/frontend/crm-ui.js'),
  versioned('./src/frontend/pwa-register.mjs'),
  versioned('./src/frontend/push-client.mjs'),
  './src/frontend/offline-teacher-snapshot.mjs',
  versioned('./src/frontend/parent-portal.mjs'),
  versioned('./src/frontend/api-sync.mjs'),
  versioned('./src/frontend/parent-access.mjs'),
  versioned('./src/frontend/lesson-photos.mjs'),
  versioned('./src/frontend/dashboard-ui.mjs'),
  versioned('./src/frontend/enrollment-delete.mjs'),
  versioned('./src/frontend/direction-price-settings.mjs'),
  versioned('./src/frontend/context-help.mjs'),
  './src/data/api-client.mjs',
  './src/data/lesson-action-queue.mjs',
  './src/shared/business-time.mjs',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

const scopedUrl = (path) => new URL(path, self.registration.scope).href;
const shellUrl = () => scopedUrl('./index.html');
const staticUrls = () => new Set(STATIC_PATHS.map(scopedUrl));

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_PATHS.map(scopedUrl))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys
    .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
    .map((key) => caches.delete(key)))));
});

async function networkFirst(request, fallbackUrl = request.url) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
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

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, shellUrl()));
    return;
  }

  if (staticUrls().has(request.url)) event.respondWith(networkFirst(request));
});


self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data?.json?.() ?? {}; }
  catch { payload = { title: 'iCube CRM', body: event.data?.text?.() ?? '' }; }
  const title = payload.title || 'iCube CRM';
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

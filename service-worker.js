const CACHE_PREFIX = 'icube-crm-shell-';
const CACHE_NAME = 'icube-crm-shell-v1-20260925-1';
const STATIC_PATHS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './src/ui/styles.css',
  './src/ui/dashboard.css',
  './src/ui/parent-portal.css',
  './src/frontend/crm-ui.js',
  './src/frontend/pwa-register.mjs',
  './src/frontend/offline-teacher-snapshot.mjs',
  './src/frontend/parent-portal.mjs',
  './src/frontend/api-sync.mjs',
  './src/frontend/parent-access.mjs',
  './src/frontend/lesson-photos.mjs',
  './src/frontend/dashboard-ui.mjs',
  './src/frontend/enrollment-delete.mjs',
  './src/frontend/direction-price-settings.mjs',
  './src/frontend/context-help.mjs',
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

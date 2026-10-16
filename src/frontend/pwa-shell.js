// Shared by the page and the classic service worker. No release number to bump:
// the cache identity is the SHA-256 of the actual frontend files.
(function (host) {
  const prefix = 'icube-crm-shell-v3-';
  const paths = [
    './index.html', './manifest.webmanifest', './service-worker.js',
    './src/ui/styles.css', './src/ui/dashboard.css', './src/ui/parent-portal.css',
    './src/frontend/crm-ui.js', './src/frontend/pwa-register.mjs', './src/frontend/pwa-shell.js',
    './src/frontend/push-client.mjs', './src/frontend/push-panel-click.mjs',
    './src/frontend/offline-teacher-snapshot.mjs', './src/frontend/release-notes.mjs',
    './src/frontend/screen-history.mjs', './src/frontend/quick-status.mjs',
    './src/frontend/advanced-groups.mjs', './src/frontend/parent-portal.mjs',
    './src/frontend/api-sync.mjs', './src/frontend/parent-access.mjs',
    './src/frontend/payment-receipts.mjs', './src/frontend/lesson-photos.mjs',
    './src/frontend/dashboard-ui.mjs', './src/frontend/enrollment-delete.mjs',
    './src/frontend/direction-price-settings.mjs', './src/frontend/context-help.mjs',
    './src/data/api-client.mjs', './src/data/lesson-action-queue.mjs', './src/shared/business-time.mjs',
    './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
  ];
  const marker = './__pwa_release__';
  async function prepare({ baseUrl, fetchImpl = host.fetch.bind(host), cacheStorage = host.caches, cryptoImpl = host.crypto, cacheName, expectedRelease } = {}) {
    const hash = async (bytes) => Array.from(new Uint8Array(await cryptoImpl.subtle.digest('SHA-256', bytes)))
      .map((byte) => byte.toString(16).padStart(2, '0')).join('');
    const files = await Promise.all(paths.map(async (path) => {
      const url = new URL(path, baseUrl).href;
      // The v2 SW matches exact URLs: this probe also bypasses its offline
      // fallback, so a partial connection cannot advertise cached bytes as new.
      const probe = new URL(url); probe.searchParams.set('__pwa_probe', '1');
      const response = await fetchImpl(probe.href, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`Не удалось загрузить файл интерфейса: ${path}`);
      return { url, response, hash: await hash(await response.clone().arrayBuffer()) };
    }));
    const release = await hash(new TextEncoder().encode(files.map((file) => `${file.url}:${file.hash}`).join('\n')));
    if (expectedRelease && release !== expectedRelease) throw new Error('Frontend changed during update; retry on the next check');
    const name = cacheName ?? `${prefix}${release}`;
    const cache = await cacheStorage.open(name);
    await Promise.all(files.map((file) => cache.put(file.url, file.response)));
    // Written last: an interrupted download is never advertised as an installed shell.
    await cache.put(new URL(marker, baseUrl).href, new Response(JSON.stringify({ release }), { headers: { 'Content-Type': 'application/json' } }));
    return { release, cacheName: name };
  }
  host.icubePwaShell = { prefix, paths, marker, prepare };
})(globalThis);

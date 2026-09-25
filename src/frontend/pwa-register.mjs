export async function registerPwa(serviceWorker = globalThis.navigator?.serviceWorker) {
  if (!serviceWorker || !globalThis.location) return null;
  const allowed = globalThis.location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(globalThis.location.hostname);
  if (!allowed) return null;
  return serviceWorker.register('./service-worker.js', { scope: './' });
}

if (globalThis.window) {
  window.addEventListener('load', () => registerPwa().catch((error) => console.error('Не удалось зарегистрировать PWA service worker', error)));
}

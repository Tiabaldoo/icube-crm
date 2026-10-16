import './pwa-shell.js';
let updateWatch;

export async function updateBlocker(host = globalThis.window, document = globalThis.document) {
  if (host.navigator?.onLine === false) return 'Для обновления нужен интернет.';
  try {
    const state = await host.icubePwaUpdateState?.();
    if (!state || state.saving || state.draft) return 'Сначала сохраните или закройте открытую форму.';
    if (state.pending || await host.icubePhotos?.hasUnsynced?.()) return 'Сначала синхронизируйте занятия и фотографии, включая изменения других пользователей.';
    if (document?.querySelector('.modal-backdrop, [role="dialog"]')) return 'Сначала закройте открытое окно.';
    const edited = [...(document?.querySelectorAll('input, textarea, select, [contenteditable="true"]') ?? [])].some((field) => {
      if (field.type === 'checkbox' || field.type === 'radio') return field.checked !== field.defaultChecked;
      if (field.tagName === 'SELECT') {
        const options = [...field.options];
        const defaults = options.filter((option) => option.defaultSelected);
        const expected = defaults.length || field.multiple ? defaults : options.slice(0, 1);
        return options.some((option) => option.selected !== expected.includes(option));
      }
      return field.isContentEditable || field.value !== field.defaultValue;
    });
    if (edited) return 'Сначала сохраните введённые данные.';
  } catch { return 'Не удалось проверить сохранение данных. Повторите после синхронизации.'; }
  return null;
}

export function watchUpdates(registration, serviceWorker, { host = window, document = globalThis.document, canUpdate = () => updateBlocker(host, document) } = {}) {
  let requested = false; let reloading = false; let generation = 0; let checkedGeneration; let banner;
  const changed = () => { generation += 1; };
  document?.addEventListener('input', changed, true); document?.addEventListener('change', changed, true);
  document?.addEventListener('click', changed, true);
  const message = (text) => { if (banner) banner.querySelector('span').textContent = text; };
  async function apply() {
    const before = generation;
    const blocked = await canUpdate();
    if (blocked || before !== generation) { message(blocked || 'Данные изменились. Сохраните их и повторите.'); return false; }
    checkedGeneration = generation; requested = true;
    if (registration.waiting) registration.waiting.postMessage({ type: 'PWA_ACTIVATE_UPDATE' });
    else await reload();
    return true;
  }
  async function reload() {
    if (!requested || reloading) return;
    const blocked = await canUpdate();
    if (checkedGeneration !== generation || blocked) {
      requested = false; message('Сохраните и синхронизируйте изменения, затем нажмите «Обновить CRM».'); return;
    }
    reloading = true; host.location.reload();
  }
  function offer() {
    if (!registration.waiting || banner || !document?.body) return;
    banner = document.createElement('aside'); banner.id = 'pwa-update'; banner.setAttribute('role', 'status');
    banner.style.cssText = 'position:fixed;bottom:16px;left:16px;right:16px;z-index:10000;background:#fff;border:1px solid #d1d5db;border-radius:12px;padding:12px;display:flex;gap:12px;align-items:center;box-shadow:0 4px 20px #0002';
    const text = document.createElement('span'); text.textContent = 'Доступна новая версия CRM. Обновитесь после сохранения и синхронизации изменений.';
    const button = document.createElement('button'); button.className = 'btn primary'; button.textContent = 'Обновить CRM'; button.addEventListener('click', () => apply().catch(console.error));
    banner.append(text, button); document.body.append(banner);
  }
  const installing = () => {
    const worker = registration.installing;
    worker?.addEventListener('statechange', () => { if (worker.state === 'installed') offer(); });
  };
  registration.addEventListener('updatefound', installing); installing(); offer();
  serviceWorker.addEventListener('controllerchange', () => reload().catch(console.error));
  serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'PWA_UPDATE_BLOCKED') {
      requested = false; message('Закройте остальные вкладки и окна CRM/PWA, затем нажмите «Обновить CRM».');
    }
  });
  return { apply, offer };
}

export async function registerPwa(serviceWorker = globalThis.navigator?.serviceWorker) {
  if (!serviceWorker || !globalThis.location) return null;
  const allowed = globalThis.location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(globalThis.location.hostname);
  if (!allowed) return null;
  if (globalThis.navigator?.onLine === false) return serviceWorker.getRegistration?.('./') ?? null;
  const { release } = await globalThis.icubePwaShell.prepare({ baseUrl: new URL('./', globalThis.location.href).href });
  const registration = await serviceWorker.register(`./service-worker.js?v=${release}`, { scope: './', updateViaCache: 'none' });
  updateWatch ??= watchUpdates(registration, serviceWorker);
  updateWatch.offer();
  return registration;
}

if (globalThis.window) {
  let checking = false; let checkedAt = 0;
  const check = async () => {
    if (checking || Date.now() - checkedAt < 60_000 || navigator.onLine === false) return;
    checking = true; checkedAt = Date.now();
    try { await registerPwa(); } catch (error) { console.error('Не удалось проверить обновление PWA', error); }
    finally { checking = false; }
  };
  window.addEventListener('load', check);
  window.addEventListener('online', () => { checkedAt = 0; check(); });
  window.addEventListener('focus', check);
  window.addEventListener('pageshow', (event) => { if (event.persisted) checkedAt = 0; check(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
}

import { ApiClient, ApiError } from '../data/api-client.mjs';

globalThis.ICUBE_FRONTEND_BUILD = new URL(import.meta.url).searchParams.get('v') || 'unversioned';

const api = new ApiClient();
const DEVICE_DISABLED_KEY = 'icube-push-device-disabled';
const ONBOARDING_SEEN_KEY = 'icube-pwa-onboarding-seen-v1';
const state = { config: null, status: 'loading', message: 'Проверяем…', subscription: null };
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
let pushPanel = null;
let pushPanelAnchor = null;
let pushPanelInbox = false;
let onboardingModal = null;
let onboardingView = null;
let onboardingAutoHandled = false;

function bellIcon() {
  return state.status === 'enabled' ? '🔔' : '🔕';
}
function syncBellIcons() {
  document.querySelectorAll('[data-push-bell-icon]').forEach((element) => { element.textContent = bellIcon(); });
}
function pushStatusText() {
  if (state.status === 'enabled') return 'Уведомления включены';
  if (['available', 'disabled'].includes(state.status)) return 'Уведомления выключены';
  return state.message;
}

function supported() {
  return Boolean(
    globalThis.navigator?.serviceWorker
      && globalThis.PushManager
      && globalThis.Notification
      && typeof globalThis.Notification.requestPermission === 'function'
  );
}
function installedStandalone() {
  return Boolean(globalThis.matchMedia?.('(display-mode: standalone)').matches || globalThis.navigator?.standalone === true);
}
function iosLike() {
  return /iPhone|iPad|iPod/i.test(globalThis.navigator?.userAgent ?? '');
}
function onboardingPlatform() {
  const nav = globalThis.navigator ?? {};
  const platform = String(nav.userAgentData?.platform ?? nav.platform ?? '');
  const userAgent = String(nav.userAgent ?? '');
  if (/iPhone|iPad|iPod/i.test(userAgent) || (/Mac/i.test(platform) && Number(nav.maxTouchPoints) > 1)) return 'ios';
  if (/Android/i.test(platform) || /Android/i.test(userAgent)) return 'android';
  return 'other';
}
function onboardingSeen() {
  try { return localStorage.getItem(ONBOARDING_SEEN_KEY) === '1'; } catch { return false; }
}
function markOnboardingSeen() {
  try { localStorage.setItem(ONBOARDING_SEEN_KEY, '1'); } catch { /* ignore */ }
}
function deviceDisabled() {
  try { return localStorage.getItem(DEVICE_DISABLED_KEY) === '1'; } catch { return false; }
}
function setDeviceDisabled(value) {
  try { value ? localStorage.setItem(DEVICE_DISABLED_KEY, '1') : localStorage.removeItem(DEVICE_DISABLED_KEY); } catch { /* ignore */ }
}
function publicKeyBytes(value) {
  const padded = String(value).replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(String(value).length / 4) * 4, '=');
  const raw = atob(padded); return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}
async function registration() {
  return navigator.serviceWorker.ready;
}
async function currentSubscription() {
  if (!supported()) return null;
  return (await registration()).pushManager.getSubscription();
}
async function serverConfig() {
  state.config = await api.request('/push/config');
  return state.config;
}
async function bind(subscription) {
  if (!subscription) return null;
  return api.request('/push/subscriptions', { method: 'POST', body: subscription.toJSON() });
}

export async function refreshPushState() {
  if (!supported()) {
    state.status = 'unsupported';
    state.message = iosLike() && !installedStandalone()
      ? 'Для уведомлений на iPhone добавьте АйКуб на экран «Домой» и откройте приложение с иконки.'
      : 'Системные уведомления не поддерживаются этим браузером.';
    return { ...state };
  }
  try {
    const config = await serverConfig();
    if (!config.enabled) {
      state.status = 'unavailable'; state.message = 'Web Push сейчас недоступен на сервере.'; return { ...state };
    }
    if (Notification.permission === 'denied') {
      state.status = 'blocked'; state.message = 'Уведомления заблокированы в настройках браузера/телефона.'; return { ...state };
    }
    state.subscription = await currentSubscription();
    if (deviceDisabled()) {
      state.status = 'disabled'; state.message = 'Уведомления на этом устройстве отключены.'; return { ...state };
    }
    if (Notification.permission === 'granted' && state.subscription) {
      state.status = 'enabled'; state.message = 'Уведомления включены.'; return { ...state };
    }
    state.status = 'available'; state.message = 'Уведомления можно включить на этом устройстве.';
    return { ...state };
  } catch (error) {
    state.status = 'unavailable'; state.message = error instanceof ApiError ? error.message : 'Не удалось проверить Web Push.';
    return { ...state };
  }
}

export async function enablePush() {
  if (!supported()) {
    state.status = 'unsupported';
    state.message = 'Этот браузер не поддерживает системные уведомления.';
    return { ...state };
  }
  if (Notification.permission === 'denied') {
    state.status = 'blocked';
    state.message = 'Уведомления запрещены в настройках браузера.';
    return { ...state };
  }

  let permission;
  try {
    permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  } catch {
    state.status = 'available';
    state.message = 'Не удалось включить уведомления. Проверьте разрешения браузера и попробуйте ещё раз.';
    return { ...state };
  }
  if (permission === 'denied') {
    state.status = 'blocked';
    state.message = 'Уведомления запрещены в настройках браузера.';
    return { ...state };
  }
  if (permission !== 'granted') {
    state.status = 'available';
    state.message = 'Разрешение на уведомления не было предоставлено. Проверьте настройки браузера и попробуйте ещё раз.';
    return { ...state };
  }

  try {
    const config = state.config ?? await serverConfig();
    if (!config.enabled) {
      state.status = 'unavailable';
      state.message = 'Web Push сейчас недоступен на сервере.';
      return { ...state };
    }
    const reg = await registration();
    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true, applicationServerKey: publicKeyBytes(config.publicKey),
    });
    setDeviceDisabled(false);
    await bind(subscription);
    state.subscription = subscription;
    return refreshPushState();
  } catch {
    state.status = 'available';
    state.message = 'Не удалось включить уведомления. Проверьте разрешения браузера и попробуйте ещё раз.';
    return { ...state };
  }
}

export async function rebindPush(profile) {
  if (!profile || !supported() || deviceDisabled() || Notification.permission !== 'granted') return null;
  const config = await serverConfig().catch(() => null); if (!config?.enabled) return null;
  const reg = await registration();
  let subscription = await reg.pushManager.getSubscription();
  if (!subscription) subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true, applicationServerKey: publicKeyBytes(config.publicKey),
  });
  return bind(subscription);
}

export async function unbindPush() {
  if (!supported()) return null;
  const subscription = await currentSubscription().catch(() => null); if (!subscription) return null;
  try { return await api.request('/push/subscriptions', { method: 'DELETE', body: { endpoint: subscription.endpoint } }); }
  catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    await subscription.unsubscribe?.().catch(() => {});
    throw error;
  }
}

export async function disablePush() {
  const subscription = await currentSubscription().catch(() => null);
  if (subscription) await api.request('/push/subscriptions', { method: 'DELETE', body: { endpoint: subscription.endpoint } });
  setDeviceDisabled(true); return refreshPushState();
}

export async function testPush() {
  return api.request('/push/test', { method: 'POST', body: {} });
}

function controlsMarkup() {
  const status = state.status;
  const actions = [];
  if (['available', 'disabled', 'blocked'].includes(status)) actions.push('<button class="btn primary" type="button" onclick="icubePush.enable()">Разрешить уведомления</button>');
  if (status === 'enabled') actions.push('<button class="btn danger" type="button" onclick="icubePush.disable()">Отключить уведомления</button>');
  return `<div class="push-device-card"><h3 style="margin:0 0 8px">Системные уведомления</h3>
    <div class="muted" style="margin-bottom:12px">${esc(pushStatusText())}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">${actions.join('')}</div></div>`;
}

export async function mountPushControls(selector) {
  const target = typeof selector === 'string' ? document.querySelector(selector) : selector;
  if (!target) return;
  await refreshPushState(); target.innerHTML = controlsMarkup();
}

async function rerenderMounted(refresh = true) {
  for (const element of document.querySelectorAll('[data-push-controls]')) {
    if (refresh) await mountPushControls(element);
    else element.innerHTML = controlsMarkup();
  }
}

function removeOnboardingModal() {
  onboardingModal?.remove();
  onboardingModal = null;
  onboardingView = null;
}

function showOnboardingHint() {
  document.querySelector('.pwa-onboarding-toast')?.remove();
  const toast = document.createElement('div');
  toast.className = 'pwa-onboarding-toast';
  toast.textContent = 'Инструкцию можно открыть позже в разделе уведомлений.';
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 4500);
}

function deferOnboarding() {
  removeOnboardingModal();
  showOnboardingHint();
}

function onboardingNotificationMarkup() {
  const actions = [];
  if (['available', 'disabled'].includes(state.status)) {
    actions.push('<button class="btn primary" type="button" onclick="icubePush.enable()">Включить уведомления</button>');
  }
  const done = state.status === 'enabled';
  return `<div class="pwa-onboarding-push ${done ? 'done' : ''}">
    <div class="pwa-onboarding-push-icon">${done ? '✅' : '🔔'}</div>
    <div class="pwa-onboarding-push-copy"><b>${done ? 'Уведомления включены' : 'Системные уведомления'}</b>
      <span>${esc(done ? 'Этот шаг уже выполнен.' : pushStatusText())}</span></div>
    ${actions.join('')}
  </div>`;
}

function onboardingSteps() {
  const notificationStep = state.status === 'enabled'
    ? 'Системные уведомления уже включены — этот шаг выполнен.'
    : 'Откройте уведомления в АйКуб и нажмите «Включить уведомления».';
  if (onboardingPlatform() === 'ios') return [
    'Откройте АйКуб в Safari.',
    'Нажмите кнопку «Поделиться» в Safari.',
    'Выберите «На экран Домой».',
    'Подтвердите добавление приложения.',
    'Закройте Safari и откройте АйКуб с нового значка на экране Домой.',
    notificationStep,
  ];
  if (onboardingPlatform() === 'android') return [
    'Откройте АйКуб в браузере, например Chrome.',
    'Откройте меню браузера ⋮.',
    'Выберите «Установить приложение» или «Добавить на главный экран».',
    'Подтвердите установку.',
    'Откройте АйКуб с нового значка на главном экране.',
    notificationStep,
  ];
  return [
    'Откройте меню вашего браузера.',
    'Найдите пункт «Установить приложение» или «Добавить на главный экран», если браузер его предлагает.',
    'Подтвердите установку и откройте АйКуб с нового значка.',
    notificationStep,
  ];
}

function onboardingPromptMarkup() {
  return `<div class="pwa-onboarding-head"><div><div class="pwa-onboarding-kicker">АйКуб</div><h2>Настроить приложение?</h2></div>
    <button class="pwa-onboarding-close" type="button" onclick="icubePush.deferOnboarding()" aria-label="Закрыть">×</button></div>
    <p class="pwa-onboarding-intro">Можно установить АйКуб на главный экран телефона и включить уведомления, чтобы быстрее открывать кабинет и не пропускать важные события.</p>
    <div class="pwa-onboarding-actions">
      <button class="btn primary" type="button" onclick="icubePush.openOnboarding()">Настроить сейчас</button>
      <button class="btn" type="button" onclick="icubePush.deferOnboarding()">Позже</button>
    </div>`;
}

function onboardingGuideMarkup() {
  if (installedStandalone()) {
    if (state.status === 'enabled') {
      return `<div class="pwa-onboarding-head"><div><div class="pwa-onboarding-kicker">АйКуб</div><h2>Приложение настроено</h2></div>
        <button class="pwa-onboarding-close" type="button" onclick="icubePush.closeOnboarding()" aria-label="Закрыть">×</button></div>
        <p class="pwa-onboarding-intro">Приложение АйКуб уже открыто как установленное.</p>
        ${onboardingNotificationMarkup()}
        <div class="pwa-onboarding-actions"><button class="btn primary" type="button" onclick="icubePush.closeOnboarding()">Готово</button></div>`;
    }
    return `<div class="pwa-onboarding-head"><div><div class="pwa-onboarding-kicker">АйКуб</div><h2>Осталось включить уведомления</h2></div>
      <button class="pwa-onboarding-close" type="button" onclick="icubePush.closeOnboarding()" aria-label="Закрыть">×</button></div>
      <p class="pwa-onboarding-intro">Приложение уже установлено. Настройка главного экрана больше не требуется.</p>
      ${onboardingNotificationMarkup()}
      <div class="pwa-onboarding-actions"><button class="btn" type="button" onclick="icubePush.closeOnboarding()">Закрыть</button></div>`;
  }

  const steps = onboardingSteps().map((text, index) => `<div class="pwa-onboarding-step">
    <span class="pwa-onboarding-step-number">${index + 1}</span>
    <div><b>Шаг ${index + 1}</b><p>${esc(text)}</p></div>
  </div>`).join('');
  const title = onboardingPlatform() === 'ios'
    ? 'Установка на iPhone / iPad'
    : onboardingPlatform() === 'android'
      ? 'Установка на Android'
      : 'Установка приложения';
  return `<div class="pwa-onboarding-head"><div><div class="pwa-onboarding-kicker">АйКуб</div><h2>${title}</h2></div>
    <button class="pwa-onboarding-close" type="button" onclick="icubePush.closeOnboarding()" aria-label="Закрыть">×</button></div>
    <p class="pwa-onboarding-intro">Установите приложение на главный экран, а затем включите системные уведомления.</p>
    <div class="pwa-onboarding-steps">${steps}</div>
    ${onboardingNotificationMarkup()}
    <div class="pwa-onboarding-actions"><button class="btn primary" type="button" onclick="icubePush.closeOnboarding()">Готово</button></div>`;
}

function renderOnboarding() {
  if (!onboardingModal) return;
  const dialog = onboardingModal.querySelector('.pwa-onboarding-dialog');
  if (!dialog) return;
  dialog.innerHTML = onboardingView === 'prompt' ? onboardingPromptMarkup() : onboardingGuideMarkup();
}

function ensureOnboardingModal() {
  if (onboardingModal) return onboardingModal;
  onboardingModal = document.createElement('div');
  onboardingModal.className = 'pwa-onboarding-backdrop';
  onboardingModal.innerHTML = '<div class="pwa-onboarding-dialog" role="dialog" aria-modal="true"></div>';
  document.body.appendChild(onboardingModal);
  return onboardingModal;
}

function showOnboardingPrompt() {
  markOnboardingSeen();
  onboardingView = 'prompt';
  ensureOnboardingModal();
  renderOnboarding();
}

async function openOnboarding() {
  closePushPanel();
  await refreshPushState();
  syncBellIcons();
  onboardingView = 'guide';
  ensureOnboardingModal();
  renderOnboarding();
}

function closeOnboarding() {
  removeOnboardingModal();
}

function maybeShowOnboarding() {
  if (!window.matchMedia?.('(max-width: 760px)').matches) return;
  if (onboardingAutoHandled || onboardingSeen()) return;
  onboardingAutoHandled = true;
  if (installedStandalone() && state.status === 'enabled') return;
  markOnboardingSeen();
  if (installedStandalone()) {
    onboardingView = 'guide';
    ensureOnboardingModal();
    renderOnboarding();
    return;
  }
  showOnboardingPrompt();
}

function closePushPanel() {
  pushPanel?.remove();
  pushPanel = null;
  pushPanelAnchor = null;
  pushPanelInbox = false;
}

function positionPushPanel() {
  if (!pushPanel) return;
  if (window.matchMedia?.('(max-width: 760px)').matches) {
    pushPanel.style.removeProperty('left');
    pushPanel.style.removeProperty('right');
    pushPanel.style.removeProperty('top');
    pushPanel.style.removeProperty('width');
    pushPanel.style.removeProperty('max-height');
    return;
  }
  if (!pushPanelAnchor?.isConnected) return;

  const rect = pushPanelAnchor.getBoundingClientRect();
  const gap = 8;
  const margin = 12;
  const visualViewport = window.visualViewport;
  const viewportLeft = visualViewport?.offsetLeft ?? 0;
  const viewportTop = visualViewport?.offsetTop ?? 0;
  const viewportWidth = visualViewport?.width ?? window.innerWidth;
  const viewportHeight = visualViewport?.height ?? window.innerHeight;
  const viewportRight = viewportLeft + viewportWidth;
  const viewportBottom = viewportTop + viewportHeight;
  const width = Math.min(320, Math.max(0, viewportWidth - margin * 2));

  pushPanel.style.width = `${width}px`;
  pushPanel.style.left = `${viewportLeft + margin}px`;
  pushPanel.style.top = `${viewportTop + margin}px`;

  const panelRect = pushPanel.getBoundingClientRect();
  const panelWidth = panelRect.width;
  const panelHeight = panelRect.height;
  const minLeft = viewportLeft + margin;
  const maxLeft = Math.max(minLeft, viewportRight - panelWidth - margin);
  const minTop = viewportTop + margin;
  const maxTop = Math.max(minTop, viewportBottom - panelHeight - margin);
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  const desiredLeft = rect.right - panelWidth;
  const belowTop = rect.bottom + gap;
  const aboveTop = rect.top - panelHeight - gap;
  let top = belowTop;
  if (belowTop + panelHeight <= viewportBottom - margin) top = belowTop;
  else if (aboveTop >= minTop) top = aboveTop;

  const left = clamp(desiredLeft, minLeft, maxLeft);
  top = clamp(top, minTop, maxTop);
  pushPanel.style.left = `${left}px`;
  pushPanel.style.top = `${top}px`;
}

function pushPanelMarkup() {
  const actions = [];
  if (state.status === 'enabled') actions.push('<button class="btn danger" type="button" onclick="icubePush.disable()">Отключить уведомления</button>');
  else if (['available', 'disabled', 'blocked'].includes(state.status)) actions.push('<button class="btn primary" type="button" onclick="icubePush.enable()">Включить уведомления</button>');
  if (pushPanelInbox) actions.push('<button class="btn" type="button" onclick="icubePush.closePanel();window.icubeParentPortal?.openNotifications?.()">Открыть уведомления</button>');
  else actions.push('<button class="btn" type="button" onclick="icubePush.closePanel();icubePush.openSettings()">Типы уведомлений</button>');
  actions.push('<button class="btn" type="button" onclick="icubePush.openOnboarding()">Как установить приложение</button>');
  return `<div class="push-popover-head"><b>Системные уведомления</b><button type="button" class="push-popover-close" onclick="icubePush.closePanel()" aria-label="Закрыть">×</button></div>
    <div class="push-popover-status">${esc(pushStatusText())}</div>
    <div class="push-popover-actions">${actions.join('')}</div>`;
}

function renderPushPanel() {
  if (!pushPanel) return;
  pushPanel.innerHTML = pushPanelMarkup();
  syncBellIcons();
  positionPushPanel();
}

async function togglePushPanel(anchor, inbox = false) {
  if (!anchor) return;
  if (pushPanel && pushPanelAnchor === anchor) { closePushPanel(); return; }
  closePushPanel();
  pushPanelAnchor = anchor;
  pushPanelInbox = Boolean(inbox);
  pushPanel = document.createElement('div');
  pushPanel.className = 'push-popover';
  pushPanel.setAttribute('role', 'dialog');
  pushPanel.setAttribute('aria-label', 'Системные уведомления');
  document.body.appendChild(pushPanel);
  renderPushPanel();

  await refreshPushState();
  if (!pushPanel || pushPanelAnchor !== anchor) return;
  syncBellIcons();
  renderPushPanel();
}

async function runAction(action, refresh = true) {
  try {
    await action();
    await rerenderMounted(refresh);
    syncBellIcons();
    renderPushPanel();
    renderOnboarding();
  } catch (error) { window.alert(error?.message ?? 'Не удалось выполнить действие с уведомлениями.'); }
}

async function openSettings() {
  const legacy = window.icubeLegacy; if (!legacy) return;
  try {
    const settings = await api.request('/notification-settings');
    await refreshPushState();
    legacy.state.modal = `<h3>Типы уведомлений</h3>
      <div style="margin-top:8px">
      ${settings.map((item) => `<label class="parent-toggle" style="display:flex;justify-content:space-between;gap:12px;padding:8px 0">
        <span>${esc(item.label)}</span><input type="checkbox" ${item.enabled ? 'checked' : ''} onchange="icubePush.setting('${esc(item.type)}',this.checked)">
      </label>`).join('')}</div>
      <div class="modal-actions"><button class="btn" onclick="closeModal()">Закрыть</button></div>`;
    legacy.render();
  } catch (error) { window.alert(error?.message ?? 'Не удалось загрузить настройки уведомлений.'); }
}

async function saveSetting(type, enabled) {
  try { await api.request('/notification-settings', { method: 'PATCH', body: { [type]: Boolean(enabled) } }); }
  catch (error) { window.alert(error?.message ?? 'Не удалось сохранить настройку.'); await openSettings(); }
}

window.icubePush = {
  refresh: refreshPushState, mount: mountPushControls, rebind: rebindPush, unbind: unbindPush,
  enable: () => runAction(enablePush, false), disable: () => runAction(disablePush),
  test: () => runAction(async () => { await testPush(); window.alert('Тестовое уведомление отправлено через Web Push.'); }),
  icon: bellIcon, syncBellIcons, togglePanel: togglePushPanel, closePanel: closePushPanel,
  openOnboarding, closeOnboarding, deferOnboarding,
  openSettings, setting: saveSetting,
};

document.addEventListener('click', (event) => {
  if (!pushPanel || pushPanel.contains(event.target) || pushPanelAnchor?.contains(event.target)) return;
  closePushPanel();
});
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closePushPanel(); });
window.addEventListener('resize', closePushPanel);

window.icubeAuthReady?.then(async (profile) => {
  if (!profile) return;
  await rebindPush(profile).catch(console.error);
  await refreshPushState();
  syncBellIcons();
  maybeShowOnboarding();
  if (window.icubeHandlePushDeepLink) await window.icubeHandlePushDeepLink(profile).catch(console.error);
});

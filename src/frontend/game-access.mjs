import { ApiClient, ApiError } from '../data/api-client.mjs';

const AVAILABLE_KEY = 'icube-game-access-available';
const api = new ApiClient();
const legacy = window.icubeLegacy;
const cache = new Map();
const loading = new Set();
let owner = null;
let featureMissing = false;
let featureSeen = false;
let closeDialog = null;

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (symbol) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[symbol]);
const canManage = () => ['director', 'partner'].includes(legacy.state.role);
const refresh = (childId) => { if (legacy.state.page === 'child' && String(legacy.state.selectedChild) === String(childId)) legacy.render(); };

function featureConfirmed() {
  if (featureSeen) return true;
  try { return localStorage.getItem(AVAILABLE_KEY) === '1'; } catch { return false; }
}
function rememberFeature(available) {
  featureSeen = available;
  if (available) for (const [key, value] of cache) if (value.silent) cache.delete(key);
  try {
    if (available) localStorage.setItem(AVAILABLE_KEY, '1');
    else localStorage.removeItem(AVAILABLE_KEY);
  } catch {}
}

// Данные одного пользователя не должны пережить вход другого: страница при этом не перезагружается.
function currentUser() {
  const id = legacy.state.authUser?.id ?? null;
  if (id !== owner) {
    owner = id;
    cache.clear();
    loading.clear();
    featureMissing = false;
    document.querySelector('#game-credentials-dialog')?.remove();
  }
  return id;
}

// Выключенный флаг — это 404 неизвестного маршрута, без кода ошибки API.
const isFeatureMissing = (error) => error instanceof ApiError && error.status === 404 && !error.code;
// Функцию подтверждает только ответ самих игровых маршрутов: их данные или код GAME_*.
// 401 и 403 проверки сессии приходят и при выключенном флаге, а 200 и 5xx может отдать прокси.
const provesFeature = (error) => error instanceof ApiError && error.status < 500 && String(error.code ?? '').startsWith('GAME_');
const isAccess = (data) => typeof data?.manageable === 'boolean';

function message(error) {
  if (error instanceof ApiError) return error.status >= 500 ? `Ошибка сервера (${error.status}). Попробуйте позже` : error.message;
  return 'Нет связи с сервером. Проверьте интернет и повторите';
}

async function load(childId) {
  const user = currentUser();
  const key = `${user}:${childId}`;
  if (!childId || user == null || featureMissing || loading.has(key) || !canManage()) return;
  loading.add(key);
  let visible = true;
  let result;
  try {
    const data = await api.request(`/children/${childId}/game-access`);
    if (isAccess(data)) { rememberFeature(true); result = data; }
    else { result = { silent: true }; visible = false; }
  } catch (error) {
    if (isFeatureMissing(error)) {
      rememberFeature(false);
      if (user === currentUser()) featureMissing = true;
      visible = false;
    } else if (provesFeature(error) || featureConfirmed()) {
      if (provesFeature(error)) rememberFeature(true);
      result = { error: message(error) };
    } else {
      // Неизвестно, включена ли игра: при выключенном флаге CRM работает как раньше.
      result = { silent: true };
      visible = false;
    }
  }
  loading.delete(key);
  if (user !== currentUser()) return;
  if (result) cache.set(String(childId), result);
  if (visible) refresh(childId);
}

function showCredentials(credentials, title) {
  closeDialog?.();
  document.querySelector('#game-credentials-dialog')?.remove();
  const backdrop = document.createElement('div');
  backdrop.id = 'game-credentials-dialog'; backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `<div class="modal parent-credentials-modal" role="dialog" aria-modal="true" aria-labelledby="game-credentials-title">
    <h3 id="game-credentials-title"></h3><p class="muted">Сохраните данные сейчас — пароль больше не будет показан.</p>
    <div class="parent-credential"><span>Логин</span><code data-value="login"></code></div>
    <div class="parent-credential"><span>Пароль</span><code data-value="password"></code></div>
    <div class="modal-actions"><button class="btn primary" data-close>Закрыть</button></div>
  </div>`;
  backdrop.querySelector('#game-credentials-title').textContent = title;
  backdrop.querySelector('[data-value="login"]').textContent = credentials.login;
  backdrop.querySelector('[data-value="password"]').textContent = credentials.password;
  // Вход и выход не перезагружают страницу: пароль не должен остаться на экране следующего пользователя.
  const shownTo = legacy.state.authUser?.id ?? null;
  const close = () => { clearInterval(watch); backdrop.remove(); closeDialog = null; };
  closeDialog = close;
  const watch = setInterval(() => { if ((legacy.state.authUser?.id ?? null) !== shownTo) close(); }, 500);
  backdrop.addEventListener('click', (event) => {
    if (!event.target.closest('[data-close]')) return;
    close();
    if (legacy.state.authUser) legacy.render();
  });
  document.body.append(backdrop);
}

function accountRows(childId, access) {
  const active = access.status === 'active';
  const state = !active ? 'Отключён' : access.canLogin ? 'Активен' : 'Вход закрыт: ребёнок не активен';
  return `<div class="kpi-line"><div><b>Логин: ${escapeHtml(access.login)}</b><div class="muted mini">${state} · первый доступ ${escapeHtml(access.firstAccessOn)}</div></div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end"><button class="btn" onclick="icubeResetGameAccess(${childId})">${active ? 'Сбросить пароль' : 'Восстановить с новым паролем'}</button>${active ? `<button class="btn" onclick="icubeUnlockGameAccess(${childId})">Разблокировать вход</button><button class="btn danger" onclick="icubeDisableGameAccess(${childId})">Отключить</button>` : ''}</div></div>`;
}

function accessBlock(childId) {
  currentUser();
  if (featureMissing) return '';
  const access = cache.get(String(childId));
  if (!access) { queueMicrotask(() => load(childId)); return ''; }
  if (access.silent) return '';
  const card = (body) => `<div class="card pad" style="margin-top:16px"><div class="section-title"><h2>Игра «Остров чудиков»</h2></div>${body}</div>`;
  if (access.error) return card(`<div class="notice">${escapeHtml(access.error)}</div><button class="btn" style="margin-top:8px" onclick="icubeRetryGameAccess(${childId})">Повторить</button>`);
  if (!access.manageable) return card('<div class="muted">Ребёнок относится к нескольким проектам: игровым доступом управляет директор.</div>');
  if (access.invalid) return card('<div class="notice">Связанная учётная запись не является детской. Обратитесь к директору.</div>');
  if (access.exists) return card(accountRows(childId, access));
  if (!access.canCreate) return card('<div class="muted">Доступ создаётся только активному ребёнку или ребёнку на паузе.</div>');
  return card(`<div class="field"><label>Логин ребёнка</label><div style="display:flex;gap:8px"><input class="input" id="game-access-login" autocomplete="off" placeholder="misha.k"><button class="btn primary" onclick="icubeCreateGameAccess(${childId})">Создать доступ</button></div></div>`);
}

const originalChild = window.child;
if (typeof originalChild === 'function') {
  window.child = function (...args) {
    const base = originalChild.apply(this, args);
    if (!canManage() || legacy.state.childTab !== 'overview') return base;
    return `${base}${accessBlock(legacy.state.selectedChild)}`;
  };
}

async function act(childId, operation, title) {
  const user = currentUser();
  try {
    const result = await operation();
    if (user !== currentUser()) return;
    if (result?.password) showCredentials(result, title);
    const { password, ...access } = result;
    cache.set(String(childId), access);
    refresh(childId);
  } catch (error) {
    if (user !== currentUser()) return;
    window.alert(message(error));
    cache.delete(String(childId));
    await load(childId);
  }
}

window.icubeRetryGameAccess = (childId) => { cache.delete(String(childId)); return load(childId); };
window.icubeCreateGameAccess = (childId) => {
  const login = document.querySelector('#game-access-login')?.value ?? '';
  return act(childId, () => api.request(`/children/${childId}/game-access`, { method: 'POST', body: { login } }), 'Игровой доступ создан');
};
window.icubeResetGameAccess = (childId) => {
  if (!window.confirm('Выдать новый пароль? Текущий пароль перестанет работать, игровые сессии завершатся.')) return undefined;
  return act(childId, () => api.request(`/children/${childId}/game-access/reset-password`, { method: 'POST', body: {} }), 'Новый пароль');
};
window.icubeUnlockGameAccess = (childId) => act(childId, () => api.request(`/children/${childId}/game-access/unlock`, { method: 'POST', body: {} }));
window.icubeDisableGameAccess = (childId) => {
  if (!window.confirm('Отключить игровой доступ? Прогресс ребёнка сохранится.')) return undefined;
  return act(childId, () => api.request(`/children/${childId}/game-access`, { method: 'DELETE' }));
};

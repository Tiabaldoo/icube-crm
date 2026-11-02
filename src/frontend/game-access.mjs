import { ApiClient, ApiError } from '../data/api-client.mjs';

const api = new ApiClient();
const legacy = window.icubeLegacy;
const cache = new Map();
const loading = new Set();
let featureMissing = false;

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (symbol) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[symbol]);
const canManage = () => ['director', 'partner'].includes(legacy.state.role);
const refresh = (childId) => { if (legacy.state.page === 'child' && String(legacy.state.selectedChild) === String(childId)) legacy.render(); };

// Выключенный флаг — это 404 неизвестного маршрута, без кода ошибки API.
// 404 с кодом значит, что не найден ребёнок: это обычная ошибка, её надо показать.
const isFeatureMissing = (error) => error instanceof ApiError && error.status === 404 && !error.code;

function message(error) {
  if (error instanceof ApiError) return error.status >= 500 ? `Ошибка сервера (${error.status}). Попробуйте позже` : error.message;
  return 'Нет связи с сервером. Проверьте интернет и повторите';
}

async function load(childId) {
  const key = String(childId);
  if (!childId || featureMissing || loading.has(key) || !canManage()) return;
  loading.add(key);
  try { cache.set(key, await api.request(`/children/${childId}/game-access`)); }
  catch (error) {
    if (isFeatureMissing(error)) featureMissing = true;
    else cache.set(key, { error: message(error) });
  }
  finally { loading.delete(key); refresh(childId); }
}

function showCredentials(credentials, title) {
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
  backdrop.addEventListener('click', (event) => { if (event.target.closest('[data-close]')) { backdrop.remove(); legacy.render(); } });
  document.body.append(backdrop);
}

function accountRows(childId, access) {
  const active = access.status === 'active';
  return `<div class="kpi-line"><div><b>Логин: ${escapeHtml(access.login)}</b><div class="muted mini">${active ? 'Активен' : 'Отключён'} · первый доступ ${escapeHtml(access.firstAccessOn)}</div></div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end"><button class="btn" onclick="icubeResetGameAccess(${childId})">${active ? 'Сбросить пароль' : 'Восстановить с новым паролем'}</button>${active ? `<button class="btn" onclick="icubeUnlockGameAccess(${childId})">Разблокировать вход</button><button class="btn danger" onclick="icubeDisableGameAccess(${childId})">Отключить</button>` : ''}</div></div>`;
}

function accessBlock(childId) {
  if (featureMissing) return '';
  const access = cache.get(String(childId));
  if (!access) { queueMicrotask(() => load(childId)); return ''; }
  const card = (body) => `<div class="card pad" style="margin-top:16px"><div class="section-title"><h2>Игра «Остров чудиков»</h2></div>${body}</div>`;
  if (access.error) return card(`<div class="notice">${escapeHtml(access.error)}</div><button class="btn" style="margin-top:8px" onclick="icubeRetryGameAccess(${childId})">Повторить</button>`);
  if (!access.manageable) return card('<div class="muted">Ребёнок относится к нескольким проектам: игровым доступом управляет директор.</div>');
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
  try {
    const result = await operation();
    if (result?.password) showCredentials(result, title);
    cache.set(String(childId), result?.password ? { ...result, password: undefined } : result);
    refresh(childId);
  } catch (error) { window.alert(message(error)); }
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

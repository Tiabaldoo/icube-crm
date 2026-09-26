import { ApiClient, ApiError } from '../data/api-client.mjs';

const api = new ApiClient();
const legacy = window.icubeLegacy;
const cache = new Map();
const loading = new Set();
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (symbol) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[symbol]);
const message = (error) => error instanceof ApiError ? error.message : 'Операция не выполнена';

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(value); return; } catch {}
  }
  const input = document.createElement('textarea');
  input.value = value; input.setAttribute('readonly', ''); input.style.position = 'fixed'; input.style.opacity = '0';
  document.body.append(input); input.select(); document.execCommand('copy'); input.remove();
}

function showCredentials(credentials, title) {
  document.querySelector('#parent-credentials-dialog')?.remove();
  const backdrop = document.createElement('div');
  backdrop.id = 'parent-credentials-dialog'; backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `<div class="modal parent-credentials-modal" role="dialog" aria-modal="true" aria-labelledby="parent-credentials-title">
    <h3 id="parent-credentials-title"></h3><p class="muted">Сохраните данные сейчас — пароль больше не будет показан.</p>
    <div class="parent-credential"><span>Логин</span><code data-value="login"></code><button class="btn" data-copy="login">Скопировать логин</button></div>
    <div class="parent-credential"><span>Пароль</span><code data-value="password"></code><button class="btn" data-copy="password">Скопировать пароль</button></div>
    <div class="modal-actions"><button class="btn" data-copy="all">Скопировать всё</button><button class="btn primary" data-close>Закрыть</button></div>
  </div>`;
  backdrop.querySelector('#parent-credentials-title').textContent = title;
  backdrop.querySelector('[data-value="login"]').textContent = credentials.login;
  backdrop.querySelector('[data-value="password"]').textContent = credentials.password;
  backdrop.addEventListener('click', async (event) => {
    const button = event.target.closest('button');
    if (button?.hasAttribute('data-close')) { backdrop.remove(); legacy.render(); return; }
    const kind = button?.dataset.copy; if (!kind) return;
    const value = kind === 'all' ? `Логин: ${credentials.login}\nПароль: ${credentials.password}` : credentials[kind];
    await copyText(value); const label = button.textContent; button.textContent = 'Скопировано';
    window.setTimeout(() => { if (button.isConnected) button.textContent = label; }, 1200);
  });
  document.body.append(backdrop);
}

async function load(childId) {
  if (!childId || loading.has(String(childId)) || !['director', 'partner'].includes(legacy.state.role)) return;
  loading.add(String(childId));
  try { cache.set(String(childId), await api.request(`/children/${childId}/parent-access`)); }
  catch (error) { cache.set(String(childId), { error: message(error) }); }
  finally { loading.delete(String(childId)); if (legacy.state.page === 'child' && String(legacy.state.selectedChild) === String(childId)) legacy.render(); }
}

function accessBlock(childId) {
  const result = cache.get(String(childId));
  if (!result) { queueMicrotask(() => load(childId)); return '<div class="card pad"><h2>Родительский доступ</h2><div class="muted">Загрузка…</div></div>'; }
  if (result.error) return `<div class="card pad"><h2>Родительский доступ</h2><div class="notice">${escapeHtml(result.error)}</div></div>`;
  const accounts = result;
  const rows = accounts.map((account) => `<div class="kpi-line"><div><b>Родитель: ${escapeHtml(account.name || 'Не указан')}</b><div class="muted mini">${escapeHtml(account.login)} · ${account.status === 'active' ? 'Активен' : 'Отключён'}</div><div class="muted mini">Дети: ${escapeHtml(account.linkedChildren.join(', ') || '—')}</div></div><div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end"><button class="btn" onclick="icubeResetParentPassword(${childId},${account.id})">Сбросить пароль</button><button class="btn" onclick="icubeSetParentStatus(${childId},${account.id},${account.status !== 'active'})">${account.status === 'active' ? 'Отключить' : 'Включить'}</button><button class="btn danger" onclick="icubeUnlinkParent(${childId},${account.id})">Отвязать</button></div></div>`).join('');
  return `<div class="card pad" style="margin-top:16px"><div class="section-title"><div><h2>Родительский доступ</h2><div class="muted mini">Один аккаунт можно связать с несколькими детьми</div></div>${accounts.length ? '' : `<button class="btn primary" onclick="icubeCreateParentAccess(${childId})">Создать доступ</button>`}</div>${rows || '<div class="empty">Доступ ещё не создан.</div>'}<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">${accounts.length ? `<button class="btn primary" onclick="icubeCreateParentAccess(${childId})">Создать ещё аккаунт</button>` : ''}<button class="btn soft" onclick="icubeShowParentSearch(${childId})">Привязать существующего родителя</button></div>${accounts.length ? '<div class="muted mini" style="margin-top:8px">Создать ещё аккаунт — отдельный доступ для второго родителя или законного представителя.</div>' : ''}<div id="parent-access-search"></div></div>`;
}

const originalChild = window.child;
if (typeof originalChild === 'function') {
  window.child = function (...args) {
    const base = originalChild.apply(this, args);
    if (!['director', 'partner'].includes(legacy.state.role) || legacy.state.childTab !== 'overview') return base;
    return `${base}${accessBlock(legacy.state.selectedChild)}`;
  };
}

window.icubeCreateParentAccess = async (childId) => {
  try {
    const credentials = await api.request(`/children/${childId}/parent-access`, { method: 'POST', body: {} });
    showCredentials(credentials, 'Родительский доступ создан');
    cache.delete(String(childId)); await load(childId);
  } catch (error) { window.alert(message(error)); }
};
window.icubeShowParentSearch = (childId) => {
  const target = document.querySelector('#parent-access-search'); if (!target) return;
  target.innerHTML = `<div class="field" style="margin-top:12px"><label>Имя или логин</label><div style="display:flex;gap:8px"><input class="input" id="parent-access-query" autocomplete="off"><button class="btn" onclick="icubeSearchParentAccess(${childId})">Найти</button></div></div><div id="parent-access-results"></div>`;
};
window.icubeSearchParentAccess = async (childId) => {
  const query = document.querySelector('#parent-access-query')?.value ?? '';
  try {
    const rows = await api.request(`/parent-access/search?q=${encodeURIComponent(query)}`);
    const target = document.querySelector('#parent-access-results'); if (!target) return;
    target.innerHTML = rows.length ? rows.map((row) => `<div class="kpi-line"><div><b>Родитель: ${escapeHtml(row.name || 'Не указан')}</b><div class="muted mini">${escapeHtml(row.login)} · ${escapeHtml(row.linkedChildren.join(', ') || 'нет связанных детей')}</div></div><button class="btn soft" onclick="icubeLinkParent(${childId},${row.id})">Привязать</button></div>`).join('') : '<div class="empty" style="margin-top:10px">Ничего не найдено.</div>';
  } catch (error) { window.alert(message(error)); }
};
window.icubeLinkParent = async (childId, guardianId) => {
  try { await api.request(`/children/${childId}/parent-access/link`, { method: 'POST', body: { guardianId } }); cache.delete(String(childId)); await load(childId); }
  catch (error) { window.alert(message(error)); }
};
window.icubeUnlinkParent = async (childId, guardianId) => {
  if (!window.confirm('Отвязать родительский аккаунт от этого ребёнка?')) return;
  try { await api.request(`/children/${childId}/parent-access/${guardianId}`, { method: 'DELETE' }); cache.delete(String(childId)); await load(childId); }
  catch (error) { window.alert(message(error)); }
};
window.icubeResetParentPassword = async (childId, guardianId) => {
  if (!window.confirm('Сбросить пароль? Все текущие сессии родителя будут завершены.')) return;
  try { const credentials = await api.request(`/parent-access/${guardianId}/reset-password`, { method: 'POST', body: { childId } }); showCredentials(credentials, 'Новый пароль'); }
  catch (error) { window.alert(message(error)); }
};
window.icubeSetParentStatus = async (childId, guardianId, enabled) => {
  if (!window.confirm(enabled ? 'Включить родительский доступ?' : 'Отключить родительский доступ и завершить текущие сессии?')) return;
  try { await api.request(`/parent-access/${guardianId}/status`, { method: 'PATCH', body: { enabled, childId } }); cache.clear(); await load(legacy.state.selectedChild); }
  catch (error) { window.alert(message(error)); }
};

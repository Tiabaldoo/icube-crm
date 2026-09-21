import { ApiClient, ApiError } from '../data/api-client.mjs';

const api = new ApiClient();
const legacy = window.icubeLegacy;
const cache = new Map();
const loading = new Set();
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (symbol) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[symbol]);
const message = (error) => error instanceof ApiError ? error.message : 'Операция не выполнена';

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
  const rows = accounts.map((account) => `<div class="kpi-line"><div><b>${escapeHtml(account.name || 'Родитель')}</b><div class="muted mini">${escapeHtml(account.login)} · ${account.status === 'active' ? 'Активен' : 'Отключён'}</div><div class="muted mini">Дети: ${escapeHtml(account.linkedChildren.join(', ') || '—')}</div></div><div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end"><button class="btn" onclick="icubeResetParentPassword(${childId},${account.id})">Сбросить пароль</button><button class="btn" onclick="icubeSetParentStatus(${childId},${account.id},${account.status !== 'active'})">${account.status === 'active' ? 'Отключить' : 'Включить'}</button><button class="btn danger" onclick="icubeUnlinkParent(${childId},${account.id})">Отвязать</button></div></div>`).join('');
  return `<div class="card pad" style="margin-top:16px"><div class="section-title"><div><h2>Родительский доступ</h2><div class="muted mini">Один аккаунт можно связать с несколькими детьми</div></div>${accounts.length ? '' : `<button class="btn primary" onclick="icubeCreateParentAccess(${childId})">Создать доступ</button>`}</div>${rows || '<div class="empty">Доступ ещё не создан.</div>'}<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">${accounts.length ? `<button class="btn primary" onclick="icubeCreateParentAccess(${childId})">Создать ещё аккаунт</button>` : ''}<button class="btn soft" onclick="icubeShowParentSearch(${childId})">Привязать существующего родителя</button></div>${accounts.length ? '<div class="muted mini" style="margin-top:8px">Создать ещё аккаунт — отдельный доступ для второго родителя или законного представителя.</div>' : ''}<div id="parent-access-search"></div></div>`;
}

const originalChild = window.child;
if (typeof originalChild === 'function') {
  window.child = function (...args) {
    const base = originalChild.apply(this, args);
    if (!['director', 'partner'].includes(legacy.state.role)) return base;
    return `${base}${accessBlock(legacy.state.selectedChild)}`;
  };
}

window.icubeCreateParentAccess = async (childId) => {
  try {
    const credentials = await api.request(`/children/${childId}/parent-access`, { method: 'POST', body: {} });
    window.alert(`Родительский доступ создан. Сохраните данные сейчас — пароль больше не будет показан.\n\nЛогин: ${credentials.login}\nПароль: ${credentials.password}`);
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
    target.innerHTML = rows.length ? rows.map((row) => `<div class="kpi-line"><div><b>${escapeHtml(row.name || 'Родитель')}</b><div class="muted mini">${escapeHtml(row.login)} · ${escapeHtml(row.linkedChildren.join(', ') || 'нет связанных детей')}</div></div><button class="btn soft" onclick="icubeLinkParent(${childId},${row.id})">Привязать</button></div>`).join('') : '<div class="empty" style="margin-top:10px">Ничего не найдено.</div>';
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
  try { const credentials = await api.request(`/parent-access/${guardianId}/reset-password`, { method: 'POST', body: { childId } }); window.alert(`Новый пароль показывается один раз.\n\nЛогин: ${credentials.login}\nПароль: ${credentials.password}`); }
  catch (error) { window.alert(message(error)); }
};
window.icubeSetParentStatus = async (childId, guardianId, enabled) => {
  if (!window.confirm(enabled ? 'Включить родительский доступ?' : 'Отключить родительский доступ и завершить текущие сессии?')) return;
  try { await api.request(`/parent-access/${guardianId}/status`, { method: 'PATCH', body: { enabled, childId } }); cache.clear(); await load(legacy.state.selectedChild); }
  catch (error) { window.alert(message(error)); }
};

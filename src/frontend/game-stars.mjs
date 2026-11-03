import { ApiClient, ApiError } from '../data/api-client.mjs';

// Звёзды игры в карточке ребёнка (этап 4): итог, журнал, бонусы и их отзыв.
// Баланс считает только игра; страница показывает ответ сервера и отправляет лишь «выдать» или «отозвать».
// Запросы — только после того, как блок игрового доступа (game-access.mjs) получил ответ игровых маршрутов.
const api = new ApiClient();
const legacy = window.icubeLegacy;
const cache = new Map();
const loading = new Set();
const pending = new Map();
let owner = null;

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (symbol) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[symbol]);
const canView = () => ['director', 'partner'].includes(legacy.state.role);
const refresh = (childId) => { if (legacy.state.page === 'child' && String(legacy.state.selectedChild) === String(childId)) legacy.render(); };
const KINDS = {
  attendance: 'Занятие', attendance_reversal: 'Отмена занятия', trial_followup_bonus: 'Бонус ×2 после пробного',
  trial_followup_reversal: 'Отмена бонуса ×2', staff_bonus: 'Бонус сотрудника', staff_bonus_revoke: 'Отзыв бонуса', purchase: 'Покупка в игре',
};
const when = (value) => { try { return new Date(value).toLocaleString('ru-RU', { timeZone: 'Asia/Sakhalin', dateStyle: 'short', timeStyle: 'short' }); } catch { return ''; } };
const signed = (amount) => (amount > 0 ? `+${amount}` : String(amount));
const newKey = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);

function currentUser() {
  const id = legacy.state.authUser?.id ?? null;
  if (id !== owner) { owner = id; cache.clear(); loading.clear(); pending.clear(); }
  return id;
}

function message(error) {
  if (error instanceof ApiError) return error.status >= 500 && error.code !== 'GAME_UNAVAILABLE' ? `Ошибка сервера (${error.status}). Попробуйте позже` : error.message;
  return 'Нет связи с сервером. Проверьте интернет и повторите';
}

async function load(childId) {
  const user = currentUser();
  const key = `${user}:${childId}`;
  if (user == null || loading.has(key)) return;
  loading.add(key);
  let result;
  try { result = await api.request(`/children/${childId}/game-stars`); } catch (error) { result = { error: message(error) }; }
  loading.delete(key);
  if (user !== currentUser()) return;
  cache.set(String(childId), result);
  refresh(childId);
}

function bonusRow(childId, bonus) {
  const state = bonus.revoked
    ? `<div class="muted mini">Отозван: ${escapeHtml(bonus.revoked.byName ?? `пользователь ${bonus.revoked.byUserId}`)}, ${escapeHtml(when(bonus.revoked.at))} — ${escapeHtml(bonus.revoked.reason)}</div>`
    : '';
  const action = bonus.canRevoke ? `<button class="btn" onclick="icubeRevokeGameBonus(${childId},'${escapeHtml(bonus.id)}')">Отозвать</button>` : '';
  return `<div class="kpi-line"><div><b>${escapeHtml(signed(bonus.amount))} ⭐ ${escapeHtml(bonus.reason)}</b>
    <div class="muted mini">${escapeHtml(bonus.createdByName ?? `пользователь ${bonus.createdByUserId}`)}, ${escapeHtml(when(bonus.createdAt))}</div>${state}</div>${action}</div>`;
}

function starsBlock(childId) {
  const data = cache.get(String(childId));
  if (!data) { queueMicrotask(() => load(childId)); return ''; }
  const card = (body) => `<div class="card pad" style="margin-top:16px"><div class="section-title"><h2>Звёзды в игре</h2></div>${body}</div>`;
  if (data.error) return card(`<div class="notice">${escapeHtml(data.error)}</div><button class="btn" style="margin-top:8px" onclick="icubeRetryGameStars(${childId})">Повторить</button>`);
  if (!data.profile) return card('<div class="muted">Ребёнок ещё не входил в игру: звёзды появятся после первого входа.</div>');
  const wallet = data.wallet ?? { balance: 0, chest: 0, debt: 0 };
  const debt = wallet.debt > 0 ? ` · отменено после траты: ${escapeHtml(wallet.debt)} (погасится следующими звёздами)` : '';
  const entries = (data.entries ?? []).slice(0, 10).map((entry) => `<div class="muted mini">${escapeHtml(when(entry.createdAt))} · ${escapeHtml(KINDS[entry.kind] ?? entry.kind)} · ${escapeHtml(signed(entry.amount))}</div>`).join('');
  const bonuses = (data.bonuses ?? []).slice(0, 20).map((bonus) => bonusRow(childId, bonus)).join('');
  const draft = pending.get(String(childId)) ?? {};
  return card(`<div class="kpi-line"><div><b>На балансе: ${escapeHtml(wallet.balance)} ⭐</b><div class="muted mini">В сундуке: ${escapeHtml(wallet.chest)}${debt}</div></div></div>
    <div class="field" style="margin-top:8px"><label>Бонус от сотрудника (1–${escapeHtml(data.maxStars)})</label>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><input class="input" id="game-bonus-amount" type="number" min="1" max="${escapeHtml(data.maxStars)}" value="${escapeHtml(draft.amount ?? 1)}" style="max-width:90px">
      <input class="input" id="game-bonus-reason" maxlength="500" value="${escapeHtml(draft.reason ?? '')}" placeholder="За что" style="flex:1;min-width:160px">
      <button class="btn primary" ${draft.busy ? 'disabled' : ''} onclick="icubeGrantGameBonus(${childId})">Выдать</button></div></div>
    ${bonuses ? `<div style="margin-top:12px"><b>Бонусы</b>${bonuses}</div>` : ''}
    ${entries ? `<div style="margin-top:12px"><b>Последние операции</b>${entries}</div>` : ''}`);
}

const previousChild = window.child;
if (typeof previousChild === 'function') {
  window.child = function (...args) {
    const base = previousChild.apply(this, args);
    currentUser();
    const childId = legacy.state.selectedChild;
    if (!canView() || legacy.state.childTab !== 'overview' || !window.icubeGameAccessLoaded?.(childId)) return base;
    return `${base}${starsBlock(childId)}`;
  };
}

window.icubeRetryGameStars = (childId) => { cache.delete(String(childId)); return load(childId); };

// Один ключ на одну выдачу: повтор после сбоя сети отправляет тот же ключ, и бонус не задваивается.
window.icubeGrantGameBonus = async (childId) => {
  const user = currentUser();
  const amount = Number(document.querySelector('#game-bonus-amount')?.value);
  const reason = (document.querySelector('#game-bonus-reason')?.value ?? '').trim();
  const limits = cache.get(String(childId)) ?? {};
  if (!Number.isInteger(amount) || amount < 1 || amount > (limits.maxStars ?? 10)) { window.alert(`Количество звёзд: от 1 до ${limits.maxStars ?? 10}`); return; }
  if (reason.length < 3) { window.alert('Укажите причину бонуса'); return; }
  const confirmed = amount > (limits.confirmAbove ?? 3);
  if (confirmed && !window.confirm(`Выдать ${amount} звёзд? Это больше обычного бонуса.`)) return;
  const signature = `${amount}:${reason}`;
  const previous = pending.get(String(childId));
  if (previous?.busy) return;
  const key = previous?.signature === signature ? previous.key : newKey();
  pending.set(String(childId), { signature, key, amount, reason, busy: true });
  refresh(childId);
  try {
    const result = await api.request(`/children/${childId}/game-stars/bonuses`, { method: 'POST', body: { amount, reason, ...(confirmed ? { confirmed: true } : {}) }, idempotencyKey: key });
    if (user !== currentUser()) return;
    pending.delete(String(childId));
    if (result?.stale) cache.delete(String(childId)); else cache.set(String(childId), result);
    refresh(childId);
  } catch (error) {
    if (user !== currentUser()) return;
    // Ответ не пришёл — ключ сохраняем для повтора; отказ сервера — следующая выдача с новым ключом.
    pending.set(String(childId), error instanceof ApiError && error.status < 500 ? { amount, reason } : { signature, key, amount, reason, busy: false });
    window.alert(message(error));
    refresh(childId);
  }
};

window.icubeRevokeGameBonus = async (childId, bonusId) => {
  const user = currentUser();
  const reason = (window.prompt('Причина отзыва бонуса') ?? '').trim();
  if (!reason) return;
  try {
    const result = await api.request(`/children/${childId}/game-stars/bonuses/${encodeURIComponent(bonusId)}/revoke`, { method: 'POST', body: { reason } });
    if (user !== currentUser()) return;
    if (result?.stale) cache.delete(String(childId)); else cache.set(String(childId), result);
  } catch (error) {
    if (user !== currentUser()) return;
    window.alert(message(error));
    cache.delete(String(childId));
  }
  refresh(childId);
};

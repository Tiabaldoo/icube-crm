import { ApiClient, ApiError } from '../data/api-client.mjs';

// Звёзды игры (этап 4): итог, журнал, бонусы и их отзыв. Баланс считает только игра; страница показывает
// ответ сервера и отправляет лишь «выдать» или «отозвать». Права проверяет сервер при каждом запросе.
// Директор и партнёр — блок в карточке ребёнка, запросы только после ответа игровых маршрутов (game-access.mjs).
// Преподаватель — пункт «⭐ Звёзды в игре» в меню «⋯» ученика в экране занятия, только если в GET /children
// у ребёнка пришёл признак gameStars (CRM добавляет его лишь при включённой игре, праве преподавателя и
// активном игровом доступе). Без игры у преподавателя нет ни пункта, ни запросов.
const api = new ApiClient();
const legacy = window.icubeLegacy;
const cache = new Map();
const loading = new Set();
const pending = new Map();
let owner = null;
let modalChild = null;
let gameMissing = false;
// Без сети звёзды всё равно не загрузить, а признак мог остаться в офлайн-снимке: кнопку не показываем.
const teacherButtonAllowed = (child) => legacy.state.role === 'teacher' && child?.gameStars === true && !gameMissing && globalThis.navigator?.onLine !== false;
const MODAL_MARKER = 'data-game-stars-modal';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (symbol) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[symbol]);
const canView = () => ['director', 'partner'].includes(legacy.state.role);
const modalOpen = (childId) => modalChild === String(childId) && String(legacy.state.modal ?? '').includes(MODAL_MARKER);
function refresh(childId) {
  if (modalOpen(childId)) { legacy.state.modal = teacherModal(childId); legacy.render(); return; }
  if (legacy.state.page === 'child' && String(legacy.state.selectedChild) === String(childId)) legacy.render();
}
const KINDS = {
  attendance: 'Занятие', attendance_reversal: 'Отмена занятия', trial_followup_bonus: 'Бонус ×2 после пробного',
  trial_followup_reversal: 'Отмена бонуса ×2', staff_bonus: 'Бонус сотрудника', staff_bonus_revoke: 'Отзыв бонуса', purchase: 'Покупка в игре',
};
const when = (value) => { try { return new Date(value).toLocaleString('ru-RU', { timeZone: 'Asia/Sakhalin', dateStyle: 'short', timeStyle: 'short' }); } catch { return ''; } };
const signed = (amount) => (amount > 0 ? `+${amount}` : String(amount));
const newKey = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);

function currentUser() {
  const id = legacy.state.authUser?.id ?? null;
  if (id !== owner) {
    owner = id; cache.clear(); loading.clear(); pending.clear();
    if (modalChild != null && String(legacy.state.modal ?? '').includes(MODAL_MARKER)) legacy.state.modal = null;
    modalChild = null;
  }
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
  try { result = await api.request(`/children/${childId}/game-stars`); } catch (error) {
    // 404 без кода — игру выключили, а признак остался в старых данных (например, в офлайн-снимке
    // преподавателя): кнопки скрываются до перезагрузки страницы, повторных запросов нет.
    if (legacy.state.role === 'teacher' && error instanceof ApiError && error.status === 404 && !error.code) {
      gameMissing = true;
      loading.delete(key);
      if (user !== currentUser()) return;
      if (modalOpen(childId)) { legacy.state.modal = null; modalChild = null; legacy.render(); } else refresh(childId);
      return;
    }
    result = { error: message(error) };
  }
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

// Содержимое одно для карточки и для окна преподавателя.
function starsContent(childId) {
  const data = cache.get(String(childId));
  if (!data) { queueMicrotask(() => load(childId)); return '<div class="muted">Загружаем звёзды…</div>'; }
  if (data.error) return (`<div class="notice">${escapeHtml(data.error)}</div><button class="btn" style="margin-top:8px" onclick="icubeRetryGameStars(${childId})">Повторить</button>`);
  if (!data.profile) return ('<div class="muted">Ребёнок ещё не входил в игру: звёзды появятся после первого входа.</div>');
  const wallet = data.wallet ?? { balance: 0, chest: 0, debt: 0 };
  const debt = wallet.debt > 0 ? ` · отменено после траты: ${escapeHtml(wallet.debt)} (погасится следующими звёздами)` : '';
  const entries = (data.entries ?? []).slice(0, 10).map((entry) => `<div class="muted mini">${escapeHtml(when(entry.createdAt))} · ${escapeHtml(KINDS[entry.kind] ?? entry.kind)} · ${escapeHtml(signed(entry.amount))}</div>`).join('');
  const bonuses = (data.bonuses ?? []).slice(0, 20).map((bonus) => bonusRow(childId, bonus)).join('');
  const draft = pending.get(String(childId)) ?? {};
  const head = `<div class="kpi-line"><div><b>На балансе: ${escapeHtml(wallet.balance)} ⭐</b><div class="muted mini">В сундуке: ${escapeHtml(wallet.chest)}${debt}</div></div></div>`;
  const history = `${bonuses ? `<div style="margin-top:12px"><b>Бонусы</b>${bonuses}</div>` : ''}
    ${entries ? `<div style="margin-top:12px"><b>Последние операции</b>${entries}</div>` : ''}`;
  // Доступ отключён: звёзды сохранены и видны, выдавать и отзывать нельзя (сервер это тоже запрещает).
  if (data.accessActive === false) return `${head}<div class="notice" style="margin-top:8px">Игровой доступ ребёнка не активен: звёзды сохранены, выдавать и отзывать бонусы нельзя.</div>${history}`;
  return (`${head}
    <div class="field" style="margin-top:8px"><label>Бонус от сотрудника (1–${escapeHtml(data.maxStars)})</label>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><input class="input" id="game-bonus-amount" type="number" min="1" max="${escapeHtml(data.maxStars)}" value="${escapeHtml(draft.amount ?? 1)}" style="max-width:90px">
      <input class="input" id="game-bonus-reason" maxlength="500" value="${escapeHtml(draft.reason ?? '')}" placeholder="За что" style="flex:1;min-width:160px">
      <button class="btn primary" ${draft.busy ? 'disabled' : ''} onclick="icubeGrantGameBonus(${childId})">Выдать</button></div></div>
    ${history}`);
}

function starsBlock(childId) {
  if (!cache.get(String(childId))) { queueMicrotask(() => load(childId)); return ''; }
  return `<div class="card pad" style="margin-top:16px"><div class="section-title"><h2>Звёзды в игре</h2></div>${starsContent(childId)}</div>`;
}

function teacherModal(childId) {
  const child = (legacy.state.children ?? []).find((item) => String(item.id) === String(childId));
  return `<div ${MODAL_MARKER}="${escapeHtml(childId)}"><div class="section-title"><h3>⭐ ${escapeHtml(child?.name ?? 'Звёзды в игре')}</h3>
    <button class="btn" type="button" aria-label="Закрыть" onclick="closeModal()">×</button></div>${starsContent(childId)}</div>`;
}

// Пункт «⭐ Звёзды в игре» — в меню «⋯» ученика в экране занятия.
// Где меню уже есть (тип посещения в завершённом занятии, действия с добавленным ребёнком), пункт
// добавляется к нему, остальные пункты не меняются. Где меню нет, в пустую ячейку «⋯» встаёт такая же
// кнопка с одним этим пунктом — только при включённой игре, активном доступе и праве преподавателя.
const childById = (childId) => (legacy.state.children ?? []).find((item) => String(item.id) === String(childId));
const starItem = (childId) => `<button class="btn game-stars-open" type="button" onclick="icubeOpenGameStars(${Number(childId)})">⭐ Звёзды в игре</button>`;
const EMPTY_MORE_SLOT = '<div class="lesson-student-more-slot"></div>';
const moreButton = (childId) => `<div class="lesson-student-more-slot"><button class="btn student-more trial-more" aria-label="Дополнительные действия" title="Дополнительные действия" onclick="icubeGameStarsMenu(${Number(childId)})">⋯</button></div>`;

const previousStudentCheck = window.studentCheck;
if (typeof previousStudentCheck === 'function') {
  window.studentCheck = function (child, ...args) {
    const output = previousStudentCheck.call(this, child, ...args);
    currentUser();
    if (!teacherButtonAllowed(child) || typeof output !== 'string' || !output.includes(EMPTY_MORE_SLOT)) return output;
    return output.replace(EMPTY_MORE_SLOT, moreButton(child.id));
  };
}

// Существующее меню открылось — добавляем пункт первым в его ряд кнопок.
function withStarMenuItem(name) {
  const previous = window[name];
  if (typeof previous !== 'function') return;
  window[name] = function (childId, ...args) {
    const result = previous.call(this, childId, ...args);
    currentUser();
    const menu = String(legacy.state.modal ?? '');
    if (teacherButtonAllowed(childById(childId)) && !menu.includes('game-stars-open') && /<div class="modal-actions"[^>]*>/.test(menu)) {
      legacy.state.modal = menu.replace(/(<div class="modal-actions"[^>]*>)/, (opening) => `${opening}${starItem(childId)}`);
      legacy.render();
    }
    return result;
  };
}
withStarMenuItem('visitTrialOptionsV121');
withStarMenuItem('icubeExtraOptions');

window.icubeGameStarsMenu = (childId) => {
  currentUser();
  if (!teacherButtonAllowed(childById(childId))) return;
  legacy.state.modal = `<h3>Дополнительные действия</h3><div class="modal-actions" style="flex-wrap:wrap">${starItem(childId)}<button class="btn" onclick="closeModal()">Отмена</button></div>`;
  legacy.render();
};

window.icubeOpenGameStars = (childId) => {
  currentUser();
  if (!teacherButtonAllowed(childById(childId))) return;
  modalChild = String(childId);
  cache.delete(String(childId));
  legacy.state.modal = teacherModal(childId);
  legacy.render();
};

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

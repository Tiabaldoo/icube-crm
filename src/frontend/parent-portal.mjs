import { ApiClient, ApiError } from '../data/api-client.mjs';

const api = new ApiClient();
const app = globalThis.document?.querySelector('#app') ?? null;
const tabs = [
  ['home', 'Главная'], ['schedule', 'Расписание'], ['photos', 'Фото'],
  ['attendance', 'Посещения'], ['payments', 'Оплаты'], ['settings', 'Настройки'],
];
const state = { profile: null, childId: null, tab: 'home', data: null, notifications: [], loading: false, loadVersion: 0, error: null, viewer: null, payment: null, lessonInfo: null, scheduleCursor: null, touchX: null };
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (symbol) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[symbol]);
const dateRu = (value) => value ? String(value).slice(0, 10).split('-').reverse().join('.') : '—';
const time = (value) => value ? String(value).slice(11, 16) : '—';
const money = (value) => `${new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value ?? 0))} ₽`;
const lessonCount = (value) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 4 }).format(Number(value ?? 0));
const selectedChild = () => state.profile?.children?.find((child) => String(child.id) === String(state.childId));

export function parentScheduleStatus(lesson) {
  if (lesson.status === 'cancelled') return 'Отменено';
  if (lesson.status === 'completed') return 'Проведено';
  if (lesson.moved) return 'Перенесено';
  return '';
}

const pad = (value) => String(value).padStart(2, '0');
const localIsoDate = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
function parseIsoDate(value) {
  const [year, month, day] = String(value ?? '').split('-').map(Number);
  const date = new Date(year, month - 1, day || 1);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}
function scheduleRange(cursor) {
  const date = parseIsoDate(cursor);
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { start, end, from: localIsoDate(start), to: localIsoDate(end),
    title: new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(date) };
}

function errorMessage(error) {
  if (error instanceof ApiError) return error.message;
  return 'Не удалось загрузить данные. Повторите попытку.';
}

function empty(text) { return `<div class="parent-empty">${escapeHtml(text)}</div>`; }
function childSelector() {
  const children = state.profile?.children ?? [];
  if (children.length < 2) return '';
  return `<label class="parent-child-select"><span>Ребёнок</span><select data-action="child">${children.map((child) => `<option value="${child.id}"${String(child.id) === String(state.childId) ? ' selected' : ''}>${escapeHtml(child.name)}</option>`).join('')}</select></label>`;
}

function shell(content) {
  const unread = state.notifications.filter((item) => !item.readAt).length;
  app.innerHTML = `<div class="parent-app">
    <header class="parent-header"><div><b>iCube</b><span>Кабинет родителя</span></div>${childSelector()}<button class="parent-bell" data-action="notifications" aria-label="Уведомления">🔔${unread ? `<i>${unread}</i>` : ''}</button></header>
    <main class="parent-main">${state.error ? `<div class="parent-error">${escapeHtml(state.error)} <button data-action="retry">Повторить</button></div>` : ''}${state.loading ? '<div class="parent-loading">Загрузка…</div>' : content}</main>
    <nav class="parent-nav">${tabs.map(([id, label]) => `<button data-action="tab" data-tab="${id}" class="${state.tab === id ? 'active' : ''}">${escapeHtml(label)}</button>`).join('')}</nav>
    ${viewerHtml()}${paymentModalHtml()}${lessonInfoHtml()}
  </div>`;
}

function homeHtml(data) {
  const child = data.child;
  const next = data.nextLesson;
  const enrollmentCards = data.enrollments.map((item) => `<article class="parent-card parent-balance"><div><span>${escapeHtml(item.direction)}</span><strong>${lessonCount(item.balanceLessons)}</strong><small>оплаченных занятий</small></div><div><span>Абонемент</span><strong>${item.subscriptionPrice == null ? '—' : money(item.subscriptionPrice)}</strong></div></article>`).join('');
  const about = data.enrollments.map((item) => `<div class="parent-info"><b>${escapeHtml(item.direction)}</b><span>${escapeHtml(item.group ?? 'Группа не назначена')}</span><span>${escapeHtml(item.teacher ?? 'Преподаватель не назначен')}</span><span>${escapeHtml(item.site ?? 'Площадка не назначена')}</span><span>${escapeHtml(item.schedule ?? 'Расписание не назначено')}</span></div>`).join('');
  return `<section class="parent-title"><span>Здравствуйте!</span><h1>${escapeHtml(child.name)}</h1></section>
    <article class="parent-card"><h2>Ближайшее занятие</h2>${next ? `<div class="parent-next"><strong>${dateRu(next.startsAt)}</strong><b>${time(next.startsAt)}–${time(next.endsAt)}</b><span>${escapeHtml(next.site)}</span></div>` : empty('Нет будущих занятий.')}</article>
    <section class="parent-balances">${enrollmentCards || empty('Нет активных направлений.')}</section>
    <article class="parent-card"><h2>Последнее фото</h2>${data.latestPhoto ? `<button class="parent-photo-preview" data-action="tab" data-tab="photos"><img src="${escapeHtml(data.latestPhoto.fileUrl)}" alt="Последнее фото ${escapeHtml(child.name)}"></button>` : empty('Нет доступных фотографий.')}</article>
    <article class="parent-card"><h2>О ребёнке</h2>${about || empty('Информация о направлениях пока не добавлена.')}</article>`;
}

function scheduleEventHtml(lesson) {
  const status = parentScheduleStatus(lesson);
  const statusClass = status === 'Отменено' ? 'red' : status === 'Перенесено' ? 'amber' : 'green';
  return `<button class="event parent-calendar-event${status === 'Проведено' ? ' done' : ''}" data-action="lesson-info" data-lesson="${lesson.id}">
    <span class="calendar-event-site">${escapeHtml(lesson.site ?? 'Площадка не указана')}</span>
    <span class="calendar-event-meta">${time(lesson.startsAt)} · ${escapeHtml(lesson.group)}</span>
    ${status ? `<span class="calendar-event-status"><span class="badge ${statusClass}">${status}</span></span>` : ''}
  </button>`;
}

export function parentScheduleCalendar(rows, cursor) {
  const range = scheduleRange(cursor);
  const byDate = new Map();
  for (const lesson of rows) {
    const key = String(lesson.startsAt).slice(0, 10);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(lesson);
  }
  for (const lessons of byDate.values()) lessons.sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt)) || String(a.id).localeCompare(String(b.id)));
  const cells = [];
  const blanks = (range.start.getDay() + 6) % 7;
  for (let index = 0; index < blanks; index += 1) cells.push(null);
  for (let day = 1; day <= range.end.getDate(); day += 1) cells.push(new Date(range.start.getFullYear(), range.start.getMonth(), day));
  while (cells.length % 7) cells.push(null);
  const today = localIsoDate();
  const desktop = `<div class="calendar-desktop"><div class="calendar calendar-weekdays">${['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day) => `<div>${day}</div>`).join('')}</div><div class="calendar calendar-grid">${cells.map((date) => {
    if (!date) return '<div class="day calendar-empty"></div>';
    const key = localIsoDate(date); const lessons = byDate.get(key) ?? [];
    return `<div class="day${key === today ? ' calendar-today' : ''}"><div class="date">${pad(date.getDate())}.${pad(date.getMonth() + 1)}${key === today ? '<span class="today-label">сегодня</span>' : ''}</div>${lessons.map(scheduleEventHtml).join('')}</div>`;
  }).join('')}</div></div>`;
  const agendaDays = [];
  for (const [date, lessons] of byDate) agendaDays.push({ date: parseIsoDate(date), key: date, lessons });
  agendaDays.sort((a, b) => a.key.localeCompare(b.key));
  const mobile = `<div class="calendar-mobile">${agendaDays.length ? agendaDays.map(({ date, key, lessons }) => `<section class="calendar-agenda-day${key === today ? ' calendar-today' : ''}"><div class="calendar-agenda-date"><b>${new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(date)}</b>${key === today ? '<span>Сегодня</span>' : ''}</div>${lessons.map(scheduleEventHtml).join('')}</section>`).join('') : '<div class="calendar-mobile-empty">В этом месяце занятий нет.</div>'}</div>`;
  return `<div class="calendar-toolbar"><div class="calendar-toolbar-nav"><button class="btn calendar-arrow" data-action="schedule-prev" aria-label="Предыдущий месяц">←</button><button class="btn" data-action="schedule-today">Сегодня</button><button class="btn calendar-arrow" data-action="schedule-next" aria-label="Следующий месяц">→</button><div class="calendar-period-title">${escapeHtml(range.title)}</div></div></div>${desktop}${mobile}`;
}

function scheduleHtml(rows) {
  return `<section class="parent-title"><h1>Расписание</h1><span>Только занятия текущих групп</span></section>${parentScheduleCalendar(rows, state.scheduleCursor)}`;
}

function attendanceHtml(rows) {
  return `<section class="parent-title"><h1>Посещения</h1><span>Фактически посещённые занятия</span></section>${rows.length ? `<div class="parent-list">${rows.map((row) => `<article class="parent-card parent-row"><div><b>${dateRu(row.startsAt)}</b><span>${escapeHtml(row.direction)} · ${escapeHtml(row.group)}</span></div>${row.trial ? '<em>Ознакомительное</em>' : ''}</article>`).join('')}</div>` : empty('Посещений пока нет.')}`;
}

function paymentsHtml(data) {
  const rows = data?.rows ?? [];
  const enrollments = data?.home?.enrollments?.filter((item) => item.subscriptionPrice != null) ?? [];
  return `<section class="parent-title"><h1>Оплаты</h1></section>${enrollments.length ? `<div class="parent-pay-actions">${enrollments.map((item) => `<button class="parent-primary" data-action="pay" data-amount="${escapeHtml(item.subscriptionPrice)}" data-direction="${escapeHtml(item.direction)}">Оплатить ${escapeHtml(item.direction)} · ${money(item.subscriptionPrice)}</button>`).join('')}</div>` : ''}${rows.length ? `<div class="parent-list">${rows.map((row) => `<article class="parent-card parent-row"><div><b>${row.type === 'refund' ? 'Возврат' : 'Оплата'}</b><span>${dateRu(row.date)}</span></div><strong class="${row.type === 'refund' ? 'negative' : ''}">${row.type === 'refund' ? '−' : '+'}${money(row.amount)}</strong></article>`).join('')}</div>` : empty('Оплат пока нет.')}`;
}

function groupPhotos(rows) {
  return rows.reduce((groups, photo) => { const key = String(photo.lessonAt).slice(0, 10); (groups[key] ??= []).push(photo); return groups; }, {});
}
function photosHtml(rows) {
  const groups = groupPhotos(rows);
  return `<section class="parent-title"><h1>Фото</h1><span>Фотографии доступны ограниченное время</span></section>${rows.length ? Object.entries(groups).map(([date, photos]) => `<section class="parent-photo-day"><h2>${dateRu(date)}</h2><div>${photos.map((photo) => `<button data-action="photo" data-photo="${photo.id}"><img src="${escapeHtml(photo.fileUrl)}" alt="Фото от ${dateRu(date)}"></button>`).join('')}</div></section>`).join('') : empty('Нет доступных фотографий.')}`;
}

function settingsHtml(data) {
  const contact = state.profile.contact ?? {};
  return `<section class="parent-title"><h1>Настройки</h1></section>
    <article class="parent-card"><h2>Профиль</h2><form data-action="profile"><label>ФИО<input name="name" value="${escapeHtml(data.profile.name ?? '')}"></label><label>Телефон<input name="phone" value="${escapeHtml(data.profile.phone ?? '')}"></label><label>Email<input name="email" type="email" value="${escapeHtml(data.profile.email ?? '')}"></label><button class="parent-primary" type="submit">Сохранить</button></form></article>
    <article class="parent-card"><h2>Уведомления</h2>${data.settings.map((item) => `<label class="parent-toggle"><span>${escapeHtml(item.label)}</span><input type="checkbox" data-action="notification-setting" data-type="${item.type}"${item.enabled ? ' checked' : ''}></label>`).join('')}</article>
    <article class="parent-card"><h2>Мои дети</h2>${state.profile.children.map((child) => `<div class="parent-child-line">${escapeHtml(child.name)}</div>`).join('')}</article>
    <article class="parent-card"><h2>Документы</h2>${data.documents.map((document) => `<div class="parent-document"><b>${escapeHtml(document.title)}</b><span>Версия ${escapeHtml(document.version)} · принято ${dateRu(document.acceptedAt)}</span>${document.url ? `<a href="${escapeHtml(document.url)}" target="_blank" rel="noopener">Открыть</a>` : ''}</div>`).join('')}</article>
    <article class="parent-card"><h2>Связаться с нами</h2><div class="parent-actions">${contact.maxUrl ? `<a class="parent-primary" href="${escapeHtml(contact.maxUrl)}" target="_blank" rel="noopener">Написать в MAX</a>` : ''}${contact.phone ? `<a href="tel:${escapeHtml(contact.phone)}">Позвонить ${escapeHtml(contact.phone)}</a>` : ''}</div></article>
    <button class="parent-logout" data-action="logout">Выйти</button>`;
}

function notificationsHtml(rows) {
  return `<section class="parent-title"><h1>Уведомления</h1></section>${rows.length ? `<div class="parent-list">${rows.map((item) => `<button class="parent-card parent-notification ${item.readAt ? '' : 'unread'}" data-action="notification" data-id="${item.id}" data-child="${item.childId ?? ''}" data-destination="${escapeHtml(item.destination ?? 'home')}"><b>${escapeHtml(item.title)}</b><span>${escapeHtml(item.body)}</span><small>${item.childName ? `${escapeHtml(item.childName)} · ` : ''}${dateRu(item.createdAt)} ${time(item.createdAt)}</small></button>`).join('')}</div>` : empty('Уведомлений пока нет.')}`;
}

function viewerHtml() {
  if (!state.viewer?.photos?.length) return '';
  const photo = state.viewer.photos[state.viewer.index];
  return `<div class="parent-viewer" data-action="viewer-close"><button data-action="viewer-close" aria-label="Закрыть">×</button><button data-action="viewer-prev" aria-label="Предыдущее">‹</button><img src="${escapeHtml(photo.fileUrl)}" alt="Фото"><button data-action="viewer-next" aria-label="Следующее">›</button><span>${state.viewer.index + 1} / ${state.viewer.photos.length}</span></div>`;
}

function paymentModalHtml() {
  if (!state.payment) return '';
  const qr = state.profile.contact?.paymentQrUrl;
  return `<div class="parent-payment-modal"><article class="parent-card"><button data-action="pay-close" aria-label="Закрыть">×</button><h2>Оплата абонемента</h2><span>${escapeHtml(state.payment.direction)}</span><strong>${money(state.payment.amount)}</strong>${qr ? `<img src="${escapeHtml(qr)}" alt="QR для оплаты">` : '<div class="parent-empty">QR будет добавлен администратором.</div>'}<p>После оплаты зачисление появится после подтверждения администратором.</p></article></div>`;
}

function lessonInfoHtml() {
  const lesson = state.lessonInfo;
  if (!lesson) return '';
  const status = parentScheduleStatus(lesson) || 'Запланировано';
  return `<div class="parent-lesson-modal"><article class="parent-card"><button data-action="lesson-info-close" aria-label="Закрыть">×</button><h2>${dateRu(lesson.startsAt)} · ${time(lesson.startsAt)}–${time(lesson.endsAt)}</h2><div class="parent-info"><b>${escapeHtml(lesson.group)}</b><span>${escapeHtml(lesson.site)}</span><span>${escapeHtml(lesson.teacher)}</span><span>${escapeHtml(status)}</span></div></article></div>`;
}

function consentHtml(documents) {
  app.innerHTML = `<div class="parent-consent"><div><b>iCube</b><h1>Документы и согласия</h1><p>Для доступа к кабинету примите каждый актуальный обязательный документ отдельно.</p>${documents.map((document) => `<article class="parent-card"><h2>${escapeHtml(document.title)}</h2><div class="parent-document-body">${escapeHtml(document.body ?? '')}</div>${document.url ? `<a href="${escapeHtml(document.url)}" target="_blank" rel="noopener">Открыть полный текст</a>` : ''}<div><small>Версия ${escapeHtml(document.version)}</small>${document.acceptedAt ? '<b class="accepted">Принято</b>' : `<button class="parent-primary" data-action="accept" data-id="${document.id}">Принять</button>`}</div></article>`).join('')}</div></div>`;
}

async function loadTab() {
  const version = ++state.loadVersion; const tab = state.tab; const childId = state.childId;
  state.loading = true; state.error = null; shell('');
  try {
    let data;
    if (tab === 'notifications') data = await api.request('/parent/notifications');
    else if (tab === 'home') data = await api.request(`/parent/children/${childId}/home`);
    else if (tab === 'schedule') {
      const range = scheduleRange(state.scheduleCursor);
      data = await api.request(`/parent/children/${childId}/schedule?from=${range.from}&to=${range.to}`);
    }
    else if (tab === 'settings') {
      const [profile, settings, docs] = await Promise.all([api.request('/parent/profile'), api.request('/parent/notification-settings'), api.request('/parent/documents')]);
      data = { profile, settings, documents: docs.documents };
    } else if (tab === 'payments') {
      const [rows, home] = await Promise.all([api.request(`/parent/children/${childId}/payments`), api.request(`/parent/children/${childId}/home`)]);
      data = { rows, home };
    } else data = await api.request(`/parent/children/${childId}/${tab}`);
    const notifications = await api.request('/parent/notifications').catch(() => state.notifications);
    if (version !== state.loadVersion) return;
    state.data = data; state.notifications = notifications;
  } catch (error) {
    if (version !== state.loadVersion) return;
    if (error instanceof ApiError && error.status === 401) return window.icubeAuthLogout?.();
    state.error = errorMessage(error);
  } finally { if (version === state.loadVersion) { state.loading = false; render(); } }
}

function render() {
  if (state.loading) return shell('');
  if (state.tab === 'notifications') return shell(notificationsHtml(state.data ?? []));
  if (state.tab === 'home') return shell(homeHtml(state.data ?? { child: selectedChild() ?? {}, enrollments: [], nextLesson: null, latestPhoto: null }));
  if (state.tab === 'schedule') return shell(scheduleHtml(state.data ?? []));
  if (state.tab === 'attendance') return shell(attendanceHtml(state.data ?? []));
  if (state.tab === 'payments') return shell(paymentsHtml(state.data ?? { rows: [], home: null }));
  if (state.tab === 'photos') return shell(photosHtml(state.data ?? []));
  return shell(settingsHtml(state.data ?? { profile: {}, settings: [], documents: [] }));
}

async function start() {
  try {
    state.profile = await api.request('/parent/me');
    if (state.profile.consentRequired) {
      const result = await api.request('/parent/documents');
      consentHtml(result.documents);
      return;
    }
    state.childId = state.profile.children[0]?.id ?? null;
    if (!state.childId) { app.innerHTML = `<div class="parent-consent">${empty('К аккаунту пока не привязан ребёнок. Обратитесь к администратору.')}</div>`; return; }
    state.tab = 'home'; state.scheduleCursor = localIsoDate();
    await loadTab();
  } catch (error) {
    app.innerHTML = `<div class="parent-consent"><div class="parent-error">${escapeHtml(errorMessage(error))}</div></div>`;
  }
}

function setViewer(delta) {
  if (!state.viewer) return;
  const length = state.viewer.photos.length;
  state.viewer.index = (state.viewer.index + delta + length) % length;
  render();
}

app?.addEventListener('change', async (event) => {
  const action = event.target.dataset.action;
  if (action === 'child') { state.childId = event.target.value; state.data = null; await loadTab(); }
  if (action === 'notification-setting') {
    try { await api.request('/parent/notification-settings', { method: 'PATCH', body: { [event.target.dataset.type]: event.target.checked } }); }
    catch (error) { event.target.checked = !event.target.checked; window.alert(errorMessage(error)); }
  }
});
app?.addEventListener('submit', async (event) => {
  if (event.target.dataset.action !== 'profile') return;
  event.preventDefault(); const form = new FormData(event.target);
  try { await api.request('/parent/profile', { method: 'PATCH', body: Object.fromEntries(form) }); await loadTab(); }
  catch (error) { window.alert(errorMessage(error)); }
});
app?.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-action]'); if (!target) return;
  const action = target.dataset.action;
  try {
  if (action === 'tab') { state.tab = target.dataset.tab; state.data = null; await loadTab(); }
  else if (action === 'retry') await loadTab();
  else if (action === 'notifications') { state.tab = 'notifications'; await loadTab(); }
  else if (action === 'notification') { await api.request(`/parent/notifications/${target.dataset.id}/read`, { method: 'POST' }); if (state.profile.children.some((child) => String(child.id) === target.dataset.child)) state.childId = target.dataset.child; state.tab = target.dataset.destination || 'home'; await loadTab(); }
  else if (action === 'photo') { const rows = state.data ?? []; state.viewer = { photos: rows, index: Math.max(0, rows.findIndex((item) => String(item.id) === target.dataset.photo)) }; render(); }
  else if (action === 'viewer-close' && (event.target === target || event.target.tagName === 'BUTTON')) { state.viewer = null; render(); }
  else if (action === 'viewer-prev') setViewer(-1);
  else if (action === 'viewer-next') setViewer(1);
  else if (action === 'accept') { await api.request(`/parent/documents/${target.dataset.id}/accept`, { method: 'POST' }); await start(); }
  else if (action === 'logout') window.icubeAuthLogout?.();
  else if (action === 'pay') {
    state.payment = { amount: target.dataset.amount, direction: target.dataset.direction }; render();
  }
  else if (action === 'pay-close') { state.payment = null; render(); }
  else if (action === 'schedule-prev' || action === 'schedule-next') {
    const cursor = parseIsoDate(state.scheduleCursor); cursor.setMonth(cursor.getMonth() + (action === 'schedule-prev' ? -1 : 1), 1);
    state.scheduleCursor = localIsoDate(cursor); state.data = null; await loadTab();
  }
  else if (action === 'schedule-today') { state.scheduleCursor = localIsoDate(); state.data = null; await loadTab(); }
  else if (action === 'lesson-info') { state.lessonInfo = (state.data ?? []).find((lesson) => String(lesson.id) === target.dataset.lesson) ?? null; render(); }
  else if (action === 'lesson-info-close') { state.lessonInfo = null; render(); }
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) window.icubeAuthLogout?.();
    else window.alert(errorMessage(error));
  }
});
app?.addEventListener('touchstart', (event) => { if (state.viewer) state.touchX = event.changedTouches[0]?.clientX ?? null; }, { passive: true });
app?.addEventListener('touchend', (event) => { if (!state.viewer || state.touchX == null) return; const delta = (event.changedTouches[0]?.clientX ?? state.touchX) - state.touchX; if (Math.abs(delta) > 50) setViewer(delta < 0 ? 1 : -1); state.touchX = null; }, { passive: true });

if (globalThis.window) window.icubeParentPortal = { start, reload: loadTab };

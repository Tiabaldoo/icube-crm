import { ApiClient, ApiError } from '../data/api-client.mjs';
import { ageOnDate, businessDate } from '../shared/business-time.mjs';

const api = new ApiClient();
const app = globalThis.document?.querySelector('#app') ?? null;
const tabs = [
  ['home', 'Главная'], ['schedule', 'Расписание'], ['photos', 'Фото'],
  ['attendance', 'Посещения'], ['payments', 'Оплаты'], ['about', 'О ребёнке'], ['settings', 'Настройки'],
];
const state = { profile: null, childId: null, tab: 'home', data: null, notifications: [], loading: false, loadVersion: 0, error: null, viewer: null, payment: null, lessonInfo: null, scheduleCursor: null, menuOpen: false, touchX: null };
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (symbol) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[symbol]);
const dateRu = (value) => value ? String(value).slice(0, 10).split('-').reverse().join('.') : '—';
const time = (value) => value ? String(value).slice(11, 16) : '—';
const money = (value) => `${new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value ?? 0))} ₽`;
const lessonCount = (value) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 4 }).format(Number(value ?? 0));
const selectedChild = () => state.profile?.children?.find((child) => String(child.id) === String(state.childId));

export function parentScheduleStatus(lesson) {
  if (lesson.status === 'cancelled') return 'Отменено';
  if (lesson.status === 'completed') return lesson.present ? 'Проведено' : 'Отсутствовал';
  if (lesson.status === 'scheduled' && lesson.absenceNotice) return 'Ребёнка не будет';
  if (lesson.moved) return 'Перенесено';
  return '';
}

const pad = (value) => String(value).padStart(2, '0');
const localIsoDate = (date) => date instanceof Date ? date.toISOString().slice(0, 10) : businessDate();
export function ageFromBirthDate(birthDate, onDate = businessDate()) { return ageOnDate(birthDate, onDate); }
function decimalUnits(value) {
  const match = String(value ?? '0').trim().match(/^(-?)(\d+)(?:\.(\d{1,8}))?$/);
  if (!match) return 0n;
  const units = BigInt(match[2]) * 100000000n + BigInt((match[3] ?? '').padEnd(8, '0'));
  return match[1] ? -units : units;
}
function lessonValue(value) {
  const normalized = String(value ?? '0').replace(/\.0+$/, '').replace(/(\.\d*?[1-9])0+$/, '$1');
  return normalized.replace('.', ',');
}
function lessonNoun(units) {
  if (units % 100000000n !== 0n) return 'занятия';
  const integer = units / 100000000n; const lastTwo = integer % 100n; const last = integer % 10n;
  if (lastTwo >= 11n && lastTwo <= 14n) return 'занятий';
  if (last === 1n) return 'занятие';
  if (last >= 2n && last <= 4n) return 'занятия';
  return 'занятий';
}
export function parentBalancePresentation(value) {
  const units = decimalUnits(value); const absolute = units < 0n ? -units : units;
  if (units < 0n) return { tone: 'danger', text: `Задолженность: ${lessonValue(String(value).replace('-', ''))} ${lessonNoun(absolute)}` };
  if (units === 0n) return { tone: 'danger', text: 'Оплаченные занятия закончились' };
  const count = lessonValue(value); const noun = lessonNoun(units);
  const adjective = noun === 'занятие' ? 'оплаченное' : 'оплаченных';
  return { tone: units >= 200000000n ? 'success' : 'warning', text: `Осталось ${count} ${adjective} ${noun}` };
}
function parseIsoDate(value) {
  const [year, month, day] = String(value ?? '').split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day || 1, 12));
  return Number.isNaN(date.getTime()) ? new Date() : date;
}
function scheduleRange(cursor) {
  const date = parseIsoDate(cursor);
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 12));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 12));
  return { start, end, from: localIsoDate(start), to: localIsoDate(end),
    title: new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(date) };
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
    <aside class="parent-sidebar ${state.menuOpen ? 'open' : ''}"><div class="parent-brand"><b>iCube</b><span>Кабинет родителя</span></div><nav>${tabs.map(([id, label]) => `<button data-action="tab" data-tab="${id}" class="${state.tab === id ? 'active' : ''}">${escapeHtml(label)}</button>`).join('')}</nav></aside>
    ${state.menuOpen ? '<button class="parent-menu-backdrop" data-action="menu-close" aria-label="Закрыть меню"></button>' : ''}
    <div class="parent-work"><header class="parent-header"><button class="parent-menu-button" data-action="menu" aria-label="Открыть меню">☰</button><div class="parent-mobile-brand"><b>iCube</b></div>${childSelector()}<button class="parent-bell" data-action="notifications" aria-label="Уведомления">🔔${unread ? `<i>${unread}</i>` : ''}</button></header>
    <main class="parent-main">${state.error ? `<div class="parent-error">${escapeHtml(state.error)} <button data-action="retry">Повторить</button></div>` : ''}${state.loading ? '<div class="parent-loading">Загрузка…</div>' : content}</main></div>
    ${viewerHtml()}${paymentModalHtml()}${lessonInfoHtml()}
  </div>`;
}

export function parentHomeHtml(data) {
  const child = data.child;
  const next = data.nextLesson;
  const absenceAction = parentAbsenceAction(next);
  const nextAbsence = absenceAction ? `<div class="parent-next-actions">${next.absenceNotice ? '<span class="badge amber parent-next-absence-status">Ребёнка не будет</span>' : ''}<button class="${absenceAction.className}" data-action="${absenceAction.action}" data-lesson="${next.id}" data-origin="home">${absenceAction.label}</button></div>` : '';
  const enrollmentCards = data.enrollments.map((item) => {
    const balance = parentBalancePresentation(item.balanceLessons);
    const pay = decimalUnits(item.balanceLessons) <= 0n && item.subscriptionPrice != null
      ? `<button class="parent-primary parent-balance-pay" data-action="pay" data-amount="${escapeHtml(item.subscriptionPrice)}" data-direction="${escapeHtml(item.direction)}">Оплатить</button>` : '';
    return `<article class="parent-card parent-balance parent-balance-${balance.tone}"><span>${escapeHtml(item.direction)}</span><strong>${escapeHtml(balance.text)}</strong>${pay}</article>`;
  }).join('');
  return `<section class="parent-title"><h1>${escapeHtml(child.name)}</h1></section>
    <article class="parent-card"><h2>Ближайшее занятие</h2>${next ? `<button type="button" class="parent-next parent-next-open" data-action="home-next-lesson" data-lesson="${next.id}" data-starts="${escapeHtml(next.startsAt)}"><strong>${dateRu(next.startsAt)}</strong><b>${time(next.startsAt)}–${time(next.endsAt)}</b><span>${escapeHtml(next.site)}</span></button>${nextAbsence}` : empty('Нет будущих занятий.')}</article>
    <section class="parent-balances">${enrollmentCards || empty('Нет активных направлений.')}</section>
    <article class="parent-card"><h2>Фото с последнего занятия</h2>${data.latestPhoto ? `<button class="parent-photo-preview" data-action="tab" data-tab="photos"><img src="${escapeHtml(data.latestPhoto.fileUrl)}" alt="Фото с последнего занятия ${escapeHtml(child.name)}"></button>` : empty('Нет доступных фотографий.')}</article>`;
}

export function parentAbsenceAction(lesson) {
  if (!lesson?.canChangeAbsence) return null;
  return lesson.absenceNotice
    ? { action: 'absence-cancel', label: 'Отменить отметку', className: 'parent-secondary' }
    : { action: 'absence-set', label: 'Ребёнка не будет', className: 'parent-primary' };
}

function scheduleEventHtml(lesson) {
  const status = parentScheduleStatus(lesson);
  const statusClass = ['Отменено', 'Отсутствовал'].includes(status) ? 'red' : ['Перенесено', 'Ребёнка не будет'].includes(status) ? 'amber' : 'green';
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
  for (let day = 1; day <= range.end.getUTCDate(); day += 1) cells.push(new Date(Date.UTC(range.start.getUTCFullYear(), range.start.getUTCMonth(), day, 12)));
  while (cells.length % 7) cells.push(null);
  const today = localIsoDate();
  const desktop = `<div class="calendar-desktop"><div class="calendar calendar-weekdays">${['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day) => `<div>${day}</div>`).join('')}</div><div class="calendar calendar-grid">${cells.map((date) => {
    if (!date) return '<div class="day calendar-empty"></div>';
    const key = localIsoDate(date); const lessons = byDate.get(key) ?? [];
    return `<div class="day${key === today ? ' calendar-today' : ''}"><div class="date">${pad(date.getUTCDate())}.${pad(date.getUTCMonth() + 1)}${key === today ? '<span class="today-label">сегодня</span>' : ''}</div>${lessons.map(scheduleEventHtml).join('')}</div>`;
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
  return `<section class="parent-title"><h1>Оплаты</h1></section>${enrollments.length ? `<div class="parent-pay-actions">${enrollments.map((item) => `<article class="parent-card parent-subscription"><b>${escapeHtml(item.direction)}</b><span>Текущая стоимость абонемента: <strong>${money(item.subscriptionPrice)}</strong></span><button class="parent-primary" data-action="pay" data-amount="${escapeHtml(item.subscriptionPrice)}" data-direction="${escapeHtml(item.direction)}">Оплатить</button></article>`).join('')}</div>` : ''}${rows.length ? `<div class="parent-list">${rows.map((row) => `<article class="parent-card parent-row"><div><b>${row.type === 'refund' ? 'Возврат' : 'Оплата'}</b><span>${dateRu(row.date)}</span></div><strong class="${row.type === 'refund' ? 'negative' : ''}">${row.type === 'refund' ? '−' : '+'}${money(row.amount)}</strong></article>`).join('')}</div>` : empty('Оплат пока нет.')}`;
}

function aboutHtml(data) {
  const child = data.child ?? {}; const age = ageFromBirthDate(child.birthDate);
  const directions = (data.enrollments ?? []).map((item) => `<div class="parent-about-direction"><b>${escapeHtml(item.direction)}</b><span>Группа: ${escapeHtml(item.group ?? '—')}</span><span>Преподаватель: ${escapeHtml(item.teacher ?? '—')}</span><span>Площадка: ${escapeHtml(item.site ?? '—')}</span><span>Расписание: ${escapeHtml(item.schedule ?? '—')}</span></div>`).join('');
  return `<section class="parent-title"><h1>О ребёнке</h1></section><article class="parent-card parent-about"><div class="parent-info"><span>ФИО</span><b>${escapeHtml(child.name ?? '—')}</b><span>Возраст</span><b>${age == null ? '—' : `${age} лет`}</b></div><form data-action="child-about"><label>Дата рождения<input name="birthDate" type="date" value="${escapeHtml(child.birthDate ?? '')}"></label><label>Школа<input name="school" value="${escapeHtml(child.school ?? '')}"></label><label>Класс<input name="grade" value="${escapeHtml(child.grade ?? '')}"></label><button class="parent-primary" type="submit">Сохранить</button></form></article><article class="parent-card"><h2>Направления</h2>${directions || empty('Нет активных направлений.')}</article>`;
}

function groupPhotos(rows) {
  return rows.reduce((groups, photo) => { const key = String(photo.lessonAt).slice(0, 10); (groups[key] ??= []).push(photo); return groups; }, {});
}
function photosHtml(rows) {
  const groups = groupPhotos(rows);
  return `<section class="parent-title"><h1>Фото</h1><span>Фотографии хранятся 30 дней. Чтобы сохранить понравившееся фото, откройте его и нажмите «Скачать».</span></section>${rows.length ? Object.entries(groups).map(([date, photos]) => {
    const expiresAt = photos.map((photo) => photo.expiresAt).filter(Boolean).sort()[0] ?? null;
    return `<section class="parent-photo-day"><h2>${dateRu(date)}${expiresAt ? ` <small>(фото доступны до ${dateRu(expiresAt)})</small>` : ''}</h2><div>${photos.map((photo) => `<button data-action="photo" data-photo="${photo.id}"><img src="${escapeHtml(photo.fileUrl)}" alt="Фото от ${dateRu(date)}"></button>`).join('')}</div></section>`;
  }).join('') : empty('Нет доступных фотографий.')}`;
}

function settingsHtml(data) {
  const contact = state.profile.contact ?? {};
  return `<section class="parent-title"><h1>Настройки</h1></section>
    <article class="parent-card"><h2>Профиль</h2><form data-action="profile"><label>ФИО<input name="name" value="${escapeHtml(data.profile.name ?? '')}"></label><label>Телефон<input name="phone" value="${escapeHtml(data.profile.phone ?? '')}"></label><button class="parent-primary" type="submit">Сохранить</button></form></article>
    <article class="parent-card"><h2>Уведомления</h2>${data.settings.map((item) => `<label class="parent-toggle"><span>${escapeHtml(item.label)}</span><input type="checkbox" data-action="notification-setting" data-type="${item.type}"${item.enabled ? ' checked' : ''}></label>`).join('')}</article>
    <article class="parent-card"><h2>Мои дети</h2>${state.profile.children.map((child) => `<div class="parent-child-line">${escapeHtml(child.name)}</div>`).join('')}</article>
    <article class="parent-card"><h2>Документы</h2>${data.documents.map((document) => `<div class="parent-document"><b>${escapeHtml(document.title)}</b><span>Версия ${escapeHtml(document.version)} · принято ${dateRu(document.acceptedAt)}</span>${document.url ? `<a href="${escapeHtml(document.url)}" target="_blank" rel="noopener">Открыть</a>` : ''}</div>`).join('')}</article>
    <article class="parent-card"><h2>Связаться с нами</h2><div class="parent-actions">${contact.maxUrl ? `<a class="parent-contact-button primary" href="${escapeHtml(contact.maxUrl)}" target="_blank" rel="noopener">Написать в MAX</a>` : ''}${contact.phone ? `<a class="parent-contact-button" href="tel:${escapeHtml(String(contact.phone).replace(/[^\d+]/g, ''))}">Позвонить: ${escapeHtml(contact.phone)}</a>` : ''}</div></article>
    <button class="parent-logout" data-action="logout">Выйти</button>`;
}

function notificationsHtml(rows) {
  return `<section class="parent-title"><h1>Уведомления</h1></section>${rows.length ? `<div class="parent-list">${rows.map((item) => `<button class="parent-card parent-notification ${item.readAt ? '' : 'unread'}" data-action="notification" data-id="${item.id}" data-child="${item.childId ?? ''}" data-destination="${escapeHtml(item.destination ?? 'home')}"><b>${escapeHtml(item.title)}</b><span>${escapeHtml(item.body)}</span><small>${item.childName ? `${escapeHtml(item.childName)} · ` : ''}${dateRu(item.createdAt)} ${time(item.createdAt)}</small></button>`).join('')}</div>` : empty('Уведомлений пока нет.')}`;
}

function viewerHtml() {
  if (!state.viewer?.photos?.length) return '';
  const photo = state.viewer.photos[state.viewer.index];
  return `<div class="parent-viewer" data-action="viewer-close"><button data-action="viewer-close" aria-label="Закрыть"></button><button data-action="viewer-prev" aria-label="Предыдущее">←</button><img src="${escapeHtml(photo.fileUrl)}" alt="Фото"><button data-action="viewer-next" aria-label="Следующее">→</button><a class="parent-viewer-download" href="${escapeHtml(photo.fileUrl)}" download="icube-photo-${escapeHtml(photo.id)}.jpg" data-action="viewer-download">Скачать</a><span>${state.viewer.index + 1} / ${state.viewer.photos.length}</span></div>`;
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
  const absenceAction = parentAbsenceAction(lesson);
  return `<div class="parent-lesson-modal"><article class="parent-card"><button data-action="lesson-info-close" aria-label="Закрыть">×</button><h2>${dateRu(lesson.startsAt)} · ${time(lesson.startsAt)}–${time(lesson.endsAt)}</h2><div class="parent-info"><b>${escapeHtml(lesson.group)}</b><span>${escapeHtml(lesson.site)}</span><span>${escapeHtml(lesson.teacher)}</span><span>${escapeHtml(status)}</span></div>${absenceAction ? `<button class="${absenceAction.className}" data-action="${absenceAction.action}" data-lesson="${lesson.id}">${absenceAction.label}</button>` : ''}</article></div>`;
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
  if (state.tab === 'home') return shell(parentHomeHtml(state.data ?? { child: selectedChild() ?? {}, enrollments: [], nextLesson: null, latestPhoto: null }));
  if (state.tab === 'schedule') return shell(scheduleHtml(state.data ?? []));
  if (state.tab === 'attendance') return shell(attendanceHtml(state.data ?? []));
  if (state.tab === 'payments') return shell(paymentsHtml(state.data ?? { rows: [], home: null }));
  if (state.tab === 'about') return shell(aboutHtml(state.data ?? { child: selectedChild() ?? {}, enrollments: [] }));
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
  if (!['profile', 'child-about'].includes(event.target.dataset.action)) return;
  event.preventDefault(); const form = new FormData(event.target);
  const path = event.target.dataset.action === 'profile' ? '/parent/profile' : `/parent/children/${state.childId}/about`;
  try { await api.request(path, { method: 'PATCH', body: Object.fromEntries(form) }); await loadTab(); }
  catch (error) { window.alert(errorMessage(error)); }
});
app?.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-action]'); if (!target) return;
  const action = target.dataset.action;
  try {
  if (action === 'tab') { state.tab = target.dataset.tab; state.data = null; state.menuOpen = false; await loadTab(); }
  else if (action === 'retry') await loadTab();
  else if (action === 'notifications') { state.tab = 'notifications'; await loadTab(); }
  else if (action === 'notification') { await api.request(`/parent/notifications/${target.dataset.id}/read`, { method: 'POST' }); if (state.profile.children.some((child) => String(child.id) === target.dataset.child)) state.childId = target.dataset.child; state.tab = target.dataset.destination || 'home'; await loadTab(); }
  else if (action === 'photo') { const rows = state.data ?? []; state.viewer = { photos: rows, index: Math.max(0, rows.findIndex((item) => String(item.id) === target.dataset.photo)) }; render(); }
  else if (action === 'viewer-close' && (event.target === target || event.target.tagName === 'BUTTON')) { state.viewer = null; render(); }
  else if (action === 'viewer-prev') setViewer(-1);
  else if (action === 'viewer-next') setViewer(1);
  else if (action === 'viewer-download') event.stopPropagation();
  else if (action === 'accept') { await api.request(`/parent/documents/${target.dataset.id}/accept`, { method: 'POST' }); await start(); }
  else if (action === 'logout') window.icubeAuthLogout?.();
  else if (action === 'pay') {
    state.payment = { amount: target.dataset.amount, direction: target.dataset.direction }; render();
  }
  else if (action === 'pay-close') { state.payment = null; render(); }
  else if (action === 'schedule-prev' || action === 'schedule-next') {
    const cursor = parseIsoDate(state.scheduleCursor); cursor.setUTCMonth(cursor.getUTCMonth() + (action === 'schedule-prev' ? -1 : 1), 1);
    state.scheduleCursor = localIsoDate(cursor); state.data = null; await loadTab();
  }
  else if (action === 'schedule-today') { state.scheduleCursor = localIsoDate(); state.data = null; await loadTab(); }
  else if (action === 'home-next-lesson') {
    const lessonId = target.dataset.lesson;
    state.tab = 'schedule'; state.scheduleCursor = String(target.dataset.starts ?? '').slice(0, 10) || state.scheduleCursor;
    state.data = null; state.lessonInfo = null; state.menuOpen = false;
    await loadTab(); state.lessonInfo = (state.data ?? []).find((lesson) => String(lesson.id) === lessonId) ?? null; render();
  }
  else if (action === 'lesson-info') { state.lessonInfo = (state.data ?? []).find((lesson) => String(lesson.id) === target.dataset.lesson) ?? null; render(); }
  else if (action === 'lesson-info-close') { state.lessonInfo = null; render(); }
  else if (action === 'menu') { state.menuOpen = !state.menuOpen; render(); }
  else if (action === 'menu-close') { state.menuOpen = false; render(); }
  else if (action === 'absence-set' || action === 'absence-cancel') {
    event.stopPropagation();
    const lessonId = target.dataset.lesson; const method = action === 'absence-set' ? 'PUT' : 'DELETE'; const sourceTab = state.tab;
    await api.request(`/parent/children/${state.childId}/lessons/${lessonId}/absence-notice`, { method });
    await loadTab();
    if (sourceTab === 'schedule') { state.lessonInfo = (state.data ?? []).find((lesson) => String(lesson.id) === lessonId) ?? null; render(); }
  }
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) window.icubeAuthLogout?.();
    else window.alert(errorMessage(error));
  }
});
app?.addEventListener('touchstart', (event) => { if (state.viewer) state.touchX = event.changedTouches[0]?.clientX ?? null; }, { passive: true });
app?.addEventListener('touchend', (event) => { if (!state.viewer || state.touchX == null) return; const delta = (event.changedTouches[0]?.clientX ?? state.touchX) - state.touchX; if (Math.abs(delta) > 50) setViewer(delta < 0 ? 1 : -1); state.touchX = null; }, { passive: true });

if (globalThis.window) window.icubeParentPortal = { start, reload: loadTab };

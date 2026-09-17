import { ApiClient } from '../data/api-client.mjs';

const activeEnrollment = (enrollment) => enrollment?.status === 'Активный';
const projectMatches = (projectId, allowedProjectIds) => !allowedProjectIds || allowedProjectIds.has(String(projectId));

export function countActiveChildrenForProject(children, projectId) {
  if (projectId == null) return 0;
  return (children ?? []).filter((child) => (child.enrollments ?? []).some((enrollment) =>
    String(enrollment.projectId) === String(projectId) && activeEnrollment(enrollment))).length;
}

export function countActiveChildrenTotal(children, projectIds = null) {
  const allowed = projectIds == null ? null : new Set(projectIds.map(String));
  return (children ?? []).filter((child) => (child.enrollments ?? []).some((enrollment) =>
    activeEnrollment(enrollment) && projectMatches(enrollment.projectId, allowed))).length;
}

export function countActiveGroups(groups, projectId = null) {
  return (groups ?? []).filter((group) => group.active !== false
    && (projectId == null || String(group.projectId) === String(projectId))).length;
}

export function monthlyPaymentAmount(payments, now = new Date(), projectId = null) {
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return (payments ?? []).filter((payment) => String(payment.paidOn ?? '').slice(0, 7) === month
    && (projectId == null || String(payment.projectId) === String(projectId)))
    .reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0);
}

export function calculateDashboardMetrics({ children = [], groups = [], payments = [], projects = [] } = {}, {
  now = new Date(), projectIds = null,
} = {}) {
  const allowed = projectIds == null ? null : new Set(projectIds.map(String));
  const visibleProjects = projects.filter((project) => project.active !== false && projectMatches(project.id, allowed));
  const visibleGroups = groups.filter((group) => projectMatches(group.projectId, allowed));
  const visiblePayments = payments.filter((payment) => projectMatches(payment.projectId, allowed));
  return {
    activeChildren: countActiveChildrenTotal(children, projectIds),
    activeGroups: countActiveGroups(visibleGroups),
    monthlyPayments: monthlyPaymentAmount(visiblePayments, now),
    projects: visibleProjects.map((project) => ({
      id: project.id,
      name: project.name,
      activeChildren: countActiveChildrenForProject(children, project.id),
      activeGroups: countActiveGroups(visibleGroups, project.id),
      monthlyPayments: monthlyPaymentAmount(visiblePayments, now, project.id),
    })),
  };
}

export function attentionCounts(children, projectIds = null) {
  const allowed = projectIds == null ? null : new Set(projectIds.map(String));
  const relevant = (child) => (child.enrollments ?? []).filter((enrollment) => projectMatches(enrollment.projectId, allowed));
  return {
    low: (children ?? []).filter((child) => relevant(child).some((enrollment) => Number(enrollment.balance) === 1)).length,
    zero: (children ?? []).filter((child) => relevant(child).some((enrollment) => Number(enrollment.balance) === 0)).length,
    debt: (children ?? []).filter((child) => relevant(child).some((enrollment) => Number(enrollment.balance) < 0)).length,
  };
}

const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const money = (value) => `${new Intl.NumberFormat('ru-RU').format(Number(value ?? 0))} ₽`;
const ruDate = (date) => `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`;
const startTime = (lesson) => String(lesson?.time ?? '').split('–')[0] || '';
const endTime = (lesson) => String(lesson?.time ?? '').split('–')[1] || startTime(lesson);

function parseRuLessonDate(date, time = '00:00') {
  const [day, month, year] = String(date ?? '').split('.').map(Number);
  const [hour, minute] = String(time ?? '00:00').split(':').map(Number);
  if (![day, month, year, hour, minute].every(Number.isFinite)) return null;
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}
function longToday(now) {
  const result = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(now);
  return result.charAt(0).toUpperCase() + result.slice(1);
}
function monthName(now) {
  return new Intl.DateTimeFormat('ru-RU', { month: 'long' }).format(new Date(now.getFullYear(), now.getMonth(), 1));
}
function shortLessonDate(value) {
  const [day, month, year] = String(value ?? '').split('.').map(Number);
  if (![day, month, year].every(Number.isFinite)) return value;
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(new Date(year, month - 1, day));
}
function projectLabel(project) {
  return project?.name === 'iCubeRobots' ? 'iCube' : project?.name ?? 'Проект';
}
function projectBadgeClass(projectName) { return String(projectName).includes('Зебра') ? 'purple' : 'blue'; }
function statusBadgeClass(status) {
  if (status === 'Проведено') return 'green';
  if (status === 'Идёт') return 'amber';
  if (status === 'Отменено') return 'gray';
  return 'blue';
}

export function installDashboardUi({ windowObject = globalThis.window, api = new ApiClient() } = {}) {
  const legacy = windowObject?.icubeLegacy;
  if (!legacy) return;
  const state = legacy.state;

  function visibleProjects() {
    return (state.projects ?? []).filter((project) => project.active !== false);
  }
  function allowedProjectIds() {
    if (state.role !== 'partner') return null;
    return visibleProjects().map((project) => project.id);
  }
  function ownGroups() {
    const allowed = allowedProjectIds();
    if (!allowed) return state.groups ?? [];
    const ids = new Set(allowed.map(String));
    return (state.groups ?? []).filter((group) => ids.has(String(group.projectId)));
  }
  function ownLessons() {
    const groups = ownGroups();
    const groupIds = new Set(groups.map((group) => Number(group.id)));
    return (state.lessons ?? []).filter((lesson) => groupIds.has(Number(lesson.groupId)));
  }
  function groupFor(lesson) { return ownGroups().find((group) => Number(group.id) === Number(lesson.groupId)); }
  function projectFor(group) { return visibleProjects().find((project) => String(project.id) === String(group?.projectId)); }
  function teacherFor(lesson) { return (state.teachers ?? []).find((teacher) => Number(teacher.id) === Number(lesson.teacherId)); }
  function siteFor(lesson, group) {
    if (lesson?.siteName) return lesson.siteName;
    return (state.sites ?? []).find((site) => Number(site.id) === Number(lesson?.siteId ?? group?.siteId))?.name ?? 'Площадка не указана';
  }
  function unreadNotifications() { return (state.notifications ?? []).filter((notification) => !notification.readAt); }

  function notificationBlock() {
    const notifications = unreadNotifications();
    if (!notifications.length) return '';
    const rows = notifications.map((notification) => {
      const canOpenChild = notification.entityType === 'child'
        && (state.children ?? []).some((child) => child.id === Number(notification.entityId));
      return `<div class="dashboard-notification-row"><div class="dashboard-notification-copy"><b>${safe(notification.title)}</b><div class="muted mini">${safe(notification.body)}</div></div><div class="dashboard-notification-actions">${canOpenChild ? `<button class="btn soft" onclick="openChild(${Number(notification.entityId)})">Открыть</button>` : ''}<button class="btn" onclick="markDashboardNotificationRead(${Number(notification.id)})">Прочитано</button></div></div>`;
    }).join('');
    return `<div class="card pad dashboard-notifications"><div class="section-title"><div><h2>Важные уведомления</h2><div class="muted mini">Непрочитанные изменения</div></div><span class="badge amber">${notifications.length}</span></div>${rows}</div>`;
  }

  function kpiBreakdown(rows, valueKey, formatter = (value) => value) {
    if (state.role === 'partner') return rows[0] ? `<div class="dashboard-kpi-breakdown"><div class="dashboard-kpi-line"><span>${safe(projectLabel(rows[0]))}</span></div></div>` : '';
    return `<div class="dashboard-kpi-breakdown">${rows.map((row) => `<div class="dashboard-kpi-line"><span>${safe(projectLabel(row))}</span><b>${safe(formatter(row[valueKey]))}</b></div>`).join('')}</div>`;
  }

  function lessonRows(now) {
    return ownLessons().filter((lesson) => lesson.status !== 'Отменено').map((lesson) => {
      const start = parseRuLessonDate(lesson.date, startTime(lesson));
      const end = parseRuLessonDate(lesson.date, endTime(lesson));
      return { lesson, start, end };
    }).filter((item) => item.start && item.end && item.end >= now)
      .sort((left, right) => left.start - right.start);
  }

  function upcomingBlock(now) {
    const today = ruDate(now);
    const rows = lessonRows(now).slice(0, 5);
    const content = rows.length ? rows.map(({ lesson }) => {
      const group = groupFor(lesson); const project = projectFor(group); const teacher = teacherFor(lesson);
      const datePrefix = lesson.date === today ? '' : `${shortLessonDate(lesson.date)} · `;
      return `<div class="dashboard-upcoming-row clickable" onclick="openLesson(${lesson.id})"><div class="dashboard-upcoming-copy"><div class="dashboard-upcoming-title">${safe(datePrefix)}${safe(startTime(lesson))} · ${safe(group?.direction ?? '')}</div><div class="muted mini dashboard-upcoming-meta">${safe(group?.name ?? '')}</div><div class="muted mini dashboard-upcoming-meta">${safe(siteFor(lesson, group))}${teacher?.name ? ` · ${safe(teacher.name)}` : ''}</div></div><div class="dashboard-upcoming-side"><span class="badge ${projectBadgeClass(project?.name)}">${safe(projectLabel(project))}</span></div></div>`;
    }).join('') : '<div class="dashboard-empty">Ближайших занятий нет</div>';
    return `<div class="card pad dashboard-panel"><div class="section-title"><h2>Ближайшие занятия</h2><button class="btn" onclick="navTo('calendar')">Календарь</button></div><div class="dashboard-upcoming">${content}</div></div>`;
  }

  function todayBlock(now) {
    const today = ruDate(now);
    const lessons = ownLessons().filter((lesson) => lesson.date === today).sort((a, b) => startTime(a).localeCompare(startTime(b)));
    const cards = lessons.map((lesson) => {
      const group = groupFor(lesson); const project = projectFor(group); const teacher = teacherFor(lesson);
      return `<div class="dashboard-lesson-card"><div class="dashboard-lesson-top"><div class="dashboard-lesson-time">${safe(lesson.time)}</div><span class="badge ${statusBadgeClass(lesson.status)}">${safe(lesson.status)}</span></div><div class="dashboard-lesson-title">${safe(group?.name ?? 'Занятие')}</div><div class="dashboard-lesson-details"><div>${safe(group?.direction ?? '')}</div><div class="muted mini">${safe(siteFor(lesson, group))}</div><div class="muted mini">${safe(teacher?.name ?? 'Преподаватель не указан')}</div><div><span class="badge ${projectBadgeClass(project?.name)}">${safe(projectLabel(project))}</span></div></div><div class="dashboard-lesson-actions"><button class="btn soft" onclick="openLesson(${lesson.id})">Открыть занятие</button></div></div>`;
    }).join('');
    return `<div class="card pad dashboard-today"><div class="section-title"><h2>Сегодня · ${lessons.length} занятий</h2></div>${lessons.length ? `<div class="dashboard-today-grid">${cards}</div>` : '<div class="dashboard-empty">Сегодня занятий нет</div>'}</div>`;
  }

  function dashboard() {
    const now = new Date();
    const projects = visibleProjects();
    const allowed = allowedProjectIds();
    const metrics = calculateDashboardMetrics({ children: state.children, groups: state.groups, payments: state.payments, projects }, { now, projectIds: allowed });
    const attention = attentionCounts(state.children, allowed);
    const action = '<button class="btn soft dashboard-summary-btn" onclick="openDailyDashboardSummary()">Сводка за сегодня</button>';
    let html = '<div class="dashboard-page">';
    html += legacy.pageHead('Главная', longToday(now), action);
    html += notificationBlock();
    html += '<div class="dashboard-kpis">';
    html += `<div class="card metric dashboard-kpi"><div class="label">Активные дети</div><div class="value">${metrics.activeChildren}</div>${kpiBreakdown(metrics.projects, 'activeChildren')}</div>`;
    html += `<div class="card metric dashboard-kpi"><div class="label">Активные группы</div><div class="value">${metrics.activeGroups}</div>${kpiBreakdown(metrics.projects, 'activeGroups')}</div>`;
    html += `<div class="card metric dashboard-kpi"><div class="label">Оплаты за ${safe(monthName(now))}</div><div class="value">${safe(money(metrics.monthlyPayments))}</div>${kpiBreakdown(metrics.projects, 'monthlyPayments', money)}</div>`;
    html += '</div>';
    html += `<div class="dashboard-main-grid"><div class="card pad dashboard-panel"><div class="section-title"><div><h2>Требует внимания</h2><div class="muted mini">По текущим балансам</div></div></div><div class="attention dashboard-attention"><button class="warn dashboard-attention-row" onclick="navTo('balances')"><span>Осталось 1 занятие</span><b>${attention.low}</b></button><button class="zero dashboard-attention-row" onclick="navTo('balances')"><span>Осталось 0</span><b>${attention.zero}</b></button><button class="debt dashboard-attention-row" onclick="navTo('balances')"><span>Должники</span><b>${attention.debt}</b></button></div></div>${upcomingBlock(now)}</div>`;
    html += todayBlock(now);
    html += '</div>';
    return html;
  }

  windowObject.openDailyDashboardSummary = () => {
    const summary = state.dailySummary ?? { day: '', projects: [] };
    const cards = (summary.projects ?? []).map((project) => `<div class="card pad"><div class="section-title"><h2>${safe(project.projectName)}</h2></div><div class="info-line"><span>Проведено занятий</span><b>${Number(project.completedLessons ?? 0)}</b></div><div class="info-line"><span>Запланировано занятий</span><b>${Number(project.plannedLessons ?? 0)}</b></div><div class="info-line"><span>Присутствовало детей</span><b>${Number(project.presentChildren ?? 0)}</b></div><div class="info-line"><span>Оплаты</span><b>${money(project.paymentsAmount)}</b></div><div class="info-line"><span>Возвраты</span><b>${money(project.refundsAmount)}</b></div><div class="info-line"><span>Новые дети</span><b>${Number(project.newChildren ?? 0)}</b></div><div class="info-line"><span>Новые группы</span><b>${Number(project.newGroups ?? 0)}</b></div><div class="info-line"><span>Важные изменения</span><b>${Number(project.importantChanges ?? 0)}</b></div></div>`).join('');
    state.modal = `<h3>Сводка за сегодня</h3><div class="muted" style="margin-bottom:14px">${safe(summary.day)}</div><div class="dashboard-summary-grid">${cards}</div><div class="modal-actions"><button class="btn primary" onclick="closeModal()">Закрыть</button></div>`;
    legacy.render();
  };

  windowObject.markDashboardNotificationRead = async (id) => {
    try {
      await api.request(`/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' });
      const notification = (state.notifications ?? []).find((item) => String(item.id) === String(id));
      if (notification) notification.readAt = new Date().toISOString();
      legacy.render();
    } catch (error) {
      windowObject.alert(error?.message ?? 'Не удалось отметить уведомление прочитанным');
    }
  };

  windowObject.serverDashboard = dashboard;
  windowObject.dashboard = dashboard;
}

if (typeof window !== 'undefined' && window.icubeLegacy) installDashboardUi();

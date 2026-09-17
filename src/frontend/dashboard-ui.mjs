import { ApiClient } from '../data/api-client.mjs';

export function countActiveChildrenForProject(children, projectId) {
  if (projectId == null) return 0;
  return (children ?? []).filter((child) => (child.enrollments ?? []).some((enrollment) =>
    String(enrollment.projectId) === String(projectId) && enrollment.status === 'Активный')).length;
}

const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const money = (value) => `${new Intl.NumberFormat('ru-RU').format(Number(value ?? 0))} ₽`;

export function installDashboardUi({ windowObject = globalThis.window, api = new ApiClient() } = {}) {
  const legacy = windowObject?.icubeLegacy;
  if (!legacy) return;
  const state = legacy.state;

  function visibleProjects() {
    if (state.role === 'partner') return (state.projects ?? []).slice(0, 1);
    return state.projects ?? [];
  }

  function unreadNotifications() {
    return (state.notifications ?? []).filter((notification) => !notification.readAt);
  }

  function notificationBlock() {
    const notifications = unreadNotifications();
    if (!notifications.length) return '';
    const rows = notifications.map((notification) => {
      const canOpenChild = notification.entityType === 'child'
        && (state.children ?? []).some((child) => child.id === Number(notification.entityId));
      return `<div class="kpi-line"><div><b>${safe(notification.title)}</b><div class="muted mini">${safe(notification.body)}</div></div><div style="display:flex;gap:8px;align-items:center">${canOpenChild ? `<button class="btn soft" onclick="openChild(${Number(notification.entityId)})">Открыть</button>` : ''}<button class="btn" onclick="markDashboardNotificationRead(${Number(notification.id)})">Прочитано</button></div></div>`;
    }).join('');
    return `<div class="card pad" style="margin-bottom:16px;border-color:#fedf89;background:#fffdf5"><div class="section-title"><div><h2>Важные уведомления</h2><div class="muted mini">Непрочитанные изменения</div></div><span class="badge amber">${notifications.length}</span></div>${rows}</div>`;
  }

  function dashboard() {
    const projects = visibleProjects();
    const debt = (state.children ?? []).filter((child) => (child.enrollments ?? []).some((enrollment) => Number(enrollment.balance) < 0)).length;
    const action = '<button class="btn soft" onclick="openDailyDashboardSummary()">Сводка за сегодня</button>';
    let html = legacy.pageHead('Главная', 'Обзор клуба', action);
    html += notificationBlock();
    html += '<div class="grid cols-2">';
    for (const project of projects) {
      html += `<div class="card metric"><div class="label">Активные дети</div><div class="value">${countActiveChildrenForProject(state.children, project.id)}</div><div class="sub">${safe(project.name)}</div></div>`;
    }
    html += `<div class="card metric"><div class="label">Долги</div><div class="value">${debt}</div></div></div>`;
    return html;
  }

  windowObject.openDailyDashboardSummary = () => {
    const summary = state.dailySummary ?? { day: '', projects: [] };
    const cards = (summary.projects ?? []).map((project) => `<div class="card pad"><div class="section-title"><h2>${safe(project.projectName)}</h2></div><div class="info-line"><span>Проведено занятий</span><b>${Number(project.completedLessons ?? 0)}</b></div><div class="info-line"><span>Запланировано занятий</span><b>${Number(project.plannedLessons ?? 0)}</b></div><div class="info-line"><span>Присутствовало детей</span><b>${Number(project.presentChildren ?? 0)}</b></div><div class="info-line"><span>Оплаты</span><b>${money(project.paymentsAmount)}</b></div><div class="info-line"><span>Возвраты</span><b>${money(project.refundsAmount)}</b></div><div class="info-line"><span>Новые дети</span><b>${Number(project.newChildren ?? 0)}</b></div><div class="info-line"><span>Новые группы</span><b>${Number(project.newGroups ?? 0)}</b></div><div class="info-line"><span>Важные изменения</span><b>${Number(project.importantChanges ?? 0)}</b></div></div>`).join('');
    state.modal = `<h3>Сводка за сегодня</h3><div class="muted" style="margin-bottom:14px">${safe(summary.day)}</div><div class="grid cols-2">${cards}</div><div class="modal-actions"><button class="btn primary" onclick="closeModal()">Закрыть</button></div>`;
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

const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);

export function parentRoleFromProfile(profile) {
  const roles = profile?.roles ?? [];
  if (roles.includes('director')) return 'director';
  if (roles.includes('partner')) return 'partner';
  return null;
}

export function returnToParentDashboard(state, profile) {
  const parentRole = parentRoleFromProfile(profile);
  if (!parentRole) return false;
  state.role = parentRole;
  state.page = 'dashboard';
  state.modal = null;
  return true;
}

export function installTemporaryTeacherView({ windowObject = globalThis.window } = {}) {
  const legacy = windowObject?.icubeLegacy;
  if (!legacy) return;
  const state = legacy.state;

  const originalOpenLesson = windowObject.openLesson;
  if (typeof originalOpenLesson === 'function') {
    windowObject.openLesson = function (lessonId, teacherMode) {
      if (teacherMode && parentRoleFromProfile(state.authUser)) {
        const lesson = (state.lessons ?? []).find((item) => Number(item.id) === Number(lessonId));
        if (lesson?.teacherId) state.prototypeTeacherId = Number(lesson.teacherId);
      }
      return originalOpenLesson.apply(this, arguments);
    };
  }

  function teacherName() {
    if (!parentRoleFromProfile(state.authUser)) return state.authUser?.displayName ?? 'Преподаватель';
    const lesson = (state.lessons ?? []).find((item) => Number(item.id) === Number(state.selectedLesson));
    return (state.teachers ?? []).find((item) => Number(item.id) === Number(lesson?.teacherId))?.name ?? 'Интерфейс преподавателя';
  }

  windowObject.icubeReturnToDashboard = () => {
    if (!returnToParentDashboard(state, state.authUser)) return;
    legacy.render();
  };

  windowObject.teacherShell = function (content) {
    const temporaryParent = parentRoleFromProfile(state.authUser);
    const temporaryView = state.role === 'teacher' && Boolean(temporaryParent);
    const actions = temporaryView
      ? '<div class="teacher-parent-actions"><button class="btn" onclick="icubeReturnToDashboard()">Вернуться на главную</button><button class="btn" onclick="icubeAuthLogout()">Выйти</button></div>'
      : '<button class="btn" onclick="icubeAuthLogout()">Выйти</button>';
    return `<div class="teacher-shell"><div class="teacher-top"><div class="teacher-top-inner"><div><div class="mini" style="color:#98a2b3">iCube CRM · преподаватель</div><b>${safe(teacherName())}</b></div><div>${actions}</div></div>
      <div style="max-width:680px;margin:14px auto 0;display:flex;gap:8px"><button class="btn ${state.page === 'teacherToday' ? 'soft' : ''}" onclick="state.page='teacherToday';render()">Сегодня</button><button class="btn ${state.page === 'teacherCalendar' ? 'soft' : ''}" onclick="state.page='teacherCalendar';render()">Календарь</button></div></div>
      <div class="teacher-content">${content}</div></div>`;
  };
}

if (typeof window !== 'undefined' && window.icubeLegacy) installTemporaryTeacherView();

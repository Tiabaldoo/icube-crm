
// iCube CRM v1.1.5 — clean sandbox data for manual testing.
(function(){
  // Keep dictionaries/settings/projects, but start operational CRM data empty.
  state.children = [];
  state.groups = [];
  state.lessons = [];
  state.payments = [];
  state.refunds = [];
  state.sites = [];

  // Teachers are also empty: create your own records for testing.
  state.teachers = [];

  state.selectedChild = null;
  state.selectedGroup = null;
  state.selectedLesson = null;
  state.salaryTeacher = '';
  state.prototypeTeacherId = null;

  // Remove remaining static demo copy/counters from the dashboard.
  const cleanBaseDashboard = window.dashboard;
  window.dashboard = function(){
    let html = cleanBaseDashboard();
    html = html
      .replace('Среда, 9 сентября · обзор клуба','Обзор клуба')
      .replace('+2 за последние 30 дней','')
      .replace('1 был на пробном','')
      .replace('2 направления','')
      .replace('тестовые данные','')
      .replace('<span class="muted">2 занятия</span>','<span class="muted">0 занятий</span>');
    return html;
  };

  // Stats/partner are not yet real-data modules: don't show fake business numbers.
  window.stats = function(){
    return pageHead('Статистика','Раздел будет заполнен после появления реальных данных.')+
      '<div class="card pad"><div class="empty">Пока данных для статистики нет.</div></div>';
  };
  window.partner = function(){
    return pageHead('Партнёр','Расчёт появится после подключения реальных данных проекта.')+
      '<div class="card pad"><div class="empty">Пока данных для партнёрского расчёта нет.</div></div>';
  };

  render();
})();

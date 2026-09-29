const FIELDS = ['page', 'selectedChild', 'selectedGroup', 'selectedLesson', 'childTab', 'calendarCursor', 'calendarMode', 'role'];
const screen = (state) => Object.fromEntries(FIELDS.map((key) => [key, state[key] ?? null]));
const key = (value) => `${value.page}:${value.page === 'child' ? value.selectedChild : value.page === 'group' ? value.selectedGroup : ['lesson', 'teacherLesson'].includes(value.page) ? value.selectedLesson : ''}:${value.role}`;

export function installScreenHistory(legacy, host = globalThis.window) {
  const history = host.history;
  if (!history?.pushState || !history?.replaceState) return null;
  let current = null; let depth = 0; let owner = null; let restoring = false; let rendering = false;
  const home = () => legacy.state.authUser?.roles?.some((role) => ['director', 'partner'].includes(role)) ? 'dashboard' : 'teacherToday';
  const valid = (value) => {
    if (!value?.page) return false;
    const roles = legacy.state.authUser?.roles ?? [];
    if (!roles.includes(value.role) && !(value.role === 'teacher' && roles.some((role) => ['director', 'partner'].includes(role)))) return false;
    if (value.page === 'child') return legacy.state.children?.some((item) => Number(item.id) === Number(value.selectedChild));
    if (value.page === 'group') return legacy.state.groups?.some((item) => Number(item.id) === Number(value.selectedGroup));
    if (['lesson', 'teacherLesson'].includes(value.page)) return legacy.state.lessons?.some((item) => Number(item.id) === Number(value.selectedLesson));
    return true;
  };
  const write = (push = false) => history[push ? 'pushState' : 'replaceState']({ ...history.state,
    icubeScreen: { userId: owner, depth, screen: current } }, '');
  function record() {
    const profile = legacy.state.authUser;
    if (!profile || legacy.state.role === 'parent') { current = null; owner = null; return; }
    const userId = String(profile.id);
    if (owner !== userId || !current) {
      owner = userId; depth = 0;
      const saved = history.state?.icubeScreen;
      if (saved?.userId === owner && valid(saved.screen)) {
        Object.assign(legacy.state, saved.screen); depth = saved.depth;
      }
      current = screen(legacy.state); write();
    }
  }
  function wrap(original) {
    return function (...args) {
      if (rendering) return original.apply(this, args);
      rendering = true;
      try {
        record();
        const output = original.apply(this, args);
        if (current) {
          const next = screen(legacy.state);
          if (!restoring && key(next) !== key(current)) { depth += 1; current = next; write(true); }
          else { current = next; write(); }
        }
        return output;
      } finally { rendering = false; }
    };
  }
  if (typeof host.render === 'function') host.render = wrap(host.render);
  legacy.render = wrap(legacy.render);
  host.addEventListener('popstate', (event) => {
    if (!owner) return;
    const saved = event.state?.icubeScreen;
    restoring = true;
    try {
      if (saved?.userId === owner && valid(saved.screen)) {
        depth = saved.depth; current = saved.screen; Object.assign(legacy.state, current);
      } else {
        depth = 0; legacy.state.page = home(); current = screen(legacy.state);
      }
      legacy.state.modal = null; legacy.render();
    } finally { restoring = false; }
  });
  host.icubeGoBack = () => {
    if (current && depth > 0) history.back();
    else {
      restoring = true;
      try { legacy.state.page = home(); legacy.state.modal = null; depth = 0; current = screen(legacy.state); legacy.render(); }
      finally { restoring = false; }
    }
  };
  return { back: host.icubeGoBack };
}

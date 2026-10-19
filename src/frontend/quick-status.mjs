const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const statusNames = { active: 'Активный', lead: 'Лид', paused: 'Пауза', finished: 'Закончил', archived: 'Закончил' };
export function directionStatus(child, enrollment) {
  const status = statusNames[enrollment.status] ?? enrollment.status ?? 'Активный';
  return status;
}
export function currentEnrollments(child) {
  const seen = new Set();
  return (child.enrollments ?? []).filter((e) => {
    if (e.supersededAt != null || e.current === false) return false;
    if (e.id == null) return true;
    if (seen.has(String(e.id))) return false;
    seen.add(String(e.id)); return true;
  });
}
export function unfinishedEnrollments(child) {
  return currentEnrollments(child).filter((e) => directionStatus(child, e) !== 'Закончил');
}
export function childListStatus(child) {
  return statusNames[child.status] ?? child.status;
}
export function childListDirections(child, {project = 'all', direction = 'all'} = {}) {
  const matches = e => (project === 'all' || String(e.projectId) === String(project))
    && (direction === 'all' || e.direction === direction);
  const current = currentEnrollments(child);
  const open = current.filter(e => directionStatus(child, e) !== 'Закончил');
  // Current rows take precedence; archived rows only fill missing directions.
  const history = [...(child.enrollments ?? []), ...(child.enrollmentHistory ?? [])]
    .sort((a,b) => String(b.startedOn ?? '').localeCompare(String(a.startedOn ?? '')) || Number(b.id ?? 0)-Number(a.id ?? 0));
  const seen = new Set();
  const enrollments = (open.length ? open : [...current, ...history]).filter(matches).filter(e => {
    const key = String(e.direction || e.directionId);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
  const showStatuses = open.length > 0 && enrollments.length === 2
    && new Set(enrollments.map(e => directionStatus(child,e))).size === 2;
  return {enrollments, showStatuses};
}
export function groupEnrollments(child, groupId) {
  return currentEnrollments(child).filter((e) => ['Активный', 'Лид'].includes(directionStatus(child, e))
    && Number(Object.hasOwn(e, 'effectiveGroupId') ? e.effectiveGroupId : e.groupId) === Number(groupId));
}
export function visibleBalanceRows(children, project = 'all', projects = []) {
  return (children ?? []).flatMap((c) => currentEnrollments(c).flatMap((e) => {
    const projectName = e.project ?? projects.find((p) => String(p.id) === String(e.projectId))?.name;
    if (project !== 'all' && String(e.projectId) !== String(project) && projectName !== project) return [];
    if (e.balance == null || e.balance === '' || !Number.isFinite(Number(e.balance))) return [];
    const status = directionStatus(c, e); const balance = Number(e.balance);
    const visited = e.hasAttendance === true;
    const hidden = ['Пауза', 'Закончил'].includes(status);
    if (hidden ? balance >= 0 : !['Активный', 'Лид'].includes(status) || status === 'Лид' && !visited || balance === 0 && !visited) return [];
    return [{ c, e, status, hidden }];
  }));
}
export function groupBalanceBadges(child, groupId) {
  return groupEnrollments(child, groupId).map((item) => {
    const raw = String(item.balanceText ?? item.balance ?? '');
    const display = /^-?\d+(\.\d+)?$/.test(raw) ? raw.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '') : '—';
    const balance = Number(raw);
    const tone = raw === '' ? 'gray' : balance >= 2 ? 'green' : balance > 0 ? 'amber' : 'red';
    return `<span class="badge ${tone} group-balance-badge" title="${esc(item.direction)}">${esc(display)}</span>`;
  }).join('');
}
export function installQuickStatusUi(legacy, host = globalThis.window, document = globalThis.document) {
  host.icubeEnrollmentViews = { currentEnrollments, unfinishedEnrollments, childListStatus, childListDirections, directionStatus, groupEnrollments, visibleBalanceRows };
  const allowed = () => ['director', 'partner'].includes(legacy.state.role);
  let popover = null; let pending = null; let saving = false;
  const byId = (items, id) => items?.find((item) => Number(item.id) === Number(id));
  let statusSelection = null;
  function statusSelectionHtml(selection) {
    const active = selection.status === 'Активный';
    const label = active ? 'Сделать активными' : 'Перевести в лиды';
    return `<h3>${active ? 'Какие направления сделать активными?' : 'Какие направления перевести в лиды?'}</h3><div class="muted mini">Выберите направления. Остальные сохранят свои статусы. Изменять можно направления своего проекта.</div><div class="info-list" style="margin-top:12px">${selection.enrollments.map(e => `<label class="info-line"><span><input type="checkbox" class="child-status-selection" value="${Number(e.id)}" ${e.editable === false ? 'disabled' : ''} ${selection.ids.includes(Number(e.id)) ? 'checked' : ''} onchange="icubeChildStatusSelectionChanged()"> ${esc(e.direction)}</span><span class="badge ${legacy.statusBadge(directionStatus(selection.child,e))}">${esc(directionStatus(selection.child,e))}</span></label>`).join('')}</div><div class="modal-actions"><button class="btn" onclick="icubeCancelChildStatusSelection()">Отмена</button><button class="btn primary" id="child-status-confirm" ${selection.saving || !selection.ids.length ? 'disabled' : ''} onclick="icubeConfirmChildStatusSelection()">${label}</button></div>`;
  }
  host.icubeChildStatusSelection = (childId, status, confirm) => {
    if (!allowed()) return;
    const child = byId(legacy.state.children, childId); if (!child) return;
    const fields = [...(document.querySelectorAll?.('.modal input,.modal select,.modal textarea') ?? [])]
      .filter(el => el.id).map(el => ({ id: el.id, value: el.value, checked: el.checked }));
    statusSelection = { confirm, modal: legacy.state.modal, fields, saving: false, child, status, enrollments:currentEnrollments(child), ids:[] };
    legacy.state.modal = statusSelectionHtml(statusSelection);
    legacy.render();
  };
  host.icubeChildStatusSelectionChanged = () => {
    if (!statusSelection) return;
    statusSelection.ids = [...document.querySelectorAll('.child-status-selection:checked:not(:disabled)')].map(el => Number(el.value));
    legacy.state.modal = statusSelectionHtml(statusSelection);
    const button = document.querySelector('#child-status-confirm');
    if (button) button.disabled = statusSelection.saving || !statusSelection.ids.length;
  };
  host.icubeCancelChildStatusSelection = () => {
    if (!statusSelection || statusSelection.saving) return;
    const previous = statusSelection; statusSelection = null;
    legacy.state.modal = previous.modal; legacy.render();
    for (const field of previous.fields) {
      const el = document.getElementById(field.id);
      if (el) { el.value = field.value; el.checked = field.checked; }
    }
  };
  host.icubeConfirmChildStatusSelection = async () => {
    const selection = statusSelection; if (!selection || selection.saving || !allowed()) return;
    const ids = [...document.querySelectorAll('.child-status-selection:checked:not(:disabled)')].map(el => Number(el.value));
    if (!ids.length) return;
    selection.ids = ids;
    selection.saving = true;
    legacy.state.modal = statusSelectionHtml(selection);
    const button = document.querySelector('#child-status-confirm'); if (button) button.disabled = true;
    try { if (await selection.confirm(ids)) statusSelection = null; }
    finally { selection.saving = false; host.icubeChildStatusSelectionChanged(); }
  };
  function close() { popover?.remove(); popover = null; pending = null; }
  function open(type, id, anchor) {
    close();
    if (!allowed() || !anchor) return;
    const item = byId(type === 'child' ? legacy.state.children : legacy.state.groups, id);
    if (!item) return;
    pending = { type, id, initial: type === 'child' ? item.status : String(item.active !== false) };
    popover = document.createElement('div'); popover.className = 'quick-status-popover';
    popover.setAttribute('role', 'group'); popover.setAttribute('aria-label', 'Выберите статус');
    const options = type === 'child' ? ['Лид', 'Активный', 'Пауза', 'Закончил'] : ['true', 'false'];
    popover.innerHTML = options.map((value) => {
      const label = type === 'child' ? value : value === 'true' ? 'Активна' : 'Неактивна';
      const tone = type === 'child' ? legacy.statusBadge(value) : value === 'true' ? 'green' : 'gray';
      return `<button type="button" class="badge ${tone}" data-quick-status="${esc(value)}" aria-pressed="${value === pending.initial}">${esc(label)}</button>`;
    }).join('');
    popover.addEventListener('click', (event) => {
      const button = event.target.closest('[data-quick-status]');
      if (button) select(button.dataset.quickStatus).catch((error) => host.alert?.(error.message));
    });
    document.body.append(popover);
    const rect = anchor.getBoundingClientRect(); const box = popover.getBoundingClientRect();
    const width = host.innerWidth || document.documentElement.clientWidth;
    const height = host.innerHeight || document.documentElement.clientHeight;
    popover.style.left = `${Math.max(8, Math.min(rect.left, width - box.width - 8))}px`;
    popover.style.top = `${Math.max(8, Math.min(rect.bottom + 6, height - box.height - 8))}px`;
    popover.querySelector('button')?.focus();
  }
  async function select(value) {
    if (!pending || !allowed() || saving) return;
    const { type, id, initial } = pending;
    if (value === initial && type !== 'child') { close(); return; }
    if (type === 'group' && value === 'false') {
      close(); host.groupForm(id);
      const active = document.querySelector('#gf-active');
      if (active) { active.value = 'false'; active.onchange?.call(active); }
      const endField = document.querySelector('#gf-end-date-wrap');
      endField?.closest('.modal')?.classList.add('quick-group-deactivation');
      endField?.classList.add('quick-deactivation-date');
      document.querySelector('#gf-end-date')?.focus({ preventScroll: true });
      endField?.scrollIntoView({ block: 'nearest' });
      return;
    }
    const root = popover; saving = true;
    root.querySelectorAll('button').forEach((button) => { button.disabled = true; });
    try {
      const saved = type === 'child' ? await host.icubeApi.saveChild(id, { status: value }) : await host.icubeApi.saveGroup(id, { active: true });
      if (saved && popover === root) close();
    } finally {
      saving = false;
      if (popover === root) root.querySelectorAll('button').forEach((button) => { button.disabled = false; });
    }
  }
  document.addEventListener?.('click', (event) => {
    if (popover && !popover.contains(event.target) && !event.target.closest('.quick-status-badge')) close();
  });
  document.addEventListener?.('keydown', (event) => { if (event.key === 'Escape') close(); });
  host.addEventListener?.('resize', close);
  host.icubeQuickChildStatus = (id, anchor) => open('child', id, anchor);
  host.icubeQuickGroupStatus = (id, anchor) => open('group', id, anchor);
  host.icubeGroupBalanceBadges = groupBalanceBadges;
  for (const [name, items, action] of [['child', 'children', 'icubeQuickChildStatus'], ['group', 'groups', 'icubeQuickGroupStatus']]) {
    const original = host[name];
    if (typeof original !== 'function') continue;
    host[name] = function (...args) {
      const output = original.apply(this, args);
      const item = byId(legacy.state[items], legacy.state[name === 'child' ? 'selectedChild' : 'selectedGroup']);
      if (!item || !allowed()) return output;
      const label = name === 'child' ? item.status : item.active === false ? 'Неактивна' : 'Активна';
      let replaced = false;
      return output.replace(/<span class="badge ([^"]+)">([^<]+)<\/span>/g, (match, classes, text) => {
        if (text !== esc(label) || classes.includes('group-balance')) return match;
        // The child/global status is the first matching badge, not enrollment status controls.
        if (replaced) return match;
        replaced = true;
        return `<button type="button" class="badge ${classes} quick-status-badge" onclick="${action}(${Number(item.id)},this)" aria-label="Изменить статус">${text}</button>`;
      });
    };
  }
}

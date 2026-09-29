const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function groupBalanceBadges(child, groupId) {
  return (child.enrollments ?? []).filter((item) => Number(item.groupId) === Number(groupId)).map((item) => {
    const raw = String(item.balanceText ?? item.balance ?? '');
    const display = /^-?\d+(\.\d+)?$/.test(raw) ? raw.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '') : '—';
    const balance = Number(raw);
    const tone = raw === '' ? 'gray' : balance >= 2 ? 'green' : balance > 0 ? 'amber' : 'red';
    return `<span class="badge ${tone} group-balance-badge" title="${esc(item.direction)}">${esc(display)}</span>`;
  }).join('');
}
export function installQuickStatusUi(legacy, host = globalThis.window, document = globalThis.document) {
  const allowed = () => ['director', 'partner'].includes(legacy.state.role);
  let popover = null; let pending = null; let saving = false;
  const byId = (items, id) => items?.find((item) => Number(item.id) === Number(id));
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
    if (value === initial) { close(); return; }
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

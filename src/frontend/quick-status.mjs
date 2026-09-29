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
  let pending = null;
  const byId = (items, id) => items?.find((item) => Number(item.id) === Number(id));
  function open(type, id) {
    if (!allowed()) return;
    const item = byId(type === 'child' ? legacy.state.children : legacy.state.groups, id);
    if (!item) return;
    pending = { type, id, initial: type === 'child' ? item.status : item.active !== false };
    // Keep the original fields and save handlers: only condense their presentation.
    host[type === 'child' ? 'childForm' : 'groupForm'](id);
    const selector = type === 'child' ? '#cf-status' : '#gf-active';
    const select = document.querySelector(selector);
    if (!select) return;
    document.querySelector('.modal')?.classList.add('quick-status-modal');
    const visible = select.closest('.field');
    for (const field of document.querySelectorAll('.modal .form-grid > *')) {
      if (field !== visible && field.id !== (type === 'group' ? 'gf-end-date-wrap' : '')) field.hidden = true;
    }
    const title = document.querySelector('.modal h3');
    if (title) title.textContent = type === 'child' ? 'Статус ребёнка' : 'Статус группы';
    const save = document.querySelector('.modal .modal-actions .btn.primary');
    if (save) save.setAttribute('onclick', 'icubeSaveQuickStatus()');
    select.focus?.();
  }
  host.icubeQuickChildStatus = (id) => open('child', id);
  host.icubeQuickGroupStatus = (id) => open('group', id);
  host.icubeSaveQuickStatus = async () => {
    if (!pending || !allowed()) return;
    const { type, id, initial } = pending;
    const selected = document.querySelector(type === 'child' ? '#cf-status' : '#gf-active')?.value;
    if ((type === 'child' ? selected : selected === 'true') === initial) { host.closeModal(); return; }
    await host.icubeApi[type === 'child' ? 'saveChild' : 'saveGroup'](id);
  };
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
        return `<button type="button" class="badge ${classes} quick-status-badge" onclick="${action}(${Number(item.id)})" aria-label="Изменить статус">${text}</button>`;
      });
    };
  }
}

const html = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const days = ['Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье'];
const shortDays = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

export function groupScheduleLabel(group) {
  return [{ weekday: group.weekday ?? days.indexOf(group.day) + 1, startTime: group.startTime || '—' }, ...(group.scheduleSlots ?? [])]
    .sort((a, b) => Number(a.weekday) - Number(b.weekday) || String(a.startTime).localeCompare(String(b.startTime)))
    .map((slot) => `${shortDays[Number(slot.weekday) - 1] || group.day || '—'} ${slot.startTime}`).join(' · ');
}

export function advancedGroupFields(group = {}) {
  const count = group.packageLessonCount ?? 4;
  const expanded = group.isIndividual || count !== 4 || group.calculationMode === 'attendance_share' || group.scheduleSlots?.length;
  return `<details class="advanced-group-settings span-2"${expanded ? ' open' : ''}><summary>Расширенные настройки</summary><div class="form-grid">
    <div class="field span-2"><label>Дополнительные дни</label><div id="gf-extra-slots"></div><button type="button" class="btn soft" onclick="icubeAdvancedGroups.addSlot()">+ Добавить день</button></div>
    <div class="field span-2"><label><input id="gf-individual" type="checkbox"${group.isIndividual ? ' checked' : ''} onchange="icubeAdvancedGroups.refresh()"> Индивидуальная группа</label><div class="muted mini">Одно направление, максимум один текущий ребёнок.</div></div>
    <div class="field"><label>Занятий в пакете</label><input class="input" id="gf-package-count" type="number" min="1" max="1000" step="1" value="${count}" oninput="icubeAdvancedGroups.refresh(true)"></div>
    <div class="field"><label>Цена пакета, ₽</label><input class="input" id="gf-package-price" type="number" min="0.01" step="0.01" value="${group.price == null ? '' : (Number(group.price) * count).toFixed(2)}" placeholder="Пусто = цена направления" oninput="icubeAdvancedGroups.refresh(true)"><div class="muted mini" id="gf-unit-hint"></div></div>
    <div class="field span-2"><label>Расчёт</label><select class="select" id="gf-calculation-mode" onchange="icubeAdvancedGroups.refresh()"><option value="standard">Стандартный</option><option value="attendance_share"${group.calculationMode === 'attendance_share' ? ' selected' : ''}>Долевой от посещённого занятия</option></select></div>
    <div class="field" data-group-share><label>Доля преподавателя, %</label><input class="input" id="gf-teacher-share" type="number" min="0" max="100" step="0.0001" value="${html(group.teacherSharePercent ?? '0')}" oninput="icubeAdvancedGroups.refresh()"></div>
    <div class="field" data-group-share><label>Доля партнёра, %</label><input class="input" id="gf-partner-share" type="number" min="0" max="100" step="0.0001" value="${html(group.partnerSharePercent ?? '0')}" oninput="icubeAdvancedGroups.refresh()"></div>
    <div class="field span-2" data-group-share><label><input id="gf-custom-tax" type="checkbox"${group.customTaxEnabled ? ' checked' : ''}> Учитывать налог</label><div class="muted mini" id="gf-icube-share"></div></div>
  </div></details>`;
}

export function installAdvancedGroupUi(legacy, host = window, document = globalThis.document) {
  const field = (selector) => document.querySelector(selector);
  const value = (selector) => field(selector)?.value ?? '';
  let slots = []; let packageEdited = false;
  function slotHtml(slot, index) {
    return `<div class="advanced-schedule-slot"><select class="select" aria-label="День дополнительного занятия" onchange="icubeAdvancedGroups.setSlot(${index},'weekday',this.value)">${days.map((day, i) => `<option value="${i + 1}"${Number(slot.weekday) === i + 1 ? ' selected' : ''}>${day}</option>`).join('')}</select><input class="input" type="time" aria-label="Начало дополнительного занятия" value="${html(slot.startTime)}" onchange="icubeAdvancedGroups.setSlot(${index},'startTime',this.value)"><input class="input" type="time" aria-label="Окончание дополнительного занятия" value="${html(slot.endTime)}" onchange="icubeAdvancedGroups.setSlot(${index},'endTime',this.value)"><button type="button" class="btn" aria-label="Удалить дополнительный день" onclick="icubeAdvancedGroups.removeSlot(${index})">×</button></div>`;
  }
  function drawSlots() { const root = field('#gf-extra-slots'); if (root) root.innerHTML = slots.map(slotHtml).join(''); }
  function refresh(edited = false) {
    packageEdited ||= edited;
    const mixed = value('#gf-dir') === 'Смешанная';
    const individual = field('#gf-individual');
    if (individual) { individual.disabled = mixed; if (mixed) individual.checked = false; }
    const mode = field('#gf-calculation-mode');
    if (mode) { mode.disabled = !individual?.checked; if (mode.disabled) mode.value = 'standard'; }
    document.querySelectorAll('[data-group-share]').forEach((node) => { node.hidden = mode?.value !== 'attendance_share'; });
    const packageField = field('#gf-package-price');
    if (packageField) packageField.disabled = mixed;
    const hint = field('#gf-unit-hint');
    const price = Number(value('#gf-package-price')), count = Number(value('#gf-package-count'));
    if (hint) hint.textContent = price > 0 && count > 0 ? `${(price / count).toFixed(2)} ₽ / занятие` : 'Используется обычный приоритет цен CRM';
    if (edited && !mixed && field('#gf-price')) field('#gf-price').value = price > 0 && count > 0 ? (price / count).toFixed(2) : '';
    document.querySelectorAll('[data-mixed-price] label').forEach((label) => { label.textContent = label.textContent.replace(/₽ за \d+ занят(?:ия|ий)/, `₽ за ${count || 4} ${count === 4 ? 'занятия' : 'занятий'}`); });
    const shareHint = field('#gf-icube-share');
    if (shareHint) shareHint.textContent = `Доля iCube: ${(100 - Number(value('#gf-teacher-share')) - Number(value('#gf-partner-share'))).toFixed(4).replace(/\.?0+$/, '')}% (налог вычитается из этой доли)`;
  }
  function payload() {
    if (!field('#gf-package-count')) return {};
    return { isIndividual: Boolean(field('#gf-individual')?.checked), packageLessonCount: Number(value('#gf-package-count')),
      calculationMode: value('#gf-calculation-mode') || 'standard', teacherSharePercent: value('#gf-teacher-share') || '0',
      partnerSharePercent: value('#gf-partner-share') || '0', customTaxEnabled: Boolean(field('#gf-custom-tax')?.checked),
      scheduleSlots: slots.map((slot) => ({ ...slot })),
      ...(packageEdited && value('#gf-dir') !== 'Смешанная' ? { packagePrice: value('#gf-package-price') || null } : {}) };
  }
  host.icubeAdvancedGroups = { cardTitle(group) {
    const title = host.groupTitle(group);
    return group?.scheduleSlots?.length ? `${title.slice(0, title.lastIndexOf(' · '))} · ${groupScheduleLabel(group)}` : title;
  }, payload, draft: payload, refresh, addSlot() { slots.push({ weekday: 5, startTime: value('#gf-start') || '16:00', endTime: value('#gf-end') || '17:30' }); drawSlots(); },
    setSlot(index, key, next) { slots[index][key] = key === 'weekday' ? Number(next) : next; }, removeSlot(index) { slots.splice(index, 1); drawSlots(); } };
  const original = host.groupForm;
  host.groupForm = function (id, suppliedDraft) {
    const result = original.apply(this, arguments);
    if (!legacy.state.modal) return result;
    const group = { ...legacy.state.groups.find((item) => String(item.id) === String(id)), ...suppliedDraft };
    slots = (group.scheduleSlots ?? []).map((slot) => ({ ...slot })); packageEdited = false;
    legacy.state.modal = legacy.state.modal.replace('<div class="modal-actions">', `${advancedGroupFields(group)}<div class="modal-actions">`);
    field('.modal-actions')?.insertAdjacentHTML('beforebegin', advancedGroupFields(group));
    drawSlots(); refresh();
    field('#gf-price')?.addEventListener?.('input', () => { const price = field('#gf-package-price'); if (price) price.value = value('#gf-price') ? (Number(value('#gf-price')) * Number(value('#gf-package-count'))).toFixed(2) : ''; });
    field('#gf-dir')?.addEventListener?.('change', () => refresh());
    return result;
  };
  const groupPage = host.group;
  host.group = function (...args) {
    let output = groupPage.apply(this, args);
    const group = legacy.state.groups.find((item) => Number(item.id) === Number(legacy.state.selectedGroup));
    if (group?.isIndividual) output = output.replace('</h1>', '</h1><span class="badge purple">Индивидуальная</span>');
    if (group?.scheduleSlots?.length) output += `<div class="card pad"><b>Расписание группы</b><div class="info-list">${[{ weekday: days.indexOf(group.day) + 1, startTime: group.startTime, endTime: group.endTime }, ...group.scheduleSlots].map((slot) => `<div class="info-line"><span>${days[slot.weekday - 1]}</span><b>${html(slot.startTime)}–${html(slot.endTime)}</b></div>`).join('')}</div></div>`;
    return output;
  };
}

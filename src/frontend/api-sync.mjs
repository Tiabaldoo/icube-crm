import { ApiClient, ApiError } from '../data/api-client.mjs';

const legacy = window.icubeLegacy;
const api = new ApiClient();
const dayNames = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
const childStatusFromApi = { lead: 'Лид', active: 'Активный', paused: 'Пауза', finished: 'Закончил', archived: 'Закончил' };
const childStatusToApi = { 'Лид': 'lead', 'Активный': 'active', 'Пауза': 'paused', 'Закончил': 'finished' };
const enrollmentStatusFromApi = { active: 'Активный', paused: 'Пауза', finished: 'Закончил' };
const enrollmentStatusToApi = { 'Активный': 'active', 'Пауза': 'paused', 'Закончил': 'finished' };
let directories = { projects: [], directions: [] };

function element(selector) { return document.querySelector(selector); }
function value(selector) { return element(selector)?.value ?? ''; }
function checked(selector) { return Boolean(element(selector)?.checked); }
function byName(items, name) { return items.find((item) => item.name === name || item.code === name); }
function fail(error) {
  const message = error instanceof ApiError ? error.message : 'Не удалось сохранить данные на сервере';
  window.alert(message);
  console.error(error);
}

function mapGroup(group) {
  return { id: Number(group.id), name: group.name, direction: group.directionName, siteId: Number(group.siteId), teacherId: Number(group.teacherId),
    day: dayNames[group.weekday - 1], startTime: group.startTime, endTime: group.endTime, time: `${group.startTime}–${group.endTime}`,
    project: group.projectName, projectId: Number(group.projectId), price: group.price == null ? null : Number(group.price), active: group.active,
    startDate: group.startsOn, endDate: group.endsOn };
}
function mapChild(child) {
  return { id: Number(child.id), name: child.name, birth: child.birthDate ?? '', school: child.school ?? '', grade: child.grade ?? '',
    parent: child.guardian?.name ?? '', phone: child.guardian?.phone ?? '', status: childStatusFromApi[child.status] ?? child.status,
    note: child.note ?? '', needsDirectorReview: child.needsDirectorReview,
    enrollments: child.enrollments.map((enrollment) => ({ id: Number(enrollment.id), directionId: Number(enrollment.directionId),
      direction: enrollment.directionName, groupId: enrollment.groupId == null ? null : Number(enrollment.groupId), status: enrollmentStatusFromApi[enrollment.status] ?? enrollment.status,
      individualPrice: enrollment.individualPrice == null ? null : Number(enrollment.individualPrice), balance: Number(enrollment.balanceLessons) })) };
}

async function reload({ render = true } = {}) {
  const [projects, directions, sites, teachers, groups, children] = await Promise.all([
    api.list('projects'), api.list('directions'), api.list('sites'), api.list('teachers'), api.list('groups'), api.list('children'),
  ]);
  directories = { projects, directions };
  legacy.state.sites = sites.map((site) => ({ ...site, id: Number(site.id) }));
  legacy.state.teachers = teachers.map((teacher) => ({ ...teacher, id: Number(teacher.id), directions: teacher.directions.map((direction) => direction.name) }));
  legacy.state.groups = groups.map(mapGroup);
  legacy.state.children = children.map(mapChild);
  if (!legacy.state.children.some((child) => child.id === Number(legacy.state.selectedChild))) legacy.state.selectedChild = legacy.state.children[0]?.id ?? null;
  if (!legacy.state.groups.some((group) => group.id === Number(legacy.state.selectedGroup))) legacy.state.selectedGroup = legacy.state.groups[0]?.id ?? null;
  if (render) legacy.render();
}

async function saveSite(resourceId, returnToGroup) {
  try {
    const body = { name: value('#sf-name').trim(), shortName: value('#sf-short').trim(), type: value('#sf-type'), address: value('#sf-address').trim(), note: value('#sf-note').trim(), active: value('#sf-active') === 'true' };
    if (!body.name || !body.shortName) return window.alert('Укажите полное и короткое название площадки');
    const saved = resourceId ? await api.update('sites', resourceId, body) : await api.create('sites', body);
    await reload({ render: false });
    if (returnToGroup) { legacy.state.pendingGroupDraft = { ...(legacy.state.pendingGroupDraft ?? {}), siteId: saved.id }; window.groupForm(legacy.state.pendingGroupDraft.id, legacy.state.pendingGroupDraft); }
    else { legacy.state.modal = null; legacy.state.page = 'sites'; legacy.render(); }
  } catch (error) { fail(error); }
}

async function saveTeacher(resourceId, returnToGroup) {
  try {
    const names = []; if (checked('#tf-robot')) names.push('Робототехника'); if (checked('#tf-code')) names.push('Программирование');
    const body = { name: value('#tf-name').trim(), phone: value('#tf-phone').trim(), active: value('#tf-active') === 'true', directionIds: names.map((name) => byName(directories.directions, name)?.id).filter(Boolean) };
    if (!body.name) return window.alert('Укажите фамилию и имя преподавателя');
    if (body.directionIds.length !== names.length || !names.length) return window.alert('Выберите хотя бы одно доступное направление');
    const saved = resourceId ? await api.update('teachers', resourceId, body) : await api.create('teachers', body);
    await reload({ render: false });
    if (returnToGroup) { legacy.state.pendingGroupDraft = { ...(legacy.state.pendingGroupDraft ?? {}), teacherId: saved.id }; window.groupForm(legacy.state.pendingGroupDraft.id, legacy.state.pendingGroupDraft); }
    else { legacy.state.modal = null; legacy.state.page = 'teachers'; legacy.render(); }
  } catch (error) { fail(error); }
}

async function saveGroup(resourceId) {
  try {
    const direction = byName(directories.directions, value('#gf-dir'));
    const project = byName(directories.projects, value('#gf-project'));
    const startsOn = value('#gf-start-date'); const isActive = value('#gf-active') === 'true'; const endsOn = value('#gf-end-date') || null;
    if (!direction || !project) return window.alert('Не найден проект или направление в серверном справочнике');
    if (!startsOn) return window.alert('Укажите дату начала группы.');
    if (!isActive && !endsOn) return window.alert('Для неактивной группы укажите дату окончания.');
    const startTime = value('#gf-start'); const directionLabel = direction.name === 'Программирование' ? 'Программирование' : 'Роботы';
    const body = { name: `${directionLabel} · ${dayNames[dayNames.indexOf(value('#gf-day'))].slice(0, 2)} ${startTime}`,
      directionId: direction.id, siteId: Number(value('#gf-site')), projectId: project.id, teacherId: Number(value('#gf-teacher')),
      weekday: dayNames.indexOf(value('#gf-day')) + 1, startTime, endTime: value('#gf-end'), startsOn, endsOn: isActive ? null : endsOn,
      active: isActive, price: value('#gf-price') === '' ? null : Number(value('#gf-price')) };
    const saved = resourceId ? await api.update('groups', resourceId, body) : await api.create('groups', body);
    legacy.state.selectedGroup = saved.id; legacy.state.modal = null; legacy.state.page = 'group'; await reload();
  } catch (error) { fail(error); }
}

async function saveChild(resourceId) {
  try {
    const body = { name: value('#cf-name').trim() || 'Новый ребёнок', birthDate: value('#cf-birth') || null, school: value('#cf-school'), grade: value('#cf-grade'),
      status: childStatusToApi[value('#cf-status')] ?? 'lead', note: value('#cf-note'), guardian: { name: value('#cf-parent'), phone: value('#cf-phone') } };
    let saved;
    if (resourceId) {
      saved = await api.update('children', resourceId, body);
      const enrollment = saved.enrollments[0];
      if (enrollment) await api.updateEnrollment(enrollment.id, { groupId: value('#cf-group') ? Number(value('#cf-group')) : null });
    } else {
      saved = await api.create('children', body);
      const direction = byName(directories.directions, value('#cf-direction'));
      if (!direction) throw new ApiError('Направление отсутствует в серверном справочнике');
      await api.createEnrollment(saved.id, { directionId: direction.id, groupId: value('#cf-group') ? Number(value('#cf-group')) : null, status: 'active' });
    }
    legacy.state.selectedChild = saved.id; legacy.state.modal = null; legacy.state.page = 'child'; await reload();
  } catch (error) { fail(error); }
}

async function saveEnrollment(childId, oldDirection) {
  try {
    const child = legacy.state.children.find((item) => item.id === Number(childId));
    const enrollment = child?.enrollments.find((item) => item.direction === oldDirection);
    const direction = byName(directories.directions, value('#md-dir') || oldDirection);
    if (!enrollment || !direction) return;
    const individual = value('#md-price-mode') === 'individual'; const packagePrice = Number(value('#md-individual-package') || 0);
    if (individual && !(packagePrice > 0)) return window.alert('Укажите индивидуальную цену абонемента за 4 занятия.');
    await api.updateEnrollment(enrollment.id, { directionId: direction.id, groupId: value('#md-group') ? Number(value('#md-group')) : null,
      status: enrollmentStatusToApi[value('#md-enrollment-status')] ?? enrollmentStatusToApi[enrollment.status] ?? 'active', individualPrice: individual ? packagePrice / 4 : null });
    legacy.state.modal = null; legacy.state.childTab = 'overview'; legacy.state.page = 'child'; await reload();
  } catch (error) { fail(error); }
}

async function addEnrollment() {
  try {
    const childId = Number(value('#ad-child-id')); const direction = byName(directories.directions, value('#ad-dir'));
    const individual = value('#ad-price-mode') === 'individual'; const packagePrice = Number(value('#ad-individual-package') || 0);
    if (!direction) return;
    if (individual && !(packagePrice > 0)) return window.alert('Укажите индивидуальную цену абонемента за 4 занятия.');
    await api.createEnrollment(childId, { directionId: direction.id, groupId: value('#ad-group') ? Number(value('#ad-group')) : null,
      status: 'active', individualPrice: individual ? packagePrice / 4 : null });
    legacy.state.modal = null; legacy.state.childTab = 'overview'; legacy.state.page = 'child'; await reload();
  } catch (error) { fail(error); }
}

async function deleteChild(childId) {
  try { await api.delete('children', childId); legacy.state.selectedChild = null; legacy.state.modal = null; legacy.state.page = 'children'; await reload(); }
  catch (error) { fail(error); }
}

function deleteChildPrompt(childId) {
  const child = legacy.state.children.find((item) => item.id === Number(childId));
  if (!child) return;
  const safeName = String(child.name).replace(/[&<>"']/g, (symbol) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[symbol]);
  legacy.state.modal = `<h3>Удалить ребёнка?</h3><div class="notice">Сервер проверит оплаты, возвраты и посещения у <b>${safeName}</b>. При наличии истории удаление будет запрещено.</div><div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn danger" onclick="confirmDeleteChild(${Number(childId)})">Удалить ребёнка</button></div>`;
  legacy.render();
}

window.saveSite = saveSite;
window.saveTeacher = saveTeacher;
window.saveGroupV111 = saveGroup;
window.saveChildV111 = saveChild;
window.saveManagedDirection = saveEnrollment;
window.saveAddedDirectionV132 = addEnrollment;
window.deleteChildPrompt = deleteChildPrompt;
window.confirmDeleteChild = deleteChild;

reload().catch((error) => {
  console.error('Первичная загрузка CRM API не выполнена', error);
  legacy.state.sites = [];
  legacy.state.teachers = [];
  legacy.state.groups = [];
  legacy.state.children = [];
  legacy.state.selectedChild = null;
  legacy.state.selectedGroup = null;
  legacy.state.page = 'children';
  legacy.render();
  window.alert('Не удалось загрузить справочники CRM с сервера. Обновите страницу после проверки API.');
});

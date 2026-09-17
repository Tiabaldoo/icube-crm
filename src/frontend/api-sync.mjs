import { ApiClient, ApiError } from '../data/api-client.mjs';

const legacy = window.icubeLegacy;
const api = new ApiClient();
const dayNames = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
const dayShortNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const childStatusFromApi = { lead: 'Лид', active: 'Активный', paused: 'Пауза', finished: 'Закончил', archived: 'Закончил' };
const childStatusToApi = { 'Лид': 'lead', 'Активный': 'active', 'Пауза': 'paused', 'Закончил': 'finished' };
const enrollmentStatusFromApi = { active: 'Активный', paused: 'Пауза', finished: 'Закончил' };
const enrollmentStatusToApi = { 'Активный': 'active', 'Пауза': 'paused', 'Закончил': 'finished' };
let directories = { projects: [], directions: [] };
let groupSavePending = false;
let balanceTransferPending = false;
let balanceTransferKey = null;
let authProfile = null;
let resolveAuthReady = null;

export function partnerDefaultPeriod(now = new Date()) {
  const localIso = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return { from: localIso(new Date(now.getFullYear(), now.getMonth() - 1, 26)), to: localIso(new Date(now.getFullYear(), now.getMonth(), 25)) };
}
export function statisticsDefaultPeriod(now = new Date()) {
  const localIso = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return { from: localIso(new Date(now.getFullYear(), now.getMonth(), 1)), to: localIso(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
}
const initialPartnerPeriod = partnerDefaultPeriod();
legacy.state.partnerDateFrom ||= initialPartnerPeriod.from;
legacy.state.partnerDateTo ||= initialPartnerPeriod.to;
const initialStatisticsPeriod = statisticsDefaultPeriod();
legacy.state.statisticsDateFrom ||= initialStatisticsPeriod.from;
legacy.state.statisticsDateTo ||= initialStatisticsPeriod.to;
legacy.state.statisticsProjectId ||= 'all';
legacy.state.statisticsDirectionId ||= 'all';

function element(selector) { return document.querySelector(selector); }
function value(selector) { return element(selector)?.value ?? ''; }
function checked(selector) { return Boolean(element(selector)?.checked); }
function byName(items, name) { return items.find((item) => item.name === name || item.code === name); }
function fail(error) {
  if (error instanceof ApiError && error.status === 401) { showLogin(); return; }
  const message = error instanceof ApiError ? error.message : 'Не удалось сохранить данные на сервере';
  window.alert(message);
  console.error(error);
}
const paymentMethodLabel = { cashless: 'Безналичный расчёт', cash: 'Наличные' };
const isoToRu = (date) => String(date ?? '').split('-').reverse().join('.');
const timestampDate = (value) => String(value ?? '').slice(0, 10);
const timestampTime = (value) => String(value ?? '').slice(11, 16);
const html = (value) => String(value ?? '').replace(/[&<>"']/g, (symbol) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[symbol]);

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
      projectId: Number(enrollment.projectId), project: enrollment.projectName,
      direction: enrollment.directionName, groupId: enrollment.groupId == null ? null : Number(enrollment.groupId), status: enrollmentStatusFromApi[enrollment.status] ?? enrollment.status,
      individualPrice: enrollment.individualPrice == null ? null : Number(enrollment.individualPrice), currentPrice: enrollment.currentPrice == null ? null : Number(enrollment.currentPrice),
      balance: enrollment.balanceLessons == null ? 0 : Number(enrollment.balanceLessons) })) };
}

function mapLesson(lesson) {
  if (lesson.readOnly) {
    const date = isoToRu(timestampDate(lesson.startsAt));
    return { id: Number(lesson.id), groupId: Number(lesson.groupId), groupName: lesson.groupName,
      projectId: Number(lesson.projectId), project: lesson.projectName,
      teacherId: Number(lesson.actualTeacherId ?? lesson.plannedTeacherId), teacherName: lesson.actualTeacherName ?? lesson.plannedTeacherName,
      siteId: Number(lesson.siteId), siteName: lesson.siteName, scheduledDate: isoToRu(timestampDate(lesson.scheduledStartsAt)),
      scheduledTime: `${timestampTime(lesson.scheduledStartsAt)}–${timestampTime(lesson.scheduledEndsAt)}`,
      date, time: `${timestampTime(lesson.startsAt)}–${timestampTime(lesson.endsAt)}`,
      occurrenceKey: `${Number(lesson.groupId)}|${isoToRu(timestampDate(lesson.scheduledStartsAt))}`, readOnly: true,
      attendance: {}, extras: [], photos: [], status: 'Занято' };
  }
  const main = lesson.attendances.filter((item) => item.type === 'main');
  const extras = lesson.attendances.filter((item) => item.type === 'extra');
  const attendance = {}; const trialChildren = {};
  main.forEach((item) => { attendance[Number(item.childId)] = item.present; trialChildren[Number(item.childId)] = item.trial; });
  const scheduledDate = isoToRu(timestampDate(lesson.scheduledStartsAt));
  const scheduledTime = `${timestampTime(lesson.scheduledStartsAt)}–${timestampTime(lesson.scheduledEndsAt)}`;
  const date = isoToRu(timestampDate(lesson.startsAt)); const time = `${timestampTime(lesson.startsAt)}–${timestampTime(lesson.endsAt)}`;
  const status = lesson.status === 'completed' ? 'Проведено' : lesson.status === 'in_progress' ? 'Идёт' : lesson.status === 'cancelled' ? 'Отменено' : 'Запланировано';
  return {
    id: Number(lesson.id), groupId: Number(lesson.groupId), teacherId: Number(lesson.actualTeacherId ?? lesson.plannedTeacherId),
    plannedTeacherId: Number(lesson.plannedTeacherId), siteId: Number(lesson.siteId), siteName: lesson.siteName ?? '',
    siteOverrideId: lesson.siteOverrideId == null ? null : Number(lesson.siteOverrideId), scheduledDate, scheduledTime, occurrenceKey: `${Number(lesson.groupId)}|${scheduledDate}`,
    date, time, status, topic: lesson.topic ?? '', attendance, trialChildren,
    extras: extras.map((item) => ({ childId: Number(item.childId), enrollmentId: Number(item.enrollmentId), trial: item.trial, present: item.present })),
    photos: {}, started: ['in_progress', 'completed'].includes(lesson.status), done: lesson.status === 'completed', cancelled: lesson.status === 'cancelled',
    moved: date !== scheduledDate || time !== scheduledTime, intro: lesson.introGroup, emptyTrip: lesson.emptyTrip,
    attendanceApplied: Boolean(lesson.attendanceAppliedAt), groupChildIdsV146: lesson.roster.filter((item) => item.type === 'main').map((item) => Number(item.childId)),
    groupRosterFrozenV146: Boolean(lesson.rosterFrozenAt), groupRosterFrozenAtV146: lesson.rosterFrozenAt,
    salaryAccrual: lesson.salary ?? null,
  };
}

async function reload({ render = true } = {}) {
  if (authProfile?.roles?.includes('teacher') && !authProfile.roles.includes('director')) return reloadTeacher({ render });
  const partner = authProfile?.roles?.includes('partner') && !authProfile.roles.includes('director');
  const statisticsQuery = `?from=${encodeURIComponent(legacy.state.statisticsDateFrom)}&to=${encodeURIComponent(legacy.state.statisticsDateTo)}&projectId=${encodeURIComponent(legacy.state.statisticsProjectId)}&directionId=${encodeURIComponent(legacy.state.statisticsDirectionId)}`;
  const [projects, directions, sites, teachers, groups, children, payments, refunds, lessons, lessonDeletions, notifications, balanceTransfers, statistics, dailySummary, venues] = await Promise.all([
    api.list('projects'), api.list('directions'), api.list('sites'), api.list('teachers'), api.list('groups'), api.list('children'), api.list('payments'), api.list('refunds'), api.list('lessons'), api.list('lesson-deletions'), api.list('notifications').catch(() => []),
    api.list('balance-transfers'), partner ? Promise.resolve(null) : api.list('statistics', statisticsQuery), api.request('/dashboard/daily'), api.list('sites/venues'),
  ]);
  directories = { projects, directions };
  legacy.state.projects = projects.map((project) => ({ ...project, id: Number(project.id) }));
  legacy.state.sites = sites.map((site) => ({ ...site, id: Number(site.id), projectId: Number(site.projectId) }));
  legacy.state.lessonVenues = venues.map((site) => ({ ...site, id: Number(site.id), active: Boolean(site.active) }));
  legacy.state.teachers = teachers.map((teacher) => ({ ...teacher, id: Number(teacher.id), projectIds: teacher.projectIds.map(Number), directions: teacher.directions.map((direction) => direction.name) }));
  legacy.state.groups = groups.map(mapGroup);
  legacy.state.children = children.map(mapChild);
  legacy.state.payments = payments.map((payment) => ({
    id: Number(payment.id), enrollmentId: Number(payment.enrollmentId), childId: Number(payment.childId), childName: payment.childName,
    direction: payment.directionName, amount: Number(payment.amount), price: Number(payment.priceSnapshot),
    lessons: Number(payment.lessonsCredit), date: isoToRu(payment.paidOn), paidOn: payment.paidOn,
    method: paymentMethodLabel[payment.method] ?? payment.method, methodCode: payment.method,
    groupId: payment.groupId == null ? null : Number(payment.groupId), projectId: payment.projectId == null ? null : Number(payment.projectId),
    refundedAmount: Number(payment.refundedAmount), refundableAmount: Number(payment.refundableAmount),
  }));
  legacy.state.refunds = refunds.map((refund) => ({
    id: Number(refund.id), paymentId: Number(refund.paymentId), enrollmentId: Number(refund.enrollmentId), childId: Number(refund.childId), childName: refund.childName,
    direction: refund.directionName, amount: Number(refund.amount), price: Number(refund.priceSnapshot), lessons: Number(refund.lessonsDebit),
    date: isoToRu(refund.refundedOn), refundedOn: refund.refundedOn, method: paymentMethodLabel[refund.paymentMethod] ?? refund.paymentMethod,
    methodCode: refund.paymentMethod, groupId: refund.groupId == null ? null : Number(refund.groupId), projectId: refund.projectId == null ? null : Number(refund.projectId),
  }));
  legacy.state.balanceTransfers = balanceTransfers.map((transfer) => ({ ...transfer, id: Number(transfer.id), childId: Number(transfer.childId),
    sourceEnrollmentId: Number(transfer.sourceEnrollmentId), targetEnrollmentId: Number(transfer.targetEnrollmentId) }));
  legacy.state.statistics = statistics;
  legacy.state.dailySummary = dailySummary;
  const localPhotos = new Map((legacy.state.lessons ?? []).map((lesson) => [Number(lesson.id), lesson.photos ?? {}]));
  legacy.state.lessons = lessons.map(mapLesson).map((lesson) => ({ ...lesson, photos: localPhotos.get(lesson.id) ?? {} }));
  legacy.state.calendarForeignGroups = legacy.state.lessons.filter((lesson) => lesson.readOnly).map((lesson) => ({
    id: lesson.groupId, name: lesson.groupName, project: lesson.project,
  }));
  legacy.state.deletedOccurrences = lessonDeletions.map((item) => `${Number(item.groupId)}|${isoToRu(item.scheduledDate)}`);
  legacy.state.notifications = notifications;
  if (!legacy.state.children.some((child) => child.id === Number(legacy.state.selectedChild))) legacy.state.selectedChild = legacy.state.children[0]?.id ?? null;
  if (!legacy.state.groups.some((group) => group.id === Number(legacy.state.selectedGroup))) legacy.state.selectedGroup = legacy.state.groups[0]?.id ?? null;
  if (render) legacy.render();
}

async function reloadTeacher({ render = true } = {}) {
  const [groups, children, lessons, lessonDeletions] = await Promise.all([
    api.list('groups'), api.list('children'), api.list('lessons'), api.list('lesson-deletions'),
  ]);
  const mappedGroups = groups.map(mapGroup);
  directories = {
    projects: [...new Map(groups.map((group) => [String(group.projectId), { id: String(group.projectId), name: group.projectName }])).values()],
    directions: [...new Map(groups.map((group) => [String(group.directionId), { id: String(group.directionId), name: group.directionName }])).values()],
  };
  legacy.state.sites = [...new Map(groups.map((group) => [String(group.siteId), { id: Number(group.siteId), name: group.siteName }])).values()];
  legacy.state.teachers = [{ id: Number(authProfile.teacherId), name: authProfile.displayName, active: true, directions: directories.directions.map((item) => item.name) }];
  legacy.state.groups = mappedGroups;
  legacy.state.children = children.map(mapChild);
  legacy.state.payments = [];
  legacy.state.refunds = [];
  legacy.state.balanceTransfers = [];
  legacy.state.statistics = null;
  legacy.state.lessons = lessons.map(mapLesson);
  legacy.state.deletedOccurrences = lessonDeletions.map((item) => `${Number(item.groupId)}|${isoToRu(item.scheduledDate)}`);
  legacy.state.notifications = [];
  legacy.state.prototypeTeacherId = Number(authProfile.teacherId);
  if (render) legacy.render();
}

async function saveSite(resourceId, returnToGroup) {
  try {
    const body = { name: value('#sf-name').trim(), shortName: value('#sf-short').trim(), type: value('#sf-type'), address: value('#sf-address').trim(), note: value('#sf-note').trim(), active: value('#sf-active') === 'true', projectId: value('#sf-project') || undefined };
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
    const projectIds = directories.projects.filter((project) => checked(`#tf-project-${project.id}`)).map((project) => project.id);
    const body = { name: value('#tf-name').trim(), phone: value('#tf-phone').trim(), active: value('#tf-active') === 'true', directionIds: names.map((name) => byName(directories.directions, name)?.id).filter(Boolean), projectIds };
    if (!body.name) return window.alert('Укажите фамилию и имя преподавателя');
    if (body.directionIds.length !== names.length || !names.length) return window.alert('Выберите хотя бы одно доступное направление');
    const saved = resourceId ? await api.update('teachers', resourceId, body) : await api.create('teachers', body);
    await reload({ render: false });
    if (returnToGroup) { legacy.state.pendingGroupDraft = { ...(legacy.state.pendingGroupDraft ?? {}), teacherId: saved.id }; window.groupForm(legacy.state.pendingGroupDraft.id, legacy.state.pendingGroupDraft); }
    else { legacy.state.modal = null; legacy.state.page = 'teachers'; legacy.render(); }
  } catch (error) { fail(error); }
}

async function saveGroup(resourceId) {
  if (groupSavePending) return;
  const submit = element('#gf-submit');
  groupSavePending = true;
  if (submit) submit.disabled = true;
  try {
    const direction = byName(directories.directions, value('#gf-dir'));
    const project = byName(directories.projects, value('#gf-project'));
    const startsOn = value('#gf-start-date'); const isActive = value('#gf-active') === 'true'; const endsOn = value('#gf-end-date') || null;
    if (!direction || !project) return window.alert('Не найден проект или направление в серверном справочнике');
    if (!startsOn) return window.alert('Укажите дату начала группы.');
    if (!isActive && !endsOn) return window.alert('Для неактивной группы укажите дату окончания.');
    const startTime = value('#gf-start'); const directionLabel = direction.name === 'Программирование' ? 'Программирование' : 'Роботы';
    const weekday = dayNames.indexOf(value('#gf-day'));
    const body = { name: `${directionLabel} · ${dayShortNames[weekday]} ${startTime}`,
      directionId: direction.id, siteId: Number(value('#gf-site')), projectId: project.id, teacherId: Number(value('#gf-teacher')),
      weekday: weekday + 1, startTime, endTime: value('#gf-end'), startsOn, endsOn: isActive ? null : endsOn,
      active: isActive, price: value('#gf-price') === '' ? null : Number(value('#gf-price')) };
    const saved = resourceId ? await api.update('groups', resourceId, body) : await api.create('groups', body);
    legacy.state.selectedGroup = saved.id; legacy.state.modal = null; legacy.state.page = 'group'; await reload();
  } catch (error) { fail(error); }
  finally {
    groupSavePending = false;
    if (submit?.isConnected !== false) submit.disabled = false;
  }
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
      await api.createEnrollment(saved.id, { directionId: direction.id, projectId: value('#cf-project') || undefined,
        groupId: value('#cf-group') ? Number(value('#cf-group')) : null, status: 'active' });
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
    const targetValues = { groupId: value('#md-group') ? Number(value('#md-group')) : null,
      status: enrollmentStatusToApi[value('#md-enrollment-status')] ?? enrollmentStatusToApi[enrollment.status] ?? 'active', individualPrice: individual ? packagePrice / 4 : null };
    if (String(direction.id) !== String(enrollment.directionId)) {
      const existingTarget = child.enrollments.find((item) => item.directionId === Number(direction.id));
      const newTargetValues = { ...targetValues, status: targetValues.status === 'finished' ? 'active' : targetValues.status };
      if (existingTarget) await api.updateEnrollment(existingTarget.id, newTargetValues);
      else await api.createEnrollment(child.id, { directionId: direction.id, ...newTargetValues });
      await api.updateEnrollment(enrollment.id, { groupId: null, status: 'finished' });
    } else {
      await api.updateEnrollment(enrollment.id, { directionId: direction.id, ...targetValues });
    }
    legacy.state.modal = null; legacy.state.childTab = 'overview'; legacy.state.page = 'child'; await reload();
  } catch (error) { fail(error); }
}

async function addEnrollment() {
  try {
    const childId = Number(value('#ad-child-id')); const direction = byName(directories.directions, value('#ad-dir'));
    const individual = value('#ad-price-mode') === 'individual'; const packagePrice = Number(value('#ad-individual-package') || 0);
    if (!direction) return;
    if (individual && !(packagePrice > 0)) return window.alert('Укажите индивидуальную цену абонемента за 4 занятия.');
    await api.createEnrollment(childId, { directionId: direction.id, projectId: value('#ad-project') || undefined,
      groupId: value('#ad-group') ? Number(value('#ad-group')) : null,
      status: 'active', individualPrice: individual ? packagePrice / 4 : null });
    legacy.state.modal = null; legacy.state.childTab = 'overview'; legacy.state.page = 'child'; await reload();
  } catch (error) { fail(error); }
}

async function projectTransferForm(enrollmentId) {
  const child = legacy.state.children.find((item) => item.enrollments.some((enrollment) => enrollment.id === Number(enrollmentId)));
  const enrollment = child?.enrollments.find((item) => item.id === Number(enrollmentId));
  if (!enrollment) return;
  try {
    const targets = (await api.list('project-transfer-targets')).filter((project) => String(project.id) !== String(enrollment.projectId));
    if (!targets.length) return window.alert('Нет другого доступного проекта.');
    const group = legacy.state.groups.find((item) => item.id === enrollment.groupId);
    legacy.state.modal = `<h3>Перенести в другой проект</h3><div class="notice">Текущий проект: <b>${html(enrollment.project)}</b>.
      ${group ? `Текущая группа «${html(group.name)}» будет снята. После переноса ребёнка нужно определить в новую группу.` : 'После переноса ребёнка нужно определить в новую группу.'}
      Исторические занятия и оплаты останутся в прежнем проекте.</div>
      <div class="field" style="margin-top:14px"><label>Новый проект</label><select class="select" id="pt-project">${targets.map((project) => `<option value="${html(project.id)}">${html(project.name)}</option>`).join('')}</select></div>
      <div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn primary" onclick="icubeApi.confirmProjectTransfer(${enrollment.id})">Продолжить</button></div>`;
    legacy.render();
  } catch (error) { fail(error); }
}

async function confirmProjectTransfer(enrollmentId) {
  const projectId = value('#pt-project'); if (!projectId) return;
  if (!window.confirm('Перенести направление в другой проект? Текущая группа будет снята.')) return;
  try {
    const result = await api.request(`/enrollments/${enrollmentId}/project-transfer`, { method: 'POST', body: { projectId } });
    legacy.state.selectedChild = Number(result.childId); legacy.state.childTab = 'overview'; legacy.state.modal = null;
    legacy.state.page = 'child'; await reload();
  } catch (error) { fail(error); }
}

async function deleteChild(childId) {
  try { await api.delete('children', childId); legacy.state.selectedChild = null; legacy.state.modal = null; legacy.state.page = 'children'; await reload(); }
  catch (error) { fail(error); }
}

const displayMoney = (amount) => `${new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(amount))} ₽`;
async function balanceTransferPreview(sourceEnrollmentId, targetEnrollmentId) {
  return api.request(`/balance-transfers/preview?sourceEnrollmentId=${encodeURIComponent(sourceEnrollmentId)}&targetEnrollmentId=${encodeURIComponent(targetEnrollmentId)}`);
}
async function transferDirectionBalanceForm(childId, direction) {
  const child = legacy.state.children.find((item) => item.id === Number(childId));
  const source = child?.enrollments.find((item) => item.direction === direction);
  const targets = child?.enrollments.filter((item) => item.id !== source?.id && item.status !== 'Закончил') ?? [];
  if (!source || source.status !== 'Закончил' || !(source.balance > 0) || !targets.length) return;
  balanceTransferKey = globalThis.crypto?.randomUUID?.() ?? `transfer-${Date.now()}-${Math.random()}`;
  legacy.state.modal = `<h3>Перенести остаток</h3><div class="notice">Направление <b>«${html(source.direction)}»</b> закрыто. Денежный остаток будет рассчитан сервером по историческим оплатам.</div>
    <div class="field" style="margin-top:14px"><label>Перенести на направление</label><select class="select" id="tb-target" onchange="icubeApi.refreshBalanceTransferPreview(${source.id})">${targets.map((item) => `<option value="${item.id}">${html(item.direction)}</option>`).join('')}</select></div>
    <div id="tb-preview" class="card pad" style="margin-top:14px">Расчёт остатка…</div>
    <div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn primary" id="tb-submit" onclick="icubeApi.confirmBalanceTransfer(${source.id})">Перенести остаток</button></div>`;
  legacy.render();
  await refreshBalanceTransferPreview(source.id);
}
async function refreshBalanceTransferPreview(sourceEnrollmentId) {
  const targetEnrollmentId = value('#tb-target'); const box = element('#tb-preview');
  if (!targetEnrollmentId || !box) return;
  try {
    const preview = await balanceTransferPreview(sourceEnrollmentId, targetEnrollmentId);
    box.dataset.transferableAmount = preview.transferableAmount;
    box.innerHTML = `<div class="info-list"><div class="info-line"><span>Остаток старого направления</span><b>${displayMoney(preview.transferableAmount)}</b></div>
      <div class="info-line"><span>Цена нового направления</span><b>${displayMoney(preview.targetPriceSnapshot)} / занятие</b></div>
      <div class="info-line"><span>Будет зачислено</span><b>${Number(preview.targetLessonsCredit).toFixed(4)} занятия</b></div></div>
      <div class="muted mini" style="margin-top:10px">Оплаты и посещения старого направления остаются в его истории.</div>`;
  } catch (error) { box.textContent = error.message; }
}
async function confirmBalanceTransfer(sourceEnrollmentId) {
  if (balanceTransferPending) return;
  const targetEnrollmentId = value('#tb-target'); if (!targetEnrollmentId) return;
  const button = element('#tb-submit'); balanceTransferPending = true; if (button) button.disabled = true;
  try {
    await api.create('balance-transfers', { sourceEnrollmentId, targetEnrollmentId }, balanceTransferKey);
    await reload({ render: false }); legacy.state.modal = null; legacy.state.childTab = 'overview'; legacy.state.page = 'child'; legacy.render();
  } catch (error) { fail(error); }
  finally { balanceTransferPending = false; if (button?.isConnected !== false) button.disabled = false; }
}

function cancelBalanceTransferPrompt(transferId) {
  legacy.state.modal = `<h3>Отменить перенос остатка?</h3><div class="notice">Остаток будет возвращён в исходное направление.<br><br>Это возможно только если перенесённые средства ещё не использованы.</div>
    <div class="modal-actions"><button class="btn" onclick="closeModal()">Не отменять</button><button class="btn danger" onclick="icubeApi.cancelBalanceTransfer(${Number(transferId)})">Отменить перенос</button></div>`;
  legacy.render();
}
async function cancelBalanceTransfer(transferId) {
  try {
    await api.delete('balance-transfers', transferId); await reload({ render: false });
    legacy.state.modal = null; legacy.state.childTab = 'overview'; legacy.state.page = 'child'; legacy.render();
  } catch (error) { fail(error); }
}

async function loadStatistics() {
  legacy.state.statisticsDateFrom = value('#stats-from') || legacy.state.statisticsDateFrom;
  legacy.state.statisticsDateTo = value('#stats-to') || legacy.state.statisticsDateTo;
  legacy.state.statisticsProjectId = value('#stats-project') || 'all';
  legacy.state.statisticsDirectionId = value('#stats-direction') || 'all';
  const query = `?from=${encodeURIComponent(legacy.state.statisticsDateFrom)}&to=${encodeURIComponent(legacy.state.statisticsDateTo)}&projectId=${encodeURIComponent(legacy.state.statisticsProjectId)}&directionId=${encodeURIComponent(legacy.state.statisticsDirectionId)}`;
  try { legacy.state.statistics = await api.list('statistics', query); legacy.render(); }
  catch (error) { fail(error); }
}
function statisticsPage() {
  const result = legacy.state.statistics;
  const summary = result?.summary ?? { completedLessons: 0, visits: 0, absences: 0, attendancePercent: '0.0', newChildren: 0, leftChildren: 0, activeChildren: 0, averageOccupancyPercent: '0.0' };
  const option = (item, selected) => `<option value="${item.id}"${String(item.id) === String(selected) ? ' selected' : ''}>${html(item.name)}</option>`;
  const metrics = [
    ['Проведено занятий', summary.completedLessons], ['Посещений', summary.visits], ['Пропусков', summary.absences],
    ['Средняя посещаемость', `${summary.attendancePercent}%`], ['Новых детей', summary.newChildren], ['Ушли / пауза', summary.leftChildren],
    ['Активные дети сейчас', summary.activeChildren], ['Средняя заполненность', `${summary.averageOccupancyPercent}%`],
  ];
  const rows = (result?.groups ?? []).map((group) => `<div class="row" style="grid-template-columns:2fr 1.2fr 1.3fr .8fr .8fr 1fr .8fr .8fr 1fr .7fr .7fr;min-width:1120px">
    <div><b>${html(group.name)}</b></div><div>${html(group.projectName)}</div><div>${html(group.directionName)}</div><div>${group.currentMembers}</div><div>${group.capacity}</div>
    <div>${group.currentMembers} / ${group.capacity} · ${group.occupancyPercent}%</div><div>${group.completedLessons}</div><div>${group.visits}</div><div>${group.absences} · ${group.attendancePercent}%</div><div>${group.newChildren}</div><div>${group.leftChildren}</div></div>`).join('');
  return `${legacy.pageHead('Статистика', 'Посещаемость, движение детей и заполненность групп по данным CRM.')}<div class="toolbar" style="align-items:end;flex-wrap:wrap">
    <div class="field"><label>Дата от</label><input class="input" id="stats-from" type="date" value="${html(legacy.state.statisticsDateFrom)}"></div>
    <div class="field"><label>Дата до</label><input class="input" id="stats-to" type="date" value="${html(legacy.state.statisticsDateTo)}"></div>
    <div class="field"><label>Проект</label><select class="select" id="stats-project"><option value="all">Все</option>${directories.projects.map((item) => option(item, legacy.state.statisticsProjectId)).join('')}</select></div>
    <div class="field"><label>Направление</label><select class="select" id="stats-direction"><option value="all">Все</option>${directories.directions.map((item) => option(item, legacy.state.statisticsDirectionId)).join('')}</select></div>
    <button class="btn primary" onclick="icubeApi.loadStatistics()">Применить</button></div>
    <div class="grid cols-4">${metrics.map(([label, metric]) => `<div class="card metric"><div class="label">${label}</div><div class="value">${metric}</div></div>`).join('')}</div>
    <div class="card child-ledger-card" style="margin-top:16px"><div class="child-ledger-head"><div><h2>Группы</h2><div class="muted mini">Номинальная вместимость — 8 детей</div></div></div>
      <div style="overflow-x:auto"><div class="list"><div class="row header" style="grid-template-columns:2fr 1.2fr 1.3fr .8fr .8fr 1fr .8fr .8fr 1fr .7fr .7fr;min-width:1120px"><div>Группа</div><div>Проект</div><div>Направление</div><div>Активных</div><div>Вместимость</div><div>Заполненность</div><div>Занятий</div><div>Посещений</div><div>Пропуски</div><div>Новых</div><div>Ушли</div></div>${rows || '<div class="empty">За выбранный период данных нет.</div>'}</div></div></div>`;
}

const legacyChildPage = window.child;
function childPageWithTransferHistory() {
  const output = typeof legacyChildPage === 'function' ? legacyChildPage() : '';
  const child = legacy.state.children.find((item) => item.id === Number(legacy.state.selectedChild));
  const transfers = (legacy.state.balanceTransfers ?? []).filter((item) => item.childId === child?.id);
  if (!child || legacy.state.childTab !== 'overview' || !transfers.length) return output;
  const block = `<div class="card child-ledger-card" style="margin-top:16px"><div class="child-ledger-head"><div><h2>Переносы остатка</h2><div class="muted mini">${transfers.length} операций</div></div></div><div class="list">${transfers.map((item) => `<div class="kpi-line"><div><b>${html(item.sourceDirectionName)} → ${html(item.targetDirectionName)}</b><div class="muted mini">${isoToRu(timestampDate(item.transferredAt))} · ${displayMoney(item.transferredAmount)} · зачислено ${Number(item.targetLessonsCredit).toFixed(4)} занятия</div></div><button class="btn danger" onclick="icubeApi.cancelBalanceTransferPrompt(${item.id})">Отменить перенос</button></div>`).join('')}</div></div>`;
  return `${output}${block}`;
}

function partnerProjects() { return directories.projects.filter((project) => project.partnerId != null); }

function settlementContent({ partnerView = false } = {}) {
  const result = legacy.state.partnerSettlement;
  if (legacy.state.partnerSettlementError) return `<div class="card pad"><div class="notice">${html(legacy.state.partnerSettlementError)}</div></div>`;
  if (!result) return '<div class="card pad"><div class="empty">Выберите период и нажмите «Рассчитать».</div></div>';

  const percent = (value) => String(value).replace(/\.0+$/, '');
  const transfer = Number(result.transferAmount);
  const amount = displayMoney(Math.abs(transfer));
  const rows = `<div class="partner-lines">
    <div class="partner-line"><span>Оплаты</span><b>${displayMoney(result.paymentsAmount)}</b></div>
    <div class="partner-line"><span>Возвраты</span><b>${displayMoney(result.refundsAmount)}</b></div>
    <div class="partner-line"><span>Доход после возвратов</span><b>${displayMoney(result.incomeAmount)}</b></div>
    <div class="partner-line"><span>Налог ${percent(result.taxPercent)}%</span><b>− ${displayMoney(result.taxAmount)}</b></div>
    <div class="partner-line"><span>Зарплата преподавателей</span><b>− ${displayMoney(result.salaryAmount)}</b></div>
    <div class="partner-line partner-divider"><span>Остаток к распределению</span><b>${displayMoney(result.distributableAmount)}</b></div>
    <div class="partner-line"><span>Доля iCube ${percent(result.icubePercent)}%</span><b>${displayMoney(result.icubeShareAmount)}</b></div>
    <div class="partner-line"><span>Доля партнёра ${percent(result.partnerPercent)}%</span><b>${displayMoney(result.partnerShareAmount)}</b></div>
    <div class="partner-line"><span>Наличные у партнёра</span><b>${displayMoney(result.cashHeldByPartner)}</b></div>
  </div>`;

  let finalBlock;
  if (partnerView) {
    if (transfer > 0) {
      finalBlock = `<div class="partner-final partner-final-pay"><div><div class="partner-final-caption">Итоговый расчёт</div><span>К получению</span><div class="partner-final-direction">от iCube</div></div><b>${amount}</b></div>`;
    } else if (transfer < 0) {
      finalBlock = `<div class="partner-final partner-final-return"><div><div class="partner-final-caption">Итоговый расчёт</div><span>К переводу</span><div class="partner-final-direction">в iCube</div></div><b>${amount}</b></div>`;
    } else {
      finalBlock = '<div class="partner-final partner-final-zero"><div><div class="partner-final-caption">Итоговый расчёт</div><span>Взаиморасчёт закрыт</span></div><b>0 ₽</b></div>';
    }
  } else {
    const positive = transfer >= 0;
    finalBlock = `<div class="partner-final ${positive ? 'partner-final-pay' : 'partner-final-return'}"><span>${positive ? 'К переводу партнёру' : 'К получению от партнёра'}</span><b>${amount}</b></div>`;
  }

  return `<div class="card pad partner-settlement"><div class="section-title"><div><h2 style="font-size:22px">${html(result.projectName)}</h2><div class="muted">${isoToRu(result.periodFrom)} — ${isoToRu(result.periodTo)}</div></div><span class="badge purple">${html(result.partnerName)}</span></div>${rows}${finalBlock}</div>`;
}

function partnerPage() {
  const projects = partnerProjects();
  if (!projects.length) return `${legacy.pageHead('Партнёр', 'Расчёт по операциям партнёрского проекта.')}<div class="card pad"><div class="empty">Нет проекта с назначенным партнёром.</div></div>`;
  if (!projects.some((project) => String(project.id) === String(legacy.state.partnerProjectId))) legacy.state.partnerProjectId = String(projects[0].id);
  return `${legacy.pageHead('Партнёр', 'Расчёт по реальным операциям и занятиям партнёрского проекта.')}<div class="toolbar">
    <select class="select" id="partner-project" style="max-width:240px">${projects.map((project) => `<option value="${project.id}"${String(project.id) === String(legacy.state.partnerProjectId) ? ' selected' : ''}>${html(project.name)}</option>`).join('')}</select>
    <input class="input" id="partner-from" type="date" value="${html(legacy.state.partnerDateFrom)}" style="max-width:180px">
    <input class="input" id="partner-to" type="date" value="${html(legacy.state.partnerDateTo)}" style="max-width:180px">
    <button class="btn primary" onclick="icubeApi.calculatePartnerSettlement()">Рассчитать</button></div>${settlementContent()}`;
}

function partnerSettlementPage() {
  return `${legacy.pageHead('Расчёты', 'Взаиморасчёт по вашему проекту. Проект определяется вашей учётной записью.')}<div class="toolbar">
    <input class="input" id="partner-from" type="date" value="${html(legacy.state.partnerDateFrom)}" aria-label="Начало периода">
    <input class="input" id="partner-to" type="date" value="${html(legacy.state.partnerDateTo)}" aria-label="Конец периода">
    <button class="btn primary" onclick="icubeApi.calculatePartnerSettlement()">Рассчитать</button></div>${settlementContent({ partnerView: true })}`;
}

async function calculatePartnerSettlement() {
  const partnerView = authProfile?.roles?.includes('partner') && !authProfile?.roles?.includes('director');
  if (!partnerView) legacy.state.partnerProjectId = value('#partner-project') || legacy.state.partnerProjectId;
  legacy.state.partnerDateFrom = value('#partner-from') || legacy.state.partnerDateFrom;
  legacy.state.partnerDateTo = value('#partner-to') || legacy.state.partnerDateTo;
  const query = `?from=${encodeURIComponent(legacy.state.partnerDateFrom)}&to=${encodeURIComponent(legacy.state.partnerDateTo)}${partnerView ? '' : `&projectId=${encodeURIComponent(legacy.state.partnerProjectId)}`}`;
  try {
    legacy.state.partnerSettlement = await api.list('partner-settlements', query);
    legacy.state.partnerSettlementError = null;
  } catch (error) { legacy.state.partnerSettlement = null; legacy.state.partnerSettlementError = error.message; }
  legacy.render();
}

function paymentEnrollment(childId, enrollmentId) {
  return legacy.state.children.find((child) => child.id === Number(childId))?.enrollments.find((enrollment) => enrollment.id === Number(enrollmentId));
}

function paymentForm(childId, direction, paymentId) {
  const existing = paymentId ? legacy.state.payments.find((payment) => payment.id === Number(paymentId)) : null;
  if (!legacy.state.children.length && !existing) return window.alert('Сначала создайте ребёнка.');
  const child = legacy.state.children.find((item) => item.id === Number(existing?.childId ?? childId)) ?? legacy.state.children[0];
  const historical = Boolean(existing && !child?.enrollments.some((enrollment) => enrollment.id === existing.enrollmentId));
  const preferred = existing?.enrollmentId ?? child?.enrollments.find((enrollment) => enrollment.direction === direction)?.id ?? child?.enrollments[0]?.id ?? null;
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  legacy.state.modal = `<h3>${existing ? 'Редактировать оплату' : 'Новая оплата'}</h3><div class="form-grid">
    <div class="field"><label>Дата</label><input class="input" id="pf-date" type="date" value="${html(existing?.paidOn ?? todayIso)}"></div>
    <div class="field"><label>Ребёнок</label><select class="select" id="pf-child" onchange="icubeApi.refreshPaymentDirections(${existing?.id ?? 'null'})" ${historical ? 'disabled' : ''}>${historical ? `<option value="${existing.childId}">${html(existing.childName)}</option>` : legacy.state.children.map((item) => `<option value="${item.id}"${item.id === child.id ? ' selected' : ''}>${html(item.name)}</option>`).join('')}</select></div>
    <div class="field"><label>Направление</label><select class="select" id="pf-enrollment" onchange="icubeApi.updatePaymentPrice(${existing?.id ?? 'null'})" ${historical ? 'disabled' : ''}>${historical ? `<option value="${existing.enrollmentId}">${html(existing.direction)}</option>` : ''}</select></div>
    <div class="field"><label>Сумма, ₽</label><input class="input" id="pf-amount" type="number" min="0.01" step="0.01" value="${html(existing?.amount ?? '4100')}" oninput="icubeApi.updatePaymentCalc()"></div>
    <div class="field"><label>Цена занятия, ₽</label><input class="input" id="pf-price" type="number" min="0.01" step="0.01" value="${html(existing?.price ?? '')}" ${existing ? '' : 'readonly'} data-price-edited="false" oninput="this.dataset.priceEdited='true';icubeApi.updatePaymentCalc()"></div>
    <div class="field"><label>Способ оплаты</label><select class="select" id="pf-method"><option value="cashless"${(existing?.methodCode ?? 'cashless') === 'cashless' ? ' selected' : ''}>Безналичный расчёт</option><option value="cash"${existing?.methodCode === 'cash' ? ' selected' : ''}>Наличные</option></select></div>
    </div><div class="notice" id="pf-calc" style="margin-top:14px"></div><div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn primary" onclick="icubeApi.savePayment(${existing?.id ?? 'null'})">${existing ? 'Сохранить изменения' : 'Сохранить оплату'}</button></div>`;
  legacy.render();
  if (historical) setTimeout(updatePaymentCalc, 0);
  else setTimeout(() => refreshPaymentDirections(existing?.id ?? null, preferred), 0);
}

function refreshPaymentDirections(paymentId, preferredEnrollmentId) {
  const child = legacy.state.children.find((item) => item.id === Number(value('#pf-child')));
  const select = element('#pf-enrollment');
  if (!select) return;
  select.innerHTML = (child?.enrollments ?? []).map((enrollment) => `<option value="${enrollment.id}"${enrollment.id === Number(preferredEnrollmentId) ? ' selected' : ''}>${html(enrollment.direction)}</option>`).join('');
  if (!select.innerHTML) select.innerHTML = '<option value="">Нет направлений</option>';
  updatePaymentPrice(paymentId);
}

function updatePaymentPrice(paymentId) {
  const existing = paymentId ? legacy.state.payments.find((payment) => payment.id === Number(paymentId)) : null;
  const enrollment = paymentEnrollment(value('#pf-child'), value('#pf-enrollment'));
  const priceInput = element('#pf-price');
  if (priceInput && (!existing || existing.enrollmentId !== enrollment?.id)) priceInput.value = enrollment ? String(enrollment.currentPrice ?? legacy.effectivePrice(enrollment) ?? '') : '';
  updatePaymentCalc();
}

function updatePaymentCalc() {
  const amount = Number(value('#pf-amount')); const price = Number(value('#pf-price')); const box = element('#pf-calc');
  if (!box) return;
  box.innerHTML = price > 0 && amount > 0
    ? `Цена операции: <b>${html(price)} ₽</b> · будет начислено <b>${Number((amount / price).toFixed(8))} занятия</b>.`
    : 'Укажите положительную сумму и цену занятия.';
}

async function savePayment(paymentId) {
  try {
    const body = { enrollmentId: value('#pf-enrollment'), paidOn: value('#pf-date'), amount: value('#pf-amount'), method: value('#pf-method') };
    if (paymentId && element('#pf-price')?.dataset.priceEdited === 'true') body.priceSnapshot = value('#pf-price');
    const saved = paymentId ? await api.update('payments', paymentId, body) : await api.create('payments', body);
    await reload({ render: false });
    legacy.state.selectedChild = Number(saved.childId); legacy.state.childTab = 'payments'; legacy.state.modal = null;
    legacy.state.page = legacy.state.children.some((child) => child.id === Number(saved.childId)) ? 'child' : 'payments'; legacy.render();
  } catch (error) { fail(error); }
}

function deletePaymentPrompt(paymentId) {
  const payment = legacy.state.payments.find((item) => item.id === Number(paymentId));
  if (!payment) return;
  legacy.state.modal = `<h3>Удалить оплату?</h3><div class="notice">Оплата <b>${html(payment.amount)} ₽</b> будет удалена, а её вклад ${html(payment.lessons)} занятия полностью отменён.</div><div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn danger" onclick="icubeApi.deletePayment(${payment.id})">Удалить</button></div>`;
  legacy.render();
}

async function deletePayment(paymentId) {
  const payment = legacy.state.payments.find((item) => item.id === Number(paymentId));
  if (!payment) return;
  try {
    await api.delete('payments', paymentId); await reload({ render: false });
    legacy.state.selectedChild = payment.childId; legacy.state.childTab = 'payments'; legacy.state.modal = null;
    legacy.state.page = legacy.state.children.some((child) => child.id === payment.childId) ? 'child' : 'payments'; legacy.render();
  } catch (error) { fail(error); }
}

function refundablePayments(childId) {
  return legacy.state.payments.filter((payment) => (childId == null || payment.childId === Number(childId)) && payment.refundableAmount > 0);
}

function refundForm(paymentId = null, childId = null) {
  const available = refundablePayments(childId);
  const selected = available.find((payment) => payment.id === Number(paymentId)) ?? available[0];
  if (!selected) return window.alert('Нет оплат со свободным остатком для возврата.');
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  legacy.state.modal = `<h3>Возврат оплаты</h3><div class="form-grid">
    <div class="field span-2"><label>Оплата</label><select class="select" id="rf-payment" onchange="icubeApi.refreshRefundMaximum()">${available.map((payment) => `<option value="${payment.id}"${payment.id === selected.id ? ' selected' : ''}>${html(payment.date)} · ${html(payment.direction)} · ${html(payment.amount)} ₽</option>`).join('')}</select></div>
    <div class="field"><label>Дата возврата</label><input class="input" id="rf-date" type="date" value="${todayIso}"></div>
    <div class="field"><label>Сумма, ₽</label><input class="input" id="rf-amount" type="number" min="0.01" step="0.01" value="${html(selected.refundableAmount)}"></div>
    </div><div class="notice" id="rf-max" style="margin-top:14px"></div><div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn primary" onclick="icubeApi.saveRefund()">Сохранить возврат</button></div>`;
  legacy.render(); setTimeout(refreshRefundMaximum, 0);
}

function refreshRefundMaximum() {
  const payment = legacy.state.payments.find((item) => item.id === Number(value('#rf-payment')));
  const amount = element('#rf-amount'); const box = element('#rf-max');
  if (!payment) return;
  if (amount) amount.max = String(payment.refundableAmount);
  if (box) box.innerHTML = `Максимум к возврату: <b>${html(payment.refundableAmount)} ₽</b> · по исторической цене <b>${html(payment.price)} ₽/занятие</b>.`;
}

async function saveRefund() {
  const payment = legacy.state.payments.find((item) => item.id === Number(value('#rf-payment')));
  if (!payment) return window.alert('Выберите оплату.');
  try {
    const saved = await api.create('refunds', { paymentId: String(payment.id), refundedOn: value('#rf-date'), amount: value('#rf-amount') });
    await reload({ render: false });
    legacy.state.selectedChild = Number(saved.childId); legacy.state.childTab = 'refunds'; legacy.state.modal = null;
    legacy.state.page = legacy.state.children.some((child) => child.id === Number(saved.childId)) ? 'child' : 'refunds'; legacy.render();
  } catch (error) { fail(error); }
}

function deleteRefundPrompt(refundId) {
  const refund = legacy.state.refunds.find((item) => item.id === Number(refundId));
  if (!refund) return;
  legacy.state.modal = `<h3>Отменить возврат?</h3><div class="notice">Возврат <b>${html(refund.amount)} ₽</b> будет удалён, а ${html(refund.lessons)} занятия вернутся в исходную оплату и баланс.</div><div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn danger" onclick="icubeApi.deleteRefund(${refund.id})">Удалить возврат</button></div>`;
  legacy.render();
}

async function deleteRefund(refundId) {
  const refund = legacy.state.refunds.find((item) => item.id === Number(refundId));
  if (!refund) return;
  try {
    await api.delete('refunds', refundId); await reload({ render: false });
    legacy.state.selectedChild = refund.childId; legacy.state.childTab = 'refunds'; legacy.state.modal = null;
    legacy.state.page = legacy.state.children.some((child) => child.id === refund.childId) ? 'child' : 'refunds'; legacy.render();
  } catch (error) { fail(error); }
}

const ruToIso = (date) => String(date ?? '').split('.').reverse().join('-');
function currentLesson() { return legacy.state.lessons.find((lesson) => lesson.id === Number(legacy.state.selectedLesson)); }
async function reloadLesson(lessonId, page = legacy.state.page) {
  await reload({ render: false });
  if (!legacy.state.lessons.some((lesson) => lesson.id === Number(lessonId))) {
    const lesson = await api.get('lessons', lessonId);
    legacy.state.lessons.push(mapLesson(lesson));
  }
  legacy.state.selectedLesson = Number(lessonId); legacy.state.page = page; legacy.state.modal = null; legacy.render();
}
async function lessonCommand(path, body, page = legacy.state.page) {
  const lessonId = currentLesson()?.id;
  if (!lessonId) return;
  try { await api.request(`/lessons/${lessonId}/${path}`, { method: 'POST', body: body ?? {} }); await reloadLesson(lessonId, page); }
  catch (error) { fail(error); }
}

async function openCalendarEvent(key, role) {
  try {
    let lesson = legacy.state.lessons.find((item) => item.occurrenceKey === key);
    if (!lesson) {
      const [groupId, ...dateParts] = String(key).split('|');
      const date = ruToIso(dateParts.join('|'));
      const loaded = await api.list('lessons', `?from=${encodeURIComponent(date)}&to=${encodeURIComponent(date)}`);
      const serverLesson = loaded.find((item) => String(item.groupId) === String(groupId));
      if (serverLesson) {
        lesson = mapLesson(serverLesson);
        legacy.state.lessons.push(lesson);
      }
    }
    if (!lesson && role === 'director') {
      const [groupId, ...dateParts] = String(key).split('|');
      const date = ruToIso(dateParts.join('|'));
      lesson = mapLesson(await api.create('lessons', { groupId, scheduledDate: date }));
      legacy.state.lessons.push(lesson);
    }
    if (!lesson) return;
    if (lesson.readOnly) {
      legacy.state.modal = `<h3>${html(lesson.groupName)}</h3><div class="info-list">
        <div class="info-line"><span>Проект</span><b>${html(lesson.project)}</b></div>
        <div class="info-line"><span>Дата и время</span><b>${html(lesson.date)} · ${html(lesson.time)}</b></div>
        <div class="info-line"><span>Преподаватель</span><b>${html(lesson.teacherName)}</b></div>
        <div class="info-line"><span>Площадка</span><b>${html(lesson.siteName)}</b></div></div>
        <div class="modal-actions"><button class="btn" onclick="closeModal()">Закрыть</button></div>`;
      legacy.render(); return;
    }
    if (role === 'teacher' && temporaryTeacherParentRole() && lesson.teacherId) legacy.state.prototypeTeacherId = Number(lesson.teacherId);
    legacy.state.selectedLesson = lesson.id; legacy.state.page = role === 'teacher' ? 'teacherLesson' : 'lesson'; legacy.render();
  } catch (error) { fail(error); }
}

async function startLessonApi() {
  const lesson = currentLesson(); if (!lesson) return;
  const teacherId = legacy.state.role === 'teacher' && typeof window.currentPrototypeTeacherId === 'function'
    ? Number(window.currentPrototypeTeacherId() || lesson.teacherId) : lesson.teacherId;
  await lessonCommand('start', { actualTeacherId: teacherId }, 'teacherLesson');
}

async function putAttendance(childId, present, trial) {
  const lesson = currentLesson(); if (!lesson) return;
  try {
    await api.request(`/lessons/${lesson.id}/attendance/${Number(childId)}`, { method: 'PUT', body: { present: Boolean(present), trial: Boolean(trial) } });
    await reloadLesson(lesson.id);
  } catch (error) { fail(error); }
}

async function attendApi(childId, present) {
  const lesson = currentLesson();
  await putAttendance(childId, present, Boolean(lesson?.trialChildren?.[childId]));
}
async function toggleExtraAttendanceApi(childId, present) {
  const extra = currentLesson()?.extras.find((item) => item.childId === Number(childId));
  await putAttendance(childId, present, Boolean(extra?.trial));
}
async function toggleTrialApi(childId, trial, isExtra) {
  const lesson = currentLesson();
  const present = isExtra ? lesson?.extras.find((item) => item.childId === Number(childId))?.present : lesson?.attendance?.[childId];
  await putAttendance(childId, Boolean(present), trial);
}

async function addExtraApi(childId) {
  const lesson = currentLesson(); if (!lesson) return;
  try { await api.request(`/lessons/${lesson.id}/extras`, { method: 'POST', body: { childId: Number(childId) } }); await reloadLesson(lesson.id, 'teacherLesson'); }
  catch (error) { fail(error); }
}
async function removeExtraApi(childId) {
  const lesson = currentLesson(); if (!lesson) return;
  try { await api.request(`/lessons/${lesson.id}/extras/${Number(childId)}`, { method: 'DELETE' }); await reloadLesson(lesson.id, 'teacherLesson'); }
  catch (error) { fail(error); }
}

async function saveQuickChildApi() {
  const lesson = currentLesson(); if (!lesson) return;
  const name = value('#tqc-name').trim(); const phone = value('#tqc-phone').trim();
  if (!name) return window.alert('Укажите фамилию и имя ребёнка.');
  try { await api.request(`/lessons/${lesson.id}/quick-child`, { method: 'POST', body: { name, phone: phone || null } }); await reloadLesson(lesson.id, 'teacherLesson'); }
  catch (error) { fail(error); }
}

async function confirmTeacherCreatedChildApi(childId) {
  try {
    await api.update('children', childId, { needsDirectorReview: false });
    legacy.state.selectedChild = Number(childId); legacy.state.page = 'child'; await reload();
  } catch (error) { fail(error); }
}

async function finishLessonApi() {
  const lesson = currentLesson(); if (!lesson) return;
  const present = Object.entries(lesson.attendance ?? {}).filter(([, value]) => value).map(([id]) => Number(id))
    .concat(lesson.extras.filter((extra) => extra.present).map((extra) => extra.childId));
  if (!lesson.emptyTrip && present.length === 0) {
    legacy.state.modal = `<h3>Нет присутствующих</h3><div class="notice">Обычное или ознакомительное занятие нельзя завершить без присутствующих детей. Отмените занятие${legacy.state.role === 'director' ? ' или оформите «Пустой выезд»' : ''}.</div><div class="modal-actions"><button class="btn" onclick="closeModal()">Вернуться</button><button class="btn danger" onclick="icubeApi.cancelCurrentLesson()">Отменить занятие</button>${legacy.state.role === 'director' ? '<button class="btn primary" onclick="icubeApi.markCurrentLessonEmptyTrip()">Пустой выезд</button>' : ''}</div>`;
    legacy.render(); return;
  }
  const missing = present.filter((id) => !lesson.photos?.[id]).length;
  if (missing) {
    legacy.state.modal = `<h3>Не у всех есть фотографии</h3><div class="notice">У ${missing} детей отсутствуют фотографии. Всё равно завершить занятие?</div><div class="modal-actions"><button class="btn" onclick="closeModal()">Вернуться</button><button class="btn primary" onclick="icubeApi.confirmFinishLesson()">Завершить всё равно</button></div>`;
    legacy.render(); return;
  }
  await confirmFinishLessonApi();
}
async function cancelCurrentLessonApi() { await lessonCommand('cancel', {}, legacy.state.role === 'teacher' ? 'teacherLesson' : 'lesson'); }
async function markCurrentLessonEmptyTripApi() { await lessonCommand('empty-trip', {}, 'lesson'); }

async function confirmAddChildrenApi() {
  const group = legacy.state.groups.find((item) => item.id === Number(legacy.state.addChildrenGroupId));
  if (!group) return;
  const childIds = Array.from(document.querySelectorAll('.ac-check:checked')).map((input) => Number(input.value));
  const enrollments = childIds.map((childId) => legacy.state.children.find((child) => child.id === childId)?.enrollments.find((enrollment) => enrollment.direction === group.direction)).filter(Boolean);
  try {
    await Promise.all(enrollments.map((enrollment) => api.updateEnrollment(enrollment.id, { groupId: group.id })));
    await reload({ render: false });
    legacy.state.selectedGroup = group.id; legacy.state.modal = null; legacy.state.page = 'group'; legacy.render();
  } catch (error) { fail(error); }
}

async function deleteLessonApi(lessonId) {
  try {
    await api.delete('lessons', lessonId); await reload({ render: false });
    legacy.state.selectedLesson = null; legacy.state.modal = null; legacy.state.page = 'calendar'; legacy.render();
  } catch (error) { fail(error); }
}
async function confirmFinishLessonApi() {
  const lesson = currentLesson(); if (!lesson) return;
  const topic = lesson.topic ?? '';
  try {
    if (topic) await api.update('lessons', lesson.id, { topic });
    await api.request(`/lessons/${lesson.id}/finish`, { method: 'POST', body: {} });
    await reloadLesson(lesson.id, 'teacherLesson');
  } catch (error) { fail(error); }
}

async function saveLessonEditApi(lessonId, role) {
  const lesson = legacy.state.lessons.find((item) => item.id === Number(lessonId)); if (!lesson) return;
  try {
    if (value('#le-cancel') === 'cancelled') await api.request(`/lessons/${lesson.id}/cancel`, { method: 'POST', body: {} });
    else {
      const body = { date: value('#le-date'), startTime: value('#le-start'), endTime: value('#le-end'), actualTeacherId: value('#le-teacher') };
      if (role !== 'teacher') body.siteId = value('#le-site') || null;
      await api.update('lessons', lesson.id, body);
    }
    await reloadLesson(lesson.id, role === 'teacher' ? 'teacherLesson' : 'lesson');
  } catch (error) { fail(error); }
}

async function lessonToggleApi(key, enabled) {
  const lesson = currentLesson(); if (!lesson) return;
  try {
    if (key === 'emptyTrip' && enabled) await api.request(`/lessons/${lesson.id}/empty-trip`, { method: 'POST', body: {} });
    else if (key === 'emptyTrip') return window.alert('Пустой выезд уже зафиксирован. Для исправления обратитесь к разработчику.');
    else await api.update('lessons', lesson.id, { introGroup: Boolean(enabled) });
    await reloadLesson(lesson.id, 'lesson');
  } catch (error) { fail(error); }
}

async function deleteVisitApi(childId, lessonId) {
  const lesson = legacy.state.lessons.find((item) => item.id === Number(lessonId)); if (!lesson) return;
  try {
    await api.request(`/lessons/${lesson.id}/attendance/${Number(childId)}`, { method: 'DELETE' });
    await reload({ render: false });
    legacy.state.selectedChild = Number(childId); legacy.state.childTab = 'visits'; legacy.state.modal = null; legacy.state.page = 'child'; legacy.render();
  } catch (error) { fail(error); }
}

function salaryCalculationApi(lesson) {
  const salary = lesson?.salaryAccrual;
  if (!salary) return { type: 'Не начисляется', children: 0, fixed: 0, childrenPay: 0, total: 0, rates: {} };
  return { type: salary.type === 'empty_trip' ? 'Пустой выезд' : salary.type === 'intro' ? 'Ознакомительное занятие' : 'Обычное занятие',
    children: salary.presentChildren, fixed: Number(salary.fixedAmount), childrenPay: Number(salary.childrenAmount), total: Number(salary.totalAmount), rates: {} };
}
const deleteChildPaymentPrompt = (_childId, paymentId) => deletePaymentPrompt(paymentId);
const confirmDeleteChildPayment = (_childId, paymentId) => deletePayment(paymentId);

function deleteChildPrompt(childId) {
  const child = legacy.state.children.find((item) => item.id === Number(childId));
  if (!child) return;
  const safeName = String(child.name).replace(/[&<>"']/g, (symbol) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[symbol]);
  legacy.state.modal = `<h3>Удалить ребёнка?</h3><div class="notice">Сервер проверит оплаты, возвраты и посещения у <b>${safeName}</b>. При наличии истории удаление будет запрещено.</div><div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn danger" onclick="icubeApi.deleteChild(${Number(childId)})">Удалить ребёнка</button></div>`;
  legacy.render();
}

function directoryItem(resource, resourceId) {
  const key = resource === 'sites' ? 'sites' : resource === 'teachers' ? 'teachers' : 'groups';
  return legacy.state[key].find((item) => item.id === Number(resourceId));
}

async function deleteDirectoryEntity(resource, resourceId, label) {
  const item = directoryItem(resource, resourceId);
  if (!item) return;
  if (!window.confirm(`Удалить ${label} «${item.name}»? Это действие нельзя отменить.`)) return;
  try {
    await api.delete(resource, resourceId);
    legacy.state.modal = null;
    if (resource === 'groups') legacy.state.selectedGroup = null;
    legacy.state.page = resource;
    await reload();
  } catch (error) { fail(error); }
}

function installDeleteButton(formName, resource, label) {
  const original = window[formName];
  if (typeof original !== 'function') return;
  window[formName] = function (...args) {
    const result = original.apply(this, args);
    const resourceId = args[0];
    if (!resourceId) return result;
    queueMicrotask(() => {
      const actions = document.querySelector('.modal-actions');
      if (!actions || actions.querySelector(`[data-delete-resource="${resource}"]`)) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn danger';
      button.dataset.deleteResource = resource;
      button.textContent = 'Удалить';
      button.addEventListener('click', () => deleteDirectoryEntity(resource, resourceId, label));
      actions.prepend(button);
    });
    return result;
  };
}

function installDeletionUi() {
  installDeleteButton('siteForm', 'sites', 'площадку');
  installDeleteButton('teacherForm', 'teachers', 'преподавателя');
  installDeleteButton('groupForm', 'groups', 'группу');
  const originalSites = window.sites;
  if (typeof originalSites === 'function') {
    window.sites = function (...args) {
      return originalSites.apply(this, args).replace('Площадки не удаляются: неиспользуемую площадку можно сделать неактивной.', 'Пустую площадку можно удалить; используемую — сделать неактивной.');
    };
  }
}

function installPersistentCalendarBridge() {
  const generatedEvents = window.sharedCalendarEvents;
  if (typeof generatedEvents !== 'function') return;
  const parseRuDate = (value) => {
    const [day, month, year] = String(value ?? '').split('.').map(Number);
    return new Date(year, (month || 1) - 1, day || 1);
  };
  const timeStart = (value) => String(value ?? '').split('–')[0];
  window.sharedCalendarEvents = function (startDate, endDate, teacherId) {
    const events = generatedEvents.apply(this, arguments);
    const start = new Date(startDate); const end = new Date(endDate);
    for (const lesson of legacy.state.lessons ?? []) {
      const actual = parseRuDate(lesson.date);
      if (actual < start || actual > end) continue;
      if (teacherId && Number(lesson.teacherId) !== Number(teacherId)) continue;
      const group = legacy.state.groups.find((item) => item.id === Number(lesson.groupId));
      if (!group && !lesson.readOnly) continue;
      const persisted = {
        key: lesson.occurrenceKey, groupId: lesson.groupId, groupName: group?.name ?? lesson.groupName,
        project: group?.project ?? lesson.project, teacherId: lesson.teacherId,
        scheduledDate: lesson.scheduledDate, scheduledTime: lesson.scheduledTime, date: lesson.date, time: lesson.time,
        lesson, cancelled: lesson.cancelled, moved: lesson.moved, done: lesson.done,
      };
      const existing = events.findIndex((event) => event.lesson && Number(event.lesson.id) === Number(lesson.id));
      if (existing >= 0) events[existing] = persisted;
      else events.push(persisted);
    }
    return events.sort((left, right) => parseRuDate(left.date) - parseRuDate(right.date) || timeStart(left.time).localeCompare(timeStart(right.time)));
  };
}

function installPersistentNotificationUi() {
  const dashboard = window.dashboard;
  if (typeof dashboard !== 'function') return;
  window.dashboard = function (...args) {
    const base = dashboard.apply(this, args);
    const notifications = (legacy.state.notifications ?? []).filter((item) => item.type === 'quick_child_deleted');
    if (legacy.state.role !== 'director' || !notifications.length) return base;
    const rows = notifications.map((item) => `<div class="kpi-line"><div><b>${html(item.title)}</b><div class="muted mini">${html(item.body)}</div></div></div>`).join('');
    const block = `<div class="card pad" style="margin-bottom:16px;border-color:#fedf89;background:#fffdf5"><div class="section-title"><div><h2>Изменения преподавателей</h2><div class="muted mini">Сохранено на сервере</div></div><span class="badge amber">${notifications.length}</span></div>${rows}</div>`;
    const headEnd = base.indexOf('</div>') + 6;
    return headEnd > 5 ? `${base.slice(0, headEnd)}${block}${base.slice(headEnd)}` : `${block}${base}`;
  };
}

function showLogin(message = '') {
  authProfile = null;
  legacy.state.authUser = null;
  const app = element('#app');
  if (!app) return;
  app.style.visibility = 'visible';
  app.innerHTML = `<div style="min-height:100vh;display:grid;place-items:center;padding:20px;background:#f8fafc"><form class="card pad" style="width:min(100%,420px)" onsubmit="event.preventDefault();icubeAuthLogin()">
    <div class="brand" style="color:#111827;margin-bottom:22px"><div class="brand-mark">iC</div><div>iCube CRM</div></div>
    <h1 style="margin:0 0 6px">Вход</h1><div class="muted" style="margin-bottom:18px">Введите логин и пароль</div>
    ${message ? `<div class="notice" style="margin-bottom:14px">${html(message)}</div>` : ''}
    <div class="field"><label>Логин</label><input class="input" id="auth-login" type="email" autocomplete="username" required></div>
    <div class="field" style="margin-top:12px"><label>Пароль</label><input class="input" id="auth-password" type="password" autocomplete="current-password" required></div>
    <button class="btn primary" id="auth-submit" type="submit" style="width:100%;margin-top:18px">Войти</button>
  </form></div>`;
}

function applyAuthProfile(profile) {
  authProfile = profile;
  legacy.state.authUser = profile;
  const director = profile.roles.includes('director');
  const partner = !director && profile.roles.includes('partner');
  legacy.state.role = director ? 'director' : partner ? 'partner' : 'teacher';
  legacy.state.page = director || partner ? 'dashboard' : 'teacherToday';
  if (partner) { legacy.state.calendarProject = 'Зебра'; legacy.state.balanceProject = 'Зебра'; }
  if (profile.teacherId) legacy.state.prototypeTeacherId = Number(profile.teacherId);
  const app = element('#app');
  if (app) app.style.visibility = 'visible';
}

async function loginFromForm() {
  const submit = element('#auth-submit');
  if (submit) submit.disabled = true;
  try {
    const profile = await api.request('/auth/login', { method: 'POST', body: { login: value('#auth-login'), password: value('#auth-password') } });
    applyAuthProfile(profile);
    await reload();
    resolveAuthReady?.(profile);
    resolveAuthReady = null;
    return profile;
  } catch (error) {
    showLogin(error instanceof ApiError ? error.message : 'Не удалось войти');
    return null;
  }
}

async function logout() {
  try { await api.request('/auth/logout', { method: 'POST' }); }
  catch (error) { if (!(error instanceof ApiError) || error.status !== 401) console.error(error); }
  showLogin();
}

function temporaryTeacherParentRole() {
  if (authProfile?.roles?.includes('director')) return 'director';
  if (authProfile?.roles?.includes('partner')) return 'partner';
  return null;
}

function returnFromTemporaryTeacherView() {
  const parentRole = temporaryTeacherParentRole();
  if (!parentRole) return;
  legacy.state.role = parentRole;
  legacy.state.page = 'dashboard';
  legacy.state.modal = null;
  legacy.render();
}

function teacherNameForShell() {
  if (!temporaryTeacherParentRole()) return authProfile?.displayName ?? 'Преподаватель';
  const lesson = legacy.state.lessons?.find((item) => item.id === Number(legacy.state.selectedLesson));
  return legacy.state.teachers?.find((item) => item.id === Number(lesson?.teacherId))?.name ?? 'Интерфейс преподавателя';
}

function installAuthenticatedShells() {
  const originalShell = window.shell;
  if (typeof originalShell === 'function') {
    window.shell = function (...args) {
      const result = originalShell.apply(this, args);
      if (!authProfile) return result;
      const roleLabel = authProfile.roles.includes('director') ? 'Директор' : 'Партнёр';
      const account = `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:flex-end"><div><b>${html(authProfile.displayName)}</b><div class="muted mini">${roleLabel}</div></div><button class="btn" onclick="icubeAuthLogout()">Выйти</button></div>`;
      return result.replace(/<div><select class="role-switch"[\s\S]*?<\/select><div class="muted mini">Режим прототипа<\/div><\/div>/, account);
    };
  }
  window.teacherShell = function (content) {
    const parentRole = temporaryTeacherParentRole();
    const right = parentRole
      ? '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end"><button class="btn" onclick="icubeReturnToHome()">Вернуться на главную</button><button class="btn" onclick="icubeAuthLogout()">Выйти</button></div>'
      : '<button class="btn" onclick="icubeAuthLogout()">Выйти</button>';
    return `<div class="teacher-shell"><div class="teacher-top"><div class="teacher-top-inner"><div><div class="mini" style="color:#98a2b3">iCube CRM · преподаватель</div><b>${html(teacherNameForShell())}</b></div><div>${right}</div></div>
      <div style="max-width:680px;margin:14px auto 0;display:flex;gap:8px"><button class="btn ${legacy.state.page === 'teacherToday' ? 'soft' : ''}" onclick="state.page='teacherToday';render()">Сегодня</button><button class="btn ${legacy.state.page === 'teacherCalendar' ? 'soft' : ''}" onclick="state.page='teacherCalendar';render()">Календарь</button></div></div>
      <div class="teacher-content">${content}</div></div>`;
  };
  const originalOpenLesson = window.openLesson;
  if (typeof originalOpenLesson === 'function') {
    window.openLesson = function (lessonId, teacherMode) {
      if (teacherMode && temporaryTeacherParentRole()) {
        const lesson = legacy.state.lessons?.find((item) => item.id === Number(lessonId));
        if (lesson?.teacherId) legacy.state.prototypeTeacherId = Number(lesson.teacherId);
      }
      return originalOpenLesson.apply(this, arguments);
    };
  }
}

function accessBlock(teacherId) {
  const teacher = legacy.state.teachers.find((item) => item.id === Number(teacherId));
  const access = teacher?.access;
  if (!access) return `<div class="field span-2" style="border-top:1px solid var(--line);padding-top:14px"><label>Доступ в CRM</label>
    <input class="input" id="teacher-access-login" type="email" autocomplete="off" placeholder="teacher@example.com">
    <input class="input" id="teacher-access-password" type="password" autocomplete="new-password" placeholder="Новый пароль" style="margin-top:8px">
    <button class="btn soft" type="button" style="margin-top:8px" onclick="icubeCreateTeacherAccess(${teacherId})">Создать доступ</button></div>`;
  const active = access.status === 'active';
  return `<div class="field span-2" style="border-top:1px solid var(--line);padding-top:14px"><label>Доступ в CRM</label>
    <div class="info-line"><span>Логин</span><b>${html(access.login)}</b></div><div class="info-line"><span>Статус</span><b>${active ? 'Активен' : 'Отключён'}</b></div>
    ${active ? `<input class="input" id="teacher-access-password" type="password" autocomplete="new-password" placeholder="Новый пароль" style="margin-top:8px">
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button class="btn soft" type="button" onclick="icubeResetTeacherPassword(${teacherId})">Сбросить пароль</button><button class="btn danger" type="button" onclick="icubeDisableTeacherAccess(${teacherId})">Отключить доступ</button></div>`
      : `<input class="input" id="teacher-access-login" type="email" autocomplete="off" value="${html(access.login)}" style="margin-top:8px"><input class="input" id="teacher-access-password" type="password" autocomplete="new-password" placeholder="Новый пароль" style="margin-top:8px"><button class="btn soft" type="button" style="margin-top:8px" onclick="icubeCreateTeacherAccess(${teacherId})">Включить с новым паролем</button>`}</div>`;
}

function installTeacherAccessUi() {
  const original = window.teacherForm;
  if (typeof original !== 'function') return;
  window.teacherForm = function (...args) {
    const result = original.apply(this, args); const teacherId = args[0];
    if (!teacherId || !legacy.state.modal) return result;
    legacy.state.modal = legacy.state.modal.replace('<div class="modal-actions">', `${accessBlock(teacherId)}<div class="modal-actions">`);
    legacy.render();
    return result;
  };
}

async function refreshTeacherAccess(teacherId, operation) {
  try {
    await operation();
    await reload({ render: false });
    window.teacherForm(Number(teacherId), false);
  } catch (error) { fail(error); }
}

async function createTeacherAccess(teacherId) {
  return refreshTeacherAccess(teacherId, () => api.request(`/teachers/${teacherId}/access`, { method: 'POST', body: { login: value('#teacher-access-login'), password: value('#teacher-access-password') } }));
}
async function resetTeacherPassword(teacherId) {
  return refreshTeacherAccess(teacherId, () => api.request(`/teachers/${teacherId}/access/reset-password`, { method: 'POST', body: { password: value('#teacher-access-password') } }));
}
async function disableTeacherAccess(teacherId) {
  if (!window.confirm('Отключить доступ преподавателя к CRM?')) return;
  return refreshTeacherAccess(teacherId, () => api.request(`/teachers/${teacherId}/access`, { method: 'DELETE' }));
}

async function bootstrapAuth() {
  try {
    const profile = await api.request('/auth/me');
    applyAuthProfile(profile);
    await reload();
    resolveAuthReady?.(profile);
    resolveAuthReady = null;
    return profile;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) showLogin();
    else showLogin('Не удалось проверить сессию. Обновите страницу.');
    return null;
  }
}

window.icubeApi = { saveSite, saveTeacher, saveGroup, saveChild, saveEnrollment, addEnrollment, deleteChild, deleteChildPrompt,
  projectTransferForm, confirmProjectTransfer,
  paymentForm, refreshPaymentDirections, updatePaymentPrice, updatePaymentCalc, savePayment, deletePaymentPrompt, deletePayment,
  refundForm, refreshRefundMaximum, saveRefund, deleteRefundPrompt, deleteRefund,
  deleteChildPaymentPrompt, confirmDeleteChildPayment, deleteDirectoryEntity, reload,
  openCalendarEvent, startLesson: startLessonApi, attend: attendApi, toggleExtraAttendance: toggleExtraAttendanceApi,
  toggleTrial: toggleTrialApi, addExtra: addExtraApi, removeExtra: removeExtraApi, saveQuickChild: saveQuickChildApi,
  confirmTeacherCreatedChild: confirmTeacherCreatedChildApi,
  finishLesson: finishLessonApi, confirmFinishLesson: confirmFinishLessonApi, saveLessonEdit: saveLessonEditApi,
  cancelCurrentLesson: cancelCurrentLessonApi, markCurrentLessonEmptyTrip: markCurrentLessonEmptyTripApi,
  confirmAddChildren: confirmAddChildrenApi, deleteLesson: deleteLessonApi,
  transferDirectionBalanceForm, refreshBalanceTransferPreview, confirmBalanceTransfer,
  cancelBalanceTransferPrompt, cancelBalanceTransfer, loadStatistics,
  calculatePartnerSettlement,
  lessonToggle: lessonToggleApi, deleteVisit: deleteVisitApi, salaryCalculation: salaryCalculationApi };
window.saveSite = window.icubeApi.saveSite;
window.saveTeacher = window.icubeApi.saveTeacher;
window.saveGroupV111 = window.icubeApi.saveGroup;
window.saveChildV111 = window.icubeApi.saveChild;
window.saveManagedDirection = window.icubeApi.saveEnrollment;
window.saveAddedDirectionV132 = window.icubeApi.addEnrollment;
window.deleteChildPrompt = window.icubeApi.deleteChildPrompt;
window.confirmDeleteChild = window.icubeApi.deleteChild;
window.paymentForm = window.icubeApi.paymentForm;
window.refreshPaymentDirections = window.icubeApi.refreshPaymentDirections;
window.updatePaymentCalc = window.icubeApi.updatePaymentCalc;
window.savePaymentV116 = window.icubeApi.savePayment;
window.editPayment = (paymentId) => window.icubeApi.paymentForm(null, null, paymentId);
window.deletePayment = window.icubeApi.deletePaymentPrompt;
window.confirmDeletePayment = window.icubeApi.deletePayment;
window.newChildPayment = (childId, direction) => window.icubeApi.paymentForm(childId, direction, null);
window.editChildPayment = (_childId, paymentId) => window.icubeApi.paymentForm(null, null, paymentId);
window.deleteChildPayment = window.icubeApi.deleteChildPaymentPrompt;
window.confirmDeleteChildPayment = window.icubeApi.confirmDeleteChildPayment;
window.refundForm = () => window.icubeApi.refundForm();
window.refundFormForChild = (childId) => window.icubeApi.refundForm(null, childId);
window.refundPayment = (paymentId) => window.icubeApi.refundForm(paymentId);
window.saveRefund = window.icubeApi.saveRefund;
window.saveRefundForChild = window.icubeApi.saveRefund;
window.deleteRefund = window.icubeApi.deleteRefundPrompt;
window.confirmDeleteRefund = window.icubeApi.deleteRefund;
window.openUnifiedCalendarEvent = window.icubeApi.openCalendarEvent;
window.startLesson = window.icubeApi.startLesson;
window.attend = window.icubeApi.attend;
window.toggleExtraAttendanceV138 = window.icubeApi.toggleExtraAttendance;
window.toggleVisitTrialV121 = window.icubeApi.toggleTrial;
window.forceVisitTrialV121 = window.icubeApi.toggleTrial;
window.addExtra = window.icubeApi.addExtra;
window.removeExtraFromLessonV138 = window.icubeApi.removeExtra;
window.saveTeacherQuickChild = window.icubeApi.saveQuickChild;
window.saveTeacherQuickChildV121 = window.icubeApi.saveQuickChild;
window.confirmTeacherCreatedChild = window.icubeApi.confirmTeacherCreatedChild;
window.finishLesson = window.icubeApi.finishLesson;
window.confirmFinish = window.icubeApi.confirmFinishLesson;
window.confirmAddChildren = window.icubeApi.confirmAddChildren;
window.deleteLessonConfirmed = window.icubeApi.deleteLesson;
window.transferDirectionBalanceFormV142 = window.icubeApi.transferDirectionBalanceForm;
window.refreshTransferPreviewV142 = window.icubeApi.refreshBalanceTransferPreview;
window.confirmTransferDirectionBalanceV142 = window.icubeApi.confirmBalanceTransfer;
window.child = childPageWithTransferHistory;
window.stats = statisticsPage;
window.applyStatsFiltersV125 = window.icubeApi.loadStatistics;
window.partner = partnerPage;
window.partnerSettlementPage = partnerSettlementPage;
window.applyPartnerFiltersV123 = window.icubeApi.calculatePartnerSettlement;
window.saveLessonEdit = window.icubeApi.saveLessonEdit;
window.lToggle = window.icubeApi.lessonToggle;
window.confirmDeleteVisitV121 = window.icubeApi.deleteVisit;
window.salaryCalculation = window.icubeApi.salaryCalculation;
window.icubeAuthLogin = loginFromForm;
window.icubeAuthLogout = logout;
window.icubeReturnToHome = returnFromTemporaryTeacherView;
window.icubeReturnToDirector = returnFromTemporaryTeacherView;
window.icubeCreateTeacherAccess = createTeacherAccess;
window.icubeResetTeacherPassword = resetTeacherPassword;
window.icubeDisableTeacherAccess = disableTeacherAccess;

installDeletionUi();
installPersistentCalendarBridge();
installPersistentNotificationUi();
installAuthenticatedShells();
installTeacherAccessUi();
if (element('#app')) {
  window.icubeAuthReady = new Promise((resolve) => { resolveAuthReady = resolve; });
  bootstrapAuth();
} else window.icubeAuthReady = Promise.resolve(null);

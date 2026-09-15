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

function element(selector) { return document.querySelector(selector); }
function value(selector) { return element(selector)?.value ?? ''; }
function checked(selector) { return Boolean(element(selector)?.checked); }
function byName(items, name) { return items.find((item) => item.name === name || item.code === name); }
function fail(error) {
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
      direction: enrollment.directionName, groupId: enrollment.groupId == null ? null : Number(enrollment.groupId), status: enrollmentStatusFromApi[enrollment.status] ?? enrollment.status,
      individualPrice: enrollment.individualPrice == null ? null : Number(enrollment.individualPrice), currentPrice: enrollment.currentPrice == null ? null : Number(enrollment.currentPrice),
      balance: Number(enrollment.balanceLessons) })) };
}

function mapLesson(lesson) {
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
    plannedTeacherId: Number(lesson.plannedTeacherId), scheduledDate, scheduledTime, occurrenceKey: `${Number(lesson.groupId)}|${scheduledDate}`,
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
  const [projects, directions, sites, teachers, groups, children, payments, lessons, notifications] = await Promise.all([
    api.list('projects'), api.list('directions'), api.list('sites'), api.list('teachers'), api.list('groups'), api.list('children'), api.list('payments'), api.list('lessons'), api.list('notifications').catch(() => []),
  ]);
  directories = { projects, directions };
  legacy.state.sites = sites.map((site) => ({ ...site, id: Number(site.id) }));
  legacy.state.teachers = teachers.map((teacher) => ({ ...teacher, id: Number(teacher.id), directions: teacher.directions.map((direction) => direction.name) }));
  legacy.state.groups = groups.map(mapGroup);
  legacy.state.children = children.map(mapChild);
  legacy.state.payments = payments.map((payment) => ({
    id: Number(payment.id), enrollmentId: Number(payment.enrollmentId), childId: Number(payment.childId),
    direction: payment.directionName, amount: Number(payment.amount), price: Number(payment.priceSnapshot),
    lessons: Number(payment.lessonsCredit), date: isoToRu(payment.paidOn), paidOn: payment.paidOn,
    method: paymentMethodLabel[payment.method] ?? payment.method, methodCode: payment.method,
    groupId: payment.groupId == null ? null : Number(payment.groupId), projectId: payment.projectId == null ? null : Number(payment.projectId),
  }));
  const localPhotos = new Map((legacy.state.lessons ?? []).map((lesson) => [Number(lesson.id), lesson.photos ?? {}]));
  legacy.state.lessons = lessons.map(mapLesson).map((lesson) => ({ ...lesson, photos: localPhotos.get(lesson.id) ?? {} }));
  legacy.state.notifications = notifications;
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

function paymentEnrollment(childId, enrollmentId) {
  return legacy.state.children.find((child) => child.id === Number(childId))?.enrollments.find((enrollment) => enrollment.id === Number(enrollmentId));
}

function paymentForm(childId, direction, paymentId) {
  if (!legacy.state.children.length) return window.alert('Сначала создайте ребёнка.');
  const existing = paymentId ? legacy.state.payments.find((payment) => payment.id === Number(paymentId)) : null;
  const child = legacy.state.children.find((item) => item.id === Number(existing?.childId ?? childId)) ?? legacy.state.children[0];
  const preferred = existing?.enrollmentId ?? child.enrollments.find((enrollment) => enrollment.direction === direction)?.id ?? child.enrollments[0]?.id ?? null;
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  legacy.state.modal = `<h3>${existing ? 'Редактировать оплату' : 'Новая оплата'}</h3><div class="form-grid">
    <div class="field"><label>Дата</label><input class="input" id="pf-date" type="date" value="${html(existing?.paidOn ?? todayIso)}"></div>
    <div class="field"><label>Ребёнок</label><select class="select" id="pf-child" onchange="icubeApi.refreshPaymentDirections(${existing?.id ?? 'null'})">${legacy.state.children.map((item) => `<option value="${item.id}"${item.id === child.id ? ' selected' : ''}>${html(item.name)}</option>`).join('')}</select></div>
    <div class="field"><label>Направление</label><select class="select" id="pf-enrollment" onchange="icubeApi.updatePaymentPrice(${existing?.id ?? 'null'})"></select></div>
    <div class="field"><label>Сумма, ₽</label><input class="input" id="pf-amount" type="number" min="0.01" step="0.01" value="${html(existing?.amount ?? '4100')}" oninput="icubeApi.updatePaymentCalc()"></div>
    <div class="field"><label>Цена занятия, ₽</label><input class="input" id="pf-price" type="number" min="0.01" step="0.01" value="${html(existing?.price ?? '')}" ${existing ? '' : 'readonly'} data-price-edited="false" oninput="this.dataset.priceEdited='true';icubeApi.updatePaymentCalc()"></div>
    <div class="field"><label>Способ оплаты</label><select class="select" id="pf-method"><option value="cashless"${(existing?.methodCode ?? 'cashless') === 'cashless' ? ' selected' : ''}>Безналичный расчёт</option><option value="cash"${existing?.methodCode === 'cash' ? ' selected' : ''}>Наличные</option></select></div>
    </div><div class="notice" id="pf-calc" style="margin-top:14px"></div><div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn primary" onclick="icubeApi.savePayment(${existing?.id ?? 'null'})">${existing ? 'Сохранить изменения' : 'Сохранить оплату'}</button></div>`;
  legacy.render();
  setTimeout(() => refreshPaymentDirections(existing?.id ?? null, preferred), 0);
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
    legacy.state.selectedChild = Number(saved.childId); legacy.state.childTab = 'payments'; legacy.state.modal = null; legacy.state.page = 'child'; legacy.render();
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
    legacy.state.selectedChild = payment.childId; legacy.state.childTab = 'payments'; legacy.state.modal = null; legacy.state.page = 'child'; legacy.render();
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
    if (!lesson) return;
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
  const missing = present.filter((id) => !lesson.photos?.[id]).length;
  if (missing) {
    legacy.state.modal = `<h3>Не у всех есть фотографии</h3><div class="notice">У ${missing} детей отсутствуют фотографии. Всё равно завершить занятие?</div><div class="modal-actions"><button class="btn" onclick="closeModal()">Вернуться</button><button class="btn primary" onclick="icubeApi.confirmFinishLesson()">Завершить всё равно</button></div>`;
    legacy.render(); return;
  }
  await confirmFinishLessonApi();
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
    else await api.update('lessons', lesson.id, { date: value('#le-date'), startTime: value('#le-start'), endTime: value('#le-end'), actualTeacherId: value('#le-teacher') });
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
      if (!group) continue;
      const persisted = {
        key: lesson.occurrenceKey, groupId: lesson.groupId, project: group.project, teacherId: lesson.teacherId,
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

window.icubeApi = { saveSite, saveTeacher, saveGroup, saveChild, saveEnrollment, addEnrollment, deleteChild, deleteChildPrompt,
  paymentForm, refreshPaymentDirections, updatePaymentPrice, updatePaymentCalc, savePayment, deletePaymentPrompt, deletePayment,
  deleteChildPaymentPrompt, confirmDeleteChildPayment, deleteDirectoryEntity, reload,
  openCalendarEvent, startLesson: startLessonApi, attend: attendApi, toggleExtraAttendance: toggleExtraAttendanceApi,
  toggleTrial: toggleTrialApi, addExtra: addExtraApi, removeExtra: removeExtraApi, saveQuickChild: saveQuickChildApi,
  confirmTeacherCreatedChild: confirmTeacherCreatedChildApi,
  finishLesson: finishLessonApi, confirmFinishLesson: confirmFinishLessonApi, saveLessonEdit: saveLessonEditApi,
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
window.saveLessonEdit = window.icubeApi.saveLessonEdit;
window.lToggle = window.icubeApi.lessonToggle;
window.confirmDeleteVisitV121 = window.icubeApi.deleteVisit;
window.salaryCalculation = window.icubeApi.salaryCalculation;

installDeletionUi();
installPersistentCalendarBridge();
installPersistentNotificationUi();
reload().catch((error) => {
  console.error('Первичная загрузка CRM API не выполнена', error);
  legacy.state.sites = [];
  legacy.state.teachers = [];
  legacy.state.groups = [];
  legacy.state.children = [];
  legacy.state.payments = [];
  legacy.state.lessons = [];
  legacy.state.selectedChild = null;
  legacy.state.selectedGroup = null;
  legacy.state.page = 'children';
  legacy.render();
  window.alert('Не удалось загрузить справочники CRM с сервера. Обновите страницу после проверки API.');
});

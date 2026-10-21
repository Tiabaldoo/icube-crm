import { groupDisplayName, installAdvancedGroupUi } from './advanced-groups.mjs';
import { installScreenHistory, installLessonChildNavigation, preserveLessonTopic } from './screen-history.mjs';
import { installQuickStatusUi, logicalEnrollments, currentEnrollments } from './quick-status.mjs';
import { openReleaseNote } from './release-notes.mjs';
import { ApiClient, ApiError } from '../data/api-client.mjs';
import { createLessonActionQueue, createMemoryLessonActionStore } from '../data/lesson-action-queue.mjs';
import { businessDate, calendarMonthPeriod } from '../shared/business-time.mjs';
import {
  clearTeacherOfflineSnapshot, loadTeacherOfflineSnapshot, restoreTeacherOfflineSnapshot,
  saveTeacherOfflineSnapshot, teacherSnapshotMatchesProfile,
} from './offline-teacher-snapshot.mjs';

const legacy = window.icubeLegacy;
function displayGroup(groupId, fallback) {
  return groupDisplayName(legacy.state.groups.find((group) => String(group.id) === String(groupId)), fallback || 'Без группы');
}

const api = new ApiClient();
const dayNames = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
const dayShortNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const childStatusFromApi = { lead: 'Лид', active: 'Активный', paused: 'Пауза', finished: 'Закончил', archived: 'Закончил' };
const childStatusToApi = { 'Лид': 'lead', 'Активный': 'active', 'Пауза': 'paused', 'Закончил': 'finished' };
const enrollmentStatusFromApi = { lead: 'Лид', active: 'Активный', paused: 'Пауза', finished: 'Закончил' };
const enrollmentStatusToApi = { 'Лид': 'lead', 'Активный': 'active', 'Пауза': 'paused', 'Закончил': 'finished' };
let directories = { projects: [], directions: [] };
let groupSavePending = false;
let balanceTransferPending = false;
let balanceTransferKey = null;
let paymentSavePending = false;
let paymentCreateKey = null;
let paymentQuoteSequence = 0;
let refundSavePending = false;
let refundCreateKey = null;
let childSavePending = false;
let lessonActionPending = 0;
let childCreateKey = null;
let authProfile = null;
let resolveAuthReady = null;
let localChildSequence = 0;

const utcIsoDate = (date) => date.toISOString().slice(0, 10);
const businessParts = (now = new Date()) => businessDate(now).split('-').map(Number);

export function partnerDefaultPeriod(now = new Date()) {
  const [year, month] = businessParts(now);
  return { from: utcIsoDate(new Date(Date.UTC(year, month - 2, 26))), to: utcIsoDate(new Date(Date.UTC(year, month - 1, 25))) };
}
export function salaryDefaultPeriod(projectName, now = new Date()) {
  const name = String(projectName ?? '');
  const startDay = name === 'Зебра' ? 26 : (name === 'iCubeRobots' || name === 'iCube') ? 11 : null;
  if (startDay == null) return null;
  const [year, month, day] = businessParts(now); const monthIndex = month - 1;
  const currentOrPreviousMonth = day >= startDay ? monthIndex : monthIndex - 1;
  const start = new Date(Date.UTC(year, currentOrPreviousMonth, startDay));
  const end = new Date(Date.UTC(year, currentOrPreviousMonth + 1, startDay - 1));
  return { from: utcIsoDate(start), to: utcIsoDate(end) };
}
export function statisticsDefaultPeriod(now = new Date()) {
  return calendarMonthPeriod(now);
}
export function rentDefaultPeriod(now = new Date()) {
  return calendarMonthPeriod(now);
}
const initialPartnerPeriod = partnerDefaultPeriod();
legacy.state.partnerDateFrom ||= initialPartnerPeriod.from;
legacy.state.partnerDateTo ||= initialPartnerPeriod.to;
const initialStatisticsPeriod = statisticsDefaultPeriod();
legacy.state.statisticsDateFrom ||= initialStatisticsPeriod.from;
legacy.state.statisticsDateTo ||= initialStatisticsPeriod.to;
legacy.state.statisticsProjectId ||= 'all';
legacy.state.statisticsDirectionId ||= 'all';
legacy.state.statisticsChartFrom ||= calendarMonthPeriod(new Date(), -11).from;
legacy.state.statisticsChartTo ||= initialStatisticsPeriod.to;
legacy.state.statisticsGroupFrom ||= legacy.state.statisticsDateFrom;
legacy.state.statisticsGroupTo ||= legacy.state.statisticsDateTo;
const initialRentPeriod = rentDefaultPeriod();
legacy.state.rentSiteId ||= 'all';
legacy.state.rentDateFrom ||= initialRentPeriod.from;
legacy.state.rentDateTo ||= initialRentPeriod.to;
legacy.state.rentReport ??= null;
legacy.state.rentReportLoading = false;
legacy.state.rentReportError ??= null;
legacy.state.rentDetailsOpen = false;

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
const operationKey = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function mapGroup(group) {
  return { id: Number(group.id), name: group.name, partnerCalendarVisible: group.partnerCalendarVisible !== false, isIndividual: Boolean(group.isIndividual), packageLessonCount: group.packageLessonCount ?? 4, scheduleSlots: group.scheduleSlots ?? [], calculationMode: group.calculationMode ?? 'standard', teacherSharePercent: group.teacherSharePercent, partnerSharePercent: group.partnerSharePercent, customTaxEnabled: Boolean(group.customTaxEnabled), direction: group.isMixed ? 'Смешанная' : group.directionName, isMixed: Boolean(group.isMixed), directionId: Number(group.directionId), mixedPrices: group.mixedPrices ?? {}, siteId: Number(group.siteId), teacherId: Number(group.teacherId),
    day: dayNames[group.weekday - 1], startTime: group.startTime, endTime: group.endTime, time: `${group.startTime}–${group.endTime}`,
    project: group.projectName, projectId: Number(group.projectId), price: group.price == null ? null : Number(group.price), active: group.active,
    startDate: group.startsOn, endDate: group.endsOn };
}
function mapCalendarForeignGroup(group) {
  return { id: Number(group.id), directionId: Number(group.directionId), direction: group.directionName,
    isMixed: Boolean(group.isMixed), projectId: Number(group.projectId), project: group.projectName,
    siteId: Number(group.siteId), siteName: group.siteName, teacherId: Number(group.teacherId), teacherName: group.teacherName,
    day: dayNames[group.weekday - 1], startTime: group.startTime, endTime: group.endTime,
    scheduleSlots: group.scheduleSlots ?? [], startDate: group.startsOn, endDate: group.endsOn, active: group.active };
}
function mapChild(child) {
  const mapEnrollment = (enrollment) => ({ id: Number(enrollment.id), directionId: Number(enrollment.directionId),
      projectId: Number(enrollment.projectId), project: enrollment.projectName,
      editable: enrollment.editable !== false, direction: enrollment.directionName, groupId: enrollment.groupId == null ? null : Number(enrollment.groupId),
      groupName: enrollment.groupName ?? null, siteName: enrollment.siteName ?? null, weekday: enrollment.weekday ?? null, startTime: enrollment.startTime ?? null,
      groupStartedOn: enrollment.groupStartedOn ?? null,
      startedOn: enrollment.startedOn ?? null, endedOn: enrollment.endedOn ?? null,
      hasAttendance: enrollment.hasAttendance === true, groupHistory: enrollment.groupHistory ?? [],
      effectiveGroupId: enrollment.effectiveGroupId === undefined
        ? (enrollment.groupId == null ? null : Number(enrollment.groupId))
        : enrollment.effectiveGroupId == null ? null : Number(enrollment.effectiveGroupId),
      status: enrollmentStatusFromApi[enrollment.status] ?? enrollment.status,
      individualPrice: enrollment.individualPrice == null ? null : Number(enrollment.individualPrice), currentPrice: enrollment.currentPrice == null ? null : Number(enrollment.currentPrice),
      balanceText: enrollment.balanceLessons == null ? null : String(enrollment.balanceLessons),
      balance: enrollment.balanceLessons == null ? null : Number(enrollment.balanceLessons) });
  return { id: Number(child.id), name: child.name, birth: child.birthDate ?? '', school: child.school ?? '', grade: child.grade ?? '',
    parent: child.guardian?.name ?? '', phone: child.guardian?.phone ?? '', status: childStatusFromApi[child.status] ?? child.status,
    createdAt: child.createdAt ?? null, note: child.note ?? '', needsDirectorReview: child.needsDirectorReview,
    enrollments: child.enrollments.map(mapEnrollment), enrollmentHistory: (child.enrollmentHistory ?? []).map(mapEnrollment) };
}

function calendarOccurrenceKey(groupId, date, startTime) {
  const group = [...legacy.state.groups, ...(legacy.state.calendarForeignGroups ?? [])]
    .find((group) => Number(group.id) === Number(groupId));
  // Removed slots retain their identity after reload, including historical lessons and tombstones.
  const timed = group?.scheduleSlots?.length || (startTime && startTime !== group?.startTime);
  return `${Number(groupId)}|${date}${timed && startTime ? `|${startTime}` : ''}`;
}
function mapLesson(lesson) {
  if (lesson.readOnly) {
    const date = isoToRu(timestampDate(lesson.startsAt));
    return { id: Number(lesson.id), groupId: Number(lesson.groupId), isMixed: Boolean(lesson.isMixed), direction: lesson.directionName, groupName: lesson.groupName,
      projectId: Number(lesson.projectId), project: lesson.projectName,
      teacherId: Number(lesson.actualTeacherId ?? lesson.plannedTeacherId), teacherName: lesson.actualTeacherName ?? lesson.plannedTeacherName,
      siteId: Number(lesson.siteId), siteName: lesson.siteName, scheduledDate: isoToRu(timestampDate(lesson.scheduledStartsAt)),
      scheduledTime: `${timestampTime(lesson.scheduledStartsAt)}–${timestampTime(lesson.scheduledEndsAt)}`,
      date, time: `${timestampTime(lesson.startsAt)}–${timestampTime(lesson.endsAt)}`,
      occurrenceKey: calendarOccurrenceKey(lesson.groupId, isoToRu(timestampDate(lesson.scheduledStartsAt)), timestampTime(lesson.scheduledStartsAt)), readOnly: true,
      attendance: {}, extras: [], photos: [], status: lesson.status,
      done: lesson.status === 'completed', cancelled: lesson.status === 'cancelled',
      moved: lesson.startsAt !== lesson.scheduledStartsAt || lesson.endsAt !== lesson.scheduledEndsAt };
  }
  const main = lesson.attendances.filter((item) => item.type === 'main');
  const extras = lesson.roster.filter((item) => item.type === 'extra').map((member) =>
    lesson.attendances.find((item) => item.type === 'extra' && String(item.childId) === String(member.childId))
      ?? { childId: member.childId, enrollmentId: null, present: false, trial: false });
  const attendance = {}; const trialChildren = {};
  main.forEach((item) => { attendance[Number(item.childId)] = item.present; trialChildren[Number(item.childId)] = item.trial; });
  const scheduledDate = isoToRu(timestampDate(lesson.scheduledStartsAt));
  const scheduledTime = `${timestampTime(lesson.scheduledStartsAt)}–${timestampTime(lesson.scheduledEndsAt)}`;
  const date = isoToRu(timestampDate(lesson.startsAt)); const time = `${timestampTime(lesson.startsAt)}–${timestampTime(lesson.endsAt)}`;
  const status = lesson.status === 'completed' ? 'Проведено' : lesson.status === 'in_progress' ? 'Идёт' : lesson.status === 'cancelled' ? 'Отменено' : 'Запланировано';
  return {
    id: Number(lesson.id), groupId: Number(lesson.groupId), isMixed: Boolean(lesson.isMixed), directionId: Number(lesson.directionId), direction: lesson.directionName, projectId: lesson.projectId == null ? null : Number(lesson.projectId), project: lesson.projectName ?? '',
    teacherId: Number(lesson.actualTeacherId ?? lesson.plannedTeacherId),
    plannedTeacherId: Number(lesson.plannedTeacherId), siteId: Number(lesson.siteId), siteName: lesson.siteName ?? '',
    siteOverrideId: lesson.siteOverrideId == null ? null : Number(lesson.siteOverrideId), scheduledDate, scheduledTime, occurrenceKey: calendarOccurrenceKey(lesson.groupId, scheduledDate, timestampTime(lesson.scheduledStartsAt)),
    enrollmentByChild: Object.fromEntries(lesson.attendances.map((item) => [Number(item.childId), Number(item.enrollmentId)])),
    attendanceDetailsByChild: Object.fromEntries(lesson.attendances.map((item) => [Number(item.childId), { ...item }])),
    date, time, status, topic: lesson.topic ?? '', syncedTopic: lesson.topic ?? '', attendance, trialChildren,
    extras: extras.map((item) => ({ childId: Number(item.childId), enrollmentId: Number(item.enrollmentId), trial: item.trial, present: item.present })),
    photos: {}, started: ['in_progress', 'completed'].includes(lesson.status), done: lesson.status === 'completed', cancelled: lesson.status === 'cancelled',
    moved: date !== scheduledDate || time !== scheduledTime, intro: lesson.introGroup, emptyTrip: lesson.emptyTrip,
    attendanceApplied: Boolean(lesson.attendanceAppliedAt), groupChildIdsV146: lesson.roster.filter((item) => item.type === 'main').map((item) => Number(item.childId)),
    effectiveGroupChildIds: (lesson.effectiveRoster ?? []).filter((item) => item.type === 'main').map((item) => Number(item.childId)),
    groupRosterFrozenV146: Boolean(lesson.rosterFrozenAt), groupRosterFrozenAtV146: lesson.rosterFrozenAt,
    absenceNoticeChildIds: (lesson.absenceNoticeChildIds ?? []).map(Number), birthdayChildIds: (lesson.birthdayChildIds ?? []).map(Number),
    salaryAccrual: lesson.salary ?? null,
  };
}

const salaryTypeLabel = {
  regular: 'Обычное занятие',
  intro: 'Ознакомительное занятие',
  empty_trip: 'Пустой выезд',
  attendance_share: 'Долевой расчёт',
};

function decimalCents(value) {
  const match = String(value ?? '0').trim().match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return 0n;
  return BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
}

function mapSalaryReportRow(row) {
  const date = isoToRu(timestampDate(row.startsAt));
  const startTime = timestampTime(row.startsAt);
  const endTime = row.endsAt ? timestampTime(row.endsAt) : '';
  const time = endTime ? `${startTime}–${endTime}` : startTime;
  const type = salaryTypeLabel[row.type] ?? row.type;
  const fixedAmount = String(row.fixedAmount ?? '0.00');
  const childrenAmount = String(row.childrenAmount ?? '0.00');
  const totalAmount = String(row.totalAmount ?? '0.00');
  return {
    id: Number(row.id), lessonId: Number(row.lessonId), teacherId: Number(row.teacherId),
    rateVersionId: row.rateVersionId == null ? null : Number(row.rateVersionId),
    projectId: Number(row.projectId), projectName: row.projectName ?? '',
    siteId: Number(row.siteId), siteName: row.siteName ?? '',
    groupId: Number(row.groupId), groupName: row.groupName ?? 'Группа',
    startsAt: row.startsAt, endsAt: row.endsAt ?? null, date, time,
    fixedAmount, childrenAmount, totalAmount, presentChildren: Number(row.presentChildren ?? 0), typeCode: row.type,
    lesson: {
      id: Number(row.lessonId), date, time, groupId: Number(row.groupId), groupName: row.groupName ?? 'Группа',
      projectId: Number(row.projectId), project: row.projectName ?? '', projectName: row.projectName ?? '',
      siteId: Number(row.siteId), siteName: row.siteName ?? '',
    },
    group: {
      id: Number(row.groupId), name: row.groupName ?? 'Группа', projectId: Number(row.projectId),
      project: row.projectName ?? '', siteId: Number(row.siteId), siteName: row.siteName ?? '',
    },
    calc: {
      type, children: Number(row.presentChildren ?? 0),
      fixed: Number(fixedAmount), childrenPay: Number(childrenAmount), total: Number(totalAmount),
    },
  };
}

function salaryReportTotal(rows) {
  const cents = (rows ?? []).reduce((sum, row) => sum + decimalCents(row.totalAmount), 0n);
  return Number(cents) / 100;
}

function salaryAccountIsPartner() {
  return Boolean(authProfile?.roles?.includes('partner') && !authProfile?.roles?.includes('director'));
}

function salaryAccountIsDirector() {
  return Boolean(authProfile?.roles?.includes('director')) || (!authProfile && legacy.state.role === 'director');
}

function ensureSalaryTeacher() {
  const teachers = legacy.state.teachers ?? [];
  if (teachers.some((teacher) => String(teacher.id) === String(legacy.state.salaryTeacher))) return String(legacy.state.salaryTeacher);
  const teacher = teachers.find((item) => item.active !== false) ?? teachers[0] ?? null;
  legacy.state.salaryTeacher = teacher ? String(teacher.id) : '';
  return legacy.state.salaryTeacher;
}

function salaryReportQuery(filters) {
  const params = new URLSearchParams();
  params.set('teacherId', String(filters.teacherId));
  params.set('from', filters.from);
  params.set('to', filters.to);
  if (salaryAccountIsDirector() && String(filters.projectId ?? 'all') !== 'all') params.set('projectId', String(filters.projectId));
  return `?${params.toString()}`;
}

async function loadSalaryReport(filters, { commit = false, render = true } = {}) {
  const previousRows = legacy.state.salaryReportRows ?? [];
  const previousTotal = legacy.state.salaryReportTotal ?? salaryReportTotal(previousRows);
  legacy.state.salaryReportLoading = true;
  legacy.state.salaryReportError = null;
  if (render) legacy.render();
  try {
    const rows = await api.list('salary-accruals', salaryReportQuery(filters));
    const mapped = rows.map(mapSalaryReportRow);
    if (commit) {
      legacy.state.salaryTeacher = String(filters.teacherId);
      if (salaryAccountIsDirector()) legacy.state.salaryProjectId = String(filters.projectId ?? 'all');
      legacy.state.salaryDateFrom = filters.from;
      legacy.state.salaryDateTo = filters.to;
    }
    legacy.state.salaryReportRows = mapped;
    legacy.state.salaryReportTotal = salaryReportTotal(mapped);
    legacy.state.salaryReportError = null;
    return true;
  } catch (error) {
    legacy.state.salaryReportRows = previousRows;
    legacy.state.salaryReportTotal = previousTotal;
    legacy.state.salaryReportError = 'Не удалось загрузить зарплату за выбранный период. Попробуйте ещё раз.';
    console.error(error);
    return false;
  } finally {
    legacy.state.salaryReportLoading = false;
    if (render) legacy.render();
  }
}

async function refreshAppliedSalaryReport({ render = false } = {}) {
  const teacherId = ensureSalaryTeacher();
  if (!teacherId || !legacy.state.salaryDateFrom || !legacy.state.salaryDateTo) return false;
  return loadSalaryReport({
    teacherId,
    projectId: legacy.state.salaryProjectId ?? 'all',
    from: legacy.state.salaryDateFrom,
    to: legacy.state.salaryDateTo,
  }, { commit: true, render });
}

async function applySalaryFiltersApi() {
  if (legacy.state.salaryReportLoading) return;
  const teacherId = value('#salary-teacher');
  const projectId = salaryAccountIsDirector() ? (value('#salary-project') || 'all') : 'all';
  const from = value('#salary-from');
  const to = value('#salary-to');
  if (!/^[1-9]\d*$/.test(String(teacherId))) return window.alert('Выберите преподавателя');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return window.alert('Укажите период зарплаты');
  if (from > to) return window.alert('Дата начала периода должна быть не позже даты окончания');
  if (salaryAccountIsDirector() && projectId !== 'all' && !/^[1-9]\d*$/.test(String(projectId))) return window.alert('Выберите проект');
  await loadSalaryReport({ teacherId, projectId, from, to }, { commit: true, render: true });
}

function rentAccountIsDirector() {
  return Boolean(authProfile?.roles?.includes('director')) || (!authProfile && legacy.state.role === 'director');
}

function rentReportQuery(filters) {
  const params = new URLSearchParams();
  params.set('from', filters.from);
  params.set('to', filters.to);
  if (String(filters.siteId ?? 'all') !== 'all') params.set('siteId', String(filters.siteId));
  return `?${params.toString()}`;
}

async function loadRentReport(filters, { commit = false, render = true } = {}) {
  if (!rentAccountIsDirector() || legacy.state.rentReportLoading) return false;
  const previousReport = legacy.state.rentReport;
  const previousSiteId = legacy.state.rentSiteId;
  const previousFrom = legacy.state.rentDateFrom;
  const previousTo = legacy.state.rentDateTo;
  legacy.state.rentReportLoading = true;
  legacy.state.rentReportError = null;
  if (render) legacy.render();
  try {
    const report = await api.request(`/site-rent-report${rentReportQuery(filters)}`);
    if (commit) {
      legacy.state.rentSiteId = String(filters.siteId ?? 'all');
      legacy.state.rentDateFrom = filters.from;
      legacy.state.rentDateTo = filters.to;
    }
    legacy.state.rentReport = report;
    legacy.state.rentDetailsOpen = false;
    legacy.state.rentReportError = null;
    return true;
  } catch (error) {
    legacy.state.rentReport = previousReport;
    legacy.state.rentSiteId = previousSiteId;
    legacy.state.rentDateFrom = previousFrom;
    legacy.state.rentDateTo = previousTo;
    legacy.state.rentReportError = 'Не удалось рассчитать аренду за выбранный период. Попробуйте ещё раз.';
    console.error(error);
    return false;
  } finally {
    legacy.state.rentReportLoading = false;
    if (render) legacy.render();
  }
}

async function refreshAppliedRentReport({ render = false } = {}) {
  if (!rentAccountIsDirector()) return false;
  return loadRentReport({
    siteId: legacy.state.rentSiteId ?? 'all',
    from: legacy.state.rentDateFrom,
    to: legacy.state.rentDateTo,
  }, { commit: true, render });
}

async function calculateSiteRentReport() {
  if (!rentAccountIsDirector() || legacy.state.rentReportLoading) return;
  const siteId = value('#rent-site') || 'all';
  const from = value('#rent-from');
  const to = value('#rent-to');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return window.alert('Укажите период расчёта аренды');
  if (from > to) return window.alert('Дата начала периода должна быть не позже даты окончания');
  if (siteId !== 'all' && !/^[1-9]\d*$/.test(siteId)) return window.alert('Выберите площадку');
  await loadRentReport({ siteId, from, to }, { commit: true, render: true });
}

function toggleSiteRentDetails() {
  legacy.state.rentDetailsOpen = !legacy.state.rentDetailsOpen;
  legacy.render();
}

const lessonCountLabel = (count) => {
  const value = Number(count);
  const lastTwo = value % 100;
  const last = value % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return 'занятий';
  if (last === 1) return 'занятие';
  if (last >= 2 && last <= 4) return 'занятия';
  return 'занятий';
};

function rentPage() {
  if (legacy.state.role !== 'director') return '';
  const icubeProject = (legacy.state.projects ?? []).find((project) => project.code === 'icube-robots');
  const sites = (legacy.state.sites ?? [])
    .filter((site) => Number(site.projectId) === Number(icubeProject?.id))
    .slice().sort((left, right) => left.name.localeCompare(right.name, 'ru'));
  const report = legacy.state.rentReport;
  const siteOptions = ['<option value="all">Все площадки</option>'].concat(sites.map((site) =>
    `<option value="${site.id}"${String(site.id) === String(legacy.state.rentSiteId) ? ' selected' : ''}>${html(site.name)}${site.active === false ? ' · неактивна' : ''}</option>`
  )).join('');

  let output = `${legacy.pageHead('Расчёты аренды', 'Фактически проведённые занятия iCube и исторические ставки площадок.')}
    <div class="toolbar rent-toolbar">
      <div class="field"><label>Площадка</label><select class="select" id="rent-site">${siteOptions}</select></div>
      <div class="field"><label>Дата от</label><input class="input" id="rent-from" type="date" value="${html(legacy.state.rentDateFrom)}"></div>
      <div class="field"><label>Дата до</label><input class="input" id="rent-to" type="date" value="${html(legacy.state.rentDateTo)}"></div>
      <button class="btn primary" onclick="icubeApi.calculateSiteRentReport()"${legacy.state.rentReportLoading ? ' disabled' : ''}>${legacy.state.rentReportLoading ? 'Загрузка…' : 'Рассчитать'}</button>
    </div>`;

  if (legacy.state.rentReportError) output += `<div class="notice" style="margin-bottom:14px">${html(legacy.state.rentReportError)}</div>`;
  if (!report) {
    output += '<div class="card pad"><div class="empty">Расчёт аренды загружается.</div></div>';
    return output;
  }

  output += `<div class="muted rent-period">${isoToRu(report.period.from)} — ${isoToRu(report.period.to)}</div>`;
  if (!report.sites.length) {
    output += '<div class="card pad"><div class="empty">За выбранный период проведённых занятий для расчёта аренды нет.</div></div>';
  } else {
    output += '<div class="grid cols-2 rent-summary-grid">'+report.sites.map((site) =>
      `<div class="card pad rent-summary-card"><div><h3>${html(site.siteName)}</h3><div class="muted">${site.lessonCount} ${lessonCountLabel(site.lessonCount)}</div></div><b class="rent-summary-amount">${displayMoney(site.amount)}</b></div>`
    ).join('')+'</div>';
    if (Number(report.totalLessons) === 0) {
      output += '<div class="muted mini" style="margin-top:10px">За выбранный период на этой площадке проведённых занятий для расчёта аренды нет.</div>';
    }
  }

  output += `<div class="card pad rent-total-card"><div><div class="muted">Итого за период</div><b>${report.totalLessons} ${lessonCountLabel(report.totalLessons)}</b></div><b class="rent-total-amount">${displayMoney(report.totalAmount)}</b></div>`;

  if (report.details.length) {
    output += `<div style="margin-top:14px"><button class="btn" onclick="icubeApi.toggleSiteRentDetails()">${legacy.state.rentDetailsOpen ? 'Скрыть подробности' : 'Подробная сводка'}</button></div>`;
    if (legacy.state.rentDetailsOpen) {
      const grouped = report.details.reduce((map, detail) => {
        const key = String(detail.siteId);
        if (!map.has(key)) map.set(key, { name: detail.siteName, rows: [] });
        map.get(key).rows.push(detail);
        return map;
      }, new Map());
      output += '<div class="rent-details">';
      for (const group of [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'))) {
        output += `<div class="card pad rent-detail-group"><div class="section-title"><h2>${html(group.name)}</h2></div><div class="rent-detail-list">`;
        output += group.rows.map((detail) => {
          const time = detail.endsAt ? `${timestampTime(detail.startsAt)}–${timestampTime(detail.endsAt)}` : timestampTime(detail.startsAt);
          return `<div class="rent-detail-row"><div><b>${isoToRu(timestampDate(detail.startsAt))} · ${time}</b><div class="muted mini">${html(displayGroup(detail.groupId, detail.groupName))}</div><div class="muted mini">${html(detail.siteName)}</div></div><div class="rent-detail-side">${detail.introGroup ? '<span class="badge amber">Ознакомительное</span>' : ''}<b>${displayMoney(detail.rentRate)}</b></div></div>`;
        }).join('');
        output += '</div></div>';
      }
      output += '</div>';
    }
  }
  return output;
}

window.icubeRentPage = rentPage;

async function reload({ render = true } = {}) {
  if (authProfile?.roles?.includes('teacher') && !authProfile.roles.includes('director')) return reloadTeacher({ render });
  const partner = authProfile?.roles?.includes('partner') && !authProfile.roles.includes('director');
  const statisticsQuery = statisticsQueryString();
  const [projects, directions, sites, teachers, groups, calendarGroups, children, payments, refunds, lessons, lessonDeletions, notifications, balanceTransfers, statistics, dailySummary, venues] = await Promise.all([
    api.list('projects'), api.list('directions'), api.list('sites'), api.list('teachers'), api.list('groups'), partner ? api.list('calendar-groups') : Promise.resolve([]), api.list('children'), api.list('payments'), api.list('refunds'), api.list('lessons'), api.list('lesson-deletions'), api.list('notifications').catch(() => []),
    api.list('balance-transfers'), partner ? Promise.resolve(null) : api.list('statistics', statisticsQuery), api.request('/dashboard/daily'), api.list('sites/venues'),
  ]);
  directories = { projects, directions };
  legacy.state.directions = directions;
  legacy.state.projects = projects.map((project) => ({ ...project, id: Number(project.id) }));
  legacy.state.sites = sites.map((site) => ({ ...site, id: Number(site.id), projectId: Number(site.projectId) }));
  legacy.state.lessonVenues = venues.map((site) => ({ ...site, id: Number(site.id), active: Boolean(site.active) }));
  legacy.state.teachers = teachers.map((teacher) => ({ ...teacher, id: Number(teacher.id), projectIds: teacher.projectIds.map(Number),
    directions: teacher.directions.map((direction) => direction.name), projectSettings: (teacher.projectSettings ?? []).map((setting) => ({
      projectId: Number(setting.projectId), status: setting.status ?? (setting.active === false ? 'inactive' : 'active'), active: setting.active,
      directions: setting.directions.map((direction) => ({ ...direction, id: Number(direction.id) })),
    })) }));
  legacy.state.groups = groups.map(mapGroup);
  legacy.state.calendarForeignGroups = calendarGroups.map(mapCalendarForeignGroup);
  legacy.state.children = children.map(mapChild);
  legacy.state.payments = payments.map((payment) => ({
    id: Number(payment.id), enrollmentId: Number(payment.enrollmentId), childId: Number(payment.childId), childName: payment.childName,
    direction: payment.directionName, amount: Number(payment.amount), price: Number(payment.priceSnapshot),
    lessons: Number(payment.lessonsCredit), date: isoToRu(payment.paidOn), paidOn: payment.paidOn,
    method: paymentMethodLabel[payment.method] ?? payment.method, methodCode: payment.method,
    groupId: payment.groupId == null ? null : Number(payment.groupId), projectId: payment.projectId == null ? null : Number(payment.projectId),
    refundedAmount: Number(payment.refundedAmount), refundableAmount: Number(payment.refundableAmount),
    receiptIds: (payment.receiptIds ?? []).map(Number),
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
  if (statisticsAllowed() && statistics) {
    if (legacy.state.statisticsGroupsIndependent) await loadStatisticsGroups({ readControls: false });
    else acceptStatisticsGroups(statistics);
  }
  legacy.state.dailySummary = dailySummary;
  const previousLessons = new Map((legacy.state.lessons ?? []).map(lesson => [Number(lesson.id), lesson]));
  const localPhotos = new Map((legacy.state.lessons ?? []).map((lesson) => [Number(lesson.id), lesson.photos ?? {}]));
  legacy.state.lessons = lessons.map(mapLesson).map(lesson => preserveLessonTopic(previousLessons.get(lesson.id), {...lesson, photos:localPhotos.get(lesson.id) ?? {}}, authProfile?.id));
  await reapplyQueuedLessonState();
  legacy.state.deletedOccurrences = lessonDeletions.map((item) => calendarOccurrenceKey(item.groupId, isoToRu(item.scheduledDate), item.startTime));
  legacy.state.notifications = notifications;
  if (!legacy.state.children.some((child) => child.id === Number(legacy.state.selectedChild))) legacy.state.selectedChild = legacy.state.children[0]?.id ?? null;
  if (!legacy.state.groups.some((group) => group.id === Number(legacy.state.selectedGroup))) legacy.state.selectedGroup = legacy.state.groups[0]?.id ?? null;
  await refreshAppliedSalaryReport({ render: false });
  if (rentAccountIsDirector() && !partner) await refreshAppliedRentReport({ render: false });
  if (render) legacy.render();
}

async function reloadTeacher({ render = true } = {}) {
  const [groups, children, lessons, lessonDeletions, notifications] = await Promise.all([
    api.list('groups'), api.list('children'), api.list('lessons'), api.list('lesson-deletions'), api.list('notifications'),
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
  legacy.state.deletedOccurrences = lessonDeletions.map((item) => calendarOccurrenceKey(item.groupId, isoToRu(item.scheduledDate), item.startTime));
  legacy.state.notifications = notifications;
  legacy.state.prototypeTeacherId = Number(authProfile.teacherId);
  legacy.state.offlineBootstrap = false;
  await saveTeacherOfflineSnapshot(authProfile, legacy.state).catch((error) => console.error('Не удалось обновить offline snapshot преподавателя', error));
  await reapplyQueuedLessonState();
  if (render) legacy.render();
}

async function saveSite(resourceId, returnToGroup) {
  try {
    const name = value('#sf-name').trim();
    const body = { name, shortName: name, type: value('#sf-type'), address: value('#sf-address').trim(), note: value('#sf-note').trim(), active: value('#sf-active') === 'true', projectId: value('#sf-project') || undefined };
    if (!body.name) return window.alert('Укажите название площадки');
    const project = (legacy.state.projects ?? []).find((item) => String(item.id) === String(body.projectId));
    if (legacy.state.role === 'director' && project?.code === 'icube-robots' && element('#sf-rent')) {
      const rent = value('#sf-rent').trim();
      if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(rent)) return window.alert('Укажите корректную ставку аренды от 0 ₽ с точностью до копеек');
      body.rentPerLesson = rent;
    }
    const saved = resourceId ? await api.update('sites', resourceId, body) : await api.create('sites', body);
    await reload({ render: false });
    if (returnToGroup) { legacy.state.pendingGroupDraft = { ...(legacy.state.pendingGroupDraft ?? {}), siteId: saved.id }; window.groupForm(legacy.state.pendingGroupDraft.id, legacy.state.pendingGroupDraft); }
    else { legacy.state.modal = null; legacy.state.page = 'sites'; legacy.render(); }
  } catch (error) { fail(error); }
}

async function saveTeacher(resourceId, returnToGroup) {
  try {
    const projectSettings = [...document.querySelectorAll('[data-teacher-project]')].map((block) => {
      const projectId = String(block.dataset.teacherProject); const status = value(`#tf-project-status-${projectId}`);
      const names = status === 'none' ? [] : [...block.querySelectorAll('[data-teacher-direction]:checked')].map((input) => input.dataset.teacherDirection);
      const directionIds = names.map((name) => byName(directories.directions, name)?.id).filter(Boolean);
      return { projectId, status, directionIds, names };
    });
    const body = { name: value('#tf-name').trim(), phone: value('#tf-phone').trim(),
      projectSettings: projectSettings.map(({ names: _names, ...setting }) => setting) };
    if (!body.name) return window.alert('Укажите фамилию и имя преподавателя');
    if (projectSettings.some((setting) => setting.status !== 'none'
      && (setting.directionIds.length !== setting.names.length || !setting.names.length))) {
      return window.alert('Для активного или неактивного проекта выберите хотя бы одно направление');
    }
    if (resourceId && legacy.state.role === 'partner') {
      const teacher = legacy.state.teachers.find((item) => item.id === Number(resourceId));
      const removesExistingProject = projectSettings.some((setting) => {
        const previous = teacher?.projectSettings?.find((item) => String(item.projectId) === String(setting.projectId));
        const previousStatus = previous?.status ?? (previous ? (previous.active === false ? 'inactive' : 'active') : 'none');
        return previousStatus !== 'none' && setting.status === 'none';
      });
      if (removesExistingProject && !window.confirm('Преподаватель будет удалён из вашего проекта и исчезнет из списка преподавателей. Продолжить?')) return;
    }
    const saved = resourceId ? await api.update('teachers', resourceId, body) : await api.create('teachers', body);
    await reload({ render: false });
    if (returnToGroup) { legacy.state.pendingGroupDraft = { ...(legacy.state.pendingGroupDraft ?? {}), teacherId: saved.id }; window.groupForm(legacy.state.pendingGroupDraft.id, legacy.state.pendingGroupDraft); }
    else { legacy.state.modal = null; legacy.state.page = 'teachers'; legacy.render(); }
  } catch (error) { fail(error); }
}

function teacherProjectChanged(projectId) {
  const status = element(`#tf-project-status-${projectId}`); const directions = element(`#tf-project-directions-${projectId}`);
  if (directions) directions.hidden = status?.value === 'none';
}

async function deleteTeacher(teacherId) {
  if (!window.confirm('Удалить преподавателя? Это возможно только при отсутствии групп, занятий и другой истории.')) return;
  try {
    await api.delete('teachers', teacherId);
    await reload({ render: false });
    legacy.state.modal = null; legacy.state.page = 'teachers'; legacy.render();
  } catch (error) { fail(error); }
}

async function saveGroup(resourceId, { active } = {}) {
  if (groupSavePending) return;
  const submit = element('#gf-submit');
  groupSavePending = true;
  if (submit) submit.disabled = true;
  try {
    if (active === true && resourceId) {
      const saved = await api.update('groups', resourceId, { active: true, endsOn: null });
      legacy.state.selectedGroup = saved.id; legacy.state.modal = null; legacy.state.page = 'group'; await reload();
      return saved;
    }
    const isMixed = value('#gf-dir') === 'Смешанная';
    const currentGroup = legacy.state.groups.find((group) => Number(group.id) === Number(resourceId));
    const direction = isMixed ? directories.directions.find((item) => Number(item.id) === currentGroup?.directionId) ?? directories.directions[0] : byName(directories.directions, value('#gf-dir'));
    const project = byName(directories.projects, value('#gf-project'));
    const startsOn = value('#gf-start-date'); const isActive = value('#gf-active') === 'true'; const endsOn = value('#gf-end-date') || null;
    if (!direction || !project) return window.alert('Не найден проект или направление в серверном справочнике');
    if (!startsOn) return window.alert('Укажите дату начала группы.');
    if (!isActive && !endsOn) return window.alert('Для неактивной группы укажите дату окончания.');
    const startTime = value('#gf-start'); const directionLabel = isMixed ? 'Смешанная' : direction.name === 'Программирование' ? 'Программирование' : 'Роботы';
    const weekday = dayNames.indexOf(value('#gf-day'));
    const advanced = window.icubeAdvancedGroups?.payload() ?? {};
    const body = { name: `${directionLabel} · ${dayShortNames[weekday]} ${startTime}`,
      isMixed, directionId: direction.id, mixedPrices: isMixed ? Object.fromEntries(directories.directions.map((item) => [item.id, value(item.name === 'Программирование' ? '#gf-price-program' : '#gf-price-robot') === '' ? null : String(Number(value(item.name === 'Программирование' ? '#gf-price-program' : '#gf-price-robot')) / 4)])) : undefined, siteId: Number(value('#gf-site')), projectId: project.id, teacherId: Number(value('#gf-teacher')),
      weekday: weekday + 1, startTime, endTime: value('#gf-end'), startsOn, endsOn: isActive ? null : endsOn,
      active: isActive, price: value('#gf-price') === '' ? null : Number(value('#gf-price')), ...advanced,
      ...(isMixed && advanced.packageLessonCount !== undefined && advanced.packageLessonCount !== 4 ? { mixedPackagePrices: Object.fromEntries(directories.directions.map((item) => [item.id, value(item.name === 'Программирование' ? '#gf-price-program' : '#gf-price-robot') || null])) } : {}) };
    const saved = resourceId ? await api.update('groups', resourceId, body) : await api.create('groups', body);
    legacy.state.selectedGroup = saved.id; legacy.state.modal = null; legacy.state.page = 'group'; await reload();
  } catch (error) { fail(error); }
  finally {
    groupSavePending = false;
    if (submit && submit.isConnected !== false) submit.disabled = false;
  }
}

async function saveChild(resourceId, { status } = {}) {
  if (childSavePending) return;
  const statusOnly = resourceId && status !== undefined;
  const existing = (legacy.state.children ?? []).find(item => item.id === Number(resourceId));
  const logical = existing ? logicalEnrollments(existing) : [];
  const single = logical.length === 1 ? logical[0] : null;
  const child = statusOnly ? {status: childStatusToApi[status] ?? status} : {
    name: value('#cf-name').trim() || 'Новый ребёнок', birthDate: value('#cf-birth') || null,
    school: value('#cf-school'), grade: value('#cf-grade'), status: childStatusToApi[value('#cf-status')] ?? 'lead',
    note: value('#cf-note'), guardian: {name: value('#cf-parent'), phone: value('#cf-phone')},
  };
  if (existing && !statusOnly && child.status === (childStatusToApi[existing.status] ?? existing.status)) delete child.status;
  const selectedGroupId = statusOnly ? null : value('#cf-group') ? Number(value('#cf-group')) : null;
  const enrollment = !statusOnly && existing ? existing.enrollments.find(item => item.editable !== false && item.groupId === selectedGroupId)
    ?? existing.enrollments.find(item => item.editable !== false && item.direction === value('#cf-direction')) : null;
  async function persist(enrollmentIds) {
    if (childSavePending) return;
    if (resourceId && ['active','lead'].includes(child.status) && !single && !enrollmentIds?.length) return;
    childSavePending = true;
    try {
      let saved;
      if (statusOnly) {
        if (single) {
          if (single.editable === false) throw new ApiError('Направление другого проекта недоступно для изменения');
          await api.updateEnrollment(single.id, {status:child.status});
          saved = {id:resourceId};
        } else saved = await api.request('/children/' + resourceId + '/status', {method:'PATCH', body:{status:child.status, ...(enrollmentIds ? {enrollmentIds} : {})}});
      } else if (resourceId) {
        if (!enrollment) throw new ApiError('Не найдено редактируемое направление текущего проекта');
        const childFields = {...child};
        const enrollmentFields = {groupId:selectedGroupId};
        if (single && child.status) { enrollmentFields.status = child.status; delete childFields.status; }
        saved = await api.request('/children/' + resourceId + '/with-enrollment', {method:'PATCH', body:{
          child:childFields, enrollmentId:enrollment.id, enrollment:enrollmentFields, ...(enrollmentIds ? {enrollmentIds} : {}),
        }});
      } else {
        const direction = byName(directories.directions, value('#cf-direction'));
        if (!direction) throw new ApiError('Направление отсутствует в серверном справочнике');
        childCreateKey ||= operationKey();
        saved = await api.request('/children-with-enrollment', {method:'POST', idempotencyKey:childCreateKey, body:{child,
          enrollment:{directionId:direction.id, projectId:value('#cf-project') || undefined, groupId:selectedGroupId, status:child.status},
        }});
        childCreateKey = null;
      }
      legacy.state.selectedChild = Number(saved.id); legacy.state.modal = null; legacy.state.page = 'child'; await reload();
      return saved;
    } catch (error) {
      if (error.code === 'NO_UNFINISHED_ENROLLMENTS') {
        legacy.state.modal = `<h3>Нет незавершённых направлений</h3><div class="notice">${html(error.message)}</div><div class="modal-actions"><button class="btn" onclick="closeModal()">Понятно</button></div>`;
        legacy.render();
        return {explanation:true};
      } else fail(error);
    }
    finally { childSavePending = false; }
  }
  if (resourceId && !single && ['active','lead'].includes(child.status)) {
    window.icubeChildStatusSelection(resourceId, childStatusFromApi[child.status], persist);
    return {selection:true};
  }
  return persist();
}

async function saveEnrollmentStatus(enrollmentId, status) {
  if (childSavePending || !['director','partner'].includes(legacy.state.role)) return;
  const child = legacy.state.children.find(c => currentEnrollments(c).some(e => Number(e.id) === Number(enrollmentId)));
  const enrollment = child && currentEnrollments(child).find(e => Number(e.id) === Number(enrollmentId));
  if (!enrollment || child.editable === false || enrollment.editable === false) return;
  childSavePending = true;
  try {
    const saved = await api.updateEnrollment(enrollment.id, {status:childStatusToApi[status] ?? status});
    await reload(); return saved;
  } catch (error) { fail(error); }
  finally { childSavePending = false; }
}

async function saveEnrollment(childId, oldDirection) {
  try {
    const child = legacy.state.children.find((item) => item.id === Number(childId));
    const enrollment = child?.enrollments.find((item) => item.editable !== false && item.direction === oldDirection);
    const direction = byName(directories.directions, value('#md-dir') || oldDirection);
    if (!enrollment || !direction) return;
    const individual = value('#md-price-mode') === 'individual'; const packagePrice = Number(value('#md-individual-package') || 0);
    if (individual && !(packagePrice > 0)) return window.alert('Укажите индивидуальную цену абонемента за 4 занятия.');
    const selectedGroupId = value('#md-group') ? Number(value('#md-group')) : null;
    const targetValues = { groupId: selectedGroupId,
      ...(selectedGroupId ? { groupStartedOn: value('#md-group-started-on') || enrollment.groupStartedOn || businessDate() } : {}),
      status: enrollmentStatusToApi[value('#md-enrollment-status')] ?? enrollmentStatusToApi[enrollment.status] ?? 'active', individualPrice: individual ? packagePrice / 4 : null };
    const directionChanged = String(direction.id) !== String(enrollment.directionId);
    const currentIndividual = enrollment.individualPrice == null ? null : Number(enrollment.individualPrice);
    const priceChanged = currentIndividual !== targetValues.individualPrice;
    if (directionChanged || priceChanged) {
      await api.request(`/enrollments/${enrollment.id}/change-direction`, { method: 'POST', idempotencyKey: operationKey(), body: {
        directionId: direction.id, ...targetValues, status: targetValues.status === 'finished' ? 'active' : targetValues.status,
      } });
    } else {
      const membershipChanged = Number(enrollment.groupId || 0) !== Number(selectedGroupId || 0)
        || (selectedGroupId && value('#md-group-started-on') && targetValues.groupStartedOn !== enrollment.groupStartedOn);
      await api.updateEnrollment(enrollment.id, membershipChanged ? { directionId: direction.id, ...targetValues } : {status:targetValues.status});
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
      status: enrollmentStatusToApi[value('#ad-status')] ?? 'lead', individualPrice: individual ? packagePrice / 4 : null });
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
      ${group ? `Текущая группа «${html(groupDisplayName(group))}» будет снята. После переноса ребёнка нужно определить в новую группу.` : 'После переноса ребёнка нужно определить в новую группу.'}
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

function statisticsAllowed() {
  return authProfile ? !!authProfile.roles?.includes('director') : legacy.state.role === 'director';
}
function statisticsQueryString() {
  return `?from=${encodeURIComponent(legacy.state.statisticsDateFrom)}&to=${encodeURIComponent(legacy.state.statisticsDateTo)}&projectId=${encodeURIComponent(legacy.state.statisticsProjectId)}&directionId=${encodeURIComponent(legacy.state.statisticsDirectionId)}&chartFrom=${encodeURIComponent(legacy.state.statisticsChartFrom)}&chartTo=${encodeURIComponent(legacy.state.statisticsChartTo)}`;
}
let statisticsLoadSequence = 0;
async function loadStatistics() {
  if (!statisticsAllowed()) return;
  legacy.state.statisticsDateFrom = value('#stats-from') || legacy.state.statisticsDateFrom;
  legacy.state.statisticsDateTo = value('#stats-to') || legacy.state.statisticsDateTo;
  legacy.state.statisticsProjectId = value('#stats-project') || 'all';
  legacy.state.statisticsDirectionId = value('#stats-direction') || 'all';
  const chartFrom = value('#stats-chart-from'); const chartTo = value('#stats-chart-to');
  if (chartFrom) legacy.state.statisticsChartFrom = `${chartFrom}-01`;
  if (chartTo) { const [year, month] = chartTo.split('-').map(Number); legacy.state.statisticsChartTo = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10); }
  const sequence = ++statisticsLoadSequence;
  legacy.state.statisticsLoading = true; legacy.state.statisticsError = ''; legacy.render();
  try {
    const result = await api.list('statistics', statisticsQueryString());
    if (sequence === statisticsLoadSequence && statisticsAllowed()) {
      legacy.state.statistics = result;
      if (legacy.state.statisticsGroupsIndependent) await loadStatisticsGroups({ readControls: false });
      else acceptStatisticsGroups(result);
    }
  } catch (error) {
    if (sequence === statisticsLoadSequence) { legacy.state.statistics = null; legacy.state.statisticsError = error.message; }
  } finally { if (sequence === statisticsLoadSequence) { legacy.state.statisticsLoading = false; legacy.render(); } }
}
function acceptStatisticsGroups(result) {
  if (!result?.period) return;
  legacy.state.statisticsGroups = { groups: result.groups, period: result.period, limitations: result.limitations };
  legacy.state.statisticsGroupError = '';
  if (!legacy.state.statisticsGroupsIndependent) {
    legacy.state.statisticsGroupFrom = result.period.from; legacy.state.statisticsGroupTo = result.period.to;
  }
}
let statisticsGroupLoadSequence = 0;
async function loadStatisticsGroups({ readControls = true } = {}) {
  if (!statisticsAllowed()) return;
  if (readControls) {
    legacy.state.statisticsGroupFrom = value('#stats-group-from') || legacy.state.statisticsGroupFrom;
    legacy.state.statisticsGroupTo = value('#stats-group-to') || legacy.state.statisticsGroupTo;
    legacy.state.statisticsGroupsIndependent = true;
  }
  const sequence = ++statisticsGroupLoadSequence;
  const query = `?from=${encodeURIComponent(legacy.state.statisticsGroupFrom)}&to=${encodeURIComponent(legacy.state.statisticsGroupTo)}&projectId=${encodeURIComponent(legacy.state.statisticsProjectId)}&directionId=${encodeURIComponent(legacy.state.statisticsDirectionId)}&scope=groups`;
  legacy.state.statisticsGroupsLoading = true; legacy.state.statisticsGroupError = ''; renderStatisticsGroups();
  try {
    const result = await api.list('statistics', query);
    if (sequence === statisticsGroupLoadSequence && statisticsAllowed()) acceptStatisticsGroups(result);
  } catch (error) {
    if (sequence === statisticsGroupLoadSequence) { legacy.state.statisticsGroups = null; legacy.state.statisticsGroupError = error.message; }
  } finally {
    if (sequence === statisticsGroupLoadSequence) { legacy.state.statisticsGroupsLoading = false; renderStatisticsGroups(); }
  }
}
function renderStatisticsGroups() {
  if (!statisticsAllowed()) return;
  const target = element('#stats-group-result'); if (target) target.innerHTML = statisticsGroupsContent();
  const notes = element('#stats-history-notes');
  if (notes) notes.innerHTML = statisticsWarnings(legacy.state.statistics?.limitations, legacy.state.statisticsGroupsLoading || legacy.state.statisticsGroupError ? null : legacy.state.statisticsGroups);
}
function statisticsWarningMessages(limits = {}) {
  return [limits.unknownStatusChildren ? `Нет достоверных данных о статусе на конец периода для ${limits.unknownStatusChildren} детей. Показатели ухода включают только подтверждённые переходы.` : '',
    limits.unknownOccupancyLessons ? `Нет достоверных данных о составе. Занятий, исключённых из средней заполняемости: ${limits.unknownOccupancyLessons}.` : '',
    limits.partialOccupancyLessons ? `Неполный расчёт заполняемости. Занятий с частично подтверждённым составом: ${limits.partialOccupancyLessons}. Детей с недостаточной историей: ${limits.unknownOccupancyChildren}; показанная заполняемость — нижняя оценка.` : '',
    limits.estimatedCapacity ? 'Средняя заполняемость рассчитана оценочно: историческая вместимость групп не сохранялась. Использована действующая модель вместимости.' : '',
    limits.unresolvedAttendanceDirections ? `Обнаружено несоответствие: отметок посещаемости без подтверждённого направления — ${limits.unresolvedAttendanceDirections}. В показателях отдельных направлений они не учитываются.` : ''].filter(Boolean);
}
function statisticsWarnings(limits = {}, groupResult = null) {
  const warnings = new Map();
  const add = (items, label) => { for (const text of statisticsWarningMessages(items)) { const scopes = warnings.get(text) ?? new Set(); scopes.add(label); warnings.set(text, scopes); } };
  const commonPeriod = legacy.state.statistics?.period;
  const independent = groupResult?.period && (groupResult.period.from !== commonPeriod?.from || groupResult.period.to !== commonPeriod?.to);
  add(limits, independent ? 'Общая статистика' : '');
  if (groupResult) add(groupResult.limitations, independent ? 'Статистика групп' : '');
  return warnings.size ? `<details id="stats-history-limits" class="notice stats-section stats-limitations"><summary>Ограничения исторических данных: ${warnings.size}</summary>${[...warnings].map(([text, scopes]) => `<p>${html(text)}${independent ? `<small class="muted"> ${html([...scopes].join('; '))}.</small>` : ''}</p>`).join('')}</details>` : '';
}
function statisticsAsOf(period) {
  return period?.effectiveTo ? `<p class="muted">Данные по состоянию на ${html(isoToRu(period.effectiveTo))}${period.effectiveTo < period.from ? '. Выбранный период ещё не наступил' : ''}.</p>` : '';
}
function statisticsGroupsContent() {
  if (!statisticsAllowed()) return '<div class="empty">Статистика доступна только директору.</div>';
  if (legacy.state.statisticsGroupsLoading) return '<div class="notice" role="status">Загружаем статистику групп…</div>';
  if (legacy.state.statisticsGroupError) return `<div class="notice" role="alert">${html(legacy.state.statisticsGroupError)}</div>`;
  const result = legacy.state.statisticsGroups ?? legacy.state.statistics;
  return `${statisticsAsOf(result?.period)}<div id="stats-group-list">${statisticsGroupRows()}</div>`;
}
const statisticsRate = (number, estimated = false) => number == null ? 'Нет данных' : `${estimated ? '≈' : ''}${Number(number).toFixed(1).replace('.', ',')}%`;
const statisticsMetrics = (items) => `<div class="stats-metrics">${items.map(([label, metric, kind = '', scope = '']) => `<div class="card metric ${kind}">${scope ? `<small class="stats-metric-scope">${html(scope)}</small>` : ''}<div class="label">${html(label)}</div><div class="value">${html(metric)}</div></div>`).join('')}</div>`;
const statisticsRows = (items) => `<dl class="stats-detail-metrics">${items.map(([label, metric, kind = '']) => `<div class="${kind}"><dt>${html(label)}</dt><dd>${html(metric)}</dd></div>`).join('')}</dl>`;
function statisticsDisclosure(id, title, description, content) {
  return `<details class="card stats-disclosure stats-section" data-stats-section="${id}"><summary><span><b>${html(title)}</b><small>${html(description)}</small></span></summary><div class="stats-disclosure-body">${content}</div></details>`;
}
function statisticsDirectionClass(name) {
  return /смешан/i.test(name) ? 'stats-direction-mixed' : /программ/i.test(name) ? 'stats-direction-code' : 'stats-direction-robot';
}
function statisticsProjectClass(project, index = 0) {
  return project.code === 'icube-robots' ? 'stats-project-robots' : project.code === 'zebra' ? 'stats-project-zebra' : `stats-project-other-${index % 3}`;
}
function selectStatisticsMonth(month) {
  if (!statisticsAllowed() || !legacy.state.statistics?.monthly?.some((item) => item.month === month)) return;
  legacy.state.statisticsMonth = month; legacy.render();
}
function statisticsPayments(result) {
  const rows = result.monthly ?? []; const maximum = Math.max(1, ...rows.map((row) => Number(row.received)));
  const selected = rows.find((row) => row.month === legacy.state.statisticsMonth) ?? rows.at(-1);
  const projects = [...new Map(rows.flatMap((row) => row.projects).map((project) => [project.id, project])).values()];
  const compact = (amount) => new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(amount));
  const chart = rows.map((row) => `<button type="button" class="stats-month-button${row.month === selected?.month ? ' selected' : ''}" aria-pressed="${row.month === selected?.month}" aria-label="${html(row.month)}: оплаты ${html(displayMoney(row.received))}, возвраты ${html(displayMoney(row.refunds))}" onclick="icubeApi.selectStatisticsMonth('${row.month}')">
    <span class="stats-month-amount">${html(compact(row.received))} ₽</span><span class="stats-bar-track"><span class="stats-stack" style="height:${Number(row.received) / maximum * 100}%">
    ${row.projects.filter((p) => Number(p.received) > 0).map((p) => `<span class="stats-project-segment ${statisticsProjectClass(p, projects.findIndex((x) => x.id === p.id))}" style="height:${Number(p.received) / Number(row.received) * 100}%" title="${html(p.name)}: ${html(displayMoney(p.received))}"></span>`).join('')}</span></span>
    <span class="stats-refund-marker">${Number(row.refunds) > 0 ? '<span class="negative" aria-label="В этом месяце есть возвраты">●</span>' : ''}</span><span class="stats-month-label">${html(row.month.slice(5))}.${html(row.month.slice(2, 4))}</span></button>`).join('');
  const details = selected ? `<div class="stats-month-details" aria-live="polite"><h3>Подробности: ${html(selected.month)}</h3>
    ${statisticsMetrics([['Получено оплат', displayMoney(selected.received)], ['Возвраты по дате возврата', displayMoney(selected.refunds)], ['Чистая сумма', displayMoney(selected.net)]])}
    <div class="stats-project-details">${selected.projects.filter((p) => Number(p.received) || Number(p.refunds)).map((p) => `<section class="card pad"><h4>${html(p.name)}</h4><dl><dt>Получено</dt><dd>${html(displayMoney(p.received))}</dd><dt>Безналичные</dt><dd>${html(displayMoney(p.cashless))}</dd><dt>Наличные</dt><dd>${html(displayMoney(p.cash))}</dd><dt>Возвраты</dt><dd>${html(displayMoney(p.refunds))}</dd><dt>Чистая сумма</dt><dd>${html(displayMoney(p.net))}</dd></dl></section>`).join('') || '<div class="muted">За месяц оплат и возвратов нет.</div>'}</div></div>` : '';
  return `<section class="card pad stats-section"><h2>Поступления по месяцам</h2>${statisticsAsOf(result.chartPeriod)}<p class="muted">Высота столбца — все оплаты. Возвраты показаны отдельно. Нажмите на месяц, чтобы увидеть суммы.</p>
    <div class="stats-chart-controls"><label>Месяц от<input class="input" id="stats-chart-from" type="month" value="${html(legacy.state.statisticsChartFrom.slice(0, 7))}"></label><label>Месяц до<input class="input" id="stats-chart-to" type="month" value="${html(legacy.state.statisticsChartTo.slice(0, 7))}"></label><button class="btn" onclick="icubeApi.loadStatistics()">Обновить графики</button></div>
    <div class="stats-chart-legend">${projects.map((p, index) => `<span><i class="${statisticsProjectClass(p, index)}"></i>${html(p.name)}</span>`).join('')}</div>
    <div class="stats-payments-chart" style="--stats-columns:${Math.max(1, Math.min(12, rows.length))}">${chart || '<div class="empty">Нет данных</div>'}</div>${details}</section>`;
}
function statisticsDynamics(result) {
  const rows = result.monthly ?? []; const maximum = Math.max(1, ...rows.flatMap((row) => [row.newChildren, row.pausedChildren, row.finishedChildren]));
  return `<section class="card pad stats-section"><h2>Динамика набора и ухода</h2><p class="muted">Пауза и завершение — итоговое историческое состояние на конец месяца. Для текущего месяца — на сегодня.</p><div class="stats-dynamics">${rows.map((row) => `<section><h4>${html(row.month)}</h4>${[['Новые записи', row.newChildren, 'stats-project-robots'], ['Ушли на паузу', row.pausedChildren, 'stats-paused'], ['Закончили', row.finishedChildren, 'stats-finished']].map(([label, count, style]) => `<div class="stats-trend-line"><span>${label}</span><span class="stats-trend-track"><i class="${style}" style="width:${count / maximum * 100}%"></i></span><b>${count}</b></div>`).join('')}${row.unknownStatuses ? `<small class="muted">Неполная история: ${row.unknownStatuses}</small>` : ''}</section>`).join('')}</div></section>`;
}
function statisticsGroupRows() {
  const query = String(legacy.state.statisticsGroupSearch ?? '').toLocaleLowerCase('ru');
  const sort = legacy.state.statisticsGroupSort ?? 'name';
  const groups = [...((legacy.state.statisticsGroups ?? legacy.state.statistics)?.groups ?? [])].filter((g) => `${g.name} ${g.siteName}`.toLocaleLowerCase('ru').includes(query));
  groups.sort((a, b) => sort === 'attendance' ? Number(a.attendancePercent) - Number(b.attendancePercent) || a.name.localeCompare(b.name, 'ru')
    : sort === 'occupancy' ? (a.averageOccupancyPercent == null ? Infinity : Number(a.averageOccupancyPercent)) - (b.averageOccupancyPercent == null ? Infinity : Number(b.averageOccupancyPercent)) || a.name.localeCompare(b.name, 'ru') : a.name.localeCompare(b.name, 'ru'));
  return groups.map((g) => {
    const title = displayGroup(g.id, g.name);
    const info = [title.includes(g.directionName) ? '' : g.directionName, title.includes(g.startTime) && title.includes(g.endTime) ? '' : `${dayShortNames[g.weekday - 1] ?? ''} ${g.startTime}–${g.endTime}${g.schedule ? `; ${g.schedule}` : ''}`].filter(Boolean).join(' · ');
    return `<details class="stats-group-card card ${statisticsDirectionClass(g.directionName)}" data-stats-group="${g.id}"${(legacy.state.statisticsOpenGroups ?? []).includes(g.id) ? ' open' : ''} ontoggle="icubeApi.statisticsGroupToggle('${g.id}',this.open)"><summary><div><b>${html(title)}</b><div class="muted">${html(g.siteName)} · ${html(g.projectName)}</div>${info ? `<small>${html(info)}</small>` : ''}</div><div class="stats-group-summary"><span>Сейчас: ${g.currentMembers} / ${g.capacity}</span><span>Посещаемость: ${statisticsRate(g.attendancePercent)}</span></div></summary><div class="stats-group-body">
    <h4>За период групп ${html(isoToRu((legacy.state.statisticsGroups ?? legacy.state.statistics)?.period?.from))} — ${html(isoToRu((legacy.state.statisticsGroups ?? legacy.state.statistics)?.period?.to))}</h4>${statisticsRows([['Проведено занятий', g.completedLessons], ['Посещения', g.visits], ['Пропуски', g.absences], ['Средняя посещаемость', statisticsRate(g.attendancePercent)], ['Средняя историческая заполняемость', statisticsRate(g.averageOccupancyPercent, g.estimatedCapacity || g.partialOccupancyLessons)], ['Новые записи из занятия группы', g.newChildren], ['Впервые на ознакомительном', g.trials], ['Продолжили по направлению', g.continued], ['Не продолжили', g.notContinued], ['Ожидают результата', g.pending], ['Конверсия', statisticsRate(g.conversionPercent)], ['Начали регулярные занятия', g.regularStarts ?? 0], ['Ушли на паузу', g.pausedChildren], ['Закончили направление', g.finishedChildren]])}
    <p class="muted">Сейчас: ${g.currentMembers} детей, вместимость ${g.capacity}. Историческая заполняемость рассчитана по ${g.occupancyLessons} занятиям; исключено без достоверного состава — ${g.unknownOccupancyLessons}. ${g.partialOccupancyLessons ? `В ${g.partialOccupancyLessons} занятиях состав подтверждён частично: показана нижняя оценка, без ${g.unknownOccupancyChildren} детей с неизвестным статусом. ` : ''}Новые записи группы определены только по карточкам, созданным из её занятий. Начало регулярных занятий относится к группе первого платного посещения каждого направления.</p></div></details>`;
  }).join('') || '<div class="empty">Групп по запросу не найдено.</div>';
}
function filterStatisticsGroups(query, sort) {
  if (!statisticsAllowed()) return;
  if (query !== undefined) legacy.state.statisticsGroupSearch = query;
  if (sort !== undefined) legacy.state.statisticsGroupSort = sort;
  const target = element('#stats-group-list'); if (target) target.innerHTML = statisticsGroupRows();
}
function statisticsGroupToggle(id, open) {
  if (!statisticsAllowed()) return;
  const current = new Set(legacy.state.statisticsOpenGroups ?? []); if (open) current.add(id); else current.delete(id); legacy.state.statisticsOpenGroups = [...current];
}
function statisticsPage() {
  if (!statisticsAllowed()) return '<div class="empty">Статистика доступна только директору.</div>';
  const result = legacy.state.statistics; const summary = result?.summary ?? {};
  const option = (item, selected) => `<option value="${item.id}"${String(item.id) === String(selected) ? ' selected' : ''}>${html(item.name)}</option>`;
  const filters = `<div class="stats-filters card pad"><label>Дата от<input class="input" id="stats-from" type="date" value="${html(legacy.state.statisticsDateFrom)}"></label><label>Дата до<input class="input" id="stats-to" type="date" value="${html(legacy.state.statisticsDateTo)}"></label><label>Проект<select class="select" id="stats-project"><option value="all">Все</option>${directories.projects.map((item) => option(item, legacy.state.statisticsProjectId)).join('')}</select></label><label>Направление<select class="select" id="stats-direction"><option value="all">Все</option>${directories.directions.map((item) => option(item, legacy.state.statisticsDirectionId)).join('')}</select></label><button class="btn primary" onclick="icubeApi.loadStatistics()"${legacy.state.statisticsLoading ? ' disabled' : ''}>Применить</button></div>`;
  const head = legacy.pageHead('Статистика', 'Текущее состояние и показатели за период по серверным данным.');
  if (legacy.state.statisticsLoading) return `<div class="stats-page">${head}${filters}<div class="notice">Загружаем статистику…</div></div>`;
  if (!result) return `<div class="stats-page">${head}${filters}<div class="notice">${html(legacy.state.statisticsError || 'Примените фильтры, чтобы загрузить статистику.')}</div></div>`;
  const c = result.current?.children ?? {}; const a = result.current?.activeDirections ?? { directions: [] };
  const active = directories.directions.map((d) => [d.name + ' — активные', a.directions.find((x) => String(x.id) === String(d.id))?.count ?? 0, statisticsDirectionClass(d.name)]);
  const r = result.recruitment ?? {};
  const estimated = summary.estimatedCapacity || summary.partialOccupancyLessons;
  const attendance = [['Посещения', summary.visits], ['Пропуски', summary.absences], ['Средняя посещаемость', statisticsRate(summary.attendancePercent)], ['Средняя историческая заполняемость', statisticsRate(summary.averageOccupancyPercent, estimated)]];
  return `<div class="stats-page">${head}${filters}<section class="stats-section stats-overview"><h2>Обзор</h2><p class="muted">За период ${html(isoToRu(result.period?.from))} — ${html(isoToRu(result.period?.to))}. Дети — текущее состояние.</p>${statisticsAsOf(result.period)}${statisticsMetrics([['Всего детей', c.total ?? 0, '', 'Сейчас'], ['Активных детей', c.active ?? 0, '', 'Сейчас'], ['Новые записи', summary.newChildren, '', 'За период'], ['Проведено занятий', summary.completedLessons, '', 'За период'], ['Средняя посещаемость', statisticsRate(summary.attendancePercent), '', 'За период'], ['Средняя историческая заполняемость', statisticsRate(summary.averageOccupancyPercent, estimated), '', 'За период']])}
    </section>
    ${statisticsPayments(result)}
    ${statisticsDisclosure('children', 'Дети и направления', 'Текущие статусы и активные направления', `<h3>Дети сейчас</h3>${statisticsRows([['Всего детей', c.total ?? 0], ['Активные', c.active ?? 0], ['Лиды', c.lead ?? 0], ['На паузе', c.paused ?? 0], ['Закончили', c.finished ?? 0]])}<h3>Активные направления сейчас</h3>${statisticsRows([['Всего активных направлений', a.total ?? 0], ...active, ['С двумя активными направлениями', a.dualChildren ?? 0]])}`)}
    ${statisticsDisclosure('attendance', 'Занятия и посещаемость', 'Посещения, пропуски и заполняемость за период', statisticsRows(attendance))}
    ${statisticsDisclosure('recruitment', 'Набор и ознакомительные', 'Результаты пробных и начало регулярных занятий', `${statisticsRows([['Новые записи', summary.newChildren], ['Пришли на ознакомительное', r.trials ?? 0], ['Продолжили после ознакомительного', r.continued ?? 0], ['Не продолжили', r.notContinued ?? 0], ['Ожидают результата', r.pending ?? 0], ['Конверсия ознакомительных занятий', statisticsRate(r.conversionPercent)], ['Начали регулярные занятия', r.regularStarts ?? 0]])}<p class="muted">После пробного ожидаем 7 календарных дней. Платное посещение в любой последующий момент меняет результат на «Продолжил», в том числе для прошлого месяца. Ожидающие исключены из конверсии. Начало регулярных занятий — первый обычный платный визит в выбранном периоде; по клубу дети уникальны.</p><div class="stats-project-details">${(r.directions ?? []).map((d) => `<section class="${statisticsDirectionClass(d.name)}"><h3>${html(d.name)}</h3>${statisticsRows([['Пробные', d.trials], ['Продолжили', d.continued], ['Не продолжили', d.notContinued], ['Ожидают', d.pending], ['Конверсия', statisticsRate(d.conversionPercent)], ['Начали регулярные занятия', d.regularStarts ?? 0]])}</section>`).join('')}</div>`)}
    ${statisticsDisclosure('dynamics', 'Динамика и уход', 'Паузы, завершения и динамика по месяцам', `${statisticsRows([['Ушли на паузу', summary.pausedChildren ?? 0], ['Закончили обучение', summary.finishedChildren ?? 0]])}${statisticsDynamics(result)}`)}
    <section class="stats-section"><h2>Статистика групп</h2><div class="stats-group-controls"><label>С<input class="input" id="stats-group-from" type="date" value="${html(legacy.state.statisticsGroupFrom || legacy.state.statisticsDateFrom)}"></label><label>По<input class="input" id="stats-group-to" type="date" value="${html(legacy.state.statisticsGroupTo || legacy.state.statisticsDateTo)}"></label><button class="btn" onclick="icubeApi.loadStatisticsGroups()">Применить даты групп</button><label>Поиск по группе или площадке<input class="input" id="stats-group-search" type="search" value="${html(legacy.state.statisticsGroupSearch ?? '')}" oninput="icubeApi.filterStatisticsGroups(this.value)"></label><label>Сортировка<select class="select" onchange="icubeApi.filterStatisticsGroups(undefined,this.value)">${[['name','По названию'],['attendance','Сначала низкая посещаемость'],['occupancy','Сначала низкая заполняемость']].map(([key,label]) => `<option value="${key}"${(legacy.state.statisticsGroupSort ?? 'name') === key ? ' selected' : ''}>${label}</option>`).join('')}</select></label></div><div id="stats-group-result">${statisticsGroupsContent()}</div></section>
    ${typeof window === 'undefined' ? '' : window.icubeBudget?.section?.() ?? ''}
    <div id="stats-history-notes">${statisticsWarnings(result.limitations, legacy.state.statisticsGroupsLoading || legacy.state.statisticsGroupError ? null : legacy.state.statisticsGroups)}</div></div>`;
}

function directorBudgetMoney(value) {
  const text = String(value ?? '0.00'); const hasKopecks = !/\.00$|^-?\d+$/.test(text);
  return `${new Intl.NumberFormat('ru-RU', { minimumFractionDigits: hasKopecks ? 2 : 0, maximumFractionDigits: 2 }).format(Number(text))} ₽`;
}

function createDirectorBudgetUi({ api, getActor, find = (selector) => document.querySelector(selector), confirm = (message) => window.confirm(message),
  makeKey = () => crypto.randomUUID(), now = () => new Date() }) {
  const budgetMoney = directorBudgetMoney;
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (symbol) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[symbol]);
  const dateLabel = (value) => String(value ?? '').split('-').reverse().join('.');
  const rate = (value) => value == null ? 'Нет данных' : `${Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 2 })}%`;
  const rows = (items) => `<dl class="stats-detail-metrics">${items.map(([label, value]) => `<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl>`;
  const cards = (items) => `<div class="budget-metrics">${items.map(([label, value, kind = '']) => `<div class="card metric ${kind}"><div class="label">${escape(label)}</div><div class="value">${escape(value)}</div></div>`).join('')}</div>`;
  const details = (title, content) => `<details class="budget-details"><summary>${escape(title)}</summary>${content}</details>`;
  let state; let generation = 0;
  function ready() {
    const actor = getActor();
    if (!actor?.roles?.includes('director')) { state = null; generation++; return null; }
    const owner = String(actor.id ?? 'prototype');
    if (!state || state.owner !== owner) {
      const period = calendarMonthPeriod(now()); generation++;
      state = { owner, open: false, ...period, result: null, loading: false, busy: false, error: '', message: '', form: null, sequence: 0 };
    }
    return state;
  }
  const value = (selector) => find(selector)?.value ?? '';
  const current = (snapshot, token) => ready() === snapshot && generation === token;
  function section() {
    const s = ready(); if (!s) return '';
    return `<details class="card stats-disclosure stats-section director-budget"${s.open ? ' open' : ''} ontoggle="icubeBudget.toggle(this.open)"><summary><span><b>Мой бюджет</b><small>Оплаты, начисленные расходы и управленческий результат</small></span></summary><div class="stats-disclosure-body" id="director-budget-body">${content()}</div></details>`;
  }
  function render() { if (!ready()) return; const target = find('#director-budget-body'); if (target) target.innerHTML = content(); }
  function entryForm(s) {
    const form = s.form; if (!form) return '';
    return `<form class="budget-entry-form" onsubmit="event.preventDefault();icubeBudget.save()"><h4>${form.id ? 'Изменить операцию' : form.type === 'income' ? 'Прочий чистый доход' : 'Прочий расход'}</h4>
      <div class="budget-form-fields"><label>Дата<input class="input" id="budget-entry-date" type="date" required value="${escape(form.date)}" onchange="icubeBudget.draft()"></label>
      <label>Сумма, ₽<input class="input" id="budget-entry-amount" type="number" min="0.01" step="0.01" required value="${escape(form.amount)}" oninput="icubeBudget.draft()"></label>
      <label>Назначение<input class="input" id="budget-entry-purpose" maxlength="1000" value="${escape(form.purpose)}" oninput="icubeBudget.draft()"></label></div>
      <div class="budget-actions"><button class="btn primary" type="submit"${s.busy ? ' disabled' : ''}>Сохранить</button><button class="btn" type="button" onclick="icubeBudget.cancel()"${s.busy ? ' disabled' : ''}>Отмена</button></div></form>`;
  }
  function content() {
    const s = ready(); if (!s) return '';
    const controls = `<p class="muted">Расчёт по полученным оплатам и начисленным обязательствам. Это управленческий результат, а не остаток банковского счёта.</p>
      <div class="budget-period"><label>С<input class="input" id="budget-from" type="date" value="${escape(s.from)}"></label><label>По<input class="input" id="budget-to" type="date" value="${escape(s.to)}"></label><button class="btn primary" onclick="icubeBudget.load()"${s.loading || s.busy ? ' disabled' : ''}>Рассчитать бюджет</button></div>`;
    const notice = `${s.error ? `<div class="notice" role="alert">${escape(s.error)}</div>` : ''}${s.message ? `<p role="status">${escape(s.message)}</p>` : ''}`;
    if (s.loading) return `${controls}<p role="status">Рассчитываем бюджет…</p>`;
    const result = s.result; if (!result) return `${controls}${notice}`;
    const total = result.totals; const own = result.projects.find((p) => p.code === 'icube-robots'); const zebra = result.projects.find((p) => p.code === 'zebra');
    const incomeDetails = result.projects.map((p) => `<section class="${p.code === 'zebra' ? 'budget-zebra' : 'budget-icube'}"><h4>${escape(p.name)}</h4>${rows([['Всего оплат', budgetMoney(p.payments)], ['Наличные', budgetMoney(p.cash)], ['Безналичные', budgetMoney(p.cashless)], ['После возвратов', budgetMoney(p.income)]])}</section>`).join('');
    const costDetails = result.projects.map((p) => `<section><h4>${escape(p.name)}</h4>${rows([['Возвраты', budgetMoney(p.refunds)], ['Начисленная зарплата', budgetMoney(p.salary)], ['Аренда', budgetMoney(p.rent)], ['Налог', budgetMoney(p.tax)], ['Доля партнёра', budgetMoney(p.partnerShare)], ['Управленческий результат', budgetMoney(p.result)]])}</section>`).join('');
    const partner = result.partner;
    const transfers = rows([['Доля партнёра — учтена в расходах', budgetMoney(zebra.partnerShare)], ['Наличные у партнёра — справочно', budgetMoney(partner.cashHeld)],
      ['Взаимный перевод — справочно', budgetMoney(partner.transfer)], ['Начисленный доход — справочно', budgetMoney(partner.earnedIncome)], ['Начисленная доля Айкуба — справочно', budgetMoney(partner.earnedIcubeShare)]]);
    const entries = result.entries.map((entry) => `<div class="budget-entry"><div><b>${escape(dateLabel(entry.date))}</b><div class="budget-purpose">${escape(entry.purpose || (entry.type === 'income' ? 'Прочий чистый доход' : 'Прочий расход'))}</div></div><strong class="${entry.type === 'expense' ? 'negative' : ''}">${entry.type === 'income' ? '+' : '−'}${escape(budgetMoney(entry.amount))}</strong><div class="budget-actions"><button class="btn" onclick="icubeBudget.edit('${entry.id}')"${s.busy ? ' disabled' : ''}>Редактировать</button><button class="btn" onclick="icubeBudget.remove('${entry.id}')"${s.busy ? ' disabled' : ''}>Удалить</button></div></div>`).join('');
    return `${controls}${notice}${cards([['Все оплаты', budgetMoney(total.payments)], ['Расходы и удержания', budgetMoney(total.deductions)], ['Мой результат', budgetMoney(total.result)], ['Общая доходность', rate(total.overallMarginPercent)]])}
      <h4>Доходность</h4>${cards([['Айкуб', rate(own.marginPercent), 'budget-icube'], ['Зебра', rate(zebra.marginPercent), 'budget-zebra'], ['Айкуб + Зебра', rate(total.combinedMarginPercent)], ['Общая доходность', rate(total.overallMarginPercent)]])}
      <p class="muted">Общая доходность условная: прочие доходы вводятся уже чистыми. Результат Зебры рассчитан от оплат; начисленная доля Айкуба от индивидуальных посещений может отличаться.</p>
      ${details('Доходы', `${incomeDetails}${rows([['Все оплаты', budgetMoney(total.payments)], ['Прочий чистый доход', budgetMoney(total.manualIncome)]])}`)}
      ${details('Расходы и сверка результата', `${costDetails}${rows([['Возвраты', budgetMoney(total.refunds)], ['Зарплаты', budgetMoney(total.salary)], ['Аренда', budgetMoney(total.rent)], ['Налоги', budgetMoney(total.tax)], ['Доли партнёров', budgetMoney(total.partnerShare)], ['Прочие расходы', budgetMoney(total.manualExpense)], ['Расходы и удержания — всего', budgetMoney(total.deductions)], ['Результат Айкуб + Зебра', budgetMoney(total.automaticResult)], ['Прочий чистый доход', budgetMoney(total.manualIncome)], ['Мой результат', budgetMoney(total.result)]])}`)}
      ${details('Партнёрские расчёты — пояснения', `<p class="muted">Положительный перевод — к получению от партнёра, отрицательный — к выплате партнёру. Переводы и начисленная доля Айкуба показаны справочно и повторно не изменяют результат.</p>${transfers}`)}
      <h4>Дополнительные операции</h4><div class="budget-actions"><button class="btn" onclick="icubeBudget.add('income')"${s.busy ? ' disabled' : ''}>+ Прочий доход</button><button class="btn" onclick="icubeBudget.add('expense')"${s.busy ? ' disabled' : ''}>− Прочий расход</button></div>${entryForm(s)}
      <div class="budget-entries">${entries || '<p class="muted">За выбранный период дополнительных операций нет.</p>'}</div>`;
  }
  async function load({ readControls = true } = {}) {
    const s = ready(); if (!s || (s.busy && readControls)) return;
    if (readControls) { s.from = value('#budget-from') || s.from; s.to = value('#budget-to') || s.to; }
    const sequence = ++s.sequence; const token = generation; s.loading = true; s.error = ''; render();
    try {
      const result = await api.list('statistics/budget', `?from=${encodeURIComponent(s.from)}&to=${encodeURIComponent(s.to)}`);
      if (current(s, token) && sequence === s.sequence) s.result = result;
    } catch (error) { if (current(s, token) && sequence === s.sequence) { s.result = null; s.error = error.message; } }
    finally { if (current(s, token) && sequence === s.sequence) { s.loading = false; render(); } }
  }
  async function toggle(open) { const s = ready(); if (!s) return; s.open = open; if (open && !s.result && !s.loading) await load({ readControls: false }); }
  function draft() {
    const s = ready(); if (!s?.form || s.busy) return;
    Object.assign(s.form, { date: value('#budget-entry-date'), amount: value('#budget-entry-amount'), purpose: value('#budget-entry-purpose') });
  }
  function add(type) { const s = ready(); if (!s || s.busy || !['income','expense'].includes(type)) return; s.form = { type, date: businessDate(now()), amount: '', purpose: '', key: makeKey() }; s.error = ''; s.message = ''; render(); }
  function edit(id) { const s = ready(); if (!s || s.busy) return; const entry = s.result?.entries.find((row) => row.id === String(id)); if (entry) { s.form = { ...entry }; s.error = ''; s.message = ''; render(); } }
  function cancel() { const s = ready(); if (s && !s.busy) { s.form = null; s.error = ''; render(); } }
  async function save() {
    const s = ready(); if (!s?.form || s.busy) return; draft(); const form = { ...s.form }; const token = generation;
    const body = { type: form.type, date: form.date, amount: form.amount, purpose: form.purpose };
    s.busy = true; s.error = ''; render();
    try {
      await api.request(form.id ? `/statistics/budget/entries/${form.id}` : '/statistics/budget/entries', {
        method: form.id ? 'PATCH' : 'POST', body, idempotencyKey: form.id ? undefined : form.key, expectedActorId: s.owner,
      });
      if (current(s, token)) { s.form = null; s.message = 'Операция сохранена.'; await load({ readControls: false }); }
    } catch (error) { if (current(s, token)) s.error = error.message; }
    finally { if (current(s, token)) { s.busy = false; render(); } }
  }
  async function remove(id) {
    const s = ready(); if (!s || s.busy) return;
    const entry = s.result?.entries.find((row) => row.id === String(id)); if (!entry || !confirm(`Удалить операцию ${dateLabel(entry.date)} на ${budgetMoney(entry.amount)}?`)) return;
    const token = generation; s.busy = true; s.error = ''; render();
    try {
      await api.request(`/statistics/budget/entries/${entry.id}`, { method: 'DELETE', expectedActorId: s.owner });
      if (current(s, token)) { if (s.form?.id === entry.id) s.form = null; s.message = 'Операция удалена.'; await load({ readControls: false }); }
    } catch (error) { if (current(s, token)) s.error = error.message; }
    finally { if (current(s, token)) { s.busy = false; render(); } }
  }
  return { section, toggle, load, add, edit, cancel, draft, save, remove };
}

const legacyChildPage = window.child;
function childPageWithTransferHistory() {
  const output = typeof legacyChildPage === 'function' ? legacyChildPage() : '';
  const child = legacy.state.children.find((item) => item.id === Number(legacy.state.selectedChild));
  const transfers = (legacy.state.balanceTransfers ?? []).filter((item) => item.childId === child?.id);
  if (!child || legacy.state.childTab !== 'overview') return output;
  const history = [...(child.enrollmentHistory ?? []), ...child.enrollments.filter((e) => (e.groupHistory ?? []).some((g) => g.endedOn != null))];
  const historyBlock = history.length ? `<div class="card pad" style="margin-top:16px"><h2>История направлений и групп</h2>${history.map((e) => `<div class="info-line"><div><b>${html(e.direction)}</b> · ${html(e.status)} · ${html(e.project)}${(e.groupHistory ?? []).map((g) => `<div class="muted mini">${html(g.groupName)} · ${html(g.startedOn)} — ${html(g.endedOn ?? 'по настоящее время')}</div>`).join('')}</div>${e.balance == null ? '' : `<span class="money ${e.balance < 0 ? 'negative' : ''}">${html(e.balance)} занятий</span>`}</div>`).join('')}</div>` : '';
  if (!transfers.length) return `${output}${historyBlock}`;
  const block = `<div class="card child-ledger-card" style="margin-top:16px"><div class="child-ledger-head"><div><h2>Переносы остатка</h2><div class="muted mini">${transfers.length} операций</div></div></div><div class="list">${transfers.map((item) => `<div class="kpi-line" style="padding:12px 16px"><div><b>${html(item.sourceDirectionName)} → ${html(item.targetDirectionName)}</b><div class="muted mini">${isoToRu(timestampDate(item.transferredAt))} · ${displayMoney(item.transferredAmount)} · зачислено ${Number(item.targetLessonsCredit).toFixed(4)} занятия</div></div>${item.automaticChangeDirection ? '' : `<button class="btn danger" onclick="icubeApi.cancelBalanceTransferPrompt(${item.id})">Отменить перенос</button>`}</div>`).join('')}</div></div>`;
  return `${output}${historyBlock}${block}`;
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
    <div class="partner-line"><span>${result.customGroups?.length ? 'Доход для расчёта (долевые группы — по посещениям)' : 'Доход после возвратов'}</span><b>${displayMoney(result.incomeAmount)}</b></div>
    <div class="partner-line"><span>Налог${result.customGroups?.length ? ' по режимам групп' : ` ${percent(result.taxPercent)}%`}</span><b>− ${displayMoney(result.taxAmount)}</b></div>
    <div class="partner-line"><span>Зарплата преподавателей</span><b>− ${displayMoney(result.salaryAmount)}</b></div>
    <div class="partner-line partner-divider"><span>Остаток к распределению</span><b>${displayMoney(result.distributableAmount)}</b></div>
    <div class="partner-line"><span>Доля iCube${result.customGroups?.length ? '' : ` ${percent(result.icubePercent)}%`}</span><b>${displayMoney(result.icubeShareAmount)}</b></div>
    <div class="partner-line"><span>Доля партнёра${result.customGroups?.length ? '' : ` ${percent(result.partnerPercent)}%`}</span><b>${displayMoney(result.partnerShareAmount)}</b></div>
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
    finalBlock = `<div class="partner-final ${positive ? 'partner-final-pay' : 'partner-final-return'}"><span>${positive ? 'Перевести партнёру' : 'Партнёр должен передать iCube'}</span><b>${amount}</b></div>`;
  }

  const customGroups = result.customGroups ?? [];
  const customBreakdown = customGroups.length ? `<details class="advanced-group-settings"><summary>Расчёт индивидуальных групп · ${customGroups.length}</summary>${customGroups.map((group) => {
    const current = legacy.state.groups.find((item) => String(item.id) === String(group.groupId));
    const title = groupDisplayName(current, group.groupName);
    return `<div class="card pad advanced-settlement"><b>${html(title)}</b><div class="info-list"><div class="info-line"><span>Посещений</span><b>${group.visits}</b></div>${[['gross','Заработанная стоимость'],['teacher','Преподавателю'],['partner','Партнёру'],['tax','Налог'],['icube','iCube']].map(([field,label]) => `<div class="info-line"><span>${label}</span><b>${displayMoney(group[field])}</b></div>`).join('')}</div></div>`;
  }).join('')}</details>` : '';
  return `<div class="card pad partner-settlement"><div class="section-title"><div><h2 style="font-size:22px">${html(result.projectName)}</h2><div class="muted">${isoToRu(result.periodFrom)} — ${isoToRu(result.periodTo)}</div></div><span class="badge purple">${html(result.partnerName)}</span></div>${rows}${customBreakdown}${finalBlock}</div>`;
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
  const query = partnerView
    ? `?from=${encodeURIComponent(legacy.state.partnerDateFrom)}&to=${encodeURIComponent(legacy.state.partnerDateTo)}`
    : `?projectId=${encodeURIComponent(legacy.state.partnerProjectId)}&from=${encodeURIComponent(legacy.state.partnerDateFrom)}&to=${encodeURIComponent(legacy.state.partnerDateTo)}`;
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
  const preferred = existing?.enrollmentId ?? child?.enrollments.find((enrollment) => enrollment.editable !== false && enrollment.direction === direction)?.id
    ?? child?.enrollments.find((enrollment) => enrollment.editable !== false)?.id ?? null;
  const todayIso = businessDate();
  paymentCreateKey = existing ? null : operationKey(); paymentSavePending = false;
  legacy.state.modal = `<h3>${existing ? 'Редактировать оплату' : 'Новая оплата'}</h3><div class="form-grid">
    <div class="field"><label>Дата</label><input class="input" id="pf-date" type="date" value="${html(existing?.paidOn ?? todayIso)}" onchange="icubeApi.updatePaymentPrice(${existing?.id ?? 'null'})"></div>
    <div class="field"><label>Ребёнок</label><select class="select" id="pf-child" onchange="icubeApi.refreshPaymentDirections(${existing?.id ?? 'null'});window.icubePaymentReceipts?.refreshCandidates?.()" ${historical ? 'disabled' : ''}>${historical ? `<option value="${existing.childId}">${html(existing.childName)}</option>` : legacy.state.children.map((item) => `<option value="${item.id}"${item.id === child.id ? ' selected' : ''}>${html(item.name)}</option>`).join('')}</select></div>
    <div class="field"><label>Направление</label><select class="select" id="pf-enrollment" onchange="icubeApi.updatePaymentPrice(${existing?.id ?? 'null'})" ${historical ? 'disabled' : ''}>${historical ? `<option value="${existing.enrollmentId}">${html(existing.direction)}</option>` : ''}</select></div>
    <div class="field"><label>Сумма, ₽</label><input class="input" id="pf-amount" type="number" min="0.01" step="0.01" value="${html(existing?.amount ?? '')}" oninput="icubeApi.updatePaymentCalc()"></div>
    <div class="field"><label>Цена занятия, ₽</label><input class="input" id="pf-price" type="number" min="0.01" step="0.01" value="${html(existing?.price ?? '')}" readonly></div>
    <div class="field"><label>Способ оплаты</label><select class="select" id="pf-method"><option value="cashless"${(existing?.methodCode ?? 'cashless') === 'cashless' ? ' selected' : ''}>Безналичный расчёт</option><option value="cash"${existing?.methodCode === 'cash' ? ' selected' : ''}>Наличные</option></select></div>
    ${existing ? '' : '<div class="field span-2" id="pf-receipt-field"></div>'}
    </div><div class="notice" id="pf-calc" style="margin-top:14px"></div>
    ${existing ? `<div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap">${Number(existing.refundableAmount) > 0 ? `<button class="btn" onclick="icubeApi.refundForm(${existing.id})">Оформить возврат</button>` : ''}<button class="btn danger" onclick="icubeApi.deletePaymentPrompt(${existing.id})">Удалить оплату</button></div>` : ''}
    <div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn primary" id="pf-submit" onclick="icubeApi.savePayment(${existing?.id ?? 'null'})">${existing ? 'Сохранить изменения' : 'Сохранить оплату'}</button></div>`;
  legacy.render();
  if (historical) setTimeout(updatePaymentCalc, 0);
  else setTimeout(() => { refreshPaymentDirections(existing?.id ?? null, preferred); window.icubePaymentReceipts?.refreshCandidates?.(); }, 0);
}

function refreshPaymentDirections(paymentId, preferredEnrollmentId) {
  const child = legacy.state.children.find((item) => item.id === Number(value('#pf-child')));
  const select = element('#pf-enrollment');
  if (!select) return;
  select.innerHTML = (child?.enrollments ?? []).filter((enrollment) => enrollment.editable !== false)
    .map((enrollment) => `<option value="${enrollment.id}"${enrollment.id === Number(preferredEnrollmentId) ? ' selected' : ''}>${html(enrollment.direction)}</option>`).join('');
  if (!select.innerHTML) select.innerHTML = '<option value="">Нет направлений</option>';
  updatePaymentPrice(paymentId);
}

async function updatePaymentPrice(paymentId) {
  const sequence = ++paymentQuoteSequence;
  const existing = paymentId ? legacy.state.payments.find((payment) => payment.id === Number(paymentId)) : null;
  const enrollment = paymentEnrollment(value('#pf-child'), value('#pf-enrollment'));
  const priceInput = element('#pf-price');
  const enrollmentId = value('#pf-enrollment');
  const needsQuote = !existing || String(existing.enrollmentId) !== String(enrollmentId);
  if (priceInput && !needsQuote) priceInput.value = String(existing.price);
  if (priceInput && needsQuote) {
    priceInput.value = '';
    updatePaymentCalc();
    const date = value('#pf-date');
    if (enrollment && date) {
      try {
        const quote = await api.request(`/enrollments/${encodeURIComponent(enrollmentId)}/payment-quote?paidOn=${encodeURIComponent(date)}`);
        if (sequence !== paymentQuoteSequence || element('#pf-price') !== priceInput) return;
        priceInput.value = quote.currentPrice;
      } catch (error) {
        if (sequence !== paymentQuoteSequence || element('#pf-price') !== priceInput) return;
        const box = element('#pf-calc'); if (box) box.textContent = error.message;
        return;
      }
    }
  }
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
  if (paymentSavePending) return;
  paymentSavePending = true;
  const submit = element('#pf-submit'); const originalText = submit?.textContent;
  if (submit) { submit.disabled = true; submit.textContent = 'Сохраняем…'; }
  try {
    const existing = paymentId ? legacy.state.payments.find((payment) => payment.id === Number(paymentId)) : null;
    const body = { enrollmentId: value('#pf-enrollment'), paidOn: value('#pf-date'), amount: value('#pf-amount'), method: value('#pf-method') };
    if (!existing && value('#pf-receipt')) body.receiptId = value('#pf-receipt');
    if (existing) body.priceSnapshot = String(existing.price);
    const saved = paymentId ? await api.update('payments', paymentId, body) : await api.create('payments', body, paymentCreateKey);
    await reload({ render: false });
    legacy.state.selectedChild = Number(saved.childId); legacy.state.childTab = 'payments'; legacy.state.modal = null;
    legacy.state.page = legacy.state.children.some((child) => child.id === Number(saved.childId)) ? 'child' : 'payments'; legacy.render();
    if (!paymentId) paymentCreateKey = null;
  } catch (error) { fail(error); }
  finally {
    paymentSavePending = false;
    const current = element('#pf-submit'); if (current) { current.disabled = false; current.textContent = originalText || 'Сохранить'; }
  }
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
  const todayIso = businessDate();
  refundCreateKey = operationKey(); refundSavePending = false;
  legacy.state.modal = `<h3>Возврат оплаты</h3><div class="form-grid">
    <div class="field span-2"><label>Оплата</label><select class="select" id="rf-payment" onchange="icubeApi.refreshRefundMaximum()">${available.map((payment) => `<option value="${payment.id}"${payment.id === selected.id ? ' selected' : ''}>${html(payment.date)} · ${html(payment.direction)} · ${html(payment.amount)} ₽</option>`).join('')}</select></div>
    <div class="field"><label>Дата возврата</label><input class="input" id="rf-date" type="date" value="${todayIso}"></div>
    <div class="field"><label>Сумма, ₽</label><input class="input" id="rf-amount" type="number" min="0.01" step="0.01" value="${html(selected.refundableAmount)}"></div>
    </div><div class="notice" id="rf-max" style="margin-top:14px"></div><div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn primary" id="rf-submit" onclick="icubeApi.saveRefund()">Сохранить возврат</button></div>`;
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
  if (refundSavePending) return;
  refundSavePending = true;
  const submit = element('#rf-submit'); const originalText = submit?.textContent;
  if (submit) { submit.disabled = true; submit.textContent = 'Сохраняем…'; }
  try {
    const saved = await api.create('refunds', { paymentId: String(payment.id), refundedOn: value('#rf-date'), amount: value('#rf-amount') }, refundCreateKey);
    await reload({ render: false });
    legacy.state.selectedChild = Number(saved.childId); legacy.state.childTab = 'refunds'; legacy.state.modal = null;
    legacy.state.page = legacy.state.children.some((child) => child.id === Number(saved.childId)) ? 'child' : 'refunds'; legacy.render();
    refundCreateKey = null;
  } catch (error) { fail(error); }
  finally {
    refundSavePending = false;
    const current = element('#rf-submit'); if (current) { current.disabled = false; current.textContent = originalText || 'Сохранить'; }
  }
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
function localChildId() { return -(Date.now() * 1000 + localChildSequence++ % 1000); }

function applyLessonAction(action) {
  const lesson = legacy.state.lessons.find((item) => String(item.id) === String(action.lessonId));
  if (!lesson) return;
  const childId = action.childId == null ? null : Number(action.childId);
  if (action.type === 'start') {
    lesson.started = true; lesson.status = 'Идёт'; lesson.groupRosterFrozenV146 = true;
    if (!(lesson.groupChildIdsV146 ?? []).length) {
      lesson.groupChildIdsV146 = (lesson.effectiveGroupChildIds ?? legacy.state.children.filter((child) => (child.enrollments ?? []).some((enrollment) =>
        Number(enrollment.groupId) === Number(lesson.groupId) && ['Активный', 'active', 'Лид', 'lead'].includes(enrollment.status))).map((child) => Number(child.id)));
    }
    for (const id of lesson.groupChildIdsV146) {
      if (!Object.prototype.hasOwnProperty.call(lesson.attendance ?? {}, id)) lesson.attendance[id] = false;
      if (!Object.prototype.hasOwnProperty.call(lesson.trialChildren ?? {}, id)) lesson.trialChildren[id] = false;
    }
  } else if (action.type === 'attendance') {
    const extra = (lesson.extras ?? []).find((item) => Number(item.childId) === childId);
    if (extra) { extra.present = Boolean(action.body.present); extra.trial = Boolean(action.body.trial); }
    else { lesson.attendance[childId] = Boolean(action.body.present); lesson.trialChildren[childId] = Boolean(action.body.trial); }
  } else if (action.type === 'add-extra') {
    if (!(lesson.extras ?? []).some((item) => Number(item.childId) === childId)) lesson.extras.push({ childId, enrollmentId: action.body?.enrollmentId, present: true, trial: true });
  } else if (action.type === 'remove-extra') {
    lesson.extras = (lesson.extras ?? []).filter((item) => Number(item.childId) !== childId);
  } else if (action.type === 'quick-child') {
    const tempId = Number(action.tempChildId);
    if (!legacy.state.children.some((child) => Number(child.id) === tempId)) legacy.state.children.push({
      id: tempId, name: action.body.name, birth: '', school: '', grade: '', parent: '', phone: action.body.phone ?? '', status: 'Лид', note: '',
      needsDirectorReview: true, createdByTeacher: true, enrollments: [],
    });
    if (!(lesson.extras ?? []).some((item) => Number(item.childId) === tempId)) lesson.extras.push({ childId: tempId, present: true, trial: false, createdByTeacher: true });
  } else if (action.type === 'finish') {
    lesson.done = true; lesson.started = true; lesson.status = 'Проведено'; lesson.attendanceApplied = true;
  }
}

async function reapplyQueuedLessonState(lessonId = null) {
  if (!lessonActions) return;
  const actions = await lessonActions.optimisticRecords(lessonId);
  for (const action of actions) applyLessonAction(action);
}

async function resolveLocalChild(_lessonId, localId, serverId) {
  const localNumber = Number(localId); const serverNumber = Number(serverId);
  const local = legacy.state.children.find((child) => Number(child.id) === localNumber);
  const existing = legacy.state.children.find((child) => Number(child.id) === serverNumber);
  if (local && existing) legacy.state.children = legacy.state.children.filter((child) => child !== local);
  else if (local) local.id = serverNumber;
  for (const lesson of legacy.state.lessons) {
    for (const extra of lesson.extras ?? []) if (Number(extra.childId) === localNumber) extra.childId = serverNumber;
    if (Object.prototype.hasOwnProperty.call(lesson.attendance ?? {}, localNumber)) {
      lesson.attendance[serverNumber] = lesson.attendance[localNumber]; delete lesson.attendance[localNumber];
    }
    if (Object.prototype.hasOwnProperty.call(lesson.trialChildren ?? {}, localNumber)) {
      lesson.trialChildren[serverNumber] = lesson.trialChildren[localNumber]; delete lesson.trialChildren[localNumber];
    }
  }
  if (window.icubePhotos?.remapChildId) {
    await window.icubePhotos.remapChildId(localId, serverId);
    await lessonActions.acknowledgeMapping(localId);
  }
}

async function sendLessonAction(action) {
  const lessonId = encodeURIComponent(action.lessonId); const childId = action.childId == null ? null : encodeURIComponent(action.childId);
  const command = (path, options) => api.request(path, { ...options, expectedActorId: action.ownerId });
  if (action.type === 'start') return command(`/lessons/${lessonId}/start`, { method: 'POST', body: action.body });
  if (action.type === 'attendance') return command(`/lessons/${lessonId}/attendance/${childId}`, { method: 'PUT', body: action.body });
  if (action.type === 'add-extra') return command(`/lessons/${lessonId}/extras`, { method: 'POST', body: { childId: Number(action.childId), enrollmentId: action.body?.enrollmentId } });
  if (action.type === 'remove-extra') return command(`/lessons/${lessonId}/extras/${childId}`, { method: 'DELETE' });
  if (action.type === 'quick-child') return command(`/lessons/${lessonId}/quick-child`, { method: 'POST', body: action.body, idempotencyKey: action.id });
  if (action.type === 'finish') {
    if (action.body.topic) await command(`/lessons/${lessonId}`, { method: 'PATCH', body: { topic: action.body.topic } });
    return command(`/lessons/${lessonId}/finish`, { method: 'POST', body: {} });
  }
  throw new Error('Неизвестная команда занятия');
}

async function refreshAfterLessonSync(lessonIds) {
  const selected = currentLesson()?.id;
  if (selected && lessonIds.some((id) => String(id) === String(selected))) {
    await reloadLesson(selected, legacy.state.page);
    return;
  }
  if (authProfile?.roles?.includes('teacher') && !authProfile.roles.includes('director')) await reloadTeacher({ render: true });
}

function setLessonSyncStatus(status, items = []) {
  const rejected = items.find((item) => item.state === 'error' && lessonActions.owns(item));
  legacy.state.lessonSyncStatus = { ...status, errorMessage: rejected?.lastError ?? null };
  if (legacy.state.page === 'teacherLesson' && globalThis.window && typeof globalThis.window.teacherShell === 'function'
    && globalThis.document?.querySelector?.('#app')) legacy.render();
}

const lessonActions = createLessonActionQueue({ store: globalThis.indexedDB ? undefined : createMemoryLessonActionStore(), send: sendLessonAction, onStatus: setLessonSyncStatus,
  getOwner: () => authProfile?.id ?? null,
  onConflict: (action, error) => error.code === 'LESSON_ACTOR_CHANGED'
    ? showLogin(error.message) : refreshAfterLessonSync([action.lessonId]),
  onChildResolved: resolveLocalChild, onSynced: refreshAfterLessonSync });

async function queueLessonAction(action, { closeModal = false } = {}) {
  lessonActionPending += 1;
  try {
    const record = await lessonActions.enqueue(action); applyLessonAction(record);
    if (closeModal) legacy.state.modal = null;
    legacy.render(); await lessonActions.sync();
  } catch (error) { fail(error); }
  finally { lessonActionPending -= 1; }
}

async function reloadLesson(lessonId, page = legacy.state.page, { refresh = true } = {}) {
  if (refresh) await reload({ render: false });
  if (!legacy.state.lessons.some((lesson) => lesson.id === Number(lessonId))) {
    const lesson = await api.get('lessons', lessonId);
    legacy.state.lessons.push(mapLesson(lesson));
  }
  await reapplyQueuedLessonState(lessonId);
  legacy.state.selectedLesson = Number(lessonId); legacy.state.page = page; legacy.state.modal = null;
  await window.icubePhotos?.loadLessonPhotos(lessonId, { render: false }); legacy.render();
}
async function lessonCommand(path, body, page = legacy.state.page) {
  const lessonId = currentLesson()?.id;
  if (!lessonId) return;
  try { await api.request(`/lessons/${lessonId}/${path}`, { method: 'POST', body: body ?? {} }); await reloadLesson(lessonId, page); }
  catch (error) { fail(error); }
}

function cacheCalendarLesson(mappedLesson) {
  const index = legacy.state.lessons.findIndex((item) => Number(item.id) === Number(mappedLesson.id));
  if (index >= 0) legacy.state.lessons[index] = mappedLesson;
  else legacy.state.lessons.push(mappedLesson);
  return mappedLesson;
}

function serverLessonForOccurrence(items, key) {
  for (const item of items ?? []) {
    const mapped = mapLesson(item);
    if (mapped.occurrenceKey === key) return mapped;
  }
  return null;
}

async function openCalendarEvent(key, role) {
  try {
    const [groupId, ...dateParts] = String(key).split('|');
    const [scheduledRuDate, scheduledStartTime] = dateParts;
    if (!groupId || !scheduledRuDate) throw new Error('Некорректное событие календаря');
    const date = ruToIso(scheduledRuDate);

    if (role === 'foreign-template') {
      const group = legacy.state.calendarForeignGroups.find((item) => String(item.id) === groupId);
      const day = new Date(`${date}T12:00:00`);
      const event = window.sharedCalendarEvents?.(day, day, null).find((item) => item.key === key && !item.lesson);
      if (!group || !event) throw new Error('Событие календаря не найдено');
      legacy.state.modal = `<h3>${html(groupDisplayName(group))}</h3><div class="info-list">
        <div class="info-line"><span>Проект</span><b>${html(group.project)}</b></div>
        <div class="info-line"><span>Дата и время</span><b>${html(event.date)} · ${html(event.time)}</b></div>
        <div class="info-line"><span>Преподаватель</span><b>${html(group.teacherName)}</b></div>
        <div class="info-line"><span>Площадка</span><b>${html(group.siteName)}</b></div></div>
        <div class="modal-actions"><button class="btn" onclick="closeModal()">Закрыть</button></div>`;
      legacy.render(); return;
    }

    let lesson = legacy.state.lessons.find((item) => item.occurrenceKey === key);
    if (!lesson) {
      const loaded = await api.list('lessons', `?from=${encodeURIComponent(date)}&to=${encodeURIComponent(date)}`);
      lesson = serverLessonForOccurrence(loaded, key);
      if (lesson) cacheCalendarLesson(lesson);
    }
    if (!lesson && role === 'director') {
      const created = mapLesson(await api.create('lessons', { groupId, scheduledDate: date, ...(scheduledStartTime ? { startTime: scheduledStartTime } : {}) }));
      if (created.occurrenceKey !== key) {
        const loaded = await api.list('lessons', `?from=${encodeURIComponent(date)}&to=${encodeURIComponent(date)}`);
        lesson = serverLessonForOccurrence(loaded, key);
      } else lesson = created;
      if (lesson) cacheCalendarLesson(lesson);
    }
    if (!lesson) throw new Error('Не удалось открыть занятие для выбранного события календаря');
    if (lesson.readOnly) {
      legacy.state.modal = `<h3>${html(displayGroup(lesson.groupId, lesson.groupName))}</h3><div class="info-list">
        <div class="info-line"><span>Проект</span><b>${html(lesson.project)}</b></div>
        <div class="info-line"><span>Дата и время</span><b>${html(lesson.date)} · ${html(lesson.time)}</b></div>
        <div class="info-line"><span>Преподаватель</span><b>${html(lesson.teacherName)}</b></div>
        <div class="info-line"><span>Площадка</span><b>${html(lesson.siteName)}</b></div></div>
        <div class="modal-actions"><button class="btn" onclick="closeModal()">Закрыть</button></div>`;
      legacy.render(); return;
    }
    if (role === 'teacher' && temporaryTeacherParentRole() && lesson.teacherId) legacy.state.prototypeTeacherId = Number(lesson.teacherId);
    legacy.state.selectedLesson = lesson.id; legacy.state.page = role === 'teacher' ? 'teacherLesson' : 'lesson';
    try { legacy.render(); }
    catch (error) { console.error('Не удалось отрисовать открытое занятие', error); }
    try {
      await window.icubePhotos?.loadLessonPhotos(lesson.id, { render: false });
      legacy.render();
    } catch (error) {
      console.error('Не удалось загрузить фотографии занятия', error);
    }
  } catch (error) { fail(error); }
}

async function startLessonApi() {
  const lesson = currentLesson(); if (!lesson) return;
  const teacherId = legacy.state.role === 'teacher' && typeof window.currentPrototypeTeacherId === 'function'
    ? Number(window.currentPrototypeTeacherId() || lesson.teacherId) : lesson.teacherId;
  await queueLessonAction({ type: 'start', lessonId: lesson.id, body: { actualTeacherId: teacherId } });
}

async function putAttendance(childId, present, trial) {
  const lesson = currentLesson(); if (!lesson) return;
  await queueLessonAction({ type: 'attendance', lessonId: lesson.id, childId: Number(childId), body: { present: Boolean(present), trial: Boolean(trial) } });
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

async function addExtraApi(childId, enrollmentId) {
  const lesson = currentLesson(); if (!lesson) return;
  const projectId = lesson.projectId ?? legacy.state.groups.find((group) => group.id === lesson.groupId)?.projectId;
  const available = (legacy.state.children.find((child) => Number(child.id) === Number(childId))?.enrollments ?? []).filter((e) => Number(e.projectId) === Number(projectId) && ['Активный', 'active', 'Лид', 'lead'].includes(e.status) && e.editable !== false);
  const selected = available.find((e) => Number(e.id) === Number(enrollmentId));
  if (!selected) return window.alert('Выберите доступное направление ребёнка.');
  if (!lesson.isMixed && Number(selected.directionId) !== Number(lesson.directionId)) {
    const hasLessonDirection = available.some((e) => Number(e.directionId) === Number(lesson.directionId));
    legacy.state.modal = `<h3>Направление не совпадает</h3><div class="notice">Это занятие группы «${html(lesson.direction)}», а у ребёнка выбрано направление «${html(selected.direction)}». Если продолжить, обычное посещение будет списано с баланса «${html(selected.direction)}».</div>
      <div class="modal-actions" style="flex-wrap:wrap">${hasLessonDirection ? '' : `<button class="btn" onclick="icubeApi.makeExtraTrialDirection(${Number(childId)})">Создать направление «${html(lesson.direction)}» и сделать ознакомительным</button>`}
      <button class="btn primary" onclick="icubeApi.continueExtra(${Number(childId)},${Number(selected.id)})">Продолжить</button><button class="btn" onclick="closeModal()">Отмена</button></div>`;
    legacy.render(); return;
  }
  await continueExtraApi(childId, selected.id);
}
async function continueExtraApi(childId, enrollmentId) {
  const lesson = currentLesson(); if (!lesson) return;
  await queueLessonAction({ type: 'add-extra', lessonId: lesson.id, childId: Number(childId), body: { childId: Number(childId), enrollmentId: Number(enrollmentId) } }, { closeModal: true });
}
async function makeExtraTrialDirectionApi(childId) {
  const lesson = currentLesson(); if (!lesson) return;
  try {
    await lessonActions.sync();
    await api.request(`/lessons/${encodeURIComponent(lesson.id)}/extras/${encodeURIComponent(childId)}/trial-direction`, { method: 'POST' });
    const page = legacy.state.page;
    await reload({ render: false });
    await reloadLesson(lesson.id, page, { refresh: false });
  } catch (error) { fail(error); }
}
function extraOptionsApi(childId) {
  const lesson = currentLesson(); const extra = lesson?.extras.find((item) => item.childId === Number(childId)); if (!extra) return;
  const child = legacy.state.children.find((item) => item.id === Number(childId));
  const projectId = lesson.projectId;
  const hasDirection = (child?.enrollments ?? []).some((item) => Number(item.projectId) === Number(projectId) && Number(item.directionId) === Number(lesson.directionId) && ['Активный', 'active', 'Лид', 'lead'].includes(item.status) && item.editable !== false);
  legacy.state.modal = `<h3>Дополнительные действия</h3><div class="modal-actions" style="flex-wrap:wrap">
    <button class="btn" onclick="icubeApi.extraTrial(${Number(childId)},${extra.trial ? 'false' : 'true'})">${extra.trial ? 'Сделать обычным' : 'Сделать ознакомительным'}</button>
    ${!lesson.isMixed && !hasDirection ? `<button class="btn" onclick="icubeApi.makeExtraTrialDirection(${Number(childId)})">Добавить направление «${html(lesson.direction)}» и сделать ознакомительным</button>` : ''}
    <button class="btn danger" onclick="icubeApi.extraRemove(${Number(childId)})">Удалить из занятия</button>
    <button class="btn" onclick="closeModal()">Отмена</button></div>`;
  legacy.render();
}
async function extraTrialApi(childId, trial) {
  legacy.state.modal = null;
  await toggleTrialApi(childId, trial, true);
}
async function extraRemoveApi(childId) {
  legacy.state.modal = null;
  await removeExtraApi(childId);
}
async function removeExtraApi(childId) {
  const lesson = currentLesson(); if (!lesson) return;
  await queueLessonAction({ type: 'remove-extra', lessonId: lesson.id, childId: Number(childId), body: { childId: Number(childId) } });
}

async function saveQuickChildApi() {
  const lesson = currentLesson(); if (!lesson) return;
  const name = value('#tqc-name').trim(); const phone = value('#tqc-phone').trim();
  if (!name) return window.alert('Укажите фамилию и имя ребёнка.');
  const tempChildId = localChildId();
  await queueLessonAction({ type: 'quick-child', lessonId: lesson.id, tempChildId: String(tempChildId), body: { name, phone: phone || null, ...(lesson.isMixed ? { directionName: value('#tqc-direction') || 'Робототехника' } : {}) } }, { closeModal: true });
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
  const hasPhoto = (id) => window.icubePhotos?.hasPhoto ? window.icubePhotos.hasPhoto(lesson, id) : Boolean(lesson.photos?.[id]);
  const missing = present.filter((id) => !hasPhoto(id)).length;
  const pending = window.icubePhotos?.pendingCount?.(lesson) ?? 0;
  if (missing) {
    legacy.state.modal = `<h3>Не у всех есть фотографии</h3><div class="notice">У ${missing} детей отсутствуют фотографии. Всё равно завершить занятие?${pending ? `<br><br>${pending} фото ожидают загрузки и будут отправлены при восстановлении интернета.` : ''}</div><div class="modal-actions"><button class="btn" onclick="closeModal()">Вернуться</button><button class="btn primary" onclick="icubeApi.confirmFinishLesson()">Завершить всё равно</button></div>`;
    legacy.render(); return;
  }
  if (pending) {
    legacy.state.modal = `<h3>Фото ожидают загрузки</h3><div class="notice">${pending} фото сохранены на устройстве и будут отправлены при восстановлении интернета. Занятие можно завершить.</div><div class="modal-actions"><button class="btn" onclick="closeModal()">Вернуться</button><button class="btn primary" onclick="icubeApi.confirmFinishLesson()">Завершить занятие</button></div>`;
    legacy.render(); return;
  }
  await confirmFinishLessonApi();
}
async function cancelCurrentLessonApi() { await lessonCommand('cancel', {}, legacy.state.role === 'teacher' ? 'teacherLesson' : 'lesson'); }
async function markCurrentLessonEmptyTripApi() { await lessonCommand('empty-trip', {}, 'lesson'); }

function renderAddChildrenListApi() {
  const group = legacy.state.groups.find((g) => Number(g.id) === Number(legacy.state.addChildrenGroupId));
  const box = element('#ac-list'); if (!group || !box) return;
  const filter = value('#ac-filter') || 'active';
  const candidates = legacy.state.children.flatMap((child) => {
    return child.enrollments.filter((e) => Number(e.projectId) === Number(group.projectId) && (filter === 'active' ? ['Активный','active'].includes(e.status) : filter === 'leads' ? ['Лид','lead'].includes(e.status) : filter !== 'pause' && ['Активный','active','Лид','lead'].includes(e.status)) && e.groupId == null && (group.isMixed || e.direction === group.direction)).map((enrollment) => ({ child, enrollment }));
  });
  box.innerHTML = candidates.length ? candidates.map(({ child, enrollment }) => `<label class="student-check"><input type="checkbox" class="ac-check" value="${child.id}" data-enrollment="${enrollment.id}" onchange="updateAddChildrenCount()"><div><b>${html(child.name)}</b><div class="muted mini">${html(enrollment.direction)}</div></div></label>`).join('') : '<div class="empty">Нет подходящих детей без основной группы.</div>';
  window.updateAddChildrenCount();
}
async function confirmAddChildrenApi() {
  const group = legacy.state.groups.find((item) => item.id === Number(legacy.state.addChildrenGroupId));
  if (!group) return;
  const childIds = Array.from(document.querySelectorAll('.ac-check:checked')).map((input) => Number(input.value));
  if (group.isIndividual) {
    const currentIds = legacy.state.children.filter((child) => child.enrollments.some((enrollment) => Number(enrollment.groupId) === Number(group.id))).map((child) => child.id);
    if (new Set([...currentIds, ...childIds]).size > 1) return window.alert('В индивидуальной группе может быть только один текущий ребёнок');
  }
  const enrollments = Array.from(document.querySelectorAll('.ac-check:checked')).map((input) => legacy.state.children.find((child) => child.id === Number(input.value))?.enrollments.find((enrollment) => input.dataset?.enrollment ? Number(enrollment.id) === Number(input.dataset?.enrollment) : enrollment.direction === group.direction)).filter(Boolean);
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
  await queueLessonAction({ type: 'finish', lessonId: lesson.id, body: { topic } }, { closeModal: true });
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
    const body = key === 'emptyTrip'
      ? { emptyTrip: Boolean(enabled), ...(enabled ? { introGroup: false } : {}) }
      : { introGroup: Boolean(enabled), ...(enabled ? { emptyTrip: false } : {}) };
    await api.update('lessons', lesson.id, body);
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

// Historical corrections use online transactions, never the teacher offline queue.
let visitDraft = null;
const canCorrectVisit = () => ['director', 'partner'].includes(legacy.state.role);
const visitLessonLabel = (lesson) => `${isoToRu(timestampDate(lesson.startsAt))} · ${timestampTime(lesson.startsAt)}–${timestampTime(lesson.endsAt)} · ${lesson.groupName}`;
function visitDirections(draft) {
  const child = legacy.state.children.find((item) => item.id === draft.childId);
  return [...(child?.enrollments ?? []), ...(child?.enrollmentHistory ?? [])]
    .filter((enrollment, index, all) => enrollment.editable !== false && String(enrollment.projectId) === String(draft.target.projectId)
      && all.findIndex((item) => item.id === enrollment.id) === index);
}
async function editVisit(childId, lessonId) {
  if (!canCorrectVisit()) return;
  try {
    const source = await api.get('lessons', lessonId);
    const attendance = source.attendances.find((item) => Number(item.childId) === Number(childId) && item.present);
    if (!attendance?.correctionVersion) throw new Error('Посещение изменилось. Обновите историю ребёнка.');
    const mapped = mapLesson(source); const index = legacy.state.lessons.findIndex((item) => item.id === mapped.id);
    if (index < 0) legacy.state.lessons.push(mapped); else legacy.state.lessons[index] = mapped;
    visitDraft = { childId: Number(childId), source, target: source, enrollmentId: String(attendance.enrollmentId), trial: attendance.trial,
      expectedRevision: attendance.correctionVersion, key: operationKey(), month: timestampDate(source.startsAt).slice(0, 7),
      date: timestampDate(source.startsAt), lessons: [source], calendar: false, pending: false, error: '' };
    renderVisitEdit();
  } catch (error) { fail(error); }
}
function renderVisitEdit() {
  const draft = visitDraft; if (!draft || !canCorrectVisit()) return;
  const disabled = draft.pending ? ' disabled' : '';
  const directions = visitDirections(draft);
  legacy.state.modal = `<h3>Изменить посещение</h3><div id="visit-edit-form">
    ${draft.error ? `<div class="notice">${html(draft.error)}</div>` : ''}
    <div class="field"><label>Направление</label><select class="select" id="visit-enrollment" onchange="icubeApi.changeVisitField('enrollmentId',this.value)"${disabled}>
    ${directions.some((item) => String(item.id) === draft.enrollmentId) ? '' : '<option value="">Выберите направление</option>'}
    ${directions.map((item) => `<option value="${item.id}"${String(item.id) === draft.enrollmentId ? ' selected' : ''}>${html(item.direction)}</option>`).join('')}</select>
    <div class="muted mini">Если нужного направления нет, сначала добавьте его ребёнку.</div></div>
    <div class="field"><label>Занятие</label><div>${html(visitLessonLabel(draft.target))}</div>
    <button class="btn soft" onclick="icubeApi.visitCalendarMonth(0)"${disabled}>Выбрать другое занятие</button></div>
    ${draft.calendar ? renderVisitCalendar(draft) : ''}
    <label class="field"><span><input type="checkbox" id="visit-trial" onchange="icubeApi.changeVisitField('trial',this.checked)"${draft.trial ? ' checked' : ''}${disabled}> Ознакомительное посещение</span></label>
    <button class="btn" onclick="icubeApi.openVisitLesson()"${disabled}>Открыть занятие</button>
    <div style="margin-top:16px"><button class="btn danger" onclick="icubeApi.deleteEditedVisit()"${disabled}>Удалить посещение</button></div>
    <div class="modal-actions"><button class="btn" onclick="closeModal()"${disabled}>Отмена</button><button class="btn primary" id="visit-submit" onclick="icubeApi.saveVisitEdit()"${disabled}>${draft.pending ? 'Сохраняем…' : 'Сохранить'}</button></div></div>`;
  legacy.render();
}
function renderVisitCalendar(draft) {
  const [year, month] = draft.month.split('-').map(Number);
  const first = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const days = new Set(draft.lessons.map((item) => timestampDate(item.startsAt)));
  const disabled = draft.pending ? ' disabled' : '';
  return `<div class="card"><div class="toolbar"><button class="btn" onclick="icubeApi.visitCalendarMonth(-1)"${disabled}>←</button><b>${html(draft.month)}</b><button class="btn" onclick="icubeApi.visitCalendarMonth(1)"${disabled}>→</button></div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px">${dayShortNames.map((name) => `<span class="muted mini">${name}</span>`).join('')}${'<span></span>'.repeat(first)}
    ${Array.from({ length: count }, (_, index) => {
      const date = `${draft.month}-${String(index + 1).padStart(2, '0')}`;
      return `<button class="btn ${date === draft.date ? 'primary' : days.has(date) ? 'soft' : ''}" onclick="icubeApi.visitCalendarDate('${date}')"${!days.has(date) || draft.pending ? ' disabled' : ''}>${index + 1}</button>`;
    }).join('')}</div><div class="list" style="margin-top:12px">${draft.lessons.filter((item) => timestampDate(item.startsAt) === draft.date).map((item) =>
      `<button class="btn${String(item.id) === String(draft.target.id) ? ' primary' : ''}" onclick="icubeApi.chooseVisitLesson('${item.id}')"${disabled}>${html(visitLessonLabel(item))}<span class="muted mini"> · ${html(item.directionName)} · ${html(item.siteName ?? '')}</span></button>`).join('') || '<div class="empty">Выберите дату с доступными занятиями.</div>'}</div></div>`;
}
async function visitCalendarMonth(offset) {
  const draft = visitDraft; if (!draft || draft.pending || !canCorrectVisit()) return;
  const [year, month] = draft.month.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 10);
  const last = new Date(Date.UTC(year, month + offset, 0)).toISOString().slice(0, 10);
  draft.month = first.slice(0, 7); draft.calendar = true; draft.error = '';
  draft.lessons = timestampDate(draft.source.startsAt).startsWith(draft.month) ? [draft.source] : [];
  const requestedMonth = draft.month;
  renderVisitEdit();
  try {
    const lessons = await api.request(`/children/${draft.childId}/attendance-correction-lessons?from=${first}&to=${last}`);
    if (visitDraft !== draft || draft.month !== requestedMonth || !legacy.state.modal?.includes('visit-edit-form')) return;
    draft.lessons = lessons;
    if (timestampDate(draft.source.startsAt).startsWith(draft.month)) draft.lessons = [draft.source, ...lessons.filter((item) => String(item.id) !== String(draft.source.id))];
    renderVisitEdit();
  } catch (error) { if (visitDraft === draft && draft.month === requestedMonth && legacy.state.modal?.includes('visit-edit-form')) { draft.error = error.message; renderVisitEdit(); } }
}
function visitCalendarDate(date) {
  if (!visitDraft || visitDraft.pending || !visitDraft.lessons.some((item) => timestampDate(item.startsAt) === date)) return;
  visitDraft.date = date; renderVisitEdit();
}
function chooseVisitLesson(id) {
  if (!visitDraft || visitDraft.pending) return;
  const lesson = visitDraft.lessons.find((item) => String(item.id) === String(id)); if (!lesson) return;
  visitDraft.target = lesson;
  if (!visitDirections(visitDraft).some((item) => String(item.id) === visitDraft.enrollmentId)) visitDraft.enrollmentId = '';
  renderVisitEdit();
}
function changeVisitField(field, value) {
  if (!visitDraft || visitDraft.pending || !['enrollmentId', 'trial'].includes(field)) return;
  visitDraft[field] = value;
}
async function openVisitLesson() {
  const draft = visitDraft; if (!draft || draft.pending) return;
  try {
    const lesson = mapLesson(await api.get('lessons', draft.target.id));
    const index = legacy.state.lessons.findIndex((item) => item.id === lesson.id);
    if (index < 0) legacy.state.lessons.push(lesson); else legacy.state.lessons[index] = lesson;
    legacy.state.modal = null; legacy.state.selectedLesson = lesson.id; legacy.state.page = 'lesson'; legacy.render();
  } catch (error) { draft.error = error.message; renderVisitEdit(); }
}
function deleteEditedVisit() {
  if (!visitDraft || visitDraft.pending || !canCorrectVisit()) return;
  window.deleteVisitPrompt(visitDraft.childId, Number(visitDraft.source.id));
  legacy.state.modal = legacy.state.modal.replace('onclick="closeModal()"', 'onclick="icubeApi.renderVisitEdit()"');
  legacy.render();
}
async function saveVisitEdit() {
  const draft = visitDraft; if (!draft || draft.pending || !canCorrectVisit()) return;
  if (!visitDirections(draft).some((item) => String(item.id) === draft.enrollmentId)) { draft.error = 'Сначала добавьте нужное направление ребёнку и выберите его.'; renderVisitEdit(); return; }
  draft.pending = true; draft.error = ''; renderVisitEdit();
  try {
    await api.request(`/lessons/${draft.source.id}/attendance/${draft.childId}/correct`, { method: 'POST', idempotencyKey: draft.key,
      body: { targetLessonId: String(draft.target.id), enrollmentId: draft.enrollmentId, trial: draft.trial, expectedRevision: draft.expectedRevision, expectedTargetVersion: draft.target.lockVersion } });
    await reload({ render: false });
    // Include historical lessons outside the calendar's usual loading window.
    for (const id of new Set([draft.source.id, draft.target.id])) {
      const lesson = mapLesson(await api.get('lessons', id));
      const index = legacy.state.lessons.findIndex((item) => item.id === lesson.id);
      if (index < 0) legacy.state.lessons.push(lesson); else legacy.state.lessons[index] = lesson;
    }
    legacy.state.selectedChild = draft.childId; legacy.state.childTab = 'visits'; legacy.state.page = 'child'; legacy.state.modal = null;
    visitDraft = null; legacy.render(); window.alert('Посещение изменено');
  } catch (error) { draft.error = error.message; draft.pending = false; renderVisitEdit(); }
}

function salaryCalculationApi(lesson) {
  const salary = lesson?.salaryAccrual;
  if (!salary) return { type: 'Не начисляется', children: 0, fixed: 0, childrenPay: 0, total: 0, rates: {} };
  return { type: salary.type === 'empty_trip' ? 'Пустой выезд' : salary.type === 'intro' ? 'Ознакомительное занятие' : salary.type === 'attendance_share' ? 'Долевой расчёт' : 'Обычное занятие',
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
    return new Date(Date.UTC(year, (month || 1) - 1, day || 1, 12));
  };
  const parseRangeDate = (value) => {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate(), 12));
    }
    const [year, month, day] = String(value ?? '').slice(0, 10).split('-').map(Number);
    return new Date(Date.UTC(year, (month || 1) - 1, day || 1, 12));
  };
  const timeStart = (value) => String(value ?? '').split('–')[0];
  window.sharedCalendarEvents = function (startDate, endDate, teacherId) {
    const events = generatedEvents.apply(this, arguments);
    const start = parseRangeDate(startDate); const end = parseRangeDate(endDate);
    for (const lesson of legacy.state.lessons ?? []) {
      const actual = parseRuDate(lesson.date);
      if (actual < start || actual > end) continue;
      if (teacherId && Number(lesson.teacherId) !== Number(teacherId)) continue;
      const group = legacy.state.groups.find((item) => item.id === Number(lesson.groupId));
      if (!group && !lesson.readOnly) continue;
      const persisted = {
        key: lesson.occurrenceKey, groupId: lesson.groupId, groupName: groupDisplayName(group, lesson.groupName),
        project: group?.project ?? lesson.project, teacherId: lesson.teacherId,
        scheduledDate: lesson.scheduledDate, scheduledTime: lesson.scheduledTime, date: lesson.date, time: lesson.time,
        lesson, cancelled: lesson.cancelled, moved: lesson.moved, done: lesson.done,
      };
      const existing = events.findIndex((event) => (event.lesson && Number(event.lesson.id) === Number(lesson.id))
        || String(event.key) === String(lesson.occurrenceKey));
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
    <div class="brand" style="color:#111827;margin-bottom:22px"><div class="brand-mark">iC</div><div>АйКуб</div></div>
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
  const parent = !director && !partner && profile.roles.includes('parent');
  legacy.state.role = director ? 'director' : partner ? 'partner' : parent ? 'parent' : 'teacher';
  if (parent) {
    const app = element('#app');
    if (app) app.style.visibility = 'visible';
    return;
  }
  legacy.state.page = director || partner ? 'dashboard' : 'teacherToday';
  if (partner) { legacy.state.calendarProject = 'Зебра'; legacy.state.balanceProject = 'Зебра'; }
  if (profile.teacherId) legacy.state.prototypeTeacherId = Number(profile.teacherId);
  const app = element('#app');
  if (app) app.style.visibility = 'visible';
}

async function reconcileOfflineSnapshotIdentity(profile) {
  const snapshot = await loadTeacherOfflineSnapshot().catch(() => null);
  // Legacy commands have no provable actor. Keep them held across logins, even
  // when a snapshot exists: older sessions may have left commands in the same DB.
  if (snapshot && !teacherSnapshotMatchesProfile(snapshot, profile)) await clearTeacherOfflineSnapshot().catch(() => {});
}

function pushLinkParams() {
  const params = new URLSearchParams(globalThis.location?.search ?? '');
  const notificationId = params.get('pushNotification');
  if (!notificationId) return null;
  return {
    notificationId, destination: params.get('destination') ?? 'home',
    entityType: params.get('entityType'), entityId: params.get('entityId'),
  };
}

function clearPushLinkParams() {
  if (!globalThis.history?.replaceState || !globalThis.location) return;
  const url = new URL(globalThis.location.href);
  for (const key of ['pushNotification', 'destination', 'entityType', 'entityId']) url.searchParams.delete(key);
  history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

async function openNotificationDestination(link, profile = authProfile, { clearUrl = false } = {}) {
  if (!link || !profile) return false;
  const parentOnly = profile.roles.includes('parent') && !profile.roles.some((role) => ['director', 'partner', 'teacher'].includes(role));
  if (parentOnly) {
    await window.icubeParentPortal?.openPushDestination?.(link);
    if (clearUrl) clearPushLinkParams();
    return true;
  }

  if (link.notificationId) await api.request(`/notifications/${encodeURIComponent(link.notificationId)}/read`, { method: 'POST', body: {} }).catch(() => {});

  if (link.destination === 'crm-release' || link.entityType === 'crm_release') {
    const opened = await openReleaseNote(api, legacy);
    if (clearUrl) clearPushLinkParams();
    return opened;
  }

  const id = link.entityId == null ? null : Number(link.entityId);
  if ((link.destination === 'lesson' || link.entityType === 'lesson') && id) {
    let lesson = legacy.state.lessons.find((item) => Number(item.id) === id);
    if (!lesson && globalThis.navigator?.onLine !== false) {
      try { lesson = mapLesson(await api.get('lessons', id)); legacy.state.lessons.push(lesson); }
      catch (error) { console.error('Не удалось открыть занятие из push', error); }
    }
    if (lesson) {
      legacy.state.selectedLesson = id;
      legacy.state.page = legacy.state.role === 'teacher' ? 'teacherLesson' : 'lesson';
      if (legacy.state.role === 'teacher' && lesson.teacherId) legacy.state.prototypeTeacherId = Number(lesson.teacherId);
    }
  } else if ((link.destination === 'child' || link.entityType === 'child') && id
    && legacy.state.children.some((item) => Number(item.id) === id)) {
    legacy.state.selectedChild = id; legacy.state.page = 'child';
  } else if ((link.destination === 'group' || link.entityType === 'group') && id
    && legacy.state.groups.some((item) => Number(item.id) === id)) {
    legacy.state.selectedGroup = id; legacy.state.page = 'group';
  } else if ((link.destination === 'payment-receipt' || link.entityType === 'payment_receipt') && id) {
    legacy.state.page = 'payments';
    legacy.render();
    await window.icubePaymentReceipts?.open?.(id);
  } else if (legacy.state.role === 'teacher') legacy.state.page = 'teacherToday';
  else legacy.state.page = 'dashboard';

  legacy.render();
  if (clearUrl) clearPushLinkParams();
  return true;
}

async function handlePushDeepLink(profile = authProfile) {
  return openNotificationDestination(pushLinkParams(), profile, { clearUrl: true });
}

async function afterAuthenticatedLoad(profile) {
  if (window.icubePush?.rebind) await window.icubePush.rebind(profile).catch(console.error);
  await handlePushDeepLink(profile).catch((error) => console.error('Не удалось открыть push destination', error));
}

async function loginFromForm() {
  const submit = element('#auth-submit');
  if (submit) submit.disabled = true;
  try {
    const profile = await api.request('/auth/login', { method: 'POST', body: { login: value('#auth-login'), password: value('#auth-password') } });
    await reconcileOfflineSnapshotIdentity(profile);
    applyAuthProfile(profile);
    if (profile.roles.includes('parent') && !profile.roles.some((role) => ['director', 'partner', 'teacher'].includes(role))) await window.icubeParentPortal.start(profile);
    else await reload();
    await afterAuthenticatedLoad(profile);
    await window.icubePush?.maybeShowOnboardingAfterLogin?.();
    resolveAuthReady?.(profile);
    resolveAuthReady = null;
    return profile;
  } catch (error) {
    showLogin(error instanceof ApiError ? error.message : 'Не удалось войти');
    return null;
  }
}

async function logout() {
  // Let any already dispatched request finish under the current session before logout.
  await lessonActions.sync().catch(() => {});
  if (window.icubePush?.unbind) await window.icubePush.unbind().catch((error) => console.error('Не удалось отвязать push subscription', error));
  try { await api.request('/auth/logout', { method: 'POST' }); }
  catch (error) { if (!(error instanceof ApiError) || error.status !== 401) console.error(error); }
  await clearTeacherOfflineSnapshot().catch(() => {});
  showLogin();
}

function temporaryTeacherParentRole() {
  if (authProfile?.roles?.includes('director')) return 'director';
  if (authProfile?.roles?.includes('partner')) return 'partner';
  return null;
}
window.icubeTemporaryTeacherParentRole = temporaryTeacherParentRole;

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

function accountSettings() {
  legacy.state.modal = '<h3>Настройки</h3><div class="info-list"><button class="btn" onclick="window.icubePush?.openSettings()">Уведомления и приложение</button><button class="btn danger" onclick="icubeAuthLogout()">Выйти</button></div><div class="modal-actions"><button class="btn" onclick="closeModal()">Закрыть</button></div>';
  legacy.render();
}
window.icubeAccountSettings = accountSettings;
const originalAccountSettingsPage = window.settings;
window.settings = function(...args) {
  return originalAccountSettingsPage.apply(this,args) + '<div class="card pad" style="margin-top:16px"><h3>Учётная запись</h3><button class="btn danger" onclick="icubeAuthLogout()">Выйти</button></div>';
};

function installAuthenticatedShells() {
  const pushBell = () => { const unread = window.icubePush?.unread?.() ?? 0; return `<span class="notification-header-actions"><button class="push-bell-button" type="button" data-push-bell onclick="window.icubePush?.togglePanel(this)" aria-label="Уведомления" title="Уведомления"><span data-push-bell-icon>${window.icubePush?.icon?.() ?? '🔔'}</span><i data-notification-badge${unread ? '' : ' hidden'}>${unread}</i></button><button class="push-settings-button" type="button" onclick="icubeAccountSettings()" aria-label="Настройки" title="Настройки">⚙</button></span>`; };
  const originalShell = window.shell;
  if (typeof originalShell === 'function') {
    window.shell = function (...args) {
      const result = originalShell.apply(this, args);
      if (!authProfile) return result;
      const roleLabel = authProfile.roles.includes('director') ? 'Директор' : 'Партнёр';
      const account = `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:flex-end"><div><b>${html(authProfile.displayName)}</b><div class="muted mini">${roleLabel}</div></div>${pushBell()}</div>`;
      return result.replace(/<div><select class="role-switch"[\s\S]*?<\/select><div class="muted mini">Режим прототипа<\/div><\/div>/, account);
    };
  }
  window.teacherShell = function (content) {
    const parentRole = temporaryTeacherParentRole();
    const right = parentRole
      ? `<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end"><button class="btn" onclick="icubeReturnToHome()">Вернуться на главную</button>${pushBell()}</div>`
      : '';
    const teacherPushButton = parentRole ? '' : pushBell();
    const offline = legacy.state.offlineBootstrap || globalThis.navigator?.onLine === false;
    const offlineNotice = offline
      ? '<div class="notice" style="max-width:680px;margin:12px auto 0">Офлайн · изменения будут отправлены после подключения</div>'
      : '';
    return `<div class="teacher-shell"><div class="teacher-top"><div class="teacher-top-inner"><div><div class="mini" style="color:#98a2b3">АйКуб · Преподаватель</div><b>${html(teacherNameForShell())}</b></div><div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">${teacherPushButton}${right}</div></div>
      <div style="max-width:680px;margin:14px auto 0;display:flex;gap:8px"><button class="btn ${legacy.state.page === 'teacherToday' ? 'soft' : ''}" onclick="state.page='teacherToday';render()">Сегодня</button><button class="btn ${legacy.state.page === 'teacherCalendar' ? 'soft' : ''}" onclick="state.page='teacherCalendar';render()">Календарь</button></div>${offlineNotice}</div>
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
  if (!access) return `<div class="field span-2" style="border-top:1px solid var(--line);padding-top:14px"><label>Доступ в систему</label>
    <input class="input" id="teacher-access-login" type="email" autocomplete="off" placeholder="teacher@example.com">
    <input class="input" id="teacher-access-password" type="password" autocomplete="new-password" placeholder="Новый пароль" style="margin-top:8px">
    <button class="btn soft" type="button" style="margin-top:8px" onclick="icubeCreateTeacherAccess(${teacherId})">Создать доступ</button></div>`;
  const active = access.status === 'active';
  return `<div class="field span-2" style="border-top:1px solid var(--line);padding-top:14px"><label>Доступ в систему</label>
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
  if (!window.confirm('Отключить доступ преподавателя к системе?')) return;
  return refreshTeacherAccess(teacherId, () => api.request(`/teachers/${teacherId}/access`, { method: 'DELETE' }));
}

function showOfflineUnavailable() {
  authProfile = null;
  legacy.state.authUser = null;
  const app = element('#app');
  if (!app) return;
  app.style.visibility = 'visible';
  app.innerHTML = `<div style="min-height:100vh;display:grid;place-items:center;padding:20px;background:#f8fafc"><div class="card pad" style="width:min(100%,440px)">
    <div class="brand" style="color:#111827;margin-bottom:22px"><div class="brand-mark">iC</div><div>АйКуб</div></div>
    <h1 style="margin:0 0 8px">Нет подключения</h1>
    <div class="notice">Для первого входа и загрузки занятий требуется интернет.</div>
    <button class="btn primary" type="button" style="width:100%;margin-top:18px" onclick="location.reload()">Повторить</button>
  </div></div>`;
}

async function restoreColdOfflineTeacher() {
  const snapshot = await loadTeacherOfflineSnapshot().catch(() => null);
  if (!snapshot) return null;
  const profile = restoreTeacherOfflineSnapshot(snapshot, legacy.state);
  if (!profile) return null;
  // Older offline snapshots predate the update guard's topic baseline.
  for (const lesson of legacy.state.lessons) lesson.syncedTopic ??= lesson.topic ?? '';
  applyAuthProfile(profile);
  legacy.state.offlineBootstrap = true;
  await reapplyQueuedLessonState();
  await lessonActions.publish().catch(() => {});
  legacy.render();
  await handlePushDeepLink(profile).catch((error) => console.error('Не удалось открыть offline push destination', error));
  return profile;
}

async function settleAuthReady(profile) {
  resolveAuthReady?.(profile);
  resolveAuthReady = null;
  return profile;
}

async function bootstrapAuth() {
  if (globalThis.navigator?.onLine === false) {
    const offlineProfile = await restoreColdOfflineTeacher();
    if (offlineProfile) return settleAuthReady(offlineProfile);
    showOfflineUnavailable();
    return settleAuthReady(null);
  }
  try {
    const profile = await api.request('/auth/me');
    await reconcileOfflineSnapshotIdentity(profile);
    applyAuthProfile(profile);
    if (profile.roles.includes('parent') && !profile.roles.some((role) => ['director', 'partner', 'teacher'].includes(role))) await window.icubeParentPortal.start(profile);
    else await reload();
    await handlePushDeepLink(profile).catch((error) => console.error('Не удалось открыть push destination', error));
    return settleAuthReady(profile);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      await clearTeacherOfflineSnapshot().catch(() => {});
      showLogin();
      return settleAuthReady(null);
    }
    const offlineProfile = await restoreColdOfflineTeacher();
    if (offlineProfile) return settleAuthReady(offlineProfile);
    showOfflineUnavailable();
    return settleAuthReady(null);
  }
}

let coldOfflineValidationPromise = null;

async function validateColdOfflineSession() {
  if (!legacy.state.offlineBootstrap) return true;
  if (coldOfflineValidationPromise) return coldOfflineValidationPromise;
  coldOfflineValidationPromise = (async () => {
    try {
      const profile = await api.request('/auth/me');
      const snapshot = await loadTeacherOfflineSnapshot().catch(() => null);
      if (!snapshot || !teacherSnapshotMatchesProfile(snapshot, profile)) {
        await clearTeacherOfflineSnapshot().catch(() => {});
        showLogin('Пользователь изменился. Войдите снова.');
        return false;
      }
      applyAuthProfile(profile);
      legacy.state.offlineBootstrap = false;
      await reloadTeacher({ render: true });
      return true;
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        await clearTeacherOfflineSnapshot().catch(() => {});
        showLogin('Сессия завершена. Войдите снова.');
      } else console.error('Не удалось проверить сессию после восстановления сети', error);
      return false;
    }
  })();
  try { return await coldOfflineValidationPromise; }
  finally { coldOfflineValidationPromise = null; }
}

async function syncLessonActionsWithSession() {
  if (!(await validateColdOfflineSession())) return;
  return lessonActions.sync();
}

async function retryLessonActionsWithSession() {
  if (!(await validateColdOfflineSession())) return;
  return lessonActions.retry();
}

async function reconnectTeacherOffline() {
  return syncLessonActionsWithSession();
}

window.icubeApi = { editVisit, renderVisitEdit, changeVisitField, visitCalendarMonth, visitCalendarDate, chooseVisitLesson, openVisitLesson, deleteEditedVisit, saveVisitEdit,
  saveSite, saveTeacher, teacherProjectChanged, deleteTeacher, saveGroup, saveChild, saveEnrollmentStatus, saveEnrollment, addEnrollment, deleteChild, deleteChildPrompt,
  projectTransferForm, confirmProjectTransfer,
  paymentForm, refreshPaymentDirections, updatePaymentPrice, updatePaymentCalc, savePayment, deletePaymentPrompt, deletePayment,
  refundForm, refreshRefundMaximum, saveRefund, deleteRefundPrompt, deleteRefund,
  deleteChildPaymentPrompt, confirmDeleteChildPayment, deleteDirectoryEntity, reload,
  openCalendarEvent, startLesson: startLessonApi, attend: attendApi, toggleExtraAttendance: toggleExtraAttendanceApi,
  toggleTrial: toggleTrialApi, addExtra: addExtraApi, continueExtra: continueExtraApi, makeExtraTrialDirection: makeExtraTrialDirectionApi,
  extraOptions: extraOptionsApi, extraTrial: extraTrialApi, extraRemove: extraRemoveApi, removeExtra: removeExtraApi, saveQuickChild: saveQuickChildApi,
  confirmTeacherCreatedChild: confirmTeacherCreatedChildApi,
  finishLesson: finishLessonApi, confirmFinishLesson: confirmFinishLessonApi, saveLessonEdit: saveLessonEditApi,
  cancelCurrentLesson: cancelCurrentLessonApi, markCurrentLessonEmptyTrip: markCurrentLessonEmptyTripApi,
  confirmAddChildren: confirmAddChildrenApi, deleteLesson: deleteLessonApi,
  transferDirectionBalanceForm, refreshBalanceTransferPreview, confirmBalanceTransfer,
  cancelBalanceTransferPrompt, cancelBalanceTransfer, loadStatistics, loadStatisticsGroups, selectStatisticsMonth, filterStatisticsGroups, statisticsGroupToggle,
  calculatePartnerSettlement, applySalaryFilters: applySalaryFiltersApi, refreshSalaryReport: refreshAppliedSalaryReport,
  calculateSiteRentReport, toggleSiteRentDetails, refreshSiteRentReport: refreshAppliedRentReport,
  lessonToggle: lessonToggleApi, deleteVisit: deleteVisitApi, salaryCalculation: salaryCalculationApi,
  retryLessonSync: () => retryLessonActionsWithSession() };
window.saveSite = window.icubeApi.saveSite;
window.saveTeacher = window.icubeApi.saveTeacher;
window.saveGroupV111 = window.icubeApi.saveGroup;
window.saveChildV111 = window.icubeApi.saveChild;
window.saveChild = window.icubeApi.saveChild;
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
window.icubeExtraOptions = window.icubeApi.extraOptions;
window.removeExtraFromLessonV138 = window.icubeApi.removeExtra;
window.saveTeacherQuickChild = window.icubeApi.saveQuickChild;
window.saveTeacherQuickChildV121 = window.icubeApi.saveQuickChild;
window.confirmTeacherCreatedChild = window.icubeApi.confirmTeacherCreatedChild;
window.finishLesson = window.icubeApi.finishLesson;
window.confirmFinish = window.icubeApi.confirmFinishLesson;
window.confirmAddChildren = window.icubeApi.confirmAddChildren;
window.renderAddChildrenList = renderAddChildrenListApi;
window.deleteLessonConfirmed = window.icubeApi.deleteLesson;
window.transferDirectionBalanceFormV142 = window.icubeApi.transferDirectionBalanceForm;
window.refreshTransferPreviewV142 = window.icubeApi.refreshBalanceTransferPreview;
window.confirmTransferDirectionBalanceV142 = window.icubeApi.confirmBalanceTransfer;
window.child = childPageWithTransferHistory;
window.icubeBudget = createDirectorBudgetUi({ api, getActor: () => authProfile ?? { roles: [legacy.state.role] } });
window.stats = statisticsPage;
window.applyStatsFiltersV125 = window.icubeApi.loadStatistics;
window.applySalaryFilters = window.icubeApi.applySalaryFilters;
window.partner = partnerPage;
window.partnerSettlementPage = partnerSettlementPage;
window.applyPartnerFiltersV123 = window.icubeApi.calculatePartnerSettlement;
window.saveLessonEdit = window.icubeApi.saveLessonEdit;
window.lToggle = window.icubeApi.lessonToggle;
window.confirmDeleteVisitV121 = window.icubeApi.deleteVisit;
window.salaryCalculation = window.icubeApi.salaryCalculation;
window.icubeSalaryDefaultPeriod = salaryDefaultPeriod;
window.icubeAuthLogin = loginFromForm;
window.icubeAuthLogout = logout;
window.icubeHandlePushDeepLink = handlePushDeepLink;
window.icubeOpenNotification = (link) => openNotificationDestination(link, authProfile);
window.icubeReturnToHome = returnFromTemporaryTeacherView;
window.icubeReturnToDirector = returnFromTemporaryTeacherView;
window.icubeCreateTeacherAccess = createTeacherAccess;
window.icubeResetTeacherPassword = resetTeacherPassword;
window.icubeDisableTeacherAccess = disableTeacherAccess;

const teacherLessonBeforeOffline = window.teacherLesson;
if (typeof teacherLessonBeforeOffline === 'function') window.teacherLesson = function (...args) {
  const output = teacherLessonBeforeOffline.apply(this, args); const status = legacy.state.lessonSyncStatus ?? { pending: 0, failed: 0 };
  const lesson = currentLesson(); const localPhotos = Object.values(lesson?.photos ?? {}).flat().filter((photo) => photo?.localId);
  const failed = status.failed + localPhotos.filter((photo) => photo.status === 'error').length;
  const pending = status.pending + localPhotos.filter((photo) => photo.status !== 'error').length;
  const held = Number(legacy.state.lessonSyncStatus?.held ?? 0);
  const message = failed ? `Не удалось отправить ${failed} изменений${status.errorMessage ? ': ' + status.errorMessage : ''}`
    : held ? `${held} изменений сохранены для другого или неизвестного пользователя; они не отправляются`
    : pending ? `${pending} изменений ожидают отправки` : 'Все изменения сохранены';
  const tone = failed ? 'error' : pending || held ? 'pending' : 'saved';
  const retry = failed ? '<button class="btn small" onclick="icubeApi.retryLessonSync();window.icubePhotos?.retryAll()">Повторить синхронизацию</button>' : '';
  return `<div class="lesson-sync-status is-${tone}"><span>${html(message)}</span>${retry}</div>${output}`;
};

window.icubeLessonChildDirection = (lesson, childId) => {
  const attendanceDirection = lesson?.attendanceDetailsByChild?.[childId]?.directionName;
  if (attendanceDirection) return attendanceDirection;
  const child = legacy.state.children.find((item) => Number(item.id) === Number(childId));
  const group = legacy.state.groups.find((item) => Number(item.id) === Number(lesson?.groupId));
  const enrollmentId = lesson?.enrollmentByChild?.[childId] ?? lesson?.extras?.find((item) => Number(item.childId) === Number(childId))?.enrollmentId;
  const enrollment = child?.enrollments.find((item) => enrollmentId ? Number(item.id) === Number(enrollmentId) : Number(item.groupId) === Number(group?.id));
  return enrollment?.direction ?? lesson?.direction ?? group?.direction ?? null;
};
window.icubeLessonOffline = {
  sync: () => syncLessonActionsWithSession(), retry: () => retryLessonActionsWithSession(),
  pendingForLesson: (lessonId) => lessonActions.pendingForLesson(lessonId),
  readyForPhoto: (lessonId, childId) => lessonActions.readyForPhoto(lessonId, childId),
  mappings: () => lessonActions.mappings(), acknowledgeMapping: (localId) => lessonActions.acknowledgeMapping(localId),
};
window.icubePwaUpdateState = async () => ({
  pending: (await lessonActions.records()).length,
  saving: groupSavePending || childSavePending || paymentSavePending || refundSavePending || balanceTransferPending || lessonActionPending > 0,
  draft: Boolean(legacy.state.modal)
    || legacy.state.lessons.some((lesson) => lesson.syncedTopic !== undefined && lesson.topic !== lesson.syncedTopic),
});
window.addEventListener?.('online', () => reconnectTeacherOffline().catch(console.error));

installDeletionUi();
installPersistentCalendarBridge();
installPersistentNotificationUi();
installAuthenticatedShells();
installTeacherAccessUi();
installScreenHistory(legacy);
installQuickStatusUi(legacy);
installLessonChildNavigation(legacy, window, () => lessonActionPending === 0);
installAdvancedGroupUi(legacy);
if (element('#app')) {
  window.icubeAuthReady = new Promise((resolve) => { resolveAuthReady = resolve; });
  bootstrapAuth();
} else window.icubeAuthReady = Promise.resolve(null);
lessonActions.publish().catch(console.error);
window.icubeAuthReady?.then((profile) => { if (profile && !legacy.state.offlineBootstrap) lessonActions.sync().catch(console.error); });

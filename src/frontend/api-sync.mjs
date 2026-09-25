import { ApiClient, ApiError } from '../data/api-client.mjs';
import { createLessonActionQueue, createMemoryLessonActionStore } from '../data/lesson-action-queue.mjs';
import { businessDate, calendarMonthPeriod } from '../shared/business-time.mjs';
import {
  clearTeacherOfflineSnapshot, loadTeacherOfflineSnapshot, restoreTeacherOfflineSnapshot,
  saveTeacherOfflineSnapshot, teacherSnapshotMatchesProfile,
} from './offline-teacher-snapshot.mjs';

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
let paymentSavePending = false;
let paymentCreateKey = null;
let refundSavePending = false;
let refundCreateKey = null;
let childSavePending = false;
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
      editable: enrollment.editable !== false, direction: enrollment.directionName, groupId: enrollment.groupId == null ? null : Number(enrollment.groupId),
      groupName: enrollment.groupName ?? null, siteName: enrollment.siteName ?? null, weekday: enrollment.weekday ?? null, startTime: enrollment.startTime ?? null,
      status: enrollmentStatusFromApi[enrollment.status] ?? enrollment.status,
      individualPrice: enrollment.individualPrice == null ? null : Number(enrollment.individualPrice), currentPrice: enrollment.currentPrice == null ? null : Number(enrollment.currentPrice),
      balance: enrollment.balanceLessons == null ? null : Number(enrollment.balanceLessons) })) };
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
    id: Number(lesson.id), groupId: Number(lesson.groupId), projectId: lesson.projectId == null ? null : Number(lesson.projectId), project: lesson.projectName ?? '',
    teacherId: Number(lesson.actualTeacherId ?? lesson.plannedTeacherId),
    plannedTeacherId: Number(lesson.plannedTeacherId), siteId: Number(lesson.siteId), siteName: lesson.siteName ?? '',
    siteOverrideId: lesson.siteOverrideId == null ? null : Number(lesson.siteOverrideId), scheduledDate, scheduledTime, occurrenceKey: `${Number(lesson.groupId)}|${scheduledDate}`,
    date, time, status, topic: lesson.topic ?? '', attendance, trialChildren,
    extras: extras.map((item) => ({ childId: Number(item.childId), enrollmentId: Number(item.enrollmentId), trial: item.trial, present: item.present })),
    photos: {}, started: ['in_progress', 'completed'].includes(lesson.status), done: lesson.status === 'completed', cancelled: lesson.status === 'cancelled',
    moved: date !== scheduledDate || time !== scheduledTime, intro: lesson.introGroup, emptyTrip: lesson.emptyTrip,
    attendanceApplied: Boolean(lesson.attendanceAppliedAt), groupChildIdsV146: lesson.roster.filter((item) => item.type === 'main').map((item) => Number(item.childId)),
    groupRosterFrozenV146: Boolean(lesson.rosterFrozenAt), groupRosterFrozenAtV146: lesson.rosterFrozenAt,
    absenceNoticeChildIds: (lesson.absenceNoticeChildIds ?? []).map(Number), birthdayChildIds: (lesson.birthdayChildIds ?? []).map(Number),
    salaryAccrual: lesson.salary ?? null,
  };
}

const salaryTypeLabel = {
  regular: 'Обычное занятие',
  intro: 'Ознакомительное занятие',
  empty_trip: 'Пустой выезд',
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
          return `<div class="rent-detail-row"><div><b>${isoToRu(timestampDate(detail.startsAt))} · ${time}</b><div class="muted mini">${html(detail.directionName)} · ${html(detail.groupName)}</div><div class="muted mini">${html(detail.siteName)}</div></div><div class="rent-detail-side">${detail.introGroup ? '<span class="badge amber">Ознакомительное</span>' : ''}<b>${displayMoney(detail.rentRate)}</b></div></div>`;
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
  const statisticsQuery = `?from=${encodeURIComponent(legacy.state.statisticsDateFrom)}&to=${encodeURIComponent(legacy.state.statisticsDateTo)}&projectId=${encodeURIComponent(legacy.state.statisticsProjectId)}&directionId=${encodeURIComponent(legacy.state.statisticsDirectionId)}`;
  const [projects, directions, sites, teachers, groups, children, payments, refunds, lessons, lessonDeletions, notifications, balanceTransfers, statistics, dailySummary, venues] = await Promise.all([
    api.list('projects'), api.list('directions'), api.list('sites'), api.list('teachers'), api.list('groups'), api.list('children'), api.list('payments'), api.list('refunds'), api.list('lessons'), api.list('lesson-deletions'), api.list('notifications').catch(() => []),
    api.list('balance-transfers'), partner ? Promise.resolve(null) : api.list('statistics', statisticsQuery), api.request('/dashboard/daily'), api.list('sites/venues'),
  ]);
  directories = { projects, directions };
  legacy.state.projects = projects.map((project) => ({ ...project, id: Number(project.id) }));
  legacy.state.sites = sites.map((site) => ({ ...site, id: Number(site.id), projectId: Number(site.projectId) }));
  legacy.state.lessonVenues = venues.map((site) => ({ ...site, id: Number(site.id), active: Boolean(site.active) }));
  legacy.state.teachers = teachers.map((teacher) => ({ ...teacher, id: Number(teacher.id), projectIds: teacher.projectIds.map(Number),
    directions: teacher.directions.map((direction) => direction.name), projectSettings: (teacher.projectSettings ?? []).map((setting) => ({
      projectId: Number(setting.projectId), status: setting.status ?? (setting.active === false ? 'inactive' : 'active'), active: setting.active,
      directions: setting.directions.map((direction) => ({ ...direction, id: Number(direction.id) })),
    })) }));
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
  await reapplyQueuedLessonState();
  legacy.state.calendarForeignGroups = legacy.state.lessons.filter((lesson) => lesson.readOnly).map((lesson) => ({
    id: lesson.groupId, name: lesson.groupName, project: lesson.project,
  }));
  legacy.state.deletedOccurrences = lessonDeletions.map((item) => `${Number(item.groupId)}|${isoToRu(item.scheduledDate)}`);
  legacy.state.notifications = notifications;
  if (!legacy.state.children.some((child) => child.id === Number(legacy.state.selectedChild))) legacy.state.selectedChild = legacy.state.children[0]?.id ?? null;
  if (!legacy.state.groups.some((group) => group.id === Number(legacy.state.selectedGroup))) legacy.state.selectedGroup = legacy.state.groups[0]?.id ?? null;
  await refreshAppliedSalaryReport({ render: false });
  if (rentAccountIsDirector() && !partner) await refreshAppliedRentReport({ render: false });
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
  if (childSavePending) return;
  childSavePending = true;
  try {
    const child = { name: value('#cf-name').trim() || 'Новый ребёнок', birthDate: value('#cf-birth') || null, school: value('#cf-school'), grade: value('#cf-grade'),
      status: childStatusToApi[value('#cf-status')] ?? 'lead', note: value('#cf-note'), guardian: { name: value('#cf-parent'), phone: value('#cf-phone') } };
    const selectedGroupId = value('#cf-group') ? Number(value('#cf-group')) : null;
    let saved; let enrollment;
    if (resourceId) {
      const existing = legacy.state.children.find((item) => item.id === Number(resourceId));
      enrollment = existing?.enrollments.find((item) => item.editable !== false && item.groupId === selectedGroupId)
        ?? existing?.enrollments.find((item) => item.editable !== false && item.direction === value('#cf-direction'));
      if (!enrollment) throw new ApiError('Не найдено редактируемое направление текущего проекта');
      saved = await api.request(`/children/${resourceId}/with-enrollment`, { method: 'PATCH', body: {
        child, enrollmentId: enrollment.id, enrollment: { groupId: selectedGroupId },
      } });
    } else {
      const direction = byName(directories.directions, value('#cf-direction'));
      if (!direction) throw new ApiError('Направление отсутствует в серверном справочнике');
      childCreateKey ||= operationKey();
      saved = await api.request('/children-with-enrollment', { method: 'POST', idempotencyKey: childCreateKey, body: { child,
        enrollment: { directionId: direction.id, projectId: value('#cf-project') || undefined, groupId: selectedGroupId, status: 'active' },
      } });
      childCreateKey = null;
    }
    legacy.state.selectedChild = saved.id; legacy.state.modal = null; legacy.state.page = 'child'; await reload();
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
    const targetValues = { groupId: value('#md-group') ? Number(value('#md-group')) : null,
      status: enrollmentStatusToApi[value('#md-enrollment-status')] ?? enrollmentStatusToApi[enrollment.status] ?? 'active', individualPrice: individual ? packagePrice / 4 : null };
    const directionChanged = String(direction.id) !== String(enrollment.directionId);
    const currentIndividual = enrollment.individualPrice == null ? null : Number(enrollment.individualPrice);
    const priceChanged = currentIndividual !== targetValues.individualPrice;
    if (directionChanged || priceChanged) {
      await api.request(`/enrollments/${enrollment.id}/change-direction`, { method: 'POST', idempotencyKey: operationKey(), body: {
        directionId: direction.id, ...targetValues, status: targetValues.status === 'finished' ? 'active' : targetValues.status,
      } });
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
  const block = `<div class="card child-ledger-card" style="margin-top:16px"><div class="child-ledger-head"><div><h2>Переносы остатка</h2><div class="muted mini">${transfers.length} операций</div></div></div><div class="list">${transfers.map((item) => `<div class="kpi-line" style="padding:12px 16px"><div><b>${html(item.sourceDirectionName)} → ${html(item.targetDirectionName)}</b><div class="muted mini">${isoToRu(timestampDate(item.transferredAt))} · ${displayMoney(item.transferredAmount)} · зачислено ${Number(item.targetLessonsCredit).toFixed(4)} занятия</div></div>${item.automaticChangeDirection ? '' : `<button class="btn danger" onclick="icubeApi.cancelBalanceTransferPrompt(${item.id})">Отменить перенос</button>`}</div>`).join('')}</div></div>`;
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
    finalBlock = `<div class="partner-final ${positive ? 'partner-final-pay' : 'partner-final-return'}"><span>${positive ? 'Перевести партнёру' : 'Партнёр должен передать iCube'}</span><b>${amount}</b></div>`;
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
    <div class="field"><label>Дата</label><input class="input" id="pf-date" type="date" value="${html(existing?.paidOn ?? todayIso)}"></div>
    <div class="field"><label>Ребёнок</label><select class="select" id="pf-child" onchange="icubeApi.refreshPaymentDirections(${existing?.id ?? 'null'})" ${historical ? 'disabled' : ''}>${historical ? `<option value="${existing.childId}">${html(existing.childName)}</option>` : legacy.state.children.map((item) => `<option value="${item.id}"${item.id === child.id ? ' selected' : ''}>${html(item.name)}</option>`).join('')}</select></div>
    <div class="field"><label>Направление</label><select class="select" id="pf-enrollment" onchange="icubeApi.updatePaymentPrice(${existing?.id ?? 'null'})" ${historical ? 'disabled' : ''}>${historical ? `<option value="${existing.enrollmentId}">${html(existing.direction)}</option>` : ''}</select></div>
    <div class="field"><label>Сумма, ₽</label><input class="input" id="pf-amount" type="number" min="0.01" step="0.01" value="${html(existing?.amount ?? '4100')}" oninput="icubeApi.updatePaymentCalc()"></div>
    <div class="field"><label>Цена занятия, ₽</label><input class="input" id="pf-price" type="number" min="0.01" step="0.01" value="${html(existing?.price ?? '')}" readonly></div>
    <div class="field"><label>Способ оплаты</label><select class="select" id="pf-method"><option value="cashless"${(existing?.methodCode ?? 'cashless') === 'cashless' ? ' selected' : ''}>Безналичный расчёт</option><option value="cash"${existing?.methodCode === 'cash' ? ' selected' : ''}>Наличные</option></select></div>
    </div><div class="notice" id="pf-calc" style="margin-top:14px"></div><div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn primary" id="pf-submit" onclick="icubeApi.savePayment(${existing?.id ?? 'null'})">${existing ? 'Сохранить изменения' : 'Сохранить оплату'}</button></div>`;
  legacy.render();
  if (historical) setTimeout(updatePaymentCalc, 0);
  else setTimeout(() => refreshPaymentDirections(existing?.id ?? null, preferred), 0);
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

function updatePaymentPrice(paymentId) {
  const existing = paymentId ? legacy.state.payments.find((payment) => payment.id === Number(paymentId)) : null;
  const enrollment = paymentEnrollment(value('#pf-child'), value('#pf-enrollment'));
  const priceInput = element('#pf-price');
  if (priceInput && !existing) priceInput.value = enrollment ? String(enrollment.currentPrice ?? legacy.effectivePrice(enrollment) ?? '') : '';
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
      lesson.groupChildIdsV146 = legacy.state.children.filter((child) => (child.enrollments ?? []).some((enrollment) =>
        Number(enrollment.groupId) === Number(lesson.groupId) && ['Активный', 'active'].includes(enrollment.status))).map((child) => Number(child.id));
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
    if (!(lesson.extras ?? []).some((item) => Number(item.childId) === childId)) lesson.extras.push({ childId, present: true, trial: true });
  } else if (action.type === 'remove-extra') {
    lesson.extras = (lesson.extras ?? []).filter((item) => Number(item.childId) !== childId);
  } else if (action.type === 'quick-child') {
    const tempId = Number(action.tempChildId);
    if (!legacy.state.children.some((child) => Number(child.id) === tempId)) legacy.state.children.push({
      id: tempId, name: action.body.name, birth: '', school: '', grade: '', parent: '', phone: action.body.phone ?? '', status: 'Лид', note: '',
      needsDirectorReview: true, createdByTeacher: true, enrollments: [],
    });
    if (!(lesson.extras ?? []).some((item) => Number(item.childId) === tempId)) lesson.extras.push({ childId: tempId, present: true, trial: true, createdByTeacher: true });
  } else if (action.type === 'finish') {
    lesson.done = true; lesson.started = true; lesson.status = 'Проведено'; lesson.attendanceApplied = true;
  }
}

async function reapplyQueuedLessonState(lessonId = null) {
  if (!lessonActions) return;
  const actions = lessonId == null ? await lessonActions.records() : await lessonActions.pendingForLesson(lessonId);
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
  if (action.type === 'start') return api.request(`/lessons/${lessonId}/start`, { method: 'POST', body: action.body });
  if (action.type === 'attendance') return api.request(`/lessons/${lessonId}/attendance/${childId}`, { method: 'PUT', body: action.body });
  if (action.type === 'add-extra') return api.request(`/lessons/${lessonId}/extras`, { method: 'POST', body: { childId: Number(action.childId) } });
  if (action.type === 'remove-extra') return api.request(`/lessons/${lessonId}/extras/${childId}`, { method: 'DELETE' });
  if (action.type === 'quick-child') return api.request(`/lessons/${lessonId}/quick-child`, { method: 'POST', body: action.body, idempotencyKey: action.id });
  if (action.type === 'finish') {
    if (action.body.topic) await api.update('lessons', action.lessonId, { topic: action.body.topic });
    return api.request(`/lessons/${lessonId}/finish`, { method: 'POST', body: {} });
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

function setLessonSyncStatus(status) {
  legacy.state.lessonSyncStatus = status;
  if (legacy.state.page === 'teacherLesson' && globalThis.window && typeof globalThis.window.teacherShell === 'function'
    && globalThis.document?.querySelector?.('#app')) legacy.render();
}

const lessonActions = createLessonActionQueue({ store: globalThis.indexedDB ? undefined : createMemoryLessonActionStore(), send: sendLessonAction, onStatus: setLessonSyncStatus,
  onChildResolved: resolveLocalChild, onSynced: refreshAfterLessonSync });

async function queueLessonAction(action, { closeModal = false } = {}) {
  try {
    const record = await lessonActions.enqueue(action); applyLessonAction(record);
    if (closeModal) legacy.state.modal = null;
    legacy.render(); await lessonActions.sync();
  } catch (error) { fail(error); }
}

async function reloadLesson(lessonId, page = legacy.state.page) {
  await reload({ render: false });
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
    const scheduledRuDate = dateParts.join('|');
    if (!groupId || !scheduledRuDate) throw new Error('Некорректное событие календаря');
    const date = ruToIso(scheduledRuDate);

    let lesson = legacy.state.lessons.find((item) => item.occurrenceKey === key);
    if (!lesson) {
      const loaded = await api.list('lessons', `?from=${encodeURIComponent(date)}&to=${encodeURIComponent(date)}`);
      lesson = serverLessonForOccurrence(loaded, key);
      if (lesson) cacheCalendarLesson(lesson);
    }
    if (!lesson && role === 'director') {
      const created = mapLesson(await api.create('lessons', { groupId, scheduledDate: date }));
      if (created.occurrenceKey !== key) {
        const loaded = await api.list('lessons', `?from=${encodeURIComponent(date)}&to=${encodeURIComponent(date)}`);
        lesson = serverLessonForOccurrence(loaded, key);
      } else lesson = created;
      if (lesson) cacheCalendarLesson(lesson);
    }
    if (!lesson) throw new Error('Не удалось открыть занятие для выбранного события календаря');
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

async function addExtraApi(childId) {
  const lesson = currentLesson(); if (!lesson) return;
  await queueLessonAction({ type: 'add-extra', lessonId: lesson.id, childId: Number(childId), body: { childId: Number(childId) } }, { closeModal: true });
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
  await queueLessonAction({ type: 'quick-child', lessonId: lesson.id, tempChildId: String(tempChildId), body: { name, phone: phone || null } }, { closeModal: true });
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
        key: lesson.occurrenceKey, groupId: lesson.groupId, groupName: group?.name ?? lesson.groupName,
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
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

async function handlePushDeepLink(profile = authProfile) {
  const link = pushLinkParams();
  if (!link || !profile) return false;
  const parentOnly = profile.roles.includes('parent') && !profile.roles.some((role) => ['director', 'partner', 'teacher'].includes(role));
  if (parentOnly) {
    await window.icubeParentPortal?.openPushDestination?.(link);
    clearPushLinkParams();
    return true;
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
  } else if (legacy.state.role === 'teacher') legacy.state.page = 'teacherToday';
  else legacy.state.page = 'dashboard';

  legacy.render();
  await api.request(`/notifications/${encodeURIComponent(link.notificationId)}/read`, { method: 'POST', body: {} }).catch(() => {});
  clearPushLinkParams();
  return true;
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
    resolveAuthReady?.(profile);
    resolveAuthReady = null;
    return profile;
  } catch (error) {
    showLogin(error instanceof ApiError ? error.message : 'Не удалось войти');
    return null;
  }
}

async function logout() {
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

function installAuthenticatedShells() {
  const originalShell = window.shell;
  if (typeof originalShell === 'function') {
    window.shell = function (...args) {
      const result = originalShell.apply(this, args);
      if (!authProfile) return result;
      const roleLabel = authProfile.roles.includes('director') ? 'Директор' : 'Партнёр';
      const account = `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:flex-end"><div><b>${html(authProfile.displayName)}</b><div class="muted mini">${roleLabel}</div></div><button class="btn" onclick="icubePush?.openSettings()">Уведомления</button><button class="btn" onclick="icubeAuthLogout()">Выйти</button></div>`;
      return result.replace(/<div><select class="role-switch"[\s\S]*?<\/select><div class="muted mini">Режим прототипа<\/div><\/div>/, account);
    };
  }
  window.teacherShell = function (content) {
    const parentRole = temporaryTeacherParentRole();
    const right = parentRole
      ? '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end"><button class="btn" onclick="icubeReturnToHome()">Вернуться на главную</button><button class="btn" onclick="icubePush?.openSettings()">Уведомления</button><button class="btn" onclick="icubeAuthLogout()">Выйти</button></div>'
      : '<button class="btn" onclick="icubeAuthLogout()">Выйти</button>';
    const teacherPushButton = parentRole ? '' : '<button class="btn" onclick="icubePush?.openSettings()">Уведомления</button>';
    const offline = legacy.state.offlineBootstrap || globalThis.navigator?.onLine === false;
    const offlineNotice = offline
      ? '<div class="notice" style="max-width:680px;margin:12px auto 0">Офлайн · изменения будут отправлены после подключения</div>'
      : '';
    return `<div class="teacher-shell"><div class="teacher-top"><div class="teacher-top-inner"><div><div class="mini" style="color:#98a2b3">iCube CRM · преподаватель</div><b>${html(teacherNameForShell())}</b></div><div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">${teacherPushButton}${right}</div></div>
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

function showOfflineUnavailable() {
  authProfile = null;
  legacy.state.authUser = null;
  const app = element('#app');
  if (!app) return;
  app.style.visibility = 'visible';
  app.innerHTML = `<div style="min-height:100vh;display:grid;place-items:center;padding:20px;background:#f8fafc"><div class="card pad" style="width:min(100%,440px)">
    <div class="brand" style="color:#111827;margin-bottom:22px"><div class="brand-mark">iC</div><div>iCube CRM</div></div>
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

window.icubeApi = { saveSite, saveTeacher, teacherProjectChanged, deleteTeacher, saveGroup, saveChild, saveEnrollment, addEnrollment, deleteChild, deleteChildPrompt,
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
  calculatePartnerSettlement, applySalaryFilters: applySalaryFiltersApi, refreshSalaryReport: refreshAppliedSalaryReport,
  calculateSiteRentReport, toggleSiteRentDetails, refreshSiteRentReport: refreshAppliedRentReport,
  lessonToggle: lessonToggleApi, deleteVisit: deleteVisitApi, salaryCalculation: salaryCalculationApi,
  retryLessonSync: () => retryLessonActionsWithSession() };
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
  const message = failed ? `Не удалось отправить ${failed} изменений`
    : pending ? `${pending} изменений ожидают отправки` : 'Все изменения сохранены';
  const tone = failed ? 'error' : pending ? 'pending' : 'saved';
  const retry = failed ? '<button class="btn small" onclick="icubeApi.retryLessonSync();window.icubePhotos?.retryAll()">Повторить синхронизацию</button>' : '';
  return `<div class="lesson-sync-status is-${tone}"><span>${message}</span>${retry}</div>${output}`;
};

window.icubeLessonOffline = {
  sync: () => syncLessonActionsWithSession(), retry: () => retryLessonActionsWithSession(),
  pendingForLesson: (lessonId) => lessonActions.pendingForLesson(lessonId),
  readyForPhoto: (lessonId, childId) => lessonActions.readyForPhoto(lessonId, childId),
  mappings: () => lessonActions.mappings(), acknowledgeMapping: (localId) => lessonActions.acknowledgeMapping(localId),
};
window.addEventListener?.('online', () => reconnectTeacherOffline().catch(console.error));

installDeletionUi();
installPersistentCalendarBridge();
installPersistentNotificationUi();
installAuthenticatedShells();
installTeacherAccessUi();
if (element('#app')) {
  window.icubeAuthReady = new Promise((resolve) => { resolveAuthReady = resolve; });
  bootstrapAuth();
} else window.icubeAuthReady = Promise.resolve(null);
lessonActions.publish().catch(console.error);
window.icubeAuthReady?.then((profile) => { if (profile && !legacy.state.offlineBootstrap) lessonActions.sync().catch(console.error); });

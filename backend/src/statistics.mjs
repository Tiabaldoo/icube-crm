import { ApiProblem } from './catalog.mjs';
import { aggregateChildStatus } from './enrollment-status.mjs';
import { moneyCents, moneyDecimal } from './lesson-rules.mjs';
import { addCalendarDays, businessDate, calendarMonthPeriod, parseCalendarDate } from '../../src/shared/business-time.mjs';
import { enrollmentHistory, periodDepartures, stamp } from './statistics-history.mjs';

const flag = (value) => value === true || value === 1 || value === '1';
const percent = (part, total) => total ? (part * 100 / total).toFixed(1) : '0.0';
function dateOnly(value, field) {
  try { return parseCalendarDate(value); }
  catch { throw new ApiProblem(400, 'VALIDATION_ERROR', `Некорректное поле ${field}`); }
}
function optionalId(value, field) {
  if (value == null || value === '' || value === 'all') return null;
  if (!/^[1-9]\d*$/.test(String(value))) throw new ApiProblem(400, 'VALIDATION_ERROR', `Некорректное поле ${field}`);
  return String(value);
}
function monthsBetween(from, to) {
  const months = []; let month = from.slice(0, 7);
  while (month <= to.slice(0, 7)) {
    months.push(month); const [year, number] = month.split('-').map(Number);
    month = new Date(Date.UTC(year, number, 1)).toISOString().slice(0, 7);
  }
  return months;
}
const emptyConversion = () => ({ trials: 0, continued: 0, notContinued: 0, pending: 0, conversionPercent: null });
function conversion(cases) {
  const result = emptyConversion(); result.trials = cases.length;
  for (const outcome of cases) result[outcome]++;
  const evaluated = result.continued + result.notContinued;
  result.conversionPercent = evaluated ? percent(result.continued, evaluated) : null;
  return result;
}

export function calculateStatistics({ period, filters, chartPeriod, observedAt, childRows = [], statusRows = [], groupRows = [],
  lessonRows = [], memberRows = [], trialRows = [], paidRows = [], moneyRows = [] }) {
  const today = observedAt.slice(0, 10); const end = period.to < today ? period.to : today;
  const children = new Map(); const enrollments = new Map();
  for (const row of childRows) {
    const id = String(row.child_id); const child = children.get(id) ?? { id, status: row.child_status, createdAt: stamp(row.child_created_at), groupId: row.created_group_id, enrollments: [] };
    if (row.enrollment_id != null && !enrollments.has(String(row.enrollment_id))) {
      const e = { id: String(row.enrollment_id), child_id: id, direction_id: String(row.direction_id), direction_name: row.direction_name,
        direction_code: row.direction_code, status: row.enrollment_status, started_on: String(row.started_on).slice(0, 10),
        superseded_at: row.superseded_at, created_at: row.enrollment_created_at, updated_at: row.enrollment_updated_at };
      enrollments.set(e.id, e); child.enrollments.push(e);
    }
    children.set(id, child);
  }
  const current = { children: { total: 0, active: 0, lead: 0, paused: 0, finished: 0 }, activeDirections: { total: 0, directions: [], dualChildren: 0 } };
  const directions = new Map();
  for (const child of children.values()) {
    const rows = child.enrollments.filter((e) => e.superseded_at == null);
    if ((filters.projectId || filters.directionId) && !rows.length) continue;
    let status = aggregateChildStatus(rows, child.status); if (status === 'archived') status = 'finished';
    current.children.total++; current.children[status]++;
    const active = rows.filter((e) => e.status === 'active');
    if (new Set(active.map((e) => e.direction_id)).size >= 2) current.activeDirections.dualChildren++;
    for (const e of active) {
      const item = directions.get(e.direction_id) ?? { id: e.direction_id, name: e.direction_name, code: e.direction_code, count: 0 };
      item.count++; current.activeDirections.total++; directions.set(e.direction_id, item);
    }
  }
  current.activeDirections.directions = [...directions.values()];
  const history = enrollmentHistory([...enrollments.values()], statusRows);
  const departures = periodDepartures(history, period.from, period.to, observedAt);
  const groupMap = new Map(groupRows.map((g) => [String(g.id), { id: String(g.id), name: g.name, projectId: String(g.project_id), projectName: g.project_name,
    directionId: String(g.direction_id), directionName: flag(g.is_mixed) ? 'Смешанная' : g.direction_name, isMixed: flag(g.is_mixed), siteName: g.site_name,
    weekday: Number(g.weekday), startTime: String(g.start_time ?? '').slice(0, 5), endTime: String(g.end_time ?? '').slice(0, 5), schedule: g.extra_schedule ?? '',
    currentMembers: Number(g.current_members), capacity: flag(g.is_individual) ? 1 : 8,
    completedLessons: 0, visits: 0, absences: 0, unmarked: 0, newChildren: 0, ...emptyConversion(),
    pausedChildren: departures.groups.get(String(g.id))?.paused.size ?? 0, finishedChildren: departures.groups.get(String(g.id))?.finished.size ?? 0,
    occupancy: [], unknownOccupancyLessons: 0, estimatedCapacity: false }]));
  const summary = { completedLessons: lessonRows.length, visits: 0, absences: 0, unmarked: 0, newChildren: 0,
    pausedChildren: departures.paused, finishedChildren: departures.finished, leftChildren: departures.paused + departures.finished,
    activeChildren: current.children.active, averageOccupancyPercent: null, occupancyLessons: 0, unknownOccupancyLessons: 0, estimatedCapacity: false };
  for (const child of children.values()) if (child.createdAt?.slice(0, 10) >= period.from && child.createdAt.slice(0, 10) <= end) {
    summary.newChildren++; const group = groupMap.get(String(child.groupId)); if (group) group.newChildren++;
  }
  const firstPaid = new Map(paidRows.map((p) => [`${p.child_id}:${p.direction_id}`, stamp(p.first_paid_at)]));
  const membersByLesson = new Map();
  for (const row of memberRows) {
    const rows = membersByLesson.get(String(row.lesson_id)) ?? new Map(); rows.set(String(row.enrollment_id), row); membersByLesson.set(String(row.lesson_id), rows);
  }
  const occupancy = [];
  for (const lesson of lessonRows) {
    summary.visits += Number(lesson.visits); summary.absences += Number(lesson.absences); summary.unmarked += Number(lesson.unmarked);
    const group = groupMap.get(String(lesson.group_id)); if (!group) continue;
    group.completedLessons++; group.visits += Number(lesson.visits); group.absences += Number(lesson.absences); group.unmarked += Number(lesson.unmarked);
    const counted = new Set(); const uncertain = new Set();
    for (const row of membersByLesson.get(String(lesson.lesson_id))?.values() ?? []) {
      const status = history.at(row.enrollment_id, stamp(lesson.starts_at));
      if (status == null) uncertain.add(String(row.child_id));
      if (status === 'active' || (status === 'lead' && firstPaid.get(`${row.child_id}:${row.direction_id}`) <= stamp(lesson.starts_at))) counted.add(String(row.child_id));
    }
    // Only attendance_share proves historical individual capacity. Standard
    // lessons use the model capacity with an explicit estimate warning.
    const verified = lesson.calculation_mode_snapshot === 'attendance_share';
    const capacity = verified ? 1 : group.capacity;
    group.estimatedCapacity ||= !verified; summary.estimatedCapacity ||= !verified;
    if ([...uncertain].some((id) => !counted.has(id))) { group.unknownOccupancyLessons++; summary.unknownOccupancyLessons++; }
    else { const value = counted.size * 100 / capacity; group.occupancy.push(value); occupancy.push(value); }
  }
  summary.attendancePercent = percent(summary.visits, summary.visits + summary.absences);
  summary.occupancyLessons = occupancy.length;
  summary.averageOccupancyPercent = occupancy.length ? (occupancy.reduce((a, b) => a + b, 0) / occupancy.length).toFixed(1) : null;
  const perDirection = new Map(); const perGroup = new Map(); const perChild = new Map();
  const outcome = (row, paid) => paid != null ? 'continued' : today <= addCalendarDays(String(row.starts_at).slice(0, 10), 30) ? 'pending' : 'notContinued';
  for (const row of trialRows) {
    const state = outcome(row, row.continued_at); const clubState = filters.directionId ? state : outcome(row, row.club_continued_at);
    const key = String(row.direction_id); const d = perDirection.get(key) ?? { id: key, name: row.direction_name, cases: [] }; d.cases.push(state); perDirection.set(key, d);
    const g = perGroup.get(String(row.group_id)) ?? new Map(); const groupCases = g.get(String(row.child_id)) ?? [];
    groupCases.push(state); g.set(String(row.child_id), groupCases); perGroup.set(String(row.group_id), g);
    const c = perChild.get(String(row.child_id)) ?? []; c.push(clubState); perChild.set(String(row.child_id), c);
  }
  const recruitment = { ...conversion([...perChild.values()].map((cases) => cases.includes('continued') ? 'continued' : cases.includes('pending') ? 'pending' : 'notContinued')),
    directionCases: trialRows.length, directions: [...perDirection.values()].map(({ cases, ...d }) => ({ ...d, ...conversion(cases) })) };
  const groups = [...groupMap.values()].filter((g) => !filters.directionId || g.directionId === filters.directionId || g.isMixed || g.completedLessons || g.trials || g.currentMembers || g.pausedChildren || g.finishedChildren)
    .map(({ occupancy: values, ...g }) => ({ ...g, ...conversion([...(perGroup.get(g.id)?.values() ?? [])].map((cases) => cases.includes('continued') ? 'continued' : cases.includes('pending') ? 'pending' : 'notContinued')), occupancyPercent: percent(g.currentMembers, g.capacity),
      attendancePercent: percent(g.visits, g.visits + g.absences), averageOccupancyPercent: values.length ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1) : null,
      occupancyLessons: values.length, leftChildren: g.pausedChildren + g.finishedChildren })).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const monthly = monthsBetween(chartPeriod.from, chartPeriod.to).map((month) => {
    const from = `${month}-01`; const [year, number] = month.split('-').map(Number);
    const to = new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10);
    const left = periodDepartures(history, from, to, observedAt); const projects = new Map();
    for (const row of moneyRows.filter((r) => r.month === month)) {
      const id = row.project_id == null ? 'unassigned' : String(row.project_id);
      const p = projects.get(id) ?? { id, name: row.project_name ?? 'Проект не указан', code: row.project_code ?? '', cash: 0n, cashless: 0n, refunds: 0n };
      const amount = moneyCents(String(row.amount)); p[row.kind === 'refund' ? 'refunds' : row.method] += amount; projects.set(id, p);
    }
    const totals = { received: 0n, refunds: 0n }; const rows = [...projects.values()].map((p) => {
      const received = p.cash + p.cashless; totals.received += received; totals.refunds += p.refunds;
      return { id: p.id, name: p.name, code: p.code, cash: moneyDecimal(p.cash), cashless: moneyDecimal(p.cashless), received: moneyDecimal(received), refunds: moneyDecimal(p.refunds), net: moneyDecimal(received - p.refunds) };
    });
    return { month, projects: rows, received: moneyDecimal(totals.received), refunds: moneyDecimal(totals.refunds), net: moneyDecimal(totals.received - totals.refunds),
      newChildren: [...children.values()].filter((c) => c.createdAt?.slice(0, 7) === month && c.createdAt <= observedAt).length,
      pausedChildren: left.paused, finishedChildren: left.finished, unknownStatuses: left.unknown };
  });
  return { period, filters, chartPeriod, observedAt, current, summary, recruitment, groups, monthly,
    limitations: { unmarkedAttendances: summary.unmarked, unknownStatusChildren: departures.unknown,
      unknownOccupancyLessons: summary.unknownOccupancyLessons, estimatedCapacity: summary.estimatedCapacity, groupNewChildrenBasis: 'created-from-lesson' } };
}

export function createStatistics(pool, { now = () => new Date() } = {}) {
  async function get(raw = {}, context = {}) {
    if (!(context.roles ?? []).includes('director')) throw new ApiProblem(403, 'FORBIDDEN', 'Статистика доступна только директору');
    const clock = now(); const today = businessDate(clock); const observedAt = stamp(new Date(clock.getTime() + 11 * 3600000).toISOString());
    const from = dateOnly(raw.from, 'from'); const to = dateOnly(raw.to, 'to');
    if (from > to) throw new ApiProblem(400, 'VALIDATION_ERROR', 'Дата начала периода должна быть не позже даты окончания');
    const chartFrom = dateOnly(raw.chartFrom ?? calendarMonthPeriod(clock, -11).from, 'chartFrom');
    const chartTo = dateOnly(raw.chartTo ?? calendarMonthPeriod(clock).to, 'chartTo');
    if (chartFrom > chartTo || monthsBetween(chartFrom, chartTo).length > 36) throw new ApiProblem(400, 'VALIDATION_ERROR', 'Для графика выберите не более 36 месяцев');
    const projectId = optionalId(raw.projectId, 'projectId'); const directionId = optionalId(raw.directionId, 'directionId');
    const params = { from, to, chartFrom, chartTo, projectId, directionId, today, observedAt };
    const enrollmentScope = '(:projectId IS NULL OR e.project_id=:projectId) AND (:directionId IS NULL OR e.direction_id=:directionId)';
    const actual = `WITH actual AS (SELECT a.id,a.child_id,COALESCE(e.direction_id,CASE WHEN l.is_mixed_snapshot=FALSE THEN l.direction_id_snapshot END) direction_id,
      l.id lesson_id,l.group_id,l.project_id_snapshot,l.starts_at,a.present,(a.is_trial=TRUE OR l.is_intro_group=TRUE) is_trial,a.charged_lessons
      FROM attendances a JOIN lessons l ON l.id=a.lesson_id LEFT JOIN child_enrollments e ON e.id=a.enrollment_id
      WHERE l.status='completed' AND l.deleted_at IS NULL AND a.present=TRUE AND l.starts_at<=:observedAt AND l.is_empty_trip=FALSE)`;
    const [[childRows], [statusRows], [groupRows], [lessonRows], [memberRows], [trialRows], [paidRows], [moneyRows]] = await Promise.all([
      pool.query(`SELECT c.id child_id,c.status child_status,c.created_at child_created_at,created.group_id created_group_id,
        e.id enrollment_id,e.status enrollment_status,e.direction_id,d.name direction_name,d.code direction_code,e.started_on,e.superseded_at,
        e.created_at enrollment_created_at,e.updated_at enrollment_updated_at
        FROM children c LEFT JOIN child_enrollments e ON e.child_id=c.id AND ${enrollmentScope}
        LEFT JOIN directions d ON d.id=e.direction_id LEFT JOIN lessons created ON created.id=c.created_from_lesson_id
        WHERE c.deleted_at IS NULL AND ((:projectId IS NULL AND :directionId IS NULL) OR e.id IS NOT NULL)`, params),
      pool.query(`SELECT h.* FROM enrollment_status_history h JOIN child_enrollments e ON e.id=h.enrollment_id
        JOIN children c ON c.id=e.child_id WHERE c.deleted_at IS NULL AND ${enrollmentScope} AND h.changed_at<=:observedAt ORDER BY h.changed_at,h.id`, params),
      pool.query(`SELECT g.id,g.name,COALESCE(:projectId,g.project_id) project_id,
        COALESCE((SELECT scoped.name FROM projects scoped WHERE scoped.id=:projectId),p.name) project_name,g.direction_id,d.name direction_name,g.is_mixed,g.is_individual,
        s.name site_name,g.weekday,g.start_time,g.end_time,
        (SELECT GROUP_CONCAT(CONCAT(gs.weekday,' ',gs.start_time,'–',gs.end_time) ORDER BY gs.weekday,gs.start_time SEPARATOR '; ') FROM group_schedule_slots gs WHERE gs.group_id=g.id) extra_schedule,
        (SELECT COUNT(DISTINCT c.id) FROM group_memberships gm JOIN child_enrollments e ON e.id=gm.enrollment_id
          JOIN children c ON c.id=e.child_id WHERE gm.group_id=g.id AND gm.started_on<=:today AND (gm.ended_on IS NULL OR gm.ended_on>=:today)
          AND e.status IN ('active','lead') AND e.superseded_at IS NULL AND c.deleted_at IS NULL AND g.deleted_at IS NULL
          AND (:projectId IS NULL OR g.project_id=:projectId) AND (:directionId IS NULL OR e.direction_id=:directionId)) current_members
        FROM study_groups g JOIN projects p ON p.id=g.project_id JOIN directions d ON d.id=g.direction_id JOIN sites s ON s.id=g.site_id
        WHERE (g.deleted_at IS NULL AND (:projectId IS NULL OR g.project_id=:projectId)) OR EXISTS
          (SELECT 1 FROM lessons historic WHERE historic.group_id=g.id AND historic.status='completed' AND historic.deleted_at IS NULL
            AND DATE(historic.starts_at) BETWEEN :from AND :to AND historic.starts_at<=:observedAt
            AND (:projectId IS NULL OR historic.project_id_snapshot=:projectId))`, params),
      pool.query(`WITH participants AS (SELECT lesson_id,child_id,roster_type FROM lesson_roster_members UNION ALL
        SELECT a.lesson_id,a.child_id,a.attendance_type FROM attendances a WHERE NOT EXISTS
          (SELECT 1 FROM lesson_roster_members r WHERE r.lesson_id=a.lesson_id AND r.child_id=a.child_id))
        SELECT l.id lesson_id,l.group_id,l.starts_at,l.calculation_mode_snapshot,
        SUM(CASE WHEN a.present=TRUE AND a.is_trial=FALSE AND l.is_intro_group=FALSE AND (:directionId IS NULL OR COALESCE(ae.direction_id,CASE WHEN l.is_mixed_snapshot=FALSE THEN l.direction_id_snapshot END)=:directionId) THEN 1 ELSE 0 END) visits,
        SUM(CASE WHEN a.present=FALSE AND a.marked_at IS NOT NULL AND r.roster_type='main' AND a.is_trial=FALSE AND l.is_intro_group=FALSE
          AND (:directionId IS NULL OR COALESCE(ae.direction_id,CASE WHEN l.is_mixed_snapshot=FALSE THEN l.direction_id_snapshot END)=:directionId) THEN 1 ELSE 0 END) absences,
        SUM(CASE WHEN r.roster_type='main' AND (a.id IS NULL OR (a.present=FALSE AND a.marked_at IS NULL)) THEN 1 ELSE 0 END) unmarked
        FROM lessons l LEFT JOIN participants r ON r.lesson_id=l.id LEFT JOIN attendances a ON a.lesson_id=l.id AND a.child_id=r.child_id
        LEFT JOIN child_enrollments ae ON ae.id=a.enrollment_id
        WHERE l.status='completed' AND l.deleted_at IS NULL AND l.starts_at<=:observedAt AND DATE(l.starts_at) BETWEEN :from AND :to
          AND (:projectId IS NULL OR l.project_id_snapshot=:projectId) AND (:directionId IS NULL OR (l.is_mixed_snapshot=FALSE AND l.direction_id_snapshot=:directionId)
            OR EXISTS (SELECT 1 FROM attendances da JOIN child_enrollments de ON de.id=da.enrollment_id
              WHERE da.lesson_id=l.id AND de.direction_id=:directionId AND (da.present=TRUE OR da.marked_at IS NOT NULL))
            OR EXISTS (SELECT 1 FROM group_memberships gm JOIN child_enrollments de ON de.id=gm.enrollment_id
              WHERE gm.group_id=l.group_id AND de.direction_id=:directionId AND gm.started_on<=DATE(l.starts_at) AND (gm.ended_on IS NULL OR gm.ended_on>=DATE(l.starts_at))
                AND (l.roster_frozen_at IS NULL OR EXISTS (SELECT 1 FROM lesson_roster_members dr WHERE dr.lesson_id=l.id AND dr.child_id=de.child_id AND dr.roster_type='main'))))
        GROUP BY l.id,l.group_id,l.starts_at,l.calculation_mode_snapshot`, params),
      pool.query(`SELECT DISTINCT l.id lesson_id,e.id enrollment_id,e.child_id,e.direction_id FROM lessons l
        JOIN group_memberships gm ON gm.group_id=l.group_id AND gm.started_on<=DATE(l.starts_at) AND (gm.ended_on IS NULL OR gm.ended_on>=DATE(l.starts_at))
        JOIN child_enrollments e ON e.id=gm.enrollment_id JOIN children c ON c.id=e.child_id
        LEFT JOIN lesson_roster_members r ON r.lesson_id=l.id AND r.child_id=e.child_id AND r.roster_type='main'
        WHERE l.status='completed' AND l.deleted_at IS NULL AND l.starts_at<=:observedAt AND DATE(l.starts_at) BETWEEN :from AND :to
          AND c.deleted_at IS NULL AND e.project_id=l.project_id_snapshot AND ${enrollmentScope} AND (l.roster_frozen_at IS NULL OR r.child_id IS NOT NULL)`, params),
      pool.query(`${actual}, ranked AS (SELECT actual.*,ROW_NUMBER() OVER(PARTITION BY child_id,direction_id ORDER BY starts_at,lesson_id,id) rn
        FROM actual WHERE is_trial=TRUE AND direction_id IS NOT NULL)
        SELECT t.child_id,t.direction_id,d.name direction_name,t.group_id,t.project_id_snapshot,t.starts_at,
          (SELECT MIN(p.starts_at) FROM actual p WHERE p.child_id=t.child_id AND p.direction_id=t.direction_id AND p.is_trial=FALSE AND p.charged_lessons>0
            AND p.starts_at>t.starts_at AND DATE(p.starts_at)<=DATE_ADD(DATE(t.starts_at),INTERVAL 30 DAY) AND (:projectId IS NULL OR p.project_id_snapshot=:projectId)) continued_at,
          (SELECT MIN(p.starts_at) FROM actual p WHERE p.child_id=t.child_id AND p.is_trial=FALSE AND p.charged_lessons>0
            AND p.starts_at>t.starts_at AND DATE(p.starts_at)<=DATE_ADD(DATE(t.starts_at),INTERVAL 30 DAY) AND (:projectId IS NULL OR p.project_id_snapshot=:projectId)) club_continued_at
        FROM ranked t JOIN directions d ON d.id=t.direction_id WHERE t.rn=1 AND DATE(t.starts_at) BETWEEN :from AND :to
          AND (:projectId IS NULL OR t.project_id_snapshot=:projectId) AND (:directionId IS NULL OR t.direction_id=:directionId)`, params),
      pool.query(`${actual} SELECT child_id,direction_id,MIN(starts_at) first_paid_at FROM actual WHERE is_trial=FALSE AND charged_lessons>0
        AND (:projectId IS NULL OR project_id_snapshot=:projectId) AND (:directionId IS NULL OR direction_id=:directionId) GROUP BY child_id,direction_id`, params),
      pool.query(`SELECT DATE_FORMAT(p.paid_on,'%Y-%m') month,p.project_id_snapshot project_id,pr.name project_name,pr.code project_code,
        'payment' kind,p.method,SUM(p.amount) amount FROM payments p LEFT JOIN projects pr ON pr.id=p.project_id_snapshot
        WHERE p.deleted_at IS NULL AND p.paid_on BETWEEN :chartFrom AND :chartTo AND (:projectId IS NULL OR p.project_id_snapshot=:projectId) AND (:directionId IS NULL OR p.direction_id=:directionId)
        GROUP BY month,p.project_id_snapshot,pr.name,pr.code,p.method
        UNION ALL SELECT DATE_FORMAT(r.refunded_on,'%Y-%m'),r.project_id_snapshot,pr.name,pr.code,'refund','cashless',SUM(r.amount)
        FROM refunds r LEFT JOIN projects pr ON pr.id=r.project_id_snapshot WHERE r.deleted_at IS NULL AND r.refunded_on BETWEEN :chartFrom AND :chartTo
          AND (:projectId IS NULL OR r.project_id_snapshot=:projectId) AND (:directionId IS NULL OR r.direction_id=:directionId)
        GROUP BY DATE_FORMAT(r.refunded_on,'%Y-%m'),r.project_id_snapshot,pr.name,pr.code`, params),
    ]);
    return calculateStatistics({ period: { from, to }, chartPeriod: { from: chartFrom, to: chartTo }, filters: { projectId, directionId }, observedAt,
      childRows, statusRows, groupRows, lessonRows, memberRows, trialRows, paidRows, moneyRows });
  }
  return { get };
}

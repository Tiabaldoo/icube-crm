import { ApiProblem } from './catalog.mjs';

const CAPACITY = 8;

function dateOnly(value, field) {
  const result = String(value ?? '').trim();
  const match = result.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new ApiProblem(400, 'VALIDATION_ERROR', `Некорректное поле ${field}`);
  const date = new Date(`${result}T00:00:00Z`);
  if (date.toISOString().slice(0, 10) !== result) throw new ApiProblem(400, 'VALIDATION_ERROR', `Некорректное поле ${field}`);
  return result;
}
function optionalId(value, field) {
  if (value == null || value === '' || value === 'all') return null;
  const result = String(value);
  if (!/^[1-9]\d*$/.test(result)) throw new ApiProblem(400, 'VALIDATION_ERROR', `Некорректное поле ${field}`);
  return result;
}
const percent = (part, total) => (total ? (part * 100 / total).toFixed(1) : '0.0');

export function calculateStatistics({ period, filters, attendanceRows = [], firstVisitRows = [], leftRows = [], currentRows = [] }) {
  const lessonIds = new Set(); let visits = 0; let absences = 0;
  const historicalGroups = new Map();
  for (const row of attendanceRows) {
    const lessonId = String(row.lesson_id); lessonIds.add(lessonId);
    const groupId = String(row.group_id); const item = historicalGroups.get(groupId) ?? {
      id: groupId, name: row.group_name ?? 'Группа', projectId: row.project_id_snapshot == null ? null : String(row.project_id_snapshot),
      projectName: row.project_name ?? '', directionId: row.direction_id_snapshot == null ? null : String(row.direction_id_snapshot),
      directionName: row.direction_name ?? '', lessonIds: new Set(), visits: 0, absences: 0, newChildren: 0, leftEnrollments: 0,
    };
    item.lessonIds.add(lessonId);
    if (!row.is_trial) {
      if (row.present) { visits += 1; item.visits += 1; }
      else if (row.attendance_type === 'main') { absences += 1; item.absences += 1; }
    }
    historicalGroups.set(groupId, item);
  }
  const newChildren = new Set();
  for (const row of firstVisitRows) {
    newChildren.add(String(row.child_id));
    const item = historicalGroups.get(String(row.group_id));
    if (item) item.newChildren += 1;
  }
  const leftChildren = new Set();
  for (const row of leftRows) {
    leftChildren.add(String(row.child_id));
    const groupId = String(row.group_id); const item = historicalGroups.get(groupId) ?? {
      id: groupId, name: row.group_name ?? 'Группа', projectId: row.project_id_snapshot == null ? null : String(row.project_id_snapshot),
      projectName: row.project_name ?? '', directionId: row.direction_id_snapshot == null ? null : String(row.direction_id_snapshot),
      directionName: row.direction_name ?? '', lessonIds: new Set(), visits: 0, absences: 0, newChildren: 0, leftEnrollments: 0,
    };
    item.leftEnrollments += 1; historicalGroups.set(groupId, item);
  }
  const currentGroups = new Map(); const activeChildren = new Set();
  for (const row of currentRows) {
    const id = String(row.group_id); const item = currentGroups.get(id) ?? {
      id, name: row.group_name, projectId: String(row.project_id), projectName: row.project_name,
      directionId: String(row.direction_id), directionName: row.direction_name, children: new Set(),
    };
    if (row.child_id != null) { item.children.add(String(row.child_id)); activeChildren.add(String(row.child_id)); }
    currentGroups.set(id, item);
  }
  const allGroups = new Map([...historicalGroups.entries()]);
  for (const [id, group] of currentGroups) allGroups.set(id, { ...(allGroups.get(id) ?? {}), ...group });
  const groups = [...allGroups.values()].map((group) => {
    const history = historicalGroups.get(group.id) ?? { lessonIds: new Set(), visits: 0, absences: 0, newChildren: 0, leftEnrollments: 0 };
    const current = currentGroups.get(group.id);
    return { id: group.id, name: group.name, projectId: group.projectId, projectName: group.projectName,
      directionId: group.directionId, directionName: group.directionName, currentMembers: current?.children.size ?? 0, capacity: CAPACITY,
      occupancyPercent: percent(current?.children.size ?? 0, CAPACITY), completedLessons: history.lessonIds.size,
      visits: history.visits, absences: history.absences, attendancePercent: percent(history.visits, history.visits + history.absences),
      newChildren: history.newChildren, leftChildren: history.leftEnrollments };
  }).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const activeGroupRows = [...currentGroups.values()];
  const averageOccupancy = activeGroupRows.length ? activeGroupRows.reduce((sum, group) => sum + group.children.size * 100 / CAPACITY, 0) / activeGroupRows.length : 0;
  return { period, filters, summary: { completedLessons: lessonIds.size, visits, absences,
    attendancePercent: percent(visits, visits + absences), newChildren: newChildren.size, leftChildren: leftChildren.size,
    activeChildren: activeChildren.size, averageOccupancyPercent: averageOccupancy.toFixed(1) }, groups };
}

export function createStatistics(pool) {
  async function get(raw = {}) {
    const from = dateOnly(raw.from, 'from'); const to = dateOnly(raw.to, 'to');
    if (from > to) throw new ApiProblem(400, 'VALIDATION_ERROR', 'Дата начала периода должна быть не позже даты окончания');
    const projectId = optionalId(raw.projectId, 'projectId'); const directionId = optionalId(raw.directionId, 'directionId');
    const params = { from, to, projectId, directionId };
    const historicalFilter = `${projectId ? ' AND l.project_id_snapshot=:projectId' : ''}${directionId ? ' AND l.direction_id_snapshot=:directionId' : ''}`;
    const snapshotFilter = `${projectId ? ' AND ranked.project_id_snapshot=:projectId' : ''}${directionId ? ' AND ranked.direction_id_snapshot=:directionId' : ''}`;
    const currentFilter = `${projectId ? ' AND g.project_id=:projectId' : ''}${directionId ? ' AND g.direction_id=:directionId' : ''}`;
    const [[attendanceRows], [firstVisitRows], [leftRows], [currentRows]] = await Promise.all([
      pool.query(`SELECT l.id lesson_id,l.group_id,g.name group_name,l.project_id_snapshot,p.name project_name,
          l.direction_id_snapshot,d.name direction_name,a.id attendance_id,COALESCE(a.attendance_type,r.roster_type) attendance_type,
          COALESCE(a.present,FALSE) present,COALESCE(a.is_trial,FALSE) is_trial,a.marked_at
        FROM lessons l JOIN study_groups g ON g.id=l.group_id JOIN projects p ON p.id=l.project_id_snapshot
        JOIN directions d ON d.id=l.direction_id_snapshot
        LEFT JOIN lesson_roster_members r ON r.lesson_id=l.id
        LEFT JOIN attendances a ON a.lesson_id=l.id AND a.child_id=r.child_id
        WHERE l.status='completed' AND l.deleted_at IS NULL AND DATE(l.starts_at) BETWEEN :from AND :to${historicalFilter}
        ORDER BY l.starts_at,l.id,a.id`, params),
      pool.query(`WITH ranked AS (
          SELECT a.child_id,l.group_id,l.project_id_snapshot,l.direction_id_snapshot,l.starts_at,
            ROW_NUMBER() OVER (PARTITION BY a.child_id,l.project_id_snapshot,l.direction_id_snapshot ORDER BY l.starts_at,l.id,a.id) AS rn
          FROM attendances a JOIN lessons l ON l.id=a.lesson_id
          WHERE l.status='completed' AND l.deleted_at IS NULL AND a.marked_at IS NOT NULL AND a.present=TRUE AND a.is_trial=FALSE
        ) SELECT child_id,group_id,project_id_snapshot,direction_id_snapshot,starts_at FROM ranked
        WHERE rn=1 AND DATE(starts_at) BETWEEN :from AND :to${snapshotFilter}`, params),
      pool.query(`WITH ranked AS (
          SELECT h.enrollment_id,e.child_id,h.group_id_snapshot group_id,h.project_id_snapshot,h.direction_id_snapshot,h.new_status,
            ROW_NUMBER() OVER (PARTITION BY h.enrollment_id ORDER BY h.changed_at DESC,h.id DESC) AS rn
          FROM enrollment_status_history h JOIN child_enrollments e ON e.id=h.enrollment_id
          WHERE DATE(h.changed_at) BETWEEN :from AND :to
        ) SELECT enrollment_id,child_id,group_id,project_id_snapshot,direction_id_snapshot,new_status FROM ranked
        WHERE rn=1 AND new_status IN ('paused','finished')${snapshotFilter}`, params),
      pool.query(`SELECT g.id group_id,g.name group_name,g.project_id,p.name project_name,g.direction_id,d.name direction_name,c.id child_id
        FROM study_groups g JOIN projects p ON p.id=g.project_id JOIN directions d ON d.id=g.direction_id
        LEFT JOIN group_memberships gm ON gm.group_id=g.id AND gm.started_on<=CURDATE() AND (gm.ended_on IS NULL OR gm.ended_on>=CURDATE())
        LEFT JOIN child_enrollments e ON e.id=gm.enrollment_id AND e.status='active'
        LEFT JOIN children c ON c.id=e.child_id AND c.deleted_at IS NULL AND c.status IN ('lead','active')
        WHERE g.active=TRUE AND g.deleted_at IS NULL${currentFilter} ORDER BY g.name,g.id,e.child_id`, params),
    ]);
    return calculateStatistics({ period: { from, to }, filters: { projectId, directionId }, attendanceRows, firstVisitRows, leftRows, currentRows });
  }
  return { get };
}

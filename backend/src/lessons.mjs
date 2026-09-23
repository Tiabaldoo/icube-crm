import { inTransaction } from './db.mjs';
import { ApiProblem } from './catalog.mjs';
import { assertProjectScope, partnerProjectId } from './project-scope.mjs';
import { calculateSalary, freezeRosterMembers, lessonDecimal, lessonUnits, moneyCents, moneyDecimal, occurrenceDates, planFifoConsumption } from './lesson-rules.mjs';
import { addCalendarDays, businessDate, parseCalendarDate, BUSINESS_UTC_OFFSET } from '../../src/shared/business-time.mjs';
import { scopedIdempotencyKey } from './idempotency.mjs';

const DAY = 86400000;
const identifier = (value, field = 'id') => {
  const result = String(value ?? '').trim();
  if (!/^[1-9]\d*$/.test(result)) throw new ApiProblem(400, 'VALIDATION_ERROR', `Некорректное поле ${field}`);
  return result;
};
const dateOnly = (value, field = 'date') => {
  try { return parseCalendarDate(String(value ?? '').slice(0, 10)); }
  catch { throw new ApiProblem(400, 'VALIDATION_ERROR', `Некорректное поле ${field}`); }
};
const timeOnly = (value, field = 'time') => {
  const result = value instanceof Date ? value.toISOString().slice(11, 16) : String(value ?? '').includes(' ') ? String(value).slice(11, 16) : String(value ?? '').slice(0, 5);
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(result)) throw new ApiProblem(400, 'VALIDATION_ERROR', `Некорректное поле ${field}`);
  return result;
};
const isoDate = (value) => typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
const isoDateTime = (value) => {
  if (value == null) return null;
  if (typeof value !== 'string') return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Sakhalin', dateStyle: 'short', timeStyle: 'medium' }).format(value).replace(' ', 'T') + BUSINESS_UTC_OFFSET;
  return `${value.slice(0, 10)}T${value.slice(11, 19)}${BUSINESS_UTC_OFFSET}`;
};
const mysqlDateTime = (value) => value instanceof Date
  ? value.toISOString().slice(0, 19).replace('T', ' ')
  : String(value).slice(0, 19).replace('T', ' ');
const bool = (value) => value === true || value === 1 || value === '1';
const nullableText = (value) => value == null || value === '' ? null : String(value).trim() || null;
const hasRole = (context, role) => (context.roles ?? []).includes(role);

function mysqlError(error) {
  if (error instanceof ApiProblem) return error;
  if (error?.code === 'ER_DUP_ENTRY') return new ApiProblem(409, 'CONFLICT', 'Операция уже выполнена');
  if (error?.code === 'ER_NO_REFERENCED_ROW_2') return new ApiProblem(400, 'INVALID_REFERENCE', 'Связанная запись не найдена');
  return error;
}

function lessonKind(row) {
  if (row.status === 'cancelled') return 'cancelled';
  if (bool(row.is_empty_trip)) return 'empty_trip';
  if (bool(row.is_intro_group)) return 'intro';
  return 'regular';
}

export function createMysqlLessons(pool, { lessonPhotos = null, parentNotifications = null } = {}) {
  const baseSelect = `SELECT l.*,g.name group_name,d.name direction_name,p.name project_name,s.name site_name,os.name site_override_name,
    (SELECT JSON_ARRAYAGG(an.child_id) FROM lesson_child_absence_notices an
      WHERE an.lesson_id=l.id AND an.cancelled_at IS NULL) absence_notice_child_ids,
    (SELECT JSON_ARRAYAGG(c.id) FROM children c WHERE c.deleted_at IS NULL AND c.status<>'archived'
      AND c.birth_date IS NOT NULL AND (DATE_FORMAT(c.birth_date,'%m-%d')=DATE_FORMAT(l.starts_at,'%m-%d')
        OR (DATE_FORMAT(c.birth_date,'%m-%d')='02-29' AND DATE_FORMAT(l.starts_at,'%m-%d')='02-28' AND DAY(LAST_DAY(l.starts_at))=28)) AND (
        EXISTS (SELECT 1 FROM lesson_roster_members br WHERE br.lesson_id=l.id AND br.child_id=c.id) OR
        (NOT EXISTS (SELECT 1 FROM lesson_roster_members frozen WHERE frozen.lesson_id=l.id) AND EXISTS (
          SELECT 1 FROM child_enrollments be JOIN group_memberships bgm ON bgm.enrollment_id=be.id
          WHERE be.child_id=c.id AND be.status='active' AND be.superseded_at IS NULL AND bgm.group_id=l.group_id
            AND bgm.started_on<=DATE(l.starts_at) AND (bgm.ended_on IS NULL OR bgm.ended_on>=DATE(l.starts_at))
        ))
      )) birthday_child_ids,
    pt.full_name planned_teacher_name,act.full_name actual_teacher_name
    FROM lessons l JOIN study_groups g ON g.id=l.group_id JOIN directions d ON d.id=l.direction_id_snapshot
    JOIN projects p ON p.id=l.project_id_snapshot JOIN sites s ON s.id=l.site_id_snapshot
    LEFT JOIN sites os ON os.id=l.site_override_id
    JOIN teachers pt ON pt.id=l.planned_teacher_id LEFT JOIN teachers act ON act.id=l.actual_teacher_id`;

  async function teacherForContext(connection, context) {
    if (!hasRole(context, 'teacher') || hasRole(context, 'director') || hasRole(context, 'partner')) return null;
    if (context.teacherId) return identifier(context.teacherId, 'teacherId');
    if (!context.userId) throw new ApiProblem(403, 'FORBIDDEN', 'Преподаватель не связан с пользователем');
    const [rows] = await connection.query('SELECT id FROM teachers WHERE user_id=:userId AND deleted_at IS NULL AND active=TRUE', { userId: context.userId });
    if (!rows.length) throw new ApiProblem(403, 'FORBIDDEN', 'Преподаватель не найден');
    return String(rows[0].id);
  }

  async function loadRows(where, params, context, connection = pool) {
    const teacherId = await teacherForContext(connection, context);
    const scope = teacherId ? ` AND (l.planned_teacher_id=:actorTeacherId OR l.actual_teacher_id=:actorTeacherId)
      AND EXISTS (SELECT 1 FROM teacher_projects tp
        JOIN teacher_project_directions tpd ON tpd.teacher_id=tp.teacher_id AND tpd.project_id=tp.project_id
        WHERE tp.teacher_id=:actorTeacherId AND tp.project_id=l.project_id_snapshot AND tp.active=TRUE
          AND tpd.direction_id=l.direction_id_snapshot)` : '';
    const [lessonRows] = await connection.query(`${baseSelect} WHERE (${where}) AND l.deleted_at IS NULL${scope} ORDER BY l.starts_at,l.id`, { ...params, actorTeacherId: teacherId });
    if (!lessonRows.length) return [];
    const partnerProject = partnerProjectId(context);
    const ids = lessonRows.filter((row) => !partnerProject || String(row.project_id_snapshot) === partnerProject)
      .map((row) => String(row.id)).join(',');
    const [[rosterRows], [attendanceRows], [salaryRows]] = await Promise.all([
      ids ? connection.query(`SELECT lesson_id,child_id,roster_type FROM lesson_roster_members WHERE lesson_id IN (${ids}) ORDER BY child_id`) : Promise.resolve([[]]),
      ids ? connection.query(`SELECT id,lesson_id,child_id,enrollment_id,attendance_type,present,is_trial,price_snapshot,charged_lessons,marked_at FROM attendances WHERE lesson_id IN (${ids}) ORDER BY child_id`) : Promise.resolve([[]]),
      ids && (hasRole(context, 'director') || partnerProject)
        ? connection.query(`SELECT sa.* FROM salary_accruals sa WHERE sa.lesson_id IN (${ids}) AND sa.reversed_at IS NULL ORDER BY sa.id`)
        : Promise.resolve([[]]),
    ]);
    const jsonIds = (value) => {
      if (value == null) return [];
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      return Array.isArray(parsed) ? parsed.map(String) : [];
    };
    return lessonRows.map((row) => {
      if (partnerProject && String(row.project_id_snapshot) !== partnerProject) return {
        id: String(row.id), groupId: String(row.group_id), groupName: row.group_name,
        projectId: String(row.project_id_snapshot), projectName: row.project_name,
        plannedTeacherId: String(row.planned_teacher_id), plannedTeacherName: row.planned_teacher_name,
        actualTeacherId: row.actual_teacher_id == null ? null : String(row.actual_teacher_id), actualTeacherName: row.actual_teacher_name,
        siteId: String(row.site_override_id ?? row.site_id_snapshot), siteName: row.site_override_name ?? row.site_name,
        scheduledStartsAt: isoDateTime(row.scheduled_starts_at), scheduledEndsAt: isoDateTime(row.scheduled_ends_at),
        startsAt: isoDateTime(row.starts_at), endsAt: isoDateTime(row.ends_at), readOnly: true,
      };
      const roster = rosterRows.filter((item) => String(item.lesson_id) === String(row.id)).map((item) => ({ childId: String(item.child_id), type: item.roster_type }));
      const attendances = attendanceRows.filter((item) => String(item.lesson_id) === String(row.id)).map((item) => ({
        id: String(item.id), childId: String(item.child_id), enrollmentId: item.enrollment_id == null ? null : String(item.enrollment_id),
        type: item.attendance_type, present: bool(item.present), trial: bool(item.is_trial),
        ...(hasRole(context, 'director') ? { priceSnapshot: item.price_snapshot == null ? null : String(item.price_snapshot), chargedLessons: String(item.charged_lessons) } : {}),
        markedAt: isoDateTime(item.marked_at),
      }));
      const salary = salaryRows.find((item) => String(item.lesson_id) === String(row.id));
      return {
        id: String(row.id), groupId: String(row.group_id), groupName: row.group_name,
        directionId: String(row.direction_id_snapshot), directionName: row.direction_name,
        projectId: String(row.project_id_snapshot), projectName: row.project_name,
        siteId: String(row.site_override_id ?? row.site_id_snapshot), siteName: row.site_override_name ?? row.site_name,
        siteOverrideId: row.site_override_id == null ? null : String(row.site_override_id),
        plannedTeacherId: String(row.planned_teacher_id), plannedTeacherName: row.planned_teacher_name,
        actualTeacherId: row.actual_teacher_id == null ? null : String(row.actual_teacher_id), actualTeacherName: row.actual_teacher_name,
        scheduledStartsAt: isoDateTime(row.scheduled_starts_at), scheduledEndsAt: isoDateTime(row.scheduled_ends_at), startsAt: isoDateTime(row.starts_at), endsAt: isoDateTime(row.ends_at),
        actualStartsAt: isoDateTime(row.actual_starts_at), actualEndsAt: isoDateTime(row.actual_ends_at), status: row.status,
        topic: row.topic, introGroup: bool(row.is_intro_group), emptyTrip: bool(row.is_empty_trip), rosterFrozenAt: isoDateTime(row.roster_frozen_at),
        attendanceAppliedAt: isoDateTime(row.attendance_applied_at), completedAt: isoDateTime(row.completed_at), cancelledAt: isoDateTime(row.cancelled_at),
        lockVersion: Number(row.lock_version), roster, attendances,
        absenceNoticeChildIds: jsonIds(row.absence_notice_child_ids), birthdayChildIds: jsonIds(row.birthday_child_ids),
        ...(salary ? { salary: { id: String(salary.id), teacherId: String(salary.teacher_id), rateVersionId: salary.rate_version_id == null ? null : String(salary.rate_version_id),
          type: salary.accrual_type, presentChildren: Number(salary.present_children), fixedAmount: String(salary.fixed_amount), childrenAmount: String(salary.children_amount), totalAmount: String(salary.total_amount) } } : {}),
      };
    });
  }

  async function materialize(from, to, groupId = null) {
    from = dateOnly(from, 'from'); to = dateOnly(to, 'to');
    const first = Date.parse(`${from}T00:00:00Z`); const last = Date.parse(`${to}T00:00:00Z`);
    if (last < first || last - first > 370 * DAY) throw new ApiProblem(400, 'VALIDATION_ERROR', 'Диапазон занятий должен быть не больше 370 дней');
    const params = { from, to };
    const cleanupGroupFilter = groupId == null ? '' : ' AND l.group_id=:groupId';
    if (groupId != null) params.groupId = identifier(groupId, 'groupId');
    await pool.query(`DELETE l FROM lessons l JOIN study_groups g ON g.id=l.group_id
      WHERE l.deleted_at IS NULL AND l.status='scheduled' AND l.scheduled_starts_at>NOW(6) AND l.actual_starts_at IS NULL
        AND l.roster_frozen_at IS NULL AND l.attendance_applied_at IS NULL AND l.completed_at IS NULL AND l.cancelled_at IS NULL
        AND l.lock_version=1
        AND NOT EXISTS (SELECT 1 FROM lesson_roster_members r WHERE r.lesson_id=l.id)
        AND NOT EXISTS (SELECT 1 FROM attendances a WHERE a.lesson_id=l.id)
        AND NOT EXISTS (SELECT 1 FROM lesson_photos ph WHERE ph.lesson_id=l.id)
        AND NOT EXISTS (SELECT 1 FROM salary_accruals sa WHERE sa.lesson_id=l.id)
        AND (g.deleted_at IS NOT NULL OR g.active=FALSE OR DATE(l.scheduled_starts_at)<g.starts_on
          OR (g.ends_on IS NOT NULL AND DATE(l.scheduled_starts_at)>g.ends_on)
          OR WEEKDAY(l.scheduled_starts_at)+1<>g.weekday OR TIME(l.scheduled_starts_at)<>g.start_time
          OR TIME(l.scheduled_ends_at)<>g.end_time OR l.direction_id_snapshot<>g.direction_id
          OR l.project_id_snapshot<>g.project_id OR l.site_id_snapshot<>g.site_id
          OR l.planned_teacher_id<>g.default_teacher_id)${cleanupGroupFilter}`, params);
    const today = businessDate();
    const occurrenceFrom = from < today ? today : from;
    if (to < occurrenceFrom) return;
    params.from = occurrenceFrom;
    const groupFilter = groupId == null ? '' : ' AND g.id=:groupId';
    const [groups] = await pool.query(`SELECT g.id,g.direction_id,g.project_id,g.site_id,g.default_teacher_id,g.weekday,g.start_time,g.end_time,g.starts_on,g.ends_on
      FROM study_groups g WHERE g.deleted_at IS NULL AND g.active=TRUE AND g.starts_on<=:to AND (g.ends_on IS NULL OR g.ends_on>=:from)${groupFilter}`, params);
    for (const group of groups) {
      for (const date of occurrenceDates(group, occurrenceFrom, to)) {
        const start = timeOnly(group.start_time); const end = timeOnly(group.end_time);
        await pool.query(`INSERT IGNORE INTO lessons
          (group_id,direction_id_snapshot,project_id_snapshot,site_id_snapshot,scheduled_starts_at,scheduled_ends_at,starts_at,ends_at,planned_teacher_id,status)
          VALUES (:groupId,:directionId,:projectId,:siteId,CONCAT(:date,' ',:start,':00'),CONCAT(:date,' ',:end,':00'),CONCAT(:date,' ',:start,':00'),CONCAT(:date,' ',:end,':00'),:teacherId,'scheduled')`, {
          groupId: group.id, directionId: group.direction_id, projectId: group.project_id, siteId: group.site_id,
          date, start, end, teacherId: group.default_teacher_id,
        });
      }
    }
  }

  async function list(filters = {}, context = {}) {
    const today = businessDate();
    const from = filters.from ? dateOnly(filters.from, 'from') : addCalendarDays(today, -120);
    const to = filters.to ? dateOnly(filters.to, 'to') : addCalendarDays(today, 90);
    await materialize(from, to);
    const conditions = [`((l.starts_at>=CONCAT(:from,' 00:00:00') AND l.starts_at<DATE_ADD(:to,INTERVAL 1 DAY))
      OR (l.scheduled_starts_at>=CONCAT(:from,' 00:00:00') AND l.scheduled_starts_at<DATE_ADD(:to,INTERVAL 1 DAY)))`]; const params = { from, to };
    if (filters.teacherId) { conditions.push('(l.planned_teacher_id=:teacherId OR l.actual_teacher_id=:teacherId)'); params.teacherId = identifier(filters.teacherId, 'teacherId'); }
    if (filters.projectId) { conditions.push('l.project_id_snapshot=:projectId'); params.projectId = identifier(filters.projectId, 'projectId'); }
    return loadRows(conditions.join(' AND '), params, context);
  }

  async function get(lessonId, context = {}, connection = pool) {
    const rows = await loadRows('l.id=:id', { id: identifier(lessonId) }, context, connection);
    if (!rows.length) throw new ApiProblem(404, 'NOT_FOUND', 'Занятие не найдено');
    return rows[0];
  }

  async function create(body, context = {}) {
    if (!hasRole(context, 'director') && !hasRole(context, 'partner')) throw new ApiProblem(403, 'FORBIDDEN', 'Недостаточно прав для создания занятия');
    const groupId = identifier(body.groupId, 'groupId'); const scheduledDate = dateOnly(body.scheduledDate, 'scheduledDate');
    const [groups] = await pool.query(`SELECT id,direction_id,project_id,site_id,default_teacher_id,weekday,start_time,end_time,starts_on,ends_on
      FROM study_groups WHERE id=:groupId AND deleted_at IS NULL`, { groupId });
    const group = groups[0];
    if (group) assertProjectScope(context, group.project_id);
    if (!group || occurrenceDates(group, scheduledDate, scheduledDate).length !== 1) {
      throw new ApiProblem(409, 'OCCURRENCE_OUTSIDE_SCHEDULE', 'На эту дату занятие группы не запланировано');
    }
    const start = timeOnly(group.start_time); const end = timeOnly(group.end_time);
    await pool.query(`INSERT IGNORE INTO lessons
      (group_id,direction_id_snapshot,project_id_snapshot,site_id_snapshot,scheduled_starts_at,scheduled_ends_at,starts_at,ends_at,planned_teacher_id,status)
      VALUES (:groupId,:directionId,:projectId,:siteId,CONCAT(:date,' ',:start,':00'),CONCAT(:date,' ',:end,':00'),CONCAT(:date,' ',:start,':00'),CONCAT(:date,' ',:end,':00'),:teacherId,'scheduled')`, {
      groupId: group.id, directionId: group.direction_id, projectId: group.project_id, siteId: group.site_id,
      date: scheduledDate, start, end, teacherId: group.default_teacher_id,
    });
    const [rows] = await pool.query(`SELECT l.id FROM lessons l WHERE l.group_id=:groupId
      AND DATE(l.scheduled_starts_at)=:scheduledDate AND l.deleted_at IS NULL`, { groupId, scheduledDate });
    if (!rows.length) throw new ApiProblem(409, 'LESSON_DELETED', 'Это занятие было явно удалено и не может быть создано повторно');
    return get(rows[0].id, context);
  }

  async function deletedOccurrences(context = {}) {
    const actorTeacherId = await teacherForContext(pool, context);
    const scope = actorTeacherId ? ` AND (l.planned_teacher_id=:actorTeacherId OR l.actual_teacher_id=:actorTeacherId)
      AND EXISTS (SELECT 1 FROM teacher_projects tp
        JOIN teacher_project_directions tpd ON tpd.teacher_id=tp.teacher_id AND tpd.project_id=tp.project_id
        WHERE tp.teacher_id=:actorTeacherId AND tp.project_id=l.project_id_snapshot AND tp.active=TRUE
          AND tpd.direction_id=l.direction_id_snapshot)` : '';
    const projectId = partnerProjectId(context);
    const projectScope = projectId ? ' AND project_id_snapshot=:projectId' : '';
    const [rows] = await pool.query(`SELECT l.group_id,l.scheduled_starts_at FROM lessons l
      WHERE l.deleted_at IS NOT NULL${scope}${projectScope} ORDER BY l.scheduled_starts_at,l.id`, { actorTeacherId, projectId });
    return rows.map((row) => ({ groupId: String(row.group_id), scheduledDate: isoDate(row.scheduled_starts_at) }));
  }

  async function lockLesson(connection, lessonId) {
    const [rows] = await connection.query('SELECT * FROM lessons WHERE id=:id FOR UPDATE', { id: identifier(lessonId) });
    if (!rows.length || rows[0].deleted_at != null) throw new ApiProblem(404, 'NOT_FOUND', 'Занятие не найдено');
    return rows[0];
  }

  async function assertAccess(connection, lesson, context) {
    assertProjectScope(context, lesson.project_id_snapshot);
    const actorTeacherId = await teacherForContext(connection, context);
    if (actorTeacherId && ![lesson.planned_teacher_id, lesson.actual_teacher_id].some((id) => String(id) === actorTeacherId)) throw new ApiProblem(403, 'FORBIDDEN', 'Занятие не назначено преподавателю');
    if (actorTeacherId) {
      const [access] = await connection.query(`SELECT tp.teacher_id FROM teacher_projects tp
        JOIN teacher_project_directions tpd ON tpd.teacher_id=tp.teacher_id AND tpd.project_id=tp.project_id
        WHERE tp.teacher_id=:teacherId AND tp.project_id=:projectId AND tp.active=TRUE
          AND tpd.direction_id=:directionId LIMIT 1`, {
        teacherId: actorTeacherId, projectId: lesson.project_id_snapshot, directionId: lesson.direction_id_snapshot,
      });
      if (!access.length) throw new ApiProblem(403, 'FORBIDDEN', 'Преподаватель не активен в проекте или направлении занятия');
    }
    return actorTeacherId;
  }

  async function update(lessonId, body, context = {}) {
    try {
      await inTransaction(pool, async (connection) => {
        const lesson = await lockLesson(connection, lessonId); const actorTeacherId = await assertAccess(connection, lesson, context);
        if (lesson.status === 'cancelled') throw new ApiProblem(409, 'LESSON_FINAL', 'Отменённое занятие нельзя изменить этим маршрутом');
        if (lesson.status === 'completed' && !hasRole(context, 'director') && !hasRole(context, 'partner')) throw new ApiProblem(403, 'FORBIDDEN', 'Проведённое занятие может перенести только администратор проекта');
        if ((body.emptyTrip !== undefined || body.introGroup !== undefined) && !hasRole(context, 'director') && !hasRole(context, 'partner')) throw new ApiProblem(403, 'FORBIDDEN', 'Тип занятия меняет только администратор проекта');
        const siteChanged = Object.prototype.hasOwnProperty.call(body, 'siteId');
        if (siteChanged && !hasRole(context, 'director') && !hasRole(context, 'partner')) throw new ApiProblem(403, 'FORBIDDEN', 'Площадку занятия меняет только администратор проекта');
        let siteOverrideId = lesson.site_override_id;
        if (siteChanged) {
          if (body.siteId == null || body.siteId === '') siteOverrideId = null;
          else {
            siteOverrideId = identifier(body.siteId, 'siteId');
            const [sites] = await connection.query('SELECT id FROM sites WHERE id=:id AND deleted_at IS NULL', { id: siteOverrideId });
            if (!sites.length) throw new ApiProblem(400, 'INVALID_REFERENCE', 'Площадка не найдена');
          }
        }
        const date = body.date === undefined ? isoDate(lesson.starts_at) : dateOnly(body.date);
        const start = body.startTime === undefined ? timeOnly(lesson.starts_at) : timeOnly(body.startTime, 'startTime');
        const end = body.endTime === undefined ? timeOnly(lesson.ends_at) : timeOnly(body.endTime, 'endTime');
        if (end <= start) throw new ApiProblem(400, 'VALIDATION_ERROR', 'Окончание должно быть позже начала');
        const teacherId = actorTeacherId ?? (body.actualTeacherId === undefined ? lesson.actual_teacher_id : identifier(body.actualTeacherId, 'actualTeacherId'));
        if (teacherId != null) {
          const [teachers] = await connection.query(`SELECT t.id FROM teachers t JOIN teacher_projects tp ON tp.teacher_id=t.id
            JOIN teacher_project_directions tpd ON tpd.teacher_id=t.id AND tpd.project_id=tp.project_id
            WHERE t.id=:id AND tp.project_id=:projectId AND tp.active=TRUE AND tpd.direction_id=:directionId AND t.deleted_at IS NULL`,
          { id: teacherId, projectId: lesson.project_id_snapshot, directionId: lesson.direction_id_snapshot });
          if (!teachers.length) throw new ApiProblem(400, 'INVALID_REFERENCE', 'Преподаватель не найден');
        }
        if (lesson.status === 'completed' && String(teacherId ?? '') !== String(lesson.actual_teacher_id ?? '')) {
          throw new ApiProblem(409, 'COMPLETED_TEACHER_LOCKED', 'При переносе проведённого занятия нельзя менять фактического преподавателя');
        }
        const introGroup = body.introGroup === undefined ? bool(lesson.is_intro_group) : bool(body.introGroup);
        const emptyTrip = body.emptyTrip === undefined ? bool(lesson.is_empty_trip) : bool(body.emptyTrip);
        if (introGroup && emptyTrip) throw new ApiProblem(400, 'LESSON_TYPE_CONFLICT', 'Занятие не может одновременно быть ознакомительным и пустым выездом');
        await connection.query(`UPDATE lessons SET starts_at=CONCAT(:date,' ',:start,':00'),ends_at=CONCAT(:date,' ',:end,':00'),
          actual_teacher_id=:teacherId,site_override_id=:siteOverrideId,topic=:topic,is_intro_group=:introGroup,is_empty_trip=:emptyTrip,lock_version=lock_version+1 WHERE id=:id`, {
          id: lesson.id, date, start, end, teacherId, siteOverrideId, topic: body.topic === undefined ? lesson.topic : nullableText(body.topic),
          introGroup, emptyTrip,
        });
        const updatedStartsAt = `${date} ${start}:00`;
        if (parentNotifications && lesson.status !== 'completed' && mysqlDateTime(lesson.starts_at) !== updatedStartsAt) {
          await parentNotifications.lessonMoved(connection, { ...lesson, starts_at: updatedStartsAt }, lesson.starts_at);
        }
        if (lesson.status === 'completed' && (introGroup !== bool(lesson.is_intro_group) || emptyTrip !== bool(lesson.is_empty_trip))) {
          lesson.is_intro_group = introGroup; lesson.is_empty_trip = emptyTrip; lesson.starts_at = updatedStartsAt;
          await recalculateSalary(connection, lesson);
        }
      });
      return get(lessonId, context);
    } catch (error) { throw mysqlError(error); }
  }

  async function priorVisit(connection, enrollmentId, lesson) {
    const [rows] = await connection.query(`SELECT a.id FROM attendances a JOIN lessons l ON l.id=a.lesson_id
      WHERE a.enrollment_id=:enrollmentId AND a.present=TRUE AND l.status='completed'
        AND (l.starts_at<:startsAt OR (l.starts_at=:startsAt AND l.id<:lessonId)) LIMIT 1`, {
      enrollmentId, startsAt: lesson.starts_at, lessonId: lesson.id,
    });
    return rows.length > 0;
  }

  async function start(lessonId, body = {}, context = {}) {
    try {
      await inTransaction(pool, async (connection) => {
        const lesson = await lockLesson(connection, lessonId); const actorTeacherId = await assertAccess(connection, lesson, context);
        if (lesson.status === 'in_progress' || lesson.status === 'completed') return;
        if (lesson.status !== 'scheduled') throw new ApiProblem(409, 'LESSON_FINAL', 'Отменённое занятие нельзя начать');
        const actualTeacherId = actorTeacherId ?? identifier(body.actualTeacherId ?? lesson.planned_teacher_id, 'actualTeacherId');
        const [teachers] = await connection.query(`SELECT t.id FROM teachers t JOIN teacher_projects tp ON tp.teacher_id=t.id
          JOIN teacher_project_directions tpd ON tpd.teacher_id=t.id AND tpd.project_id=tp.project_id
          WHERE t.id=:id AND tp.project_id=:projectId AND tp.active=TRUE AND tpd.direction_id=:directionId AND t.deleted_at IS NULL`, {
          id: actualTeacherId, projectId: lesson.project_id_snapshot, directionId: lesson.direction_id_snapshot,
        });
        if (!teachers.length) throw new ApiProblem(400, 'INVALID_REFERENCE', 'Фактический преподаватель не найден');
        const [members] = await connection.query(`SELECT gm.child_id,gm.enrollment_id FROM (
          SELECT e.child_id,e.id enrollment_id,gm.id membership_id FROM group_memberships gm
          JOIN child_enrollments e ON e.id=gm.enrollment_id JOIN children c ON c.id=e.child_id
          WHERE gm.group_id=:groupId AND gm.started_on<=DATE(:startsAt) AND (gm.ended_on IS NULL OR gm.ended_on>=DATE(:startsAt))
            AND e.status='active' AND c.deleted_at IS NULL AND c.status IN ('lead','active')
        ) gm ORDER BY gm.child_id`, { groupId: lesson.group_id, startsAt: lesson.starts_at });
        const roster = freezeRosterMembers(members);
        for (const member of roster) {
          await connection.query(`INSERT IGNORE INTO lesson_roster_members (lesson_id,child_id,roster_type,added_by_user_id,frozen_at)
            VALUES (:lessonId,:childId,'main',:actorId,NOW(6))`, { lessonId: lesson.id, childId: member.childId, actorId: context.userId ?? null });
          const trial = !(await priorVisit(connection, member.enrollmentId, lesson));
          await connection.query(`INSERT IGNORE INTO attendances
            (lesson_id,child_id,enrollment_id,attendance_type,present,is_trial,marked_by_user_id)
            VALUES (:lessonId,:childId,:enrollmentId,'main',FALSE,:trial,:actorId)`, {
            lessonId: lesson.id, childId: member.childId, enrollmentId: member.enrollmentId, trial, actorId: context.userId ?? null,
          });
        }
        await connection.query(`UPDATE lessons SET status='in_progress',actual_teacher_id=:teacherId,actual_starts_at=NOW(6),
          roster_frozen_at=NOW(6),lock_version=lock_version+1 WHERE id=:id`, { id: lesson.id, teacherId: actualTeacherId });
      });
      return get(lessonId, context);
    } catch (error) { throw mysqlError(error); }
  }

  async function enrollmentForAttendance(connection, lesson, childId) {
    const date = isoDate(lesson.starts_at);
    const [rows] = await connection.query(`SELECT e.id,e.child_id,e.direction_id,
      COALESCE(
        (SELECT pv.price FROM price_versions pv WHERE pv.scope_type='enrollment' AND pv.enrollment_id=e.id AND pv.valid_from<=:startsAt AND (pv.valid_to IS NULL OR pv.valid_to>:startsAt) ORDER BY pv.valid_from DESC,pv.id DESC LIMIT 1),
        CASE WHEN NOT EXISTS (SELECT 1 FROM price_versions pv WHERE pv.scope_type='enrollment' AND pv.enrollment_id=e.id) THEN e.individual_price END,
        (SELECT pv.price FROM price_versions pv JOIN group_memberships gm ON gm.group_id=pv.group_id WHERE pv.scope_type='group' AND gm.enrollment_id=e.id AND gm.started_on<=:date AND (gm.ended_on IS NULL OR gm.ended_on>=:date) AND pv.valid_from<=:startsAt AND (pv.valid_to IS NULL OR pv.valid_to>:startsAt) ORDER BY gm.started_on DESC,pv.valid_from DESC,pv.id DESC LIMIT 1),
        (SELECT pv.price FROM price_versions pv WHERE pv.scope_type='direction' AND pv.direction_id=e.direction_id
          AND (pv.project_id=e.project_id OR pv.project_id IS NULL) AND pv.valid_from<=:startsAt
          AND (pv.valid_to IS NULL OR pv.valid_to>:startsAt)
          ORDER BY (pv.project_id IS NOT NULL) DESC,pv.valid_from DESC,pv.id DESC LIMIT 1)
      ) current_price
      FROM child_enrollments e WHERE e.child_id=:childId AND e.direction_id=:directionId
        AND e.project_id=:projectId AND (e.superseded_at IS NULL OR e.superseded_at>:startsAt)
        AND (NOT EXISTS (SELECT 1 FROM enrollment_project_transfers pt WHERE pt.target_enrollment_id=e.id)
          OR e.created_at<=:startsAt)
      ORDER BY e.id DESC LIMIT 1 FOR UPDATE`, {
      childId: identifier(childId, 'childId'), directionId: lesson.direction_id_snapshot,
      projectId: lesson.project_id_snapshot, date, startsAt: lesson.starts_at,
    });
    if (!rows.length) throw new ApiProblem(409, 'ENROLLMENT_NOT_FOUND', 'У ребёнка нет направления этого занятия');
    if (rows[0].current_price == null) throw new ApiProblem(409, 'PRICE_NOT_CONFIGURED', 'Для посещения не настроена историческая цена');
    return rows[0];
  }

  async function activeAttendanceDebit(connection, attendanceId) {
    const [rows] = await connection.query(`SELECT be.* FROM balance_entries be
      LEFT JOIN balance_entries reversal ON reversal.reversal_of_entry_id=be.id
      WHERE be.attendance_id=:attendanceId AND be.entry_type='attendance' AND reversal.id IS NULL FOR UPDATE`, { attendanceId });
    if (rows.length > 1) throw new ApiProblem(409, 'ATTENDANCE_LEDGER_INCONSISTENT', 'У посещения несколько активных списаний');
    return rows[0] ?? null;
  }

  async function debitAttendance(connection, attendance, enrollment, lesson, context) {
    const [lots] = await connection.query(`SELECT id,remaining_lessons,unit_price FROM balance_lots
      WHERE enrollment_id=:enrollmentId AND remaining_lessons>0 ORDER BY created_at,id FOR UPDATE`, { enrollmentId: enrollment.id });
    const plan = planFifoConsumption(lots, '1.00000000', String(enrollment.current_price));
    const [entry] = await connection.query(`INSERT INTO balance_entries
      (enrollment_id,entry_type,lessons_delta,amount_delta,unit_price_snapshot,attendance_id,occurred_at,created_by_user_id)
      VALUES (:enrollmentId,'attendance','-1.00000000',:amount,:price,:attendanceId,:occurredAt,:actorId)`, {
      enrollmentId: enrollment.id, amount: moneyDecimal(-moneyCents(plan.amount)), price: String(enrollment.current_price),
      attendanceId: attendance.id, occurredAt: lesson.starts_at, actorId: context.userId ?? null,
    });
    for (const consumption of plan.consumptions) {
      await connection.query('UPDATE balance_lots SET remaining_lessons=remaining_lessons-:lessons WHERE id=:id', { id: consumption.lotId, lessons: consumption.lessons });
      await connection.query(`INSERT INTO balance_lot_consumptions (balance_lot_id,balance_entry_id,lessons,amount)
        VALUES (:lotId,:entryId,:lessons,:amount)`, { lotId: consumption.lotId, entryId: entry.insertId, lessons: consumption.lessons, amount: consumption.amount });
    }
    await connection.query('UPDATE child_enrollments SET balance_lessons=balance_lessons-1.00000000 WHERE id=:id', { id: enrollment.id });
    await connection.query('UPDATE attendances SET enrollment_id=:enrollmentId,price_snapshot=:price,charged_lessons=1.00000000 WHERE id=:id', { id: attendance.id, enrollmentId: enrollment.id, price: String(enrollment.current_price) });
  }

  async function reverseAttendanceDebit(connection, attendance, context) {
    const debit = await activeAttendanceDebit(connection, attendance.id);
    if (!debit) return null;
    const [consumptions] = await connection.query('SELECT balance_lot_id,lessons FROM balance_lot_consumptions WHERE balance_entry_id=:entryId FOR UPDATE', { entryId: debit.id });
    for (const consumption of consumptions) {
      await connection.query('UPDATE balance_lots SET remaining_lessons=remaining_lessons+:lessons WHERE id=:id', { id: consumption.balance_lot_id, lessons: String(consumption.lessons) });
    }
    const [reversal] = await connection.query(`INSERT INTO balance_entries
      (enrollment_id,entry_type,lessons_delta,amount_delta,unit_price_snapshot,reversal_of_entry_id,occurred_at,created_by_user_id)
      VALUES (:enrollmentId,'reversal',:lessons,:amount,:price,:oldEntryId,NOW(6),:actorId)`, {
      enrollmentId: debit.enrollment_id, lessons: lessonDecimal(-lessonUnits(String(debit.lessons_delta))),
      amount: moneyDecimal(-moneyCents(String(debit.amount_delta))), price: debit.unit_price_snapshot,
      oldEntryId: debit.id, actorId: context.userId ?? null,
    });
    await connection.query('UPDATE child_enrollments SET balance_lessons=balance_lessons+:lessons WHERE id=:id', {
      id: debit.enrollment_id, lessons: lessonDecimal(-lessonUnits(String(debit.lessons_delta))),
    });
    await connection.query('UPDATE attendances SET charged_lessons=0 WHERE id=:id', { id: attendance.id });
    return { debitId: debit.id, reversalId: reversal.insertId };
  }

  async function purgeAttendanceLedger(connection, attendanceId) {
    await connection.query(`DELETE blc FROM balance_lot_consumptions blc
      JOIN balance_entries debit ON debit.id=blc.balance_entry_id WHERE debit.attendance_id=:attendanceId`, { attendanceId });
    await connection.query(`DELETE reversal FROM balance_entries reversal
      JOIN balance_entries debit ON debit.id=reversal.reversal_of_entry_id WHERE debit.attendance_id=:attendanceId`, { attendanceId });
    await connection.query('DELETE FROM balance_entries WHERE attendance_id=:attendanceId', { attendanceId });
  }

  async function salaryRate(connection, lesson) {
    const [rows] = await connection.query(`SELECT * FROM salary_rate_versions WHERE
      (teacher_id=:teacherId OR teacher_id IS NULL) AND (direction_id=:directionId OR direction_id IS NULL)
      AND valid_from<=:startsAt AND (valid_to IS NULL OR valid_to>:startsAt)
      ORDER BY (teacher_id=:teacherId) DESC,(direction_id=:directionId) DESC,valid_from DESC,id DESC LIMIT 1`, {
      teacherId: lesson.actual_teacher_id ?? lesson.planned_teacher_id, directionId: lesson.direction_id_snapshot, startsAt: lesson.starts_at,
    });
    if (!rows.length) throw new ApiProblem(409, 'SALARY_RATE_NOT_CONFIGURED', 'Не настроена ставка зарплаты на дату занятия');
    return rows[0];
  }

  async function recalculateSalary(connection, lesson) {
    const [oldRows] = await connection.query('SELECT * FROM salary_accruals WHERE lesson_id=:lessonId AND reversed_at IS NULL ORDER BY id DESC LIMIT 1 FOR UPDATE', { lessonId: lesson.id });
    const old = oldRows[0] ?? null;
    if (lesson.status === 'cancelled') {
      if (old) await connection.query('UPDATE salary_accruals SET reversed_at=NOW(6) WHERE id=:id', { id: old.id });
      return;
    }
    if (lesson.status !== 'completed') return;
    const [countRows] = await connection.query('SELECT COUNT(*) present_count FROM attendances WHERE lesson_id=:lessonId AND present=TRUE', { lessonId: lesson.id });
    if (lessonKind(lesson) === 'regular' && Number(countRows[0].present_count) === 0) {
      if (old) await connection.query('UPDATE salary_accruals SET reversed_at=NOW(6) WHERE id=:id', { id: old.id });
      return;
    }
    const rate = await salaryRate(connection, lesson);
    const salary = calculateSalary(lessonKind(lesson), Number(countRows[0].present_count), rate);
    const teacherId = lesson.actual_teacher_id ?? lesson.planned_teacher_id;
    if (old && String(old.teacher_id) === String(teacherId) && String(old.rate_version_id) === String(rate.id) && old.accrual_type === salary.kind && Number(old.present_children) === salary.presentCount && String(old.total_amount) === salary.total) return;
    if (old) await connection.query('UPDATE salary_accruals SET reversed_at=NOW(6) WHERE id=:id', { id: old.id });
    await connection.query(`INSERT INTO salary_accruals
      (lesson_id,teacher_id,rate_version_id,accrual_type,present_children,fixed_amount,children_amount,total_amount,supersedes_accrual_id)
      VALUES (:lessonId,:teacherId,:rateId,:type,:present,:fixed,:children,:total,:supersedes)`, {
      lessonId: lesson.id, teacherId, rateId: rate.id, type: salary.kind, present: salary.presentCount,
      fixed: salary.fixed, children: salary.children, total: salary.total, supersedes: old?.id ?? null,
    });
  }

  async function putAttendance(lessonId, childId, body, context = {}) {
    try {
      await inTransaction(pool, async (connection) => {
        const lesson = await lockLesson(connection, lessonId); await assertAccess(connection, lesson, context);
        if (!['in_progress', 'completed'].includes(lesson.status)) throw new ApiProblem(409, 'LESSON_NOT_STARTED', 'Сначала начните занятие');
        const [roster] = await connection.query('SELECT roster_type FROM lesson_roster_members WHERE lesson_id=:lessonId AND child_id=:childId', { lessonId: lesson.id, childId: identifier(childId, 'childId') });
        if (!roster.length) throw new ApiProblem(409, 'CHILD_NOT_IN_LESSON', 'Ребёнок не входит в состав занятия');
        const enrollment = await enrollmentForAttendance(connection, lesson, childId);
        const [rows] = await connection.query('SELECT * FROM attendances WHERE lesson_id=:lessonId AND child_id=:childId FOR UPDATE', { lessonId: lesson.id, childId });
        if (!rows.length) throw new ApiProblem(409, 'ATTENDANCE_NOT_FOUND', 'Строка посещения не создана');
        const attendance = rows[0]; const present = bool(body.present); const trial = body.trial === undefined ? bool(attendance.is_trial) : bool(body.trial);
        if (attendance.marked_at != null && bool(attendance.present) === present && bool(attendance.is_trial) === trial && String(attendance.enrollment_id) === String(enrollment.id)) return;
        if (lesson.status === 'completed') await reverseAttendanceDebit(connection, attendance, context);
        await connection.query(`UPDATE attendances SET enrollment_id=:enrollmentId,attendance_type=:type,present=:present,is_trial=:trial,
          marked_by_user_id=:actorId,marked_at=NOW(6),price_snapshot=IF(:present AND NOT :trial,price_snapshot,NULL),charged_lessons=0 WHERE id=:id`, {
          id: attendance.id, enrollmentId: enrollment.id, type: roster[0].roster_type, present, trial, actorId: context.userId ?? null,
        });
        if (lesson.status === 'completed' && present && !trial) await debitAttendance(connection, attendance, enrollment, lesson, context);
        await connection.query('INSERT INTO audit_log (actor_user_id,action,entity_type,entity_id,before_data,after_data) VALUES (:actorId,\'attendance.update\',\'attendance\',:id,:before,:after)', {
          actorId: context.userId ?? null, id: attendance.id,
          before: JSON.stringify({ present: bool(attendance.present), trial: bool(attendance.is_trial), enrollmentId: String(attendance.enrollment_id) }),
          after: JSON.stringify({ present, trial, enrollmentId: String(enrollment.id) }),
        });
        if (lesson.status === 'completed') await recalculateSalary(connection, lesson);
      });
      return get(lessonId, context);
    } catch (error) { throw mysqlError(error); }
  }

  async function finish(lessonId, _body = {}, context = {}) {
    try {
      await inTransaction(pool, async (connection) => {
        const lesson = await lockLesson(connection, lessonId); await assertAccess(connection, lesson, context);
        if (lesson.status === 'completed') return;
        if (lesson.status !== 'in_progress') throw new ApiProblem(409, 'LESSON_NOT_STARTED', 'Сначала начните занятие');
        const [attendances] = await connection.query('SELECT * FROM attendances WHERE lesson_id=:lessonId FOR UPDATE', { lessonId: lesson.id });
        if (bool(lesson.is_empty_trip)) {
          await connection.query('UPDATE attendances SET present=FALSE,charged_lessons=0 WHERE lesson_id=:lessonId', { lessonId: lesson.id });
        } else {
          if (!attendances.some((attendance) => bool(attendance.present))) {
            throw new ApiProblem(409, 'ATTENDANCE_REQUIRED', 'Нельзя завершить занятие без присутствующих. Отмените занятие или используйте «Пустой выезд»');
          }
          for (const attendance of attendances) {
            if (!bool(attendance.present) || bool(attendance.is_trial)) continue;
            const enrollment = await enrollmentForAttendance(connection, lesson, attendance.child_id);
            if (!(await activeAttendanceDebit(connection, attendance.id))) await debitAttendance(connection, attendance, enrollment, lesson, context);
          }
        }
        await connection.query(`UPDATE lessons SET status='completed',actual_ends_at=NOW(6),completed_at=NOW(6),attendance_applied_at=NOW(6),
          lock_version=lock_version+1 WHERE id=:id`, { id: lesson.id });
        lesson.status = 'completed';
        await recalculateSalary(connection, lesson);
        if (parentNotifications && !bool(lesson.is_empty_trip)) await parentNotifications.lessonFinished(connection, lesson);
      });
      return get(lessonId, context);
    } catch (error) { throw mysqlError(error); }
  }

  async function removeAttendance(lessonId, childId, context = {}) {
    if (!hasRole(context, 'director') && !hasRole(context, 'partner')) throw new ApiProblem(403, 'FORBIDDEN', 'Удалить ошибочное посещение может только администратор проекта');
    childId = identifier(childId, 'childId');
    try {
      await inTransaction(pool, async (connection) => {
        const lesson = await lockLesson(connection, lessonId);
        await assertAccess(connection, lesson, context);
        const [rows] = await connection.query('SELECT * FROM attendances WHERE lesson_id=:lessonId AND child_id=:childId FOR UPDATE', { lessonId: lesson.id, childId });
        if (!rows.length) throw new ApiProblem(404, 'ATTENDANCE_NOT_FOUND', 'Посещение не найдено');
        const attendance = rows[0];
        await reverseAttendanceDebit(connection, attendance, context);
        await purgeAttendanceLedger(connection, attendance.id);
        await connection.query('DELETE FROM attendances WHERE id=:id', { id: attendance.id });
        if (attendance.attendance_type === 'extra') {
          await connection.query('DELETE FROM lesson_roster_members WHERE lesson_id=:lessonId AND child_id=:childId', { lessonId: lesson.id, childId });
        }
        if (lesson.status === 'completed') {
          await recalculateSalary(connection, lesson);
        }
      });
      return get(lessonId, context);
    } catch (error) { throw mysqlError(error); }
  }

  async function cancel(lessonId, context = {}) {
    try {
      await inTransaction(pool, async (connection) => {
        const lesson = await lockLesson(connection, lessonId); await assertAccess(connection, lesson, context);
        if (lesson.status === 'cancelled') return;
        if (lesson.status === 'completed') throw new ApiProblem(409, 'LESSON_FINAL', 'Проведённое занятие нельзя отменить');
        await connection.query(`UPDATE lessons SET status='cancelled',cancelled_at=NOW(6),is_empty_trip=FALSE,lock_version=lock_version+1 WHERE id=:id`, { id: lesson.id });
        lesson.status = 'cancelled';
        await recalculateSalary(connection, lesson);
        if (parentNotifications) await parentNotifications.lessonCancelled(connection, lesson);
      });
      return get(lessonId, context);
    } catch (error) { throw mysqlError(error); }
  }

  async function emptyTrip(lessonId, context = {}) {
    if (!hasRole(context, 'director') && !hasRole(context, 'partner')) throw new ApiProblem(403, 'FORBIDDEN', 'Пустой выезд отмечает только администратор проекта');
    try {
      await inTransaction(pool, async (connection) => {
        const lesson = await lockLesson(connection, lessonId);
        await assertAccess(connection, lesson, context);
        if (lesson.status === 'completed' && bool(lesson.is_empty_trip)) return;
        if (lesson.status === 'completed' || lesson.status === 'cancelled') throw new ApiProblem(409, 'LESSON_FINAL', 'Статус занятия уже финальный');
        await connection.query(`UPDATE attendances SET present=FALSE,charged_lessons=0 WHERE lesson_id=:lessonId`, { lessonId: lesson.id });
        await connection.query(`UPDATE lessons SET status='completed',is_empty_trip=TRUE,actual_teacher_id=COALESCE(actual_teacher_id,planned_teacher_id),
          actual_starts_at=COALESCE(actual_starts_at,NOW(6)),actual_ends_at=NOW(6),completed_at=NOW(6),attendance_applied_at=NOW(6),lock_version=lock_version+1 WHERE id=:id`, { id: lesson.id });
        lesson.status = 'completed'; lesson.is_empty_trip = true; lesson.actual_teacher_id ??= lesson.planned_teacher_id;
        await recalculateSalary(connection, lesson);
      });
      return get(lessonId, context);
    } catch (error) { throw mysqlError(error); }
  }

  async function remove(lessonId, context = {}) {
    if (!hasRole(context, 'director') && !hasRole(context, 'partner')) throw new ApiProblem(403, 'FORBIDDEN', 'Удалить занятие может только администратор проекта');
    try {
      let pendingPhotos = [];
      await inTransaction(pool, async (connection) => {
        const lesson = await lockLesson(connection, lessonId);
        await assertAccess(connection, lesson, context);
        const [attendances] = await connection.query('SELECT * FROM attendances WHERE lesson_id=:lessonId FOR UPDATE', { lessonId: lesson.id });
        for (const attendance of attendances) {
          await reverseAttendanceDebit(connection, attendance, context);
          await purgeAttendanceLedger(connection, attendance.id);
        }
        await connection.query('UPDATE salary_accruals SET supersedes_accrual_id=NULL WHERE lesson_id=:lessonId', { lessonId: lesson.id });
        await connection.query('DELETE FROM salary_accruals WHERE lesson_id=:lessonId', { lessonId: lesson.id });
        if (lessonPhotos) pendingPhotos = await lessonPhotos.prepareLessonPurge(connection, lesson.id);
        else await connection.query('DELETE FROM lesson_photos WHERE lesson_id=:lessonId', { lessonId: lesson.id });
        await connection.query('DELETE FROM attendances WHERE lesson_id=:lessonId', { lessonId: lesson.id });
        await connection.query('DELETE FROM lesson_roster_members WHERE lesson_id=:lessonId', { lessonId: lesson.id });
        await connection.query(`UPDATE lessons SET deleted_at=NOW(6),lock_version=lock_version+1 WHERE id=:id`, { id: lesson.id });
      });
      if (lessonPhotos && pendingPhotos.length) await lessonPhotos.purgePrepared(pendingPhotos);
      return null;
    } catch (error) { throw mysqlError(error); }
  }

  async function addExtra(lessonId, body, context = {}) {
    const childId = identifier(body.childId, 'childId');
    try {
      await inTransaction(pool, async (connection) => {
        const lesson = await lockLesson(connection, lessonId); await assertAccess(connection, lesson, context);
        if (!['in_progress', 'completed'].includes(lesson.status)) throw new ApiProblem(409, 'LESSON_NOT_STARTED', 'Сначала начните занятие');
        const enrollment = await enrollmentForAttendance(connection, lesson, childId);
        const [existing] = await connection.query('SELECT roster_type FROM lesson_roster_members WHERE lesson_id=:lessonId AND child_id=:childId', { lessonId: lesson.id, childId });
        if (existing.length) return;
        const trial = !(await priorVisit(connection, enrollment.id, lesson));
        await connection.query(`INSERT INTO lesson_roster_members (lesson_id,child_id,roster_type,added_by_user_id,frozen_at)
          VALUES (:lessonId,:childId,'extra',:actorId,NOW(6))`, { lessonId: lesson.id, childId, actorId: context.userId ?? null });
        const [result] = await connection.query(`INSERT INTO attendances
          (lesson_id,child_id,enrollment_id,attendance_type,present,is_trial,marked_by_user_id,marked_at)
          VALUES (:lessonId,:childId,:enrollmentId,'extra',TRUE,:trial,:actorId,NOW(6))`, {
          lessonId: lesson.id, childId, enrollmentId: enrollment.id, trial, actorId: context.userId ?? null,
        });
        if (lesson.status === 'completed' && !trial) {
          await debitAttendance(connection, { id: result.insertId }, enrollment, lesson, context);
          await recalculateSalary(connection, lesson);
        } else if (lesson.status === 'completed') await recalculateSalary(connection, lesson);
      });
      return get(lessonId, context);
    } catch (error) { throw mysqlError(error); }
  }

  async function removeExtra(lessonId, childId, context = {}) {
    childId = identifier(childId, 'childId');
    try {
      await inTransaction(pool, async (connection) => {
        const lesson = await lockLesson(connection, lessonId); await assertAccess(connection, lesson, context);
        const [rows] = await connection.query(`SELECT a.* FROM attendances a JOIN lesson_roster_members r ON r.lesson_id=a.lesson_id AND r.child_id=a.child_id
          WHERE a.lesson_id=:lessonId AND a.child_id=:childId AND r.roster_type='extra' FOR UPDATE`, { lessonId: lesson.id, childId });
        if (!rows.length) return;
        if (lesson.status === 'completed') {
          await reverseAttendanceDebit(connection, rows[0], context);
          await connection.query('UPDATE attendances SET present=FALSE,charged_lessons=0,marked_at=NOW(6) WHERE id=:id', { id: rows[0].id });
          await recalculateSalary(connection, lesson);
        } else {
          await connection.query('DELETE FROM attendances WHERE id=:id', { id: rows[0].id });
          await connection.query('DELETE FROM lesson_roster_members WHERE lesson_id=:lessonId AND child_id=:childId', { lessonId: lesson.id, childId });
          const [quickChildren] = await connection.query(`SELECT id,full_name FROM children
            WHERE id=:childId AND needs_director_review=TRUE AND created_from_lesson_id=:lessonId FOR UPDATE`, {
            childId, lessonId: lesson.id,
          });
          if (quickChildren.length) {
            const [enrollments] = await connection.query('SELECT id FROM child_enrollments WHERE child_id=:childId FOR UPDATE', { childId });
            const [historyRows] = await connection.query(`SELECT
              (SELECT COUNT(*) FROM payments WHERE child_id=:childId) payments,
              (SELECT COUNT(*) FROM refunds WHERE child_id=:childId) refunds,
              (SELECT COUNT(*) FROM attendances WHERE child_id=:childId) attendances,
              (SELECT COUNT(*) FROM lesson_roster_members WHERE child_id=:childId) roster,
              (SELECT COUNT(*) FROM lesson_photos WHERE child_id=:childId) photos,
              (SELECT COUNT(*) FROM group_memberships gm JOIN child_enrollments e ON e.id=gm.enrollment_id WHERE e.child_id=:childId) memberships,
              (SELECT COUNT(*) FROM balance_entries be JOIN child_enrollments e ON e.id=be.enrollment_id WHERE e.child_id=:childId) balanceEntries,
              (SELECT COUNT(*) FROM balance_lots bl JOIN child_enrollments e ON e.id=bl.enrollment_id WHERE e.child_id=:childId) balanceLots,
              (SELECT COUNT(*) FROM balance_transfers bt JOIN child_enrollments e ON e.id IN (bt.source_enrollment_id,bt.target_enrollment_id) WHERE e.child_id=:childId) balanceTransfers,
              (SELECT COUNT(*) FROM child_enrollments WHERE child_id=:childId AND balance_lessons<>0) nonzeroBalances,
              (SELECT COUNT(*) FROM enrollment_status_history esh JOIN child_enrollments e ON e.id=esh.enrollment_id WHERE e.child_id=:childId) enrollmentHistory,
              (SELECT COUNT(*) FROM child_status_history WHERE child_id=:childId) childHistory,
              (SELECT COUNT(*) FROM child_user_accounts WHERE child_id=:childId) userAccounts,
              (SELECT COUNT(*) FROM price_versions pv JOIN child_enrollments e ON e.id=pv.enrollment_id WHERE e.child_id=:childId) priceHistory`, { childId });
            if (enrollments.length === 1 && !Object.values(historyRows[0] ?? {}).some((value) => Number(value) > 0)) {
              const [guardians] = await connection.query('SELECT guardian_id FROM child_guardians WHERE child_id=:childId', { childId });
              await connection.query(`INSERT INTO notifications
                (role_code,notification_type,title,body,entity_type,entity_id)
                VALUES ('director','quick_child_deleted','Преподаватель удалил нового ребёнка',:body,'lesson',:lessonId)`, {
                lessonId: lesson.id, body: `${quickChildren[0].full_name} был создан преподавателем и удалён из занятия до подтверждения директором.`,
              });
              await connection.query('DELETE FROM child_guardians WHERE child_id=:childId', { childId });
              await connection.query('DELETE FROM child_enrollments WHERE child_id=:childId', { childId });
              await connection.query('DELETE FROM children WHERE id=:childId', { childId });
              for (const guardian of guardians) {
                await connection.query(`DELETE g FROM guardians g LEFT JOIN child_guardians cg ON cg.guardian_id=g.id
                  WHERE g.id=:id AND cg.guardian_id IS NULL AND g.user_id IS NULL`, { id: guardian.guardian_id });
              }
            }
          }
        }
      });
      return get(lessonId, context);
    } catch (error) { throw mysqlError(error); }
  }

  async function quickChild(lessonId, body, context = {}) {
    const name = String(body.name ?? '').trim(); const phone = nullableText(body.phone);
    if (!name) throw new ApiProblem(400, 'VALIDATION_ERROR', 'ФИО ребёнка обязательно');
    try {
      let childId;
      await inTransaction(pool, async (connection) => {
        const lesson = await lockLesson(connection, lessonId); await assertAccess(connection, lesson, context);
        if (!['in_progress', 'completed'].includes(lesson.status)) throw new ApiProblem(409, 'LESSON_NOT_STARTED', 'Сначала начните занятие');
        const commandKey = scopedIdempotencyKey({ key: context.idempotencyKey, actorUserId: context.userId,
          operation: 'lesson.quick-child', projectId: lesson.project_id_snapshot, entity: lesson.id });
        const [existing] = await connection.query('SELECT id FROM children WHERE create_idempotency_key=:key FOR UPDATE', { key: commandKey });
        if (existing.length) { childId = existing[0].id; return; }
        const [childResult] = await connection.query(`INSERT INTO children
          (full_name,status,needs_director_review,created_from_lesson_id,created_by_user_id,create_idempotency_key)
          VALUES (:name,'lead',TRUE,:lessonId,:actorId,:commandKey)`, { name, lessonId: lesson.id, actorId: context.userId ?? null, commandKey });
        childId = childResult.insertId;
        if (phone) {
          const [guardian] = await connection.query('INSERT INTO guardians (phone) VALUES (:phone)', { phone });
          await connection.query('INSERT INTO child_guardians (child_id,guardian_id,is_primary) VALUES (:childId,:guardianId,TRUE)', { childId, guardianId: guardian.insertId });
        }
        const [enrollment] = await connection.query(`INSERT INTO child_enrollments
          (child_id,direction_id,project_id,status,started_on) VALUES (:childId,:directionId,:projectId,'active',DATE(:startsAt))`, {
          childId, directionId: lesson.direction_id_snapshot, projectId: lesson.project_id_snapshot, startsAt: lesson.starts_at,
        });
        await connection.query(`INSERT INTO lesson_roster_members (lesson_id,child_id,roster_type,added_by_user_id,frozen_at)
          VALUES (:lessonId,:childId,'extra',:actorId,NOW(6))`, { lessonId: lesson.id, childId, actorId: context.userId ?? null });
        await connection.query(`INSERT INTO attendances
          (lesson_id,child_id,enrollment_id,attendance_type,present,is_trial,marked_by_user_id,marked_at)
          VALUES (:lessonId,:childId,:enrollmentId,'extra',TRUE,TRUE,:actorId,NOW(6))`, {
          lessonId: lesson.id, childId, enrollmentId: enrollment.insertId, actorId: context.userId ?? null,
        });
        if (lesson.status === 'completed') await recalculateSalary(connection, lesson);
      });
      return { childId: String(childId), lesson: await get(lessonId, context) };
    } catch (error) { throw mysqlError(error); }
  }

  async function salaryAccruals(filters = {}, context = {}) {
    if (!hasRole(context, 'director') && !hasRole(context, 'partner')) throw new ApiProblem(403, 'FORBIDDEN', 'Недостаточно прав для просмотра зарплаты');
    const conditions = ['sa.reversed_at IS NULL']; const params = {};
    const authProjectId = partnerProjectId(context);
    const requestedProjectId = !authProjectId && filters.projectId ? identifier(filters.projectId, 'projectId') : null;
    const projectId = authProjectId ?? requestedProjectId;
    if (projectId) { conditions.push('l.project_id_snapshot=:projectId'); params.projectId = projectId; }
    if (filters.teacherId) { conditions.push('sa.teacher_id=:teacherId'); params.teacherId = identifier(filters.teacherId, 'teacherId'); }
    const from = filters.from ? dateOnly(filters.from, 'from') : null;
    const to = filters.to ? dateOnly(filters.to, 'to') : null;
    if (from && to && from > to) throw new ApiProblem(400, 'VALIDATION_ERROR', 'Дата начала периода должна быть не позже даты окончания');
    if (from) { conditions.push('DATE(l.starts_at)>=:from'); params.from = from; }
    if (to) { conditions.push('DATE(l.starts_at)<=:to'); params.to = to; }
    const [rows] = await pool.query(`SELECT sa.id,sa.lesson_id,sa.teacher_id,sa.rate_version_id,sa.accrual_type,sa.present_children,
        sa.fixed_amount,sa.children_amount,sa.total_amount,l.starts_at,l.ends_at,l.group_id,l.project_id_snapshot,
        g.name group_name,p.name project_name,COALESCE(l.site_override_id,l.site_id_snapshot) site_id,
        COALESCE(os.name,ss.name) site_name
      FROM salary_accruals sa
      JOIN lessons l ON l.id=sa.lesson_id
      JOIN study_groups g ON g.id=l.group_id
      JOIN projects p ON p.id=l.project_id_snapshot
      JOIN sites ss ON ss.id=l.site_id_snapshot
      LEFT JOIN sites os ON os.id=l.site_override_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY l.starts_at,sa.id`, params);
    return rows.map((row) => ({
      id: String(row.id), lessonId: String(row.lesson_id), teacherId: String(row.teacher_id),
      rateVersionId: row.rate_version_id == null ? null : String(row.rate_version_id),
      type: row.accrual_type, presentChildren: Number(row.present_children),
      fixedAmount: String(row.fixed_amount), childrenAmount: String(row.children_amount), totalAmount: String(row.total_amount),
      startsAt: isoDateTime(row.starts_at), endsAt: isoDateTime(row.ends_at), groupId: String(row.group_id), groupName: row.group_name,
      projectId: String(row.project_id_snapshot), projectName: row.project_name,
      siteId: String(row.site_id), siteName: row.site_name,
    }));
  }

  async function notifications(context = {}) {
    if (!hasRole(context, 'director') && !hasRole(context, 'partner')) throw new ApiProblem(403, 'FORBIDDEN', 'Уведомления недоступны');
    const roleCode = partnerProjectId(context) ? 'partner' : 'director';
    const [rows] = await pool.query(`SELECT id,notification_type,title,body,entity_type,entity_id,created_at
      FROM notifications WHERE (user_id=:userId OR (user_id IS NULL AND role_code=:roleCode
        AND (:projectId IS NULL OR recipient_project_id=:projectId))) AND dismissed_at IS NULL
      ORDER BY created_at DESC,id DESC LIMIT 50`, { userId: context.userId ?? null, roleCode, projectId: partnerProjectId(context) });
    return rows.map((row) => ({
      id: String(row.id), type: row.notification_type, title: row.title, body: row.body,
      entityType: row.entity_type, entityId: row.entity_id == null ? null : String(row.entity_id),
      createdAt: isoDateTime(row.created_at),
    }));
  }

  return { materialize, list, get, create, deletedOccurrences, update, start, putAttendance, finish, remove, removeAttendance, cancel, emptyTrip, addExtra, removeExtra, quickChild, salaryAccruals, notifications };
}

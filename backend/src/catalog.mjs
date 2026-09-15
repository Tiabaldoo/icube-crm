import { inTransaction } from './db.mjs';

export class ApiProblem extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const id = (value, field = 'id') => {
  const result = String(value ?? '').trim();
  if (!/^[1-9]\d*$/.test(result)) throw new ApiProblem(400, 'VALIDATION_ERROR', `Некорректное поле ${field}`);
  return result;
};
const text = (value, field) => {
  const result = String(value ?? '').trim();
  if (!result) throw new ApiProblem(400, 'VALIDATION_ERROR', `Поле ${field} обязательно`);
  return result;
};
const nullable = (value) => value === undefined || value === null || value === '' ? null : String(value).trim() || null;
const active = (value) => value === undefined ? true : Boolean(value);
const isoDate = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
};
const rowId = (row) => String(row.id);

function mapProject(row) { return { id: rowId(row), code: row.code, name: row.name, partnerId: row.partner_id == null ? null : String(row.partner_id), active: Boolean(row.active) }; }
function mapDirection(row) { return { id: rowId(row), code: row.code, name: row.name, active: Boolean(row.active) }; }
function mapSite(row) { return { id: rowId(row), name: row.name, shortName: row.short_name, type: row.type, address: row.address, note: row.note, active: Boolean(row.active) }; }

function mysqlError(error) {
  if (error instanceof ApiProblem) return error;
  if (error?.code === 'ER_DUP_ENTRY') return new ApiProblem(409, 'CONFLICT', 'Такая запись уже существует');
  if (error?.code === 'ER_NO_REFERENCED_ROW_2') return new ApiProblem(400, 'INVALID_REFERENCE', 'Связанная запись не найдена');
  if (error?.code === 'ER_ROW_IS_REFERENCED_2') return new ApiProblem(409, 'HISTORY_EXISTS', 'Запись связана с историческими данными');
  return error;
}

export function createMysqlCatalog(pool) {
  async function rows(sql, params = {}) { const [result] = await pool.query(sql, params); return result; }
  async function one(sql, params = {}) { return (await rows(sql, params))[0] ?? null; }
  function scopedTeacherId(context = {}) {
    if (!(context.roles ?? []).includes('teacher') || (context.roles ?? []).includes('director')) return null;
    if (!context.teacherId) throw new ApiProblem(403, 'FORBIDDEN', 'Преподаватель не связан с пользователем');
    return String(context.teacherId);
  }

  async function projects() { return (await rows('SELECT id, code, name, partner_id, active FROM projects ORDER BY name')).map(mapProject); }
  async function directions() { return (await rows('SELECT id, code, name, active FROM directions ORDER BY name')).map(mapDirection); }
  async function sites() { return (await rows('SELECT id, name, short_name, type, address, note, active FROM sites WHERE deleted_at IS NULL ORDER BY name')).map(mapSite); }

  async function teachers() {
    const teacherRows = await rows(`SELECT t.id,t.full_name,t.phone,t.active,u.email access_login,u.status access_status
      FROM teachers t LEFT JOIN users u ON u.id=t.user_id WHERE t.deleted_at IS NULL ORDER BY t.full_name`);
    const directionRows = await rows(`SELECT td.teacher_id, d.id, d.name FROM teacher_directions td JOIN directions d ON d.id=td.direction_id ORDER BY d.name`);
    return teacherRows.map((row) => ({
      id: rowId(row), name: row.full_name, phone: row.phone, active: Boolean(row.active),
      directions: directionRows.filter((item) => String(item.teacher_id) === String(row.id)).map((item) => ({ id: String(item.id), name: item.name })),
      access: row.access_login == null ? null : { login: row.access_login, status: row.access_status },
    }));
  }

  async function groups(context = {}) {
    const actorTeacherId = scopedTeacherId(context);
    const groupRows = await rows(`SELECT g.id, g.name, g.direction_id, d.name direction_name, g.site_id, s.name site_name,
      g.project_id, p.name project_name, g.default_teacher_id teacher_id, t.full_name teacher_name,
      g.weekday, g.start_time, g.end_time, g.starts_on, g.ends_on, g.active,
      (SELECT pv.price FROM price_versions pv WHERE pv.scope_type='group' AND pv.group_id=g.id AND pv.valid_to IS NULL ORDER BY pv.valid_from DESC, pv.id DESC LIMIT 1) price
      FROM study_groups g JOIN directions d ON d.id=g.direction_id JOIN sites s ON s.id=g.site_id
      JOIN projects p ON p.id=g.project_id JOIN teachers t ON t.id=g.default_teacher_id
      WHERE g.deleted_at IS NULL AND (:actorTeacherId IS NULL OR g.default_teacher_id=:actorTeacherId
        OR EXISTS (SELECT 1 FROM lessons sl WHERE sl.group_id=g.id AND sl.deleted_at IS NULL
          AND (sl.planned_teacher_id=:actorTeacherId OR sl.actual_teacher_id=:actorTeacherId))) ORDER BY g.name`, { actorTeacherId });
    return groupRows.map((row) => ({ id: rowId(row), name: row.name, directionId: String(row.direction_id), directionName: row.direction_name,
      siteId: String(row.site_id), siteName: row.site_name, projectId: String(row.project_id), projectName: row.project_name,
      teacherId: String(row.teacher_id), teacherName: row.teacher_name, weekday: Number(row.weekday), startTime: String(row.start_time).slice(0, 5),
      endTime: String(row.end_time).slice(0, 5), startsOn: isoDate(row.starts_on), endsOn: isoDate(row.ends_on), active: Boolean(row.active),
      price: actorTeacherId == null && row.price != null ? String(row.price) : null }));
  }

  async function children(context = {}) {
    const actorTeacherId = scopedTeacherId(context);
    const childRows = await rows(`SELECT c.id, c.full_name, c.birth_date, c.school, c.grade, c.status, c.note, c.needs_director_review,
      g.full_name guardian_name, g.phone guardian_phone
      FROM children c LEFT JOIN child_guardians cg ON cg.child_id=c.id AND cg.is_primary=TRUE
      LEFT JOIN guardians g ON g.id=cg.guardian_id WHERE c.deleted_at IS NULL AND (:actorTeacherId IS NULL
        OR EXISTS (SELECT 1 FROM child_enrollments se JOIN group_memberships gm ON gm.enrollment_id=se.id
          JOIN study_groups sg ON sg.id=gm.group_id WHERE se.child_id=c.id AND gm.ended_on IS NULL AND sg.default_teacher_id=:actorTeacherId)
        OR EXISTS (SELECT 1 FROM lesson_roster_members lrm JOIN lessons l ON l.id=lrm.lesson_id
          WHERE lrm.child_id=c.id AND l.deleted_at IS NULL AND (l.planned_teacher_id=:actorTeacherId OR l.actual_teacher_id=:actorTeacherId))
        OR EXISTS (SELECT 1 FROM attendances a JOIN lessons l ON l.id=a.lesson_id
          WHERE a.child_id=c.id AND l.deleted_at IS NULL AND (l.planned_teacher_id=:actorTeacherId OR l.actual_teacher_id=:actorTeacherId)))
      ORDER BY c.full_name`, { actorTeacherId });
    if (!childRows.length) return [];
    const visibleIds = childRows.map((row) => String(row.id));
    const enrollmentRows = await rows(`SELECT e.id, e.child_id, e.direction_id, d.name direction_name, e.status, e.individual_price, e.balance_lessons,
      e.started_on, e.ended_on, gm.group_id,
      COALESCE(e.individual_price,
        (SELECT pv.price FROM price_versions pv WHERE pv.scope_type='group' AND pv.group_id=gm.group_id AND pv.valid_from<=NOW(6) AND (pv.valid_to IS NULL OR pv.valid_to>NOW(6)) ORDER BY pv.valid_from DESC,pv.id DESC LIMIT 1),
        (SELECT pv.price FROM price_versions pv WHERE pv.scope_type='direction' AND pv.direction_id=e.direction_id AND pv.valid_from<=NOW(6) AND (pv.valid_to IS NULL OR pv.valid_to>NOW(6)) ORDER BY pv.valid_from DESC,pv.id DESC LIMIT 1)
      ) current_price
      FROM child_enrollments e JOIN directions d ON d.id=e.direction_id
      LEFT JOIN group_memberships gm ON gm.id=(SELECT gm2.id FROM group_memberships gm2 WHERE gm2.enrollment_id=e.id AND gm2.ended_on IS NULL ORDER BY gm2.started_on DESC, gm2.id DESC LIMIT 1)
      WHERE e.child_id IN (${visibleIds.join(',')}) ORDER BY e.child_id, e.id`);
    return childRows.map((row) => ({ id: rowId(row), name: row.full_name, birthDate: isoDate(row.birth_date), school: row.school, grade: row.grade,
      status: row.status, note: row.note, needsDirectorReview: Boolean(row.needs_director_review), guardian: { name: row.guardian_name, phone: row.guardian_phone },
      enrollments: enrollmentRows.filter((item) => String(item.child_id) === String(row.id)).map((item) => ({ id: String(item.id), directionId: String(item.direction_id),
        directionName: item.direction_name, groupId: item.group_id == null ? null : String(item.group_id), status: item.status,
        ...(actorTeacherId == null ? { individualPrice: item.individual_price == null ? null : String(item.individual_price),
          currentPrice: item.current_price == null ? null : String(item.current_price), balanceLessons: String(item.balance_lessons) } : {}),
        startedOn: isoDate(item.started_on), endedOn: isoDate(item.ended_on) })) }));
  }

  const collection = { projects, directions, sites, teachers, groups, children };
  async function get(resource, resourceId, context = {}) {
    const found = (await collection[resource](context)).find((item) => item.id === id(resourceId));
    if (!found) throw new ApiProblem(404, 'NOT_FOUND', 'Запись не найдена');
    return found;
  }

  async function createDirection(body) {
    try { const [result] = await pool.query('INSERT INTO directions (code,name,active) VALUES (:code,:name,:active)', { code: text(body.code, 'code'), name: text(body.name, 'name'), active: active(body.active) }); return get('directions', result.insertId); }
    catch (error) { throw mysqlError(error); }
  }
  async function updateDirection(resourceId, body) {
    const current = await get('directions', resourceId);
    try { await pool.query('UPDATE directions SET code=:code,name=:name,active=:active WHERE id=:id', { id: current.id, code: body.code === undefined ? current.code : text(body.code, 'code'), name: body.name === undefined ? current.name : text(body.name, 'name'), active: body.active === undefined ? current.active : Boolean(body.active) }); return get('directions', current.id); }
    catch (error) { throw mysqlError(error); }
  }
  async function createSite(body) {
    const [result] = await pool.query(`INSERT INTO sites (name,short_name,type,address,note,active) VALUES (:name,:shortName,:type,:address,:note,:active)`, { name: text(body.name, 'name'), shortName: nullable(body.shortName), type: nullable(body.type), address: nullable(body.address), note: nullable(body.note), active: active(body.active) });
    return get('sites', result.insertId);
  }
  async function updateSite(resourceId, body) {
    const current = await get('sites', resourceId);
    await pool.query(`UPDATE sites SET name=:name,short_name=:shortName,type=:type,address=:address,note=:note,active=:active WHERE id=:id`, { id: current.id, name: body.name === undefined ? current.name : text(body.name, 'name'), shortName: body.shortName === undefined ? current.shortName : nullable(body.shortName), type: body.type === undefined ? current.type : nullable(body.type), address: body.address === undefined ? current.address : nullable(body.address), note: body.note === undefined ? current.note : nullable(body.note), active: body.active === undefined ? current.active : Boolean(body.active) });
    return get('sites', current.id);
  }
  async function assertIds(connection, table, ids, field) {
    for (const value of ids) { const [found] = await connection.query(`SELECT id FROM ${table} WHERE id=:id`, { id: id(value, field) }); if (!found.length) throw new ApiProblem(400, 'INVALID_REFERENCE', `Не найдена связанная запись ${field}`); }
  }
  async function writeTeacher(connection, teacherId, body, current = {}) {
    const directionIds = body.directionIds === undefined ? current.directionIds : body.directionIds.map((value) => id(value, 'directionIds'));
    if (!directionIds?.length) throw new ApiProblem(400, 'VALIDATION_ERROR', 'Нужно выбрать хотя бы одно направление');
    await assertIds(connection, 'directions', directionIds, 'directionIds');
    if (teacherId) {
      const nextName = body.name === undefined ? current.name : text(body.name, 'name');
      await connection.query('UPDATE teachers SET full_name=:name,phone=:phone,active=:active WHERE id=:id', { id: teacherId, name: nextName, phone: body.phone === undefined ? current.phone : nullable(body.phone), active: body.active === undefined ? current.active : Boolean(body.active) });
      await connection.query('UPDATE users u JOIN teachers t ON t.user_id=u.id SET u.display_name=:name WHERE t.id=:id', { id: teacherId, name: nextName });
    }
    else { const [result] = await connection.query('INSERT INTO teachers (full_name,phone,active) VALUES (:name,:phone,:active)', { name: text(body.name, 'name'), phone: nullable(body.phone), active: active(body.active) }); teacherId = result.insertId; }
    await connection.query('DELETE FROM teacher_directions WHERE teacher_id=:id', { id: teacherId });
    for (const directionId of directionIds) await connection.query('INSERT INTO teacher_directions (teacher_id,direction_id) VALUES (:teacherId,:directionId)', { teacherId, directionId });
    return teacherId;
  }
  async function createTeacher(body) { try { const teacherId = await inTransaction(pool, (connection) => writeTeacher(connection, null, body)); return get('teachers', teacherId); } catch (error) { throw mysqlError(error); } }
  async function updateTeacher(resourceId, body) { const current = await get('teachers', resourceId); current.directionIds = current.directions.map((item) => item.id); try { await inTransaction(pool, (connection) => writeTeacher(connection, current.id, body, current)); return get('teachers', current.id); } catch (error) { throw mysqlError(error); } }

  async function setGroupPrice(connection, groupId, price) {
    if (price !== null && (!(Number(price) > 0))) throw new ApiProblem(400, 'VALIDATION_ERROR', 'Цена должна быть больше нуля');
    const [current] = await connection.query(`SELECT id,price FROM price_versions WHERE scope_type='group' AND group_id=:groupId AND valid_to IS NULL ORDER BY valid_from DESC,id DESC LIMIT 1`, { groupId });
    if ((current[0]?.price == null ? null : Number(current[0].price)) === (price == null ? null : Number(price))) return;
    await connection.query(`UPDATE price_versions SET valid_to=NOW(6) WHERE scope_type='group' AND group_id=:groupId AND valid_to IS NULL`, { groupId });
    if (price != null) await connection.query(`INSERT INTO price_versions (scope_type,group_id,price,valid_from) VALUES ('group',:groupId,:price,NOW(6))`, { groupId, price: Number(price) });
  }
  async function writeGroup(connection, groupId, body, current = {}) {
    const value = {
      name: body.name === undefined ? current.name : text(body.name, 'name'), directionId: id(body.directionId ?? current.directionId, 'directionId'),
      siteId: id(body.siteId ?? current.siteId, 'siteId'), projectId: id(body.projectId ?? current.projectId, 'projectId'), teacherId: id(body.teacherId ?? current.teacherId, 'teacherId'),
      weekday: Number(body.weekday ?? current.weekday), startTime: body.startTime ?? current.startTime, endTime: body.endTime ?? current.endTime,
      startsOn: body.startsOn ?? current.startsOn, endsOn: body.endsOn === undefined ? current.endsOn : nullable(body.endsOn), active: body.active === undefined ? active(current.active) : Boolean(body.active),
    };
    if (!value.active && value.endsOn == null) value.endsOn = new Date().toISOString().slice(0, 10);
    if (!Number.isInteger(value.weekday) || value.weekday < 1 || value.weekday > 7 || !/^\d\d:\d\d$/.test(value.startTime) || !/^\d\d:\d\d$/.test(value.endTime) || !value.startsOn) throw new ApiProblem(400, 'VALIDATION_ERROR', 'Некорректное расписание группы');
    await assertIds(connection, 'directions', [value.directionId], 'directionId'); await assertIds(connection, 'sites', [value.siteId], 'siteId'); await assertIds(connection, 'projects', [value.projectId], 'projectId'); await assertIds(connection, 'teachers', [value.teacherId], 'teacherId');
    const [teacherDirection] = await connection.query('SELECT teacher_id FROM teacher_directions WHERE teacher_id=:teacherId AND direction_id=:directionId', value);
    if (!teacherDirection.length) throw new ApiProblem(400, 'TEACHER_DIRECTION_MISMATCH', 'Преподаватель не работает с направлением группы');
    if (groupId && (String(value.directionId) !== String(current.directionId) || String(value.projectId) !== String(current.projectId))) {
      const [lessons] = await connection.query(`SELECT l.id FROM lessons l WHERE l.group_id=:id AND l.deleted_at IS NULL AND NOT (
        l.status='scheduled' AND l.scheduled_starts_at>NOW(6) AND l.actual_starts_at IS NULL
        AND l.roster_frozen_at IS NULL AND l.attendance_applied_at IS NULL AND l.completed_at IS NULL AND l.cancelled_at IS NULL
        AND l.lock_version=1 AND NOT EXISTS (SELECT 1 FROM lesson_roster_members r WHERE r.lesson_id=l.id)
        AND NOT EXISTS (SELECT 1 FROM attendances a WHERE a.lesson_id=l.id)
        AND NOT EXISTS (SELECT 1 FROM lesson_photos ph WHERE ph.lesson_id=l.id)
        AND NOT EXISTS (SELECT 1 FROM salary_accruals sa WHERE sa.lesson_id=l.id)
      ) LIMIT 1`, { id: groupId });
      if (lessons.length) throw new ApiProblem(409, 'GROUP_HAS_HISTORY', 'Направление и проект группы с историей занятий менять нельзя');
    }
    if (groupId) await connection.query(`UPDATE study_groups SET name=:name,direction_id=:directionId,site_id=:siteId,project_id=:projectId,default_teacher_id=:teacherId,weekday=:weekday,start_time=:startTime,end_time=:endTime,starts_on=:startsOn,ends_on=:endsOn,active=:active WHERE id=:id`, { ...value, id: groupId });
    else { const [result] = await connection.query(`INSERT INTO study_groups (name,direction_id,site_id,project_id,default_teacher_id,weekday,start_time,end_time,starts_on,ends_on,active) VALUES (:name,:directionId,:siteId,:projectId,:teacherId,:weekday,:startTime,:endTime,:startsOn,:endsOn,:active)`, value); groupId = result.insertId; }
    if (groupId && current.active === true && value.active === false) {
      await connection.query('UPDATE group_memberships SET ended_on=:endedOn WHERE group_id=:groupId AND ended_on IS NULL', { groupId, endedOn: value.endsOn });
      await connection.query(`DELETE l FROM lessons l WHERE l.group_id=:groupId
        AND l.deleted_at IS NULL AND l.status='scheduled' AND l.scheduled_starts_at>NOW(6) AND l.actual_starts_at IS NULL
        AND l.roster_frozen_at IS NULL AND l.attendance_applied_at IS NULL AND l.completed_at IS NULL AND l.cancelled_at IS NULL
        AND l.lock_version=1
        AND NOT EXISTS (SELECT 1 FROM lesson_roster_members r WHERE r.lesson_id=l.id)
        AND NOT EXISTS (SELECT 1 FROM attendances a WHERE a.lesson_id=l.id)
        AND NOT EXISTS (SELECT 1 FROM lesson_photos ph WHERE ph.lesson_id=l.id)
        AND NOT EXISTS (SELECT 1 FROM salary_accruals sa WHERE sa.lesson_id=l.id)`, { groupId });
    }
    if (body.price !== undefined) await setGroupPrice(connection, groupId, body.price === '' ? null : body.price);
    return groupId;
  }
  async function createGroup(body) { try { const groupId = await inTransaction(pool, (connection) => writeGroup(connection, null, body)); return get('groups', groupId); } catch (error) { throw mysqlError(error); } }
  async function updateGroup(resourceId, body) { const current = await get('groups', resourceId); try { await inTransaction(pool, (connection) => writeGroup(connection, current.id, body, current)); return get('groups', current.id); } catch (error) { throw mysqlError(error); } }

  async function upsertGuardian(connection, childId, guardian) {
    if (!guardian) return;
    const [existing] = await connection.query(`SELECT g.id FROM guardians g JOIN child_guardians cg ON cg.guardian_id=g.id WHERE cg.child_id=:childId AND cg.is_primary=TRUE LIMIT 1`, { childId });
    if (existing.length) await connection.query('UPDATE guardians SET full_name=:name,phone=:phone WHERE id=:id', { id: existing[0].id, name: nullable(guardian.name), phone: nullable(guardian.phone) });
    else { const [result] = await connection.query('INSERT INTO guardians (full_name,phone) VALUES (:name,:phone)', { name: nullable(guardian.name), phone: nullable(guardian.phone) }); await connection.query('INSERT INTO child_guardians (child_id,guardian_id,is_primary) VALUES (:childId,:guardianId,TRUE)', { childId, guardianId: result.insertId }); }
  }
  const childStatuses = new Set(['lead', 'active', 'paused', 'finished', 'archived']);
  const enrollmentStatuses = new Set(['active', 'paused', 'finished']);
  async function createChild(body) {
    if (!childStatuses.has(body.status ?? 'lead')) throw new ApiProblem(400, 'VALIDATION_ERROR', 'Некорректный статус ребёнка');
    try { const childId = await inTransaction(pool, async (connection) => { const [result] = await connection.query(`INSERT INTO children (full_name,birth_date,school,grade,status,note,needs_director_review) VALUES (:name,:birthDate,:school,:grade,:status,:note,:review)`, { name: text(body.name, 'name'), birthDate: nullable(body.birthDate), school: nullable(body.school), grade: nullable(body.grade), status: body.status ?? 'lead', note: nullable(body.note), review: Boolean(body.needsDirectorReview) }); await upsertGuardian(connection, result.insertId, body.guardian); return result.insertId; }); return get('children', childId); }
    catch (error) { throw mysqlError(error); }
  }
  async function updateChild(resourceId, body) {
    const current = await get('children', resourceId);
    if (!childStatuses.has(body.status ?? current.status)) throw new ApiProblem(400, 'VALIDATION_ERROR', 'Некорректный статус ребёнка');
    try { await inTransaction(pool, async (connection) => { const nextStatus = body.status ?? current.status; await connection.query(`UPDATE children SET full_name=:name,birth_date=:birthDate,school=:school,grade=:grade,status=:status,note=:note,needs_director_review=:review WHERE id=:id`, { id: current.id, name: body.name === undefined ? current.name : text(body.name, 'name'), birthDate: body.birthDate === undefined ? current.birthDate : nullable(body.birthDate), school: body.school === undefined ? current.school : nullable(body.school), grade: body.grade === undefined ? current.grade : nullable(body.grade), status: nextStatus, note: body.note === undefined ? current.note : nullable(body.note), review: body.needsDirectorReview === undefined ? current.needsDirectorReview : Boolean(body.needsDirectorReview) }); if (nextStatus !== current.status) await connection.query('INSERT INTO child_status_history (child_id,old_status,new_status) VALUES (:id,:old,:next)', { id: current.id, old: current.status, next: nextStatus }); await upsertGuardian(connection, current.id, body.guardian); }); return get('children', current.id); }
    catch (error) { throw mysqlError(error); }
  }
  async function validateEnrollmentGroup(connection, directionId, groupId) { if (groupId == null) return; const [found] = await connection.query('SELECT id FROM study_groups WHERE id=:groupId AND direction_id=:directionId AND deleted_at IS NULL', { groupId: id(groupId, 'groupId'), directionId }); if (!found.length) throw new ApiProblem(400, 'GROUP_DIRECTION_MISMATCH', 'Группа относится к другому направлению'); }
  async function resolvePendingOperationSnapshots(connection, enrollmentId, groupId) {
    if (groupId == null) return;
    await connection.query(`UPDATE payments p JOIN study_groups g ON g.id=:groupId SET
      p.group_id_snapshot=CASE WHEN p.group_id_snapshot IS NULL AND (p.project_id_snapshot IS NULL OR p.project_id_snapshot=g.project_id) THEN g.id ELSE p.group_id_snapshot END,
      p.project_id_snapshot=COALESCE(p.project_id_snapshot,g.project_id)
      WHERE p.enrollment_id=:enrollmentId AND p.deleted_at IS NULL AND (p.group_id_snapshot IS NULL OR p.project_id_snapshot IS NULL)`, { enrollmentId, groupId });
    await connection.query(`UPDATE refunds r JOIN study_groups g ON g.id=:groupId SET
      r.group_id_snapshot=CASE WHEN r.group_id_snapshot IS NULL AND (r.project_id_snapshot IS NULL OR r.project_id_snapshot=g.project_id) THEN g.id ELSE r.group_id_snapshot END,
      r.project_id_snapshot=COALESCE(r.project_id_snapshot,g.project_id)
      WHERE r.enrollment_id=:enrollmentId AND r.deleted_at IS NULL AND (r.group_id_snapshot IS NULL OR r.project_id_snapshot IS NULL)`, { enrollmentId, groupId });
  }
  async function createEnrollment(childId, body) {
    childId = id(childId, 'childId');
    if (!enrollmentStatuses.has(body.status ?? 'active')) throw new ApiProblem(400, 'VALIDATION_ERROR', 'Некорректный статус направления');
    try { const enrollmentId = await inTransaction(pool, async (connection) => { await assertIds(connection, 'children', [childId], 'childId'); const directionId = id(body.directionId, 'directionId'); await assertIds(connection, 'directions', [directionId], 'directionId'); await validateEnrollmentGroup(connection, directionId, body.groupId); const price = body.individualPrice === '' || body.individualPrice == null ? null : Number(body.individualPrice); if (price !== null && !(price > 0)) throw new ApiProblem(400, 'VALIDATION_ERROR', 'Индивидуальная цена должна быть больше нуля'); const [result] = await connection.query(`INSERT INTO child_enrollments (child_id,direction_id,status,individual_price,started_on) VALUES (:childId,:directionId,:status,:price,:startedOn)`, { childId, directionId, status: body.status ?? 'active', price, startedOn: body.startedOn ?? new Date().toISOString().slice(0, 10) }); if (body.groupId != null) await connection.query('INSERT INTO group_memberships (enrollment_id,group_id,started_on) VALUES (:enrollmentId,:groupId,CURDATE())', { enrollmentId: result.insertId, groupId: id(body.groupId, 'groupId') }); if (price != null) await connection.query(`INSERT INTO price_versions (scope_type,enrollment_id,price,valid_from) VALUES ('enrollment',:enrollmentId,:price,NOW(6))`, { enrollmentId: result.insertId, price }); return String(result.insertId); }); return (await get('children', childId)).enrollments.find((item) => item.id === enrollmentId); }
    catch (error) { throw mysqlError(error); }
  }
  async function updateEnrollment(enrollmentId, body) {
    enrollmentId = id(enrollmentId, 'enrollmentId');
    try { const childId = await inTransaction(pool, async (connection) => { const [found] = await connection.query('SELECT * FROM child_enrollments WHERE id=:id', { id: enrollmentId }); if (!found.length) throw new ApiProblem(404, 'NOT_FOUND', 'Направление ребёнка не найдено'); const current = found[0]; const directionId = id(body.directionId ?? current.direction_id, 'directionId'); if (directionId !== String(current.direction_id)) throw new ApiProblem(409, 'DIRECTION_CHANGE_REQUIRES_NEW_ENROLLMENT', 'Смена направления требует закрыть старое и создать отдельное новое направление'); const status = body.status ?? current.status; if (!enrollmentStatuses.has(status)) throw new ApiProblem(400, 'VALIDATION_ERROR', 'Некорректный статус направления'); const price = body.individualPrice === undefined ? current.individual_price : body.individualPrice === '' || body.individualPrice == null ? null : Number(body.individualPrice); if (price !== null && !(price > 0)) throw new ApiProblem(400, 'VALIDATION_ERROR', 'Индивидуальная цена должна быть больше нуля'); const [membership] = await connection.query('SELECT id,group_id FROM group_memberships WHERE enrollment_id=:id AND ended_on IS NULL ORDER BY started_on DESC,id DESC LIMIT 1', { id: enrollmentId }); const targetGroupId = body.groupId === undefined ? membership[0]?.group_id ?? null : body.groupId; await assertIds(connection, 'directions', [directionId], 'directionId'); await validateEnrollmentGroup(connection, directionId, targetGroupId); await connection.query('UPDATE child_enrollments SET direction_id=:directionId,status=:status,individual_price=:price,ended_on=:endedOn WHERE id=:id', { id: enrollmentId, directionId, status, price, endedOn: status === 'finished' ? (body.endedOn ?? new Date().toISOString().slice(0, 10)) : null }); if ((current.individual_price == null ? null : Number(current.individual_price)) !== (price == null ? null : Number(price))) { await connection.query(`UPDATE price_versions SET valid_to=NOW(6) WHERE scope_type='enrollment' AND enrollment_id=:id AND valid_to IS NULL`, { id: enrollmentId }); if (price != null) await connection.query(`INSERT INTO price_versions (scope_type,enrollment_id,price,valid_from) VALUES ('enrollment',:id,:price,NOW(6))`, { id: enrollmentId, price }); } if (String(membership[0]?.group_id ?? '') !== String(targetGroupId ?? '')) { await connection.query('UPDATE group_memberships SET ended_on=CURDATE() WHERE enrollment_id=:id AND ended_on IS NULL', { id: enrollmentId }); if (targetGroupId != null) await connection.query('INSERT INTO group_memberships (enrollment_id,group_id,started_on) VALUES (:id,:groupId,CURDATE())', { id: enrollmentId, groupId: id(targetGroupId, 'groupId') }); } if (targetGroupId != null) await resolvePendingOperationSnapshots(connection, enrollmentId, id(targetGroupId, 'groupId')); if (status !== current.status) await connection.query(`INSERT INTO enrollment_status_history (enrollment_id,old_status,new_status,direction_id_snapshot,group_id_snapshot,project_id_snapshot) SELECT :id,:old,:next,:directionId,g.id,g.project_id FROM (SELECT 1) x LEFT JOIN study_groups g ON g.id=:groupId`, { id: enrollmentId, old: current.status, next: status, directionId, groupId: targetGroupId }); return String(current.child_id); }); return (await get('children', childId)).enrollments.find((item) => item.id === enrollmentId); }
    catch (error) { throw mysqlError(error); }
  }
  async function deleteChild(childId) {
    childId = id(childId, 'childId'); await get('children', childId);
    const history = await one(`SELECT
      (SELECT COUNT(*) FROM payments WHERE child_id=:id AND deleted_at IS NULL) payments,
      (SELECT COUNT(*) FROM refunds WHERE child_id=:id AND deleted_at IS NULL) refunds,
      (SELECT COUNT(*) FROM attendances WHERE child_id=:id AND marked_at IS NOT NULL) attendances,
      (SELECT COUNT(*) FROM balance_transfers WHERE child_id=:id) balanceTransfers,
      (SELECT COUNT(*) FROM child_enrollments WHERE child_id=:id AND balance_lessons<>0) nonzeroBalances,
      (SELECT COUNT(*) FROM balance_entries original
        JOIN child_enrollments e ON e.id=original.enrollment_id
        LEFT JOIN balance_entries reversal ON reversal.reversal_of_entry_id=original.id
        WHERE e.child_id=:id AND original.entry_type<>'reversal' AND reversal.id IS NULL
          AND (original.lessons_delta<>0 OR original.amount_delta<>0)) balanceEffects`, { id: childId });
    if (Object.values(history).some((value) => Number(value) > 0)) {
      const labels = { payments: 'оплаты', refunds: 'возвраты', attendances: 'посещения', balanceTransfers: 'переносы баланса', nonzeroBalances: 'ненулевой баланс', balanceEffects: 'операции баланса' };
      const details = Object.entries(history).filter(([, value]) => Number(value) > 0).map(([name, value]) => `${labels[name] ?? name}: ${value}`).join(', ');
      throw new ApiProblem(409, 'CHILD_HAS_HISTORY', `Нельзя удалить ребёнка. Остались зависимости: ${details}.`, history);
    }
    try { await inTransaction(pool, async (connection) => { const [enrollments] = await connection.query('SELECT id FROM child_enrollments WHERE child_id=:id FOR UPDATE', { id: childId }); const enrollmentIds = enrollments.map((row) => String(row.id)); for (const enrollmentId of enrollmentIds) { await connection.query(`DELETE blc FROM balance_lot_consumptions blc LEFT JOIN balance_lots bl ON bl.id=blc.balance_lot_id LEFT JOIN balance_entries be ON be.id=blc.balance_entry_id WHERE bl.enrollment_id=:id OR be.enrollment_id=:id`, { id: enrollmentId }); await connection.query('DELETE FROM balance_lots WHERE enrollment_id=:id', { id: enrollmentId }); await connection.query(`DELETE reversal FROM balance_entries reversal JOIN balance_entries original ON original.id=reversal.reversal_of_entry_id WHERE original.enrollment_id=:id`, { id: enrollmentId }); await connection.query('DELETE FROM balance_entries WHERE enrollment_id=:id', { id: enrollmentId }); await connection.query('DELETE FROM attendances WHERE enrollment_id=:id AND marked_at IS NULL', { id: enrollmentId }); await connection.query('DELETE FROM price_versions WHERE enrollment_id=:id', { id: enrollmentId }); await connection.query('DELETE FROM enrollment_status_history WHERE enrollment_id=:id', { id: enrollmentId }); await connection.query('DELETE FROM group_memberships WHERE enrollment_id=:id', { id: enrollmentId }); } await connection.query('DELETE FROM lesson_photos WHERE child_id=:id', { id: childId }); await connection.query('DELETE FROM lesson_roster_members WHERE child_id=:id', { id: childId }); await connection.query('DELETE FROM child_status_history WHERE child_id=:id', { id: childId }); await connection.query('DELETE FROM child_user_accounts WHERE child_id=:id', { id: childId }); const [guardians] = await connection.query('SELECT guardian_id FROM child_guardians WHERE child_id=:id', { id: childId }); await connection.query('DELETE FROM child_guardians WHERE child_id=:id', { id: childId }); await connection.query('DELETE FROM child_enrollments WHERE child_id=:id', { id: childId }); await connection.query('DELETE FROM children WHERE id=:id', { id: childId }); for (const guardian of guardians) await connection.query('DELETE g FROM guardians g LEFT JOIN child_guardians cg ON cg.guardian_id=g.id WHERE g.id=:id AND cg.guardian_id IS NULL AND g.user_id IS NULL', { id: guardian.guardian_id }); }); }
    catch (error) { throw mysqlError(error); }
    return null;
  }

  return {
    list: (resource, context = {}) => collection[resource](context), get,
    create: (resource, body) => ({ directions: createDirection, sites: createSite, teachers: createTeacher, groups: createGroup, children: createChild }[resource])(body),
    update: (resource, resourceId, body) => ({ directions: updateDirection, sites: updateSite, teachers: updateTeacher, groups: updateGroup, children: updateChild }[resource])(resourceId, body),
    createEnrollment, updateEnrollment, deleteChild,
  };
}

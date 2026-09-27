import { addCalendarDays, businessDate, parseCalendarDate } from '../../src/shared/business-time.mjs';

const problem = (status, code, message) => Object.assign(new Error(message), { status, code });

const dateOnly = (value) => {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
};

const membershipDate = (value, fallback = businessDate()) => {
  try { return parseCalendarDate(value == null || value === '' ? fallback : value); }
  catch { throw problem(400, 'VALIDATION_ERROR', 'Некорректная дата начала занятий в группе'); }
};

const conflict = () => problem(409, 'MEMBERSHIP_DATE_CONFLICT', 'Дата создаёт пересечение с историей групп ребёнка');

export async function changeGroupMembership(connection, {
  enrollmentId,
  targetGroupId,
  startedOn,
  operationDate = businessDate(),
  childId = null,
  actorUserId = null,
  notificationEvents = null,
} = {}) {
  const effectiveDate = membershipDate(startedOn, operationDate);
  const [rawRows] = await connection.query(`SELECT id,group_id,started_on,ended_on FROM group_memberships
    WHERE enrollment_id=:id ORDER BY started_on,id FOR UPDATE`, { id: enrollmentId });
  const rows = rawRows.map((row) => ({ ...row, started_on: dateOnly(row.started_on), ended_on: dateOnly(row.ended_on) }));
  const open = [...rows].reverse().find((row) => row.ended_on == null) ?? null;

  if (targetGroupId == null || targetGroupId === '') {
    for (const row of rows.filter((item) => item.started_on >= effectiveDate)) {
      await connection.query('DELETE FROM group_memberships WHERE id=:id', { id: row.id });
    }
    const effective = [...rows].reverse().find((row) => row.started_on < effectiveDate
      && (row.ended_on == null || row.ended_on >= effectiveDate));
    if (effective) await connection.query('UPDATE group_memberships SET ended_on=:endedOn WHERE id=:id', {
      id: effective.id, endedOn: addCalendarDays(effectiveDate, -1),
    });
    return { changed: Boolean(open), membershipId: null, startedOn: null };
  }

  const groupId = String(targetGroupId);
  const notify = async (membershipId) => {
    if (!notificationEvents || childId == null) return;
    await notificationEvents.childAddedToGroup(connection, {
      groupId, childId, actorUserId, causeKey: `membership-${membershipId}`,
    });
  };

  if (!open) {
    const previous = rows.at(-1) ?? null;
    if (previous && effectiveDate <= previous.started_on) throw conflict();
    if (previous && previous.ended_on != null && previous.ended_on >= effectiveDate) {
      await connection.query('UPDATE group_memberships SET ended_on=:endedOn WHERE id=:id', {
        id: previous.id, endedOn: addCalendarDays(effectiveDate, -1),
      });
    }
    const [inserted] = await connection.query(`INSERT INTO group_memberships (enrollment_id,group_id,started_on)
      VALUES (:id,:groupId,:startedOn)`, { id: enrollmentId, groupId, startedOn: effectiveDate });
    await notify(inserted.insertId);
    return { changed: true, membershipId: String(inserted.insertId), startedOn: effectiveDate };
  }

  const openIndex = rows.findIndex((row) => String(row.id) === String(open.id));
  const previous = openIndex > 0 ? rows[openIndex - 1] : null;
  const sameGroup = String(open.group_id) === groupId;

  if (effectiveDate === open.started_on) {
    if (!sameGroup) {
      await connection.query('UPDATE group_memberships SET group_id=:groupId WHERE id=:id', { id: open.id, groupId });
      await notify(open.id);
    }
    return { changed: !sameGroup, membershipId: String(open.id), startedOn: effectiveDate };
  }

  if (sameGroup || effectiveDate < open.started_on) {
    if (previous && effectiveDate <= previous.started_on) throw conflict();
    if (previous) await connection.query('UPDATE group_memberships SET ended_on=:endedOn WHERE id=:id', {
      id: previous.id, endedOn: addCalendarDays(effectiveDate, -1),
    });
    await connection.query('UPDATE group_memberships SET group_id=:groupId,started_on=:startedOn WHERE id=:id', {
      id: open.id, groupId, startedOn: effectiveDate,
    });
    if (!sameGroup) await notify(open.id);
    return { changed: true, membershipId: String(open.id), startedOn: effectiveDate };
  }

  await connection.query('UPDATE group_memberships SET ended_on=:endedOn WHERE id=:id', {
    id: open.id, endedOn: addCalendarDays(effectiveDate, -1),
  });
  const [inserted] = await connection.query(`INSERT INTO group_memberships (enrollment_id,group_id,started_on)
    VALUES (:id,:groupId,:startedOn)`, { id: enrollmentId, groupId, startedOn: effectiveDate });
  await notify(inserted.insertId);
  return { changed: true, membershipId: String(inserted.insertId), startedOn: effectiveDate };
}

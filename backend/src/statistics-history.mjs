import { aggregateChildStatus } from './enrollment-status.mjs';

export const stamp = (value) => {
  if (value == null) return null;
  const text = (value instanceof Date ? value.toISOString() : String(value)).replace('T', ' ');
  return `${text.slice(0, 10)} ${text.slice(11, 19) || '00:00:00'}.${(text.match(/\.(\d+)/)?.[1] ?? '').padEnd(6, '0').slice(0, 6)}`;
};
const before = (a, b) => a.changed_at.localeCompare(b.changed_at) || (BigInt(a.id) < BigInt(b.id) ? -1 : 1);

// Only recorded history, or a row provably unchanged since creation, can establish
// a past status. Financial updates may remove that proof; never guess in that case.
export function enrollmentHistory(enrollments, histories) {
  const entries = new Map(enrollments.map((e) => [String(e.id), { ...e, history: [] }]));
  for (const h of histories) entries.get(String(h.enrollment_id))?.history.push({ ...h, changed_at: stamp(h.changed_at) });
  for (const e of entries.values()) e.history.sort(before);
  function at(enrollmentId, timestamp, limitId = null) {
    const e = entries.get(String(enrollmentId)); if (!e || String(e.started_on).slice(0, 10) > timestamp.slice(0, 10)) return undefined;
    const items = e.history; let low = 0; let high = items.length;
    while (low < high) {
      const mid = (low + high) >>> 1; const row = items[mid];
      if (row.changed_at < timestamp || (row.changed_at === timestamp && (limitId == null || BigInt(row.id) <= limitId))) low = mid + 1;
      else high = mid;
    }
    if (low) return items[low - 1].new_status;
    if (items.length) return items[0].old_status ?? null;
    if (e.created_at != null && e.updated_at != null && stamp(e.created_at) === stamp(e.updated_at)
      && stamp(e.created_at) <= timestamp) return e.status;
    return null;
  }
  function overall(rows, timestamp, limitId = null) {
    const statuses = rows.map((e) => at(e.id, timestamp, limitId)).filter((status) => status !== undefined);
    if (!statuses.length) return undefined;
    if (statuses.includes('active')) return 'active';
    if (statuses.includes(null)) return null;
    return aggregateChildStatus(statuses.map((status) => ({ status })), null);
  }
  return { entries, at, overall };
}

export function periodDepartures(index, from, to, observedAt) {
  const start = `${from} 00:00:00.000000`; const end = [`${to} 23:59:59.999999`, observedAt].sort()[0];
  const children = new Map(); const groups = new Map(); const paused = new Set(); const finished = new Set(); let unknown = 0;
  for (const e of index.entries.values()) { const rows = children.get(String(e.child_id)) ?? []; rows.push(e); children.set(String(e.child_id), rows); }
  if (end < start) return { paused: 0, finished: 0, unknown: 0, groups };
  for (const [childId, rows] of children) {
    const final = index.overall(rows, end); if (final === null) unknown++;
    for (const e of rows) for (const event of e.history) {
      if (event.changed_at < start || event.changed_at > end || !['paused', 'finished'].includes(event.new_status)) continue;
      const previous = index.overall(rows, event.changed_at, BigInt(event.id) - 1n);
      const next = index.overall(rows, event.changed_at, BigInt(event.id));
      if (['paused', 'finished'].includes(next) && final === next && previous != null && previous !== next) (next === 'paused' ? paused : finished).add(childId);
      // Group departures concern the event's enrollment, not another direction.
      if (event.group_id_snapshot != null && index.at(e.id, end) === event.new_status && event.old_status !== event.new_status) {
        const id = String(event.group_id_snapshot); const group = groups.get(id) ?? { paused: new Set(), finished: new Set() };
        group[event.new_status === 'paused' ? 'paused' : 'finished'].add(childId); groups.set(id, group);
      }
    }
  }
  return { paused: paused.size, finished: finished.size, unknown, groups };
}

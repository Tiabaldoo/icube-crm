import { financeFixture } from './finance-sql-fixture.mjs';
import { createMysqlLessons, attendanceCorrectionVersion } from '../../backend/src/lessons.mjs';
import { createDeletionService } from '../../backend/src/deletion.mjs';

export function correctionFixture(t, options = {}) {
  const f = financeFixture(t, options); const { db } = f;
  db.function('IF', (condition, yes, no) => condition ? yes : no);
  db.function('JSON_UNQUOTE', (value) => value == null ? null : String(value));
  db.exec(`ALTER TABLE children ADD COLUMN deleted_at TEXT;
    ALTER TABLE children ADD COLUMN status TEXT DEFAULT 'active';
    ALTER TABLE child_enrollments ADD COLUMN status TEXT DEFAULT 'active';
    ALTER TABLE child_enrollments ADD COLUMN started_on TEXT DEFAULT '2026-01-01';
    ALTER TABLE child_enrollments ADD COLUMN ended_on TEXT;
    ALTER TABLE lesson_roster_members ADD COLUMN added_by_user_id INTEGER;
    ALTER TABLE lesson_roster_members ADD COLUMN frozen_at TEXT;
    CREATE UNIQUE INDEX attendance_child ON attendances(lesson_id,child_id);
    CREATE UNIQUE INDEX roster_child ON lesson_roster_members(lesson_id,child_id);
    CREATE TABLE audit_log(id INTEGER PRIMARY KEY,actor_user_id INTEGER,action TEXT,entity_type TEXT,entity_id INTEGER,before_data TEXT,after_data TEXT);
    CREATE TABLE salary_accruals(id INTEGER PRIMARY KEY,lesson_id INTEGER,teacher_id INTEGER,rate_version_id INTEGER,accrual_type TEXT,present_children INTEGER,fixed_amount TEXT,children_amount TEXT,total_amount TEXT,supersedes_accrual_id INTEGER,reversed_at TEXT);
    CREATE TABLE enrollment_status_history(id INTEGER PRIMARY KEY,enrollment_id INTEGER);
    CREATE TABLE lessons(id INTEGER PRIMARY KEY,group_id INTEGER,project_id_snapshot INTEGER,direction_id_snapshot INTEGER,is_mixed_snapshot INTEGER,
      planned_teacher_id INTEGER,actual_teacher_id INTEGER,status TEXT,starts_at TEXT,ends_at TEXT,scheduled_starts_at TEXT,scheduled_ends_at TEXT,
      calculation_mode_snapshot TEXT,teacher_share_percent_snapshot TEXT,partner_share_percent_snapshot TEXT,tax_percent_snapshot TEXT,custom_tax_enabled_snapshot INTEGER,
      lock_version INTEGER DEFAULT 0,deleted_at TEXT,is_intro_group INTEGER DEFAULT 0,is_empty_trip INTEGER DEFAULT 0);
    INSERT INTO lessons VALUES(10,9,2,1,1,5,5,'completed','2026-10-16 10:00:00','2026-10-16 11:00:00','2026-10-16 10:00:00','2026-10-16 11:00:00',
      '${options.mode ?? 'standard'}','50','25','0',0,0,NULL,0,0);
    INSERT INTO lessons SELECT 11,99,2,2,0,6,6,status,'2026-10-09 15:00:00','2026-10-09 16:00:00','2026-10-09 15:00:00','2026-10-09 16:00:00',
      calculation_mode_snapshot,teacher_share_percent_snapshot,partner_share_percent_snapshot,tax_percent_snapshot,custom_tax_enabled_snapshot,0,NULL,0,0 FROM lessons WHERE id=10;`);
  let injected = null;
  const correctionCalls = [];
  async function query(raw, params = {}) {
    const sql = raw.replace(/\s+/g, ' ').trim();
    correctionCalls.push({ sql, params });
    if (injected && sql.startsWith(injected)) throw new Error('injected correction failure');
    // The production financial/FIFO queries execute unchanged. Only directory
    // enrichment and MySQL-specific syntax are adapted for the in-memory DB.
    if (sql.startsWith('SELECT l.*,g.name')) {
      const rows = db.prepare('SELECT * FROM lessons WHERE id=?').all(Number(params.id));
      return [rows.map((row) => ({ ...row, group_name: 'Группа', direction_name: 'Направление', project_name: 'Проект', site_name: 'Школа',
        effective_roster_child_ids: '[]', absence_notice_child_ids: '[]', birthday_child_ids: '[]' }))];
    }
    if (sql.includes('FROM salary_rate_versions')) return f.query(sql, params);
    if (sql.startsWith('SELECT after_data FROM audit_log')) {
      const [rows] = execute(sql, params);
      const normalize = (value) => Array.isArray(value) ? value.map(normalize) : value && typeof value === 'object'
        ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalize(value[key])])) : value;
      // Native MySQL JSON reorders object keys. Replays must not depend on their order.
      return [rows.map((row) => ({ after_data: JSON.stringify(normalize(JSON.parse(row.after_data))) }))];
    }
    if (sql.startsWith('SELECT l.id,l.starts_at')) {
      // Keep the chooser query's WHERE clauses, including scope/duplicates.
      const adapted = sql.replace('d.name direction_name', "'Направление' direction_name").replace('g.name group_name', "'Группа' group_name")
        .replace('COALESCE(os.name,s.name) site_name', "'Школа' site_name").replace(/ JOIN study_groups.*? WHERE /, ' WHERE ');
      return execute(adapted, params);
    }
    if (sql.startsWith('DELETE blc FROM')) return execute(`DELETE FROM balance_lot_consumptions WHERE balance_lot_id IN
      (SELECT id FROM balance_lots WHERE enrollment_id=:id) OR balance_entry_id IN (SELECT id FROM balance_entries WHERE enrollment_id=:id)`, params);
    if (sql.startsWith('DELETE reversal FROM')) return execute(`DELETE FROM balance_entries WHERE reversal_of_entry_id IN (SELECT id FROM balance_entries WHERE enrollment_id=:id)`, params);
    return execute(sql, params);
  }
  function execute(sql, params) {
    const adapted = sql.replace(/\s+FOR UPDATE\b/g, '');
    const bindings = Object.fromEntries(Object.entries(params).filter(([key]) => adapted.includes(`:${key}`))
      .map(([key, value]) => [key, typeof value === 'boolean' ? Number(value) : value ?? null]));
    const statement = db.prepare(adapted);
    if (/^SELECT/.test(adapted)) return [statement.all(bindings)];
    const result = statement.run(bindings); return [{ insertId: Number(result.lastInsertRowid), affectedRows: result.changes }];
  }
  const connection = { query, async beginTransaction() { db.exec('BEGIN'); }, async commit() { db.exec('COMMIT'); }, async rollback() { db.exec('ROLLBACK'); }, release() {} };
  // SQLite has no row locks. Serialize fixture transactions to model the shared
  // source/destination locks, including concurrent callers waiting for commit.
  let tail = Promise.resolve();
  const pool = { query, async getConnection() {
    const previous = tail; let release; tail = new Promise((resolve) => { release = resolve; }); await previous;
    return { ...connection, release };
  } };
  const lessons = createMysqlLessons(pool); const deletions = createDeletionService(pool);
  function seedVisit({ trial = false, enrollmentId = 7, type = 'main', lessonId = 10 } = {}) {
    if (!trial) {
      f.visits(1, { paymentId: null, enrollmentId });
      db.prepare('UPDATE attendances SET lesson_id=?,attendance_type=?').run(lessonId, type);
      db.prepare('UPDATE lesson_roster_members SET lesson_id=?,roster_type=?').run(lessonId, type);
    } else {
      db.prepare("INSERT INTO attendances(lesson_id,child_id,enrollment_id,attendance_type,present,is_trial,charged_lessons,marked_at) VALUES(?,8,?,?,1,1,'0','2026-10-16 10:00:00')").run(lessonId, enrollmentId, type);
      db.prepare('INSERT INTO lesson_roster_members(lesson_id,child_id,roster_type) VALUES(?,8,?)').run(lessonId, type);
    }
  }
  function body({ source = 10, target = source, enrollment = 8, trial = false } = {}) {
    const attendance = db.prepare('SELECT * FROM attendances WHERE lesson_id=? AND child_id=8').get(source);
    const lesson = db.prepare('SELECT * FROM lessons WHERE id=?').get(source);
    const debit = db.prepare("SELECT be.id FROM balance_entries be WHERE be.attendance_id=? AND be.entry_type='attendance' AND NOT EXISTS(SELECT 1 FROM balance_entries r WHERE r.reversal_of_entry_id=be.id)").get(attendance.id);
    return { targetLessonId: String(target), enrollmentId: String(enrollment), trial, expectedRevision: attendanceCorrectionVersion(attendance, lesson, debit?.id),
      expectedTargetVersion: Number(db.prepare('SELECT lock_version FROM lessons WHERE id=?').get(target).lock_version) };
  }
  const context = { userId: '1', roles: ['director'], idempotencyKey: 'correction-one' };
  const correct = (bodyValue = body(), extra = {}, source = 10) => lessons.correctAttendance(String(source), '8', bodyValue, { ...context, ...extra });
  const snapshot = () => JSON.stringify(['attendances','balance_entries','balance_lots','balance_lot_consumptions','child_enrollments','salary_accruals','audit_log','lessons'].map((table) => f.rows(table)));
  return { ...f, pool, lessons, deletions, seedVisit, body, correct, context, snapshot, correctionCalls, failCorrectionAt(prefix) { injected = prefix; } };
}

import { correctionFixture } from './attendance-correction-fixture.mjs';
import { createStatistics } from '../../backend/src/statistics.mjs';

export function statisticsFixture(t, { keepFinancialSeed = false } = {}) {
  const f = correctionFixture(t); const { db } = f;
  db.function('DATE_FORMAT', { varargs: true }, (date) => String(date).slice(0, 7));
  db.exec(`ALTER TABLE children ADD COLUMN created_at TEXT DEFAULT '2026-01-01 00:00:00';
    ALTER TABLE children ADD COLUMN created_from_lesson_id INTEGER;
    ALTER TABLE child_enrollments ADD COLUMN updated_at TEXT DEFAULT '2026-01-01';
    ALTER TABLE directions ADD COLUMN code TEXT;
    UPDATE directions SET code=CASE id WHEN 1 THEN 'robotics' ELSE 'programming' END;
    ALTER TABLE study_groups ADD COLUMN name TEXT DEFAULT 'Группа А';
    ALTER TABLE study_groups ADD COLUMN project_id INTEGER DEFAULT 2;
    ALTER TABLE study_groups ADD COLUMN direction_id INTEGER DEFAULT 1;
    ALTER TABLE study_groups ADD COLUMN site_id INTEGER DEFAULT 1;
    ALTER TABLE study_groups ADD COLUMN is_mixed INTEGER DEFAULT 0;
    ALTER TABLE study_groups ADD COLUMN is_individual INTEGER DEFAULT 0;
    ALTER TABLE study_groups ADD COLUMN weekday INTEGER DEFAULT 5;
    ALTER TABLE study_groups ADD COLUMN start_time TEXT DEFAULT '10:00:00';
    ALTER TABLE study_groups ADD COLUMN end_time TEXT DEFAULT '11:00:00';
    ALTER TABLE study_groups ADD COLUMN deleted_at TEXT;
    ALTER TABLE lessons ADD COLUMN roster_frozen_at TEXT;
    ALTER TABLE enrollment_status_history ADD COLUMN old_status TEXT;
    ALTER TABLE enrollment_status_history ADD COLUMN new_status TEXT;
    ALTER TABLE enrollment_status_history ADD COLUMN direction_id_snapshot INTEGER;
    ALTER TABLE enrollment_status_history ADD COLUMN project_id_snapshot INTEGER;
    ALTER TABLE enrollment_status_history ADD COLUMN group_id_snapshot INTEGER;
    ALTER TABLE enrollment_status_history ADD COLUMN changed_at TEXT;
    CREATE TABLE projects(id INTEGER PRIMARY KEY,name TEXT,code TEXT);
    INSERT INTO projects VALUES(2,'iCubeRobots','icube-robots'),(3,'Зебра','zebra');
    CREATE TABLE sites(id INTEGER PRIMARY KEY,name TEXT); INSERT INTO sites VALUES(1,'Школа');
    CREATE TABLE group_schedule_slots(id INTEGER PRIMARY KEY,group_id INTEGER,weekday INTEGER,start_time TEXT,end_time TEXT);
    INSERT INTO study_groups(id,calculation_mode,package_lesson_count,name,direction_id) VALUES(99,'standard',4,'Группа Б',2);`);
  if (!keepFinancialSeed) db.exec('DELETE FROM group_memberships; DELETE FROM child_enrollments; DELETE FROM children; DELETE FROM lessons');
  const calls = [];
  const pool = { async query(raw, params = {}) {
    calls.push({ sql: raw, params });
    const sql = raw.replace(/GROUP_CONCAT\(CONCAT\(gs.weekday,' ',gs.start_time,'–',gs.end_time\) ORDER BY gs.weekday,gs.start_time SEPARATOR '; '\)/g,
      "GROUP_CONCAT(CONCAT(gs.weekday,' ',gs.start_time,'–',gs.end_time),'; ')")
      .replace(/DATE_ADD\(DATE\(t.starts_at\),INTERVAL 30 DAY\)/g, "date(t.starts_at,'+30 day')");
    const bindings = Object.fromEntries(Object.entries(params).filter(([key]) => new RegExp(`:${key}\\b`).test(sql))
      .map(([key, value]) => [key, value != null && key.endsWith('Id') ? Number(value) : value]));
    return [db.prepare(sql).all(bindings).map((row) => 'amount' in row ? { ...row, amount: Number(row.amount).toFixed(2) } : row)];
  } };
  const director = { userId: '1', roles: ['director'] };
  const service = createStatistics(pool, { now: () => new Date('2026-10-20T01:00:00Z') });
  const get = (params = {}, context = director) => service.get({ from: '2026-09-01', to: '2026-09-30', chartFrom: '2026-08-01', chartTo: '2026-10-31', ...params }, context);
  function child(id, { status = 'active', created = '2026-01-01 00:00:00', directions = [1], project = 2 } = {}) {
    db.prepare('INSERT INTO children(id,full_name,status,created_at) VALUES(?,?,?,?)').run(id, `Ребёнок ${id}`, status, created);
    for (const direction of directions) db.prepare('INSERT INTO child_enrollments(id,child_id,direction_id,project_id,status) VALUES(?,?,?,?,?)').run(id * 10 + direction, id, direction, project, status);
  }
  function lesson(id, date, { group = 9, status = 'completed', project = 2, mixed = false, mode = 'standard' } = {}) {
    db.prepare(`INSERT INTO lessons(id,group_id,project_id_snapshot,direction_id_snapshot,is_mixed_snapshot,planned_teacher_id,actual_teacher_id,status,starts_at,ends_at,
      calculation_mode_snapshot,teacher_share_percent_snapshot,partner_share_percent_snapshot,tax_percent_snapshot,custom_tax_enabled_snapshot)
      VALUES(?,?,?,1,?,5,5,?,?,? ,?,'50','25','0',0)`).run(id, group, project, Number(mixed), status, `${date} 10:00:00`, `${date} 11:00:00`, mode);
  }
  function visit(lessonId, childId, { direction = 1, present = true, trial = false, type = 'main', marked = true, charged = !trial, roster = true } = {}) {
    if (roster) db.prepare('INSERT INTO lesson_roster_members(lesson_id,child_id,roster_type) VALUES(?,?,?)').run(lessonId, childId, type);
    db.prepare(`INSERT INTO attendances(lesson_id,child_id,enrollment_id,attendance_type,present,is_trial,charged_lessons,marked_at)
      VALUES(?,?,?,?,?,?,?,?)`).run(lessonId, childId, childId * 10 + direction, type, Number(present), Number(trial), Number(charged && present), marked ? '2026-09-01 10:00:00' : null);
  }
  function change(id, oldStatus, newStatus, at, { group = 9 } = {}) {
    db.prepare(`INSERT INTO enrollment_status_history(enrollment_id,old_status,new_status,direction_id_snapshot,project_id_snapshot,group_id_snapshot,changed_at)
      SELECT id,?,?,direction_id,project_id,?,? FROM child_enrollments WHERE id=?`).run(oldStatus, newStatus, group, at, id);
    db.prepare('UPDATE child_enrollments SET status=?,updated_at=? WHERE id=?').run(newStatus, at, id);
  }
  return { ...f, service, get, calls, child, lesson, visit, change, director };
}

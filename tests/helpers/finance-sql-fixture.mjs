import { DatabaseSync } from 'node:sqlite';
import { createMysqlPayments } from '../../backend/src/payments.mjs';
import { createMysqlRefunds } from '../../backend/src/refunds.mjs';
import { createMysqlLessons } from '../../backend/src/lessons.mjs';

// Execute the production financial queries against isolated stored rows. Only
// MySQL syntax and unrelated lesson/directory/salary reads are adapted here.
export function financeFixture(t, { price = '1125.00', packageCount = 4, mode = 'standard' } = {}) {
  const db = new DatabaseSync(':memory:'); t.after(() => db.close());
  db.function('NOW', { varargs: true }, () => '2026-10-19 12:00:00');
  db.function('CONCAT', { varargs: true }, (...args) => args.join(''));
  db.exec(`CREATE TABLE children(id INTEGER PRIMARY KEY,full_name TEXT);
    CREATE TABLE directions(id INTEGER PRIMARY KEY,name TEXT);
    CREATE TABLE study_groups(id INTEGER PRIMARY KEY,calculation_mode TEXT,package_lesson_count INTEGER);
    CREATE TABLE group_memberships(id INTEGER PRIMARY KEY,enrollment_id INTEGER,group_id INTEGER,started_on TEXT,ended_on TEXT);
    CREATE TABLE price_versions(id INTEGER PRIMARY KEY,scope_type TEXT,enrollment_id INTEGER,group_id INTEGER,direction_id INTEGER,project_id INTEGER,price TEXT,valid_from TEXT,valid_to TEXT);
    CREATE TABLE child_enrollments(id INTEGER PRIMARY KEY,child_id INTEGER,direction_id INTEGER,project_id INTEGER,individual_price TEXT,balance_lessons NUMERIC DEFAULT 0,superseded_at TEXT,created_at TEXT DEFAULT '2026-01-01');
    CREATE TABLE payments(id INTEGER PRIMARY KEY,enrollment_id INTEGER,child_id INTEGER,direction_id INTEGER,group_id_snapshot INTEGER,project_id_snapshot INTEGER,paid_on TEXT,amount TEXT,price_snapshot TEXT,lessons_credit TEXT,method TEXT,note TEXT,created_by_user_id INTEGER,calculation_mode_snapshot TEXT,deleted_at TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE refunds(id INTEGER PRIMARY KEY,enrollment_id INTEGER,child_id INTEGER,direction_id INTEGER,payment_id INTEGER,group_id_snapshot INTEGER,project_id_snapshot INTEGER,refunded_on TEXT,amount TEXT,price_snapshot TEXT,lessons_debit TEXT,reason TEXT,created_by_user_id INTEGER,deleted_at TEXT);
    CREATE TABLE balance_entries(id INTEGER PRIMARY KEY,enrollment_id INTEGER,entry_type TEXT,lessons_delta TEXT,amount_delta TEXT,unit_price_snapshot TEXT,payment_id INTEGER,refund_id INTEGER,attendance_id INTEGER,transfer_id INTEGER,reversal_of_entry_id INTEGER UNIQUE,idempotency_key TEXT UNIQUE,occurred_at TEXT,created_by_user_id INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE balance_lots(id INTEGER PRIMARY KEY,enrollment_id INTEGER,source_balance_entry_id INTEGER,original_lessons TEXT,remaining_lessons TEXT,unit_price TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      CHECK(CAST(original_lessons AS REAL)>0 AND CAST(remaining_lessons AS REAL)>=0 AND CAST(remaining_lessons AS REAL)<=CAST(original_lessons AS REAL)));
    CREATE TABLE balance_lot_consumptions(id INTEGER PRIMARY KEY,balance_lot_id INTEGER,balance_entry_id INTEGER,lessons TEXT,amount TEXT,UNIQUE(balance_lot_id,balance_entry_id),CHECK(CAST(lessons AS REAL)>0));
    CREATE TABLE balance_transfer_lot_changes(id INTEGER PRIMARY KEY,balance_lot_id INTEGER);
    CREATE TABLE balance_transfers(id INTEGER PRIMARY KEY,source_enrollment_id INTEGER,target_enrollment_id INTEGER);
    CREATE TABLE enrollment_project_transfers(id INTEGER PRIMARY KEY,source_enrollment_id INTEGER,target_enrollment_id INTEGER);
    CREATE TABLE partner_settlements(id INTEGER PRIMARY KEY,project_id INTEGER,period_from TEXT,period_to TEXT);
    CREATE TABLE payment_receipt_payments(receipt_id INTEGER,payment_id INTEGER);
    CREATE TABLE attendances(id INTEGER PRIMARY KEY,lesson_id INTEGER,child_id INTEGER,enrollment_id INTEGER,attendance_type TEXT,present INTEGER,is_trial INTEGER,price_snapshot TEXT,charged_lessons TEXT,marked_at TEXT,marked_by_user_id INTEGER);
    CREATE TABLE lesson_roster_members(lesson_id INTEGER,child_id INTEGER,roster_type TEXT);
    INSERT INTO children VALUES(8,'Ребёнок'); INSERT INTO directions VALUES(1,'Робототехника'),(2,'Программирование');
    INSERT INTO child_enrollments(id,child_id,direction_id,project_id) VALUES(7,8,1,2),(8,8,2,2);
    INSERT INTO study_groups VALUES(9,'${mode}',${packageCount});
    INSERT INTO group_memberships VALUES(1,7,9,'2026-09-01',NULL);
    INSERT INTO price_versions VALUES(1,'direction',NULL,NULL,1,NULL,'1025.00','2026-01-01',NULL),
      (2,'direction',NULL,NULL,2,NULL,'1500.00','2026-01-01',NULL),
      (3,'group',NULL,9,NULL,NULL,'${price}','2026-09-01',NULL);`);
  const lesson = { id: 10, group_id: 9, project_id_snapshot: 2, direction_id_snapshot: 1, is_mixed_snapshot: 1,
    planned_teacher_id: 5, actual_teacher_id: 5, status: 'completed', starts_at: '2026-10-16 10:00:00', ends_at: '2026-10-16 11:00:00',
    scheduled_starts_at: '2026-10-16 10:00:00', calculation_mode_snapshot: mode, teacher_share_percent_snapshot: '50',
    partner_share_percent_snapshot: '25', tax_percent_snapshot: '0', custom_tax_enabled_snapshot: 0 };
  const calls = []; let failure = null;
  async function query(raw, params = {}) {
    const sql = raw.replace(/\s+/g, ' ').trim(); calls.push({ sql, params: { ...params } });
    if (failure && sql.startsWith(failure)) throw new Error('injected funding failure');
    if (sql === 'SELECT * FROM lessons WHERE id=:id FOR UPDATE') return [[{ ...lesson }]];
    if (sql.includes('FROM lessons l JOIN study_groups')) return [[{ ...lesson }]];
    if (sql.startsWith('SELECT * FROM salary_accruals') || sql.includes('FROM salary_accruals sa WHERE')) return [[]];
    if (sql.includes('FROM salary_rate_versions')) return [[{ id: 1, regular_fixed: '600.00', per_present_child: '100.00', intro_fixed: '600.00', empty_trip_fixed: '300.00' }]];
    if (sql.startsWith('INSERT INTO salary_accruals') || sql.startsWith('INSERT INTO audit_log')) return [{ insertId: 999 }];
    let adapted = sql.replace(/\s+FOR UPDATE\b/g, '')
      .replace(/DATE_ADD\(:priceDate,INTERVAL 1 DAY\)/g, "datetime(:priceDate,'+1 day')")
      .replace('GROUP_CONCAT(rp.receipt_id ORDER BY rp.receipt_id)', 'GROUP_CONCAT(rp.receipt_id)');
    const bindings = Object.fromEntries(Object.entries(params).filter(([key]) => adapted.includes(`:${key}`))
      .map(([key, value]) => [key, typeof value === 'boolean' ? Number(value) : value ?? null]));
    const statement = db.prepare(adapted);
    if (/^SELECT/i.test(adapted)) return [statement.all(bindings)];
    const result = statement.run(bindings); return [{ insertId: Number(result.lastInsertRowid), affectedRows: result.changes }];
  }
  const connection = { query, async beginTransaction() { db.exec('BEGIN'); }, async commit() { db.exec('COMMIT'); }, async rollback() { db.exec('ROLLBACK'); }, release() {} };
  const pool = { query, getConnection: async () => connection };
  const payments = createMysqlPayments(pool); const refunds = createMysqlRefunds(pool); const lessons = createMysqlLessons(pool);
  async function pay(amount = '4500.00', extra = {}, context = {}) {
    return payments.create({ enrollmentId: 7, paidOn: '2026-10-15', amount, method: 'cashless', ...extra }, { actorUserId: 1, ...context });
  }
  // Seed pre-existing booked visits; their snapshots/ledger are checked after edits.
  function visits(count, { paymentId = 1, price: unitPrice = price, enrollmentId = 7 } = {}) {
    const lot = paymentId == null ? null : db.prepare('SELECT bl.* FROM balance_lots bl JOIN balance_entries be ON be.id=bl.source_balance_entry_id WHERE be.payment_id=?').get(Number(paymentId));
    for (let i = 0; i < count; i++) {
      const id = Number(db.prepare('INSERT INTO attendances(lesson_id,child_id,enrollment_id,attendance_type,present,is_trial,price_snapshot,charged_lessons,marked_at) VALUES(10,8,?,\'main\',1,0,?,\'1.00000000\',\'2026-10-16 10:00:00\')').run(enrollmentId, unitPrice).lastInsertRowid);
      const entry = Number(db.prepare("INSERT INTO balance_entries(enrollment_id,entry_type,lessons_delta,amount_delta,unit_price_snapshot,attendance_id,occurred_at) VALUES(?,'attendance','-1.00000000',?,?,?,'2026-10-16 10:00:00')").run(enrollmentId, `-${unitPrice}`, unitPrice, id).lastInsertRowid);
      if (lot && Number(db.prepare('SELECT remaining_lessons FROM balance_lots WHERE id=?').get(lot.id).remaining_lessons) > 0) {
        db.prepare('INSERT INTO balance_lot_consumptions(balance_lot_id,balance_entry_id,lessons,amount) VALUES(?,?,\'1.00000000\',?)').run(lot.id, entry, unitPrice);
        db.prepare('UPDATE balance_lots SET remaining_lessons=remaining_lessons-1 WHERE id=?').run(lot.id);
      }
      db.prepare('UPDATE child_enrollments SET balance_lessons=balance_lessons-1 WHERE id=?').run(enrollmentId);
    }
    db.exec("INSERT INTO lesson_roster_members VALUES(10,8,'main')");
  }
  const rows = (table) => db.prepare(`SELECT * FROM ${table} ORDER BY id`).all().map((r) => ({ ...r }));
  return { db, query, calls, payments, refunds, lessons, pay, visits, rows, failAt(value) { failure = value; },
    balance(id = 7) { return Number(db.prepare('SELECT balance_lessons FROM child_enrollments WHERE id=?').get(id).balance_lessons); } };
}

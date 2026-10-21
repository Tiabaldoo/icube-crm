import { statisticsFixture } from './statistics-fixture.mjs';
import { createDirectorBudget } from '../../backend/src/director-budget.mjs';
import { createBudgetEntries } from '../../backend/src/budget-entries.mjs';

export function budgetFixture(t, { now = () => new Date('2026-10-21T01:00:00Z') } = {}) {
  const f=statisticsFixture(t);const {db}=f;
  db.exec(`ALTER TABLE projects ADD COLUMN partner_id INTEGER; UPDATE projects SET partner_id=9 WHERE id=3;
    CREATE TABLE partners(id INTEGER PRIMARY KEY,name TEXT);INSERT INTO partners VALUES(9,'Партнёр');
    CREATE TABLE partner_agreement_versions(id INTEGER PRIMARY KEY,project_id INTEGER,partner_id INTEGER,tax_percent TEXT,icube_percent TEXT,partner_percent TEXT,valid_from TEXT,valid_to TEXT);
    INSERT INTO partner_agreement_versions VALUES(1,3,9,'6.000','40.000','60.000','2026-01-01',NULL);
    ALTER TABLE sites ADD COLUMN project_id INTEGER DEFAULT 2; ALTER TABLE sites ADD COLUMN deleted_at TEXT;
    ALTER TABLE lessons ADD COLUMN site_id_snapshot INTEGER DEFAULT 1; ALTER TABLE lessons ADD COLUMN site_override_id INTEGER;
    CREATE TABLE site_rent_rate_versions(id INTEGER PRIMARY KEY,site_id INTEGER,rate TEXT,valid_from TEXT,valid_to TEXT);
    INSERT INTO site_rent_rate_versions VALUES(1,1,'300.00','2026-01-01','2026-10-10'),(2,1,'400.00','2026-10-10',NULL);
    CREATE TABLE director_budget_entries(id INTEGER PRIMARY KEY,entry_type TEXT,occurred_on TEXT,amount TEXT,purpose TEXT,created_by_user_id INTEGER,
      request_key TEXT UNIQUE,request_fingerprint TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,deleted_at TEXT);`);
  const calls=[];const moneyFields=new Set(['amount','cash','cashless','payments_amount','refunds_amount','cash_held_by_partner','salary_amount','custom_cash','custom_payments','custom_refunds']);
  async function query(raw,params={}) {
    calls.push({sql:raw,params});const sql=raw.replace(/ FOR UPDATE/g,'').replace('ON DUPLICATE KEY UPDATE id=id','ON CONFLICT(request_key) DO UPDATE SET id=id');
    const bindings=Object.fromEntries(Object.entries(params).filter(([key])=>new RegExp(`:${key}\\b`).test(sql)));const statement=db.prepare(sql);
    if(/^SELECT/.test(sql))return [statement.all(bindings).map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,moneyFields.has(key)&&value!=null?Number(value).toFixed(2):value])))];
    const r=statement.run(bindings);return [{insertId:Number(r.lastInsertRowid),affectedRows:r.changes}];
  }
  const pool={query,async getConnection(){return{query,async beginTransaction(){db.exec('BEGIN');},async commit(){db.exec('COMMIT');},async rollback(){db.exec('ROLLBACK');},release(){}};}};
  const service=createDirectorBudget(pool,{now});const manual=createBudgetEntries(pool);
  const context={roles:['director'],userId:'1',idempotencyKey:'manual-budget-1'};const period={from:'2026-09-10',to:'2026-10-20'};
  function payment(id,{project=2,date='2026-10-15',amount='4100.00',method='cashless',mode='standard',deleted=null}={}) {
    db.prepare('INSERT INTO payments(id,child_id,enrollment_id,direction_id,project_id_snapshot,paid_on,amount,method,calculation_mode_snapshot,deleted_at) VALUES(?,1,11,1,?,?,?,?,?,?)').run(id,project,date,amount,method,mode,deleted);
  }
  function refund(id,{paymentId=1,project=2,date='2026-10-16',amount='100.00',deleted=null}={}) {
    db.prepare('INSERT INTO refunds(id,child_id,enrollment_id,direction_id,payment_id,project_id_snapshot,refunded_on,amount,deleted_at) VALUES(?,1,11,1,?,?,?,?,?)').run(id,paymentId,project,date,amount,deleted);
  }
  function salary(lessonId,amount,{reversed=null}={}) {db.prepare('INSERT INTO salary_accruals(lesson_id,total_amount,reversed_at) VALUES(?,?,?)').run(lessonId,amount,reversed);}
  return {...f,pool,calls,service,manual,context,period,payment,refund,salary,get:(params=period,actor=context)=>service.get(params,actor)};
}

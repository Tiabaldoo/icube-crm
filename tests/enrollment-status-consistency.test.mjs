import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { financeFixture } from './helpers/finance-sql-fixture.mjs';
import { createMysqlCatalog } from '../backend/src/catalog.mjs';
import { createNotificationEvents } from '../backend/src/notification-events.mjs';
import { createNotifications } from '../backend/src/notifications.mjs';
import { visibleBalanceRows } from '../src/frontend/quick-status.mjs';

const director={roles:['director'],userId:'1'};
function fixture(t) {
  const f=financeFixture(t);
  f.db.exec(`ALTER TABLE children ADD COLUMN status TEXT DEFAULT 'finished';
    ALTER TABLE children ADD COLUMN deleted_at TEXT;
    ALTER TABLE child_enrollments ADD COLUMN status TEXT DEFAULT 'active';
    ALTER TABLE child_enrollments ADD COLUMN started_on TEXT DEFAULT '2026-01-01';
    ALTER TABLE child_enrollments ADD COLUMN ended_on TEXT;
    CREATE TABLE child_status_history(id INTEGER PRIMARY KEY,child_id INTEGER,old_status TEXT,new_status TEXT,changed_by_user_id INTEGER);
    CREATE TABLE enrollment_status_history(id INTEGER PRIMARY KEY,enrollment_id INTEGER,old_status TEXT,new_status TEXT,direction_id_snapshot INTEGER,group_id_snapshot INTEGER,project_id_snapshot INTEGER,changed_by_user_id INTEGER);
    UPDATE group_memberships SET ended_on='2026-08-31';
    UPDATE child_enrollments SET balance_lessons=-1 WHERE id=7;
    INSERT INTO payments(id,enrollment_id,amount,price_snapshot) VALUES(1,7,'4500.00','1125.00');
    INSERT INTO balance_entries(id,enrollment_id,entry_type,lessons_delta,amount_delta) VALUES(1,7,'payment','4.00000000','4500.00');
    INSERT INTO balance_lots(id,enrollment_id,source_balance_entry_id,original_lessons,remaining_lessons,unit_price) VALUES(1,7,1,'4.00000000','4.00000000','1125.00');
    INSERT INTO attendances(id,lesson_id,child_id,enrollment_id,present,is_trial,charged_lessons) VALUES(1,10,8,7,1,0,'1.00000000');
    INSERT INTO child_enrollments(id,child_id,direction_id,project_id,status,superseded_at) VALUES(9,8,1,2,'finished','2026-01-01');`);
  const query=async(sql,p={})=>{
    if(sql.startsWith('SELECT c.id, c.full_name')) return [[{...f.db.prepare('SELECT * FROM children WHERE id=8').get()}]];
    if(sql.includes('FROM child_enrollments e JOIN directions d ON d.id=e.direction_id JOIN projects')) {
      return [f.db.prepare('SELECT e.*,d.name direction_name FROM child_enrollments e JOIN directions d ON d.id=e.direction_id').all().map(e=>({...e,project_name:'Зебра'}))];
    }
    return f.query(sql,p);
  };
  const connection={query,beginTransaction:async()=>f.db.exec('BEGIN'),commit:async()=>f.db.exec('COMMIT'),rollback:async()=>f.db.exec('ROLLBACK'),release(){}};
  const pool={query,getConnection:async()=>connection};
  const catalog=createMysqlCatalog(pool);
  const financial=()=>JSON.stringify(['payments','refunds','balance_entries','balance_lots','balance_lot_consumptions','price_versions','attendances','group_memberships'].map(table=>f.rows(table)));
  const statuses=()=>f.db.prepare('SELECT status FROM child_enrollments WHERE id IN (7,8) ORDER BY id').all().map(e=>e.status);
  return {...f,catalog,financial,statuses,childStatus:()=>f.db.prepare('SELECT status FROM children WHERE id=8').get().status};
}

for(const [a,b,expected] of [
  ['active','lead','active'],['active','paused','active'],['active','finished','active'],
  ['paused','lead','paused'],['paused','finished','paused'],['lead','finished','lead'],
  ['lead','lead','lead'],['finished','finished','finished'],
]) test(`direction save ${a}/${b} recalculates child to ${expected} without changing the other direction or finances`,async(t)=>{
  const f=fixture(t);f.db.prepare('UPDATE child_enrollments SET status=? WHERE id=8').run(b);
  const before=f.financial();
  await f.catalog.updateEnrollment('7',{status:a},director);
  assert.deepEqual(f.statuses(),[a,b]);assert.equal(f.childStatus(),expected);
  assert.equal(f.financial(),before);assert.equal(f.rows('child_enrollments').find(e=>e.id===9).status,'finished');
});

for(const status of ['lead','active','paused','finished']) test(`one direction: ${status} is the child status after saving`,async(t)=>{
  const f=fixture(t);f.db.exec("UPDATE child_enrollments SET superseded_at='2026-01-01' WHERE id=8");
  await f.catalog.updateEnrollment('7',{status},director);assert.equal(f.childStatus(),status);
});

for(const [status,ids,initial,expected,overall] of [
  ['finished',null,['active','lead'],['finished','finished'],'finished'],
  ['paused',null,['active','finished'],['paused','finished'],'paused'],
  ['paused',null,['lead','paused'],['paused','paused'],'paused'],
  ['active',[7],['paused','finished'],['active','finished'],'active'],
  ['active',[7,8],['paused','finished'],['active','active'],'active'],
  ['lead',[7],['paused','active'],['lead','active'],'active'],
  ['lead',[7,8],['active','finished'],['lead','lead'],'lead'],
]) test(`child ${status}, selection ${ids}: atomic direction changes and preserved history`,async(t)=>{
  const f=fixture(t);initial.forEach((s,i)=>f.db.prepare('UPDATE child_enrollments SET status=? WHERE id=?').run(s,7+i));
  const before=f.financial();
  await f.catalog.changeChildStatus(8,{status,enrollmentIds:ids},director);
  assert.deepEqual(f.statuses(),expected);assert.equal(f.childStatus(),overall);assert.equal(f.financial(),before);
  assert.equal(f.rows('group_memberships')[0].ended_on,'2026-08-31');
  const history=f.rows('enrollment_status_history');
  await f.catalog.changeChildStatus(8,{status,enrollmentIds:ids},director);
  assert.deepEqual(f.rows('enrollment_status_history'),history);assert.equal(f.financial(),before);
});

test('selection and permissions are validated on the backend, including partner project ownership',async(t)=>{
  const f=fixture(t);const before=JSON.stringify(f.rows('child_enrollments'));
  for(const status of ['active','lead']) await assert.rejects(f.catalog.changeChildStatus(8,{status,enrollmentIds:[]},director),{code:'STATUS_SELECTION_REQUIRED'});
  for(const role of ['teacher','parent']) await assert.rejects(f.catalog.changeChildStatus(8,{status:'finished'},{roles:[role],userId:'5'}),{status:403});
  assert.equal(JSON.stringify(f.rows('child_enrollments')),before);
  f.db.exec('UPDATE child_enrollments SET project_id=1 WHERE id=8');
  const partner={roles:['partner'],projectIds:['2'],userId:'2'};
  await assert.rejects(f.catalog.changeChildStatus(8,{status:'active',enrollmentIds:[7,8]},partner),{status:403});
  await f.catalog.changeChildStatus(8,{status:'finished'},partner);
  assert.deepEqual(f.statuses(),['finished','active']);assert.equal(f.childStatus(),'active');
});

test('failure after direction updates rolls back child status, every direction and audit history',async(t)=>{
  const f=fixture(t);const before=JSON.stringify([f.rows('children'),f.rows('child_enrollments')]);
  f.failAt('INSERT INTO child_status_history');
  await assert.rejects(f.catalog.changeChildStatus(8,{status:'paused'},director),/injected/);
  assert.equal(JSON.stringify([f.rows('children'),f.rows('child_enrollments')]),before);
  assert.equal(f.rows('enrollment_status_history').length,0);
});

test('legacy mismatch stays unchanged on reads; manual finish moves real debt into hidden debts',async(t)=>{
  const f=fixture(t);const first=await f.catalog.get('children',8,director);
  assert.equal(first.status,'finished');assert.equal(first.enrollments[0].status,'active');
  const view=child=>[{id:8,status:child.status,enrollments:child.enrollments.map(e=>({id:e.id,status:e.status,balance:e.balanceLessons,hasAttendance:true}))}];
  assert.equal(visibleBalanceRows(view(first))[0].hidden,false);
  const before=f.financial();const saved=await f.catalog.changeChildStatus(8,{status:'finished'},director);
  assert.equal(visibleBalanceRows(view(saved))[0].hidden,true);assert.equal(f.financial(),before);
});

test('new direction accepts lead by default and refreshes the child without changing its other direction',async(t)=>{
  const f=fixture(t);f.db.exec("DELETE FROM child_enrollments WHERE id=8;UPDATE child_enrollments SET status='finished' WHERE id=7");
  const added=await f.catalog.createEnrollment(8,{directionId:2,projectId:2},director);
  assert.equal(added.status,'lead');assert.equal(f.childStatus(),'lead');
  assert.equal(f.db.prepare('SELECT status FROM child_enrollments WHERE id=7').get().status,'finished');
});

test('status-only save preserves pending financial snapshots even with an open membership',async(t)=>{
  const f=fixture(t);f.db.exec("UPDATE group_memberships SET ended_on=NULL;UPDATE child_enrollments SET ended_on='2026-08-31' WHERE id=8");
  const before=f.financial();await f.catalog.updateEnrollment('7',{status:'paused'},director);
  assert.equal(f.financial(),before);assert.equal(f.rows('child_enrollments').find(e=>e.id===8).ended_on,'2026-08-31');
  assert.ok(!f.calls.some(c=>c.sql.startsWith('UPDATE payments')||c.sql.startsWith('UPDATE refunds')));
});

test('manual reactivation respects individual group capacity and never reopens a closed membership',async(t)=>{
  const f=fixture(t);f.db.exec(`ALTER TABLE study_groups ADD COLUMN is_individual INTEGER DEFAULT 1;
    UPDATE child_enrollments SET status='finished' WHERE id=7;
    UPDATE group_memberships SET ended_on=NULL;
    INSERT INTO child_enrollments(id,child_id,direction_id,project_id,status) VALUES(10,99,1,2,'active');
    INSERT INTO group_memberships VALUES(2,10,9,'2026-09-01',NULL);`);
  await assert.rejects(f.catalog.changeChildStatus(8,{status:'active',enrollmentIds:[7]},director),{code:'INDIVIDUAL_GROUP_FULL'});
  assert.equal(f.statuses()[0],'finished');
  f.db.exec("UPDATE group_memberships SET ended_on='2026-08-31' WHERE id=1");const before=f.financial();
  await f.catalog.changeChildStatus(8,{status:'active',enrollmentIds:[7]},director);assert.equal(f.statuses()[0],'active');
  assert.equal(f.financial(),before);
});

test('026 only extends status validation; no backfill or membership/financial mutation',async()=>{
  const sql=await readFile(new URL('../database/migrations/026_enrollment_lead_status.sql',import.meta.url),'utf8');
  assert.match(sql,/chk_child_enrollments_status.*'lead'/s);assert.match(sql,/chk_enrollment_status_history_new.*'lead'/s);
  assert.doesNotMatch(sql,/\b(?:UPDATE|DELETE|INSERT|TRUNCATE)\b/i);
});

test('lead alert uses existing director inbox, stable deduplication, child navigation and no push',async(t)=>{
  const f=fixture(t);
  f.db.exec(`UPDATE child_enrollments SET status='lead' WHERE id=7;
    CREATE TABLE users(id INTEGER,status TEXT,deleted_at TEXT); INSERT INTO users VALUES(1,'active',NULL),(2,'active',NULL);
    CREATE TABLE roles(id INTEGER,code TEXT); INSERT INTO roles VALUES(1,'director'),(2,'teacher');
    CREATE TABLE user_roles(user_id INTEGER,role_id INTEGER); INSERT INTO user_roles VALUES(1,1),(2,2);
    CREATE TABLE notifications(id INTEGER PRIMARY KEY,user_id INTEGER,role_code TEXT,recipient_project_id INTEGER,child_id INTEGER,
      notification_type TEXT,title TEXT,body TEXT,entity_type TEXT,entity_id INTEGER,destination TEXT,dedup_key TEXT,reference_type TEXT,reference_id INTEGER,
      created_at TEXT DEFAULT '2026-10-19 12:00:00',read_at TEXT,dismissed_at TEXT,UNIQUE(user_id,dedup_key));`);
  const query=(sql,p)=>f.query(sql.replace('INSERT IGNORE INTO notifications','INSERT OR IGNORE INTO notifications'),p);
  const events=createNotificationEvents({query});
  assert.equal(await events.leadPaidAttendance({query},{enrollmentId:7}),1);
  assert.equal(await events.leadPaidAttendance({query},{enrollmentId:7}),0,'next paid visit and retries share a stable key');
  f.db.exec('UPDATE attendances SET present=0 WHERE id=1');
  assert.equal(await events.leadPaidAttendance({query},{enrollmentId:7}),0,'cancel/re-mark never creates repeated alerts');
  f.db.exec("UPDATE child_enrollments SET status='active' WHERE id=7");
  assert.equal(await events.leadPaidAttendance({query},{enrollmentId:7}),0);
  f.db.exec(`UPDATE child_enrollments SET status='finished',superseded_at='2026-10-19' WHERE id=7;
    INSERT INTO child_enrollments(id,child_id,direction_id,project_id,status) VALUES(10,8,1,2,'lead');`);
  assert.equal(await events.leadPaidAttendance({query},{enrollmentId:10}),0,'replacement enrollment does not duplicate the same child direction alert');
  assert.equal(f.rows('notifications').length,1);assert.equal(f.rows('notifications')[0].user_id,1);
  assert.equal(f.rows('notifications')[0].destination,'child');assert.equal(f.rows('notifications')[0].entity_id,8);
  assert.match(f.rows('notifications')[0].body,/Робототехника/);
  assert.ok(!f.calls.some(c=>/push_deliveries|web_push_subscriptions|user_notification_settings/.test(c.sql)));
  const inbox=createNotifications({query},{releaseNotes:{ensureNotification:async()=>{}}});
  assert.equal((await inbox.list(director)).length,1);
  assert.equal((await inbox.list({roles:['teacher'],teacherId:'2',userId:'2'})).length,0);
  await assert.rejects(inbox.list({roles:['parent'],userId:'3'}),{status:403});
});

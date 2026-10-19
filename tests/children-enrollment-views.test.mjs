import test from 'node:test';
import assert from 'node:assert/strict';
import { currentEnrollments, unfinishedEnrollments, childListStatus, directionStatus, visibleBalanceRows, groupEnrollments } from '../src/frontend/quick-status.mjs';
import { calculateDashboardMetrics } from '../src/frontend/dashboard-ui.mjs';
import { createMysqlCatalog } from '../backend/src/catalog.mjs';
import { financeFixture } from './helpers/finance-sql-fixture.mjs';

const enrollment = (id, directionId, status = 'Активный', balance = 0, extra = {}) => ({ id, directionId,
  direction: directionId === 1 ? 'Робототехника' : 'Программирование', status, balance, projectId: 1, project: 'iCubeRobots', ...extra });
for (const [statuses, visible, status] of [
  [['Активный'], 1, 'Активный'], [['Активный','Активный'], 2, 'Активный'],
  [['Активный','Закончил'], 1, 'Активный'], [['Пауза','Активный'], 2, 'Активный'],
  [['Закончил','Закончил'], 0, 'Закончил'],
]) test(`block3 current directions ${statuses.join('/')}: separate states, unchanged history`, () => {
  const child = { id: 1, status: 'Активный', enrollments: statuses.map((s, i) => enrollment(i + 1, i + 1, s)) };
  const before = JSON.stringify(child);
  assert.equal(unfinishedEnrollments(child).length, visible); assert.equal(childListStatus(child), child.status, 'legacy general status is not synthesized on read');
  assert.equal(JSON.stringify(child), before);
});

test('block3 active directions count separate directions, not children, histories or memberships', () => {
  const children = [
    { id: 1, status: 'Активный', enrollments: [enrollment(1,1), enrollment(2,2), enrollment(1,1), enrollment(3,1,'Активный',0,{supersededAt:'2026-09-01'})] },
    { id: 2, status: 'Активный', enrollments: [enrollment(4,1)] },
    { id: 3, status: 'Активный', enrollments: [enrollment(5,2,'Пауза')] },
    { id: 4, status: 'Активный', enrollments: [enrollment(6,1,'Закончил')] },
    { id: 5, status: 'Лид', enrollments: [enrollment(7,2,'Лид')] },
  ];
  const before = JSON.stringify(children);
  const metrics = calculateDashboardMetrics({ children, projects: [{id:1,name:'iCubeRobots'},{id:2,name:'Зебра'}] });
  assert.equal(metrics.activeChildren, 3); assert.equal(metrics.projects[0].activeChildren, 3);
  children[0].enrollments[1].projectId = 2;
  const own = calculateDashboardMetrics({ children }, { projectIds: [2] }); assert.equal(own.activeChildren, 1);
  children[0].enrollments[1].projectId = 1; assert.equal(JSON.stringify(children), before);
});

test('block3 main balance eligibility uses direction status and actual visits', () => {
  const data = [
    ['Активный',-1,false,true,false], ['Активный',0,true,true,false], ['Активный',0,false,false,false],
    ['Лид',0,true,true,false], ['Лид',0,false,false,false], ['Лид',1,false,false,false],
    ['Пауза',2,true,false,false], ['Пауза',-2,false,true,true], ['Закончил',-1,false,true,true],
  ];
  for (const [status,balance,visited,visible,hidden] of data) {
    const child = { id: 1, status: status === 'Лид' ? 'Лид' : 'Активный', enrollments: [enrollment(1,1,status,balance,{hasAttendance:visited})] };
    const before=JSON.stringify(child); const rows=visibleBalanceRows([child]);
    assert.equal(rows.length, Number(visible), `${status}/${balance}/${visited}`);
    if (visible) assert.equal(rows[0].hidden, hidden);
    assert.equal(JSON.stringify(child),before);
  }
});

test('block3 hidden debts remain two directions of one child and use explicit project ownership', () => {
  const child = {id:8,status:'Закончил',enrollments:[enrollment(1,1,'Закончил',-2,{groupId:999}),
    enrollment(2,2,'Пауза',-1,{projectId:2,project:'Зебра',groupId:null})]};
  assert.equal(visibleBalanceRows([child]).filter(r=>r.hidden).length,2);
  assert.deepEqual(visibleBalanceRows([child],'iCubeRobots').map(r=>r.e.id),[1]);
  assert.deepEqual(visibleBalanceRows([child],'Зебра').map(r=>r.e.id),[2]);
  assert.equal(visibleBalanceRows([{...child,enrollments:[enrollment(3,1,'Пауза',-1,{projectId:null,project:null})]}],'Зебра').length,0);
  child.enrollments[0].status='Активный';
  assert.equal(visibleBalanceRows([child]).filter(r=>r.hidden).length,1);
  assert.equal(visibleBalanceRows([child]).filter(r=>!r.hidden).length,1);
});

test('block3 group state follows effective membership and enrollment, not another direction or child-wide status', () => {
  const child={status:'Пауза',enrollments:[enrollment(1,1,'Закончил',-2,{groupId:10}),
    enrollment(2,2,'Активный',1,{groupId:20,effectiveGroupId:10})]};
  assert.deepEqual(groupEnrollments(child,10).map(e=>e.id),[2]);
  assert.equal(directionStatus(child,child.enrollments[1]),'Активный');
  assert.equal(groupEnrollments(child,20).length,0);
  child.enrollments[1].effectiveGroupId=null; assert.equal(groupEnrollments(child,20).length,0);
  assert.equal(currentEnrollments(child).length,2);
});

function catalogFixture(t) {
  const f=financeFixture(t);
  f.db.exec(`ALTER TABLE child_enrollments ADD COLUMN status TEXT DEFAULT 'active';
    ALTER TABLE child_enrollments ADD COLUMN started_on TEXT DEFAULT '2026-01-01';
    ALTER TABLE child_enrollments ADD COLUMN ended_on TEXT;
    ALTER TABLE study_groups ADD COLUMN name TEXT;
    ALTER TABLE study_groups ADD COLUMN weekday INTEGER;
    ALTER TABLE study_groups ADD COLUMN start_time TEXT;
    ALTER TABLE study_groups ADD COLUMN site_id INTEGER;
    CREATE TABLE projects(id INTEGER,name TEXT); INSERT INTO projects VALUES(1,'iCubeRobots'),(2,'Зебра');
    CREATE TABLE sites(id INTEGER,name TEXT);
    CREATE TABLE teacher_projects(teacher_id INTEGER,project_id INTEGER,active INTEGER);
    CREATE TABLE teacher_project_directions(teacher_id INTEGER,project_id INTEGER,direction_id INTEGER);
    CREATE TABLE lessons(id INTEGER,deleted_at TEXT,is_mixed_snapshot INTEGER,direction_id_snapshot INTEGER,project_id_snapshot INTEGER);
    INSERT INTO lessons VALUES(10,NULL,0,1,2),(11,'2026-09-01',0,1,2);
    UPDATE study_groups SET name='Текущая группа' WHERE id=9;
    INSERT INTO study_groups(id,name) VALUES(10,'Историческая группа');
    INSERT INTO child_enrollments(id,child_id,direction_id,project_id,status,superseded_at)
      VALUES(9,8,1,2,'finished','2026-09-01'),(10,8,2,1,'finished','2026-09-01');
    INSERT INTO group_memberships VALUES(2,9,10,'2026-01-01','2026-08-31');`);
  const query=async(sql,p)=>sql.startsWith('SELECT c.id, c.full_name')?[[{id:8,full_name:'Ребёнок',status:'active'}]]:
    f.query(sql.replace(/JSON_ARRAYAGG\(/g,'json_group_array('),p);
  return {...f,catalog:createMysqlCatalog({query})};
}
test('block3 backend uses pinned historical direction visits, counts trial presence, excludes absence and deleted lessons', async(t)=>{
  const f=catalogFixture(t);
  f.db.exec(`INSERT INTO attendances(id,lesson_id,child_id,enrollment_id,present,is_trial,charged_lessons)
    VALUES(1,10,8,9,1,1,'0.00000000'),(2,10,8,8,0,0,'0.00000000'),(3,11,8,8,1,0,'1.00000000');`);
  const before=f.rows('attendances');
  const [child]=await f.catalog.list('children',{roles:['director']});
  assert.equal(child.enrollments.find(e=>e.id==='7').hasAttendance,true);
  assert.equal(child.enrollments.find(e=>e.id==='8').hasAttendance,false);
  assert.equal(child.enrollments.length,2); assert.equal(child.enrollmentHistory.length,2);
  assert.equal(child.enrollmentHistory[0].editable,false);
  assert.equal(child.enrollmentHistory[0].groupHistory[0].groupName,'Историческая группа');
  assert.equal(child.enrollments[0].groupHistory[0].groupName,'Текущая группа');
  assert.deepEqual(f.rows('attendances'),before);
  assert.ok(f.calls.every(c=>c.sql.startsWith('SELECT')));
});
test('block3 partner receives historical enrollment only within its project',async(t)=>{
  const f=catalogFixture(t);
  f.db.exec('UPDATE child_enrollments SET project_id=1 WHERE id=8');
  const [child]=await f.catalog.list('children',{roles:['partner'],projectIds:['2']});
  assert.deepEqual(child.enrollmentHistory.map(e=>e.id),['9']);
  assert.equal(child.enrollmentHistory[0].projectId,'2');
  const foreign=child.enrollments.find(e=>e.projectId==='1');
  assert.equal(foreign.balanceLessons,undefined); assert.equal(foreign.groupHistory,undefined);
  assert.equal(foreign.hasAttendance,undefined); assert.equal(foreign.editable,false);
});

test('block3 legacy unpinned trial uses explicit ordinary lesson snapshots, never guesses a mixed direction or project',async(t)=>{
  const f=catalogFixture(t);
  f.db.exec(`INSERT INTO lessons VALUES(12,NULL,1,2,2),(13,NULL,0,2,1);
    INSERT INTO attendances(id,lesson_id,child_id,enrollment_id,present,is_trial,charged_lessons)
      VALUES(1,10,8,NULL,1,1,'0.00000000'),(2,12,8,NULL,1,1,'0.00000000'),(3,13,8,NULL,1,1,'0.00000000');`);
  const before=f.rows('attendances');
  const [child]=await f.catalog.list('children',{roles:['director']});
  assert.equal(child.enrollments.find(e=>e.id==='7').hasAttendance,true);
  assert.equal(child.enrollments.find(e=>e.id==='8').hasAttendance,false);
  assert.deepEqual(f.rows('attendances'),before);
  assert.equal(f.rows('balance_entries').length,0); assert.equal(f.rows('payments').length,0);
});

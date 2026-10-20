import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStatistics } from '../backend/src/statistics.mjs';
import { createApiRouter } from '../backend/src/routes.mjs';
import { statisticsFixture } from './helpers/statistics-fixture.mjs';

test('completed lessons and ordinary visits/absences include extras, exclude trials and deduplicate mixed lessons', async (t) => {
  const f = statisticsFixture(t); for (let id=1;id<=5;id++) f.child(id);
  f.lesson(1,'2026-09-01',{mixed:true}); f.lesson(2,'2026-09-02');
  f.visit(1,1); f.visit(1,2,{present:false}); f.visit(1,3,{trial:true});
  f.visit(2,4,{type:'extra'}); f.visit(2,5,{type:'extra',present:false});
  const result=await f.get();assert.deepEqual([result.summary.completedLessons,result.summary.visits,result.summary.absences,result.summary.attendancePercent],[2,2,1,'66.7']);
});

test('completed main roster without a checked presence is absent, including cleared/missing attendance rows',async(t)=>{
  const f=statisticsFixture(t);f.child(1);f.child(2);f.lesson(1,'2026-09-01');
  f.visit(1,1,{present:false,marked:false});f.db.exec("INSERT INTO lesson_roster_members(lesson_id,child_id,roster_type) VALUES(1,2,'main')");
  const result=await f.get();assert.equal(result.summary.absences,2);assert.equal(result.summary.unmarked,0);assert.equal(result.groups[0].completedLessons,1);
});

test('new records use unique child creation dates, never first paid visits or second enrollments',async(t)=>{
  const f=statisticsFixture(t);f.child(1,{created:'2026-09-10 12:00:00',directions:[1,2]});f.child(2,{created:'2026-09-12 12:00:00',directions:[]});f.child(3);
  f.lesson(1,'2026-09-01');f.visit(1,3);
  const result=await f.get();assert.equal(result.summary.newChildren,2);assert.equal(result.groups[0].newChildren,0);
  assert.equal(result.monthly.find((m)=>m.month==='2026-09').newChildren,2);
});

test('current unique children include groupless/finished cards; active directions and dual children stay separate from dates',async(t)=>{
  const f=statisticsFixture(t);f.child(1,{directions:[1,2]});f.child(2,{status:'lead'});f.child(3,{status:'paused'});f.child(4,{status:'finished'});f.child(5,{status:'finished',directions:[]});
  f.child(6);f.db.exec("UPDATE children SET deleted_at='2026-09-01' WHERE id=6");
  const result=await f.get();assert.deepEqual(result.current.children,{total:5,active:1,lead:1,paused:1,finished:2});
  assert.equal(result.current.activeDirections.total,2);assert.equal(result.current.activeDirections.dualChildren,1);
  assert.deepEqual((await f.get({from:'2026-01-01',to:'2026-01-31'})).current,result.current);
  const robot=await f.get({directionId:'1'});assert.equal(robot.current.children.total,4);assert.equal(robot.current.activeDirections.total,1);
});

test('period departures restore past states; pause then return and finishing one of two active directions do not count as club exits',async(t)=>{
  const f=statisticsFixture(t);f.child(1);f.child(2);f.child(3,{directions:[1,2]});f.child(4);
  f.change(11,'active','paused','2026-09-05 10:00:00');f.change(11,'paused','active','2026-09-10 10:00:00');
  f.change(21,'active','paused','2026-09-05 10:00:00');f.change(21,'paused','active','2026-10-01 10:00:00');
  f.change(31,'active','finished','2026-09-06 10:00:00');f.change(41,'active','finished','2026-09-07 10:00:00');
  const result=await f.get();assert.equal(result.summary.pausedChildren,1);assert.equal(result.summary.finishedChildren,1);
  assert.equal(result.current.children.active,3);assert.equal(result.monthly.find((m)=>m.month==='2026-09').pausedChildren,1);
  assert.equal(result.monthly.find((m)=>m.month==='2026-10').pausedChildren,0);
  assert.equal(result.groups[0].finishedChildren,2,'group tracks the corresponding enrollment, unlike club totals');
});

test('same-timestamp status changes use their durable order and future changes do not rewrite a past end state',async(t)=>{
  const f=statisticsFixture(t);f.child(1);f.change(11,'active','paused','2026-09-30 23:59:59');f.change(11,'paused','active','2026-09-30 23:59:59');
  assert.equal((await f.get()).summary.pausedChildren,0);
  f.change(11,'active','paused','2026-10-20 12:00:00');f.change(11,'paused','active','2026-10-21 12:00:00');
  assert.equal((await f.get({from:'2026-10-01',to:'2026-10-31'})).summary.pausedChildren,1,'observation stops at actual current time');
});

test('historical occupancy averages completed lessons, uses real main membership/status and admits a lead only after an ordinary paid visit',async(t)=>{
  const f=statisticsFixture(t);for(const [id,status] of [[1,'active'],[2,'lead'],[3,'paused'],[4,'lead']])f.child(id,{status});
  f.db.exec("INSERT INTO group_memberships VALUES(1,11,9,'2026-01-01',NULL),(2,21,9,'2026-01-01',NULL),(3,31,9,'2026-01-01',NULL),(4,41,9,'2026-01-01',NULL)");
  f.lesson(1,'2026-09-01');f.lesson(2,'2026-09-10');f.visit(1,2,{trial:true});f.visit(2,2);f.visit(1,4,{trial:true});
  const result=await f.get();assert.equal(result.summary.averageOccupancyPercent,'18.8','12.5% before paid visit, 25% afterward');
  assert.equal(result.current.children.lead,2,'analytics never changes the lead status');assert.equal(result.summary.estimatedCapacity,true);
  f.db.exec("UPDATE child_enrollments SET status='active' WHERE id=31");f.change(31,'paused','active','2026-10-01 10:00:00');
  assert.equal((await f.get()).summary.averageOccupancyPercent,'18.8','October activation never backfills September');
});

test('individual lesson snapshot uses one place, makeups do not inflate main occupancy, and empty periods have no occupancy',async(t)=>{
  const f=statisticsFixture(t);f.child(1);f.child(2);f.db.exec("UPDATE study_groups SET is_individual=1 WHERE id=9; INSERT INTO group_memberships VALUES(1,11,9,'2026-01-01',NULL)");
  f.lesson(1,'2026-09-01',{mode:'attendance_share'});f.visit(1,1);f.visit(1,2,{type:'extra'});
  const result=await f.get();assert.equal(result.groups[0].capacity,1);assert.equal(result.summary.averageOccupancyPercent,'100.0');assert.equal(result.summary.visits,2);assert.equal(result.summary.estimatedCapacity,false);
  assert.equal((await f.get({from:'2026-08-01',to:'2026-08-31'})).summary.averageOccupancyPercent,null);
});

test('unknown historical statuses are reported and excluded, never replaced by today’s active status',async(t)=>{
  const f=statisticsFixture(t);f.child(1);f.db.exec("UPDATE child_enrollments SET updated_at='2026-10-01 00:00:00' WHERE id=11; INSERT INTO group_memberships VALUES(1,11,9,'2026-01-01',NULL)");
  f.lesson(1,'2026-09-01');const result=await f.get();assert.equal(result.current.children.active,1);assert.equal(result.summary.averageOccupancyPercent,null);assert.equal(result.limitations.unknownOccupancyLessons,1);
});

test('first actual trial per child/direction defines 30-day conversion across month boundaries; payments alone and repeated trials do not convert',async(t)=>{
  const f=statisticsFixture(t);for(let id=1;id<=4;id++)f.child(id);
  f.lesson(1,'2026-09-29');for(let id=1;id<=3;id++)f.visit(1,id,{trial:true});f.visit(1,4,{trial:true,present:false});
  f.lesson(2,'2026-10-03');f.visit(2,1);f.visit(2,2,{trial:true});
  f.db.exec("INSERT INTO payments(enrollment_id,child_id,direction_id,project_id_snapshot,paid_on,amount,method) VALUES(21,2,1,2,'2026-09-29','4500.00','cashless')");
  const result=await f.get();assert.deepEqual([result.recruitment.trials,result.recruitment.continued,result.recruitment.pending,result.recruitment.notContinued,result.recruitment.conversionPercent],[3,1,2,0,'100.0']);
  assert.equal((await f.get({from:'2026-10-01',to:'2026-10-31'})).recruitment.trials,0);
});

test('unresolved cohorts exclude pending outcomes from conversion; an ordinary visit on day 31 is too late',async(t)=>{
  const f=statisticsFixture(t);f.child(1);f.child(2);f.child(3);f.lesson(1,'2026-09-01');f.visit(1,1,{trial:true});f.visit(1,2,{trial:true});
  f.lesson(2,'2026-09-30');f.visit(2,1);f.visit(2,3,{trial:true});f.lesson(3,'2026-10-02');f.visit(3,2);
  const result=await f.get();assert.deepEqual([result.recruitment.continued,result.recruitment.notContinued,result.recruitment.pending,result.recruitment.conversionPercent],[1,1,1,'50.0']);
});

test('a child trying two directions stays unique at club level; another direction does not convert the original direction/group',async(t)=>{
  const f=statisticsFixture(t);f.child(1,{directions:[1,2]});f.lesson(1,'2026-09-01');f.visit(1,1,{trial:true});f.lesson(2,'2026-09-02',{group:99});f.visit(2,1,{trial:true,direction:2});
  f.lesson(3,'2026-09-03',{group:99});f.visit(3,1,{direction:2});const result=await f.get();
  assert.equal(result.recruitment.trials,1);assert.equal(result.recruitment.directionCases,2);assert.equal(result.recruitment.continued,1);
  assert.equal(result.recruitment.directions.find((d)=>d.id==='1').continued,0);assert.equal(result.groups.find((g)=>g.id==='9').continued,0);
  assert.equal((await f.get({directionId:'1'})).recruitment.continued,0);
});

test('monthly received amounts use payment snapshots and actual refund date; transfer ledger is never revenue',async(t)=>{
  const f=statisticsFixture(t);f.child(1);f.db.exec("INSERT INTO payments(child_id,enrollment_id,direction_id,project_id_snapshot,paid_on,amount,method) VALUES(1,11,1,2,'2026-09-15','4500.00','cashless'),(1,11,1,2,'2026-09-15','100.00','cash'),(1,11,1,3,'2026-09-16','300.00','cash'); INSERT INTO refunds(child_id,enrollment_id,direction_id,project_id_snapshot,refunded_on,amount) VALUES(1,11,1,2,'2026-10-01','1125.00'); INSERT INTO balance_entries(enrollment_id,entry_type,amount_delta,lessons_delta) VALUES(11,'transfer_in','9000.00','8.00000000')");
  const result=await f.get();const september=result.monthly.find((m)=>m.month==='2026-09'),october=result.monthly.find((m)=>m.month==='2026-10');
  assert.equal(september.received,'4900.00');assert.equal(september.refunds,'0.00');assert.equal(october.received,'0.00');assert.equal(october.refunds,'1125.00');assert.equal(october.net,'-1125.00');
  assert.deepEqual(september.projects.map((p)=>[p.id,p.cash,p.cashless]),[['2','100.00','4500.00'],['3','300.00','0.00']]);
  assert.equal((await f.get({projectId:'3'})).monthly.find((m)=>m.month==='2026-09').received,'300.00');
});

test('historical attendance corrections refresh analytics and preserve read-only accounting',async(t)=>{
  const f=statisticsFixture(t,{keepFinancialSeed:true});f.seedVisit();const params={from:'2026-10-01',to:'2026-10-31',directionId:'1'};
  assert.equal((await f.get(params)).summary.visits,1);await f.correct(f.body({target:11}));
  assert.equal((await f.get(params)).summary.visits,0);const changes=f.db.prepare('SELECT total_changes() n').get().n;
  const code=await f.get({...params,directionId:'2'});assert.equal(code.summary.visits,1);assert.equal(f.db.prepare('SELECT total_changes() n').get().n,changes);
  assert.ok(f.calls.every(({sql})=>/^(SELECT|WITH)/.test(sql)));assert.equal(f.balance(7),0);assert.equal(f.balance(8),-1);
});

test('SQL excludes unfinished/cancelled/deleted lessons, uses a fixed bulk query count and respects snapshots/filters',async(t)=>{
  const f=statisticsFixture(t);f.child(1);for(const [id,status]of [[1,'completed'],[2,'in_progress'],[3,'cancelled'],[4,'scheduled']]){f.lesson(id,'2026-09-01',{status});f.visit(id,1);}
  f.lesson(5,'2026-09-01');f.visit(5,1);f.db.exec("UPDATE lessons SET deleted_at='2026-09-02' WHERE id=5");
  const result=await f.get();assert.equal(result.summary.completedLessons,1);assert.equal(result.summary.visits,1);assert.equal(f.calls.length,8);
  assert.equal((await f.get({projectId:'3'})).summary.completedLessons,0);
});

for(const role of ['partner','teacher','parent'])test(`${role} cannot obtain statistics or financial chart data via the service or API`,async(t)=>{
  const f=statisticsFixture(t);await assert.rejects(f.get({}, {roles:[role],projectIds:['2']}),{code:'FORBIDDEN'});assert.equal(f.calls.length,0);
  const router=createApiRouter(f.pool,{statistics:f.service,testAuth(req,_res,next){req.auth={roles:[role],userId:'1',projectIds:['2']};next();}});
  const response=await new Promise((resolve,reject)=>router.handle({method:'GET',url:'/statistics',query:{from:'2026-09-01',to:'2026-09-30'}},{status(code){this.code=code;return this;},json(body){resolve({code:this.code,body});}},reject));
  assert.equal(response.code,403);assert.equal(f.calls.length,0);
});

test('director sees all projects and default chart contains twelve calendar months including current month',async(t)=>{
  const f=statisticsFixture(t);const result=await f.service.get({from:'2026-09-01',to:'2026-09-30'},f.director);
  assert.equal(result.monthly.length,12);assert.equal(result.monthly[0].month,'2025-11');assert.equal(result.monthly.at(-1).month,'2026-10');
  await assert.rejects(f.get({from:'2026-09-31'}),{code:'VALIDATION_ERROR'});await assert.rejects(f.get({chartFrom:'2020-01-01'}),{code:'VALIDATION_ERROR'});
});

test('mixed main membership counts a child once even with two enrollments and different statuses',async(t)=>{
  const f=statisticsFixture(t);f.child(1,{directions:[1,2]});f.db.exec("UPDATE study_groups SET is_mixed=1 WHERE id=9; UPDATE child_enrollments SET status='paused' WHERE id=12; INSERT INTO group_memberships VALUES(1,11,9,'2026-01-01',NULL),(2,12,9,'2026-01-01',NULL)");
  f.lesson(1,'2026-09-01',{mixed:true});f.visit(1,1);const result=await f.get();
  assert.equal(result.summary.completedLessons,1);assert.equal(result.summary.averageOccupancyPercent,'12.5');assert.equal(result.groups[0].currentMembers,1);
});

test('current composition may exceed the norm but is never used as historical average occupancy',async(t)=>{
  const f=statisticsFixture(t);for(let id=1;id<=9;id++){f.child(id);f.db.prepare("INSERT INTO group_memberships(id,enrollment_id,group_id,started_on) VALUES(?,?,?,'2026-10-01')").run(id,id*10+1,id<=6?9:99);}
  f.lesson(1,'2026-09-01');const result=await f.get();assert.equal(result.groups.find((g)=>g.id==='9').currentMembers,6);assert.equal(result.summary.averageOccupancyPercent,'0.0');
  f.db.exec('UPDATE group_memberships SET group_id=9');const later=await f.get();assert.equal(later.groups.find((g)=>g.id==='9').occupancyPercent,'112.5');assert.equal(later.summary.averageOccupancyPercent,'0.0');
});

test('day 30 is inclusive for continuation and pending observations, day 31 without a visit is failure',async(t)=>{
  const f=statisticsFixture(t);for(let id=1;id<=3;id++)f.child(id);f.lesson(1,'2026-09-20');f.visit(1,1,{trial:true});f.visit(1,2,{trial:true});f.lesson(2,'2026-09-19');f.visit(2,3,{trial:true});
  f.lesson(3,'2026-10-20');f.visit(3,1);const result=await f.get();assert.deepEqual([result.recruitment.continued,result.recruitment.pending,result.recruitment.notContinued],[1,1,1]);
});

test('a mixed group cohort deduplicates a child trying two directions in the same group',async(t)=>{
  const f=statisticsFixture(t);f.child(1,{directions:[1,2]});f.lesson(1,'2026-09-01',{mixed:true});f.visit(1,1,{trial:true});f.lesson(2,'2026-09-02',{mixed:true});f.visit(2,1,{trial:true,direction:2});
  const result=await f.get();assert.equal(result.recruitment.directionCases,2);assert.equal(result.groups[0].trials,1);
});

test('past project snapshots survive subsequent group project changes/deletion without exposing a foreign current roster',async(t)=>{
  const f=statisticsFixture(t);f.child(1);f.lesson(1,'2026-09-01');f.visit(1,1);f.db.exec("UPDATE study_groups SET project_id=3,deleted_at='2026-10-01' WHERE id=9");
  const result=await f.get({projectId:'2'});assert.equal(result.summary.visits,1);assert.equal(result.summary.completedLessons,1);assert.equal(result.groups[0].projectId,'2');assert.equal(result.groups[0].projectName,'iCubeRobots');assert.equal(result.groups[0].currentMembers,0);
});

test('new group attribution uses an actual creation lesson, not an arbitrary current enrollment',async(t)=>{
  const f=statisticsFixture(t);f.child(1,{created:'2026-09-10 10:00:00'});f.child(2,{created:'2026-09-10 10:00:00'});f.lesson(1,'2026-09-10');f.db.exec('UPDATE children SET created_from_lesson_id=1 WHERE id=1');
  const result=await f.get();assert.equal(result.summary.newChildren,2);assert.equal(result.groups[0].newChildren,1);
});

test('mixed attendance filters use its pinned direction and never guess a missing pin from the lesson snapshot',async(t)=>{
  const f=statisticsFixture(t);f.child(1,{directions:[1,2]});f.lesson(1,'2026-09-01',{mixed:true});f.visit(1,1,{direction:2});
  assert.equal((await f.get({directionId:'2'})).summary.visits,1);assert.equal((await f.get({directionId:'1'})).summary.visits,0);
  f.db.exec('UPDATE attendances SET enrollment_id=NULL');assert.equal((await f.get({directionId:'1'})).summary.visits,0);assert.equal((await f.get()).summary.visits,1);
});

test('closing one direction while another remains a lead does not turn the overall lead into a finished child',async(t)=>{
  const f=statisticsFixture(t);f.child(1,{directions:[1,2]});f.db.exec("UPDATE child_enrollments SET status='lead' WHERE id=12");f.change(11,'active','finished','2026-09-10 10:00:00');
  const result=await f.get();assert.equal(result.current.children.lead,1);assert.equal(result.summary.finishedChildren,0);assert.equal(result.summary.pausedChildren,0);
});

test('regression: 43 unchecked main children are automatic absences after completion, without marked_at or any data rewrite',async(t)=>{
  const f=statisticsFixture(t);f.lesson(1,'2026-10-10');
  for(let id=1;id<=44;id++){f.child(id);f.visit(1,id,{present:id===1,marked:id===1});}
  const before=f.snapshot();const changes=f.db.prepare('SELECT total_changes() n').get().n;
  const result=await f.get({from:'2026-10-01',to:'2026-10-31'});
  assert.deepEqual([result.summary.visits,result.summary.absences,result.summary.unmarked,result.summary.attendancePercent],[1,43,0,'2.3']);
  assert.equal(result.groups[0].absences,43);assert.equal(result.limitations.unmarkedAttendances,0);
  assert.equal(f.db.prepare('SELECT total_changes() n').get().n,changes);assert.equal(f.snapshot(),before);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM attendances WHERE present=0 AND marked_at IS NULL').get().n,43);
});

test('trials, introductory lessons and unchecked extras stay outside ordinary absences; mixed directions retain their own attendance',async(t)=>{
  const f=statisticsFixture(t);for(let id=1;id<=5;id++)f.child(id,{directions:[1,2]});
  f.lesson(1,'2026-10-10',{mixed:true});f.visit(1,1,{direction:1,present:false,marked:false});f.visit(1,2,{direction:2,present:false,marked:false});
  f.visit(1,3,{trial:true,present:false,marked:false});f.visit(1,4,{type:'extra',present:false,marked:false});f.visit(1,5,{type:'extra',direction:2});
  f.lesson(2,'2026-10-11');f.visit(2,1,{present:false,marked:false});f.db.exec('UPDATE lessons SET is_intro_group=1 WHERE id=2');
  const params={from:'2026-10-01',to:'2026-10-31'};const result=await f.get(params);
  assert.equal(result.summary.absences,2);assert.equal(result.summary.visits,1);
  assert.equal((await f.get({...params,directionId:'1'})).summary.absences,1);
  const code=await f.get({...params,directionId:'2'});assert.equal(code.summary.absences,1);assert.equal(code.summary.visits,1);
});

test('an absent mixed main roster row without attendance uses only unambiguous historical membership, never a current group or guessed direction',async(t)=>{
  const f=statisticsFixture(t);f.child(1,{directions:[1,2]});f.lesson(1,'2026-09-10',{mixed:true});
  f.db.exec("INSERT INTO lesson_roster_members(lesson_id,child_id,roster_type) VALUES(1,1,'main'); INSERT INTO group_memberships VALUES(1,12,9,'2026-01-01','2026-09-30'),(2,11,99,'2026-10-01',NULL)");
  assert.equal((await f.get({directionId:'2'})).summary.absences,1);assert.equal((await f.get({directionId:'1'})).summary.absences,0);
  f.db.exec("INSERT INTO group_memberships VALUES(3,11,9,'2026-01-01','2026-09-30')");
  const ambiguous=await f.get();assert.equal(ambiguous.summary.absences,1);assert.equal(ambiguous.limitations.unresolvedAttendanceDirections,1);
  assert.equal((await f.get({directionId:'1'})).summary.absences,0);assert.equal((await f.get({directionId:'2'})).summary.absences,0);
});

test('actual historical move and removal leave final main absence and no extra absence, with no duplicate visits',async(t)=>{
  const f=statisticsFixture(t,{keepFinancialSeed:true});f.seedVisit();const params={from:'2026-10-01',to:'2026-10-31'};
  await f.correct(f.body({target:11}));let result=await f.get(params);
  assert.deepEqual([result.summary.visits,result.summary.absences],[1,1]);
  assert.equal(f.db.prepare('SELECT present FROM attendances WHERE lesson_id=10').get().present,0);
  await f.lessons.removeAttendance('11','8',f.context);result=await f.get(params);
  assert.deepEqual([result.summary.visits,result.summary.absences],[0,1]);
  assert.equal(f.db.prepare('SELECT present FROM attendances WHERE lesson_id=11').get().present,0);assert.equal(f.balance(7),0);assert.equal(f.balance(8),0);
});

test('server business clock caps a full current month, future completed lessons, same-day future visits and future money',async(t)=>{
  const f=statisticsFixture(t);f.child(1);f.child(2,{created:'2026-10-20 13:00:00'});f.child(3,{created:'2026-10-21 10:00:00'});
  f.lesson(1,'2026-10-19');f.visit(1,1,{trial:true});f.lesson(2,'2026-10-20');f.visit(2,1);
  f.lesson(3,'2026-10-20');f.visit(3,1);f.db.exec("UPDATE lessons SET starts_at='2026-10-20 13:00:00' WHERE id=3");
  f.lesson(4,'2026-10-21');f.visit(4,1);
  f.db.exec("INSERT INTO payments(child_id,enrollment_id,direction_id,project_id_snapshot,paid_on,amount,method) VALUES(1,11,1,2,'2026-10-20','100.00','cash'),(1,11,1,2,'2026-10-21','900.00','cash'); INSERT INTO refunds(child_id,enrollment_id,direction_id,project_id_snapshot,refunded_on,amount) VALUES(1,11,1,2,'2026-10-20','10.00'),(1,11,1,2,'2026-10-21','90.00')");
  const result=await f.get({from:'2026-10-01',to:'2026-10-31'});
  assert.equal(result.observedAt,'2026-10-20 12:00:00.000000');assert.equal(result.period.to,'2026-10-31');assert.equal(result.period.effectiveTo,'2026-10-20');
  assert.deepEqual([result.summary.completedLessons,result.summary.visits,result.summary.newChildren],[2,1,0]);
  const month=result.monthly.find((m)=>m.month==='2026-10');assert.equal(month.received,'100.00');assert.equal(month.refunds,'10.00');assert.equal(result.chartPeriod.effectiveTo,'2026-10-20');
  const future=await f.get({from:'2026-10-21',to:'2026-10-31'});assert.equal(future.summary.completedLessons,0);assert.equal(future.recruitment.trials,0);assert.equal(future.summary.newChildren,0);
  assert.equal((await f.get()).period.effectiveTo,'2026-09-30');
});

test('future paid visits cannot prematurely convert a trial cohort',async(t)=>{
  const f=statisticsFixture(t);f.child(1);f.lesson(1,'2026-10-19');f.visit(1,1,{trial:true});f.lesson(2,'2026-10-21');f.visit(2,1);
  const result=await f.get({from:'2026-10-01',to:'2026-10-31'});assert.equal(result.recruitment.pending,1);assert.equal(result.recruitment.continued,0);
});

test('effective observation date follows the existing CRM timezone across a UTC date boundary',async()=>{
  const captured=[];const service=createStatistics({async query(_sql,params){captured.push(params);return [[]];}},{now:()=>new Date('2026-10-20T19:30:00Z')});
  const result=await service.get({from:'2026-10-01',to:'2026-10-31'},{roles:['director']});
  assert.equal(result.period.effectiveTo,'2026-10-21');assert.equal(result.observedAt,'2026-10-21 06:30:00.000000');assert.ok(captured.every((p)=>p.today==='2026-10-21'));
});

test('48 financially updated enrollments have a provable status after their last update without inventing earlier history',async(t)=>{
  const f=statisticsFixture(t);for(let id=1;id<=48;id++)f.child(id);
  f.db.exec("UPDATE child_enrollments SET updated_at='2026-10-15 10:00:00'");
  assert.equal((await f.get({from:'2026-10-01',to:'2026-10-31'})).limitations.unknownStatusChildren,0);
  assert.equal((await f.get()).limitations.unknownStatusChildren,48,'October status cannot prove September');
  assert.equal((await f.get({from:'2026-10-01',to:'2026-10-31',projectId:'3'})).limitations.unknownStatusChildren,0);
});

test('recorded old status restores the initial interval even when creation snapshot is absent and a payment changed updated_at',async(t)=>{
  const f=statisticsFixture(t);f.child(1);f.db.exec("UPDATE child_enrollments SET updated_at='2026-09-03 10:00:00'; INSERT INTO group_memberships VALUES(1,11,9,'2026-01-01',NULL)");
  f.change(11,'active','paused','2026-09-20 10:00:00');f.lesson(1,'2026-09-10');f.lesson(2,'2026-09-25');
  const result=await f.get();assert.equal(result.summary.pausedChildren,1);assert.equal(result.summary.averageOccupancyPercent,'6.3');assert.equal(result.limitations.unknownStatusChildren,0);
});

test('26 frozen main rosters with paid history prove eligible active-or-lead membership despite missing old statuses',async(t)=>{
  const f=statisticsFixture(t);f.child(1);f.db.exec("UPDATE child_enrollments SET updated_at='2026-10-20 11:00:00'; INSERT INTO group_memberships VALUES(1,11,9,'2026-01-01',NULL)");
  for(let id=1;id<=26;id++) {const date=`2026-09-${String(id).padStart(2,'0')}`;f.lesson(id,date);f.visit(id,1);f.db.prepare('UPDATE lessons SET roster_frozen_at=? WHERE id=?').run(`${date} 10:00:00`,id);f.db.prepare('UPDATE lesson_roster_members SET frozen_at=? WHERE lesson_id=?').run(`${date} 10:00:00`,id);}
  const result=await f.get();assert.equal(result.summary.completedLessons,26);assert.equal(result.summary.occupancyLessons,26);assert.equal(result.summary.unknownOccupancyLessons,0);assert.equal(result.summary.averageOccupancyPercent,'12.5');assert.equal(result.summary.estimatedCapacity,true);
  f.db.exec("UPDATE lessons SET starts_at='2026-08-31 10:00:00' WHERE id=1");
  assert.equal((await f.get({from:'2026-08-01',to:'2026-08-31'})).summary.averageOccupancyPercent,null,'a roster frozen on another date does not establish a past status');
});

test('one unknown main member does not erase confirmed occupancy; partial coverage is explicit and today’s active state is not backfilled',async(t)=>{
  const f=statisticsFixture(t);f.child(1);f.child(2);f.db.exec("UPDATE child_enrollments SET updated_at='2026-10-20 11:00:00' WHERE id=21; INSERT INTO group_memberships VALUES(1,11,9,'2026-01-01',NULL),(2,21,9,'2026-01-01',NULL)");
  f.lesson(1,'2026-09-10');const result=await f.get();
  assert.equal(result.summary.averageOccupancyPercent,'12.5');assert.equal(result.summary.unknownOccupancyLessons,0);assert.equal(result.summary.partialOccupancyLessons,1);
  assert.equal(result.limitations.unknownOccupancyChildren,1);assert.equal(result.groups[0].partialOccupancyLessons,1);assert.equal(result.groups[0].unknownOccupancyChildren,1);
});

test('group-only scope reuses the same period calculations and current roster, without returning or querying monetary charts',async(t)=>{
  const f=statisticsFixture(t);f.child(1);f.db.exec("INSERT INTO group_memberships VALUES(1,11,9,'2026-01-01',NULL)");
  f.lesson(1,'2026-09-10');f.visit(1,1,{trial:true});f.lesson(2,'2026-10-10');f.visit(2,1);
  const september=await f.get();const common=await f.get({from:'2026-10-01',to:'2026-10-31'});f.calls.length=0;
  const groups=await f.get({scope:'groups'});assert.deepEqual(groups.groups,september.groups);assert.equal(groups.monthly,undefined);assert.equal(groups.summary,undefined);
  assert.equal(groups.groups[0].visits,0);assert.equal(groups.groups[0].continued,1);assert.equal(common.groups[0].visits,1);assert.equal(groups.groups[0].currentMembers,common.groups[0].currentMembers);
  assert.equal(f.calls.length,7);assert.ok(f.calls.every(({sql})=>!sql.includes('FROM payments')));
  await assert.rejects(f.get({scope:'groups',from:'2026-10-02',to:'2026-10-01'}),{code:'VALIDATION_ERROR'});
  for(const role of ['partner','teacher','parent'])await assert.rejects(f.get({scope:'groups'},{roles:[role]}),{code:'FORBIDDEN'});
});

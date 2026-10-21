import assert from 'node:assert/strict';
import { test } from 'node:test';
import { budgetFixture } from './helpers/budget-fixture.mjs';
import { createApiRouter } from '../backend/src/routes.mjs';
import { moneyCents } from '../backend/src/lesson-rules.mjs';

function reconcile(result) {
  const t=result.totals,c=moneyCents;
  assert.equal(c(t.deductions),c(t.refunds)+c(t.salary)+c(t.rent)+c(t.tax)+c(t.partnerShare)+c(t.manualExpense));
  assert.equal(c(t.result),c(t.payments)-c(t.deductions)+c(t.manualIncome));
  assert.equal(c(t.result),result.projects.reduce((sum,p)=>sum+c(p.result),0n)-c(t.manualExpense)+c(t.manualIncome));
  for(const p of result.projects){assert.equal(c(p.payments),c(p.cash)+c(p.cashless));assert.equal(c(p.result),c(p.payments)-c(p.refunds)-c(p.salary)-c(p.rent)-c(p.tax)-c(p.partnerShare));}
}

test('budget combines actual cash/cashless payments, actual refunds, accrued salaries, historical rent and existing partner rules for arbitrary inclusive dates',async(t)=>{
  const f=budgetFixture(t);f.payment(1);f.refund(1);f.lesson(1,'2026-09-15');f.lesson(2,'2026-10-15');f.salary(1,'1000.00');
  f.payment(2,{project:3,amount:'7000.00'});f.payment(3,{project:3,amount:'3000.00',method:'cash'});f.refund(2,{paymentId:2,project:3,amount:'1000.00'});
  f.lesson(3,'2026-10-16',{project:3});f.salary(3,'2000.00');
  const before=f.snapshot();const changes=f.db.prepare('SELECT total_changes() n').get().n;const result=await f.get();reconcile(result);
  assert.deepEqual([result.totals.payments,result.totals.refunds,result.totals.salary,result.totals.rent,result.totals.tax,result.totals.partnerShare,result.totals.result],['14100.00','1100.00','3000.00','700.00','700.00','3876.00','4724.00']);
  assert.equal(result.projects[0].marginPercent,'53.50');assert.equal(result.projects[1].marginPercent,'28.71');assert.equal(result.totals.combinedMarginPercent,'36.34');
  assert.equal(result.partner.transfer,'-876.00');assert.equal(result.partner.cashHeld,'3000.00');
  assert.equal(f.snapshot(),before);assert.equal(f.db.prepare('SELECT total_changes() n').get().n,changes);assert.ok(f.calls.every(({sql})=>/^SELECT/.test(sql)));
  assert.ok(f.calls.every(({params})=>!('from'in params)||params.from==='2026-09-10'));assert.equal(result.period.to,'2026-10-20');
});

test('manual income is already net and expenses affect only the combined result, not either project margin or CRM receipts',async(t)=>{
  const f=budgetFixture(t);f.payment(1);const before=await f.get();
  await f.manual.create({type:'income',date:'2026-10-20',amount:'1000.01'},f.context);
  await f.manual.create({type:'expense',date:'2026-09-10',amount:'200.00'},{...f.context,idempotencyKey:'expense-1'});
  const result=await f.get();reconcile(result);assert.deepEqual(result.projects,before.projects);assert.equal(result.totals.payments,'4100.00');
  assert.equal(result.totals.result,'4736.01');assert.equal(result.totals.tax,'164.00');assert.equal(result.totals.combinedMarginPercent,'96.00');assert.equal(result.totals.overallMarginPercent,'92.86');
});

for(const cash of [false,true])test(`individual partner groups retain all 6600 receipts, deduct accrued salary and partner entitlement once; cash held=${cash}`,async(t)=>{
  const f=budgetFixture(t);f.child(1);f.payment(1,{project:3,amount:'6600.00',method:cash?'cash':'cashless',mode:'attendance_share'});
  for(let id=1;id<=6;id++){f.lesson(id,`2026-10-${String(id).padStart(2,'0')}`,{group:99,project:3,mode:'attendance_share'});f.visit(id,1);f.salary(id,'275.00');}
  f.db.exec("UPDATE lessons SET teacher_share_percent_snapshot='33.3333',partner_share_percent_snapshot='33.3333'; UPDATE attendances SET price_snapshot='825.00'");
  const result=await f.get();reconcile(result);
  assert.equal(result.totals.payments,'6600.00');assert.equal(result.totals.salary,'1650.00');assert.equal(result.totals.tax,'0.00');assert.equal(result.totals.partnerShare,'1650.00');assert.equal(result.totals.result,'3300.00');
  assert.equal(result.partner.earnedIncome,'4950.00');assert.equal(result.partner.earnedIcubeShare,'1650.00');assert.equal(result.partner.transfer,cash?'4950.00':'-1650.00');assert.equal(result.projects[1].marginPercent,'50.00');
});

test('individual historical tax snapshots and current salary reversals are read without substituting 4% of payments or repeating deductions',async(t)=>{
  const f=budgetFixture(t);f.child(1);f.payment(1,{project:3,amount:'6600.00',mode:'attendance_share'});f.lesson(1,'2026-10-01',{group:99,project:3,mode:'attendance_share'});f.visit(1,1);f.salary(1,'275.00');f.salary(1,'999.00',{reversed:'2026-10-02'});
  f.db.exec("UPDATE lessons SET teacher_share_percent_snapshot='33.3333',partner_share_percent_snapshot='33.3333',custom_tax_enabled_snapshot=1,tax_percent_snapshot='4'; UPDATE attendances SET price_snapshot='825.00'");
  const result=await f.get();reconcile(result);assert.equal(result.totals.tax,'33.00');assert.equal(result.totals.salary,'275.00');assert.equal(result.totals.partnerShare,'275.00');assert.equal(result.totals.result,'6017.00');
});

test('prepaid receipts remain income without visits; visits paid in another period do not fabricate new receipts',async(t)=>{
  const f=budgetFixture(t);f.child(1);f.payment(1,{project:3,date:'2026-09-09',amount:'6600.00',mode:'attendance_share'});f.lesson(1,'2026-10-01',{group:99,project:3,mode:'attendance_share'});f.visit(1,1);f.salary(1,'275.00');
  f.db.exec("UPDATE lessons SET teacher_share_percent_snapshot='33.3333',partner_share_percent_snapshot='33.3333'; UPDATE attendances SET price_snapshot='825.00'");
  const result=await f.get();reconcile(result);assert.equal(result.totals.payments,'0.00');assert.equal(result.totals.result,'-550.00');assert.equal(result.totals.overallMarginPercent,null);
});

test('zero and negative income have finite results and no invalid margins; excess refunds never create a negative own tax',async(t)=>{
  const f=budgetFixture(t);let result=await f.get();reconcile(result);assert.equal(result.totals.result,'0.00');assert.equal(result.totals.overallMarginPercent,null);
  f.payment(1,{amount:'500.00'});f.refund(1,{amount:'1000.00'});result=await f.get();reconcile(result);assert.equal(result.totals.tax,'0.00');assert.equal(result.totals.result,'-500.00');assert.equal(result.projects[0].marginPercent,null);
});

test('deleted payments/refunds, reversed salaries, cancelled/deleted lessons and balance-transfer ledger entries do not inflate the budget',async(t)=>{
  const f=budgetFixture(t);f.payment(1,{deleted:'2026-10-16'});f.payment(2,{amount:'4100.00'});f.refund(1,{paymentId:2,deleted:'2026-10-16'});
  f.lesson(1,'2026-10-10',{status:'cancelled'});f.salary(1,'1000.00');f.lesson(2,'2026-10-10');f.salary(2,'1000.00');f.db.exec("UPDATE lessons SET deleted_at='2026-10-11' WHERE id=2; INSERT INTO balance_entries(enrollment_id,entry_type,amount_delta,lessons_delta) VALUES(11,'transfer_in','9000.00','9.00000000')");
  const result=await f.get();reconcile(result);assert.equal(result.totals.payments,'4100.00');assert.equal(result.totals.refunds,'0.00');assert.equal(result.totals.salary,'0.00');assert.equal(result.totals.rent,'0.00');
});

for(const role of ['partner','teacher','parent'])test(`${role} cannot obtain budget totals through service or API`,async(t)=>{
  const f=budgetFixture(t),actor={userId:'1',roles:[role]};await assert.rejects(f.get(f.period,actor),{code:'FORBIDDEN'});
  const router=createApiRouter(f.pool,{directorBudget:f.service,testAuth(req,_res,next){req.auth=actor;next();}});
  const response=await new Promise((resolve,reject)=>router.handle({method:'GET',url:'/statistics/budget',query:f.period},{status(code){this.code=code;return this;},json(body){resolve({code:this.code,body});}},reject));assert.equal(response.code,403);assert.equal(f.calls.length,0);
});

test('default budget period is the server business month, independent of partner 26–25 and statistics filters; missing attribution fails clearly',async(t)=>{
  const f=budgetFixture(t);assert.deepEqual((await f.get({})).period,{from:'2026-10-01',to:'2026-10-31'});
  await assert.rejects(f.get({from:'2026-02-30',to:'2026-03-01'}),{code:'VALIDATION_ERROR'});
  f.payment(1,{project:null});await assert.rejects(f.get(),{code:'BUDGET_PROJECT_UNKNOWN'});
});

test('inclusive payment/refund dates and original project snapshots survive later enrollment transfers',async(t)=>{
  const f=budgetFixture(t);f.child(1);f.payment(1,{date:'2026-09-09'});f.payment(2,{date:'2026-09-10'});f.payment(3,{date:'2026-10-20',amount:'100.00',method:'cash'});f.payment(4,{date:'2026-10-21',amount:'10000.00'});
  f.refund(1,{paymentId:1,date:'2026-10-20',amount:'500.00'});f.db.exec('UPDATE child_enrollments SET project_id=3 WHERE id=11');
  const result=await f.get();reconcile(result);assert.equal(result.projects[0].payments,'4200.00');assert.equal(result.projects[0].cash,'100.00');assert.equal(result.projects[0].refunds,'500.00');assert.equal(result.projects[0].tax,'148.00');assert.equal(result.totals.result,'3552.00');assert.equal(result.projects[1].payments,'0.00');
});

test('director report API returns the same reconciled report as the existing budget calculation',async(t)=>{
  const f=budgetFixture(t);f.payment(1);const expected=await f.get();const router=createApiRouter(f.pool,{directorBudget:f.service,testAuth(req,_res,next){req.auth=f.context;next();}});
  const result=await new Promise((resolve,reject)=>router.handle({method:'GET',url:'/statistics/budget',query:f.period,get:()=>undefined},{status(code){this.code=code;return this;},json(body){resolve({code:this.code,data:body.data});}},reject));
  assert.equal(result.code,200);assert.deepEqual(result.data,expected);reconcile(result.data);
});

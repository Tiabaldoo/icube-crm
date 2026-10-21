import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { businessDate, calendarMonthPeriod } from '../src/shared/business-time.mjs';

const frontendSource=await readFile(new URL('../src/frontend/api-sync.mjs',import.meta.url),'utf8');
const budgetSource=frontendSource.slice(frontendSource.indexOf('function directorBudgetMoney('),frontendSource.indexOf('const legacyChildPage ='));
const { budgetMoney,createDirectorBudgetUi }=new Function('businessDate','calendarMonthPeriod',`${budgetSource};return {budgetMoney:directorBudgetMoney,createDirectorBudgetUi};`)(businessDate,calendarMonthPeriod);

function fixture(role='director') {
  let actor={id:'1',roles:[role]},key=0,confirmation=true,requestHandler=async()=>({id:'1'}),listHandler=null;
  const calls=[],controls={},target={innerHTML:''};
  const p=(code,name)=>({id:code==='zebra'?'3':'2',code,name,payments:'6600.00',cash:'3000.00',cashless:'3600.00',refunds:'0.00',salary:'1650.00',rent:'0.00',tax:'0.00',partnerShare:'1650.00',income:'6600.00',result:'3300.00',marginPercent:'50.00'});
  const result={period:{from:'2026-10-01',to:'2026-10-31'},projects:[p('icube-robots','Айкуб'),p('zebra','Зебра')],
    totals:{payments:'13200.00',deductions:'6600.00',result:'6600.00',refunds:'0.00',salary:'3300.00',rent:'0.00',tax:'0.00',partnerShare:'3300.00',manualIncome:'0.00',manualExpense:'0.00',automaticResult:'6600.00',combinedMarginPercent:'50.00',overallMarginPercent:'50.00'},
    partner:{cashHeld:'3000.00',transfer:'1350.00',earnedIncome:'4950.00',earnedIcubeShare:'1650.00'},entries:[{id:'1',type:'expense',date:'2026-10-15',amount:'200.01',purpose:'Оборудование'}]};
  const api={async list(resource,query){calls.push({resource,query});return listHandler?listHandler():result;},async request(path,options){calls.push({path,...options});return requestHandler(path,options);}};
  const ui=createDirectorBudgetUi({api,getActor:()=>actor,find:selector=>selector==='#director-budget-body'?target:controls[selector],confirm:()=>confirmation,makeKey:()=>`budget-key-${++key}`,now:()=>new Date('2026-10-21T01:00:00Z')});
  const input=(date='2026-10-20',amount='1234.56',purpose='Материалы')=>{for(const [id,value]of [['date',date],['amount',amount],['purpose',purpose]])controls[`#budget-entry-${id}`]={value};};
  return {ui,result,calls,controls,target,input,setActor(value){actor=value;},setConfirm(value){confirmation=value;},setRequest(fn){requestHandler=fn;},setList(fn){listHandler=fn;}};
}

test('budget starts closed, loads lazily, shows eight compact cards and preserves three closed detail sections',async()=>{
  const f=fixture();assert.match(f.ui.section(),/Мой бюджет/);assert.doesNotMatch(f.ui.section(),/<details[^>]+ open/);assert.equal(f.calls.length,0);
  await f.ui.toggle(true);assert.match(f.ui.section(),/<details[^>]+ open/);assert.equal(f.calls.length,1);assert.equal((f.target.innerHTML.match(/class="card metric /g)||[]).length,8);
  for(const label of ['Все оплаты','Расходы и удержания','Мой результат','Общая доходность','Айкуб + Зебра','Начисленная зарплата','Начисленная доля Айкуба','Дополнительные операции','Прочий доход','Прочий расход'])assert.ok(f.target.innerHTML.includes(label));
  assert.equal((f.target.innerHTML.match(/class="budget-details"/g)||[]).length,3);assert.doesNotMatch(f.target.innerHTML,/<details[^>]*budget-details[^>]* open/);
  await f.ui.toggle(false);await f.ui.toggle(true);assert.equal(f.calls.length,1,'toggle uses the loaded report and does not reload CRM');
});

test('budget period is independent and queries only the budget endpoint, without project/direction filters',async()=>{
  const f=fixture();await f.ui.toggle(true);f.controls['#budget-from']={value:'2026-09-10'};f.controls['#budget-to']={value:'2026-10-20'};await f.ui.load();
  assert.deepEqual(f.calls.at(-1),{resource:'statistics/budget',query:'?from=2026-09-10&to=2026-10-20'});
  assert.match(f.ui.section(),/id="budget-from" type="date" value="2026-09-10"/);assert.ok(f.calls.every(c=>c.resource==='statistics/budget'));
});

test('manual creation has only date/amount/purpose, suppresses double clicks and uses a stable retry key with actor binding',async()=>{
  const f=fixture();await f.ui.toggle(true);f.ui.add('income');f.input();f.ui.draft();assert.match(f.target.innerHTML,/budget-entry-form/);assert.doesNotMatch(f.target.innerHTML,/<select|budget-entry-project/);
  let finish;f.setRequest(()=>new Promise(resolve=>{finish=resolve;}));const first=f.ui.save();await f.ui.save();assert.equal(f.calls.filter(c=>c.path).length,1);
  const command=f.calls.find(c=>c.path);assert.deepEqual(command.body,{type:'income',date:'2026-10-20',amount:'1234.56',purpose:'Материалы'});assert.equal(command.idempotencyKey,'budget-key-1');assert.equal(command.expectedActorId,'1');
  finish({id:'2'});await first;assert.equal(f.calls.at(-1).resource,'statistics/budget');assert.match(f.target.innerHTML,/Операция сохранена/);
  f.ui.add('expense');f.input();f.setRequest(async()=>{throw new Error('Нет сети');});await f.ui.save();await f.ui.save();const commands=f.calls.filter(c=>c.path);assert.equal(commands[1].idempotencyKey,commands[2].idempotencyKey);assert.match(f.target.innerHTML,/Нет сети/);
});

test('manual editing and confirmed deletion use only budget endpoints and refresh totals; cancelled deletion sends nothing',async()=>{
  const f=fixture();await f.ui.toggle(true);f.ui.edit('1');f.input('2026-10-16','300.01','Исправлено');await f.ui.save();
  assert.equal(f.calls.find(c=>c.path).method,'PATCH');assert.equal(f.calls.find(c=>c.path).path,'/statistics/budget/entries/1');
  f.setConfirm(false);const count=f.calls.length;await f.ui.remove('1');assert.equal(f.calls.length,count);
  f.setConfirm(true);await f.ui.remove('1');assert.equal(f.calls.filter(c=>c.path).at(-1).method,'DELETE');assert.equal(f.calls.at(-1).resource,'statistics/budget');
});

test('formatting preserves kopecks, signs, large sums and no-data margins; user descriptions are escaped',async()=>{
  assert.equal(budgetMoney('0.00'),'0 ₽');assert.match(budgetMoney('-1234567.89'),/^-[\d\s\u00a0\u202f]+,89 ₽$/);assert.match(budgetMoney('1234.50'),/,50 ₽$/);
  const f=fixture();f.result.totals.overallMarginPercent=null;f.result.entries[0].purpose='<img src=x onerror=alert(1)>';await f.ui.toggle(true);
  assert.match(f.target.innerHTML,/Нет данных/);assert.match(f.target.innerHTML,/−200,01 ₽/);assert.match(f.target.innerHTML,/&lt;img/);assert.doesNotMatch(f.target.innerHTML,/<img|NaN|Infinity/);
});

for(const role of ['partner','teacher','parent'])test(`${role} cannot render, fetch or mutate budget through direct UI actions`,async()=>{
  const f=fixture(role);assert.equal(f.ui.section(),'');await f.ui.toggle(true);await f.ui.load();f.ui.add('income');f.ui.edit('1');await f.ui.save();await f.ui.remove('1');assert.equal(f.calls.length,0);
});

test('changing user clears budget/form state and discards an old in-flight response',async()=>{
  const f=fixture();let finish;f.setList(()=>new Promise(resolve=>{finish=resolve;}));const pending=f.ui.toggle(true);f.setActor({id:'2',roles:['director']});assert.doesNotMatch(f.ui.section(),/<details[^>]+ open/);
  finish(f.result);await pending;assert.doesNotMatch(f.ui.section(),/Оборудование/);f.setActor({id:'3',roles:['parent']});assert.equal(f.ui.section(),'');
});

test('budget failures clear stale amounts and retain independent dates; responsive styles are scoped and do not require horizontal tables',async()=>{
  const f=fixture();await f.ui.toggle(true);f.setList(async()=>{throw new Error('Не настроены условия партнёрства');});await f.ui.load();assert.match(f.target.innerHTML,/Не настроены условия/);assert.doesNotMatch(f.target.innerHTML,/class="card metric/);
  const css=await readFile(new URL('../src/ui/styles.css',import.meta.url),'utf8');assert.match(css,/\.stats-page \.director-budget \.budget-metrics/);assert.match(css,/@media\(max-width:680px\)\{\.stats-page \.director-budget \.budget-metrics\{grid-template-columns:repeat\(2/);assert.match(css,/\.stats-page \.director-budget \.btn\{min-height:44px/);
  assert.doesNotMatch(budgetSource,/<table|localStorage|sessionStorage|api\.create\('payments'/);
});

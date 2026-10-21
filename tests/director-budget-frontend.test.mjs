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
  const history={months:Array.from({length:12},(_,i)=>({month:new Date(Date.UTC(2025,10+i,1)).toISOString().slice(0,7),result:i===0?'-200.01':i===1?'0.00':'6600.00'}))};
  const api={async list(resource,query){calls.push({resource,query});return listHandler?listHandler(resource):resource==='statistics/budget/monthly'?history:result;},async request(path,options){calls.push({path,...options});return requestHandler(path,options);}};
  const ui=createDirectorBudgetUi({api,getActor:()=>actor,find:selector=>selector==='#director-budget-body'?target:controls[selector],confirm:()=>confirmation,makeKey:()=>`budget-key-${++key}`,now:()=>new Date('2026-10-21T01:00:00Z')});
  const input=(date='2026-10-20',amount='1234.56',purpose='Материалы')=>{for(const [id,value]of [['date',date],['amount',amount],['purpose',purpose]])controls[`#budget-entry-${id}`]={value};};
  return {ui,result,history,calls,controls,target,input,setActor(value){actor=value;},setConfirm(value){confirmation=value;},setRequest(fn){requestHandler=fn;},setList(fn){listHandler=fn;}};
}

test('budget starts closed, loads lazily, shows unchanged eight cards and separate closed breakdown, partner and history sections',async()=>{
  const f=fixture();assert.match(f.ui.section(),/Мой бюджет/);assert.doesNotMatch(f.ui.section(),/<details[^>]+ open/);assert.equal(f.calls.length,0);
  await f.ui.toggle(true);assert.match(f.ui.section(),/<details[^>]+ open/);assert.equal(f.calls.length,1);assert.equal((f.target.innerHTML.match(/class="card metric /g)||[]).length,8);
  for(const label of ['Все оплаты','Расходы и удержания','Мой результат','Общая маржинальность','Айкуб + Зебра','Начисленная зарплата','Начисленная доля Айкуба','Дополнительные операции','Прочий доход','Прочий расход'])assert.ok(f.target.innerHTML.includes(label));
  assert.equal((f.target.innerHTML.match(/class="budget-details(?: budget-history)?"/g)||[]).length,4);assert.doesNotMatch(f.target.innerHTML,/<details[^>]*budget-details[^>]* open/);
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
  const f=fixture(role);assert.equal(f.ui.section(),'');await f.ui.toggle(true);await f.ui.load();await f.ui.toggleChart(true);await f.ui.loadChart();f.ui.selectMonth('2026-10');f.ui.add('income');f.ui.edit('1');await f.ui.save();await f.ui.remove('1');assert.equal(f.calls.length,0);
});

test('budget breakdown preserves amounts, four margins and references in project panels with signed deductions and highlighted totals',async()=>{
  const f=fixture();f.result.projects[0].marginPercent='53.50';f.result.projects[1].marginPercent='28.71';f.result.totals.combinedMarginPercent='36.34';f.result.totals.overallMarginPercent='40.12';
  await f.ui.toggle(true);const page=f.target.innerHTML;
  assert.match(page,/<h4>Маржинальность<\/h4>/);assert.doesNotMatch(page,/Доходность|доходность/);
  for(const rate of ['53,5%','28,71%','36,34%','40,12%'])assert.ok(page.includes(rate));
  for(const p of f.result.projects){
    const panel=page.match(new RegExp(`<section class="stats-panel ${p.code==='zebra'?'budget-zebra':'budget-icube'}">([\\s\\S]*?)</section>`))?.[1];assert.ok(panel);
    for(const [label,key]of [['Всего оплат','payments'],['Наличные','cash'],['Безналичные','cashless'],['После возвратов','income']])assert.ok(panel.includes(`<dt>${label}</dt><dd>${budgetMoney(p[key])}</dd>`));
    for(const [label,key]of [['Возвраты','refunds'],['Начисленная зарплата','salary'],['Аренда','rent'],['Налог','tax'],['Доля партнёра','partnerShare']])assert.ok(panel.includes(`<dt>${label}</dt><dd>−${budgetMoney(p[key])}</dd>`));
    assert.match(panel,/class="budget-total"/);assert.ok(panel.includes(budgetMoney(p.result)));
  }
  const overall=page.match(/<section class="stats-panel budget-overall">([\s\S]*?)<\/section>/)?.[1];
  assert.ok(overall.includes(`<dt>Мой результат</dt><dd>${budgetMoney(f.result.totals.result)}</dd>`));assert.match(overall,/budget-total budget-owner-result/);
  assert.match(page,/<details class="budget-details"><summary>Партнёрские расчёты — подробнее<\/summary>/);
  for(const value of Object.values(f.result.partner))assert.ok(page.includes(budgetMoney(value)));
  assert.match(page,/Положительный перевод — к получению/);assert.match(page,/Общая маржинальность условная/);
});

test('monthly graph loads once on expansion independent of budget dates and renders positive, negative, zero and precise tap detail',async()=>{
  const f=fixture();await f.ui.toggle(true);assert.equal(f.calls.length,1);
  assert.match(f.target.innerHTML,/<details class="budget-details budget-history" ontoggle/);
  await f.ui.toggleChart(true);assert.deepEqual(f.calls.at(-1),{resource:'statistics/budget/monthly',query:''});
  assert.equal((f.target.innerHTML.match(/class="budget-month(?: selected)?"/g)||[]).length,12);
  assert.match(f.target.innerHTML,/budget-positive"><i style="height:100%"/);
  assert.match(f.target.innerHTML,/budget-negative"><i style="height:3\.030/);assert.match(f.target.innerHTML,/budget-zero/);
  f.ui.selectMonth('2025-11');assert.match(f.target.innerHTML,/budget-month-detail[^>]*>нояб\.[^<]*<strong>-200,01 ₽/);
  f.controls['#budget-from']={value:'2026-01-01'};f.controls['#budget-to']={value:'2026-01-31'};await f.ui.load();
  assert.match(f.target.innerHTML,/нояб\./);assert.equal(f.calls.filter(c=>c.resource==='statistics/budget/monthly').length,1);
  await f.ui.toggleChart(false);await f.ui.toggleChart(true);assert.equal(f.calls.filter(c=>c.resource==='statistics/budget/monthly').length,1);
});

test('open monthly graph refreshes after create, edit and delete; collapsed graph is invalidated and refreshed on next expansion',async()=>{
  const f=fixture();await f.ui.toggle(true);await f.ui.toggleChart(true);
  const historyCalls=()=>f.calls.filter(c=>c.resource==='statistics/budget/monthly').length;
  f.setRequest(async()=>{f.history.months.at(-1).result='7000.01';return{id:'2'};});
  f.ui.add('income');f.input();await f.ui.save();assert.equal(historyCalls(),2);assert.match(f.target.innerHTML,/7\s000,01 ₽/);
  f.ui.edit('1');f.input();await f.ui.save();assert.equal(historyCalls(),3);
  await f.ui.remove('1');assert.equal(historyCalls(),4);
  await f.ui.toggleChart(false);f.ui.add('expense');f.input();await f.ui.save();assert.equal(historyCalls(),4);
  await f.ui.toggleChart(true);assert.equal(historyCalls(),5);
});

test('monthly errors are isolated and retryable; changing actor discards a pending graph response',async()=>{
  const f=fixture();await f.ui.toggle(true);
  f.setList(async()=>{throw new Error('Нет сети');});await f.ui.toggleChart(true);
  assert.match(f.target.innerHTML,/Нет сети/);assert.match(f.target.innerHTML,/Повторить/);assert.match(f.target.innerHTML,/Все оплаты/);
  f.setList(async()=>f.history);await f.ui.loadChart();assert.match(f.target.innerHTML,/budget-month selected/);
  let finish;f.setList(()=>new Promise(resolve=>{finish=resolve;}));const pending=f.ui.loadChart();
  f.setActor({id:'2',roles:['director']});assert.doesNotMatch(f.ui.section(),/budget-month selected/);
  finish(f.history);await pending;assert.doesNotMatch(f.ui.section(),/budget-month selected/);
});

test('negative obligations retain their credit sign and compact project/chart layouts stack within existing mobile breakpoints',async()=>{
  const f=fixture();f.result.projects[1].partnerShare='-100.01';await f.ui.toggle(true);
  assert.match(f.target.innerHTML,/<dt>Доля партнёра<\/dt><dd>\+100,01 ₽<\/dd>/);assert.doesNotMatch(f.target.innerHTML,/−-100/);
  const css=await readFile(new URL('../src/ui/styles.css',import.meta.url),'utf8');
  assert.match(css,/@media\(max-width:680px\)\{\.stats-page \.stats-panels\{grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css,/@media\(max-width:540px\)\{\.stats-page \.budget-result-chart\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  for(const [kind,color]of [['robot','robot'],['code','code']])assert.ok(css.includes(`.stats-page .stats-panel.stats-direction-${kind}{border-top:3px solid var(--direction-${color})}`));
  assert.match(css,/\.stats-page \.budget-positive\{align-items:end;border-bottom:1px solid var\(--muted\)/);assert.match(css,/\.stats-page \.budget-negative\{align-items:start\}/);
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

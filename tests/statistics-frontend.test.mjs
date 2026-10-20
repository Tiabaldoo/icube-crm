import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function statisticsUiFixture(role='director') {
  const source=await readFile(new URL('../src/frontend/api-sync.mjs',import.meta.url),'utf8');
  const group=(id,name,rate,occupancy)=>({id,name,siteName:id==='9'?'Школа':'Центр',projectName:'Айкуб',directionName:'Робототехника',weekday:5,startTime:'10:00',endTime:'11:00',currentMembers:2,capacity:8,completedLessons:2,visits:3,absences:1,attendancePercent:rate,averageOccupancyPercent:occupancy,estimatedCapacity:false,newChildren:1,trials:1,continued:0,notContinued:0,pending:1,conversionPercent:null,pausedChildren:0,finishedChildren:0,occupancyLessons:2,unknownOccupancyLessons:0});
  const result={period:{from:'2026-09-01',to:'2026-09-30'},current:{children:{total:5,active:2,lead:1,paused:1,finished:1},activeDirections:{total:3,dualChildren:1,directions:[{id:'1',count:2},{id:'2',count:1}]}},summary:{completedLessons:2,visits:3,absences:1,attendancePercent:'75.0',averageOccupancyPercent:'25.0',newChildren:2,pausedChildren:1,finishedChildren:0},recruitment:{trials:2,continued:0,notContinued:0,pending:2,conversionPercent:null,directions:[]},limitations:{},groups:[group('9','Альфа','75.0','50.0'),group('99','Бета','25.0','12.5')],monthly:[{month:'2026-09',received:'4900.00',refunds:'0.00',net:'4900.00',newChildren:2,pausedChildren:1,finishedChildren:0,projects:[{id:'2',name:'iCubeRobots',code:'icube-robots',received:'4600.00',cash:'100.00',cashless:'4500.00',refunds:'0.00',net:'4600.00'},{id:'3',name:'Зебра',code:'zebra',received:'300.00',cash:'300.00',cashless:'0.00',refunds:'0.00',net:'300.00'}]},{month:'2026-10',received:'0.00',refunds:'1125.00',net:'-1125.00',newChildren:0,pausedChildren:0,finishedChildren:0,projects:[{id:'2',name:'iCubeRobots',code:'icube-robots',received:'0.00',cash:'0.00',cashless:'0.00',refunds:'1125.00',net:'-1125.00'}]}]};
  const state={role,statistics:result,statisticsDateFrom:'2026-09-01',statisticsDateTo:'2026-09-30',statisticsProjectId:'all',statisticsDirectionId:'all',statisticsChartFrom:'2025-11-01',statisticsChartTo:'2026-10-31',statisticsGroupFrom:'2026-09-01',statisticsGroupTo:'2026-09-30'};
  const calls=[];const target={innerHTML:''},groupTarget={innerHTML:''},controls={};let failure=null,respond=()=>result,renders=0;
  const context=vm.createContext({legacy:{state,render(){renders++;},pageHead:(title)=>`<h1>${title}</h1>`},authProfile:{roles:[role]},directories:{projects:[{id:'2',name:'iCubeRobots'},{id:'3',name:'Зебра'}],directions:[{id:'1',name:'Робототехника'},{id:'2',name:'Программирование'}]},api:{async list(resource,query){calls.push({resource,query});if(failure)throw new Error(failure);return respond(query);}},element:(selector)=>selector==='#stats-group-list'?target:selector==='#stats-group-result'?groupTarget:null,value:(selector)=>controls[selector]??'',html:(v)=>String(v??'').replaceAll('<','&lt;'),displayMoney:(v)=>`${v} ₽`,displayGroup:(_id,name)=>name,dayShortNames:['Пн','Вт','Ср','Чт','Пт','Сб','Вс'],isoToRu:(v)=>String(v??'').split('-').reverse().join('.'),Intl,Date,Set});
  vm.runInContext(source.slice(source.indexOf('function statisticsAllowed()'),source.indexOf('\nconst legacyChildPage =')),context);
  return {context,state,result,calls,target,groupTarget,controls,fail(message){failure=message;},respondWith(fn){respond=fn;},renders:()=>renders};
}

test('statistics UI separates current values, period, pending trials and zero-evaluated conversion',async()=>{
  const f=await statisticsUiFixture();const page=f.context.statisticsPage();
  for(const label of ['Дети сейчас','Всего детей','Активные направления сейчас','С двумя активными направлениями','За период','Набор и ознакомительные занятия','Ожидают результата'])assert.ok(page.includes(label));
  assert.match(page,/Конверсия ознакомительных занятий[\s\S]*?Нет данных/);assert.match(page,/75,0%/);
  assert.match(page,/stats-direction-code/);assert.match(page,/stats-direction-robot/);
});

test('one stacked button per month shows project segments, a separate refund marker and tap details',async()=>{
  const f=await statisticsUiFixture();let page=f.context.statisticsPage();
  assert.equal((page.match(/class="stats-month-button/g)||[]).length,2);
  assert.equal((page.match(/class="stats-stack"/g)||[]).length,2);
  assert.equal((page.match(/class="stats-project-segment /g)||[]).length,2,'refund-only month has no payment segments');
  assert.equal((page.match(/aria-label="В этом месяце есть возвраты"/g)||[]).length,1);
  assert.match(page,/stats-project-robots/);assert.match(page,/stats-project-zebra/);
  f.context.selectStatisticsMonth('2026-09');page=f.context.statisticsPage();assert.match(page,/Подробности: 2026-09/);assert.match(page,/Безналичные/);assert.match(page,/Наличные/);assert.match(page,/4900\.00/);
  f.context.selectStatisticsMonth('2026-10');page=f.context.statisticsPage();assert.match(page,/-1125\.00/);assert.match(page,/aria-pressed="true"/);
});

test('group cards start closed, expand without database calls, search by site/name and sort weakest groups first',async()=>{
  const f=await statisticsUiFixture();let page=f.context.statisticsGroupRows();assert.equal((page.match(/<details/g)||[]).length,2);assert.doesNotMatch(page,/<details[^>]+ open/);
  f.context.statisticsGroupToggle('9',true);assert.match(f.context.statisticsGroupRows(),/data-stats-group="9" open/);
  f.context.filterStatisticsGroups('Центр');assert.doesNotMatch(f.target.innerHTML,/Альфа/);assert.match(f.target.innerHTML,/Бета/);
  f.context.filterStatisticsGroups('альфа');assert.match(f.target.innerHTML,/Альфа/);assert.doesNotMatch(f.target.innerHTML,/Бета/);
  for(const sort of ['attendance','occupancy']){f.context.filterStatisticsGroups('',sort);assert.ok(f.target.innerHTML.indexOf('Бета')<f.target.innerHTML.indexOf('Альфа'));}
  assert.equal(f.calls.length,0);
});

for(const role of ['partner','teacher','parent'])test(`${role} cannot render or load director statistics even through direct frontend calls`,async()=>{
  const f=await statisticsUiFixture(role);assert.match(f.context.statisticsPage(),/только директору/);await f.context.loadStatistics();assert.equal(f.calls.length,0);
  await f.context.loadStatisticsGroups();assert.equal(f.calls.length,0);
  f.context.selectStatisticsMonth('2026-09');assert.equal(f.state.statisticsMonth,undefined);f.context.filterStatisticsGroups('Альфа');assert.equal(f.target.innerHTML,'');
});

test('statistics errors show no fabricated zero metrics and preserve independent filter values',async()=>{
  const f=await statisticsUiFixture();f.fail('Сервер недоступен');await f.context.loadStatistics();const page=f.context.statisticsPage();
  assert.match(page,/Сервер недоступен/);assert.doesNotMatch(page,/Всего детей/);assert.equal(f.state.statisticsDateFrom,'2026-09-01');assert.equal(f.state.statisticsProjectId,'all');
});

test('group dates update only group cards with server data, preserve common metrics and charts, and keep search/sort working',async()=>{
  const f=await statisticsUiFixture();const original=JSON.stringify(f.state.statistics);
  const groupResult={period:{from:'2026-10-01',to:'2026-10-31',effectiveTo:'2026-10-20'},groups:f.result.groups.map((g)=>({...g,visits:g.visits+10})),limitations:{}};
  f.controls['#stats-group-from']='2026-10-01';f.controls['#stats-group-to']='2026-10-31';f.respondWith(()=>groupResult);
  await f.context.loadStatisticsGroups();
  assert.equal(f.renders(),0,'group requests never rerender the entire page');assert.equal(JSON.stringify(f.state.statistics),original);
  assert.equal(f.state.statisticsDateFrom,'2026-09-01');assert.equal(f.state.statisticsDateTo,'2026-09-30');
  assert.match(f.calls[0].query,/from=2026-10-01&to=2026-10-31/);assert.match(f.calls[0].query,/scope=groups/);
  assert.match(f.groupTarget.innerHTML,/20\.10\.2026/);assert.match(f.groupTarget.innerHTML,/01\.10\.2026 — 31\.10\.2026/);assert.match(f.groupTarget.innerHTML,/>13</);
  assert.equal(f.state.statisticsGroups.groups[0].currentMembers,f.result.groups[0].currentMembers);
  f.context.filterStatisticsGroups('Центр','attendance');assert.doesNotMatch(f.target.innerHTML,/Альфа/);assert.match(f.target.innerHTML,/Бета/);
  f.context.filterStatisticsGroups('','occupancy');assert.ok(f.target.innerHTML.indexOf('Бета')<f.target.innerHTML.indexOf('Альфа'));
});

test('manual group period survives common date changes and follows the applied project/direction filters',async()=>{
  const f=await statisticsUiFixture();const groupResult={period:{from:'2026-08-01',to:'2026-08-31'},groups:f.result.groups,limitations:{}};
  f.controls['#stats-group-from']='2026-08-01';f.controls['#stats-group-to']='2026-08-31';
  f.respondWith((query)=>query.includes('scope=groups')?groupResult:f.result);await f.context.loadStatisticsGroups();
  f.controls['#stats-from']='2026-10-01';f.controls['#stats-to']='2026-10-31';f.controls['#stats-project']='3';f.controls['#stats-direction']='2';
  await f.context.loadStatistics();
  assert.equal(f.state.statisticsGroupFrom,'2026-08-01');assert.equal(f.state.statisticsGroupTo,'2026-08-31');
  assert.equal(f.state.statisticsDateFrom,'2026-10-01');assert.equal(f.state.statisticsDateTo,'2026-10-31');
  assert.match(f.calls.at(-1).query,/from=2026-08-01&to=2026-08-31&projectId=3&directionId=2&scope=groups/);
  assert.equal(f.state.statisticsGroups.period.from,'2026-08-01');
});

test('group period follows the common period until the user chooses independent dates',async()=>{
  const f=await statisticsUiFixture();const period={from:'2026-10-01',to:'2026-10-31'};f.respondWith(()=>({...f.result,period}));
  await f.context.loadStatistics();assert.equal(f.state.statisticsGroupFrom,period.from);assert.equal(f.state.statisticsGroupTo,period.to);assert.equal(f.calls.length,1);
  assert.match(f.context.statisticsPage(),/id="stats-group-from" type="date" value="2026-10-01"/);
});

test('a partial statistics response cannot break the common CRM reload or overwrite group dates',async()=>{
  const f=await statisticsUiFixture();f.context.acceptStatisticsGroups({summary:{},groups:[]});
  assert.equal(f.state.statisticsGroupFrom,'2026-09-01');assert.equal(f.state.statisticsGroupTo,'2026-09-30');assert.equal(f.state.statisticsGroups,undefined);
});

test('a failed or stale group-period request cannot display old figures as fresh results',async()=>{
  const f=await statisticsUiFixture();const pending=[];f.respondWith(()=>new Promise(resolve=>pending.push(resolve)));
  const first=f.context.loadStatisticsGroups();const second=f.context.loadStatisticsGroups();
  pending[1]({period:{from:'2026-10-01',to:'2026-10-31'},groups:[f.result.groups[1]],limitations:{}});await second;
  pending[0]({period:{from:'2026-08-01',to:'2026-08-31'},groups:[f.result.groups[0]],limitations:{}});await first;
  assert.equal(f.state.statisticsGroups.period.from,'2026-10-01');assert.match(f.groupTarget.innerHTML,/Бета/);assert.doesNotMatch(f.groupTarget.innerHTML,/Альфа/);
  f.fail('Неверный период');await f.context.loadStatisticsGroups();assert.match(f.groupTarget.innerHTML,/Неверный период/);assert.doesNotMatch(f.groupTarget.innerHTML,/Бета|Альфа/);
});

test('historical limitations are compact, closed, accurate and absent when no limitation applies',async()=>{
  const f=await statisticsUiFixture();assert.equal(f.context.statisticsWarnings({}),'');
  const warnings=f.context.statisticsWarnings({unmarkedAttendances:43,unknownStatusChildren:2,unknownOccupancyLessons:1,partialOccupancyLessons:3,unknownOccupancyChildren:4,estimatedCapacity:true});
  assert.match(warnings,/<details[^>]+stats-limitations/);assert.doesNotMatch(warnings,/<details[^>]+ open/);
  assert.match(warnings,/Ограничения исторических данных: 4/);assert.match(warnings,/для 2 детей/);assert.match(warnings,/заполняемости: 1/);assert.match(warnings,/составом: 3/);assert.match(warnings,/историей: 4/);
  assert.match(warnings,/нижняя оценка/);assert.match(warnings,/историческая вместимость/);assert.doesNotMatch(warnings,/43|SQL|roster|attendance|marked_at/);
  const inconsistent=f.context.statisticsWarnings({unresolvedAttendanceDirections:1});assert.match(inconsistent,/Обнаружено несоответствие/);assert.match(inconsistent,/направления — 1/);
  f.result.period.effectiveTo='2026-09-30';assert.match(f.context.statisticsPage(),/Данные по состоянию на 30\.09\.2026/);
  assert.match(f.context.statisticsPage(),/id="stats-group-to" type="date"/);
});

test('responsive statistics CSS is scoped and supports touch, wrapped names, chart and vertical details without wide tables',async()=>{
  const css=await readFile(new URL('../src/ui/styles.css',import.meta.url),'utf8');const source=await readFile(new URL('../src/frontend/api-sync.mjs',import.meta.url),'utf8');
  const scoped=css.slice(css.indexOf('/* Statistics keeps'),css.indexOf('/* Statistics keeps')+9000);
  for(const selector of ['.stats-page .stats-filters','.stats-page .stats-payments-chart','.stats-page .stats-group-card summary b','.stats-page .stats-project-details'])assert.ok(scoped.includes(selector));
  assert.match(scoped,/@media\(max-width:540px\)/);assert.match(scoped,/word-break:normal/);assert.match(scoped,/min-height:44px/);
  assert.doesNotMatch(source.slice(source.indexOf('function statisticsAllowed()'),source.indexOf('\nconst legacyChildPage =')),/min-width:1120px|<table/);
});

test('frontend получает statistics с сервера, использует календарный месяц и не считает legacy state', async () => {
  const originalWindow = globalThis.window; const originalDocument = globalThis.document; const originalFetch = globalThis.fetch;
  const controls = { '#stats-from': { value: '2026-09-01' }, '#stats-to': { value: '2026-09-30' }, '#stats-project': { value: 'all' }, '#stats-direction': { value: 'all' } };
  let statisticsUrl;
  const empty = { projects: [{ id: '1', name: 'iCube' }], directions: [{ id: '2', name: 'Робототехника' }], sites: [], teachers: [], groups: [], children: [], payments: [], refunds: [], lessons: [], 'lesson-deletions': [], notifications: [], 'balance-transfers': [] };
  const statistics = { period: { from: '2026-09-01', to: '2026-09-30' }, filters: { projectId: null, directionId: null },
    summary: { completedLessons: 2, visits: 3, absences: 1, attendancePercent: '75.0', newChildren: 1, leftChildren: 0, activeChildren: 6, averageOccupancyPercent: '75.0' }, groups: [] };
  globalThis.window = { icubeLegacy: { state: {role:'director'}, render() {}, pageHead(title) { return `<header>${title}</header>`; } }, child() { return '<main>child</main>'; }, alert() {} };
  globalThis.document = { querySelector(selector) { return controls[selector] ?? null; } };
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url).replace('/api/v1/', '');
    if (path.startsWith('statistics?')) { statisticsUrl = path; return { ok: true, status: 200, async json() { return { data: statistics }; } }; }
    const resource = path.split('?')[0]; return { ok: true, status: options.method === 'DELETE' ? 204 : 200, async json() { return { data: empty[resource] ?? [] }; } };
  };
  try {
    const module = await import(`../src/frontend/api-sync.mjs?statistics=${Date.now()}`); await globalThis.window.icubeApi.reload();
    assert.deepEqual(module.statisticsDefaultPeriod(new Date(2026, 8, 15)), { from: '2026-09-01', to: '2026-09-30' });
    await globalThis.window.icubeApi.loadStatistics();
    assert.match(statisticsUrl, /from=2026-09-01&to=2026-09-30&projectId=all&directionId=all/);
    const page = globalThis.window.stats(); assert.match(page, /Проведено занятий/); assert.match(page, />2</); assert.match(page, /75,0%/);
  } finally { globalThis.window = originalWindow; globalThis.document = originalDocument; globalThis.fetch = originalFetch; }
});

test('statistics bridge не использует prototype aggregators', async () => {
  const source = await readFile(new URL('../src/frontend/api-sync.mjs', import.meta.url), 'utf8');
  assert.match(source, /api\.list\('statistics'/); assert.match(source, /window\.stats = statisticsPage/);
  assert.doesNotMatch(source, /attendanceSummary|newChildren\(|leftEvents|groupStats/);
});

test('карточка ребёнка отменяет transfer через DELETE и затем делает server reload', async () => {
  const originalWindow = globalThis.window; const originalDocument = globalThis.document; const originalFetch = globalThis.fetch;
  let deleted = false;
  const child = { id: '7', name: 'Ребёнок', status: 'active', needsDirectorReview: false, guardian: null, enrollments: [
    { id: '9', directionId: '1', directionName: 'Робототехника', groupId: null, status: 'finished', individualPrice: null, currentPrice: '1025.00', balanceLessons: '0.00000000' },
    { id: '10', directionId: '2', directionName: 'Программирование', groupId: null, status: 'active', individualPrice: null, currentPrice: '1125.00', balanceLessons: '2.00000000' },
  ] };
  const resources = { projects: [], directions: [], sites: [], teachers: [], groups: [], children: [child], payments: [], refunds: [], lessons: [], 'lesson-deletions': [], notifications: [],
    'balance-transfers': [{ id: '70', childId: '7', sourceEnrollmentId: '9', targetEnrollmentId: '10', sourceDirectionName: 'Робототехника', targetDirectionName: 'Программирование', transferredAmount: '2050.00', targetLessonsCredit: '1.82222222', transferredAt: '2026-09-15 12:00:00' }] };
  globalThis.window = { icubeLegacy: { state: { selectedChild: 7, childTab: 'overview' }, render() {}, pageHead() { return ''; } }, child() { return '<main>Карточка</main>'; }, alert() {} };
  globalThis.document = { querySelector() { return null; } };
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url).replace('/api/v1/', '');
    if (path === 'balance-transfers/70' && options.method === 'DELETE') { deleted = true; resources['balance-transfers'] = []; return { ok: true, status: 204, async json() { return null; } }; }
    if (path.startsWith('statistics?')) return { ok: true, status: 200, async json() { return { data: { summary: {}, groups: [] } }; } };
    return { ok: true, status: 200, async json() { return { data: resources[path.split('?')[0]] ?? [] }; } };
  };
  try {
    await import(`../src/frontend/api-sync.mjs?transfer-reversal=${Date.now()}`); await globalThis.window.icubeApi.reload();
    assert.match(globalThis.window.child(), /Отменить перенос/);
    globalThis.window.icubeApi.cancelBalanceTransferPrompt(70); assert.match(globalThis.window.icubeLegacy.state.modal, /Остаток будет возвращён/);
    await globalThis.window.icubeApi.cancelBalanceTransfer(70); assert.equal(deleted, true); assert.doesNotMatch(globalThis.window.child(), /Отменить перенос/);
  } finally { globalThis.window = originalWindow; globalThis.document = originalDocument; globalThis.fetch = originalFetch; }
});

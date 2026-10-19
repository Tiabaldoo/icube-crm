import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {installQuickStatusUi,formatBalance,balanceBadge,lessonEnrollment,directionClass,logicalEnrollments} from '../src/frontend/quick-status.mjs';
async function loadFrontend() {
  const source = await readFile(new URL('../src/frontend/crm-ui.js', import.meta.url), 'utf8');
  const app = { innerHTML: '' };
  const elementsById = new Map([['app', app]]);
  const classNames = new Set();
  const document = {
    body: {
      style: {},
      classList: {
        add: (...names) => names.forEach((name) => classNames.add(name)),
        remove: (...names) => names.forEach((name) => classNames.delete(name)),
        contains: (name) => classNames.has(name),
      },
    },
    documentElement: { style: {} },
    head: { appendChild(element) { if (element.id) elementsById.set(element.id, element); } },
    getElementById: (id) => elementsById.get(id) ?? null,
    createElement: () => ({ style: {}, className: '', textContent: '', appendChild: () => {} }),
    querySelector(selector) {
      if (selector === '#app') return app;
      if (selector === '.modal-backdrop') return app.innerHTML.includes('modal-backdrop') ? {} : null;
      return null;
    },
    querySelectorAll: () => [],
    addEventListener: () => {},
  };
  const context = vm.createContext({
    console,
    document,
    alert: () => {},
    requestAnimationFrame: (callback) => callback(),
    setTimeout: () => 0,
    clearTimeout: () => {},
    scrollY: 0,
    pageYOffset: 0,
    scrollTo: () => {},
    addEventListener: () => {},
    Intl,
    Date,
    Math,
    Map,
    Set,
    Object,
    Array,
    Number,
    String,
    Boolean,
    RegExp,
    JSON,
    MutationObserver: class { observe() {} disconnect() {} },
  });
  context.window = context;
  context.globalThis = context;
  vm.runInContext(`${source}\n;globalThis.__regressionProbe={state};`, context, { filename: 'crm-ui.js' });
  return { context, state: context.__regressionProbe.state };
}

const enrollment=(id,directionId,direction,balance,groupId=4)=>({id,directionId,direction,balance,groupId,projectId:1,project:'iCubeRobots',status:'Активный'});
async function fixture(){
 const f=await loadFrontend(),{context,state}=f;installQuickStatusUi(context.icubeLegacy,context,context.document);
 Object.assign(state,{role:'director',page:'lesson',selectedLesson:50,selectedChild:8,selectedGroup:4,childTab:'overview',
  sites:[{id:2,name:'Школа'}],teachers:[{id:1,name:'Учитель',active:true}],projects:[{id:1,name:'iCubeRobots'}],payments:[],refunds:[],
  groups:[{id:4,direction:'Смешанная',isMixed:true,project:'iCubeRobots',projectId:1,siteId:2,teacherId:1,active:true,time:'12:30–13:30'}],
  children:[{id:8,name:'Оченьдлиннаяфамилия Константин',status:'Активный',parent:'Родитель',enrollments:[enrollment(80,1,'Робототехника',3),enrollment(81,2,'Программирование',2.4444444)]}],
  lessons:[{id:50,groupId:4,teacherId:1,projectId:1,date:'16.10.2026',time:'12:30–13:30',started:true,done:true,attendance:{8:true},trialChildren:{},extras:[],photos:{},
   groupRosterFrozenV146:true,groupChildIdsV146:[8],effectiveGroupChildIds:[8],enrollmentByChild:{8:81},attendanceDetailsByChild:{8:{enrollmentId:81,directionName:'Программирование'}}}]
 });return f;
}
for(const [input,expected] of [[3,'3'],[2.5,'2,5'],[2.4444444,'2,44'],[-1,'−1'],[0,'0'],[0.001,'<0,01'],[-0.001,'−<0,01'],[null,'—'],['','—'],['bad','—']]) test(`compact balance ${input} is ${expected} without data mutation`,()=>{
 assert.equal(formatBalance(input),expected);
 const e={direction:'Робототехника',balance:input},before=JSON.stringify(e);const html=balanceBadge(e);
 assert.ok(html.includes(expected.replaceAll('<','&lt;')));assert.equal(JSON.stringify(e),before);
 if(Number.isFinite(Number(input))&&input!==null&&input!=='')assert.match(html,new RegExp(`badge ${Number(input)>0?'green':'red'}`));
});
test('lesson balances resolve pinned attendance, selected extra and trial; ambiguous or missing direction stays neutral',()=>{
 const child={id:8,enrollments:[enrollment(80,1,'Робототехника',3),enrollment(81,2,'Программирование',1)]};
 const group={id:4,projectId:1,isMixed:true};const lesson={groupId:4,projectId:1,enrollmentByChild:{8:81}};
 const before=JSON.stringify(child);assert.equal(lessonEnrollment(child,lesson,group).id,81);
 lesson.attendanceDetailsByChild={8:{enrollmentId:80}};assert.equal(lessonEnrollment(child,lesson,group).id,80);
 delete lesson.attendanceDetailsByChild;delete lesson.enrollmentByChild;
 lesson.extras=[{childId:8,enrollmentId:81,trial:true,present:false}];assert.equal(lessonEnrollment(child,lesson,group).balance,1);
 lesson.extras[0].enrollmentId=999;assert.equal(lessonEnrollment(child,lesson,group),null);
 lesson.extras=[];assert.equal(lessonEnrollment(child,lesson,group),null);
 child.enrollments[0].groupId=99;assert.equal(lessonEnrollment(child,lesson,group).id,81);
 child.enrollments[0].groupId=4;assert.equal(JSON.stringify(child),before);
 assert.equal(directionClass('Смешанная'),'');
});
test('historical attendance pin resolves only the matching current direction, never a different balance',()=>{
 const child={id:8,enrollments:[enrollment(81,2,'Программирование',1)],enrollmentHistory:[enrollment(70,1,'Робототехника',99)]};
 assert.equal(lessonEnrollment(child,{enrollmentByChild:{8:70}},{}),null);
 child.enrollments.push(enrollment(80,1,'Робототехника',3));assert.equal(lessonEnrollment(child,{enrollmentByChild:{8:70}},{}).id,80);
});
test('final main/extra lesson rows put balance before attendance to the right of name, keep photo slots and update direction color',async()=>{
 const {context,state}=await fixture();const child=state.children[0],lesson=state.lessons[0];
 const before=JSON.stringify({child,lesson});
 for(const extra of [false,true]){
  if(extra)lesson.extras=[{childId:8,enrollmentId:81,present:false,trial:true}];
  const html=context.studentCheck(child,lesson,extra);
  assert.match(html,/name-capsule direction-code/);assert.match(html,/title="Программирование">2,44/);
  assert.ok(html.indexOf('lesson-student-name-cell')<html.indexOf('lesson-student-balance-slot'));
  assert.ok(html.indexOf('lesson-student-balance-slot')<html.indexOf('lesson-student-attendance-slot'));
  assert.match(html,/icubeOpenLessonChild\(8\)/);
  for(const slot of ['lesson-photo-control-slot','lesson-student-more-slot','lesson-student-trial-slot'])assert.ok(html.includes(slot));
 }
 lesson.extras=[];assert.equal(JSON.stringify({child,lesson}),before);
 lesson.enrollmentByChild[8]=80;lesson.attendanceDetailsByChild[8].enrollmentId=80;
 assert.match(context.studentCheck(child,lesson,false),/name-capsule direction-robot/);
 assert.match(context.studentCheck(child,lesson,false),/title="Робототехника">3/);
 delete lesson.enrollmentByChild;delete lesson.attendanceDetailsByChild;
 const unknown=context.studentCheck(child,lesson,false);assert.doesNotMatch(unknown,/name-capsule direction-/);assert.match(unknown,/badge gray group-balance-badge/);
 state.role='teacher';assert.doesNotMatch(context.studentCheck(child,lesson,false),/icubeOpenLessonChild/);
 context.icubeTemporaryTeacherParentRole=()=> 'director';assert.match(context.studentCheck(child,lesson,false),/icubeOpenLessonChild/);
});
test('director lesson, teacher prestart and group roster share independent right-hand balance and status columns',async()=>{
 const {context,state}=await fixture();let html=context.lesson();
 assert.match(html,/lesson-summary-row[\s\S]*name-capsule direction-code/);assert.match(html,/roster-balance[\s\S]*title="Программирование">2,44[\s\S]*roster-status/);
 state.lessons[0].started=false;state.lessons[0].done=false;
 html=context.teacherLesson();assert.match(html,/teacher-prestart-child lesson-summary-row[\s\S]*name-capsule direction-code/);assert.match(html,/title="Программирование">2,44/);
 html=context.group();assert.match(html,/group-roster-row/);assert.match(html,/roster-balance[\s\S]*roster-status/);
 const css=await readFile(new URL('../src/ui/styles.css',import.meta.url),'utf8');
 const final=css.slice(css.indexOf('/* Shared roster columns:'));
 assert.match(final,/grid-template-columns:minmax\(0,1fr\) 64px 112px/);
 assert.match(final,/lesson-student-name-cell\{grid-column:1!important/);
 assert.match(final,/lesson-student-balance-slot\{grid-column:2!important/);
 assert.match(final,/lesson-student-attendance-slot\{grid-column:3!important/);
 assert.match(final,/lesson-photo-summary-slot\{grid-column:4!important/);
 assert.match(final,/lesson-photo-add-slot\{grid-column:4!important;grid-row:2!important/);
 assert.match(final,/white-space:normal!important/);
});
test('overview two current directions have independent quick badges; single direction has none and settings remain',async()=>{
 const {context,state}=await fixture();let html=context.child();
 assert.match(html,/icubeQuickEnrollmentStatus\(80,this\)/);assert.match(html,/icubeQuickEnrollmentStatus\(81,this\)/);
 assert.equal((html.match(/>Настройки направления<\/button>/g)||[]).length,2);
 state.children[0].enrollments.pop();state.children[0].enrollmentHistory=[enrollment(79,2,'Программирование',0)];
 html=context.child();assert.doesNotMatch(html,/icubeQuickEnrollmentStatus/);assert.match(html,/icubeQuickChildStatus\(8,this\)/);assert.match(html,/>Настройки направления<\/button>/);
 assert.equal(logicalEnrollments(state.children[0]).length,1);
});
test('hidden debts show four fields, retain per-direction count/filter/navigation and do not mutate balances',async()=>{
 const {context,state}=await fixture();const child=state.children[0];
 child.enrollments.forEach((e,i)=>{e.status=i?'Закончил':'Пауза';e.balance=-2.4444444-i;});state.balanceProject='all';
 const before=JSON.stringify(child);assert.match(context.balances(),/Скрытые долги · 2/);assert.doesNotMatch(context.balances(),/id="hidden-debts"/);
 context.toggleHiddenDebts();const html=context.balances();
 assert.match(html,/Ребёнок<\/span><span>Направление<\/span><span>Статус<\/span><span>Баланс/);
 assert.match(html,/badge amber">Пауза/);assert.match(html,/money negative">−2,44/);
 assert.equal((html.match(/class="btn hidden-debt-row" onclick="openChild\(8\)"/g)||[]).length,2);
 assert.equal(JSON.stringify(child),before);context.setBalanceProject('Зебра');assert.doesNotMatch(context.balances(),/Скрытые долги/);
});
test('logout stays in settings via the existing handler; all staff headers expose settings and parent path is unchanged',async()=>{
 const source=await readFile(new URL('../src/frontend/api-sync.mjs',import.meta.url),'utf8');
 for(const role of ['director','partner','teacher']){
  const state={role,page:role==='teacher'?'teacherToday':'dashboard'};
  const host={settings:()=>'<main>Настройки</main>',shell:()=>'<div><select class="role-switch"></select><div class="muted mini">Режим прототипа</div></div>',openLesson(){}};
  let renders=0;const context=vm.createContext({window:host,legacy:{state,render(){renders++;}},authProfile:{displayName:'Имя',roles:[role]},html:s=>s,temporaryTeacherParentRole:()=>null,teacherNameForShell:()=> 'Учитель',globalThis:{}});
  const start=source.indexOf('function accountSettings()'),shellEnd=source.indexOf('function accessBlock(',start);
  vm.runInContext(source.slice(start,shellEnd),context);context.installAuthenticatedShells();
  const header=role==='teacher'?host.teacherShell('lesson'):host.shell();
  assert.doesNotMatch(header,/icubeAuthLogout|>Выйти</);assert.match(header,/icubeAccountSettings\(\)/);
  host.icubeAccountSettings();assert.match(state.modal,/onclick="icubeAuthLogout\(\)"/);assert.equal(renders,1);
  assert.match(host.settings(),/icubeAuthLogout\(\)/);
 }
 const parent=await readFile(new URL('../src/frontend/parent-portal.mjs',import.meta.url),'utf8');
 assert.match(parent,/parent-logout" data-action="logout"/);assert.match(parent,/action === 'logout'\) window.icubeAuthLogout/);
});
test('frozen roster cannot invent a balance or direction through its temporary membership used for rendering',async()=>{
 const {context,state}=await fixture();const child=state.children[0],lesson=state.lessons[0];
 delete lesson.enrollmentByChild;delete lesson.attendanceDetailsByChild;
 child.enrollments.forEach(e=>{e.groupId=99;e.effectiveGroupId=99;});const before=JSON.stringify(child);
 const output=context.teacherLesson();assert.match(output,/Оченьдлиннаяфамилия/);
 assert.match(output,/badge gray group-balance-badge/);assert.doesNotMatch(output,/name-capsule direction-/);
 assert.equal(JSON.stringify(child),before);
 child.enrollments=[];assert.match(context.teacherLesson(),/badge gray group-balance-badge/);
 assert.deepEqual(child.enrollments,[]);
});

test('palette reuses existing orange programming and calendar teal tokens without recoloring project badges',async()=>{
 const [css,ui]=await Promise.all([readFile(new URL('../src/ui/styles.css',import.meta.url),'utf8'),readFile(new URL('../src/frontend/crm-ui.js',import.meta.url),'utf8')]);
 assert.match(css,/--direction-robot:#3b82f6/);assert.match(css,/--direction-code:#f97316/);
 assert.match(css,/\.badge\.blue\{background:var\(--accent2\);color:var\(--direction-robot-text\)/);
 assert.match(css,/\.badge\.purple\{background:var\(--purplebg\);color:var\(--purple\)/);
 assert.match(css,/\.name-capsule\.direction-code,\.badge\.direction-code\{background:var\(--direction-code-bg\);color:var\(--direction-code-text\)/);
 assert.match(css,/\.badge\.mixed\{color:var\(--mixed-color\);background:var\(--mixed-tint\)/);
 assert.match(css,/\.event\.crm-direction-mixed[^\{]*\{[^}]*var\(--mixed-color\)[^}]*var\(--mixed-tint\)/);
 assert.match(css,/\.group-card\.crm-direction-mixed\{[^}]*var\(--mixed-color\)[^}]*var\(--mixed-tint\)/);
 assert.doesNotMatch(css,/\.direction-(?:code|robot)\{border-left:/);
 const runtime=ui.slice(ui.indexOf('/* Unified direction palette:'),ui.indexOf('  installStyles();',ui.indexOf('/* Unified direction palette:')));
 assert.doesNotMatch(runtime,/badge\.purple:first-child/);
 assert.match(runtime,/\.event\.partner:not\(\.crm-direction-mixed\):not\(\.event-cancelled\)/);
 assert.match(runtime,/\.group-card\.crm-direction-program \.badge\.direction-code/);
 assert.doesNotMatch(runtime,/#f97316|#fff7ed|#ffedd5|#c2410c/,'runtime styles consume the existing palette through shared variables');
 const {context,state}=await fixture();state.groups[0].isMixed=false;state.groups[0].direction='Программирование';state.groups[0].project='Зебра';
 assert.match(context.groups(),/badge direction-code">Программирование<\/span>[\s\S]*badge purple">Зебра<\/span>/);
 state.groups[0].direction='Робототехника';state.groups[0].project='iCubeRobots';
 assert.match(context.groups(),/badge blue">Робототехника<\/span>[\s\S]*badge blue">iCubeRobots<\/span>/);
 state.groups[0].isMixed=true;state.groups[0].direction='Смешанная';assert.match(context.groups(),/badge mixed">Смешанная/);
});

test('mixed lesson name capsules use the pinned visit, including another-group extra, without coloring the row or moving controls',async()=>{
 const {context,state}=await fixture();const child=state.children[0],lesson=state.lessons[0];child.enrollments[0].groupId=99;
 for(const [id,accent] of [[80,'direction-robot'],[81,'direction-code']]){
  lesson.enrollmentByChild={8:id};lesson.attendanceDetailsByChild={8:{enrollmentId:id}};
  lesson.extras=[{childId:8,enrollmentId:id,present:true}];const before=JSON.stringify({child,lesson});
  for(const extra of [false,true]){
   const html=context.studentCheck(child,lesson,extra);
   assert.match(html,new RegExp(`class="lesson-child-link name-capsule ${accent}" onclick="icubeOpenLessonChild\\(8\\)"`));
   assert.match(html,/<div class="student-check lesson-student-card">/);assert.doesNotMatch(html,/<div class="[^"]*(?:lesson-student-card|lesson-summary-row) direction-/);
   assert.match(html,/lesson-student-balance-slot/);assert.match(html,/lesson-student-attendance-slot/);
  }
  assert.equal(JSON.stringify({child,lesson}),before);
 }
 lesson.isMixed=false;assert.doesNotMatch(context.studentCheck(child,lesson,false),/name-capsule/);
 lesson.isMixed=true;lesson.attendanceDetailsByChild={8:{enrollmentId:999}};assert.doesNotMatch(context.studentCheck(child,lesson,false),/name-capsule/);
});

test('mixed group capsules follow actual membership per direction, deduplicate history, and leave ordinary groups plain',async()=>{
 const {context,state}=await fixture();const child=state.children[0];
 child.enrollments[0].groupId=99;child.enrollmentHistory=[{...child.enrollments[1],id:70,groupHistory:[{groupId:4},{groupId:4}]}];
 let html=context.group();assert.match(html,/name-capsule direction-code/);assert.doesNotMatch(html,/name-capsule direction-robot/);
 assert.equal((html.match(/name-capsule direction-code/g)||[]).length,1);
 child.enrollments[0].groupId=4;html=context.group();
 assert.equal((html.match(/name-capsule direction-code/g)||[]).length,1);assert.equal((html.match(/name-capsule direction-robot/g)||[]).length,1);
 assert.equal((html.match(/group-roster-row/g)||[]).length,1,'two directions remain in the existing single child row');
 assert.match(html,/roster-balance[\s\S]*roster-status/);assert.match(html,/onclick="openChild\(8\)"/);
 state.groups[0].isMixed=false;state.groups[0].direction='Робототехника';assert.doesNotMatch(context.group(),/name-capsule/);
});

test('name capsule is shared by group and lesson and wraps within its name column without changing photo/action layout',async()=>{
 const css=await readFile(new URL('../src/ui/styles.css',import.meta.url),'utf8');
 const capsule=css.match(/\.name-capsule\{([^}]+)\}/)?.[1];assert.ok(capsule);
 for(const rule of ['display:inline-block','width:fit-content','max-width:100%','border-radius:999px','white-space:normal','overflow-wrap:break-word','word-break:normal'])assert.ok(capsule.includes(rule),rule);
 assert.doesNotMatch(capsule,/(?:^|;)width:100%|border-left/);
 const {context,state}=await fixture();state.children[0].name='Оченьдлиннаяфамилия Имя Отчество';const html=context.studentCheck(state.children[0],state.lessons[0],false);
 assert.match(html,/name-capsule direction-code[^>]*>Оченьдлиннаяфамилия Имя Отчество<\/button>/);
 for(const slot of ['lesson-photo-control-slot','lesson-student-more-slot','lesson-student-trial-slot'])assert.ok(html.includes(slot));
});

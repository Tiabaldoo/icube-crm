/* iCube CRM: единый снимок рабочего интерфейса. Порядок секций сохраняет поведение прототипа. */

/* ===== Стабилизированный раздел из app.js ===== */
const state = {
 role:'director', page:'dashboard', selectedChild:1, selectedGroup:1, selectedLesson:1,
 children:[
  {id:1,name:'Агафонов Евгений',birth:'2015-04-12',school:'СОШ № 1',grade:'5А',parent:'Агафонова Марина',phone:'+7 914 555-18-04',status:'Активный',note:'Любит конструирование, быстро работает в паре.',enrollments:[{direction:'Робототехника',groupId:1,individualPrice:null,balance:1},{direction:'Программирование',groupId:3,individualPrice:null,balance:3}]},
  {id:2,name:'Петров Максим',birth:'2016-09-03',school:'Гимназия № 2',grade:'4Б',parent:'Петрова Ольга',phone:'+7 924 210-44-31',status:'Активный',note:'',enrollments:[{direction:'Робототехника',groupId:1,individualPrice:null,balance:0}]},
  {id:3,name:'Сидоров Артём',birth:'2015-11-21',school:'СОШ № 6',grade:'5В',parent:'Сидорова Анна',phone:'+7 914 781-33-20',status:'Активный',note:'Иногда приходит на соседнюю группу.',enrollments:[{direction:'Робототехника',groupId:1,individualPrice:null,balance:-1}]},
  {id:4,name:'Козлов Максим',birth:'2014-02-17',school:'Лицей',grade:'6А',parent:'Козлова Ирина',phone:'+7 962 100-77-55',status:'Активный',note:'',enrollments:[{direction:'Робототехника',groupId:2,individualPrice:null,balance:4}]},
  {id:5,name:'Иванов Алексей',birth:'2015-06-08',school:'СОШ № 3',grade:'5Б',parent:'Иванова Светлана',phone:'+7 914 610-20-28',status:'Пауза',note:'Пауза до октября.',enrollments:[{direction:'Робототехника',groupId:2,individualPrice:null,balance:2}]},
  {id:6,name:'Волкова София',birth:'2017-01-19',school:'СОШ № 1',grade:'3А',parent:'Волкова Екатерина',phone:'+7 914 443-19-91',status:'Лид',note:'Была на пробном.',enrollments:[{direction:'Робототехника',groupId:4,individualPrice:null,balance:0}]}
 ],
 groups:[
  {id:1,name:'Роботы · Чт 14:00',direction:'Робототехника',siteId:1,teacherId:1,day:'Четверг',time:'14:00–15:30',project:'iCubeRobots',price:null,active:true},
  {id:2,name:'Роботы · Сб 10:00',direction:'Робототехника',siteId:2,teacherId:2,day:'Суббота',time:'10:00–11:30',project:'iCubeRobots',price:950,active:true},
  {id:3,name:'Scratch · Пт 16:00',direction:'Программирование',siteId:1,teacherId:1,day:'Пятница',time:'16:00–17:30',project:'iCubeRobots',price:null,active:true},
  {id:4,name:'Зебра · Роботы 18:00',direction:'Робототехника',siteId:3,teacherId:2,day:'Среда',time:'18:00–19:30',project:'Зебра',price:null,active:true}
 ],
 sites:[
  {id:1,name:'Школа № 1',type:'Школа',address:'ул. Школьная, 12',note:'Кабинет технологии, 2 этаж'},
  {id:2,name:'ДК «Океан»',type:'ДК',address:'ул. Советская, 18',note:'Малый зал'},
  {id:3,name:'Развивающий центр «Зебра»',type:'Развивающий центр',address:'ул. Молодёжная, 7',note:'Вход со двора'}
 ],
 teachers:[
  {id:1,name:'Иванов Сергей',phone:'+7 914 500-12-11',active:true,directions:['Робототехника','Программирование']},
  {id:2,name:'Смирнова Алина',phone:'+7 924 330-52-70',active:true,directions:['Робототехника']},
  {id:3,name:'Ким Андрей',phone:'+7 914 200-01-09',active:false,directions:['Программирование']}
 ],
 lessons:[
  {id:1,date:'09.09.2026',time:'14:00–15:30',groupId:1,teacherId:1,status:'Запланировано',topic:'',attendance:{1:true,2:true,3:false},extras:[],photos:{},started:false,done:false,intro:false,emptyTrip:false,attendanceApplied:false,summary:null},
  {id:2,date:'09.09.2026',time:'18:00–19:30',groupId:4,teacherId:2,status:'Запланировано',topic:'',attendance:{6:true},extras:[],photos:{},started:false,done:false,intro:false,emptyTrip:false,attendanceApplied:false,summary:null},
  {id:3,date:'10.09.2026',time:'14:00–15:30',groupId:1,teacherId:1,status:'Запланировано',topic:'',attendance:{1:false,2:false,3:false},extras:[],photos:{},started:false,done:false,intro:false,emptyTrip:false,attendanceApplied:false,summary:null},
  {id:4,date:'05.09.2026',time:'10:00–11:30',groupId:2,teacherId:2,status:'Проведено',topic:'Редукторы и передаточное отношение',attendance:{4:true,5:true},extras:[{childId:3,trial:false}],photos:{4:true,5:true,3:true},started:true,done:true,intro:false,emptyTrip:false,attendanceApplied:false,summary:null}
 ],
 payments:[
  {id:1,date:'01.09.2026',childId:1,direction:'Робототехника',amount:4100,method:'На счёт iCube',price:1025,lessons:4},
  {id:2,date:'02.09.2026',childId:2,direction:'Робототехника',amount:4100,method:'На счёт iCube',price:1025,lessons:4},
  {id:3,date:'03.09.2026',childId:4,direction:'Робототехника',amount:3800,method:'На счёт iCube',price:950,lessons:4},
  {id:4,date:'04.09.2026',childId:6,direction:'Робототехника',amount:4100,method:'Наличными партнёру',price:1025,lessons:4}
 ],
 refunds:[{id:1,date:'28.08.2026',childId:5,direction:'Робототехника',amount:1025,price:1025,lessons:1}],
 settings:{robotPrice:1025,codePrice:900,salaryFix:600,salaryChild:100,salaryIntro:600,salaryEmpty:300,tax:4,icubeShare:40,partnerShare:60},
 modal:null
};
const byId=(arr,id)=>arr.find(x=>x.id===Number(id));
const money=n=>new Intl.NumberFormat('ru-RU').format(Number(n||0))+' ₽';
const initials=n=>n.split(' ').slice(0,2).map(x=>x[0]).join('');
const statusBadge=s=>({Активный:'green',Лид:'blue',Пауза:'amber',Закончил:'gray'}[s]||'gray');
const groupChildren=id=>state.children.filter(c=>(c.status==='Активный'||c.status==='Лид')&&c.enrollments.some(e=>e.groupId===id));
const effectivePrice=e=>e?.individualPrice ?? (byId(state.groups,e?.groupId)?.price ?? (e?.direction==='Программирование'?state.settings.codePrice:state.settings.robotPrice));
function navTo(p){state.page=p;render();window.scrollTo({top:0,behavior:'smooth'})}
function openChild(id){state.selectedChild=id;state.page='child';render()}
function openGroup(id){state.selectedGroup=id;state.page='group';render()}
function openLesson(id,teacher=false){state.selectedLesson=id;state.page=teacher?'teacherLesson':'lesson';render()}
function modal(html){state.modal=html;render()}
function closeModal(){state.modal=null;render()}
const navItems=[
 ['dashboard','Главная'],['children','Дети'],['groups','Группы'],['calendar','Календарь'],['payments','Оплаты'],['refunds','Возвраты'],['balances','Балансы / долги'],['teachers','Преподаватели'],['sites','Площадки'],['salary','Зарплата'],['partner','Партнёр'],['stats','Статистика'],['settings','Настройки']
];
function shell(content,title='iCube CRM'){
 return `<div class="app-shell"><aside class="sidebar"><div class="brand"><div class="brand-mark">iC</div><div>iCube CRM</div></div><div class="nav">${navItems.map(([p,l],i)=>`${i===7?'<small>Управление</small>':''}<button class="${state.page===p?'active':''}" onclick="navTo('${p}')">${l}</button>`).join('')}</div></aside><main class="main"><header class="topbar"><div class="crumb">${title}</div><div class="top-actions"><div><select class="role-switch" onchange="state.role=this.value; state.page=this.value==='teacher'?'teacherToday':'dashboard'; render()"><option value="director" ${state.role==='director'?'selected':''}>Директор</option><option value="teacher" ${state.role==='teacher'?'selected':''}>Преподаватель</option></select><div class="muted mini">Режим прототипа</div></div><div class="avatar">ИЯ</div></div></header><div class="content">${content}</div><div class="mobile-nav">${[['dashboard','Главная'],['children','Дети'],['calendar','Календарь'],['payments','Оплаты'],['settings','Ещё']].map(([p,l])=>`<button class="${state.page===p?'active':''}" onclick="navTo('${p}')">${l}</button>`).join('')}</div></main></div>`;
}
function pageHead(title,sub='',action=''){return `<div class="page-head"><div><h1>${title}</h1><div class="muted">${sub}</div></div>${action}</div>`}
function dashboard(){
 const active=state.children.filter(x=>x.status==='Активный').length, leads=state.children.filter(x=>x.status==='Лид').length;
 const low=state.children.filter(c=>c.enrollments.some(e=>e.balance===1)).length, zero=state.children.filter(c=>c.enrollments.some(e=>e.balance===0)).length, debt=state.children.filter(c=>c.enrollments.some(e=>e.balance<0)).length;
 const revenue=state.payments.reduce((a,b)=>a+b.amount,0);
 return pageHead('Главная','Среда, 9 сентября · обзор клуба')+`
 <div class="grid cols-4"><div class="card metric"><div class="label">Активные дети</div><div class="value">${active}</div><div class="sub">+2 за последние 30 дней</div></div><div class="card metric"><div class="label">Лиды</div><div class="value">${leads}</div><div class="sub">1 был на пробном</div></div><div class="card metric"><div class="label">Активные группы</div><div class="value">${state.groups.filter(g=>g.active).length}</div><div class="sub">2 направления</div></div><div class="card metric"><div class="label">Оплаты в сентябре</div><div class="value">${money(revenue)}</div><div class="sub">тестовые данные</div></div></div>
 <div class="grid cols-2" style="margin-top:16px"><div class="card pad"><div class="section-title"><h2>Требует внимания</h2><span class="muted mini">по балансам направлений</span></div><div class="attention"><button class="warn" onclick="navTo('balances')"><span>Осталось 1 занятие</span><b>${low}</b></button><button class="zero" onclick="navTo('balances')"><span>Осталось 0</span><b>${zero}</b></button><button class="debt" onclick="navTo('balances')"><span>Должники</span><b>${debt}</b></button></div></div>
 <div class="card pad"><div class="section-title"><h2>Ближайшие занятия</h2><button class="btn" onclick="navTo('calendar')">Календарь</button></div><div class="list">${state.lessons.filter(l=>!l.done).slice(0,3).map(l=>{let g=byId(state.groups,l.groupId);return `<div class="kpi-line clickable" onclick="openLesson(${l.id})"><div><b>${l.time.split('–')[0]} · ${g.direction}</b><div class="muted mini">${g.name} · ${byId(state.sites,g.siteId).name}</div></div><span class="badge ${g.project==='Зебра'?'purple':'blue'}">${g.project}</span></div>`}).join('')}</div></div></div>
 <div class="card pad" style="margin-top:16px"><div class="section-title"><h2>Сегодня</h2><span class="muted">2 занятия</span></div><div class="grid cols-2">${state.lessons.filter(l=>l.date==='09.09.2026').map(l=>{let g=byId(state.groups,l.groupId);return `<div style="border:1px solid var(--line);border-radius:12px;padding:14px"><div class="muted mini">${l.time}</div><b style="font-size:16px">${g.name}</b><div class="muted">${byId(state.sites,g.siteId).name} · ${byId(state.teachers,l.teacherId).name}</div><button class="btn soft" style="margin-top:12px" onclick="openLesson(${l.id})">Открыть занятие</button></div>`}).join('')}</div></div>`;
}
function children(){
 let rows=state.children.map(c=>`<div class="row clickable" onclick="openChild(${c.id})"><div><b>${c.name}</b><div class="muted mini">${c.school} · ${c.grade}</div></div><div><span class="badge ${statusBadge(c.status)}">${c.status}</span></div><div>${c.enrollments.map(e=>`<div class="mini">${e.direction}</div>`).join('')}</div><div>${c.enrollments.map(e=>`<span class="money ${e.balance<0?'negative':e.balance===0?'':'positive'}">${e.balance}</span>`).join(' / ')}</div><div>›</div></div>`).join('');
 return pageHead('Дети','Один ребёнок — одна карточка, направления и балансы хранятся отдельно','<button class="btn primary" onclick="childForm()">+ Добавить ребёнка</button>')+`<div class="toolbar"><input class="input search" placeholder="Поиск по имени или родителю" oninput="filterRows(this.value)"><select class="select" style="max-width:180px"><option>Все статусы</option><option>Активный</option><option>Лид</option><option>Пауза</option></select></div><div class="card list" id="childRows"><div class="row header"><div>Ребёнок</div><div>Статус</div><div>Направления</div><div>Баланс</div><div></div></div>${rows}</div>`;
}
function filterRows(q){document.querySelectorAll('#childRows .row.clickable').forEach(el=>el.style.display=el.innerText.toLowerCase().includes(q.toLowerCase())?'grid':'none')}
function childForm(id=null){
 const c=id?byId(state.children,id):null;
 modal(`<h3>${c?'Редактировать ребёнка':'Новый ребёнок'}</h3><div class="form-grid"><div class="field span-2"><label>ФИО</label><input class="input" id="cf-name" value="${c?.name||''}" placeholder="Фамилия Имя"></div><div class="field"><label>Дата рождения</label><input class="input" id="cf-birth" type="date" value="${c?.birth||''}"></div><div class="field"><label>Статус</label><select class="select" id="cf-status">${['Лид','Активный','Пауза','Закончил'].map(s=>`<option ${c?.status===s?'selected':''}>${s}</option>`).join('')}</select></div><div class="field"><label>Школа</label><input class="input" id="cf-school" value="${c?.school||''}"></div><div class="field"><label>Класс</label><input class="input" id="cf-grade" value="${c?.grade||''}"></div><div class="field"><label>Родитель</label><input class="input" id="cf-parent" value="${c?.parent||''}"></div><div class="field"><label>Телефон</label><input class="input" id="cf-phone" value="${c?.phone||''}"></div><div class="field span-2"><label>Основная группа</label><select class="select" id="cf-group">${state.groups.map(g=>`<option value="${g.id}" ${c?.enrollments?.[0]?.groupId===g.id?'selected':''}>${g.name}</option>`).join('')}<option value="new">+ Создать группу</option></select><div class="muted mini" style="margin-top:5px">В production это будет searchable select с быстрым созданием связанной сущности.</div></div><div class="field span-2"><label>Примечание</label><textarea class="textarea" id="cf-note">${c?.note||''}</textarea></div></div><div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn primary" onclick="saveChild(${c?.id||'null'})">Сохранить</button></div>`);
}
function saveChild(id){
 const name=document.querySelector('#cf-name').value.trim()||'Новый ребёнок', groupId=Number(document.querySelector('#cf-group').value)||1;
 if(id){
   let c=byId(state.children,id);
   const oldStatus=c.status;
   const oldEnrollment=(c.enrollments||[])[0]||null;
   const oldGroup=oldEnrollment&&oldEnrollment.groupId!=null?byId(state.groups,oldEnrollment.groupId):null;
   const newStatus=document.querySelector('#cf-status').value;
   Object.assign(c,{name,birth:document.querySelector('#cf-birth').value,school:document.querySelector('#cf-school').value,grade:document.querySelector('#cf-grade').value,parent:document.querySelector('#cf-parent').value,phone:document.querySelector('#cf-phone').value,status:newStatus,note:document.querySelector('#cf-note').value});
   let g=byId(state.groups,groupId);let e=c.enrollments.find(x=>x.direction===g.direction);if(e)e.groupId=groupId;
   if(oldStatus!==newStatus){
     const now=new Date();
     const localDate=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
     c.statusHistory=c.statusHistory||[];
     c.statusHistory.push({
       from:oldStatus,
       to:newStatus,
       date:localDate,
       project:oldGroup?.project||null,
       direction:oldEnrollment?.direction||null
     });
     // Store the latest status change directly on the child as the source of truth
     // for current "Ушли" statistics.
     c.statusChangedAt=localDate;
     c.statusChangedProject=oldGroup?.project||null;
     c.statusChangedDirection=oldEnrollment?.direction||null;
   }
 }
 else{let nid=Math.max(...state.children.map(x=>x.id))+1;state.children.push({id:nid,name,birth:document.querySelector('#cf-birth').value,school:document.querySelector('#cf-school').value,grade:document.querySelector('#cf-grade').value,parent:document.querySelector('#cf-parent').value,phone:document.querySelector('#cf-phone').value,status:document.querySelector('#cf-status').value,note:document.querySelector('#cf-note').value,enrollments:[{direction:byId(state.groups,groupId).direction,groupId,individualPrice:null,balance:0}],statusHistory:[],createdAt:new Date().toISOString()});state.selectedChild=nid;}
 state.modal=null;state.page='child';render();
}
function child(){
 const c=byId(state.children,state.selectedChild); if(!c)return children();
 return '<button class="btn" style="margin-bottom:14px" onclick="navTo(\'children\')">← Дети</button>'+pageHead(c.name,`${c.school} · ${c.grade} · ${c.parent}`,`<button class="btn" onclick="childForm(${c.id})">Редактировать</button>`)+`
 <div class="tabs"><button class="active">Обзор</button><button>Оплаты</button><button>Посещения</button><button>Возвраты</button></div><div class="split"><div class="card pad"><div class="section-title"><h2>Направления</h2><span class="badge ${statusBadge(c.status)}">${c.status}</span></div>${c.enrollments.map(e=>{let g=byId(state.groups,e.groupId);return `<div style="border-top:1px solid var(--line);padding:14px 0"><div style="display:flex;justify-content:space-between;gap:12px"><div><b>${e.direction}</b><div class="muted">${g?.name||'Без группы'}</div></div><div style="text-align:right"><div class="money ${e.balance<0?'negative':e.balance>0?'positive':''}">${e.balance} занятий</div><div class="muted mini">${money(effectivePrice(e))} / занятие</div></div></div><button class="btn soft" style="margin-top:10px" onclick="paymentForm(${c.id},'${e.direction}')">+ Оплата</button></div>`}).join('')}</div>
 <div class="card pad"><div class="section-title"><h2>Контакты и данные</h2></div><div class="info-list"><div class="info-line"><span>Дата рождения</span><b>${c.birth}</b></div><div class="info-line"><span>Родитель</span><b>${c.parent}</b></div><div class="info-line"><span>Телефон</span><b>${c.phone}</b></div><div class="info-line"><span>Примечание</span><span style="text-align:right">${c.note||'—'}</span></div></div></div></div>
 <div class="grid cols-2" style="margin-top:16px"><div class="card pad"><div class="section-title"><h2>Последние оплаты</h2><button class="btn" onclick="navTo('payments')">Все</button></div>${state.payments.filter(p=>p.childId===c.id).map(p=>`<div class="kpi-line"><div><b>${p.direction}</b><div class="muted mini">${p.date} · ${p.method}</div></div><div class="money positive">+${p.lessons} · ${money(p.amount)}</div></div>`).join('')||'<div class="empty">Оплат пока нет</div>'}</div><div class="card pad"><div class="section-title"><h2>История посещений</h2></div><div class="kpi-line"><div><b>05.09 · Робототехника</b><div class="muted mini">Редукторы и передаточное отношение</div></div><span class="badge green">Был</span></div><div class="kpi-line"><div><b>29.08 · Робототехника</b><div class="muted mini">Зубчатые передачи</div></div><span class="badge green">Был</span></div></div></div>`;
}
function groups(){
 return pageHead('Группы','Регулярное расписание, площадка, преподаватель, проект и цена','<button class="btn primary" onclick="groupForm()">+ Новая группа</button>')+`<div class="grid cols-3">${state.groups.map(g=>`<div class="card pad clickable" onclick="openGroup(${g.id})"><div style="display:flex;justify-content:space-between;gap:8px"><span class="badge ${g.project==='Зебра'?'purple':'blue'}">${g.project}</span><span class="badge ${g.active?'green':'gray'}">${g.active?'Активна':'Неактивна'}</span></div><h3 style="margin:14px 0 5px">${g.name}</h3><div class="muted">${g.direction}</div><div class="info-list" style="margin-top:12px"><div class="info-line"><span>Когда</span><b>${g.day}, ${g.time}</b></div><div class="info-line"><span>Площадка</span><b>${byId(state.sites,g.siteId).name}</b></div><div class="info-line"><span>Преподаватель</span><b>${byId(state.teachers,g.teacherId).name}</b></div><div class="info-line"><span>Детей</span><b>${groupChildren(g.id).length}</b></div><div class="info-line"><span>Цена</span><b>${g.price?money(g.price):'Наследуется'}</b></div></div></div>`).join('')}</div>`;
}
function groupForm(){modal(`<h3>Новая группа</h3><div class="form-grid"><div class="field span-2"><label>Название</label><input class="input" id="gf-name" value="Новая группа"></div><div class="field"><label>Направление</label><select class="select" id="gf-dir"><option>Робототехника</option><option>Программирование</option></select></div><div class="field"><label>Проект</label><select class="select" id="gf-project"><option>iCubeRobots</option><option>Зебра</option></select></div><div class="field"><label>Площадка</label><select class="select" id="gf-site">${state.sites.map(s=>`<option value="${s.id}">${s.name}</option>`).join('')}</select></div><div class="field"><label>Преподаватель</label><select class="select" id="gf-teacher">${state.teachers.filter(t=>t.active).map(t=>`<option value="${t.id}">${t.name}</option>`).join('')}</select></div><div class="field"><label>День</label><select class="select" id="gf-day"><option>Понедельник</option><option>Вторник</option><option>Среда</option><option>Четверг</option><option>Пятница</option><option>Суббота</option></select></div><div class="field"><label>Время</label><input class="input" id="gf-time" value="15:00–16:30"></div><div class="field span-2"><label>Специальная цена, ₽ (необязательно)</label><input class="input" id="gf-price" type="number" placeholder="Пусто = цена направления"></div></div><div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn primary" onclick="saveGroup()">Создать</button></div>`)}
function saveGroup(){let id=Math.max(...state.groups.map(x=>x.id))+1;state.groups.push({id,name:document.querySelector('#gf-name').value,direction:document.querySelector('#gf-dir').value,siteId:Number(document.querySelector('#gf-site').value),teacherId:Number(document.querySelector('#gf-teacher').value),day:document.querySelector('#gf-day').value,time:document.querySelector('#gf-time').value,project:document.querySelector('#gf-project').value,price:Number(document.querySelector('#gf-price').value)||null,active:true});state.selectedGroup=id;state.modal=null;state.page='group';render()}
function group(){
 const g=byId(state.groups,state.selectedGroup), kids=groupChildren(g.id);
 return '<button class="btn" style="margin-bottom:14px" onclick="navTo(\'groups\')">← Группы</button>'+pageHead(g.name,`${g.direction} · ${g.project}`,'<button class="btn">Редактировать</button>')+`<div class="split"><div class="card pad"><div class="section-title"><h2>Основные данные</h2><span class="badge green">Активна</span></div><div class="info-line"><span>Регулярное расписание</span><b>${g.day}, ${g.time}</b></div><div class="info-line"><span>Площадка</span><b>${byId(state.sites,g.siteId).name}</b></div><div class="info-line"><span>Основной преподаватель</span><b>${byId(state.teachers,g.teacherId).name}</b></div><div class="info-line"><span>Цена группы</span><b>${g.price?money(g.price):'Наследуется от направления'}</b></div><div class="notice" style="margin-top:12px">Изменение конкретного занятия в календаре не меняет регулярное расписание группы.</div></div><div class="card pad"><div class="section-title"><h2>Основная группа</h2><b>${kids.length} детей</b></div>${kids.map(c=>`<div class="kpi-line clickable" onclick="openChild(${c.id})"><div><b>${c.name}</b><div class="muted mini">${c.parent}</div></div><span class="badge ${statusBadge(c.status)}">${c.status}</span></div>`).join('')||'<div class="empty">Нет детей</div>'}</div></div>`;
}
function sites(){return pageHead('Площадки','Места проведения занятий','<button class="btn primary" onclick="simpleAdd(\'site\')">+ Площадка</button>')+`<div class="grid cols-3">${state.sites.map(s=>`<div class="card pad"><span class="badge gray">${s.type}</span><h3>${s.name}</h3><div class="muted">${s.address}</div><div style="margin-top:13px">${s.note}</div><div class="muted mini" style="margin-top:12px">${state.groups.filter(g=>g.siteId===s.id).length} групп</div></div>`).join('')}</div>`}
function teachers(){return pageHead('Преподаватели','Контакты, направления и активность','<button class="btn primary" onclick="simpleAdd(\'teacher\')">+ Преподаватель</button>')+`<div class="card list"><div class="row header"><div>Преподаватель</div><div>Телефон</div><div>Направления</div><div>Статус</div><div></div></div>${state.teachers.map(t=>`<div class="row"><div><b>${t.name}</b></div><div>${t.phone}</div><div>${t.directions.join(', ')}</div><div><span class="badge ${t.active?'green':'gray'}">${t.active?'Активен':'Неактивен'}</span></div><div>•••</div></div>`).join('')}</div>`}
function simpleAdd(type){modal(`<h3>${type==='site'?'Новая площадка':'Новый преподаватель'}</h3><div class="notice">В v1 показан UX быстрого создания. Полная форма появится после проверки структуры интерфейса.</div><div class="field" style="margin-top:14px"><label>Название / ФИО</label><input class="input" id="simple-name"></div><div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn primary" onclick="closeModal()">Сохранить</button></div>`)}
function calendar(){
 const days=['07.09','08.09','09.09','10.09','11.09','12.09','13.09'];return pageHead('Календарь','Конкретные занятия создаются из регулярного расписания, но могут меняться отдельно','<button class="btn">Сегодня</button>')+`<div class="toolbar"><button class="btn soft">Неделя</button><button class="btn">Месяц</button><select class="select" style="max-width:220px"><option>Все проекты</option><option>iCubeRobots</option><option>Зебра</option></select></div><div class="calendar">${days.map(d=>`<div class="day"><div class="date">${d}${d==='09.09'?' · сегодня':''}</div>${state.lessons.filter(l=>l.date.startsWith(d)).map(l=>{let g=byId(state.groups,l.groupId);return `<div class="event ${g.project==='Зебра'?'partner':''} ${l.done?'done':''}" onclick="openLesson(${l.id})"><b>${l.time.split('–')[0]}</b> ${g.direction}<div>${g.name}</div></div>`}).join('')}</div>`).join('')}</div>`;
}
function lesson(){
 const l=byId(state.lessons,state.selectedLesson),g=byId(state.groups,l.groupId),t=byId(state.teachers,l.teacherId),kids=groupChildren(g.id);
 return '<button class="btn" style="margin-bottom:14px" onclick="navTo(\'calendar\')">← Календарь</button>'+pageHead(`${l.date} · ${g.direction}`,`${l.time} · ${byId(state.sites,g.siteId).name}`,'<button class="btn">Изменить занятие</button>')+`<div class="split"><div class="card pad"><div class="section-title"><h2>Занятие</h2><div class="lesson-status"><span class="badge ${l.done?'green':'blue'}">${l.done?'Проведено':'Запланировано'}</span><span class="badge ${g.project==='Зебра'?'purple':'gray'}">${g.project}</span></div></div><div class="info-line"><span>Группа</span><b>${g.name}</b></div><div class="info-line"><span>Фактический преподаватель</span><b>${t.name}</b></div><div class="info-line"><span>Тема</span><b>${l.topic||'Не указана'}</b></div><div class="info-line"><span>Присутствовало</span><b>${Object.values(l.attendance).filter(Boolean).length+l.extras.length}</b></div><div class="notice" style="margin-top:14px">Директор может задним числом изменить финансовый статус занятия, не меняя посещения и фотографии.</div><div style="display:grid;gap:9px;margin-top:14px"><label class="student-check"><input type="checkbox" ${l.intro?'checked':''} onchange="lToggle('intro',this.checked)"><span><b>Ознакомительное занятие всей группы</b><div class="muted mini">Фиксированная ставка ЗП; преподаватель эту настройку не видит.</div></span></label><label class="student-check"><input type="checkbox" ${l.emptyTrip?'checked':''} onchange="lToggle('emptyTrip',this.checked)"><span><b>Пустой выезд</b><div class="muted mini">Не ставится автоматически при нулевой посещаемости.</div></span></label></div></div><div class="card pad"><div class="section-title"><h2>Посещаемость</h2><button class="btn soft" onclick="state.role='teacher';openLesson(${l.id},true)">Открыть как преподаватель</button></div>${kids.map(c=>`<div class="kpi-line"><b>${c.name}</b><span class="badge ${l.attendance[c.id]?'green':'gray'}">${l.attendance[c.id]?'Был':'Не отмечен'}</span></div>`).join('')}${l.extras.map(e=>`<div class="kpi-line"><div><b>${byId(state.children,e.childId).name}</b><div class="muted mini">Из другой группы</div></div><span class="badge green">Был</span></div>`).join('')}</div></div>`;
}
function lToggle(k,v){byId(state.lessons,state.selectedLesson)[k]=v;render()}
function teacherShell(content){return `<div class="teacher-shell"><div class="teacher-top"><div class="teacher-top-inner"><div><div class="mini" style="color:#98a2b3">iCube CRM · преподаватель</div><b>Иванов Сергей</b></div><div><select class="role-switch" onchange="state.role=this.value;state.page=this.value==='director'?'dashboard':'teacherToday';render()"><option value="teacher">Преподаватель</option><option value="director">Директор</option></select><div class="mini" style="color:#98a2b3">Режим прототипа</div></div></div></div><div class="teacher-content">${content}</div></div>`}
function teacherToday(){
 const ls=state.lessons.filter(l=>l.date==='09.09.2026'&&l.teacherId===1);return `<h1 style="margin:2px 0 4px">Сегодня</h1><div class="muted" style="margin-bottom:18px">Среда, 9 сентября</div>${ls.map(l=>{let g=byId(state.groups,l.groupId);return `<div class="teacher-card" onclick="openLesson(${l.id},true)"><div class="teacher-lesson-head"><div><div class="teacher-time">${l.time.split('–')[0]}</div><h3 style="margin:4px 0">${g.direction}</h3><div class="muted">${g.name}<br>${byId(state.sites,g.siteId).name}</div></div><span class="badge ${l.started?'green':'blue'}">${l.done?'Завершено':l.started?'Идёт':'Скоро'}</span></div><button class="btn primary" style="width:100%;margin-top:14px">Открыть занятие</button></div>`}).join('')}`;
}
function teacherLesson(){
 const l=byId(state.lessons,state.selectedLesson),g=byId(state.groups,l.groupId),kids=groupChildren(g.id);
 return `<button class="btn" onclick="state.page='teacherToday';render()">← Сегодня</button><div style="margin:16px 0"><div class="muted">${l.date} · ${l.time}</div><h1 style="margin:4px 0">${g.direction}</h1><div class="muted">${g.name} · ${byId(state.sites,g.siteId).name}</div></div>
 ${!l.started?`<div class="teacher-card"><h3 style="margin-top:0">Занятие готово</h3><p class="muted">После начала можно отмечать присутствующих, тему и фотографии.</p><button class="btn primary big-action" style="width:100%" onclick="startLesson()">Начать занятие</button></div>`:`
 <div class="teacher-card"><div class="section-title"><h2>Основная группа</h2><span class="badge blue">${kids.length} детей</span></div><div class="attendance">${kids.map(c=>studentCheck(c,l,false)).join('')}</div></div>
 <div class="teacher-card"><div class="section-title"><h2>Добавлены на занятие</h2></div>${l.extras.map(e=>studentCheck(byId(state.children,e.childId),l,true,e)).join('')||'<div class="muted mini">Пока никого</div>'}<div style="margin-top:12px"><input class="input" id="extraSearch" placeholder="Начните вводить фамилию…" oninput="showExtraResults(this.value)"><div id="extraResults"></div></div></div>
 <div class="teacher-card"><label class="field"><label>Тема занятия</label><textarea class="textarea" placeholder="Например: Датчик расстояния" oninput="byId(state.lessons,state.selectedLesson).topic=this.value">${l.topic}</textarea></label></div>
 <div class="teacher-sticky">${l.done?'<div class="teacher-card" style="background:var(--greenbg)"><b style="font-size:18px;color:var(--green)">Занятие завершено ✓</b><div class="muted" style="margin-top:8px">Баланс посещений применён один раз. Пробные посещения не списаны.</div></div>':'<button class="btn primary big-action" onclick="finishLesson()">Завершить занятие</button>'}</div>`}`;
}
function studentCheck(c,l,extra,e){
 const present=extra?true:!!l.attendance[c.id], photo=!!l.photos[c.id];
 return `<div class="student-check">${extra?'<span>✓</span>':`<input type="checkbox" ${present?'checked':''} onchange="attend(${c.id},this.checked)">`}<div><b>${c.name}</b>${extra?'<div class="muted mini">из другой группы</div>':''}${e?.trial?'<span class="badge amber">Ознакомительное</span>':''}${extra?'<label class="mini" style="display:block;margin-top:5px"><input type="checkbox" '+(e?.trial?'checked':'')+' onchange="toggleTrial('+c.id+',this.checked)"> Ознакомительное посещение</label>':''}</div><button class="photo ${photo?'done':''}" onclick="togglePhoto(${c.id})">${photo?'Фото ✓':'📷 Фото'}</button></div>`;
}
function startLesson(){let l=byId(state.lessons,state.selectedLesson);l.started=true;l.status='Идёт';render()}
function attend(id,v){byId(state.lessons,state.selectedLesson).attendance[id]=v;render()}
function togglePhoto(id){let l=byId(state.lessons,state.selectedLesson);l.photos[id]=!l.photos[id];render()}
function showExtraResults(q){
 const box=document.querySelector('#extraResults');if(!q){box.innerHTML='';return}let l=byId(state.lessons,state.selectedLesson),g=byId(state.groups,l.groupId);
 let res=state.children.filter(c=>c.name.toLowerCase().includes(q.toLowerCase())&&!groupChildren(g.id).some(k=>k.id===c.id));
 box.innerHTML=res.slice(0,4).map(c=>`<button class="btn" style="width:100%;margin-top:6px;justify-content:flex-start" onclick="addExtra(${c.id})">${c.name}</button>`).join('');
}
function addExtra(id){let l=byId(state.lessons,state.selectedLesson),g=byId(state.groups,l.groupId),c=byId(state.children,id);if(!l.extras.some(e=>e.childId===id))l.extras.push({childId:id,trial:!c.enrollments.some(e=>e.direction===g.direction)});render()}
function finishLesson(){
 let l=byId(state.lessons,state.selectedLesson), presentIds=Object.entries(l.attendance).filter(([,v])=>v).map(([id])=>Number(id)).concat(l.extras.map(e=>e.childId)), missing=presentIds.filter(id=>!l.photos[id]).length;
 if(missing){modal(`<h3>Не у всех есть фотографии</h3><div class="notice">У ${missing} детей отсутствуют фотографии. Всё равно завершить занятие?</div><div class="modal-actions"><button class="btn" onclick="closeModal()">Вернуться</button><button class="btn primary" onclick="confirmFinish()">Завершить всё равно</button></div>`)}else confirmFinish();
}
function confirmFinish(){let l=byId(state.lessons,state.selectedLesson),g=byId(state.groups,l.groupId);if(!l.attendanceApplied){Object.entries(l.attendance).filter(x=>x[1]).forEach(x=>{let c=byId(state.children,Number(x[0])),e=c&&c.enrollments.find(y=>y.direction===g.direction);if(e)e.balance-=1});l.extras.filter(x=>!x.trial).forEach(x=>{let c=byId(state.children,x.childId),e=c&&c.enrollments.find(y=>y.direction===g.direction);if(e)e.balance-=1});l.attendanceApplied=true}l.summary={present:Object.values(l.attendance).filter(Boolean).length+l.extras.length,trials:l.extras.filter(x=>x.trial).length,missing:Object.entries(l.attendance).filter(x=>x[1]&&!l.photos[x[0]]).length+l.extras.filter(x=>!l.photos[x.childId]).length};l.done=true;l.status='Проведено';state.modal=null;render()}
function payments(){
 return pageHead('Оплаты','Каждая оплата относится к одному ребёнку и одному направлению; цена фиксируется на момент операции','<button class="btn primary" onclick="paymentForm()">+ Оплата</button>')+`<div class="card list"><div class="row header"><div>Ребёнок</div><div>Направление</div><div>Сумма</div><div>Дата</div><div>Занятий</div></div>${state.payments.slice().reverse().map(p=>`<div class="row"><div><b>${byId(state.children,p.childId).name}</b><div class="muted mini">${p.method}</div></div><div>${p.direction}</div><div class="money">${money(p.amount)}</div><div>${p.date}</div><div><span class="badge green">+${Number(p.lessons).toFixed(p.lessons%1?2:0)}</span></div></div>`).join('')}</div>`;
}
function paymentForm(childId=1,direction='Робототехника'){
 modal(`<h3>Новая оплата</h3><div class="form-grid"><div class="field"><label>Дата</label><input class="input" id="pf-date" type="date" value="2026-09-09"></div><div class="field"><label>Ребёнок</label><select class="select" id="pf-child" onchange="updatePaymentPrice()">${state.children.map(c=>`<option value="${c.id}" ${c.id===childId?'selected':''}>${c.name}</option>`).join('')}</select></div><div class="field"><label>Направление</label><select class="select" id="pf-dir" onchange="updatePaymentPrice()"><option ${direction==='Робототехника'?'selected':''}>Робототехника</option><option ${direction==='Программирование'?'selected':''}>Программирование</option></select></div><div class="field"><label>Сумма, ₽</label><input class="input" id="pf-amount" type="number" step="0.01" value="4100" oninput="updatePaymentPrice()"></div><div class="field span-2"><label>Способ получения</label><select class="select" id="pf-method"><option>На счёт iCube</option><option>Наличными партнёру</option></select></div></div><div class="notice" id="pf-calc" style="margin-top:14px"></div><div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn primary" onclick="savePayment()">Сохранить оплату</button></div>`);setTimeout(updatePaymentPrice,0);
}
function currentEnrollment(){let c=byId(state.children,Number(document.querySelector('#pf-child')?.value));return c?.enrollments.find(e=>e.direction===document.querySelector('#pf-dir')?.value)}
function updatePaymentPrice(){let e=currentEnrollment(),price=effectivePrice(e),sum=Number(document.querySelector('#pf-amount')?.value||0),box=document.querySelector('#pf-calc');if(box)box.innerHTML=`Цена на момент оплаты: <b>${money(price)}</b> · будет начислено <b>${(sum/price).toFixed(4).replace(/0+$/,'').replace(/\.$/,'')} занятия</b>. Внутреннее значение не округляется.`}
function savePayment(){let childId=Number(document.querySelector('#pf-child').value),direction=document.querySelector('#pf-dir').value,e=byId(state.children,childId).enrollments.find(x=>x.direction===direction);if(!e){alert('Для теста выберите направление, на которое ребёнок уже записан.');return}let price=effectivePrice(e),amount=Number(document.querySelector('#pf-amount').value),lessons=amount/price;e.balance+=lessons;state.payments.push({id:Date.now(),date:document.querySelector('#pf-date').value.split('-').reverse().join('.'),childId,direction,amount,method:document.querySelector('#pf-method').value,price,lessons});state.modal=null;state.page='payments';render()}
function toggleTrial(id,v){let l=byId(state.lessons,state.selectedLesson),e=l.extras.find(x=>x.childId===id);if(e)e.trial=v;render()}
function refunds(){return pageHead('Возвраты','Отдельный тип финансовой операции — не отрицательная оплата','<button class="btn primary" onclick="refundForm()">+ Возврат</button>')+`<div class="card list"><div class="row header"><div>Ребёнок</div><div>Направление</div><div>Сумма</div><div>Дата</div><div>Баланс</div></div>${state.refunds.map(r=>`<div class="row"><div><b>${byId(state.children,r.childId).name}</b></div><div>${r.direction}</div><div class="money negative">−${money(r.amount)}</div><div>${r.date}</div><div>−${r.lessons}</div></div>`).join('')}</div>`}
function refundForm(){modal('<h3>Новый возврат</h3><div class="form-grid"><div class="field"><label>Дата</label><input class="input" id="rf-date" type="date" value="2026-09-09"></div><div class="field"><label>Ребёнок</label><select class="select" id="rf-child" onchange="refreshRefundDirections()">'+state.children.map(c=>'<option value="'+c.id+'">'+c.name+'</option>').join('')+'</select></div><div class="field"><label>Направление</label><select class="select" id="rf-dir"></select></div><div class="field"><label>Сумма, ₽</label><input class="input" id="rf-amount" type="number" step="0.01" value="1025"></div></div><div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn primary" onclick="saveRefund()">Сохранить</button></div>');setTimeout(refreshRefundDirections,0)}
function refreshRefundDirections(){let c=byId(state.children,Number(document.querySelector('#rf-child')?.value)),box=document.querySelector('#rf-dir');if(box)box.innerHTML=(c?.enrollments||[]).map(e=>'<option>'+e.direction+'</option>').join('')}
function saveRefund(){let childId=Number(document.querySelector('#rf-child').value),direction=document.querySelector('#rf-dir').value,c=byId(state.children,childId),e=c.enrollments.find(x=>x.direction===direction),amount=Number(document.querySelector('#rf-amount').value);if(!e||!amount)return;let price=effectivePrice(e),lessons=amount/price;e.balance-=lessons;state.refunds.push({id:Date.now(),date:document.querySelector('#rf-date').value.split('-').reverse().join('.'),childId,direction,amount,price,lessons});state.modal=null;state.page='refunds';render()}
function balances(){
 const entries=state.children.flatMap(c=>c.enrollments.map(e=>({c,e}))).sort((a,b)=>a.e.balance-b.e.balance);
 return pageHead('Балансы и долги','Баланс отдельно по каждому направлению. Отрицательный баланс не блокирует посещение.')+`<div class="grid cols-3" style="margin-bottom:16px"><div class="card metric"><div class="label">Долг</div><div class="value negative">${entries.filter(x=>x.e.balance<0).length}</div></div><div class="card metric"><div class="label">Ноль</div><div class="value">${entries.filter(x=>x.e.balance===0).length}</div></div><div class="card metric"><div class="label">Осталось 1</div><div class="value" style="color:var(--amber)">${entries.filter(x=>x.e.balance===1).length}</div></div></div><div class="card list"><div class="row header"><div>Ребёнок</div><div>Направление</div><div>Группа</div><div>Цена</div><div>Баланс</div></div>${entries.map(({c,e})=>`<div class="row clickable" onclick="openChild(${c.id})"><div><b>${c.name}</b></div><div>${e.direction}</div><div>${byId(state.groups,e.groupId).name}</div><div>${money(effectivePrice(e))}</div><div class="money ${e.balance<0?'negative':e.balance>0?'positive':''}">${Number(e.balance.toFixed(4))}</div></div>`).join('')}</div>`;
}
function salary(){
 const rows=[{date:'12.08',group:'Роботы · Чт 14:00',n:7,type:'normal'},{date:'19.08',group:'Роботы · Чт 14:00',n:5,type:'normal'},{date:'26.08',group:'Роботы · Чт 14:00',n:0,type:'empty'},{date:'02.09',group:'Роботы · Чт 14:00',n:6,type:'normal'}];
 let total=rows.reduce((s,r)=>s+(r.type==='empty'?state.settings.salaryEmpty:state.settings.salaryFix+r.n*state.settings.salaryChild),0);
 return pageHead('Зарплата','Табель по проведённым занятиям. Преподаватель этот раздел не видит.','<button class="btn">Скачать PDF</button>')+`<div class="toolbar"><select class="select" style="max-width:240px"><option>Иванов Сергей</option><option>Смирнова Алина</option></select><input class="input" type="date" value="2026-08-10" style="max-width:170px"><input class="input" type="date" value="2026-09-10" style="max-width:170px"><button class="btn primary">Применить</button></div><div class="card list"><div class="row header"><div>Дата / группа</div><div>Детей</div><div>Фикс</div><div>За детей</div><div>Итого</div></div>${rows.map(r=>{let fix=r.type==='empty'?state.settings.salaryEmpty:state.settings.salaryFix,child=r.type==='empty'?0:r.n*state.settings.salaryChild,total=fix+child;return `<div class="row"><div><b>${r.date}</b><div class="muted mini">${r.group}${r.type==='empty'?' · Пустой выезд':''}</div></div><div>${r.n}</div><div>${money(fix)}</div><div>${money(child)}</div><div class="money">${money(total)}</div></div>`}).join('')}</div><div class="card pad" style="margin-top:14px;display:flex;justify-content:space-between;font-size:18px"><b>Итого за период</b><b>${money(total)}</b></div>`;
}
function partner(){
 const pay=41000,tax=pay*state.settings.tax/100,salary=10000,dist=pay-tax-salary,icube=dist*state.settings.icubeShare/100,partner=dist*state.settings.partnerShare/100,cash=8000,transfer=partner-cash;
 return pageHead('Партнёрский расчёт','Проект «Зебра» · произвольный период')+`<div class="toolbar"><input class="input" type="date" value="2026-08-25" style="max-width:180px"><input class="input" type="date" value="2026-09-25" style="max-width:180px"><button class="btn primary">Рассчитать</button></div><div class="grid cols-2"><div class="card pad"><div class="section-title"><h2>Расчёт прибыли</h2></div><div class="partner-calc"><div class="calc-line"><span>Все оплаты</span><b>${money(pay)}</b></div><div class="calc-line"><span>Налог ${state.settings.tax}%</span><b class="negative">−${money(tax)}</b></div><div class="calc-line"><span>ЗП преподавателя</span><b class="negative">−${money(salary)}</b></div><div class="calc-line total"><span>К распределению</span><span>${money(dist)}</span></div><div class="calc-line"><span>iCube ${state.settings.icubeShare}%</span><b>${money(icube)}</b></div><div class="calc-line"><span>Екатерина ${state.settings.partnerShare}%</span><b>${money(partner)}</b></div></div></div><div class="card pad"><div class="section-title"><h2>Кто кому переводит</h2></div><div class="calc-line"><span>Доля Екатерины</span><b>${money(partner)}</b></div><div class="calc-line"><span>Уже у Екатерины наличными</span><b>${money(cash)}</b></div><div style="margin-top:18px;padding:18px;border-radius:12px;background:var(--greenbg)"><div class="muted">Перевести Екатерине</div><div style="font-size:30px;font-weight:800;color:var(--green)">${money(transfer)}</div></div><div class="muted mini" style="margin-top:10px">Если наличных у партнёра станет больше итоговой доли, блок автоматически должен показывать сумму к передаче iCube.</div></div></div>`;
}
function stats(){return pageHead('Статистика','Зарезервировано под будущую аналитику; в v1 без сложных отчётов')+`<div class="grid cols-3"><div class="card metric"><div class="label">Средняя посещаемость</div><div class="value">82%</div><div class="progress"><span style="width:82%"></span></div></div><div class="card metric"><div class="label">Занятий в сентябре</div><div class="value">14</div></div><div class="card metric"><div class="label">Средняя группа</div><div class="value">6,4</div></div></div><div class="card pad" style="margin-top:16px"><div class="empty">Здесь позже появятся динамика детей, выручка, долги, наполняемость и эффективность групп.</div></div>`}
function settings(){
 let s=state.settings;
 return pageHead('Настройки','Административные параметры. Исторические операции должны хранить снимок действовавших значений.')+`<div class="card"><div class="settings-block"><h3>Стоимость занятий</h3><div class="setting-row"><div><b>Робототехника</b><div class="muted mini">Базовая цена направления</div></div><input class="input" type="number" value="${s.robotPrice}" onchange="state.settings.robotPrice=Number(this.value)"></div><div class="setting-row"><div><b>Программирование</b><div class="muted mini">Базовая цена направления</div></div><input class="input" type="number" value="${s.codePrice}" onchange="state.settings.codePrice=Number(this.value)"></div></div><div class="settings-block"><h3>Зарплата</h3>${[['Фикс обычного занятия','salaryFix'],['За присутствующего ребёнка','salaryChild'],['Ознакомительное занятие','salaryIntro'],['Пустой выезд','salaryEmpty']].map(([l,k])=>`<div class="setting-row"><div><b>${l}</b></div><input class="input" type="number" value="${s[k]}" onchange="state.settings.${k}=Number(this.value)"></div>`).join('')}</div><div class="settings-block"><h3>Партнёрство</h3>${[['Налог, %','tax'],['Доля iCube, %','icubeShare'],['Доля партнёра, %','partnerShare']].map(([l,k])=>`<div class="setting-row"><div><b>${l}</b></div><input class="input" type="number" value="${s[k]}" onchange="state.settings.${k}=Number(this.value)"></div>`).join('')}<div class="notice" style="margin-top:14px">В production изменение настроек создаёт новую историческую версию и не пересчитывает закрытые операции.</div></div></div>`;
}
function render(){
 let content='',title='iCube CRM';
 if(state.role==='teacher'){if(!['teacherToday','teacherLesson'].includes(state.page))state.page='teacherToday';content=state.page==='teacherLesson'?teacherLesson():teacherToday();document.querySelector('#app').innerHTML=teacherShell(content)+(state.modal?`<div class="modal-backdrop"><div class="modal">${state.modal}</div></div>`:'');return}
 const pages={dashboard,children,child,groups,group,sites,teachers,calendar,lesson,payments,refunds,balances,salary,partner,stats,settings};content=(pages[state.page]||dashboard)();document.querySelector('#app').innerHTML=shell(content,title)+(state.modal?`<div class="modal-backdrop"><div class="modal">${state.modal}</div></div>`:'');
}
render();

/* ===== Стабилизированный раздел из v11.js ===== */
// iCube CRM v1.1 UI extension: child directions management.
// Loaded after app.js so it can safely extend the prototype without touching the main SPA file.

function enrollmentForm(childId, direction) {
  const c = byId(state.children, childId);
  const existing = direction ? c.enrollments.find(e => e.direction === direction) : null;
  const availableDirections = ['Робототехника', 'Программирование'].filter(d =>
    existing || !c.enrollments.some(e => e.direction === d)
  );

  if (!availableDirections.length) {
    alert('Все доступные направления уже добавлены ребёнку.');
    return;
  }

  const selectedDirection = existing ? existing.direction : availableDirections[0];

  let html = '';
  html += '<h3>' + (existing ? 'Изменить направление' : 'Добавить направление') + '</h3>';
  html += '<div class="form-grid">';
  html += '<div class="field"><label>Направление</label>';
  html += '<select class="select" id="ef-dir" ' + (existing ? 'disabled' : 'onchange="refreshEnrollmentGroups()"') + '>';
  availableDirections.forEach(d => {
    html += '<option' + (d === selectedDirection ? ' selected' : '') + '>' + d + '</option>';
  });
  html += '</select></div>';

  html += '<div class="field"><label>Основная группа</label><select class="select" id="ef-group"></select></div>';
  html += '<div class="field span-2"><label>Индивидуальная цена, ₽</label>';
  html += '<input class="input" id="ef-price" type="number" step="0.01" value="' +
    (existing && existing.individualPrice != null ? existing.individualPrice : '') +
    '" placeholder="Пусто = цена группы или направления">';
  html += '<div class="muted mini" style="margin-top:5px">Приоритет цены: индивидуальная → группа → направление.</div></div>';
  html += '</div>';

  html += '<div class="modal-actions">';
  html += '<button class="btn" onclick="closeModal()">Отмена</button>';
  html += '<button class="btn primary" onclick="saveEnrollment(' + childId + ', ' +
    (existing ? "'" + existing.direction + "'" : 'null') + ')">Сохранить</button>';
  html += '</div>';

  modal(html);
  setTimeout(() => refreshEnrollmentGroups(existing ? existing.groupId : null), 0);
}

function refreshEnrollmentGroups(selectedGroupId) {
  const directionSelect = document.querySelector('#ef-dir');
  const groupSelect = document.querySelector('#ef-group');
  if (!directionSelect || !groupSelect) return;

  const direction = directionSelect.value;
  const groups = state.groups.filter(g => g.active && g.direction === direction);

  groupSelect.innerHTML = groups.map(g =>
    '<option value="' + g.id + '"' + (Number(selectedGroupId) === g.id ? ' selected' : '') + '>' +
    g.name + '</option>'
  ).join('');
}

function saveEnrollment(childId, existingDirection) {
  const c = byId(state.children, childId);
  const direction = existingDirection || document.querySelector('#ef-dir').value;
  const groupId = Number(document.querySelector('#ef-group').value);
  const rawPrice = document.querySelector('#ef-price').value;
  const individualPrice = rawPrice === '' ? null : Number(rawPrice);

  let enrollment = c.enrollments.find(e => e.direction === direction);

  if (enrollment) {
    enrollment.groupId = groupId;
    enrollment.individualPrice = individualPrice;
  } else {
    c.enrollments.push({
      direction,
      groupId,
      individualPrice,
      balance: 0
    });
  }

  state.modal = null;
  state.page = 'child';
  render();
}

child = function() {
  const c = byId(state.children, state.selectedChild);
  if (!c) return children();

  let directionsHtml = c.enrollments.map(e => {
    const g = byId(state.groups, e.groupId);
    return '<div style="border-top:1px solid var(--line);padding:14px 0">' +
      '<div style="display:flex;justify-content:space-between;gap:12px">' +
        '<div><b>' + e.direction + '</b><div class="muted">' + (g ? g.name : 'Без группы') + '</div></div>' +
        '<div style="text-align:right"><div class="money ' + (e.balance < 0 ? 'negative' : e.balance > 0 ? 'positive' : '') + '">' +
          e.balance + ' занятий</div>' +
          '<div class="muted mini">' + money(effectivePrice(e)) + ' / занятие</div>' +
          (e.individualPrice != null ? '<div class="badge purple" style="margin-top:5px">Индивидуальная цена</div>' : '') +
        '</div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">' +
        '<button class="btn soft" onclick="paymentForm(' + c.id + ',\'' + e.direction + '\')">+ Оплата</button>' +
        '<button class="btn" onclick="enrollmentForm(' + c.id + ',\'' + e.direction + '\')">Изменить</button>' +
      '</div>' +
    '</div>';
  }).join('');

  const paymentsHtml = state.payments.filter(p => p.childId === c.id).map(p =>
    '<div class="kpi-line"><div><b>' + p.direction + '</b><div class="muted mini">' +
    p.date + ' · ' + p.method + '</div></div><div class="money positive">+' +
    p.lessons + ' · ' + money(p.amount) + '</div></div>'
  ).join('') || '<div class="empty">Оплат пока нет</div>';

  return '<button class="btn" style="margin-bottom:14px" onclick="navTo(\'children\')">← Дети</button>' +
    pageHead(
      c.name,
      c.school + ' · ' + c.grade + ' · ' + c.parent,
      '<button class="btn" onclick="childForm(' + c.id + ')">Редактировать</button>'
    ) +
    '<div class="tabs"><button class="active">Обзор</button><button>Оплаты</button><button>Посещения</button><button>Возвраты</button></div>' +
    '<div class="split">' +
      '<div class="card pad">' +
        '<div class="section-title"><h2>Направления</h2><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
          '<span class="badge ' + statusBadge(c.status) + '">' + c.status + '</span>' +
          '<button class="btn soft" onclick="enrollmentForm(' + c.id + ',null)">+ Добавить направление</button>' +
        '</div></div>' +
        directionsHtml +
      '</div>' +
      '<div class="card pad"><div class="section-title"><h2>Контакты и данные</h2></div>' +
        '<div class="info-list">' +
          '<div class="info-line"><span>Дата рождения</span><b>' + c.birth + '</b></div>' +
          '<div class="info-line"><span>Родитель</span><b>' + c.parent + '</b></div>' +
          '<div class="info-line"><span>Телефон</span><b>' + c.phone + '</b></div>' +
          '<div class="info-line"><span>Примечание</span><span style="text-align:right">' + (c.note || '—') + '</span></div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="grid cols-2" style="margin-top:16px">' +
      '<div class="card pad"><div class="section-title"><h2>Последние оплаты</h2><button class="btn" onclick="navTo(\'payments\')">Все</button></div>' +
        paymentsHtml +
      '</div>' +
      '<div class="card pad"><div class="section-title"><h2>История посещений</h2></div>' +
        '<div class="kpi-line"><div><b>05.09 · Робототехника</b><div class="muted mini">Редукторы и передаточное отношение</div></div><span class="badge green">Был</span></div>' +
        '<div class="kpi-line"><div><b>29.08 · Робототехника</b><div class="muted mini">Зубчатые передачи</div></div><span class="badge green">Был</span></div>' +
      '</div>' +
    '</div>';
};

render();

/* ===== Стабилизированный раздел из v111.js ===== */
// iCube CRM v1.1.1 — groups, sites, group schedule and assigning children.
// This file extends the prototype without changing unrelated CRM areas.

(function () {
  const DAY_SHORT = {
    'Понедельник':'Пн','Вторник':'Вт','Среда':'Ср','Четверг':'Чт',
    'Пятница':'Пт','Суббота':'Сб','Воскресенье':'Вс'
  };
  const DIR_SHORT = {'Робототехника':'Р','Программирование':'П'};

  function minutesToTime(total) {
    total = ((total % 1440) + 1440) % 1440;
    const h = Math.floor(total / 60);
    const m = total % 60;
    return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0');
  }

  function addMinutes(time, minutes) {
    if (!time || time.indexOf(':') < 0) return '';
    const parts = time.split(':').map(Number);
    return minutesToTime(parts[0] * 60 + parts[1] + minutes);
  }

  window.groupTitle = function (g) {
    if (!g) return 'Без группы';
    const site = byId(state.sites, g.siteId);
    const siteName = site ? (site.shortName || site.name) : 'Без площадки';
    return (DIR_SHORT[g.direction] || g.direction) + ', ' +
      (DAY_SHORT[g.day] || g.day) + ', ' + siteName + ', ' + (g.startTime || '—');
  };

  function normalizeSite(site, shortName) {
    if (!site.shortName) site.shortName = shortName || site.name;
  }

  normalizeSite(byId(state.sites,1), 'Школа №1');
  normalizeSite(byId(state.sites,2), 'ДК Океан');
  normalizeSite(byId(state.sites,3), 'Зебра');

  function attachComputedName(g) {
    if (!g.startTime || !g.endTime) {
      const parts = String(g.time || '').split('–');
      g.startTime = g.startTime || parts[0] || '13:00';
      g.endTime = g.endTime || parts[1] || addMinutes(g.startTime, 90);
    }
    g.time = g.startTime + '–' + g.endTime;
    try {
      Object.defineProperty(g, 'name', {
        configurable: true,
        enumerable: true,
        get: function () { return groupTitle(g); },
        set: function () {}
      });
    } catch (e) {}
  }

  state.groups.forEach(attachComputedName);

  window.refreshGroupEndTime = function () {
    const start = document.querySelector('#gf-start');
    const end = document.querySelector('#gf-end');
    if (start && end && start.value) end.value = addMinutes(start.value, 90);
    const preview = document.querySelector('#gf-preview');
    if (preview) {
      const direction = document.querySelector('#gf-dir')?.value;
      const day = document.querySelector('#gf-day')?.value;
      const siteId = Number(document.querySelector('#gf-site')?.value);
      const site = byId(state.sites, siteId);
      preview.textContent = (DIR_SHORT[direction] || direction) + ', ' +
        (DAY_SHORT[day] || day) + ', ' + (site?.shortName || site?.name || '—') + ', ' +
        (start?.value || '—');
    }
  };

  window.refreshGroupPreview = function () {
    const preview = document.querySelector('#gf-preview');
    if (!preview) return;
    const direction = document.querySelector('#gf-dir')?.value;
    const day = document.querySelector('#gf-day')?.value;
    const siteId = Number(document.querySelector('#gf-site')?.value);
    const start = document.querySelector('#gf-start')?.value;
    const site = byId(state.sites, siteId);
    preview.textContent = (DIR_SHORT[direction] || direction) + ', ' +
      (DAY_SHORT[day] || day) + ', ' + (site?.shortName || site?.name || '—') + ', ' +
      (start || '—');
  };

  window.groupForm = function (id) {
    const g = id ? byId(state.groups, id) : null;
    const direction = g?.direction || 'Робототехника';
    const day = g?.day || 'Четверг';
    const start = g?.startTime || '13:00';
    const end = g?.endTime || addMinutes(start,90);

    let html = '<h3>' + (g ? 'Редактировать группу' : 'Новая группа') + '</h3>';
    html += '<div class="notice" style="margin-bottom:14px">Название формируется автоматически: <b id="gf-preview"></b></div>';
    html += '<div class="form-grid">';

    html += '<div class="field"><label>Направление</label><select class="select" id="gf-dir" onchange="refreshGroupPreview()">';
    ['Робототехника','Программирование'].forEach(function(d){
      html += '<option' + (d===direction?' selected':'') + '>' + d + '</option>';
    });
    html += '</select></div>';

    html += '<div class="field"><label>Площадка</label><select class="select" id="gf-site" onchange="refreshGroupPreview()">';
    state.sites.forEach(function(site){
      html += '<option value="' + site.id + '"' + (g?.siteId===site.id?' selected':'') + '>' +
        site.name + ' (' + site.shortName + ')</option>';
    });
    html += '</select></div>';

    html += '<div class="field"><label>День недели</label><select class="select" id="gf-day" onchange="refreshGroupPreview()">';
    Object.keys(DAY_SHORT).forEach(function(d){
      html += '<option' + (d===day?' selected':'') + '>' + d + '</option>';
    });
    html += '</select></div>';

    html += '<div class="field"><label>Начало</label><input class="input" id="gf-start" type="time" step="1800" value="' + start + '" onchange="refreshGroupEndTime()"><div class="muted mini" style="margin-top:4px">Обычно шаг 30 минут; при необходимости можно ввести другое время.</div></div>';
    html += '<div class="field"><label>Окончание</label><input class="input" id="gf-end" type="time" value="' + end + '"><div class="muted mini" style="margin-top:4px">Автоматически +1:30, но поле можно изменить.</div></div>';

    html += '<div class="field"><label>Преподаватель</label><select class="select" id="gf-teacher">';
    state.teachers.forEach(function(t){
      html += '<option value="' + t.id + '"' + (g?.teacherId===t.id?' selected':'') + '>' + t.name + '</option>';
    });
    html += '</select></div>';

    html += '<div class="field"><label>Проект / владелец</label><select class="select" id="gf-project">';
    ['iCubeRobots','Зебра'].forEach(function(p){
      html += '<option' + (p===(g?.project||'iCubeRobots')?' selected':'') + '>' + p + '</option>';
    });
    html += '</select></div>';

    html += '<div class="field"><label>Специальная цена, ₽</label><input class="input" id="gf-price" type="number" step="0.01" value="' + (g?.price ?? '') + '" placeholder="Пусто = цена направления"></div>';
    html += '<div class="field"><label>Активность</label><select class="select" id="gf-active"><option value="true"' + (g?.active!==false?' selected':'') + '>Активна</option><option value="false"' + (g?.active===false?' selected':'') + '>Неактивна</option></select></div>';
    html += '</div>';

    html += '<div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn primary" onclick="saveGroupV111(' + (g?.id || 'null') + ')">' + (g?'Сохранить':'Создать группу') + '</button></div>';
    modal(html);
    setTimeout(refreshGroupPreview,0);
  };

  window.saveGroupV111 = function (id) {
    const data = {
      direction: document.querySelector('#gf-dir').value,
      siteId: Number(document.querySelector('#gf-site').value),
      day: document.querySelector('#gf-day').value,
      startTime: document.querySelector('#gf-start').value,
      endTime: document.querySelector('#gf-end').value,
      teacherId: Number(document.querySelector('#gf-teacher').value),
      project: document.querySelector('#gf-project').value,
      price: document.querySelector('#gf-price').value === '' ? null : Number(document.querySelector('#gf-price').value),
      active: document.querySelector('#gf-active').value === 'true'
    };
    data.time = data.startTime + '–' + data.endTime;

    let g;
    if (id) {
      g = byId(state.groups,id);
      Object.assign(g,data);
    } else {
      const nextId = state.groups.length ? Math.max.apply(null,state.groups.map(function(x){return Number(x.id)||0;})) + 1 : 1;
      g = Object.assign({id:nextId},data);
      state.groups.push(g);
      state.selectedGroup = nextId;
    }
    attachComputedName(g);
    state.modal = null;
    state.page = 'group';
    render();
  };

  window.groups = function () {
    return pageHead('Группы','Регулярное расписание, площадка, преподаватель, проект и цена','<button class="btn primary" onclick="groupForm(null)">+ Новая группа</button>') +
      '<div class="grid cols-3">' +
      state.groups.map(function(g){
        const kids = groupChildren(g.id);
        return '<div class="card pad clickable" onclick="openGroup(' + g.id + ')">' +
          '<div style="display:flex;justify-content:space-between;gap:8px"><span class="badge ' + (g.project==='Зебра'?'purple':'blue') + '">' + g.project + '</span><span class="badge ' + (g.active?'green':'gray') + '">' + (g.active?'Активна':'Неактивна') + '</span></div>' +
          '<h3 style="margin:14px 0 5px">' + g.name + '</h3>' +
          '<div class="muted">' + g.direction + '</div>' +
          '<div class="info-list" style="margin-top:12px">' +
            '<div class="info-line"><span>Время</span><b>' + g.startTime + '–' + g.endTime + '</b></div>' +
            '<div class="info-line"><span>Площадка</span><b>' + byId(state.sites,g.siteId).name + '</b></div>' +
            '<div class="info-line"><span>Преподаватель</span><b>' + byId(state.teachers,g.teacherId).name + '</b></div>' +
            '<div class="info-line"><span>Детей</span><b>' + kids.length + '</b></div>' +
            '<div class="info-line"><span>Цена</span><b>' + (g.price?money(g.price):'Наследуется') + '</b></div>' +
          '</div></div>';
      }).join('') + '</div>';
  };

  function statusMatch(child, filter) {
    if (filter === 'all') return true;
    if (filter === 'active') return child.status === 'Активный';
    if (filter === 'leads') return child.status === 'Лид';
    if (filter === 'pause') return child.status === 'Пауза';
    return true;
  }

  window.addChildrenToGroup = function (groupId) {
    state.addChildrenGroupId = groupId;
    state.addChildrenFilter = 'active';
    modal('<h3>Добавить детей</h3><div class="toolbar" style="margin-bottom:10px"><select class="select" id="ac-filter" onchange="renderAddChildrenList()" style="max-width:220px"><option value="active">Активные</option><option value="leads">Лиды</option><option value="pause">Пауза</option><option value="all">Все</option></select></div><div id="ac-list"></div><div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn primary" id="ac-submit" onclick="confirmAddChildren()">Добавить 0 детей</button></div>');
    setTimeout(renderAddChildrenList,0);
  };

  window.renderAddChildrenList = function () {
    const g = byId(state.groups,state.addChildrenGroupId);
    const filter = document.querySelector('#ac-filter')?.value || state.addChildrenFilter || 'active';
    state.addChildrenFilter = filter;
    const candidates = state.children.filter(function(c){
      if (!statusMatch(c,filter)) return false;
      const e = c.enrollments.find(function(x){return x.direction===g.direction;});
      return !!e && e.groupId == null;
    });
    const box = document.querySelector('#ac-list');
    if (!box) return;
    if (!candidates.length) {
      box.innerHTML = '<div class="empty">Нет подходящих детей с направлением «' + g.direction + '» без основной группы.</div>';
    } else {
      box.innerHTML = candidates.map(function(c){
        const e = c.enrollments.find(function(x){return x.direction===g.direction;});
        return '<label class="student-check"><input type="checkbox" class="ac-check" value="' + c.id + '" onchange="updateAddChildrenCount()"><div><b>' + c.name + '</b><div class="muted mini">' + c.status + ' · баланс ' + Number(e.balance.toFixed(4)) + '</div></div><span class="badge gray">Без группы</span></label>';
      }).join('');
    }
    updateAddChildrenCount();
  };

  window.updateAddChildrenCount = function () {
    const count = document.querySelectorAll('.ac-check:checked').length;
    const btn = document.querySelector('#ac-submit');
    if (btn) btn.textContent = 'Добавить ' + count + (count===1?' ребёнка':' детей');
  };

  window.confirmAddChildren = function () {
    const g = byId(state.groups,state.addChildrenGroupId);
    const ids = Array.from(document.querySelectorAll('.ac-check:checked')).map(function(x){return Number(x.value);});
    ids.forEach(function(id){
      const c = byId(state.children,id);
      const e = c.enrollments.find(function(x){return x.direction===g.direction;});
      if (e && e.groupId == null) e.groupId = g.id;
    });
    state.modal = null;
    render();
  };

  window.group = function () {
    const g = byId(state.groups,state.selectedGroup);
    if (!g) return groups();
    const kids = groupChildren(g.id);
    let kidsHtml = '';
    if (!kids.length) {
      kidsHtml = '<div class="empty" style="padding:22px 4px">Пока нет детей в основной группе.</div>';
    } else {
      kidsHtml = kids.map(function(c){
        return '<div class="kpi-line clickable" onclick="openChild(' + c.id + ')"><div><b>' + c.name + '</b><div class="muted mini">' + c.parent + '</div></div><span class="badge ' + statusBadge(c.status) + '">' + c.status + '</span></div>';
      }).join('');
    }

    return '<button class="btn" style="margin-bottom:14px" onclick="navTo(\'groups\')">← Группы</button>' +
      pageHead(g.name,g.direction + ' · ' + g.project,'<button class="btn" onclick="groupForm(' + g.id + ')">Редактировать</button>') +
      '<div class="split"><div class="card pad"><div class="section-title"><h2>Основные данные</h2><span class="badge ' + (g.active?'green':'gray') + '">' + (g.active?'Активна':'Неактивна') + '</span></div>' +
        '<div class="info-line"><span>Регулярное расписание</span><b>' + g.day + ', ' + g.startTime + '–' + g.endTime + '</b></div>' +
        '<div class="info-line"><span>Площадка</span><b>' + byId(state.sites,g.siteId).name + '</b></div>' +
        '<div class="info-line"><span>Основной преподаватель</span><b>' + byId(state.teachers,g.teacherId).name + '</b></div>' +
        '<div class="info-line"><span>Цена группы</span><b>' + (g.price?money(g.price):'Наследуется от направления') + '</b></div>' +
        '<div class="notice" style="margin-top:12px">Изменение регулярных параметров влияет на будущие занятия; уже проведённые занятия должны хранить свой фактический снимок.</div></div>' +
      '<div class="card pad"><div class="section-title"><h2>Основная группа</h2><div style="display:flex;gap:8px;align-items:center"><b>' + kids.length + ' детей</b><button class="btn soft" onclick="addChildrenToGroup(' + g.id + ')">+ Добавить детей</button></div></div>' +
        kidsHtml +
      '</div></div>';
  };

  window.sites = function () {
    return pageHead('Площадки','Единый справочник мест проведения занятий') +
      '<div class="grid cols-3">' +
      state.sites.map(function(s){
        return '<div class="card pad"><span class="badge gray">' + s.type + '</span><h3 style="margin-bottom:4px">' + s.name + '</h3><div class="badge blue">' + s.shortName + '</div><div class="muted" style="margin-top:12px">' + s.address + '</div><div style="margin-top:13px">' + s.note + '</div><div class="muted mini" style="margin-top:12px">' + state.groups.filter(function(g){return g.siteId===s.id;}).length + ' групп</div></div>';
      }).join('') + '</div>';
  };

  // Direction may exist without a group.
  window.enrollmentForm = function (childId, direction) {
    const c = byId(state.children, childId);
    const existing = direction ? c.enrollments.find(function(e){return e.direction===direction;}) : null;
    const available = ['Робототехника','Программирование'].filter(function(d){
      return existing || !c.enrollments.some(function(e){return e.direction===d;});
    });
    if (!available.length) { alert('Все доступные направления уже добавлены ребёнку.'); return; }
    const selected = existing?.direction || available[0];

    let html = '<h3>' + (existing?'Изменить направление':'Добавить направление') + '</h3><div class="form-grid">';
    html += '<div class="field"><label>Направление</label><select class="select" id="ef-dir" ' + (existing?'disabled':'onchange="refreshEnrollmentGroups()"') + '>';
    available.forEach(function(d){html += '<option' + (d===selected?' selected':'') + '>' + d + '</option>';});
    html += '</select></div><div class="field"><label>Основная группа</label><select class="select" id="ef-group"></select></div>';
    html += '<div class="field span-2"><label>Индивидуальная цена, ₽</label><input class="input" id="ef-price" type="number" step="0.01" value="' + (existing?.individualPrice ?? '') + '" placeholder="Пусто = цена группы или направления"></div></div>';
    html += '<div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn primary" onclick="saveEnrollmentV111(' + childId + ',' + (existing ? '\''+existing.direction+'\'' : 'null') + ')">Сохранить</button></div>';
    modal(html);
    setTimeout(function(){refreshEnrollmentGroups(existing?.groupId ?? null);},0);
  };

  window.refreshEnrollmentGroups = function (selectedGroupId) {
    const d = document.querySelector('#ef-dir')?.value;
    const box = document.querySelector('#ef-group');
    if (!box) return;
    let html = '<option value="">Без группы</option>';
    state.groups.filter(function(g){return g.direction===d && g.active;}).forEach(function(g){
      html += '<option value="' + g.id + '"' + (Number(selectedGroupId)===g.id?' selected':'') + '>' + g.name + '</option>';
    });
    box.innerHTML = html;
    if (selectedGroupId == null) box.value = '';
  };

  window.saveEnrollmentV111 = function (childId, oldDirection) {
    const c = byId(state.children,childId);
    const direction = oldDirection || document.querySelector('#ef-dir').value;
    const rawGroup = document.querySelector('#ef-group').value;
    const groupId = rawGroup === '' ? null : Number(rawGroup);
    const rawPrice = document.querySelector('#ef-price').value;
    const individualPrice = rawPrice === '' ? null : Number(rawPrice);
    let e = c.enrollments.find(function(x){return x.direction===direction;});
    if (e) {
      e.groupId = groupId;
      e.individualPrice = individualPrice;
    } else {
      c.enrollments.push({direction:direction,groupId:groupId,individualPrice:individualPrice,balance:0});
    }
    state.modal = null;
    state.page = 'child';
    render();
  };

  // Create/edit child: first direction can explicitly be left without a group.
  window.childForm = function (id) {
    const c = id ? byId(state.children,id) : null;
    const first = c?.enrollments?.[0] || null;
    const direction = first?.direction || 'Робототехника';

    let html = '<h3>' + (c?'Редактировать ребёнка':'Новый ребёнок') + '</h3><div class="form-grid">';
    html += '<div class="field span-2"><label>ФИО</label><input class="input" id="cf-name" value="' + (c?.name || '') + '" placeholder="Фамилия Имя"></div>';
    html += '<div class="field"><label>Дата рождения</label><input class="input" id="cf-birth" type="date" value="' + (c?.birth || '') + '"></div>';
    html += '<div class="field"><label>Статус</label><select class="select" id="cf-status">';
    ['Лид','Активный','Пауза','Закончил'].forEach(function(st){html += '<option' + (c?.status===st?' selected':'') + '>' + st + '</option>';});
    html += '</select></div>';
    html += '<div class="field"><label>Школа</label><input class="input" id="cf-school" value="' + (c?.school || '') + '"></div>';
    html += '<div class="field"><label>Класс</label><input class="input" id="cf-grade" value="' + (c?.grade || '') + '"></div>';
    html += '<div class="field"><label>Родитель</label><input class="input" id="cf-parent" value="' + (c?.parent || '') + '"></div>';
    html += '<div class="field"><label>Телефон</label><input class="input" id="cf-phone" value="' + (c?.phone || '') + '"></div>';
    html += '<div class="field"><label>Направление</label><select class="select" id="cf-direction" ' + (c?'disabled':'onchange="refreshChildGroupOptions()"') + '><option' + (direction==='Робототехника'?' selected':'') + '>Робототехника</option><option' + (direction==='Программирование'?' selected':'') + '>Программирование</option></select></div>';
    html += '<div class="field"><label>Основная группа</label><select class="select" id="cf-group"></select></div>';
    html += '<div class="field span-2"><label>Примечание</label><textarea class="textarea" id="cf-note">' + (c?.note || '') + '</textarea></div></div>';
    html += '<div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn primary" onclick="saveChildV111(' + (c?.id || 'null') + ')">Сохранить</button></div>';
    modal(html);
    setTimeout(function(){refreshChildGroupOptions(first?.groupId ?? null);},0);
  };

  window.refreshChildGroupOptions = function (selectedGroupId) {
    const direction = document.querySelector('#cf-direction')?.value;
    const box = document.querySelector('#cf-group');
    if (!box) return;
    let html = '<option value="">Без группы</option>';
    state.groups.filter(function(g){return g.direction===direction && g.active;}).forEach(function(g){
      html += '<option value="' + g.id + '"' + (Number(selectedGroupId)===g.id?' selected':'') + '>' + g.name + '</option>';
    });
    box.innerHTML = html;
    if (selectedGroupId == null) box.value = '';
  };

  window.saveChildV111 = function (id) {
    const direction = document.querySelector('#cf-direction').value;
    const rawGroup = document.querySelector('#cf-group').value;
    const groupId = rawGroup === '' ? null : Number(rawGroup);
    const common = {
      name: document.querySelector('#cf-name').value.trim() || 'Новый ребёнок',
      birth: document.querySelector('#cf-birth').value,
      school: document.querySelector('#cf-school').value,
      grade: document.querySelector('#cf-grade').value,
      parent: document.querySelector('#cf-parent').value,
      phone: document.querySelector('#cf-phone').value,
      status: document.querySelector('#cf-status').value,
      note: document.querySelector('#cf-note').value
    };

    if (id) {
      const c = byId(state.children,id);
      const oldStatus = c.status;
      const oldEnrollment = (c.enrollments||[]).find(function(x){return x.direction===direction;}) || (c.enrollments||[])[0] || null;
      const oldGroup = oldEnrollment && oldEnrollment.groupId!=null ? byId(state.groups,oldEnrollment.groupId) : null;

      Object.assign(c,common);

      const e = c.enrollments.find(function(x){return x.direction===direction;});
      if (e) e.groupId = groupId;

      if (oldStatus !== common.status) {
        const now = new Date();
        const localDate = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');

        c.statusHistory = c.statusHistory || [];
        c.statusHistory.push({
          from: oldStatus,
          to: common.status,
          date: localDate,
          project: oldGroup?.project || null,
          direction: oldEnrollment?.direction || direction || null
        });

        c.statusChangedAt = localDate;
        c.statusChangedProject = oldGroup?.project || null;
        c.statusChangedDirection = oldEnrollment?.direction || direction || null;
      }
    } else {
      const nextId = state.children.length ? Math.max.apply(null,state.children.map(function(x){return Number(x.id)||0;})) + 1 : 1;
      const c = Object.assign({id:nextId},common,{enrollments:[{direction:direction,groupId:groupId,individualPrice:null,balance:0}]});
      state.children.push(c);
      state.selectedChild = nextId;
    }
    state.modal = null;
    state.page = 'child';
    render();
  };

  // Safe balances rendering for enrolments without a group.
  window.balances = function () {
    const entries = state.children.flatMap(function(c){return c.enrollments.map(function(e){return {c:c,e:e};});}).sort(function(a,b){return a.e.balance-b.e.balance;});
    return pageHead('Балансы и долги','Баланс отдельно по каждому направлению. Ребёнок может временно быть без группы.') +
      '<div class="grid cols-3" style="margin-bottom:16px"><div class="card metric"><div class="label">Долг</div><div class="value negative">' + entries.filter(function(x){return x.e.balance<0;}).length + '</div></div><div class="card metric"><div class="label">Ноль</div><div class="value">' + entries.filter(function(x){return x.e.balance===0;}).length + '</div></div><div class="card metric"><div class="label">Осталось 1</div><div class="value" style="color:var(--amber)">' + entries.filter(function(x){return x.e.balance===1;}).length + '</div></div></div>' +
      '<div class="card list"><div class="row header"><div>Ребёнок</div><div>Направление</div><div>Группа</div><div>Цена</div><div>Баланс</div></div>' +
      entries.map(function(x){const g=byId(state.groups,x.e.groupId);return '<div class="row clickable" onclick="openChild(' + x.c.id + ')"><div><b>' + x.c.name + '</b></div><div>' + x.e.direction + '</div><div>' + (g?g.name:'Без группы') + '</div><div>' + money(effectivePrice(x.e)) + '</div><div class="money ' + (x.e.balance<0?'negative':x.e.balance>0?'positive':'') + '">' + Number(x.e.balance.toFixed(4)) + '</div></div>';}).join('') + '</div>';
  };

  // Keep the salary prototype logic untouched; only standardize displayed group names.
  const oldSalary = window.salary;
  window.salary = function () {
    const html = oldSalary();
    const g = byId(state.groups,1);
    return html.replaceAll('Роботы · Чт 14:00', g ? g.name : 'Р, Чт, Школа №1, 14:00');
  };

  render();
})();


// v1.1.1 polish — compact group time row + recurring monthly calendar.
(function () {
  function add90(time) {
    if (!time || time.indexOf(':') < 0) return '';
    const p=time.split(':').map(Number), total=(p[0]*60+p[1]+90)%1440;
    return String(Math.floor(total/60)).padStart(2,'0')+':'+String(total%60).padStart(2,'0');
  }
  const CAL_DAY_NAME = {
    0:'Воскресенье',1:'Понедельник',2:'Вторник',3:'Среда',
    4:'Четверг',5:'Пятница',6:'Суббота'
  };

  window.groupForm = function (id) {
    const g = id ? byId(state.groups, id) : null;
    const direction = g?.direction || 'Робототехника';
    const day = g?.day || 'Четверг';
    const start = g?.startTime || '13:00';
    const end = g?.endTime || add90(start);

    let html = '<h3>' + (g ? 'Редактировать группу' : 'Новая группа') + '</h3>';
    html += '<div class="form-grid">';

    html += '<div class="field"><label>Направление</label><select class="select" id="gf-dir">';
    ['Робототехника','Программирование'].forEach(function(d){
      html += '<option' + (d===direction?' selected':'') + '>' + d + '</option>';
    });
    html += '</select></div>';

    html += '<div class="field"><label>Площадка</label><select class="select" id="gf-site">';
    state.sites.forEach(function(site){
      html += '<option value="' + site.id + '"' + (g?.siteId===site.id?' selected':'') + '>' + site.name + '</option>';
    });
    html += '</select></div>';

    html += '<div class="field"><label>День недели</label><select class="select" id="gf-day">';
    ['Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье'].forEach(function(d){
      html += '<option' + (d===day?' selected':'') + '>' + d + '</option>';
    });
    html += '</select></div>';

    html += '<div class="field"><label>Преподаватель</label><select class="select" id="gf-teacher">';
    state.teachers.forEach(function(t){
      html += '<option value="' + t.id + '"' + (g?.teacherId===t.id?' selected':'') + '>' + t.name + '</option>';
    });
    html += '</select></div>';

    html += '<div class="field span-2"><label>Время занятия</label>';
    html += '<div style="display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:center">';
    html += '<input class="input" id="gf-start" type="time" step="1800" value="' + start + '" onchange="refreshGroupEndTime()">';
    html += '<span class="muted" style="font-size:18px">→</span>';
    html += '<input class="input" id="gf-end" type="time" value="' + end + '">';
    html += '</div></div>';

    html += '<div class="field"><label>Проект / владелец</label><select class="select" id="gf-project">';
    ['iCubeRobots','Зебра'].forEach(function(p){
      html += '<option' + (p===(g?.project||'iCubeRobots')?' selected':'') + '>' + p + '</option>';
    });
    html += '</select></div>';

    html += '<div class="field"><label>Специальная цена, ₽</label><input class="input" id="gf-price" type="number" step="0.01" value="' + (g?.price ?? '') + '" placeholder="Пусто = цена направления"></div>';

    html += '<div class="field"><label>Активность</label><select class="select" id="gf-active">';
    html += '<option value="true"' + (g?.active!==false?' selected':'') + '>Активна</option>';
    html += '<option value="false"' + (g?.active===false?' selected':'') + '>Неактивна</option>';
    html += '</select></div>';

    html += '</div>';
    html += '<div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn primary" onclick="saveGroupV111(' + (g?.id || 'null') + ')">' + (g?'Сохранить':'Создать группу') + '</button></div>';
    modal(html);
  };

  window.refreshGroupEndTime = function () {
    const start = document.querySelector('#gf-start');
    const end = document.querySelector('#gf-end');
    if (start && end && start.value) end.value = add90(start.value);
  };

  function recurringEventsForSeptember() {
    const events = [];
    state.groups.filter(function(g){ return g.active; }).forEach(function(g){
      for (let d=1; d<=30; d++) {
        const dt = new Date(2026,8,d);
        if (CAL_DAY_NAME[dt.getDay()] !== g.day) continue;
        const dd = String(d).padStart(2,'0');
        const date = dd + '.09.2026';
        const explicit = state.lessons.find(function(l){ return l.groupId===g.id && l.date===date; });
        events.push({
          date: date,
          groupId: g.id,
          time: explicit?.time || (g.startTime + '–' + g.endTime),
          status: explicit?.status || 'По расписанию',
          lessonId: explicit?.id || null,
          done: !!explicit?.done,
          project: g.project
        });
      }
    });
    return events;
  }

  window.setCalendarProject = function (project) {
    state.calendarProject = project;
    render();
  };

  window.calendar = function () {
    if (!state.calendarProject) state.calendarProject = 'all';
    const events = recurringEventsForSeptember().filter(function(e){
      return state.calendarProject==='all' || e.project===state.calendarProject;
    });

    const firstDay = new Date(2026,8,1).getDay();
    const mondayIndex = (firstDay + 6) % 7;
    const cells = [];
    for (let i=0;i<mondayIndex;i++) cells.push(null);
    for (let d=1;d<=30;d++) cells.push(d);

    const projectButton = function(value,label){
      return '<button class="btn ' + (state.calendarProject===value?'soft':'') + '" onclick="setCalendarProject(\'' + value + '\')">' + label + '</button>';
    };

    let html = pageHead('Календарь','Сентябрь 2026 · активные группы автоматически попадают в календарь');
    html += '<div class="toolbar">';
    html += '<button class="btn">Неделя</button><button class="btn soft">Месяц</button>';
    html += '<span style="width:1px;background:var(--line);margin:0 2px"></span>';
    html += projectButton('all','Все проекты');
    html += projectButton('iCubeRobots','iCubeRobots');
    html += projectButton('Зебра','Зебра');
    html += '</div>';

    html += '<div class="calendar" style="margin-bottom:8px">';
    ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].forEach(function(d){
      html += '<div class="muted mini" style="padding:0 8px 4px;font-weight:700">' + d + '</div>';
    });
    html += '</div>';

    html += '<div class="calendar">';
    cells.forEach(function(day){
      if (day===null) {
        html += '<div class="day" style="opacity:.35"></div>';
        return;
      }
      const dd = String(day).padStart(2,'0');
      const date = dd + '.09.2026';
      const dayEvents = events.filter(function(e){ return e.date===date; });
      html += '<div class="day"><div class="date">' + dd + '.09' + (day===9?' · сегодня':'') + '</div>';
      dayEvents.forEach(function(e){
        const g = byId(state.groups,e.groupId);
        const cls = e.project==='Зебра' ? 'partner' : '';
        const done = e.done ? ' done' : '';
        const click = e.lessonId ? ' onclick="openLesson(' + e.lessonId + ')"' : '';
        html += '<div class="event ' + cls + done + '"' + click + '>';
        html += '<div style="display:flex;justify-content:space-between;gap:6px"><b>' + e.time.split('–')[0] + '</b><span class="mini">' + (e.project==='Зебра'?'Зебра':'iCube') + '</span></div>';
        html += '<div>' + g.name + '</div>';
        html += '</div>';
      });
      html += '</div>';
    });
    html += '</div>';
    return html;
  };

  render();
})();


// Calendar interaction fix — real week/month modes, select filter, clickable recurring lessons.
(function () {
  function ensureCalendarState() {
    if (!state.calendarMode) state.calendarMode = 'month';
    if (!state.calendarProject) state.calendarProject = 'all';
  }

  function dayNameRu(date) {
    return ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'][date.getDay()];
  }

  function formatDate(date) {
    return String(date.getDate()).padStart(2,'0') + '.' +
      String(date.getMonth()+1).padStart(2,'0') + '.' + date.getFullYear();
  }

  function recurringEventsForRange(startDate, endDate) {
    const events = [];
    state.groups.filter(function(g){ return g.active; }).forEach(function(g){
      for (let dt = new Date(startDate); dt <= endDate; dt.setDate(dt.getDate()+1)) {
        if (dayNameRu(dt) !== g.day) continue;
        const date = formatDate(dt);
        const explicit = state.lessons.find(function(l){ return l.groupId===g.id && l.date===date; });
        events.push({
          date,
          groupId:g.id,
          time: explicit?.time || (g.startTime + '–' + g.endTime),
          project:g.project,
          lessonId:explicit?.id || null,
          done:!!explicit?.done
        });
      }
    });
    return events;
  }

  window.openCalendarEvent = function (groupId, date, time) {
    let lesson = state.lessons.find(function(l){ return l.groupId===Number(groupId) && l.date===date; });
    if (!lesson) {
      const g = byId(state.groups, groupId);
      const nextId = state.lessons.length ? Math.max.apply(null,state.lessons.map(function(x){return x.id;})) + 1 : 1;
      lesson = {
        id:nextId,
        date:date,
        time:time,
        groupId:Number(groupId),
        teacherId:g.teacherId,
        status:'Запланировано',
        topic:'',
        attendance:{},
        extras:[],
        photos:{},
        started:false,
        done:false,
        intro:false,
        emptyTrip:false,
        attendanceApplied:false,
        summary:null
      };
      groupChildren(g.id).forEach(function(c){ lesson.attendance[c.id] = false; });
      state.lessons.push(lesson);
    }
    openLesson(lesson.id);
  };

  window.setCalendarMode = function (mode) {
    state.calendarMode = mode;
    render();
  };

  window.setCalendarProjectSelect = function (value) {
    state.calendarProject = value;
    render();
  };

  window.calendar = function () {
    ensureCalendarState();

    const today = new Date(2026,8,9);
    let startDate, endDate, title;

    if (state.calendarMode === 'week') {
      const mondayOffset = (today.getDay() + 6) % 7;
      startDate = new Date(today);
      startDate.setDate(today.getDate() - mondayOffset);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
      title = 'Неделя ' + String(startDate.getDate()).padStart(2,'0') + '–' + String(endDate.getDate()).padStart(2,'0') + ' сентября 2026';
    } else {
      startDate = new Date(2026,8,1);
      endDate = new Date(2026,8,30);
      title = 'Сентябрь 2026';
    }

    const events = recurringEventsForRange(startDate,endDate).filter(function(e){
      return state.calendarProject === 'all' || e.project === state.calendarProject;
    });

    let html = pageHead('Календарь', title + ' · активные группы автоматически попадают в календарь');
    html += '<div class="toolbar">';
    html += '<button class="btn ' + (state.calendarMode==='week'?'soft':'') + '" onclick="setCalendarMode(\'week\')">Неделя</button>';
    html += '<button class="btn ' + (state.calendarMode==='month'?'soft':'') + '" onclick="setCalendarMode(\'month\')">Месяц</button>';
    html += '<select class="select" style="max-width:220px" onchange="setCalendarProjectSelect(this.value)">';
    html += '<option value="all"' + (state.calendarProject==='all'?' selected':'') + '>Все проекты</option>';
    html += '<option value="iCubeRobots"' + (state.calendarProject==='iCubeRobots'?' selected':'') + '>iCubeRobots</option>';
    html += '<option value="Зебра"' + (state.calendarProject==='Зебра'?' selected':'') + '>Зебра</option>';
    html += '</select></div>';

    html += '<div class="calendar" style="margin-bottom:8px">';
    ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].forEach(function(d){
      html += '<div class="muted mini" style="padding:0 8px 4px;font-weight:700">' + d + '</div>';
    });
    html += '</div>';

    if (state.calendarMode === 'week') {
      html += '<div class="calendar">';
      for (let i=0;i<7;i++) {
        const dt = new Date(startDate);
        dt.setDate(startDate.getDate()+i);
        const date = formatDate(dt);
        const dd = String(dt.getDate()).padStart(2,'0');
        const dayEvents = events.filter(function(e){ return e.date===date; });
        html += '<div class="day" style="min-height:260px"><div class="date">' + dd + '.09' + (date==='09.09.2026'?' · сегодня':'') + '</div>';
        dayEvents.forEach(function(e){
          const g = byId(state.groups,e.groupId);
          html += '<div class="event ' + (e.project==='Зебра'?'partner':'') + (e.done?' done':'') + '" onclick="openCalendarEvent(' + e.groupId + ',\'' + e.date + '\',\'' + e.time + '\')">';
          html += '<div style="display:flex;justify-content:space-between;gap:6px"><b>' + e.time.split('–')[0] + '</b><span class="mini">' + (e.project==='Зебра'?'Зебра':'iCube') + '</span></div>';
          html += '<div>' + g.name + '</div></div>';
        });
        html += '</div>';
      }
      html += '</div>';
      return html;
    }

    const firstDay = new Date(2026,8,1).getDay();
    const mondayIndex = (firstDay + 6) % 7;
    const cells = [];
    for (let i=0;i<mondayIndex;i++) cells.push(null);
    for (let d=1;d<=30;d++) cells.push(d);

    html += '<div class="calendar">';
    cells.forEach(function(day){
      if (day===null) {
        html += '<div class="day" style="opacity:.35"></div>';
        return;
      }
      const dd = String(day).padStart(2,'0');
      const date = dd + '.09.2026';
      const dayEvents = events.filter(function(e){ return e.date===date; });
      html += '<div class="day"><div class="date">' + dd + '.09' + (date==='09.09.2026'?' · сегодня':'') + '</div>';
      dayEvents.forEach(function(e){
        const g = byId(state.groups,e.groupId);
        html += '<div class="event ' + (e.project==='Зебра'?'partner':'') + (e.done?' done':'') + '" onclick="openCalendarEvent(' + e.groupId + ',\'' + e.date + '\',\'' + e.time + '\')">';
        html += '<div style="display:flex;justify-content:space-between;gap:6px"><b>' + e.time.split('–')[0] + '</b><span class="mini">' + (e.project==='Зебра'?'Зебра':'iCube') + '</span></div>';
        html += '<div>' + g.name + '</div></div>';
      });
      html += '</div>';
    });
    html += '</div>';
    return html;
  };

  render();
})();


// Ordering, group project filter, and dashboard/calendar synchronization.
(function () {
  const DAY_ORDER = {
    'Понедельник':0,'Вторник':1,'Среда':2,'Четверг':3,
    'Пятница':4,'Суббота':5,'Воскресенье':6
  };

  function timeStart(value) {
    return String(value || '99:99').split('–')[0];
  }

  function sortGroups(list) {
    return list.slice().sort(function(a,b){
      const dayDiff = (DAY_ORDER[a.day] ?? 99) - (DAY_ORDER[b.day] ?? 99);
      if (dayDiff) return dayDiff;
      return String(a.startTime || '').localeCompare(String(b.startTime || ''));
    });
  }

  function dayNameRuLocal(date) {
    return ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'][date.getDay()];
  }

  function dateRu(date) {
    return String(date.getDate()).padStart(2,'0') + '.' +
      String(date.getMonth()+1).padStart(2,'0') + '.' + date.getFullYear();
  }

  function scheduledForDate(date) {
    const dateStr = typeof date === 'string' ? date : dateRu(date);
    const dt = typeof date === 'string'
      ? new Date(Number(date.slice(6,10)), Number(date.slice(3,5))-1, Number(date.slice(0,2)))
      : date;
    const weekday = dayNameRuLocal(dt);

    return state.groups
      .filter(function(g){ return g.active && g.day === weekday; })
      .map(function(g){
        const explicit = state.lessons.find(function(l){ return l.groupId===g.id && l.date===dateStr; });
        return {
          group:g,
          date:dateStr,
          time:explicit?.time || (g.startTime + '–' + g.endTime),
          lesson:explicit || null
        };
      })
      .sort(function(a,b){ return timeStart(a.time).localeCompare(timeStart(b.time)); });
  }

  // Groups: project filter + chronological weekly ordering.
  window.setGroupsProject = function(value) {
    state.groupsProject = value;
    render();
  };

  window.groups = function () {
    if (!state.groupsProject) state.groupsProject = 'all';
    const filtered = sortGroups(state.groups).filter(function(g){
      return state.groupsProject === 'all' || g.project === state.groupsProject;
    });

    let html = pageHead(
      'Группы',
      'Группы отсортированы по дню недели и времени',
      '<button class="btn primary" onclick="groupForm(null)">+ Новая группа</button>'
    );
    html += '<div class="toolbar"><select class="select" style="max-width:220px" onchange="setGroupsProject(this.value)">';
    html += '<option value="all"' + (state.groupsProject==='all'?' selected':'') + '>Все проекты</option>';
    html += '<option value="iCubeRobots"' + (state.groupsProject==='iCubeRobots'?' selected':'') + '>iCubeRobots</option>';
    html += '<option value="Зебра"' + (state.groupsProject==='Зебра'?' selected':'') + '>Зебра</option>';
    html += '</select></div>';

    html += '<div class="grid cols-3">';
    html += filtered.map(function(g){
      const kids = groupChildren(g.id);
      return '<div class="card pad clickable group-card" onclick="openGroup(' + g.id + ')">' +
        '<div style="display:flex;justify-content:space-between;gap:8px"><span class="badge ' + (g.project==='Зебра'?'purple':'blue') + '">' + g.project + '</span><span class="badge ' + (g.active?'green':'gray') + '">' + (g.active?'Активна':'Неактивна') + '</span></div>' +
        '<h3 style="margin:14px 0 5px">' + g.name + '</h3>' +
        '<div class="muted">' + g.direction + '</div>' +
        '<div class="info-list" style="margin-top:12px">' +
          '<div class="info-line"><span>Время</span><b>' + g.startTime + '–' + g.endTime + '</b></div>' +
          '<div class="info-line"><span>Площадка</span><b>' + byId(state.sites,g.siteId).name + '</b></div>' +
          '<div class="info-line"><span>Преподаватель</span><b>' + byId(state.teachers,g.teacherId).name + '</b></div>' +
          '<div class="info-line"><span>Детей</span><b>' + kids.length + '</b></div>' +
          '<div class="info-line"><span>Цена</span><b>' + (g.price?money(g.price):'Наследуется') + '</b></div>' +
        '</div><div class="group-card-hint">Открыть группу →</div></div>';
    }).join('');
    html += '</div>';
    return html;
  };

  // Wrap the latest calendar renderer and guarantee events inside each day are chronological.
  const calendarWithModes = window.calendar;
  window.calendar = function () {
    const html = calendarWithModes();
    // Current renderer builds each day from recurring events. We keep its UI, while
    // scheduledForDate provides the shared ordering logic used by dashboard.
    return html;
  };

  // Dashboard uses the same active-group schedule as the calendar.
  window.dashboard = function () {
    const active=state.children.filter(function(x){return x.status==='Активный';}).length;
    const leads=state.children.filter(function(x){return x.status==='Лид';}).length;
    const low=state.children.filter(function(c){return c.enrollments.some(function(e){return e.balance===1;});}).length;
    const zero=state.children.filter(function(c){return c.enrollments.some(function(e){return e.balance===0;});}).length;
    const debt=state.children.filter(function(c){return c.enrollments.some(function(e){return e.balance<0;});}).length;
    const revenue=state.payments.reduce(function(a,b){return a+b.amount;},0);

    const todayDate = new Date(2026,8,9);
    const today = scheduledForDate(todayDate);

    const upcoming = [];
    for (let offset=0; offset<14 && upcoming.length<3; offset++) {
      const d = new Date(todayDate);
      d.setDate(todayDate.getDate()+offset);
      scheduledForDate(d).forEach(function(item){
        if (upcoming.length<3) upcoming.push(item);
      });
    }

    let html = pageHead('Главная','Среда, 9 сентября · обзор клуба');
    html += '<div class="grid cols-4"><div class="card metric"><div class="label">Активные дети</div><div class="value">'+active+'</div><div class="sub">+2 за последние 30 дней</div></div><div class="card metric"><div class="label">Лиды</div><div class="value">'+leads+'</div><div class="sub">1 был на пробном</div></div><div class="card metric"><div class="label">Активные группы</div><div class="value">'+state.groups.filter(function(g){return g.active;}).length+'</div><div class="sub">2 направления</div></div><div class="card metric"><div class="label">Оплаты в сентябре</div><div class="value">'+money(revenue)+'</div><div class="sub">тестовые данные</div></div></div>';

    html += '<div class="grid cols-2" style="margin-top:16px"><div class="card pad"><div class="section-title"><h2>Требует внимания</h2><span class="muted mini">по балансам направлений</span></div><div class="attention"><button class="warn" onclick="navTo(\'balances\')"><span>Осталось 1 занятие</span><b>'+low+'</b></button><button class="zero" onclick="navTo(\'balances\')"><span>Осталось 0</span><b>'+zero+'</b></button><button class="debt" onclick="navTo(\'balances\')"><span>Должники</span><b>'+debt+'</b></button></div></div>';

    html += '<div class="card pad"><div class="section-title"><h2>Ближайшие занятия</h2><button class="btn" onclick="navTo(\'calendar\')">Календарь</button></div><div class="list">';
    html += upcoming.map(function(item){
      const g=item.group, site=byId(state.sites,g.siteId);
      return '<div class="kpi-line clickable" onclick="openCalendarEvent('+g.id+',\''+item.date+'\',\''+item.time+'\')"><div><b>'+timeStart(item.time)+' · '+g.direction+'</b><div class="muted mini">'+g.name+' · '+site.name+'</div></div><span class="badge '+(g.project==='Зебра'?'purple':'blue')+'">'+g.project+'</span></div>';
    }).join('');
    html += '</div></div></div>';

    html += '<div class="card pad" style="margin-top:16px"><div class="section-title"><h2>Сегодня</h2><span class="muted">'+today.length+' занятий</span></div>';
    if (!today.length) {
      html += '<div class="empty">Сегодня занятий нет.</div>';
    } else {
      html += '<div class="grid cols-2">';
      html += today.map(function(item){
        const g=item.group, site=byId(state.sites,g.siteId), teacher=byId(state.teachers,g.teacherId);
        return '<div style="border:1px solid var(--line);border-radius:12px;padding:14px"><div class="muted mini">'+item.time+'</div><b style="font-size:16px">'+g.name+'</b><div class="muted">'+site.name+' · '+teacher.name+'</div><button class="btn soft" style="margin-top:12px" onclick="openCalendarEvent('+g.id+',\''+item.date+'\',\''+item.time+'\')">Открыть занятие</button></div>';
      }).join('');
      html += '</div>';
    }
    html += '</div>';
    return html;
  };

  // Replace calendar once more so events within every day are explicitly sorted by start time.
  const previousCalendar = window.calendar;
  window.calendar = function () {
    const oldSort = Array.prototype.sort;
    // No prototype mutation: latest calendar already consumes group iteration order;
    // sort groups temporarily in local state copy and restore immediately.
    const original = state.groups;
    state.groups = sortGroups(original);
    try {
      return previousCalendar();
    } finally {
      state.groups = original;
    }
  };

  render();
})();

/* ===== Стабилизированный раздел из v112.js ===== */
// iCube CRM v1.2 prototype layer: concrete lesson overrides shared by director + teacher.
(function () {
  function currentPrototypeTeacherId(){
    if(state.prototypeTeacherId!=null && byId(state.teachers,state.prototypeTeacherId)) return Number(state.prototypeTeacherId);
    const t=state.teachers.find(function(x){return x.active!==false;}) || state.teachers[0];
    return t ? t.id : null;
  }
  window.setPrototypeTeacher=function(id){state.prototypeTeacherId=id===''?null:Number(id);state.page='teacherToday';render();};
  const DAY_NAMES = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];

  state.deletedOccurrences = state.deletedOccurrences || [];
  state.calendarMode = state.calendarMode || 'month';
  state.calendarProject = state.calendarProject || 'all';
  state.calendarTeacher = state.calendarTeacher || 'all';
  state.teacherCalendarMode = state.teacherCalendarMode || 'week';
  state.teacherCalendarProject = state.teacherCalendarProject || 'all';

  function parseRuDate(s) {
    const p = String(s).split('.').map(Number);
    return new Date(p[2], p[1]-1, p[0]);
  }
  function formatRuDate(d) {
    return String(d.getDate()).padStart(2,'0')+'.'+String(d.getMonth()+1).padStart(2,'0')+'.'+d.getFullYear();
  }
  function inputDate(ru) {
    const p=String(ru).split('.');
    return p[2]+'-'+p[1]+'-'+p[0];
  }
  function fromInputDate(iso) {
    const p=String(iso).split('-');
    return p[2]+'.'+p[1]+'.'+p[0];
  }
  function timeStart(t) { return String(t||'99:99').split('–')[0]; }
  function timeEnd(t) { return String(t||'').split('–')[1] || ''; }
  function occurrenceKey(groupId,date) { return Number(groupId)+'|'+date; }
  function isDeleted(key) { return state.deletedOccurrences.includes(key); }

  state.lessons.forEach(function(l){
    l.scheduledDate = l.scheduledDate || l.date;
    l.scheduledTime = l.scheduledTime || l.time;
    l.occurrenceKey = l.occurrenceKey || occurrenceKey(l.groupId,l.scheduledDate);
    l.cancelled = !!l.cancelled || l.status === 'Отменено';
    l.moved = !!l.moved || l.date !== l.scheduledDate || l.time !== l.scheduledTime;
  });

  function explicitForKey(key) {
    return state.lessons.find(function(l){ return l.occurrenceKey === key; });
  }

  function materializeEvent(event) {
    let l = event.lesson || explicitForKey(event.key);
    if (l) return l;
    const g = byId(state.groups,event.groupId);
    const id = state.lessons.length ? Math.max.apply(null,state.lessons.map(function(x){return x.id;}))+1 : 1;
    l = {
      id:id, groupId:g.id, teacherId:g.teacherId,
      scheduledDate:event.scheduledDate, scheduledTime:event.scheduledTime,
      occurrenceKey:event.key,
      date:event.date, time:event.time,
      status:'Запланировано', topic:'', attendance:{}, extras:[], photos:{},
      started:false, done:false, intro:false, emptyTrip:false,
      attendanceApplied:false, summary:null, cancelled:false, moved:false
    };
    groupChildren(g.id).forEach(function(c){ l.attendance[c.id]=false; });
    state.lessons.push(l);
    return l;
  }
  window.materializeEvent = materializeEvent;

  function sharedEvents(startDate,endDate,teacherId) {
    const events = [];
    const start = new Date(startDate), end = new Date(endDate);

    state.groups.filter(function(g){ return g.active; }).forEach(function(g){
      for (let d=new Date(start); d<=end; d.setDate(d.getDate()+1)) {
        if (DAY_NAMES[d.getDay()] !== g.day) continue;
        const scheduledDate = formatRuDate(d);
        const key = occurrenceKey(g.id,scheduledDate);
        if (isDeleted(key)) continue;
        const l = explicitForKey(key);
        const effectiveTeacherId = l ? l.teacherId : g.teacherId;
        if (teacherId && effectiveTeacherId!==teacherId) continue;

        if (l) {
          if (l.date === scheduledDate) {
            events.push({
              key:key, groupId:g.id, project:g.project, teacherId:effectiveTeacherId,
              scheduledDate:scheduledDate, scheduledTime:l.scheduledTime,
              date:l.date,time:l.time,lesson:l,
              cancelled:!!l.cancelled,moved:!!l.moved,done:!!l.done
            });
          }
        } else {
          const scheduledTime = g.startTime+'–'+g.endTime;
          events.push({
            key:key,groupId:g.id,project:g.project,teacherId:effectiveTeacherId,
            scheduledDate:scheduledDate,scheduledTime:scheduledTime,
            date:scheduledDate,time:scheduledTime,lesson:null,
            cancelled:false,moved:false,done:false
          });
        }
      }
    });

    state.lessons.forEach(function(l){
      if (isDeleted(l.occurrenceKey)) return;
      if (teacherId && l.teacherId!==teacherId) return;
      if (!l.moved || l.date===l.scheduledDate) return;
      const actual=parseRuDate(l.date);
      if (actual<start || actual>end) return;
      const g=byId(state.groups,l.groupId);
      if (!g) return;
      events.push({
        key:l.occurrenceKey,groupId:l.groupId,project:g.project,teacherId:l.teacherId,
        scheduledDate:l.scheduledDate,scheduledTime:l.scheduledTime,
        date:l.date,time:l.time,lesson:l,cancelled:!!l.cancelled,moved:true,done:!!l.done
      });
    });

    return events.sort(function(a,b){
      const da=parseRuDate(a.date)-parseRuDate(b.date);
      return da || timeStart(a.time).localeCompare(timeStart(b.time));
    });
  }
  window.sharedCalendarEvents = sharedEvents;

  function currentRange(mode) {
    const today=new Date(2026,8,9);
    if (mode==='week') {
      const offset=(today.getDay()+6)%7;
      const start=new Date(today); start.setDate(today.getDate()-offset);
      const end=new Date(start); end.setDate(start.getDate()+6);
      return {start:start,end:end,title:'Неделя 07–13 сентября 2026'};
    }
    return {start:new Date(2026,8,1),end:new Date(2026,8,30),title:'Сентябрь 2026'};
  }

  function statusBadgeHtml(e) {
    if (e.cancelled) return '<span class="badge red">Отменено</span>';
    if (e.moved) return '<span class="badge amber">Перенесено</span>';
    if (e.done) return '<span class="badge green">Проведено</span>';
    return '';
  }

  window.openUnifiedCalendarEvent = function(key, role) {
    const range={start:new Date(2026,8,1),end:new Date(2026,8,30)};
    const event=sharedEvents(range.start,range.end,role==='teacher'?currentPrototypeTeacherId():null).find(function(e){return e.key===key;}) ||
      (function(){
        const l=explicitForKey(key);
        if (!l) return null;
        const g=byId(state.groups,l.groupId);
        return {key:key,groupId:l.groupId,project:g?.project,scheduledDate:l.scheduledDate,scheduledTime:l.scheduledTime,date:l.date,time:l.time,lesson:l};
      })();
    if (!event) return;
    const l=materializeEvent(event);
    state.selectedLesson=l.id;
    state.page=role==='teacher'?'teacherLesson':'lesson';
    render();
  };

  function calendarHtml(opts) {
    const mode=opts.teacher?state.teacherCalendarMode:state.calendarMode;
    const project=opts.teacher?state.teacherCalendarProject:state.calendarProject;
    const range=currentRange(mode);
    const teacherId=opts.teacher?currentPrototypeTeacherId():null;
    const events=sharedEvents(range.start,range.end,teacherId).filter(function(e){
      const projectOk = project==='all' || e.project===project;
      const teacherOk = opts.teacher || state.calendarTeacher==='all' || Number(state.calendarTeacher)===Number(e.teacherId);
      return projectOk && teacherOk;
    });

    let html=opts.teacher
      ? '<h1 style="margin:2px 0 4px">Календарь</h1><div class="muted" style="margin-bottom:18px">'+range.title+'</div>'
      : pageHead('Календарь',range.title+' · конкретные переносы и отмены синхронизированы');

    const modeFn=opts.teacher?'setTeacherCalendarMode':'setCalendarModeV12';
    const projectFn=opts.teacher?'setTeacherCalendarProject':'setCalendarProjectV12';
    html+='<div class="toolbar"><button class="btn '+(mode==='week'?'soft':'')+'" onclick="'+modeFn+'(\'week\')">Неделя</button>';
    html+='<button class="btn '+(mode==='month'?'soft':'')+'" onclick="'+modeFn+'(\'month\')">Месяц</button>';
    html+='<select class="select" style="max-width:220px" onchange="'+projectFn+'(this.value)">';
    html+='<option value="all"'+(project==='all'?' selected':'')+'>Все проекты</option>';
    html+='<option value="iCubeRobots"'+(project==='iCubeRobots'?' selected':'')+'>iCubeRobots</option>';
    html+='<option value="Зебра"'+(project==='Зебра'?' selected':'')+'>Зебра</option></select>';
    if (!opts.teacher) {
      html+='<select class="select" style="max-width:240px" onchange="setCalendarTeacherV12(this.value)">';
      html+='<option value="all"'+(state.calendarTeacher==='all'?' selected':'')+'>Все преподаватели</option>';
      state.teachers.filter(function(t){return t.active!==false || Number(state.calendarTeacher)===t.id;}).forEach(function(t){
        html+='<option value="'+t.id+'"'+(Number(state.calendarTeacher)===t.id?' selected':'')+'>'+t.name+'</option>';
      });
      html+='</select>';
    }
    html+='</div>';

    html+='<div class="calendar" style="margin-bottom:8px">';
    ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].forEach(function(x){ html+='<div class="muted mini" style="padding:0 8px 4px;font-weight:700">'+x+'</div>'; });
    html+='</div><div class="calendar">';

    const cells=[];
    if (mode==='week') {
      for (let i=0;i<7;i++){ const d=new Date(range.start); d.setDate(range.start.getDate()+i); cells.push(d); }
    } else {
      const first=new Date(2026,8,1), blanks=(first.getDay()+6)%7;
      for(let i=0;i<blanks;i++) cells.push(null);
      for(let d=1;d<=30;d++) cells.push(new Date(2026,8,d));
    }

    cells.forEach(function(d){
      if (!d){ html+='<div class="day" style="opacity:.35"></div>'; return; }
      const date=formatRuDate(d), dayEvents=events.filter(function(e){return e.date===date;})
        .sort(function(a,b){return timeStart(a.time).localeCompare(timeStart(b.time));});
      html+='<div class="day"'+(mode==='week'?' style="min-height:260px"':'')+'><div class="date">'+String(d.getDate()).padStart(2,'0')+'.09'+(date==='09.09.2026'?' · сегодня':'')+'</div>';
      dayEvents.forEach(function(e){
        const g=byId(state.groups,e.groupId);
        html+='<div class="event '+(e.project==='Зебра'?'partner':'')+(e.done?' done':'')+(e.cancelled?' event-cancelled':'')+'" onclick="openUnifiedCalendarEvent(\''+e.key+'\',\''+(opts.teacher?'teacher':'director')+'\')">';
        html+='<div style="display:flex;justify-content:space-between;gap:6px"><b>'+timeStart(e.time)+'</b><span class="mini">'+(e.project==='Зебра'?'Зебра':'iCube')+'</span></div>';
        html+='<div>'+g.name+'</div><div style="margin-top:5px">'+statusBadgeHtml(e)+'</div></div>';
      });
      html+='</div>';
    });
    html+='</div>';
    return html;
  }

  window.setCalendarModeV12=function(v){state.calendarMode=v;render();};
  window.setCalendarProjectV12=function(v){state.calendarProject=v;render();};
  window.setCalendarTeacherV12=function(v){state.calendarTeacher=v;render();};
  window.setTeacherCalendarMode=function(v){state.teacherCalendarMode=v;render();};
  window.setTeacherCalendarProject=function(v){state.teacherCalendarProject=v;render();};
  window.calendar=function(){return calendarHtml({teacher:false});};
  window.teacherCalendar=function(){return calendarHtml({teacher:true});};

  function editLessonForm(id, role) {
    const l=byId(state.lessons,id);
    if (!l) return;
    const start=timeStart(l.time), end=timeEnd(l.time);
    let html='<h3>Изменить занятие</h3><div class="notice" style="margin-bottom:14px">Изменения относятся только к этому занятию. Регулярное расписание группы не меняется.</div><div class="form-grid">';
    html+='<div class="field span-2"><label>Дата</label><input class="input" id="le-date" type="date" value="'+inputDate(l.date)+'"></div>';
    html+='<div class="field"><label>Начало</label><input class="input" id="le-start" type="time" value="'+start+'"></div>';
    html+='<div class="field"><label>Окончание</label><input class="input" id="le-end" type="time" value="'+end+'"></div>';
    html+='<div class="field span-2"><label>Фактический преподаватель</label><select class="select" id="le-teacher">';
    state.teachers.filter(function(t){return t.active!==false || t.id===l.teacherId;}).forEach(function(t){
      html+='<option value="'+t.id+'"'+(t.id===l.teacherId?' selected':'')+'>'+t.name+'</option>';
    });
    html+='</select><div class="muted mini" style="margin-top:5px">Замена действует только для этого занятия и не меняет основного преподавателя группы.</div></div>';
    html+='<div class="field span-2"><label>Статус</label><select class="select" id="le-cancel"><option value="active"'+(!l.cancelled?' selected':'')+'>Занятие состоится</option><option value="cancelled"'+(l.cancelled?' selected':'')+'>Отменено</option></select></div>';
    html+='</div><div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn primary" onclick="saveLessonEdit('+id+',\''+role+'\')">Сохранить</button></div>';
    modal(html);
  }
  window.editLessonForm=editLessonForm;

  window.saveLessonEdit=function(id,role){
    const l=byId(state.lessons,id); if(!l)return;
    l.date=fromInputDate(document.querySelector('#le-date').value);
    l.time=document.querySelector('#le-start').value+'–'+document.querySelector('#le-end').value;
    l.teacherId=Number(document.querySelector('#le-teacher').value);
    l.cancelled=document.querySelector('#le-cancel').value==='cancelled';
    l.moved=l.date!==l.scheduledDate || l.time!==l.scheduledTime;
    if(l.cancelled) l.status='Отменено';
    else if(l.done) l.status='Проведено';
    else if(l.started) l.status='Идёт';
    else if(l.moved) l.status='Перенесено';
    else l.status='Запланировано';
    state.modal=null;
    state.selectedLesson=id;
    state.page=role==='teacher'?'teacherLesson':'lesson';
    render();
  };

  window.deleteLessonPrompt=function(id){
    const l=byId(state.lessons,id); if(!l)return;
    modal('<h3>Удалить занятие?</h3><div class="notice">Занятие исчезнет из календаря директора, календаря преподавателя, блока «Сегодня» и списков ближайших занятий. Это удаляет только конкретное занятие, а не расписание группы.</div><div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn danger" onclick="deleteLessonConfirmed('+id+')">Удалить занятие</button></div>');
  };

  function rollbackAttendance(l){
    if(!l.attendanceApplied)return;
    const g=byId(state.groups,l.groupId); if(!g)return;
    Object.entries(l.attendance||{}).filter(function(x){return x[1];}).forEach(function(x){
      const c=byId(state.children,Number(x[0])),e=c?.enrollments.find(function(y){return y.direction===g.direction;});
      if(e)e.balance+=1;
    });
    (l.extras||[]).filter(function(x){return !x.trial;}).forEach(function(x){
      const c=byId(state.children,x.childId),e=c?.enrollments.find(function(y){return y.direction===g.direction;});
      if(e)e.balance+=1;
    });
    l.attendanceApplied=false;
  }
  window.deleteLessonConfirmed=function(id){
    const l=byId(state.lessons,id); if(!l)return;
    rollbackAttendance(l);
    if(!state.deletedOccurrences.includes(l.occurrenceKey))state.deletedOccurrences.push(l.occurrenceKey);
    state.lessons=state.lessons.filter(function(x){return x.id!==id;});
    state.modal=null; state.page='calendar'; render();
  };

  window.lesson=function(){
    const l=byId(state.lessons,state.selectedLesson); if(!l)return calendar();
    const g=byId(state.groups,l.groupId),t=byId(state.teachers,l.teacherId),kids=groupChildren(g.id);
    const presentCount=Number(Object.values(l.attendance||{}).filter(Boolean).length)+Number((l.extras||[]).length);
    const stateBadges='<span class="badge '+(l.cancelled?'red':l.moved?'amber':l.done?'green':'blue')+'">'+(l.cancelled?'Отменено':l.moved&&!l.done?'Перенесено':l.done?'Проведено':'Запланировано')+'</span>';
    return '<button class="btn" style="margin-bottom:14px" onclick="navTo(\'calendar\')">← Календарь</button>'+
      pageHead(l.date+' · '+g.direction,l.time+' · '+byId(state.sites,g.siteId).name,
        '<div style="display:flex;gap:8px"><button class="btn" onclick="editLessonForm('+l.id+',\'director\')">Изменить занятие</button><button class="btn danger" onclick="deleteLessonPrompt('+l.id+')">Удалить занятие</button></div>')+
      '<div class="split"><div class="card pad"><div class="section-title"><h2>Занятие</h2><div class="lesson-status">'+stateBadges+'<span class="badge '+(g.project==='Зебра'?'purple':'gray')+'">'+g.project+'</span></div></div>'+
      (l.moved?'<div class="notice" style="margin-bottom:12px">Перенесено с '+l.scheduledDate+' · '+l.scheduledTime+'</div>':'')+
      (l.cancelled?'<div class="notice" style="margin-bottom:12px;background:var(--redbg);border-color:#fecdca;color:var(--red)">Занятие отменено. Оно остаётся в календарях с отметкой «Отменено».</div>':'')+
      '<div class="info-line"><span>Группа</span><b>'+g.name+'</b></div><div class="info-line"><span>Фактический преподаватель</span><b>'+t.name+'</b></div><div class="info-line"><span>Тема</span><b>'+(l.topic||'Не указана')+'</b></div><div class="info-line"><span>Присутствовало</span><b>'+presentCount+'</b></div>'+
      '<div style="display:grid;gap:9px;margin-top:14px"><label class="student-check"><input type="checkbox" '+(l.intro?'checked':'')+' onchange="lToggle(\'intro\',this.checked)"><span><b>Ознакомительное занятие всей группы</b></span></label><label class="student-check"><input type="checkbox" '+(l.emptyTrip?'checked':'')+' onchange="lToggle(\'emptyTrip\',this.checked)"><span><b>Пустой выезд</b></span></label></div></div>'+
      '<div class="card pad"><div class="section-title"><h2>Посещаемость</h2><button class="btn soft" onclick="state.role=\'teacher\';openLesson('+l.id+',true)">Открыть как преподаватель</button></div>'+
      kids.map(function(c){return '<div class="kpi-line"><b>'+c.name+'</b><span class="badge '+(l.attendance[c.id]?'green':'gray')+'">'+(l.attendance[c.id]?'Был':'Не отмечен')+'</span></div>';}).join('')+((l.extras||[]).length?'<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--line)"><div class="muted mini" style="font-weight:700;margin-bottom:6px">Добавлены на занятие</div>'+(l.extras||[]).map(function(e){const c=byId(state.children,e.childId);return '<div class="kpi-line"><div><b>'+c.name+'</b><div style="display:flex;gap:6px;margin-top:4px"><span class="badge blue">Добавлен</span>'+(e.trial?'<span class="badge amber">Ознакомительное</span>':'')+'</div></div><span class="badge green">Был</span></div>';}).join('')+'</div>':'')+'</div></div>';
  };

  function teacherEventCard(e){
    const g=byId(state.groups,e.groupId),site=byId(state.sites,g.siteId);
    return '<div class="teacher-card" onclick="openUnifiedCalendarEvent(\''+e.key+'\',\'teacher\')"><div class="teacher-lesson-head"><div><div class="teacher-time">'+timeStart(e.time)+'</div><h3 style="margin:4px 0">'+g.direction+'</h3><div class="muted">'+g.name+'<br>'+site.name+'</div></div><div>'+statusBadgeHtml(e)+'</div></div><button class="btn primary" style="width:100%;margin-top:14px">Открыть занятие</button></div>';
  }

  window.teacherToday=function(){
    const today=parseRuDate('09.09.2026');
    const events=sharedEvents(today,today,currentPrototypeTeacherId()).sort(function(a,b){return timeStart(a.time).localeCompare(timeStart(b.time));});
    return '<h1 style="margin:2px 0 4px">Сегодня</h1><div class="muted" style="margin-bottom:18px">Среда, 9 сентября · '+events.length+' занятий</div>'+
      (events.length?events.map(teacherEventCard).join(''):'<div class="teacher-card"><div class="empty">Сегодня занятий нет.</div></div>');
  };

  window.teacherLesson=function(){
    const l=byId(state.lessons,state.selectedLesson); if(!l)return teacherToday();
    const g=byId(state.groups,l.groupId),kids=groupChildren(g.id);
    let html='<div style="display:flex;gap:8px;justify-content:space-between;align-items:center"><button class="btn" onclick="state.page=\'teacherToday\';render()">← Сегодня</button><button class="btn" onclick="editLessonForm('+l.id+',\'teacher\')">Изменить / отменить</button></div>';
    html+='<div style="margin:16px 0"><div class="muted">'+l.date+' · '+l.time+'</div><h1 style="margin:4px 0">'+g.direction+'</h1><div class="muted">'+g.name+' · '+byId(state.sites,g.siteId).name+'</div>'+(l.moved?'<div style="margin-top:8px"><span class="badge amber">Перенесено</span> <span class="muted mini">с '+l.scheduledDate+' · '+l.scheduledTime+'</span></div>':'')+'</div>';
    if(l.cancelled){
      html+='<div class="teacher-card" style="background:var(--redbg)"><b style="color:var(--red);font-size:18px">Занятие отменено</b><div class="muted" style="margin-top:6px">Отмена видна в календаре преподавателя и директора.</div></div>';
      return html;
    }
    if(!l.started){
      html+='<div class="teacher-card"><h3 style="margin-top:0">Занятие готово</h3><p class="muted">После начала можно отмечать присутствующих, тему и фотографии.</p><button class="btn primary big-action" style="width:100%" onclick="startLesson()">Начать занятие</button></div>';
      return html;
    }
    html+='<div class="teacher-card"><div class="section-title"><h2>Основная группа</h2><span class="badge blue">'+kids.length+' детей</span></div><div class="attendance">'+kids.map(function(c){return studentCheck(c,l,false);}).join('')+'</div></div>';
    html+='<div class="teacher-card"><div class="section-title"><h2>Добавлены на занятие</h2></div>'+(l.extras||[]).map(function(e){return studentCheck(byId(state.children,e.childId),l,true,e);}).join('')+'<div style="margin-top:12px"><input class="input" id="extraSearch" placeholder="Начните вводить фамилию…" oninput="showExtraResults(this.value)"><div id="extraResults"></div></div></div>';
    html+='<div class="teacher-card"><label class="field"><label>Тема занятия</label><textarea class="textarea" oninput="byId(state.lessons,state.selectedLesson).topic=this.value">'+(l.topic||'')+'</textarea></label></div>';
    html+='<div class="teacher-sticky">'+(l.done?'<div class="teacher-card" style="background:var(--greenbg)"><b style="font-size:18px;color:var(--green)">Занятие завершено ✓</b></div>':'<button class="btn primary big-action" onclick="finishLesson()">Завершить занятие</button>')+'</div>';
    return html;
  };

  window.teacherShell=function(content){
    const currentId=currentPrototypeTeacherId();
    const current=byId(state.teachers,currentId);
    let teacherOptions='<option value="">Выберите преподавателя</option>';
    state.teachers.filter(function(t){return t.active!==false;}).forEach(function(t){
      teacherOptions+='<option value="'+t.id+'"'+(t.id===currentId?' selected':'')+'>'+t.name+'</option>';
    });
    return '<div class="teacher-shell"><div class="teacher-top"><div class="teacher-top-inner"><div><div class="mini" style="color:#98a2b3">iCube CRM · преподаватель</div><select class="select" style="margin-top:5px;min-width:220px" onchange="setPrototypeTeacher(this.value)">'+teacherOptions+'</select><div class="mini" style="color:#98a2b3;margin-top:3px">Выбор преподавателя только для режима прототипа</div></div><div><select class="role-switch" onchange="state.role=this.value;state.page=this.value===\'director\'?\'dashboard\':\'teacherToday\';render()"><option value="teacher">Преподаватель</option><option value="director">Директор</option></select><div class="mini" style="color:#98a2b3">Режим прототипа</div></div></div><div style="max-width:680px;margin:14px auto 0;display:flex;gap:8px"><button class="btn '+(state.page==='teacherToday'?'soft':'')+'" onclick="state.page=\'teacherToday\';render()">Сегодня</button><button class="btn '+(state.page==='teacherCalendar'?'soft':'')+'" onclick="state.page=\'teacherCalendar\';render()">Календарь</button></div></div><div class="teacher-content">'+(current?content:'<div class="teacher-card"><div class="empty">Создайте преподавателя в директорском разделе «Преподаватели», затем выберите его здесь для проверки интерфейса.</div></div>')+'</div></div>';
  };

  // Dashboard now consumes the same shared event source.
  window.dashboard=function(){
    const active=state.children.filter(function(x){return x.status==='Активный';}).length;
    const leads=state.children.filter(function(x){return x.status==='Лид';}).length;
    const low=state.children.filter(function(c){return c.enrollments.some(function(e){return e.balance===1;});}).length;
    const zero=state.children.filter(function(c){return c.enrollments.some(function(e){return e.balance===0;});}).length;
    const debt=state.children.filter(function(c){return c.enrollments.some(function(e){return e.balance<0;});}).length;
    const revenue=state.payments.reduce(function(a,b){return a+b.amount;},0);
    const today=parseRuDate('09.09.2026');
    const todayEvents=sharedEvents(today,today,null);
    const twoWeeksEnd=new Date(today);twoWeeksEnd.setDate(today.getDate()+14);
    const upcoming=sharedEvents(today,twoWeeksEnd,null).filter(function(e){return !e.cancelled;}).slice(0,3);

    let html=pageHead('Главная','Среда, 9 сентября · обзор клуба');
    html+='<div class="grid cols-4"><div class="card metric"><div class="label">Активные дети</div><div class="value">'+active+'</div></div><div class="card metric"><div class="label">Лиды</div><div class="value">'+leads+'</div></div><div class="card metric"><div class="label">Активные группы</div><div class="value">'+state.groups.filter(function(g){return g.active;}).length+'</div></div><div class="card metric"><div class="label">Оплаты в сентябре</div><div class="value">'+money(revenue)+'</div></div></div>';
    html+='<div class="grid cols-2" style="margin-top:16px"><div class="card pad"><div class="section-title"><h2>Требует внимания</h2></div><div class="attention"><button class="warn" onclick="navTo(\'balances\')"><span>Осталось 1 занятие</span><b>'+low+'</b></button><button class="zero" onclick="navTo(\'balances\')"><span>Осталось 0</span><b>'+zero+'</b></button><button class="debt" onclick="navTo(\'balances\')"><span>Должники</span><b>'+debt+'</b></button></div></div>';
    html+='<div class="card pad"><div class="section-title"><h2>Ближайшие занятия</h2><button class="btn" onclick="navTo(\'calendar\')">Календарь</button></div>'+upcoming.map(function(e){const g=byId(state.groups,e.groupId);return '<div class="kpi-line clickable" onclick="openUnifiedCalendarEvent(\''+e.key+'\',\'director\')"><div><b>'+timeStart(e.time)+' · '+g.direction+'</b><div class="muted mini">'+e.date+' · '+g.name+'</div></div><span class="badge '+(g.project==='Зебра'?'purple':'blue')+'">'+g.project+'</span></div>';}).join('')+'</div></div>';
    html+='<div class="card pad" style="margin-top:16px"><div class="section-title"><h2>Сегодня</h2><span class="muted">'+todayEvents.length+' занятий</span></div>';
    if(!todayEvents.length)html+='<div class="empty">Сегодня занятий нет.</div>';
    else html+='<div class="grid cols-2">'+todayEvents.map(function(e){const g=byId(state.groups,e.groupId),site=byId(state.sites,g.siteId),t=byId(state.teachers,e.teacherId||g.teacherId);return '<div style="border:1px solid var(--line);border-radius:12px;padding:14px"><div style="display:flex;justify-content:space-between"><span class="muted mini">'+e.time+'</span>'+statusBadgeHtml(e)+'</div><b style="font-size:16px">'+g.name+'</b><div class="muted">'+site.name+' · '+t.name+'</div><button class="btn soft" style="margin-top:12px" onclick="openUnifiedCalendarEvent(\''+e.key+'\',\'director\')">Открыть занятие</button></div>';}).join('')+'</div>';
    html+='</div>';
    return html;
  };

  // Final render supports teacher calendar without changing director navigation.
  window.render=function(){
    let content='',title='iCube CRM';
    if(state.role==='teacher'){
      if(!['teacherToday','teacherCalendar','teacherLesson'].includes(state.page))state.page='teacherToday';
      content=state.page==='teacherLesson'?teacherLesson():state.page==='teacherCalendar'?teacherCalendar():teacherToday();
      document.querySelector('#app').innerHTML=teacherShell(content)+(state.modal?'<div class="modal-backdrop"><div class="modal">'+state.modal+'</div></div>':'');
      return;
    }
    const pages={dashboard:dashboard,children:children,child:child,groups:groups,group:group,sites:sites,teachers:teachers,calendar:calendar,lesson:lesson,payments:payments,refunds:refunds,balances:balances,salary:salary,partner:partner,stats:stats,settings:settings};
    content=(pages[state.page]||dashboard)();
    document.querySelector('#app').innerHTML=shell(content,title)+(state.modal?'<div class="modal-backdrop"><div class="modal">'+state.modal+'</div></div>':'');
  };

  render();
})();

/* ===== Стабилизированный раздел из v113.js ===== */
// iCube CRM v1.1.2 — editable teachers/sites directories + quick create from group form.
(function () {
  state.sites.forEach(function(s){
    if (s.active === undefined) s.active = true;
    if (!s.shortName) {
      if (s.id === 1) s.shortName = 'Школа №1';
      else if (s.id === 2) s.shortName = 'ДК Океан';
      else if (s.id === 3) s.shortName = 'Зебра';
      else s.shortName = s.name;
    }
  });

  function activeSites() { return state.sites.filter(function(s){ return s.active !== false; }); }
  function activeTeachers() { return state.teachers.filter(function(t){ return t.active !== false; }); }

  function groupDraftFromDom(id) {
    return {
      id:id || null,
      direction:document.querySelector('#gf-dir')?.value || 'Робототехника',
      siteId:document.querySelector('#gf-site')?.value && document.querySelector('#gf-site').value !== 'new' ? Number(document.querySelector('#gf-site').value) : null,
      day:document.querySelector('#gf-day')?.value || 'Четверг',
      teacherId:document.querySelector('#gf-teacher')?.value && document.querySelector('#gf-teacher').value !== 'new' ? Number(document.querySelector('#gf-teacher').value) : null,
      startTime:document.querySelector('#gf-start')?.value || '13:00',
      endTime:document.querySelector('#gf-end')?.value || '14:30',
      project:document.querySelector('#gf-project')?.value || 'iCubeRobots',
      price:document.querySelector('#gf-price')?.value || '',
      active:document.querySelector('#gf-active')?.value !== 'false'
    };
  }

  function selectOptions(items, selectedId, labelFn) {
    return items.map(function(x){
      return '<option value="'+x.id+'"'+(Number(selectedId)===x.id?' selected':'')+'>'+labelFn(x)+'</option>';
    }).join('');
  }

  window.groupForm = function(id, suppliedDraft) {
    const g=id?byId(state.groups,id):null;
    const draft=suppliedDraft || (g ? {
      id:g.id,direction:g.direction,siteId:g.siteId,day:g.day,teacherId:g.teacherId,
      startTime:g.startTime,endTime:g.endTime,project:g.project,price:g.price??'',active:g.active!==false
    } : {
      id:null,direction:'Робототехника',siteId:activeSites()[0]?.id||null,day:'Четверг',
      teacherId:activeTeachers()[0]?.id||null,startTime:'13:00',endTime:'14:30',
      project:'iCubeRobots',price:'',active:true
    });

    let html='<h3>'+(g?'Редактировать группу':'Новая группа')+'</h3><div class="form-grid">';
    html+='<div class="field"><label>Направление</label><select class="select" id="gf-dir"><option'+(draft.direction==='Робототехника'?' selected':'')+'>Робототехника</option><option'+(draft.direction==='Программирование'?' selected':'')+'>Программирование</option></select></div>';

    html+='<div class="field"><label>Площадка</label><select class="select" id="gf-site" onchange="groupRelatedSelectChanged(\'site\','+(id||'null')+')">';
    html+=selectOptions(activeSites(),draft.siteId,function(s){return s.name;});
    html+='<option value="new">+ Создать площадку</option></select></div>';

    html+='<div class="field"><label>День недели</label><select class="select" id="gf-day">';
    ['Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье'].forEach(function(d){html+='<option'+(draft.day===d?' selected':'')+'>'+d+'</option>';});
    html+='</select></div>';

    html+='<div class="field"><label>Преподаватель</label><select class="select" id="gf-teacher" onchange="groupRelatedSelectChanged(\'teacher\','+(id||'null')+')">';
    html+=selectOptions(activeTeachers(),draft.teacherId,function(t){return t.name;});
    html+='<option value="new">+ Создать преподавателя</option></select></div>';

    html+='<div class="field span-2"><label>Время занятия</label><div style="display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:center">';
    html+='<input class="input" id="gf-start" type="time" step="1800" value="'+draft.startTime+'" onchange="refreshGroupEndTime()"><span class="muted" style="font-size:18px">→</span><input class="input" id="gf-end" type="time" value="'+draft.endTime+'"></div></div>';

    html+='<div class="field"><label>Проект / владелец</label><select class="select" id="gf-project"><option'+(draft.project==='iCubeRobots'?' selected':'')+'>iCubeRobots</option><option'+(draft.project==='Зебра'?' selected':'')+'>Зебра</option></select></div>';
    html+='<div class="field"><label>Специальная цена, ₽</label><input class="input" id="gf-price" type="number" step="0.01" value="'+(draft.price??'')+'" placeholder="Пусто = цена направления"></div>';
    html+='<div class="field"><label>Активность</label><select class="select" id="gf-active"><option value="true"'+(draft.active?' selected':'')+'>Активна</option><option value="false"'+(!draft.active?' selected':'')+'>Неактивна</option></select></div>';
    html+='</div><div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn primary" onclick="saveGroupV111('+(id||'null')+')">'+(g?'Сохранить':'Создать группу')+'</button></div>';
    modal(html);
  };

  window.groupRelatedSelectChanged = function(type,id) {
    const el=document.querySelector(type==='site'?'#gf-site':'#gf-teacher');
    if (!el || el.value!=='new') return;
    const draft=groupDraftFromDom(id);
    state.pendingGroupDraft=draft;
    if(type==='site') siteForm(null,true);
    else teacherForm(null,true);
  };

  window.teacherForm = function(id, returnToGroup) {
    const t=id?byId(state.teachers,id):null;
    const dirs=t?.directions||['Робототехника'];
    let html='<h3>'+(t?'Редактировать преподавателя':'Новый преподаватель')+'</h3><div class="form-grid">';
    html+='<div class="field span-2"><label>Фамилия Имя</label><input class="input" id="tf-name" value="'+(t?.name||'')+'" placeholder="Иванов Сергей"></div>';
    html+='<div class="field span-2"><label>Телефон</label><input class="input" id="tf-phone" value="'+(t?.phone||'')+'" placeholder="+7 900 000-00-00"></div>';
    html+='<div class="field span-2"><label>Направления</label><div style="display:flex;gap:14px;flex-wrap:wrap;padding:10px 0"><label><input type="checkbox" id="tf-robot" '+(dirs.includes('Робототехника')?'checked':'')+'> Робототехника</label><label><input type="checkbox" id="tf-code" '+(dirs.includes('Программирование')?'checked':'')+'> Программирование</label></div></div>';
    html+='<div class="field span-2"><label>Статус</label><select class="select" id="tf-active"><option value="true"'+(t?.active!==false?' selected':'')+'>Активен</option><option value="false"'+(t?.active===false?' selected':'')+'>Неактивен</option></select></div>';
    html+='</div><div class="modal-actions"><button class="btn" onclick="'+(returnToGroup?'returnToGroupForm()':'closeModal()')+'">Отмена</button><button class="btn primary" onclick="saveTeacher('+(id||'null')+','+(returnToGroup?'true':'false')+')">Сохранить</button></div>';
    modal(html);
  };

  window.saveTeacher = function(id, returnToGroup) {
    const name=document.querySelector('#tf-name').value.trim();
    if(!name){alert('Укажите фамилию и имя преподавателя');return;}
    const dirs=[];
    if(document.querySelector('#tf-robot').checked)dirs.push('Робототехника');
    if(document.querySelector('#tf-code').checked)dirs.push('Программирование');
    if(!dirs.length){alert('Выберите хотя бы одно направление');return;}
    const data={name:name,phone:document.querySelector('#tf-phone').value.trim(),directions:dirs,active:document.querySelector('#tf-active').value==='true'};
    let t;
    if(id){t=byId(state.teachers,id);Object.assign(t,data);}
    else{const next=state.teachers.length?Math.max.apply(null,state.teachers.map(function(x){return x.id;}))+1:1;t=Object.assign({id:next},data);state.teachers.push(t);}
    if(returnToGroup){
      const draft=state.pendingGroupDraft||{};
      draft.teacherId=t.id; state.pendingGroupDraft=draft;
      groupForm(draft.id,draft);
    } else {state.modal=null;state.page='teachers';render();}
  };

  window.siteForm = function(id, returnToGroup) {
    const s=id?byId(state.sites,id):null;
    let html='<h3>'+(s?'Редактировать площадку':'Новая площадка')+'</h3><div class="form-grid">';
    html+='<div class="field span-2"><label>Полное название</label><input class="input" id="sf-name" value="'+(s?.name||'')+'" placeholder="Развивающий центр «Зебра»"></div>';
    html+='<div class="field"><label>Короткое название</label><input class="input" id="sf-short" value="'+(s?.shortName||'')+'" placeholder="Зебра"></div>';
    html+='<div class="field"><label>Тип</label><select class="select" id="sf-type">';
    ['Школа','ДК','Развивающий центр','Другое'].forEach(function(x){html+='<option'+(s?.type===x?' selected':'')+'>'+x+'</option>';});
    html+='</select></div>';
    html+='<div class="field span-2"><label>Адрес</label><input class="input" id="sf-address" value="'+(s?.address||'')+'"></div>';
    html+='<div class="field span-2"><label>Примечание</label><textarea class="textarea" id="sf-note">'+(s?.note||'')+'</textarea></div>';
    html+='<div class="field span-2"><label>Статус</label><select class="select" id="sf-active"><option value="true"'+(s?.active!==false?' selected':'')+'>Активна</option><option value="false"'+(s?.active===false?' selected':'')+'>Неактивна</option></select></div>';
    html+='</div><div class="modal-actions"><button class="btn" onclick="'+(returnToGroup?'returnToGroupForm()':'closeModal()')+'">Отмена</button><button class="btn primary" onclick="saveSite('+(id||'null')+','+(returnToGroup?'true':'false')+')">Сохранить</button></div>';
    modal(html);
  };

  window.saveSite = function(id, returnToGroup) {
    const name=document.querySelector('#sf-name').value.trim(), shortName=document.querySelector('#sf-short').value.trim();
    if(!name||!shortName){alert('Укажите полное и короткое название площадки');return;}
    const data={name:name,shortName:shortName,type:document.querySelector('#sf-type').value,address:document.querySelector('#sf-address').value.trim(),note:document.querySelector('#sf-note').value.trim(),active:document.querySelector('#sf-active').value==='true'};
    let s;
    if(id){s=byId(state.sites,id);Object.assign(s,data);}
    else{const next=state.sites.length?Math.max.apply(null,state.sites.map(function(x){return x.id;}))+1:1;s=Object.assign({id:next},data);state.sites.push(s);}
    if(returnToGroup){
      const draft=state.pendingGroupDraft||{};
      draft.siteId=s.id; state.pendingGroupDraft=draft;
      groupForm(draft.id,draft);
    } else {state.modal=null;state.page='sites';render();}
  };

  window.returnToGroupForm = function(){
    const d=state.pendingGroupDraft;
    if(d)groupForm(d.id,d); else closeModal();
  };

  window.teachers = function() {
    const sorted=state.teachers.slice().sort(function(a,b){return Number(b.active!==false)-Number(a.active!==false)||a.name.localeCompare(b.name);});
    let html=pageHead('Преподаватели','Неактивные преподаватели сохраняются в истории, но не предлагаются при выборе в новых группах.','<button class="btn primary" onclick="teacherForm(null,false)">+ Преподаватель</button>');
    html+='<div class="card list"><div class="row header"><div>Преподаватель</div><div>Телефон</div><div>Направления</div><div>Статус</div><div></div></div>';
    html+=sorted.map(function(t){return '<div class="row clickable" onclick="teacherForm('+t.id+',false)"><div><b>'+t.name+'</b></div><div>'+t.phone+'</div><div>'+t.directions.join(', ')+'</div><div><span class="badge '+(t.active?'green':'gray')+'">'+(t.active?'Активен':'Неактивен')+'</span></div><div>Редактировать</div></div>';}).join('');
    html+='</div>'; return html;
  };

  window.sites = function() {
    const sorted=state.sites.slice().sort(function(a,b){return Number(b.active!==false)-Number(a.active!==false)||a.name.localeCompare(b.name);});
    let html=pageHead('Площадки','Площадки не удаляются: неиспользуемую площадку можно сделать неактивной.','<button class="btn primary" onclick="siteForm(null,false)">+ Площадка</button>');
    html+='<div class="grid cols-3">';
    html+=sorted.map(function(s){return '<div class="card pad clickable group-card" onclick="siteForm('+s.id+',false)"><div style="display:flex;justify-content:space-between;gap:8px"><span class="badge gray">'+s.type+'</span><span class="badge '+(s.active?'green':'gray')+'">'+(s.active?'Активна':'Неактивна')+'</span></div><h3 style="margin-bottom:4px">'+s.name+'</h3><div class="badge blue">'+s.shortName+'</div><div class="muted" style="margin-top:12px">'+(s.address||'Адрес не указан')+'</div><div style="margin-top:13px">'+(s.note||'')+'</div><div class="muted mini" style="margin-top:12px">'+state.groups.filter(function(g){return g.siteId===s.id;}).length+' групп</div><div class="group-card-hint">Редактировать →</div></div>';}).join('');
    html+='</div>'; return html;
  };

  render();
})();


// Balance attention view — debt / zero / one lesson, project filter, debt total.
(function () {
  state.balanceProject = state.balanceProject || 'all';

  function enrollmentProject(e) {
    const g = byId(state.groups,e.groupId);
    return g ? g.project : null;
  }

  function matchesBalanceProject(e) {
    if (state.balanceProject === 'all') return true;
    return enrollmentProject(e) === state.balanceProject;
  }

  function balanceRows(predicate) {
    return state.children
      .filter(function(c){ return c.status!=='Закончил'; })
      .flatMap(function(c){
        return c.enrollments
          .filter(function(e){ return matchesBalanceProject(e) && predicate(e.balance); })
          .map(function(e){ return {c:c,e:e,g:byId(state.groups,e.groupId)}; });
      });
  }

  function rowHtml(x) {
    const groupName=x.g ? x.g.name : 'Без группы';
    return '<div class="row clickable" onclick="openChild('+x.c.id+')">'+
      '<div><b>'+x.c.name+'</b></div>'+
      '<div>'+x.e.direction+'</div>'+
      '<div>'+groupName+'</div>'+
      '<div>'+money(effectivePrice(x.e))+'</div>'+
      '<div class="money '+(x.e.balance<0?'negative':x.e.balance>0?'positive':'')+'">'+Number(x.e.balance.toFixed(4))+'</div>'+
    '</div>';
  }

  function block(title, rows, extra) {
    return '<div class="card balance-block">'+
      '<div class="balance-block-head"><div><h2>'+title+'</h2><div class="muted mini balance-block-count">'+rows.length+' записей</div></div>'+(extra||'')+'</div>'+
      (rows.length
        ? '<div class="list"><div class="row header"><div>Ребёнок</div><div>Направление</div><div>Группа</div><div>Цена</div><div>Баланс</div></div>'+rows.map(rowHtml).join('')+'</div>'
        : '<div class="empty">Нет детей в этой категории.</div>')+
    '</div>';
  }

  window.setBalanceProject = function(value) {
    state.balanceProject = value;
    render();
  };

  window.balances = function () {
    const debt=balanceRows(function(v){return v<0;});
    const zero=balanceRows(function(v){return v===0;});
    const one=balanceRows(function(v){return v===1;});
    const debtSum=debt.reduce(function(sum,x){
      return sum + Math.abs(x.e.balance) * effectivePrice(x.e);
    },0);

    let html=pageHead(
      'Балансы и долги',
      'Показываются только дети, которым требуется внимание по балансу.'
    );

    html+='<div class="toolbar"><select class="select" style="max-width:220px" onchange="setBalanceProject(this.value)">';
    html+='<option value="all"'+(state.balanceProject==='all'?' selected':'')+'>Все проекты</option>';
    html+='<option value="iCubeRobots"'+(state.balanceProject==='iCubeRobots'?' selected':'')+'>iCubeRobots</option>';
    html+='<option value="Зебра"'+(state.balanceProject==='Зебра'?' selected':'')+'>Зебра</option>';
    html+='</select></div>';

    html+='<div class="grid" style="gap:16px">';
    html+=block('Должники',debt,'<div style="text-align:right"><div class="muted mini">Общий долг</div><div class="negative" style="font-size:24px;font-weight:800">'+money(debtSum)+'</div></div>');
    html+=block('Осталось 0',zero);
    html+=block('Осталось 1',one);
    html+='</div>';
    return html;
  };

  render();
})();


// Child card tabs — overview / payments / visits / refunds.
(function(){
  state.childTab = state.childTab || 'overview';

  window.setChildTab = function(tab){
    state.childTab = tab;
    render();
  };

  function childTabs(){
    const items=[['overview','Обзор'],['payments','Оплаты'],['visits','Посещения'],['refunds','Возвраты']];
    return '<div class="tabs">'+items.map(function(x){
      return '<button class="'+(state.childTab===x[0]?'active':'')+'" onclick="setChildTab(\''+x[0]+'\')">'+x[1]+'</button>';
    }).join('')+'</div>';
  }

  function childOverview(c){
    let directionsHtml=c.enrollments.map(function(e){
      const g=byId(state.groups,e.groupId);
      return '<div style="border-top:1px solid var(--line);padding:14px 0"><div style="display:flex;justify-content:space-between;gap:12px"><div><b>'+e.direction+'</b><div class="muted">'+(g?g.name:'Без группы')+'</div></div><div style="text-align:right"><div class="money '+(e.balance<0?'negative':e.balance>0?'positive':'')+'">'+e.balance+' занятий</div><div class="muted mini">'+money(effectivePrice(e))+' / занятие</div></div></div><div style="display:flex;gap:8px;margin-top:10px"><button class="btn soft" onclick="paymentForm('+c.id+',\''+e.direction+'\')">+ Оплата</button><button class="btn" onclick="enrollmentForm('+c.id+',\''+e.direction+'\')">Изменить</button></div></div>';
    }).join('');

    const payments=state.payments.filter(function(p){return p.childId===c.id;}).slice().reverse().slice(0,3);
    const visits=childVisitRows(c.id).slice(0,3);

    return '<div class="split"><div class="card pad"><div class="section-title"><h2>Направления</h2><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="badge '+statusBadge(c.status)+'">'+c.status+'</span><button class="btn soft" onclick="enrollmentForm('+c.id+',null)">+ Добавить направление</button></div></div>'+directionsHtml+'</div>'+
      '<div class="card pad"><div class="section-title"><h2>Контакты и данные</h2></div><div class="info-list"><div class="info-line"><span>Дата рождения</span><b>'+c.birth+'</b></div><div class="info-line"><span>Родитель</span><b>'+c.parent+'</b></div><div class="info-line"><span>Телефон</span><b>'+c.phone+'</b></div><div class="info-line"><span>Примечание</span><span style="text-align:right">'+(c.note||'—')+'</span></div></div></div></div>'+
      '<div class="grid cols-2" style="margin-top:16px"><div class="card pad"><div class="section-title"><h2>Последние оплаты</h2><button class="btn" onclick="setChildTab(\'payments\')">Все</button></div>'+(payments.length?payments.map(paymentRowMini).join(''):'<div class="empty">Оплат пока нет</div>')+'</div>'+
      '<div class="card pad"><div class="section-title"><h2>История посещений</h2><button class="btn" onclick="setChildTab(\'visits\')">Все</button></div>'+(visits.length?visits.map(visitRowMini).join(''):'<div class="empty">Посещений пока нет</div>')+'</div></div>';
  }

  function paymentRowMini(p){
    return '<div class="kpi-line"><div><b>'+p.direction+'</b><div class="muted mini">'+p.date+' · '+p.method+'</div></div><div class="money positive">+'+Number(p.lessons.toFixed? p.lessons.toFixed(4):p.lessons)+' · '+money(p.amount)+'</div></div>';
  }

  function childPayments(c){
    const rows=state.payments.filter(function(p){return p.childId===c.id;}).slice().reverse();
    return '<div class="card child-ledger-card"><div class="child-ledger-head"><div><h2>Оплаты</h2><div class="muted mini child-ledger-count">'+rows.length+' операций</div></div><button class="btn primary" onclick="paymentForm('+c.id+',\''+(c.enrollments[0]?.direction||'Робототехника')+'\')">+ Оплата</button></div>'+
      (rows.length?'<div class="list"><div class="row header"><div>Дата</div><div>Направление</div><div>Сумма</div><div>Способ</div><div>Занятий</div></div>'+rows.map(function(p){return '<div class="row"><div><b>'+p.date+'</b></div><div>'+p.direction+'</div><div class="money">'+money(p.amount)+'</div><div>'+p.method+'</div><div class="positive">+'+Number(p.lessons.toFixed? p.lessons.toFixed(4):p.lessons)+'</div></div>';}).join('')+'</div>':'<div class="empty">Оплат пока нет.</div>')+'</div>';
  }

  function childVisitRows(childId){
    const rows=[];
    state.lessons.forEach(function(l){
      if(l.cancelled) return;
      const own=!!(l.attendance&&l.attendance[childId]);
      const extra=(l.extras||[]).find(function(e){return e.childId===childId;});
      if(!own&&!extra) return;
      const g=byId(state.groups,l.groupId);
      if(!g) return;
      rows.push({lesson:l,group:g,extra:extra||null});
    });
    return rows.sort(function(a,b){return parseRuDateForChild(b.lesson.date)-parseRuDateForChild(a.lesson.date);});
  }

  function parseRuDateForChild(s){
    const p=String(s).split('.').map(Number); return new Date(p[2],p[1]-1,p[0]);
  }

  function visitRowMini(x){
    return '<div class="kpi-line clickable" onclick="state.selectedLesson='+x.lesson.id+';state.page=\'lesson\';render()"><div><b>'+x.lesson.date+' · '+x.group.direction+'</b><div class="muted mini">'+(x.lesson.topic||x.group.name)+'</div></div><div style="display:flex;gap:6px"><span class="badge green">Был</span>'+(x.extra?'<span class="badge blue">Добавлен</span>':'')+(x.extra?.trial?'<span class="badge amber">Ознакомительное</span>':'')+'</div></div>';
  }

  function childVisits(c){
    const rows=childVisitRows(c.id);
    return '<div class="card child-ledger-card"><div class="child-ledger-head"><div><h2>Посещения</h2><div class="muted mini child-ledger-count">'+rows.length+' посещений</div></div></div>'+
      (rows.length?'<div class="list"><div class="row header" style="grid-template-columns:1.1fr 1fr 1.4fr auto auto"><div>Дата</div><div>Направление</div><div>Группа</div><div>Статус</div><div>Тип</div></div>'+rows.map(function(x){return '<div class="row clickable" style="grid-template-columns:1.1fr 1fr 1.4fr auto auto" onclick="state.selectedLesson='+x.lesson.id+';state.page=\'lesson\';render()"><div><b>'+x.lesson.date+'</b><div class="muted mini">'+x.lesson.time+'</div></div><div>'+x.group.direction+'</div><div>'+x.group.name+'</div><div><span class="badge green">Был</span></div><div>'+(x.extra?'<span class="badge blue">Добавлен</span>':'')+(x.extra?.trial?' <span class="badge amber">Ознакомительное</span>':'')+'</div></div>';}).join('')+'</div>':'<div class="empty">Посещений пока нет.</div>')+'</div>';
  }

  function childRefunds(c){
    const rows=state.refunds.filter(function(r){return r.childId===c.id;}).slice().reverse();
    return '<div class="card child-ledger-card"><div class="child-ledger-head"><div><h2>Возвраты</h2><div class="muted mini child-ledger-count">'+rows.length+' операций</div></div><button class="btn primary" onclick="refundFormForChild('+c.id+')">+ Возврат</button></div>'+
      (rows.length?'<div class="list"><div class="row header"><div>Дата</div><div>Направление</div><div>Сумма</div><div>Цена</div><div>Занятий</div></div>'+rows.map(function(r){return '<div class="row"><div><b>'+r.date+'</b></div><div>'+r.direction+'</div><div class="money negative">−'+money(r.amount)+'</div><div>'+money(r.price)+'</div><div>−'+Number(r.lessons.toFixed?r.lessons.toFixed(4):r.lessons)+'</div></div>';}).join('')+'</div>':'<div class="empty">Возвратов пока нет.</div>')+'</div>';
  }

  window.refundFormForChild=function(childId){
    modal('<h3>Новый возврат</h3><div class="form-grid"><div class="field"><label>Дата</label><input class="input" id="rf-date" type="date" value="2026-09-09"></div><div class="field"><label>Направление</label><select class="select" id="rf-dir">'+byId(state.children,childId).enrollments.map(function(e){return '<option>'+e.direction+'</option>';}).join('')+'</select></div><div class="field span-2"><label>Сумма, ₽</label><input class="input" id="rf-amount" type="number" step="0.01" value="1025"></div></div><div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn primary" onclick="saveRefundForChild('+childId+')">Сохранить</button></div>');
  };

  window.saveRefundForChild=function(childId){
    const c=byId(state.children,childId),direction=document.querySelector('#rf-dir').value,e=c.enrollments.find(function(x){return x.direction===direction;}),amount=Number(document.querySelector('#rf-amount').value);
    if(!e||!amount)return;
    const price=effectivePrice(e),lessons=amount/price;
    e.balance-=lessons;
    state.refunds.push({id:Date.now(),date:document.querySelector('#rf-date').value.split('-').reverse().join('.'),childId:childId,direction:direction,amount:amount,price:price,lessons:lessons});
    state.modal=null;state.childTab='refunds';render();
  };

  window.child=function(){
    const c=byId(state.children,state.selectedChild); if(!c)return children();
    let body='';
    if(state.childTab==='payments')body=childPayments(c);
    else if(state.childTab==='visits')body=childVisits(c);
    else if(state.childTab==='refunds')body=childRefunds(c);
    else body=childOverview(c);
    return '<button class="btn" style="margin-bottom:14px" onclick="navTo(\'children\')">← Дети</button>'+
      pageHead(c.name,c.school+' · '+c.grade+' · '+c.parent,'<button class="btn" onclick="childForm('+c.id+')">Редактировать</button>')+
      childTabs()+body;
  };

  const oldOpenChild=window.openChild;
  window.openChild=function(id){ state.selectedChild=id; state.childTab='overview'; state.page='child'; render(); };

  render();
})();

/* ===== Стабилизированный раздел из v114.js ===== */
// iCube CRM v1.1.4 — real salary ledger from completed concrete lessons.
(function () {
  state.salaryTeacher = state.salaryTeacher || String((state.teachers.find(function(t){return t.active!==false;}) || state.teachers[0] || {id:1}).id);
  state.salaryDateFrom = state.salaryDateFrom || '2026-08-10';
  state.salaryDateTo = state.salaryDateTo || '2026-09-10';

  function salaryRatesSnapshot() {
    return {
      fix:Number(state.settings.salaryFix || 0),
      child:Number(state.settings.salaryChild || 0),
      intro:Number(state.settings.salaryIntro || 0),
      empty:Number(state.settings.salaryEmpty || 0)
    };
  }

  window.ensureSalarySnapshot = function (lesson) {
    if (!lesson) return null;
    if (!lesson.salarySnapshot) {
      lesson.salarySnapshot = salaryRatesSnapshot();
    }
    return lesson.salarySnapshot;
  };

  const previousConfirmFinish = window.confirmFinish;
  if (typeof previousConfirmFinish === 'function') {
    window.confirmFinish = function () {
      const lesson = byId(state.lessons,state.selectedLesson);
      ensureSalarySnapshot(lesson);
      return previousConfirmFinish();
    };
  }

  function salaryPresentCount(lesson) {
    return Object.values(lesson.attendance || {}).filter(Boolean).length +
      (lesson.extras || []).length;
  }

  function salaryCalculation(lesson) {
    const rates = ensureSalarySnapshot(lesson) || salaryRatesSnapshot();
    const children = salaryPresentCount(lesson);

    if (lesson.cancelled || !lesson.done) {
      return {type:'Не начисляется',children:children,fixed:0,childrenPay:0,total:0,rates:rates};
    }

    if (lesson.emptyTrip) {
      return {
        type:'Пустой выезд',
        children:children,
        fixed:rates.empty,
        childrenPay:0,
        total:rates.empty,
        rates:rates
      };
    }

    if (lesson.intro) {
      return {
        type:'Ознакомительное занятие',
        children:children,
        fixed:rates.intro,
        childrenPay:0,
        total:rates.intro,
        rates:rates
      };
    }

    const childrenPay = children * rates.child;
    return {
      type:'Обычное занятие',
      children:children,
      fixed:rates.fix,
      childrenPay:childrenPay,
      total:rates.fix + childrenPay,
      rates:rates
    };
  }
  window.salaryCalculation = salaryCalculation;

  function parseSalaryDate(ru) {
    const p=String(ru).split('.').map(Number);
    return new Date(p[2],p[1]-1,p[0]);
  }

  function isoToDate(iso) {
    const p=String(iso).split('-').map(Number);
    return new Date(p[0],p[1]-1,p[2]);
  }

  function salaryRows() {
    const teacherId=Number(state.salaryTeacher);
    const from=isoToDate(state.salaryDateFrom);
    const to=isoToDate(state.salaryDateTo);
    to.setHours(23,59,59,999);

    return state.lessons
      .filter(function(l){
        if (!l.done || l.cancelled) return false;
        if (Number(l.teacherId)!==teacherId) return false;
        const d=parseSalaryDate(l.date);
        return d>=from && d<=to;
      })
      .map(function(l){
        return {lesson:l,group:byId(state.groups,l.groupId),calc:salaryCalculation(l)};
      })
      .sort(function(a,b){
        return parseSalaryDate(a.lesson.date)-parseSalaryDate(b.lesson.date) ||
          String(a.lesson.time).localeCompare(String(b.lesson.time));
      });
  }

  window.applySalaryFilters = function () {
    state.salaryTeacher=document.querySelector('#salary-teacher').value;
    state.salaryDateFrom=document.querySelector('#salary-from').value;
    state.salaryDateTo=document.querySelector('#salary-to').value;
    render();
  };

  window.salary = function () {
    const rows=salaryRows();
    const total=rows.reduce(function(sum,x){return sum+x.calc.total;},0);

    let html=pageHead(
      'Зарплата',
      'Расчёт по фактически проведённым занятиям и фактическому преподавателю.',
      '<button class="btn">Скачать PDF</button>'
    );

    html+='<div class="toolbar">';
    html+='<select class="select" id="salary-teacher" style="max-width:260px">';
    state.teachers.forEach(function(t){
      html+='<option value="'+t.id+'"'+(String(t.id)===String(state.salaryTeacher)?' selected':'')+'>'+t.name+(t.active===false?' · неактивен':'')+'</option>';
    });
    html+='</select>';
    html+='<input class="input" id="salary-from" type="date" value="'+state.salaryDateFrom+'" style="max-width:180px">';
    html+='<input class="input" id="salary-to" type="date" value="'+state.salaryDateTo+'" style="max-width:180px">';
    html+='<button class="btn primary" onclick="applySalaryFilters()">Применить</button>';
    html+='</div>';

    html+='<div class="card child-ledger-card">';
    html+='<div class="child-ledger-head"><div><h2>Табель</h2><div class="muted mini child-ledger-count">'+rows.length+' проведённых занятий</div></div>';
    const teacher=byId(state.teachers,Number(state.salaryTeacher));
    html+='<div style="text-align:right"><div class="muted mini">Преподаватель</div><b>'+(teacher?teacher.name:'—')+'</b></div></div>';

    if (!rows.length) {
      html+='<div class="empty">За выбранный период проведённых занятий нет.</div>';
    } else {
      html+='<div class="list"><div class="row header salary-row"><div>Дата / группа</div><div>Детей</div><div>Фикс</div><div>За детей</div><div>Итого</div></div>';
      html+=rows.map(function(x){
        const l=x.lesson,g=x.group,c=x.calc;
        const site=g?byId(state.sites,g.siteId):null;
        const typeBadge=c.type==='Пустой выезд'
          ? '<span class="badge amber">Пустой выезд</span>'
          : c.type==='Ознакомительное занятие'
          ? '<span class="badge purple">Ознакомительное</span>'
          : '';
        return '<div class="row salary-row">'+
          '<div><b>'+l.date+' · '+(g?g.name:'Группа')+'</b><div class="muted mini">'+l.time+(site?' · '+site.name:'')+'</div><div style="margin-top:5px">'+typeBadge+'</div></div>'+
          '<div><b>'+c.children+'</b></div>'+
          '<div>'+money(c.fixed)+'</div>'+
          '<div>'+money(c.childrenPay)+'</div>'+
          '<div class="money"><b>'+money(c.total)+'</b></div>'+
        '</div>';
      }).join('');
      html+='</div>';
    }
    html+='</div>';

    html+='<div class="card pad" style="margin-top:16px;display:flex;justify-content:space-between;align-items:center;gap:16px"><div><b style="font-size:18px">Итого за период</b><div class="muted mini" style="margin-top:3px">Исторические ставки зафиксированы внутри проведённых занятий.</div></div><b style="font-size:24px">'+money(total)+'</b></div>';

    html+='<div class="notice" style="margin-top:16px">Обычное занятие: '+money(state.settings.salaryFix)+' + '+money(state.settings.salaryChild)+' × присутствующие. Индивидуальные пробные и добавленные дети учитываются в количестве присутствующих. Замена преподавателя начисляется фактическому преподавателю конкретного занятия.</div>';

    return html;
  };

  render();
})();

/* ===== Стабилизированный раздел из v115.js ===== */
// iCube CRM v1.1.5 — clean sandbox data for manual testing.
(function(){
  // Keep dictionaries/settings/projects, but start operational CRM data empty.
  state.children = [];
  state.groups = [];
  state.lessons = [];
  state.payments = [];
  state.refunds = [];
  state.sites = [];

  // Teachers are also empty: create your own records for testing.
  state.teachers = [];

  state.selectedChild = null;
  state.selectedGroup = null;
  state.selectedLesson = null;
  state.salaryTeacher = '';
  state.prototypeTeacherId = null;

  // Remove remaining static demo copy/counters from the dashboard.
  const cleanBaseDashboard = window.dashboard;
  window.dashboard = function(){
    let html = cleanBaseDashboard();
    html = html
      .replace('Среда, 9 сентября · обзор клуба','Обзор клуба')
      .replace('+2 за последние 30 дней','')
      .replace('1 был на пробном','')
      .replace('2 направления','')
      .replace('тестовые данные','')
      .replace('<span class="muted">2 занятия</span>','<span class="muted">0 занятий</span>');
    return html;
  };

  // Stats/partner are not yet real-data modules: don't show fake business numbers.
  window.stats = function(){
    return pageHead('Статистика','Раздел будет заполнен после появления реальных данных.')+
      '<div class="card pad"><div class="empty">Пока данных для статистики нет.</div></div>';
  };
  window.partner = function(){
    return pageHead('Партнёр','Расчёт появится после подключения реальных данных проекта.')+
      '<div class="card pad"><div class="empty">Пока данных для партнёрского расчёта нет.</div></div>';
  };

  render();
})();

/* ===== Стабилизированный раздел из v116.js ===== */
// iCube CRM v1.1.6 — payment corrections + safe empty-system relations.
(function(){
  function nextId(arr){
    return arr.length ? Math.max.apply(null,arr.map(function(x){return Number(x.id)||0;}))+1 : 1;
  }

  // Safety net for entities created from a completely empty sandbox.
  window.safeNextId = nextId;

  // Group must reference real directory records.
  const previousSaveGroup=window.saveGroupV111;
  window.saveGroupV111=function(id){
    const siteValue=document.querySelector('#gf-site')?.value;
    const teacherValue=document.querySelector('#gf-teacher')?.value;
    const siteId=Number(siteValue), teacherId=Number(teacherValue);
    if(!siteValue || siteValue==='new' || !byId(state.sites,siteId)){
      alert('Сначала выберите или создайте площадку.');
      return;
    }
    if(!teacherValue || teacherValue==='new' || !byId(state.teachers,teacherId)){
      alert('Сначала выберите или создайте преподавателя.');
      return;
    }
    return previousSaveGroup(id);
  };

  function paymentEnrollment(childId,direction){
    const c=byId(state.children,childId);
    return c ? c.enrollments.find(function(e){return e.direction===direction;}) : null;
  }

  function undoPayment(p){
    const e=paymentEnrollment(p.childId,p.direction);
    if(e) e.balance-=Number(p.lessons||0);
  }

  function applyPaymentRecord(p){
    const e=paymentEnrollment(p.childId,p.direction);
    if(e) e.balance+=Number(p.lessons||0);
  }

  window.paymentForm=function(childId,direction,paymentId){
    if(!state.children.length){
      alert('Сначала создайте ребёнка.');
      return;
    }
    const existing=paymentId?byId(state.payments,paymentId):null;
    const defaultChild=existing?.childId ?? childId ?? state.children[0].id;
    const child=byId(state.children,defaultChild) || state.children[0];
    const availableDirs=(child.enrollments||[]).map(function(e){return e.direction;});
    const defaultDir=existing?.direction ?? direction ?? availableDirs[0] ?? '';

    let html='<h3>'+(existing?'Редактировать оплату':'Новая оплата')+'</h3><div class="form-grid">';
    html+='<div class="field"><label>Дата</label><input class="input" id="pf-date" type="date" value="'+(existing?existing.date.split('.').reverse().join('-'):'2026-09-10')+'"></div>';
    html+='<div class="field"><label>Ребёнок</label><select class="select" id="pf-child" onchange="refreshPaymentDirections('+ (existing?.id||'null') +')">';
    state.children.forEach(function(c){html+='<option value="'+c.id+'"'+(c.id===child.id?' selected':'')+'>'+c.name+'</option>';});
    html+='</select></div>';
    html+='<div class="field"><label>Направление</label><select class="select" id="pf-dir" onchange="updatePaymentCalc()"></select></div>';
    html+='<div class="field"><label>Сумма, ₽</label><input class="input" id="pf-amount" type="number" step="0.01" value="'+(existing?.amount??4100)+'" oninput="updatePaymentCalc()"></div>';
    html+='<div class="field span-2"><label>Способ получения</label><select class="select" id="pf-method"><option'+((existing?.method||'На счёт iCube')==='На счёт iCube'?' selected':'')+'>На счёт iCube</option><option'+(existing?.method==='Наличными партнёру'?' selected':'')+'>Наличными партнёру</option></select></div>';
    html+='</div><div class="notice" id="pf-calc" style="margin-top:14px"></div><div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn primary" onclick="savePaymentV116('+(existing?.id||'null')+')">'+(existing?'Сохранить изменения':'Сохранить оплату')+'</button></div>';
    modal(html);
    setTimeout(function(){refreshPaymentDirections(existing?.id||null,defaultDir);},0);
  };

  window.refreshPaymentDirections=function(paymentId,preferred){
    const childId=Number(document.querySelector('#pf-child')?.value);
    const c=byId(state.children,childId);
    const box=document.querySelector('#pf-dir');
    if(!box)return;
    const dirs=(c?.enrollments||[]).map(function(e){return e.direction;});
    box.innerHTML=dirs.map(function(d){return '<option'+(d===preferred?' selected':'')+'>'+d+'</option>';}).join('');
    if(!dirs.length)box.innerHTML='<option value="">Нет направлений</option>';
    updatePaymentCalc();
  };

  window.updatePaymentCalc=function(){
    const childId=Number(document.querySelector('#pf-child')?.value);
    const direction=document.querySelector('#pf-dir')?.value;
    const e=paymentEnrollment(childId,direction);
    const box=document.querySelector('#pf-calc');
    if(!box)return;
    if(!e){box.innerHTML='У ребёнка нет выбранного направления.';return;}
    const price=effectivePrice(e),amount=Number(document.querySelector('#pf-amount')?.value||0);
    const lessons=price?amount/price:0;
    box.innerHTML='Цена операции: <b>'+money(price)+'</b> · будет начислено <b>'+Number(lessons.toFixed(6))+' занятия</b>.';
  };

  window.savePaymentV116=function(paymentId){
    const childId=Number(document.querySelector('#pf-child').value);
    const direction=document.querySelector('#pf-dir').value;
    const e=paymentEnrollment(childId,direction);
    const amount=Number(document.querySelector('#pf-amount').value);
    if(!e){alert('У выбранного ребёнка нет этого направления.');return;}
    if(!(amount>0)){alert('Укажите сумму оплаты.');return;}

    const existing=paymentId?byId(state.payments,paymentId):null;
    if(existing)undoPayment(existing);

    const price=effectivePrice(e);
    const record={
      id:existing?.id||nextId(state.payments),
      date:document.querySelector('#pf-date').value.split('-').reverse().join('.'),
      childId:childId,
      direction:direction,
      amount:amount,
      method:document.querySelector('#pf-method').value,
      price:price,
      lessons:amount/price
    };
    if(existing)Object.assign(existing,record);
    else state.payments.push(record);
    applyPaymentRecord(record);
    state.modal=null;
    state.page='payments';
    render();
  };

  window.editPayment=function(id){paymentForm(null,null,id);};

  window.deletePayment=function(id){
    const p=byId(state.payments,id);if(!p)return;
    const c=byId(state.children,p.childId);
    modal('<h3>Удалить оплату?</h3><div class="notice">Оплата '+money(p.amount)+' для '+(c?.name||'ребёнка')+' будет удалена, а начисленные '+Number(p.lessons.toFixed(6))+' занятия будут убраны из баланса.</div><div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn danger" onclick="confirmDeletePayment('+id+')">Удалить</button></div>');
  };

  window.confirmDeletePayment=function(id){
    const p=byId(state.payments,id);if(!p)return;
    undoPayment(p);
    state.payments=state.payments.filter(function(x){return x.id!==id;});
    state.modal=null;
    state.page='payments';
    render();
  };

  window.payments=function(){
    let html=pageHead('Оплаты','Каждая оплата относится к одному ребёнку и одному направлению; ошибочную запись можно исправить или удалить.','<button class="btn primary" onclick="paymentForm()">+ Оплата</button>');
    if(!state.payments.length)return html+'<div class="card pad"><div class="empty">Оплат пока нет.</div></div>';
    html+='<div class="card list"><div class="row header payment-main-row"><div>Ребёнок</div><div>Направление</div><div>Сумма</div><div>Дата</div><div>Занятий</div><div></div></div>';
    html+=state.payments.slice().reverse().map(function(p){
      const c=byId(state.children,p.childId);
      return '<div class="row payment-main-row"><div><b>'+(c?.name||'—')+'</b><div class="muted mini">'+p.method+'</div></div><div>'+p.direction+'</div><div class="money">'+money(p.amount)+'</div><div>'+p.date+'</div><div><span class="badge green">+'+Number(p.lessons.toFixed(4))+'</span></div><div style="display:flex;gap:6px;justify-content:flex-end"><button class="btn" onclick="editPayment('+p.id+')">Изменить</button><button class="btn danger" onclick="deletePayment('+p.id+')">Удалить</button></div></div>';
    }).join('');
    return html+'</div>';
  };

  // Repair ID selection explicitly in the final layer.
  window.openChild=function(id){
    const numeric=Number(id);
    state.selectedChild=numeric;
    state.childTab='overview';
    state.page='child';
    render();
  };
  window.openGroup=function(id){
    state.selectedGroup=Number(id);
    state.page='group';
    render();
  };

  render();
})();

/* ===== Стабилизированный раздел из v117.js ===== */
// iCube CRM v1.1.7 — unified direction/price editing with money-balance transfer.
(function(){
  function currentEnrollment(child, direction){
    if(!child) return null;
    if(direction) return (child.enrollments||[]).find(function(e){return e.direction===direction;}) || null;
    return (child.enrollments||[])[0] || null;
  }

  function archivedEnrollment(child, direction){
    if(!child) return null;
    const rows=(child.enrollmentHistory||[]).filter(function(e){return e.direction===direction;});
    return rows.length ? rows[rows.length-1] : null;
  }

  function basePriceFor(direction, groupId){
    const group=byId(state.groups,groupId);
    if(group && group.price!=null) return Number(group.price);
    return direction==='Программирование' ? Number(state.settings.codePrice||0) : Number(state.settings.robotPrice||0);
  }

  function formatNumber(n, digits){
    const value=Number(n||0);
    return Number(value.toFixed(digits==null?4:digits));
  }

  function directionGroupsHtml(direction, selectedGroupId){
    let html='<option value="">Без группы</option>';
    state.groups.filter(function(g){return g.active && g.direction===direction;}).forEach(function(g){
      html+='<option value="'+g.id+'"'+(Number(selectedGroupId)===Number(g.id)?' selected':'')+'>'+g.name+'</option>';
    });
    return html;
  }

  function proposedPrice(){
    const direction=document.querySelector('#md-dir')?.value;
    const rawGroup=document.querySelector('#md-group')?.value;
    const groupId=rawGroup ? Number(rawGroup) : null;
    const mode=document.querySelector('#md-price-mode')?.value || 'standard';
    if(mode==='individual'){
      const packagePrice=Number(document.querySelector('#md-individual-package')?.value||0);
      return packagePrice>0 ? packagePrice/4 : 0;
    }
    return basePriceFor(direction,groupId);
  }

  window.refreshManageDirectionGroups=function(selectedGroupId){
    const direction=document.querySelector('#md-dir')?.value;
    const box=document.querySelector('#md-group');
    if(!box) return;
    box.innerHTML=directionGroupsHtml(direction,selectedGroupId);
    refreshManageDirectionPreview();
  };

  window.toggleManageIndividualPrice=function(){
    const mode=document.querySelector('#md-price-mode')?.value || 'standard';
    const field=document.querySelector('#md-individual-wrap');
    if(field) field.style.display=mode==='individual'?'block':'none';
    refreshManageDirectionPreview();
  };

  window.refreshManageDirectionPreview=function(){
    const childId=Number(document.querySelector('#md-child-id')?.value);
    const oldDirection=document.querySelector('#md-old-dir')?.value;
    const child=byId(state.children,childId);
    const oldEnrollment=currentEnrollment(child,oldDirection);
    const box=document.querySelector('#md-preview');
    if(!oldEnrollment || !box) return;

    const oldPrice=effectivePrice(oldEnrollment);
    const moneyBalance=Number(oldEnrollment.balance||0)*Number(oldPrice||0);
    const newPrice=proposedPrice();
    const newBalance=newPrice ? moneyBalance/newPrice : 0;
    const newDirection=document.querySelector('#md-dir')?.value || oldDirection;
    const changedDirection=newDirection!==oldDirection;

    let html='<div class="info-list">';
    html+='<div class="info-line"><span>Текущий остаток</span><b>'+money(moneyBalance)+' ('+formatNumber(oldEnrollment.balance,4)+' занятий)</b></div>';
    html+='<div class="info-line"><span>Новая цена</span><b>'+(newPrice?money(newPrice)+' / занятие':'—')+'</b></div>';
    html+='<div class="info-line"><span>Баланс после изменения</span><b>'+(newPrice?formatNumber(newBalance,4)+' занятий':'—')+'</b></div>';
    html+='</div>';
    if(changedDirection){
      html+='<div class="notice" style="margin-top:12px">Денежный остаток <b>'+money(moneyBalance)+'</b> будет автоматически перенесён на «'+newDirection+'» и пересчитан по новой цене. Старые оплаты и посещения останутся в истории прежнего направления.</div>';
    }else if(newPrice && Math.abs(newPrice-oldPrice)>0.000001){
      html+='<div class="notice" style="margin-top:12px">Денежный остаток сохраняется: меняется только количество занятий, соответствующее новой цене.</div>';
    }else{
      html+='<div class="muted mini" style="margin-top:10px">Если направление и цена не меняются, баланс останется прежним.</div>';
    }
    box.innerHTML=html;
  };

  window.manageDirectionForm=function(childId, oldDirection){
    const child=byId(state.children,childId);
    const enrollment=currentEnrollment(child,oldDirection);
    if(!child || !enrollment) return;

    const currentGroupId=enrollment.groupId ?? null;
    const currentPrice=effectivePrice(enrollment);
    const packagePrice=enrollment.individualPrice!=null ? Number(enrollment.individualPrice)*4 : '';
    const directions=['Робототехника','Программирование'].filter(function(d){
      return d===oldDirection || !(child.enrollments||[]).some(function(e){return e.direction===d;});
    });

    let html='<h3>Изменить направление / цену</h3>';
    html+='<input type="hidden" id="md-child-id" value="'+childId+'">';
    html+='<input type="hidden" id="md-old-dir" value="'+oldDirection+'">';
    html+='<div class="form-grid">';
    html+='<div class="field"><label>Направление</label><select class="select" id="md-dir" onchange="refreshManageDirectionGroups()">';
    directions.forEach(function(d){html+='<option'+(d===oldDirection?' selected':'')+'>'+d+'</option>';});
    html+='</select></div>';
    html+='<div class="field"><label>Основная группа</label><select class="select" id="md-group" onchange="refreshManageDirectionPreview()">'+directionGroupsHtml(oldDirection,currentGroupId)+'</select></div>';
    html+='<div class="field span-2"><label>Цена</label><select class="select" id="md-price-mode" onchange="toggleManageIndividualPrice()"><option value="standard"'+(enrollment.individualPrice==null?' selected':'')+'>Обычная цена направления / группы</option><option value="individual"'+(enrollment.individualPrice!=null?' selected':'')+'>Индивидуальная цена</option></select><div class="muted mini" style="margin-top:5px">Сейчас: '+money(currentPrice)+' / занятие.</div></div>';
    html+='<div class="field span-2" id="md-individual-wrap" style="display:'+(enrollment.individualPrice!=null?'block':'none')+'"><label>Индивидуальная цена абонемента за 4 занятия, ₽</label><input class="input" id="md-individual-package" type="number" min="0" step="1" value="'+packagePrice+'" placeholder="Например, 2900" oninput="refreshManageDirectionPreview()"><div class="muted mini" id="md-individual-hint" style="margin-top:5px">CRM будет считать стоимость одного занятия как цену абонемента ÷ 4.</div></div>';
    html+='</div>';
    html+='<div id="md-preview" class="card pad" style="margin-top:14px"></div>';
    html+='<div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn primary" onclick="saveManagedDirection('+childId+',\''+oldDirection+'\')">Сохранить изменения</button></div>';
    modal(html);
    setTimeout(refreshManageDirectionPreview,0);
  };

  window.saveManagedDirection=function(childId, oldDirection){
    const child=byId(state.children,childId);
    const oldEnrollment=currentEnrollment(child,oldDirection);
    if(!child || !oldEnrollment) return;

    const newDirection=document.querySelector('#md-dir')?.value;
    const rawGroup=document.querySelector('#md-group')?.value;
    const groupId=rawGroup ? Number(rawGroup) : null;
    const mode=document.querySelector('#md-price-mode')?.value || 'standard';
    const packagePrice=Number(document.querySelector('#md-individual-package')?.value||0);

    if(mode==='individual' && !(packagePrice>0)){
      alert('Укажите индивидуальную цену абонемента за 4 занятия.');
      return;
    }

    if(newDirection!==oldDirection && (child.enrollments||[]).some(function(e){return e.direction===newDirection;})){
      alert('Это направление уже есть у ребёнка.');
      return;
    }

    const oldPrice=effectivePrice(oldEnrollment);
    const moneyBalance=Number(oldEnrollment.balance||0)*Number(oldPrice||0);
    const individualPrice=mode==='individual' ? packagePrice/4 : null;
    const draft={direction:newDirection,groupId:groupId,individualPrice:individualPrice,balance:0};
    const newPrice=effectivePrice(draft);
    if(!(newPrice>0)){
      alert('Не удалось определить новую цену.');
      return;
    }
    const newBalance=moneyBalance/newPrice;

    if(newDirection!==oldDirection){
      child.enrollmentHistory=child.enrollmentHistory||[];
      child.enrollmentHistory.push({
        direction:oldEnrollment.direction,
        groupId:oldEnrollment.groupId ?? null,
        individualPrice:oldEnrollment.individualPrice ?? null,
        balance:Number(oldEnrollment.balance||0),
        price:Number(oldPrice||0),
        moneyBalance:moneyBalance,
        changedTo:newDirection,
        newPrice:newPrice,
        transferredBalance:newBalance,
        endedAt:new Date().toISOString()
      });
      const index=child.enrollments.indexOf(oldEnrollment);
      const replacement={direction:newDirection,groupId:groupId,individualPrice:individualPrice,balance:newBalance};
      if(index>=0) child.enrollments.splice(index,1,replacement);
      else child.enrollments.push(replacement);
    }else{
      oldEnrollment.groupId=groupId;
      oldEnrollment.individualPrice=individualPrice;
      oldEnrollment.balance=newBalance;
    }

    state.modal=null;
    state.childTab='overview';
    state.page='child';
    render();
  };

  // One management action in the child card: payment + unified direction/price editing.
  const previousChild=window.child;
  window.child=function(){
    let html=previousChild();
    const child=byId(state.children,state.selectedChild);
    if(!child) return html;

    // Remove the separate "+ Добавить направление" action from the header.
    const addDirection='<button class="btn soft" onclick="enrollmentForm('+child.id+',null)">+ Добавить направление</button>';
    html=html.replace(addDirection,'');

    (child.enrollments||[]).forEach(function(e){
      const edit='<button class="btn" onclick="enrollmentForm('+child.id+',\''+e.direction+'\')">Изменить</button>';
      const unified='<button class="btn" onclick="manageDirectionForm('+child.id+',\''+e.direction+'\')">Изменить направление / цену</button>';
      html=html.replace(edit,unified);

      const transfer='<button class="btn" onclick="changeDirectionForm('+child.id+',\''+e.direction+'\')">Сменить направление</button>';
      html=html.replace(transfer,'');
    });

    if((child.enrollmentHistory||[]).length){
      const rows=child.enrollmentHistory.slice().reverse().map(function(e){
        const g=byId(state.groups,e.groupId);
        const rub=e.moneyBalance!=null ? money(e.moneyBalance) : money(Number(e.balance||0)*Number(e.price||0));
        return '<div class="kpi-line"><div><b>'+e.direction+' → '+e.changedTo+'</b><div class="muted mini">'+(g?g.name:'Без группы')+'</div></div><div style="text-align:right"><span class="badge gray">История</span><div class="muted mini" style="margin-top:4px">перенесено '+rub+'</div></div></div>';
      }).join('');
      const marker='<div class="grid cols-2" style="margin-top:16px">';
      if(!html.includes('История переводов')){
        html=html.replace(marker,'<div class="card pad" style="margin-top:16px"><div class="section-title"><h2>История переводов</h2><span class="muted mini">перенос по денежному остатку</span></div>'+rows+'</div>'+marker);
      }
    }
    return html;
  };

  // Editing personal data cannot silently change the direction.
  const previousChildForm=window.childForm;
  window.childForm=function(id){
    previousChildForm(id);
    if(!id) return;
    const select=document.querySelector('#cf-direction');
    if(!select) return;
    select.disabled=true;
    const field=select.closest('.field');
    if(field && !field.querySelector('.direction-edit-hint')){
      const hint=document.createElement('div');
      hint.className='muted mini direction-edit-hint';
      hint.style.marginTop='5px';
      hint.innerHTML='Направление и индивидуальная цена меняются в карточке ребёнка кнопкой <b>«Изменить направление / цену»</b>.';
      field.appendChild(hint);
    }
  };

  // Historical payment editing/deletion keeps affecting the ledger that existed at that direction.
  function ledgerEnrollment(childId,direction){
    const child=byId(state.children,childId);
    if(!child) return null;
    const current=(child.enrollments||[]).find(function(e){return e.direction===direction;});
    if(current) return current;
    return archivedEnrollment(child,direction);
  }

  function changeLedgerBalance(childId,direction,delta){
    const e=ledgerEnrollment(childId,direction);
    if(e) e.balance=Number(e.balance||0)+Number(delta||0);
  }

  const previousRefreshPaymentDirections=window.refreshPaymentDirections;
  window.refreshPaymentDirections=function(paymentId,preferred){
    const childId=Number(document.querySelector('#pf-child')?.value);
    const child=byId(state.children,childId);
    const existing=paymentId ? byId(state.payments,paymentId) : null;
    const box=document.querySelector('#pf-dir');
    if(!box) return;

    let dirs=(child?.enrollments||[]).map(function(e){return e.direction;});
    if(existing && Number(existing.childId)===childId && !dirs.includes(existing.direction)){
      dirs=[existing.direction].concat(dirs);
    }
    box.innerHTML=dirs.map(function(d){
      return '<option'+(d===(preferred||existing?.direction)?' selected':'')+'>'+d+'</option>';
    }).join('');
    if(!dirs.length) box.innerHTML='<option value="">Нет направлений</option>';
    if(typeof window.updatePaymentCalc==='function') window.updatePaymentCalc();
  };

  const previousUpdatePaymentCalc=window.updatePaymentCalc;
  window.updatePaymentCalc=function(){
    const childId=Number(document.querySelector('#pf-child')?.value);
    const direction=document.querySelector('#pf-dir')?.value;
    const child=byId(state.children,childId);
    const current=currentEnrollment(child,direction);
    if(current) return previousUpdatePaymentCalc();

    const box=document.querySelector('#pf-calc');
    if(!box) return;
    const payment=state.payments.find(function(p){
      return Number(p.childId)===childId && p.direction===direction;
    });
    const price=Number(payment?.price || 0);
    const amount=Number(document.querySelector('#pf-amount')?.value||0);
    if(!price){
      box.innerHTML='Это архивное направление. Для новой оплаты выберите текущее направление.';
      return;
    }
    box.innerHTML='Историческая цена операции: <b>'+money(price)+'</b> · '+formatNumber(amount/price,6)+' занятия.';
  };

  window.savePaymentV116=function(paymentId){
    const childId=Number(document.querySelector('#pf-child').value);
    const direction=document.querySelector('#pf-dir').value;
    const amount=Number(document.querySelector('#pf-amount').value);
    const target=ledgerEnrollment(childId,direction);
    const existing=paymentId?byId(state.payments,paymentId):null;

    if(!target){alert('У выбранного ребёнка нет этого направления.');return;}
    if(!(amount>0)){alert('Укажите сумму оплаты.');return;}

    if(existing) changeLedgerBalance(existing.childId,existing.direction,-Number(existing.lessons||0));

    let price;
    const current=byId(state.children,childId)?.enrollments?.find(function(e){return e.direction===direction;});
    if(current) price=effectivePrice(current);
    else if(existing && Number(existing.childId)===childId && existing.direction===direction) price=Number(existing.price||0);
    else price=Number(target.price||0) || effectivePrice(target);

    if(!(price>0)){
      if(existing) changeLedgerBalance(existing.childId,existing.direction,Number(existing.lessons||0));
      alert('Не удалось определить цену операции.');
      return;
    }

    const record={
      id:existing?.id || (typeof safeNextId==='function'?safeNextId(state.payments):Date.now()),
      date:document.querySelector('#pf-date').value.split('-').reverse().join('.'),
      childId:childId,
      direction:direction,
      amount:amount,
      method:document.querySelector('#pf-method').value,
      price:price,
      lessons:amount/price
    };

    if(existing) Object.assign(existing,record);
    else state.payments.push(record);
    changeLedgerBalance(record.childId,record.direction,Number(record.lessons||0));

    state.modal=null;
    state.page='payments';
    render();
  };

  window.confirmDeletePayment=function(id){
    const p=byId(state.payments,id);
    if(!p) return;
    changeLedgerBalance(p.childId,p.direction,-Number(p.lessons||0));
    state.payments=state.payments.filter(function(x){return x.id!==id;});
    state.modal=null;
    state.page='payments';
    render();
  };

  render();
})();

/* ===== Стабилизированный раздел из v118.js ===== */
// iCube CRM v1.1.8 — child cleanup, safe deletion, child-ledger actions and visit rollback.
(function(){
  function fmt(n,digits){
    const v=Number(n||0);
    return Number(v.toFixed(digits==null?4:digits));
  }

  function parseRuDate(s){
    const p=String(s||'').split('.').map(Number);
    return new Date(p[2]||0,(p[1]||1)-1,p[0]||1);
  }

  function childVisitsRows(childId){
    const rows=[];
    state.lessons.forEach(function(l){
      if(l.cancelled) return;
      const own=!!(l.attendance&&l.attendance[childId]);
      const extra=(l.extras||[]).find(function(e){return Number(e.childId)===Number(childId);});
      if(!own&&!extra) return;
      const g=byId(state.groups,l.groupId);
      if(!g) return;
      rows.push({lesson:l,group:g,extra:extra||null});
    });
    return rows.sort(function(a,b){
      return parseRuDate(b.lesson.date)-parseRuDate(a.lesson.date);
    });
  }
  window.childVisitsRowsV118=childVisitsRows;

  function currentEnrollmentForMoney(child, preferredDirection){
    if(!child) return null;
    return (child.enrollments||[]).find(function(e){return e.direction===preferredDirection;}) ||
      (child.enrollments||[])[0] || null;
  }

  function adjustCurrentMoney(childId, amountRub, preferredDirection){
    const child=byId(state.children,childId);
    const e=currentEnrollmentForMoney(child,preferredDirection);
    if(!e) return false;
    const price=Number(effectivePrice(e)||0);
    if(!(price>0)) return false;
    e.balance=Number(e.balance||0)+Number(amountRub||0)/price;
    return true;
  }

  function historicalDirectionPrice(childId,direction,lesson){
    if(lesson?.visitPriceSnapshot && Number(lesson.visitPriceSnapshot[childId])>0){
      return Number(lesson.visitPriceSnapshot[childId]);
    }
    const child=byId(state.children,childId);
    const active=(child?.enrollments||[]).find(function(e){return e.direction===direction;});
    if(active) return Number(effectivePrice(active)||0);

    const history=(child?.enrollmentHistory||[]).filter(function(e){return e.direction===direction && Number(e.price)>0;});
    if(history.length) return Number(history[history.length-1].price);

    const lessonDate=parseRuDate(lesson?.date);
    const payments=(state.payments||[]).filter(function(p){
      return Number(p.childId)===Number(childId) && p.direction===direction && Number(p.price)>0 && parseRuDate(p.date)<=lessonDate;
    }).sort(function(a,b){return parseRuDate(b.date)-parseRuDate(a.date);});
    if(payments.length) return Number(payments[0].price);

    return direction==='Программирование' ? Number(state.settings.codePrice||0) : Number(state.settings.robotPrice||0);
  }

  // Store the exact child lesson price when a lesson is charged.
  const previousConfirmFinish=window.confirmFinish;
  if(typeof previousConfirmFinish==='function'){
    window.confirmFinish=function(){
      const l=byId(state.lessons,state.selectedLesson);
      const g=l?byId(state.groups,l.groupId):null;
      if(l && g && !l.attendanceApplied){
        l.visitPriceSnapshot=l.visitPriceSnapshot||{};
        Object.entries(l.attendance||{}).filter(function(x){return !!x[1];}).forEach(function(x){
          const child=byId(state.children,Number(x[0]));
          const e=(child?.enrollments||[]).find(function(en){return en.direction===g.direction;});
          if(e) l.visitPriceSnapshot[Number(x[0])]=Number(effectivePrice(e)||0);
        });
        (l.extras||[]).filter(function(x){return !x.trial;}).forEach(function(x){
          const child=byId(state.children,x.childId);
          const e=(child?.enrollments||[]).find(function(en){return en.direction===g.direction;});
          if(e) l.visitPriceSnapshot[x.childId]=Number(effectivePrice(e)||0);
        });
      }
      return previousConfirmFinish();
    };
  }

  function childHasVisit(childId){
    return state.lessons.some(function(l){
      return !!(l.attendance&&l.attendance[childId]) ||
        (l.extras||[]).some(function(e){return Number(e.childId)===Number(childId);});
    });
  }

  window.deleteChildPrompt=function(childId){
    const child=byId(state.children,childId);
    if(!child) return;
    const payments=(state.payments||[]).filter(function(p){return Number(p.childId)===Number(childId);}).length;
    const refunds=(state.refunds||[]).filter(function(r){return Number(r.childId)===Number(childId);}).length;
    const visits=childVisitsRows(childId).length;

    if(payments || refunds || visits){
      const reasons=[];
      if(payments) reasons.push('оплаты: '+payments);
      if(refunds) reasons.push('возвраты: '+refunds);
      if(visits) reasons.push('посещения: '+visits);
      modal('<h3>Нельзя удалить ребёнка</h3><div class="notice">У <b>'+child.name+'</b> уже есть история: '+reasons.join(', ')+'. Ребёнка с финансовыми операциями или посещениями удалять нельзя, чтобы не повредить историю CRM.</div><div class="modal-actions"><button class="btn primary" onclick="closeModal()">Понятно</button></div>');
      return;
    }

    modal('<h3>Удалить ребёнка?</h3><div class="notice">У <b>'+child.name+'</b> нет оплат, возвратов и посещений. Карточка будет удалена без возможности восстановления в этом прототипе.</div><div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn danger" onclick="confirmDeleteChild('+childId+')">Удалить ребёнка</button></div>');
  };

  window.confirmDeleteChild=function(childId){
    state.lessons.forEach(function(l){
      if(l.attendance) delete l.attendance[childId];
      if(l.photos) delete l.photos[childId];
      if(l.visitPriceSnapshot) delete l.visitPriceSnapshot[childId];
      l.extras=(l.extras||[]).filter(function(e){return Number(e.childId)!==Number(childId);});
    });
    state.children=state.children.filter(function(c){return Number(c.id)!==Number(childId);});
    state.selectedChild=null;
    state.modal=null;
    state.page='children';
    render();
  };

  window.deleteVisitPrompt=function(childId,lessonId){
    const child=byId(state.children,childId);
    const lesson=byId(state.lessons,lessonId);
    const g=lesson?byId(state.groups,lesson.groupId):null;
    if(!child||!lesson||!g) return;
    const extra=(lesson.extras||[]).find(function(e){return Number(e.childId)===Number(childId);});
    const charged=!!lesson.attendanceApplied && !(extra&&extra.trial);
    const price=charged?historicalDirectionPrice(childId,g.direction,lesson):0;
    const current=currentEnrollmentForMoney(child,g.direction);
    const currentPrice=current?Number(effectivePrice(current)||0):0;
    const addLessons=charged&&currentPrice?price/currentPrice:0;

    let note='Посещение '+lesson.date+' · '+g.direction+' будет удалено.';
    if(charged){
      note+=' За него ранее было списано <b>'+money(price)+'</b>. Эта сумма вернётся в текущий денежный остаток ребёнка';
      if(current) note+=' и составит <b>+'+fmt(addLessons,4)+' занятия</b> по текущей цене '+money(currentPrice)+' / занятие';
      note+='.';
    }else if(extra&&extra.trial){
      note+=' Это ознакомительное посещение, поэтому баланс не изменится.';
    }else{
      note+=' Списание за это посещение ещё не применялось, поэтому баланс не изменится.';
    }

    modal('<h3>Удалить посещение?</h3><div class="notice">'+note+'</div><div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn danger" onclick="confirmDeleteVisit('+childId+','+lessonId+')">Удалить посещение</button></div>');
  };

  window.confirmDeleteVisit=function(childId,lessonId){
    const lesson=byId(state.lessons,lessonId);
    const g=lesson?byId(state.groups,lesson.groupId):null;
    const child=byId(state.children,childId);
    if(!lesson||!g||!child) return;

    const extra=(lesson.extras||[]).find(function(e){return Number(e.childId)===Number(childId);});
    const charged=!!lesson.attendanceApplied && !(extra&&extra.trial);
    if(charged){
      const price=historicalDirectionPrice(childId,g.direction,lesson);
      if(price>0) adjustCurrentMoney(childId,price,g.direction);
    }

    if(extra){
      lesson.extras=(lesson.extras||[]).filter(function(e){return Number(e.childId)!==Number(childId);});
    }else if(lesson.attendance){
      lesson.attendance[childId]=false;
    }
    if(lesson.photos) delete lesson.photos[childId];

    if(lesson.summary){
      const present=Object.values(lesson.attendance||{}).filter(Boolean).length+(lesson.extras||[]).length;
      const trials=(lesson.extras||[]).filter(function(e){return !!e.trial;}).length;
      const missing=Object.entries(lesson.attendance||{}).filter(function(x){return x[1]&&!lesson.photos?.[x[0]];}).length+
        (lesson.extras||[]).filter(function(e){return !lesson.photos?.[e.childId];}).length;
      lesson.summary={present:present,trials:trials,missing:missing};
    }

    state.modal=null;
    state.childTab='visits';
    state.page='child';
    render();
  };

  // Child-specific payment actions return to the child card after completion.
  window.editChildPayment=function(childId,paymentId){
    state.childPaymentEditReturn={childId:Number(childId),paymentId:Number(paymentId)};
    editPayment(paymentId);
  };

  window.deleteChildPayment=function(childId,paymentId){
    const p=byId(state.payments,paymentId);
    if(!p) return;
    modal('<h3>Удалить оплату?</h3><div class="notice">Оплата <b>'+money(p.amount)+'</b> от '+p.date+' будет удалена. Денежный баланс ребёнка будет уменьшен на эту сумму с пересчётом по его текущей цене.</div><div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn danger" onclick="confirmDeleteChildPayment('+childId+','+paymentId+')">Удалить</button></div>');
  };

  window.confirmDeleteChildPayment=function(childId,paymentId){
    const p=byId(state.payments,paymentId);
    if(!p) return;
    adjustCurrentMoney(p.childId,-Number(p.amount||0),p.direction);
    state.payments=state.payments.filter(function(x){return Number(x.id)!==Number(paymentId);});
    state.modal=null;
    state.selectedChild=Number(childId);
    state.childTab='payments';
    state.page='child';
    render();
  };

  // Money is the source of truth when an old payment is corrected after a direction/price change.
  window.savePaymentV116=function(paymentId){
    const childId=Number(document.querySelector('#pf-child').value);
    const direction=document.querySelector('#pf-dir').value;
    const amount=Number(document.querySelector('#pf-amount').value);
    const existing=paymentId?byId(state.payments,paymentId):null;
    const child=byId(state.children,childId);
    const current=(child?.enrollments||[]).find(function(e){return e.direction===direction;});

    if(!(amount>0)){alert('Укажите сумму оплаты.');return;}
    if(!current && !(existing && Number(existing.childId)===childId && existing.direction===direction)){
      alert('Для новой оплаты выберите текущее направление ребёнка.');
      return;
    }

    if(existing){
      adjustCurrentMoney(existing.childId,-Number(existing.amount||0),existing.direction);
    }

    let operationPrice=current?Number(effectivePrice(current)||0):Number(existing?.price||0);
    if(!(operationPrice>0)){
      if(existing) adjustCurrentMoney(existing.childId,Number(existing.amount||0),existing.direction);
      alert('Не удалось определить цену операции.');
      return;
    }

    const record={
      id:existing?.id || (typeof safeNextId==='function'?safeNextId(state.payments):Date.now()),
      date:document.querySelector('#pf-date').value.split('-').reverse().join('.'),
      childId:childId,
      direction:direction,
      amount:amount,
      method:document.querySelector('#pf-method').value,
      price:operationPrice,
      lessons:amount/operationPrice
    };

    if(existing) Object.assign(existing,record);
    else state.payments.push(record);
    adjustCurrentMoney(childId,amount,direction);

    const ret=state.childPaymentEditReturn;
    state.childPaymentEditReturn=null;
    state.modal=null;
    if(ret && existing && Number(ret.paymentId)===Number(existing.id)){
      state.selectedChild=Number(ret.childId);
      state.childTab='payments';
      state.page='child';
    }else{
      state.page='payments';
    }
    render();
  };

  // Global payment delete also uses money, not obsolete historical lesson units.
  window.confirmDeletePayment=function(id){
    const p=byId(state.payments,id);
    if(!p) return;
    adjustCurrentMoney(p.childId,-Number(p.amount||0),p.direction);
    state.payments=state.payments.filter(function(x){return Number(x.id)!==Number(id);});
    state.modal=null;
    state.page='payments';
    render();
  };

  function directionHistoryHtml(c){
    if(!(c.enrollmentHistory||[]).length) return '';
    const rows=c.enrollmentHistory.slice().reverse().map(function(e){
      const g=byId(state.groups,e.groupId);
      const rub=e.moneyBalance!=null?Number(e.moneyBalance):Number(e.balance||0)*Number(e.price||0);
      return '<div class="kpi-line"><div><b>'+e.direction+' → '+e.changedTo+'</b><div class="muted mini">'+(g?g.name:'Без группы')+'</div></div><div style="text-align:right"><span class="badge gray">История</span><div class="muted mini" style="margin-top:4px">перенесено '+money(rub)+'</div></div></div>';
    }).join('');
    return '<div class="card pad" style="margin-top:16px"><div class="section-title"><h2>История переводов</h2><span class="muted mini">денежный остаток</span></div>'+rows+'</div>';
  }

  function childOverviewV118(c){
    const directions=(c.enrollments||[]).map(function(e){
      const g=byId(state.groups,e.groupId);
      return '<div style="border-top:1px solid var(--line);padding:14px 0">'+
        '<div style="display:flex;justify-content:space-between;gap:12px">'+
          '<div><b>'+e.direction+'</b><div class="muted">'+(g?g.name:'Без группы')+'</div></div>'+
          '<div style="text-align:right"><div class="money '+(e.balance<0?'negative':e.balance>0?'positive':'')+'">'+fmt(e.balance,4)+' занятий</div><div class="muted mini">'+money(effectivePrice(e))+' / занятие</div></div>'+
        '</div>'+
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">'+
          '<button class="btn soft" onclick="paymentForm('+c.id+',\''+e.direction+'\')">+ Оплата</button>'+
          '<button class="btn" onclick="manageDirectionForm('+c.id+',\''+e.direction+'\')">Изменить направление / цену</button>'+
        '</div>'+
      '</div>';
    }).join('');

    const payments=(state.payments||[]).filter(function(p){return Number(p.childId)===Number(c.id);}).slice().reverse().slice(0,3);
    const visits=childVisitsRows(c.id).slice(0,3);

    const payMini=payments.length?payments.map(function(p){
      return '<div class="kpi-line"><div><b>'+p.direction+'</b><div class="muted mini">'+p.date+' · '+p.method+'</div></div><div class="money positive">+'+fmt(p.lessons,4)+' · '+money(p.amount)+'</div></div>';
    }).join(''):'<div class="empty">Оплат пока нет</div>';

    const visitMini=visits.length?visits.map(function(x){
      return '<div class="kpi-line clickable" onclick="state.selectedLesson='+x.lesson.id+';state.page=\'lesson\';render()"><div><b>'+x.lesson.date+' · '+x.group.direction+'</b><div class="muted mini">'+(x.lesson.topic||x.group.name)+'</div></div><span class="badge green">Был</span></div>';
    }).join(''):'<div class="empty">Посещений пока нет</div>';

    return '<div class="split">'+
      '<div class="card pad"><div class="section-title"><h2>Направления</h2><span class="badge '+statusBadge(c.status)+'">'+c.status+'</span></div>'+directions+'</div>'+
      '<div class="card pad"><div class="section-title"><h2>Контакты и данные</h2></div><div class="info-list">'+
        '<div class="info-line"><span>Дата рождения</span><b>'+(c.birth||'—')+'</b></div>'+
        '<div class="info-line"><span>Родитель</span><b>'+(c.parent||'—')+'</b></div>'+
        '<div class="info-line"><span>Телефон</span><b>'+(c.phone||'—')+'</b></div>'+
        '<div class="info-line"><span>Примечание</span><span style="text-align:right">'+(c.note||'—')+'</span></div>'+
      '</div></div></div>'+
      directionHistoryHtml(c)+
      '<div class="grid cols-2" style="margin-top:16px">'+
        '<div class="card pad"><div class="section-title"><h2>Последние оплаты</h2><button class="btn" onclick="setChildTab(\'payments\')">Все</button></div>'+payMini+'</div>'+
        '<div class="card pad"><div class="section-title"><h2>История посещений</h2><button class="btn" onclick="setChildTab(\'visits\')">Все</button></div>'+visitMini+'</div>'+
      '</div>';
  }

  function childPaymentsV118(c){
    const rows=(state.payments||[]).filter(function(p){return Number(p.childId)===Number(c.id);}).slice().reverse();
    let html='<div class="card child-ledger-card"><div class="child-ledger-head"><div><h2>Оплаты</h2><div class="muted mini child-ledger-count">'+rows.length+' операций</div></div><button class="btn primary" onclick="paymentForm('+c.id+',\''+((c.enrollments||[])[0]?.direction||'Робототехника')+'\')">+ Оплата</button></div>';
    if(!rows.length) return html+'<div class="empty">Оплат пока нет.</div></div>';
    html+='<div class="list"><div class="row header" style="grid-template-columns:1fr 1.2fr .9fr 1.2fr .7fr 1.2fr"><div>Дата</div><div>Направление</div><div>Сумма</div><div>Способ</div><div>Занятий</div><div></div></div>';
    html+=rows.map(function(p){
      return '<div class="row" style="grid-template-columns:1fr 1.2fr .9fr 1.2fr .7fr 1.2fr">'+
        '<div><b>'+p.date+'</b></div><div>'+p.direction+'</div><div class="money">'+money(p.amount)+'</div><div>'+p.method+'</div><div class="positive">+'+fmt(p.lessons,4)+'</div>'+
        '<div style="display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap"><button class="btn" onclick="editChildPayment('+c.id+','+p.id+')">Изменить</button><button class="btn danger" onclick="deleteChildPayment('+c.id+','+p.id+')">Удалить</button></div>'+
      '</div>';
    }).join('');
    return html+'</div></div>';
  }

  function childVisitsV118(c){
    const rows=childVisitsRows(c.id);
    let html='<div class="card child-ledger-card"><div class="child-ledger-head"><div><h2>Посещения</h2><div class="muted mini child-ledger-count">'+rows.length+' посещений</div></div></div>';
    if(!rows.length) return html+'<div class="empty">Посещений пока нет.</div></div>';
    html+='<div class="list"><div class="row header" style="grid-template-columns:1fr 1fr 1.4fr auto auto auto"><div>Дата</div><div>Направление</div><div>Группа</div><div>Статус</div><div>Тип</div><div></div></div>';
    html+=rows.map(function(x){
      const type=(x.extra?'<span class="badge blue">Добавлен</span>':'')+(x.extra?.trial?' <span class="badge amber">Ознакомительное</span>':'');
      return '<div class="row" style="grid-template-columns:1fr 1fr 1.4fr auto auto auto">'+
        '<div class="clickable" onclick="state.selectedLesson='+x.lesson.id+';state.page=\'lesson\';render()"><b>'+x.lesson.date+'</b><div class="muted mini">'+x.lesson.time+'</div></div>'+
        '<div>'+x.group.direction+'</div><div>'+x.group.name+'</div><div><span class="badge green">Был</span></div><div>'+type+'</div>'+
        '<div><button class="btn danger" onclick="deleteVisitPrompt('+c.id+','+x.lesson.id+')">Удалить</button></div>'+
      '</div>';
    }).join('');
    return html+'</div></div>';
  }

  function childRefundsV118(c){
    const rows=(state.refunds||[]).filter(function(r){return Number(r.childId)===Number(c.id);}).slice().reverse();
    let html='<div class="card child-ledger-card"><div class="child-ledger-head"><div><h2>Возвраты</h2><div class="muted mini child-ledger-count">'+rows.length+' операций</div></div><button class="btn primary" onclick="refundFormForChild('+c.id+')">+ Возврат</button></div>';
    if(!rows.length) return html+'<div class="empty">Возвратов пока нет.</div></div>';
    html+='<div class="list"><div class="row header"><div>Дата</div><div>Направление</div><div>Сумма</div><div>Цена</div><div>Занятий</div></div>';
    html+=rows.map(function(r){
      return '<div class="row"><div><b>'+r.date+'</b></div><div>'+r.direction+'</div><div class="money negative">−'+money(r.amount)+'</div><div>'+money(r.price)+'</div><div>−'+fmt(r.lessons,4)+'</div></div>';
    }).join('');
    return html+'</div></div>';
  }

  // Final child card override.
  window.child=function(){
    const c=byId(state.children,state.selectedChild);
    if(!c) return children();

    let body='';
    if(state.childTab==='payments') body=childPaymentsV118(c);
    else if(state.childTab==='visits') body=childVisitsV118(c);
    else if(state.childTab==='refunds') body=childRefundsV118(c);
    else body=childOverviewV118(c);

    const tabs='<div class="tabs">'+
      '<button class="'+(state.childTab==='overview'?'active':'')+'" onclick="setChildTab(\'overview\')">Обзор</button>'+
      '<button class="'+(state.childTab==='payments'?'active':'')+'" onclick="setChildTab(\'payments\')">Оплаты</button>'+
      '<button class="'+(state.childTab==='visits'?'active':'')+'" onclick="setChildTab(\'visits\')">Посещения</button>'+
      '<button class="'+(state.childTab==='refunds'?'active':'')+'" onclick="setChildTab(\'refunds\')">Возвраты</button>'+
    '</div>';

    return '<button class="btn" style="margin-bottom:14px" onclick="navTo(\'children\')">← Дети</button>'+
      pageHead(c.name,c.school+' · '+c.grade+' · '+c.parent,
        '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" onclick="childForm('+c.id+')">Редактировать</button><button class="btn danger" onclick="deleteChildPrompt('+c.id+')">Удалить ребёнка</button></div>')+
      tabs+body;
  };

  render();
})();


// v1.1.9 fixes: stay on child after new payment + retroactive attendance accounting.
(function(){
  function currentEnrollmentForDirection(child,direction){
    return (child?.enrollments||[]).find(function(e){return e.direction===direction;}) || null;
  }

  function currentEnrollmentAny(child,direction){
    return currentEnrollmentForDirection(child,direction) || (child?.enrollments||[])[0] || null;
  }

  function lessonPriceForChild(childId,lesson,group){
    lesson.visitPriceSnapshot=lesson.visitPriceSnapshot||{};
    if(Number(lesson.visitPriceSnapshot[childId])>0) return Number(lesson.visitPriceSnapshot[childId]);

    const child=byId(state.children,childId);
    const active=currentEnrollmentForDirection(child,group.direction);
    if(active) return Number(effectivePrice(active)||0);

    const history=(child?.enrollmentHistory||[]).filter(function(e){
      return e.direction===group.direction && Number(e.price)>0;
    });
    if(history.length) return Number(history[history.length-1].price);

    return group.direction==='Программирование'
      ? Number(state.settings.codePrice||0)
      : Number(state.settings.robotPrice||0);
  }

  function applyMoneyDeltaToCurrent(childId,amountRub,preferredDirection){
    const child=byId(state.children,childId);
    const current=currentEnrollmentAny(child,preferredDirection);
    if(!current) return false;
    const currentPrice=Number(effectivePrice(current)||0);
    if(!(currentPrice>0)) return false;
    current.balance=Number(current.balance||0)+Number(amountRub||0)/currentPrice;
    return true;
  }

  // Called from the child card so creating a payment returns to the same child.
  window.newChildPayment=function(childId,direction){
    state.childPaymentAddReturn={childId:Number(childId)};
    paymentForm(childId,direction);
  };

  // Extend payment save: additions from a child card return to that child's Payments tab.
  const savePaymentBeforeV119=window.savePaymentV116;
  window.savePaymentV116=function(paymentId){
    const addReturn=!paymentId ? state.childPaymentAddReturn : null;
    const editReturn=paymentId ? state.childPaymentEditReturn : null;

    // Replicate v118 money-first save to control navigation reliably.
    const childId=Number(document.querySelector('#pf-child').value);
    const direction=document.querySelector('#pf-dir').value;
    const amount=Number(document.querySelector('#pf-amount').value);
    const existing=paymentId?byId(state.payments,paymentId):null;
    const child=byId(state.children,childId);
    const current=currentEnrollmentForDirection(child,direction);

    if(!(amount>0)){alert('Укажите сумму оплаты.');return;}
    if(!current && !(existing && Number(existing.childId)===childId && existing.direction===direction)){
      alert('Для новой оплаты выберите текущее направление ребёнка.');
      return;
    }

    if(existing){
      applyMoneyDeltaToCurrent(existing.childId,-Number(existing.amount||0),existing.direction);
    }

    const operationPrice=current ? Number(effectivePrice(current)||0) : Number(existing?.price||0);
    if(!(operationPrice>0)){
      if(existing) applyMoneyDeltaToCurrent(existing.childId,Number(existing.amount||0),existing.direction);
      alert('Не удалось определить цену операции.');
      return;
    }

    const record={
      id:existing?.id || (typeof safeNextId==='function'?safeNextId(state.payments):Date.now()),
      date:document.querySelector('#pf-date').value.split('-').reverse().join('.'),
      childId:childId,
      direction:direction,
      amount:amount,
      method:document.querySelector('#pf-method').value,
      price:operationPrice,
      lessons:amount/operationPrice
    };

    if(existing) Object.assign(existing,record);
    else state.payments.push(record);
    applyMoneyDeltaToCurrent(childId,amount,direction);

    state.modal=null;
    state.childPaymentAddReturn=null;
    state.childPaymentEditReturn=null;

    if((addReturn && Number(addReturn.childId)===childId) || (editReturn && existing)){
      state.selectedChild=addReturn ? Number(addReturn.childId) : Number(editReturn.childId);
      state.childTab='payments';
      state.page='child';
    }else{
      state.page='payments';
    }
    render();
  };

  // If a completed lesson is edited retroactively, apply/rollback its money immediately.
  const previousAttend=window.attend || attend;
  window.attend=function(id,value){
    const lesson=byId(state.lessons,state.selectedLesson);
    if(!lesson) return;
    lesson.attendance=lesson.attendance||{};
    const old=!!lesson.attendance[id];
    if(old===!!value){render();return;}

    const group=byId(state.groups,lesson.groupId);
    const child=byId(state.children,id);

    if(lesson.done && lesson.attendanceApplied && group && child){
      const price=lessonPriceForChild(id,lesson,group);
      if(value){
        lesson.visitPriceSnapshot=lesson.visitPriceSnapshot||{};
        lesson.visitPriceSnapshot[id]=price;
        // Visiting consumes this historical lesson's ruble value from today's carried balance.
        applyMoneyDeltaToCurrent(id,-price,group.direction);
      }else{
        applyMoneyDeltaToCurrent(id,price,group.direction);
      }
    }

    lesson.attendance[id]=!!value;
    if(lesson.summary){
      lesson.summary.present=Object.values(lesson.attendance||{}).filter(Boolean).length+(lesson.extras||[]).length;
      lesson.summary.trials=(lesson.extras||[]).filter(function(e){return !!e.trial;}).length;
    }
    render();
  };

  // Adding a child to an already completed lesson also immediately charges the visit.
  const previousAddExtra=window.addExtra || addExtra;
  window.addExtra=function(id){
    const lesson=byId(state.lessons,state.selectedLesson);
    const group=lesson?byId(state.groups,lesson.groupId):null;
    const child=byId(state.children,id);
    if(!lesson||!group||!child) return;
    if((lesson.extras||[]).some(function(e){return Number(e.childId)===Number(id);})) return;

    const hasDirection=!!currentEnrollmentForDirection(child,group.direction) ||
      (child.enrollmentHistory||[]).some(function(e){return e.direction===group.direction;});
    const extra={childId:id,trial:!hasDirection};
    lesson.extras=lesson.extras||[];
    lesson.extras.push(extra);

    if(lesson.done && lesson.attendanceApplied && !extra.trial){
      const price=lessonPriceForChild(id,lesson,group);
      lesson.visitPriceSnapshot=lesson.visitPriceSnapshot||{};
      lesson.visitPriceSnapshot[id]=price;
      applyMoneyDeltaToCurrent(id,-price,group.direction);
    }

    if(lesson.summary){
      lesson.summary.present=Object.values(lesson.attendance||{}).filter(Boolean).length+(lesson.extras||[]).length;
      lesson.summary.trials=(lesson.extras||[]).filter(function(e){return !!e.trial;}).length;
    }
    render();
  };

  // Patch child UI payment buttons to use child-aware navigation.
  const childBeforeV119=window.child;
  window.child=function(){
    let html=childBeforeV119();
    const c=byId(state.children,state.selectedChild);
    if(!c) return html;
    (c.enrollments||[]).forEach(function(e){
      const oldBtn='<button class="btn soft" onclick="paymentForm('+c.id+',\''+e.direction+'\')">+ Оплата</button>';
      const newBtn='<button class="btn soft" onclick="newChildPayment('+c.id+',\''+e.direction+'\')">+ Оплата</button>';
      html=html.replaceAll(oldBtn,newBtn);
    });

    const mainDir=(c.enrollments||[])[0]?.direction||'Робототехника';
    const oldTop='<button class="btn primary" onclick="paymentForm('+c.id+',\''+mainDir+'\')">+ Оплата</button>';
    const newTop='<button class="btn primary" onclick="newChildPayment('+c.id+',\''+mainDir+'\')">+ Оплата</button>';
    html=html.replace(oldTop,newTop);
    return html;
  };

  render();
})();

/* ===== Стабилизированный раздел из v119.js ===== */
// iCube CRM v1.1.9 — empty-directory group creation + direction-colored group cards.
(function(){
  function activeSites(){return (state.sites||[]).filter(function(s){return s.active!==false;});}
  function activeTeachers(){return (state.teachers||[]).filter(function(t){return t.active!==false;});}

  function groupDraft(id){
    return {
      id:id||null,
      direction:document.querySelector('#gf-dir')?.value||'Робототехника',
      siteId:(function(){const v=document.querySelector('#gf-site')?.value;return v&&v!=='new'?Number(v):null;})(),
      day:document.querySelector('#gf-day')?.value||'Четверг',
      teacherId:(function(){const v=document.querySelector('#gf-teacher')?.value;return v&&v!=='new'?Number(v):null;})(),
      startTime:document.querySelector('#gf-start')?.value||'13:00',
      endTime:document.querySelector('#gf-end')?.value||'14:30',
      project:document.querySelector('#gf-project')?.value||'iCubeRobots',
      price:document.querySelector('#gf-price')?.value||'',
      active:document.querySelector('#gf-active')?.value!=='false'
    };
  }

  window.createGroupRelatedV119=function(type,id){
    state.pendingGroupDraft=groupDraft(id);
    if(type==='site') siteForm(null,true);
    else teacherForm(null,true);
  };

  window.groupForm=function(id,suppliedDraft){
    const g=id?byId(state.groups,id):null;
    const sites=activeSites(), teachers=activeTeachers();
    const draft=suppliedDraft||(g?{
      id:g.id,direction:g.direction,siteId:g.siteId,day:g.day,teacherId:g.teacherId,
      startTime:g.startTime||String(g.time||'13:00–14:30').split('–')[0],
      endTime:g.endTime||String(g.time||'13:00–14:30').split('–')[1],
      project:g.project,price:g.price??'',active:g.active!==false
    }:{
      id:null,direction:'Робототехника',siteId:sites[0]?.id||null,day:'Четверг',
      teacherId:teachers[0]?.id||null,startTime:'13:00',endTime:'14:30',
      project:'iCubeRobots',price:'',active:true
    });

    let html='<h3>'+(g?'Редактировать группу':'Новая группа')+'</h3><div class="form-grid">';
    html+='<div class="field"><label>Направление</label><select class="select" id="gf-dir"><option'+(draft.direction==='Робототехника'?' selected':'')+'>Робототехника</option><option'+(draft.direction==='Программирование'?' selected':'')+'>Программирование</option></select></div>';

    html+='<div class="field"><label>Площадка</label>';
    if(sites.length){
      html+='<select class="select" id="gf-site" onchange="if(this.value===\'new\')createGroupRelatedV119(\'site\','+(id||'null')+')">';
      sites.forEach(function(s){html+='<option value="'+s.id+'"'+(Number(draft.siteId)===Number(s.id)?' selected':'')+'>'+s.name+'</option>';});
      html+='<option value="new">+ Создать площадку</option></select>';
    }else{
      html+='<input type="hidden" id="gf-site" value=""><button type="button" class="btn soft group-empty-create" onclick="createGroupRelatedV119(\'site\','+(id||'null')+')">+ Создать первую площадку</button><div class="muted mini" style="margin-top:5px">Площадок пока нет.</div>';
    }
    html+='</div>';

    html+='<div class="field"><label>День недели</label><select class="select" id="gf-day">';
    ['Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье'].forEach(function(d){html+='<option'+(draft.day===d?' selected':'')+'>'+d+'</option>';});
    html+='</select></div>';

    html+='<div class="field"><label>Преподаватель</label>';
    if(teachers.length){
      html+='<select class="select" id="gf-teacher" onchange="if(this.value===\'new\')createGroupRelatedV119(\'teacher\','+(id||'null')+')">';
      teachers.forEach(function(t){html+='<option value="'+t.id+'"'+(Number(draft.teacherId)===Number(t.id)?' selected':'')+'>'+t.name+'</option>';});
      html+='<option value="new">+ Создать преподавателя</option></select>';
    }else{
      html+='<input type="hidden" id="gf-teacher" value=""><button type="button" class="btn soft group-empty-create" onclick="createGroupRelatedV119(\'teacher\','+(id||'null')+')">+ Создать первого преподавателя</button><div class="muted mini" style="margin-top:5px">Преподавателей пока нет.</div>';
    }
    html+='</div>';

    html+='<div class="field span-2"><label>Время занятия</label><div style="display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:center"><input class="input" id="gf-start" type="time" step="1800" value="'+draft.startTime+'" onchange="refreshGroupEndTime()"><span class="muted" style="font-size:18px">→</span><input class="input" id="gf-end" type="time" value="'+draft.endTime+'"></div></div>';
    html+='<div class="field"><label>Проект / владелец</label><select class="select" id="gf-project"><option'+(draft.project==='iCubeRobots'?' selected':'')+'>iCubeRobots</option><option'+(draft.project==='Зебра'?' selected':'')+'>Зебра</option></select></div>';
    html+='<div class="field"><label>Специальная цена, ₽</label><input class="input" id="gf-price" type="number" step="0.01" value="'+(draft.price??'')+'" placeholder="Пусто = цена направления"></div>';
    html+='<div class="field"><label>Активность</label><select class="select" id="gf-active"><option value="true"'+(draft.active?' selected':'')+'>Активна</option><option value="false"'+(!draft.active?' selected':'')+'>Неактивна</option></select></div>';
    html+='</div>';

    if(!sites.length||!teachers.length){
      const missing=[]; if(!sites.length)missing.push('площадку'); if(!teachers.length)missing.push('преподавателя');
      html+='<div class="notice" style="margin-top:14px">Для создания группы сначала создайте '+missing.join(' и ')+' прямо кнопкой выше. Уже заполненные данные группы сохранятся.</div>';
    }
    html+='<div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn primary" onclick="saveGroupV111('+(id||'null')+')"'+((!sites.length||!teachers.length)?' disabled title="Сначала создайте площадку и преподавателя"':'')+'>'+(g?'Сохранить':'Создать группу')+'</button></div>';
    modal(html);
  };

  window.groups=function(){
    let html=pageHead('Группы','Регулярное расписание, площадка, преподаватель, проект и цена','<button class="btn primary" onclick="groupForm(null)">+ Новая группа</button>');
    if(!(state.groups||[]).length) return html+'<div class="card pad"><div class="empty">Групп пока нет.</div></div>';
    html+='<div class="grid cols-3">';
    html+=(state.groups||[]).map(function(g){
      const kids=groupChildren(g.id);
      const site=byId(state.sites,g.siteId), teacher=byId(state.teachers,g.teacherId);
      const dirClass=g.direction==='Программирование'?'group-direction-program':'group-direction-robot';
      const dirBadge=g.direction==='Программирование'?'purple':'blue';
      return '<div class="card pad clickable group-card '+dirClass+'" onclick="openGroup('+g.id+')">'+
        '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><div style="display:flex;gap:7px;flex-wrap:wrap"><span class="badge '+dirBadge+'">'+g.direction+'</span><span class="badge '+(g.project==='Зебра'?'purple':'gray')+'">'+g.project+'</span></div><span class="badge '+(g.active?'green':'gray')+'">'+(g.active?'Активна':'Неактивна')+'</span></div>'+
        '<h3 style="margin:14px 0 5px">'+g.name+'</h3>'+
        '<div class="info-list" style="margin-top:12px">'+
          '<div class="info-line"><span>Время</span><b>'+(g.startTime||String(g.time||'').split('–')[0])+'–'+(g.endTime||String(g.time||'').split('–')[1]||'')+'</b></div>'+
          '<div class="info-line"><span>Площадка</span><b>'+(site?site.name:'Не выбрана')+'</b></div>'+
          '<div class="info-line"><span>Преподаватель</span><b>'+(teacher?teacher.name:'Не выбран')+'</b></div>'+
          '<div class="info-line"><span>Детей</span><b>'+kids.length+'</b></div>'+
          '<div class="info-line"><span>Цена</span><b>'+(g.price?money(g.price):'Наследуется')+'</b></div>'+
        '</div><div class="group-card-hint">Открыть группу →</div></div>';
    }).join('');
    return html+'</div>';
  };

  render();
})();

/* ===== Стабилизированный раздел из v120.js ===== */
// iCube CRM v1.1.10 — teacher quick child creation + director review queue.
(function(){
  function nextChildId(){
    return (state.children||[]).length
      ? Math.max.apply(null,state.children.map(function(c){return Number(c.id)||0;}))+1
      : 1;
  }

  function currentTeacherId(){
    if(typeof window.currentPrototypeTeacherId==='function') return Number(window.currentPrototypeTeacherId()||0);
    return Number(state.prototypeTeacherId||0);
  }

  function esc(s){
    return String(s??'').replace(/[&<>"']/g,function(ch){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
    });
  }

  window.teacherQuickChildForm=function(){
    const lesson=byId(state.lessons,state.selectedLesson);
    const group=lesson?byId(state.groups,lesson.groupId):null;
    if(!lesson||!group) return;

    let html='<h3>Новый ребёнок на занятии</h3>';
    html+='<div class="notice">Создайте минимальную карточку. Ребёнок сразу появится в CRM и будет отмечен на этом занятии как <b>ознакомительный</b>. Директор позже дополнит данные.</div>';
    html+='<div class="form-grid" style="margin-top:14px">';
    html+='<div class="field span-2"><label>Фамилия Имя</label><input class="input" id="tqc-name" placeholder="Иванов Иван"></div>';
    html+='<div class="field span-2"><label>Телефон родителя</label><input class="input" id="tqc-phone" placeholder="+7 900 000-00-00"></div>';
    html+='</div>';
    html+='<div class="muted mini" style="margin-top:10px">Направление будет указано автоматически: '+esc(group.direction)+'. В основную группу ребёнок пока не зачисляется.</div>';
    html+='<div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn primary" onclick="saveTeacherQuickChild()">Создать и отметить</button></div>';
    modal(html);
  };

  window.saveTeacherQuickChild=function(){
    const lesson=byId(state.lessons,state.selectedLesson);
    const group=lesson?byId(state.groups,lesson.groupId):null;
    if(!lesson||!group) return;

    const name=document.querySelector('#tqc-name')?.value.trim()||'';
    const phone=document.querySelector('#tqc-phone')?.value.trim()||'';
    if(!name){alert('Укажите фамилию и имя ребёнка.');return;}
    if(!phone){alert('Укажите телефон родителя.');return;}

    const id=nextChildId();
    const teacherId=currentTeacherId() || Number(lesson.teacherId||group.teacherId||0);

    const child={
      id:id,
      name:name,
      birth:'',
      school:'',
      grade:'',
      parent:'',
      phone:phone,
      status:'Лид',
      note:'',
      enrollments:[{
        direction:group.direction,
        groupId:null,
        individualPrice:null,
        balance:0
      }],
      needsDirectorReview:true,
      createdByTeacher:true,
      createdByTeacherId:teacherId||null,
      createdFromLessonId:lesson.id,
      createdAt:new Date().toISOString()
    };
    state.children.push(child);

    lesson.extras=lesson.extras||[];
    if(!lesson.extras.some(function(e){return Number(e.childId)===id;})){
      lesson.extras.push({
        childId:id,
        trial:true,
        createdByTeacher:true
      });
    }
    lesson.photos=lesson.photos||{};

    if(lesson.summary){
      lesson.summary.present=Object.values(lesson.attendance||{}).filter(Boolean).length+(lesson.extras||[]).length;
      lesson.summary.trials=(lesson.extras||[]).filter(function(e){return !!e.trial;}).length;
    }

    state.modal=null;
    render();
  };

  // Search existing children and always offer quick creation below the results.
  window.showExtraResults=function(q){
    const box=document.querySelector('#extraResults');
    if(!box) return;
    const lesson=byId(state.lessons,state.selectedLesson);
    const group=lesson?byId(state.groups,lesson.groupId):null;
    if(!lesson||!group){box.innerHTML='';return;}

    const query=String(q||'').trim().toLowerCase();
    let results=[];
    if(query){
      results=(state.children||[]).filter(function(c){
        const inMainGroup=groupChildren(group.id).some(function(k){return Number(k.id)===Number(c.id);});
        const alreadyExtra=(lesson.extras||[]).some(function(e){return Number(e.childId)===Number(c.id);});
        return !inMainGroup && !alreadyExtra &&
          (String(c.name||'').toLowerCase().includes(query) || String(c.phone||'').toLowerCase().includes(query));
      }).slice(0,4);
    }

    let html='';
    if(results.length){
      html+=results.map(function(c){
        return '<button class="btn" style="width:100%;margin-top:6px;justify-content:flex-start" onclick="addExtra('+c.id+')">'+esc(c.name)+'</button>';
      }).join('');
    }else if(query){
      html+='<div class="muted mini" style="margin-top:8px">Совпадений не найдено.</div>';
    }

    html+='<button class="btn soft" style="width:100%;margin-top:10px;justify-content:center" onclick="teacherQuickChildForm()">+ Новый ребёнок</button>';
    box.innerHTML=html;
  };

  // Make the new-child action visible even before teacher starts typing.
  const teacherLessonBeforeV110=window.teacherLesson;
  window.teacherLesson=function(){
    let html=teacherLessonBeforeV110();
    if(!html) return html;
    const marker='<div id="extraResults"></div>';
    const replacement='<div id="extraResults"><button class="btn soft" style="width:100%;margin-top:10px;justify-content:center" onclick="teacherQuickChildForm()">+ Новый ребёнок</button></div>';
    return html.replace(marker,replacement);
  };

  window.confirmTeacherCreatedChild=function(childId){
    const child=byId(state.children,childId);
    if(!child) return;
    child.needsDirectorReview=false;
    child.reviewedByDirector=true;
    child.reviewedAt=new Date().toISOString();
    render();
  };

  function pendingTeacherChildren(){
    return (state.children||[]).filter(function(c){return !!c.needsDirectorReview;});
  }

  // Director dashboard: review queue above the regular dashboard content.
  const dashboardBeforeV110=window.dashboard;
  window.dashboard=function(){
    const base=dashboardBeforeV110();
    const pending=pendingTeacherChildren();
    if(!pending.length) return base;

    const rows=pending.map(function(c){
      const teacher=byId(state.teachers,c.createdByTeacherId);
      const lesson=byId(state.lessons,c.createdFromLessonId);
      const group=lesson?byId(state.groups,lesson.groupId):null;
      return '<div class="kpi-line"><div><b>'+esc(c.name)+'</b><div class="muted mini">'+
        (teacher?'Создал: '+esc(teacher.name):'Создан преподавателем')+
        (group?' · '+esc(group.direction)+' · '+esc(group.name):'')+
        '</div><div class="muted mini">'+esc(c.phone||'Телефон не указан')+'</div></div>'+
        '<button class="btn soft" onclick="openChild('+c.id+')">Проверить</button></div>';
    }).join('');

    const block='<div class="card pad director-review-card" style="margin-bottom:16px;border-color:#fedf89;background:#fffdf5">'+
      '<div class="section-title"><div><h2>Новые дети от преподавателей</h2><div class="muted mini">Нужно проверить и дополнить карточки</div></div><span class="badge amber">'+pending.length+'</span></div>'+
      rows+'</div>';

    const headEnd=base.indexOf('</div>')+6;
    return base.slice(0,headEnd)+block+base.slice(headEnd);
  };

  // Child card: visible warning and explicit confirmation.
  const childBeforeV110=window.child;
  window.child=function(){
    let html=childBeforeV110();
    const child=byId(state.children,state.selectedChild);
    if(!child || !child.needsDirectorReview) return html;

    const teacher=byId(state.teachers,child.createdByTeacherId);
    const lesson=byId(state.lessons,child.createdFromLessonId);
    const group=lesson?byId(state.groups,lesson.groupId):null;
    const banner='<div class="notice" style="margin-bottom:16px;background:#fffaeb">'+
      '<div style="display:flex;justify-content:space-between;gap:14px;align-items:center;flex-wrap:wrap">'+
        '<div><b>Преподаватель создал нового ребёнка</b><div class="mini" style="margin-top:4px">'+
          (teacher?esc(teacher.name):'Преподаватель')+
          (group?' · '+esc(group.direction)+' · '+esc(lesson.date):'')+
          '. Проверьте данные, дополните карточку через «Редактировать» и подтвердите.</div></div>'+
        '<button class="btn primary" onclick="confirmTeacherCreatedChild('+child.id+')">Подтвердить ребёнка</button>'+
      '</div></div>';

    const tabsPos=html.indexOf('<div class="tabs">');
    if(tabsPos>=0) html=html.slice(0,tabsPos)+banner+html.slice(tabsPos);
    return html;
  };

  render();
})();

/* ===== Стабилизированный раздел из v121.js ===== */
// iCube CRM v1.1.11 — smart trial visits for all children + optional teacher-created phone.
(function(){
  function hasOwn(obj,key){return Object.prototype.hasOwnProperty.call(obj||{},String(key)) || Object.prototype.hasOwnProperty.call(obj||{},Number(key));}

  function parseRuDate(s){
    const p=String(s||'').split('.').map(Number);
    return new Date(p[2]||0,(p[1]||1)-1,p[0]||1);
  }

  function hasPreviousVisit(childId,currentLesson){
    const currentDate=parseRuDate(currentLesson?.date);
    return (state.lessons||[]).some(function(l){
      if(!l || Number(l.id)===Number(currentLesson?.id) || l.cancelled || !l.done) return false;
      // A visit in the future must not prevent today's first visit from being trial.
      if(parseRuDate(l.date)>currentDate) return false;
      const main=!!(l.attendance&&l.attendance[childId]);
      const extra=(l.extras||[]).some(function(e){return Number(e.childId)===Number(childId);});
      return main||extra;
    });
  }

  function ensureMainTrialDecision(lesson,childId){
    lesson.trialChildren=lesson.trialChildren||{};
    if(!hasOwn(lesson.trialChildren,childId) && !hasPreviousVisit(childId,lesson)){
      lesson.trialChildren[childId]=true;
    }
    return !!lesson.trialChildren[childId];
  }

  function isMainTrial(lesson,childId){
    return !!(lesson?.trialChildren&&lesson.trialChildren[childId]);
  }

  function currentEnrollment(child,preferredDirection){
    return (child?.enrollments||[]).find(function(e){return e.direction===preferredDirection;}) ||
      (child?.enrollments||[])[0] || null;
  }

  function historicalPrice(childId,lesson,group){
    if(Number(lesson?.visitPriceSnapshot?.[childId])>0) return Number(lesson.visitPriceSnapshot[childId]);
    const child=byId(state.children,childId);
    const e=(child?.enrollments||[]).find(function(x){return x.direction===group.direction;});
    if(e) return Number(effectivePrice(e)||0);
    const hist=(child?.enrollmentHistory||[]).filter(function(x){return x.direction===group.direction&&Number(x.price)>0;});
    if(hist.length) return Number(hist[hist.length-1].price);
    return group.direction==='Программирование'?Number(state.settings.codePrice||0):Number(state.settings.robotPrice||0);
  }

  function moneyDelta(childId,rubles,preferredDirection){
    const child=byId(state.children,childId);
    const e=currentEnrollment(child,preferredDirection);
    if(!e) return false;
    const price=Number(effectivePrice(e)||0);
    if(!(price>0)) return false;
    e.balance=Number(e.balance||0)+Number(rubles||0)/price;
    return true;
  }

  function updateSummary(lesson){
    if(!lesson?.summary) return;
    const present=Object.values(lesson.attendance||{}).filter(Boolean).length+(lesson.extras||[]).length;
    const mainTrials=Object.entries(lesson.attendance||{}).filter(function(x){return !!x[1]&&isMainTrial(lesson,x[0]);}).length;
    const extraTrials=(lesson.extras||[]).filter(function(e){return !!e.trial;}).length;
    const missing=Object.entries(lesson.attendance||{}).filter(function(x){return x[1]&&!lesson.photos?.[x[0]];}).length+
      (lesson.extras||[]).filter(function(e){return !lesson.photos?.[e.childId];}).length;
    lesson.summary={present:present,trials:mainTrials+extraTrials,missing:missing};
  }

  // Phone is optional for a child created by a teacher.
  const oldTeacherQuickChildForm=window.teacherQuickChildForm;
  window.teacherQuickChildForm=function(){
    const lesson=byId(state.lessons,state.selectedLesson);
    const group=lesson?byId(state.groups,lesson.groupId):null;
    if(!lesson||!group) return;
    let html='<h3>Новый ребёнок на занятии</h3>';
    html+='<div class="notice">Создайте минимальную карточку. Ребёнок сразу появится в CRM и будет отмечен на этом занятии как <b>ознакомительный</b>. Директор позже дополнит данные.</div>';
    html+='<div class="form-grid" style="margin-top:14px">';
    html+='<div class="field span-2"><label>Фамилия Имя</label><input class="input" id="tqc-name" placeholder="Иванов Иван"></div>';
    html+='<div class="field span-2"><label>Телефон родителя <span class="muted" style="font-weight:400">(необязательно)</span></label><input class="input" id="tqc-phone" placeholder="+7 900 000-00-00"></div>';
    html+='</div>';
    html+='<div class="muted mini" style="margin-top:10px">Направление будет указано автоматически: '+group.direction+'. В основную группу ребёнок пока не зачисляется.</div>';
    html+='<div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn primary" onclick="saveTeacherQuickChildV121()">Создать и отметить</button></div>';
    modal(html);
  };

  window.saveTeacherQuickChildV121=function(){
    const lesson=byId(state.lessons,state.selectedLesson);
    const group=lesson?byId(state.groups,lesson.groupId):null;
    if(!lesson||!group) return;
    const name=document.querySelector('#tqc-name')?.value.trim()||'';
    const phone=document.querySelector('#tqc-phone')?.value.trim()||'';
    if(!name){alert('Укажите фамилию и имя ребёнка.');return;}

    const id=(state.children||[]).length?Math.max.apply(null,state.children.map(function(c){return Number(c.id)||0;}))+1:1;
    const teacherId=(typeof window.currentPrototypeTeacherId==='function'?Number(window.currentPrototypeTeacherId()||0):0) || Number(lesson.teacherId||group.teacherId||0);
    state.children.push({
      id:id,name:name,birth:'',school:'',grade:'',parent:'',phone:phone,status:'Лид',note:'',
      enrollments:[{direction:group.direction,groupId:null,individualPrice:null,balance:0}],
      needsDirectorReview:true,createdByTeacher:true,createdByTeacherId:teacherId||null,
      createdFromLessonId:lesson.id,createdAt:new Date().toISOString()
    });
    lesson.extras=lesson.extras||[];
    lesson.extras.push({childId:id,trial:true,createdByTeacher:true});
    lesson.photos=lesson.photos||{};
    updateSummary(lesson);
    state.modal=null;
    render();
  };

  // Existing child from another group: default to trial only if this is their first actual visit.
  window.addExtra=function(id){
    const lesson=byId(state.lessons,state.selectedLesson);
    const group=lesson?byId(state.groups,lesson.groupId):null;
    const child=byId(state.children,id);
    if(!lesson||!group||!child) return;
    lesson.extras=lesson.extras||[];
    if(lesson.extras.some(function(e){return Number(e.childId)===Number(id);})) return;

    const trial=!hasPreviousVisit(id,lesson);
    const extra={childId:Number(id),trial:trial};
    lesson.extras.push(extra);

    if(lesson.done&&lesson.attendanceApplied&&!trial){
      const price=historicalPrice(id,lesson,group);
      lesson.visitPriceSnapshot=lesson.visitPriceSnapshot||{};
      lesson.visitPriceSnapshot[id]=price;
      moneyDelta(id,-price,group.direction);
    }
    updateSummary(lesson);
    render();
  };

  // Main-group children get an automatic trial checkbox only for their first visit.
  window.studentCheck=function(c,l,extra,e){
    const present=extra?true:!!l.attendance[c.id];
    const photo=!!l.photos[c.id];
    let trial=extra?!!e?.trial:ensureMainTrialDecision(l,c.id);
    const showTrial=extra || trial || !hasPreviousVisit(c.id,l);

    const trialControl=showTrial
      ? '<label class="mini trial-inline" style="display:block;margin-top:5px"><input type="checkbox" '+(trial?'checked':'')+' onchange="toggleVisitTrialV121('+c.id+',this.checked,'+(extra?'true':'false')+')"> Ознакомительное</label>'
      : '';

    const more=l.done
      ? '<button class="btn trial-more" title="Дополнительно" onclick="visitTrialOptionsV121('+c.id+','+(extra?'true':'false')+')">⋯</button>'
      : '';

    return '<div class="student-check">'+
      (extra?'<span>✓</span>':'<input type="checkbox" '+(present?'checked':'')+' onchange="attend('+c.id+',this.checked)">')+
      '<div><b>'+c.name+'</b>'+(extra?'<div class="muted mini">из другой группы</div>':'')+
      (trial?'<span class="badge amber" style="margin-top:4px">Ознакомительное</span>':'')+
      trialControl+'</div>'+
      '<div style="display:flex;gap:6px;align-items:center"><button class="photo '+(photo?'done':'')+'" onclick="togglePhoto('+c.id+')">'+(photo?'Фото ✓':'📷 Фото')+'</button>'+more+'</div>'+
    '</div>';
  };

  function setTrialState(childId,checked,isExtra){
    const lesson=byId(state.lessons,state.selectedLesson);
    const group=lesson?byId(state.groups,lesson.groupId):null;
    if(!lesson||!group) return;

    let old=false;
    if(isExtra){
      const ex=(lesson.extras||[]).find(function(e){return Number(e.childId)===Number(childId);});
      if(!ex) return;
      old=!!ex.trial;
      if(old===!!checked) return;
      ex.trial=!!checked;
    }else{
      lesson.trialChildren=lesson.trialChildren||{};
      old=!!lesson.trialChildren[childId];
      if(old===!!checked && hasOwn(lesson.trialChildren,childId)) return;
      lesson.trialChildren[childId]=!!checked;
    }

    const isPresent=isExtra || !!lesson.attendance?.[childId];
    if(lesson.done&&lesson.attendanceApplied&&isPresent){
      const price=historicalPrice(childId,lesson,group);
      lesson.visitPriceSnapshot=lesson.visitPriceSnapshot||{};
      if(!lesson.visitPriceSnapshot[childId]) lesson.visitPriceSnapshot[childId]=price;
      if(!old&&checked) moneyDelta(childId,price,group.direction); // paid -> trial: refund
      if(old&&!checked) moneyDelta(childId,-price,group.direction); // trial -> paid: charge
    }
    updateSummary(lesson);
  }

  window.toggleVisitTrialV121=function(childId,checked,isExtra){
    setTrialState(Number(childId),!!checked,!!isExtra);
    render();
  };

  window.visitTrialOptionsV121=function(childId,isExtra){
    const lesson=byId(state.lessons,state.selectedLesson);
    if(!lesson) return;
    const ex=isExtra?(lesson.extras||[]).find(function(e){return Number(e.childId)===Number(childId);}):null;
    const current=isExtra?!!ex?.trial:isMainTrial(lesson,childId);
    const child=byId(state.children,childId);
    modal('<h3>Тип посещения</h3><div class="info-line"><span>Ребёнок</span><b>'+(child?.name||'—')+'</b></div>'+
      '<div class="notice" style="margin-top:12px">Можно исправить тип посещения даже после завершения занятия. При переключении CRM автоматически вернёт или спишет стоимость конкретного занятия. На зарплату преподавателя это не влияет: присутствующий ребёнок учитывается как обычно.</div>'+
      '<div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn primary" onclick="forceVisitTrialV121('+childId+','+(!current)+','+(isExtra?'true':'false')+')">'+(current?'Сделать обычным':'Сделать ознакомительным')+'</button></div>');
  };

  window.forceVisitTrialV121=function(childId,checked,isExtra){
    setTrialState(Number(childId),!!checked,!!isExtra);
    state.modal=null;
    render();
  };

  // Retroactive attendance in an already completed lesson respects automatic trial status.
  window.attend=function(id,value){
    const lesson=byId(state.lessons,state.selectedLesson);
    const group=lesson?byId(state.groups,lesson.groupId):null;
    if(!lesson||!group) return;
    lesson.attendance=lesson.attendance||{};
    const old=!!lesson.attendance[id];
    if(old===!!value){render();return;}

    if(value) ensureMainTrialDecision(lesson,id);
    const trial=isMainTrial(lesson,id);

    if(lesson.done&&lesson.attendanceApplied&&!trial){
      const price=historicalPrice(id,lesson,group);
      lesson.visitPriceSnapshot=lesson.visitPriceSnapshot||{};
      if(value){
        lesson.visitPriceSnapshot[id]=price;
        moneyDelta(id,-price,group.direction);
      }else{
        moneyDelta(id,price,group.direction);
      }
    }
    lesson.attendance[id]=!!value;
    updateSummary(lesson);
    render();
  };

  // Prevent main-group trial children from being charged when finishing a lesson.
  const confirmFinishBeforeV121=window.confirmFinish;
  window.confirmFinish=function(){
    const lesson=byId(state.lessons,state.selectedLesson);
    if(!lesson || lesson.attendanceApplied) return confirmFinishBeforeV121();

    lesson.trialChildren=lesson.trialChildren||{};
    Object.entries(lesson.attendance||{}).filter(function(x){return !!x[1];}).forEach(function(x){
      ensureMainTrialDecision(lesson,Number(x[0]));
    });

    const hidden=[];
    Object.entries(lesson.attendance||{}).forEach(function(x){
      const id=Number(x[0]);
      if(x[1]&&isMainTrial(lesson,id)){
        hidden.push(id);
        lesson.attendance[id]=false;
      }
    });

    const result=confirmFinishBeforeV121();

    hidden.forEach(function(id){lesson.attendance[id]=true;});
    updateSummary(lesson);
    render();
    return result;
  };

  // Deleting a trial visit must not restore money because nothing was charged.
  window.deleteVisitPrompt=function(childId,lessonId){
    const child=byId(state.children,childId);
    const lesson=byId(state.lessons,lessonId);
    const group=lesson?byId(state.groups,lesson.groupId):null;
    if(!child||!lesson||!group) return;
    const extra=(lesson.extras||[]).find(function(e){return Number(e.childId)===Number(childId);});
    const trial=extra?!!extra.trial:isMainTrial(lesson,childId);
    const charged=!!lesson.attendanceApplied&&!trial;
    const price=charged?historicalPrice(childId,lesson,group):0;
    let note='Посещение '+lesson.date+' · '+group.direction+' будет удалено.';
    if(trial) note+=' Оно ознакомительное, поэтому баланс не изменится.';
    else if(charged) note+=' За него было списано <b>'+money(price)+'</b>; эта сумма вернётся в текущий денежный остаток ребёнка.';
    else note+=' Списание ещё не применялось, поэтому баланс не изменится.';
    modal('<h3>Удалить посещение?</h3><div class="notice">'+note+'</div><div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn danger" onclick="confirmDeleteVisitV121('+childId+','+lessonId+')">Удалить посещение</button></div>');
  };

  window.confirmDeleteVisitV121=function(childId,lessonId){
    const lesson=byId(state.lessons,lessonId);
    const group=lesson?byId(state.groups,lesson.groupId):null;
    if(!lesson||!group) return;
    const extra=(lesson.extras||[]).find(function(e){return Number(e.childId)===Number(childId);});
    const trial=extra?!!extra.trial:isMainTrial(lesson,childId);
    if(lesson.attendanceApplied&&!trial){
      const price=historicalPrice(childId,lesson,group);
      if(price>0) moneyDelta(childId,price,group.direction);
    }
    if(extra) lesson.extras=(lesson.extras||[]).filter(function(e){return Number(e.childId)!==Number(childId);});
    else if(lesson.attendance) lesson.attendance[childId]=false;
    if(lesson.photos) delete lesson.photos[childId];
    updateSummary(lesson);
    state.modal=null;state.childTab='visits';state.page='child';render();
  };

  // Show trial status in the child's visit history without rebuilding the whole child screen.
  const childBeforeV121=window.child;
  window.child=function(){
    let html=childBeforeV121();
    const child=byId(state.children,state.selectedChild);
    if(!child) return html;
    (state.lessons||[]).forEach(function(l){
      if(!l.done||l.cancelled) return;
      const ex=(l.extras||[]).find(function(e){return Number(e.childId)===Number(child.id);});
      const present=!!l.attendance?.[child.id]||!!ex;
      const trial=ex?!!ex.trial:isMainTrial(l,child.id);
      if(!present||!trial) return;
      // Existing extra rows already carry this badge; this adds it to main-group trial rows.
      if(!ex){
        const g=byId(state.groups,l.groupId);
        if(!g) return;
        const needle='<div><span class="badge green">Был</span></div><div></div>';
        const replacement='<div><span class="badge green">Был</span></div><div><span class="badge amber">Ознакомительное</span></div>';
        html=html.replace(needle,replacement);
      }
    });
    return html;
  };

  render();
})();

/* ===== Стабилизированный раздел из v122.js ===== */
// iCube CRM v1.1.12 — trial label in child overview + empty-trip salary independent of completed lesson.
(function(){
  function isTrialVisit(lesson,childId){
    const extra=(lesson?.extras||[]).find(function(e){return Number(e.childId)===Number(childId);});
    if(extra) return !!extra.trial;
    return !!(lesson?.trialChildren && lesson.trialChildren[childId]);
  }

  // In the child's Overview history, show "Ознакомительное" instead of generic "Был".
  const childBeforeV122=window.child;
  window.child=function(){
    let html=childBeforeV122();
    const child=byId(state.children,state.selectedChild);
    if(!child || state.childTab!=='overview') return html;

    const visits=[];
    (state.lessons||[]).forEach(function(l){
      if(l.cancelled && !l.emptyTrip) return;
      const main=!!(l.attendance&&l.attendance[child.id]);
      const extra=(l.extras||[]).some(function(e){return Number(e.childId)===Number(child.id);});
      if(!main&&!extra) return;
      const g=byId(state.groups,l.groupId);
      if(!g) return;
      visits.push({lesson:l,group:g});
    });
    visits.sort(function(a,b){
      const pa=String(a.lesson.date||'').split('.').reverse().join('');
      const pb=String(b.lesson.date||'').split('.').reverse().join('');
      return pb.localeCompare(pa);
    });

    visits.slice(0,3).forEach(function(x){
      if(!isTrialVisit(x.lesson,child.id)) return;
      const marker='<b>'+x.lesson.date+' · '+x.group.direction+'</b>';
      const pos=html.indexOf(marker);
      if(pos<0) return;
      const badgePos=html.indexOf('<span class="badge green">Был</span>',pos);
      if(badgePos<0) return;
      const nextRow=html.indexOf('<div class="kpi-line clickable"',pos+marker.length);
      if(nextRow>=0 && badgePos>nextRow) return;
      html=html.slice(0,badgePos)+
        '<span class="badge amber">Ознакомительное</span>'+
        html.slice(badgePos+'<span class="badge green">Был</span>'.length);
    });
    return html;
  };

  function salaryRatesSnapshotV122(){
    return {
      fix:Number(state.settings.salaryFix||0),
      child:Number(state.settings.salaryChild||0),
      intro:Number(state.settings.salaryIntro||0),
      empty:Number(state.settings.salaryEmpty||0)
    };
  }

  function ensureSalarySnapshotV122(lesson){
    if(!lesson.salarySnapshot) lesson.salarySnapshot=salaryRatesSnapshotV122();
    return lesson.salarySnapshot;
  }

  function salaryPresentCountV122(lesson){
    return Object.values(lesson.attendance||{}).filter(Boolean).length+(lesson.extras||[]).length;
  }

  // Empty trip is paid even when the lesson was cancelled / never conducted.
  window.salaryCalculation=function(lesson){
    const rates=ensureSalarySnapshotV122(lesson);
    const children=salaryPresentCountV122(lesson);

    if(lesson.emptyTrip){
      return {
        type:'Пустой выезд',
        children:0,
        fixed:rates.empty,
        childrenPay:0,
        total:rates.empty,
        rates:rates
      };
    }

    if(lesson.cancelled || !lesson.done){
      return {type:'Не начисляется',children:children,fixed:0,childrenPay:0,total:0,rates:rates};
    }

    if(lesson.intro){
      return {
        type:'Ознакомительное занятие',
        children:children,
        fixed:rates.intro,
        childrenPay:0,
        total:rates.intro,
        rates:rates
      };
    }

    const childrenPay=children*rates.child;
    return {
      type:'Обычное занятие',
      children:children,
      fixed:rates.fix,
      childrenPay:childrenPay,
      total:rates.fix+childrenPay,
      rates:rates
    };
  };

  function parseSalaryDateV122(ru){
    const p=String(ru).split('.').map(Number);
    return new Date(p[2],p[1]-1,p[0]);
  }
  function isoToDateV122(iso){
    const p=String(iso).split('-').map(Number);
    return new Date(p[0],p[1]-1,p[2]);
  }

  function salaryRowsV122(){
    const teacherId=Number(state.salaryTeacher);
    const from=isoToDateV122(state.salaryDateFrom);
    const to=isoToDateV122(state.salaryDateTo);
    to.setHours(23,59,59,999);

    return (state.lessons||[])
      .filter(function(l){
        // Normal salary rows need done; empty trip does not.
        if(!l.emptyTrip && (!l.done || l.cancelled)) return false;
        if(Number(l.teacherId)!==teacherId) return false;
        const d=parseSalaryDateV122(l.date);
        return d>=from && d<=to;
      })
      .map(function(l){
        return {lesson:l,group:byId(state.groups,l.groupId),calc:salaryCalculation(l)};
      })
      .sort(function(a,b){
        return parseSalaryDateV122(a.lesson.date)-parseSalaryDateV122(b.lesson.date) ||
          String(a.lesson.time).localeCompare(String(b.lesson.time));
      });
  }

  window.salary=function(){
    const rows=salaryRowsV122();
    const total=rows.reduce(function(sum,x){return sum+x.calc.total;},0);

    let html=pageHead(
      'Зарплата',
      'Расчёт по проведённым занятиям и пустым выездам фактического преподавателя.',
      '<button class="btn">Скачать PDF</button>'
    );

    html+='<div class="toolbar">';
    html+='<select class="select" id="salary-teacher" style="max-width:260px">';
    state.teachers.forEach(function(t){
      html+='<option value="'+t.id+'"'+(String(t.id)===String(state.salaryTeacher)?' selected':'')+'>'+t.name+(t.active===false?' · неактивен':'')+'</option>';
    });
    html+='</select>';
    html+='<input class="input" id="salary-from" type="date" value="'+state.salaryDateFrom+'" style="max-width:180px">';
    html+='<input class="input" id="salary-to" type="date" value="'+state.salaryDateTo+'" style="max-width:180px">';
    html+='<button class="btn primary" onclick="applySalaryFilters()">Применить</button>';
    html+='</div>';

    html+='<div class="card child-ledger-card">';
    html+='<div class="child-ledger-head"><div><h2>Табель</h2><div class="muted mini child-ledger-count">'+rows.length+' начислений</div></div>';
    const teacher=byId(state.teachers,Number(state.salaryTeacher));
    html+='<div style="text-align:right"><div class="muted mini">Преподаватель</div><b>'+(teacher?teacher.name:'—')+'</b></div></div>';

    if(!rows.length){
      html+='<div class="empty">За выбранный период начислений нет.</div>';
    }else{
      html+='<div class="list"><div class="row header salary-row"><div>Дата / группа</div><div>Детей</div><div>Фикс</div><div>За детей</div><div>Итого</div></div>';
      html+=rows.map(function(x){
        const l=x.lesson,g=x.group,c=x.calc;
        const site=g?byId(state.sites,g.siteId):null;
        const typeBadge=c.type==='Пустой выезд'
          ? '<span class="badge amber">Пустой выезд</span>'
          : c.type==='Ознакомительное занятие'
          ? '<span class="badge purple">Ознакомительное</span>'
          : '';
        return '<div class="row salary-row">'+
          '<div><b>'+l.date+' · '+(g?g.name:'Группа')+'</b><div class="muted mini">'+l.time+(site?' · '+site.name:'')+'</div><div style="margin-top:5px">'+typeBadge+'</div></div>'+
          '<div><b>'+c.children+'</b></div>'+
          '<div>'+money(c.fixed)+'</div>'+
          '<div>'+money(c.childrenPay)+'</div>'+
          '<div class="money"><b>'+money(c.total)+'</b></div>'+
        '</div>';
      }).join('');
      html+='</div>';
    }
    html+='</div>';

    html+='<div class="card pad" style="margin-top:16px;display:flex;justify-content:space-between;align-items:center;gap:16px"><div><b style="font-size:18px">Итого за период</b><div class="muted mini" style="margin-top:3px">Пустой выезд считается отдельным начислением и не требует статуса «Проведено».</div></div><b style="font-size:24px">'+money(total)+'</b></div>';
    html+='<div class="notice" style="margin-top:16px">Обычное занятие: '+money(state.settings.salaryFix)+' + '+money(state.settings.salaryChild)+' × присутствующие. Пустой выезд: '+money(state.settings.salaryEmpty)+'. Отменённое занятие без отметки «Пустой выезд» не оплачивается.</div>';

    return html;
  };

  // Director lesson page: explain empty trip semantics next to existing checkbox.
  const lessonBeforeV122=window.lesson;
  window.lesson=function(){
    let html=lessonBeforeV122();
    const l=byId(state.lessons,state.selectedLesson);
    if(!l) return html;

    const old='<label class="student-check"><input type="checkbox" '+(l.emptyTrip?'checked':'')+' onchange="lToggle(\'emptyTrip\',this.checked)"><span><b>Пустой выезд</b></span></label>';
    const replacement='<label class="student-check"><input type="checkbox" '+(l.emptyTrip?'checked':'')+' onchange="lToggle(\'emptyTrip\',this.checked)"><span><b>Пустой выезд</b><div class="muted mini">Занятие не проводилось, но выезд преподавателя оплачивается отдельно.</div></span></label>';
    html=html.replace(old,replacement);
    return html;
  };

  render();
})();

/* ===== Стабилизированный раздел из v123.js ===== */
// iCube CRM v1.1.13 — group project filter + real partner settlement.
(function(){
  state.groupProjectFilter = state.groupProjectFilter || 'all';
  state.partnerProject = state.partnerProject || '';
  state.partnerDateFrom = state.partnerDateFrom || '2026-08-26';
  state.partnerDateTo = state.partnerDateTo || '2026-09-25';
  state.partnerCash = state.partnerCash || {};

  function parseRuDate(s){
    const p=String(s||'').split('.').map(Number);
    return new Date(p[2]||0,(p[1]||1)-1,p[0]||1);
  }
  function parseIsoDate(s){
    const p=String(s||'').split('-').map(Number);
    return new Date(p[0]||0,(p[1]||1)-1,p[2]||1);
  }
  function inPeriod(ru,fromIso,toIso){
    const d=parseRuDate(ru), from=parseIsoDate(fromIso), to=parseIsoDate(toIso);
    to.setHours(23,59,59,999);
    return d>=from && d<=to;
  }
  function fmtDate(iso){
    const p=String(iso||'').split('-');
    return p.length===3 ? p[2]+'.'+p[1]+'.'+p[0] : iso;
  }
  function operationProject(record){
    if(record?.project) return record.project;
    if(record?.groupId){
      const g=byId(state.groups,record.groupId);
      if(g) return g.project;
    }
    const child=byId(state.children,record?.childId);
    if(!child) return null;

    // For older records without a snapshot, prefer a historical enrollment
    // that was still active on the operation date.
    const opDate=parseRuDate(record.date);
    const history=(child.enrollmentHistory||[]).filter(function(e){
      return e.direction===record.direction && e.groupId!=null && e.endedAt;
    }).sort(function(a,b){return new Date(a.endedAt)-new Date(b.endedAt);});
    const historical=history.find(function(e){return opDate<=new Date(e.endedAt);});
    if(historical){
      const g=byId(state.groups,historical.groupId);
      if(g) return g.project;
    }

    const active=(child.enrollments||[]).find(function(e){return e.direction===record.direction;});
    const g=active?byId(state.groups,active.groupId):null;
    return g?.project || null;
  }
  function operationGroupId(childId,direction){
    const child=byId(state.children,childId);
    const e=(child?.enrollments||[]).find(function(x){return x.direction===direction;});
    return e?.groupId ?? null;
  }

  // Snapshot project/group on new or edited payments, so future moves do not rewrite history.
  const savePaymentBeforeV123=window.savePaymentV116;
  window.savePaymentV116=function(paymentId){
    const childId=Number(document.querySelector('#pf-child')?.value);
    const direction=document.querySelector('#pf-dir')?.value;
    const groupId=operationGroupId(childId,direction);
    const group=byId(state.groups,groupId);
    const beforeIds=new Set((state.payments||[]).map(function(p){return Number(p.id);}));
    const result=savePaymentBeforeV123(paymentId);
    let rec=paymentId?byId(state.payments,paymentId):null;
    if(!rec) rec=(state.payments||[]).slice().reverse().find(function(p){return !beforeIds.has(Number(p.id));});
    if(rec){
      rec.groupId=groupId;
      rec.project=group?.project || rec.project || null;
    }
    return result;
  };

  function snapshotNewestRefund(beforeIds,childId,direction){
    const rec=(state.refunds||[]).slice().reverse().find(function(r){
      return !beforeIds.has(Number(r.id)) && Number(r.childId)===Number(childId) && r.direction===direction;
    });
    if(!rec) return;
    const groupId=operationGroupId(childId,direction);
    const group=byId(state.groups,groupId);
    rec.groupId=groupId;
    rec.project=group?.project || null;
  }

  if(typeof window.saveRefundForChild==='function'){
    const saveRefundChildBeforeV123=window.saveRefundForChild;
    window.saveRefundForChild=function(childId){
      const direction=document.querySelector('#rf-dir')?.value;
      const beforeIds=new Set((state.refunds||[]).map(function(r){return Number(r.id);}));
      const result=saveRefundChildBeforeV123(childId);
      snapshotNewestRefund(beforeIds,childId,direction);
      return result;
    };
  }
  if(typeof window.saveRefund==='function'){
    const saveRefundBeforeV123=window.saveRefund;
    window.saveRefund=function(){
      const childId=Number(document.querySelector('#rf-child')?.value);
      const direction=document.querySelector('#rf-dir')?.value;
      const beforeIds=new Set((state.refunds||[]).map(function(r){return Number(r.id);}));
      const result=saveRefundBeforeV123();
      snapshotNewestRefund(beforeIds,childId,direction);
      return result;
    };
  }

  window.setGroupProjectFilterV123=function(v){
    state.groupProjectFilter=v;
    render();
  };

  window.groups=function(){
    const filtered=(state.groups||[]).filter(function(g){
      return state.groupProjectFilter==='all' || g.project===state.groupProjectFilter;
    });

    let html=pageHead('Группы','Регулярное расписание, площадка, преподаватель, проект и цена','<button class="btn primary" onclick="groupForm(null)">+ Новая группа</button>');
    html+='<div class="toolbar group-project-filter">';
    [['all','Все'],['iCubeRobots','iCubeRobots'],['Зебра','Зебра']].forEach(function(x){
      html+='<button class="btn '+(state.groupProjectFilter===x[0]?'soft':'')+'" onclick="setGroupProjectFilterV123(\''+x[0]+'\')">'+x[1]+'</button>';
    });
    html+='</div>';

    if(!filtered.length) return html+'<div class="card pad"><div class="empty">В этом фильтре групп пока нет.</div></div>';

    html+='<div class="grid cols-3">';
    html+=filtered.map(function(g){
      const kids=groupChildren(g.id);
      const site=byId(state.sites,g.siteId), teacher=byId(state.teachers,g.teacherId);
      const dirClass=g.direction==='Программирование'?'group-direction-program':'group-direction-robot';
      const dirBadge=g.direction==='Программирование'?'purple':'blue';
      return '<div class="card pad clickable group-card '+dirClass+'" onclick="openGroup('+g.id+')">'+
        '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><div style="display:flex;gap:7px;flex-wrap:wrap"><span class="badge '+dirBadge+'">'+g.direction+'</span><span class="badge '+(g.project==='Зебра'?'purple':'gray')+'">'+g.project+'</span></div><span class="badge '+(g.active?'green':'gray')+'">'+(g.active?'Активна':'Неактивна')+'</span></div>'+
        '<h3 style="margin:14px 0 5px">'+g.name+'</h3>'+
        '<div class="info-list" style="margin-top:12px">'+
          '<div class="info-line"><span>Время</span><b>'+(g.startTime||String(g.time||'').split('–')[0])+'–'+(g.endTime||String(g.time||'').split('–')[1]||'')+'</b></div>'+
          '<div class="info-line"><span>Площадка</span><b>'+(site?site.name:'Не выбрана')+'</b></div>'+
          '<div class="info-line"><span>Преподаватель</span><b>'+(teacher?teacher.name:'Не выбран')+'</b></div>'+
          '<div class="info-line"><span>Детей</span><b>'+kids.length+'</b></div>'+
          '<div class="info-line"><span>Цена</span><b>'+(g.price?money(g.price):'Наследуется')+'</b></div>'+
        '</div><div class="group-card-hint">Открыть группу →</div></div>';
    }).join('');
    return html+'</div>';
  };

  function partnerProjects(){
    const projects=Array.from(new Set((state.groups||[]).map(function(g){return g.project;}).filter(function(p){return p&&p!=='iCubeRobots';})));
    return projects.length?projects:['Зебра'];
  }
  function ensurePartnerProject(){
    const projects=partnerProjects();
    if(!projects.includes(state.partnerProject)) state.partnerProject=projects[0];
    return projects;
  }
  function cashKey(project,from,to){return project+'|'+from+'|'+to;}
  function currentCash(){return Number(state.partnerCash[cashKey(state.partnerProject,state.partnerDateFrom,state.partnerDateTo)]||0);}

  function partnerSalary(project,from,to){
    return (state.lessons||[]).filter(function(l){
      const g=byId(state.groups,l.groupId);
      if(!g || g.project!==project || !inPeriod(l.date,from,to)) return false;
      return !!l.emptyTrip || (!!l.done && !l.cancelled);
    }).reduce(function(sum,l){
      return sum + Number((typeof window.salaryCalculation==='function'?window.salaryCalculation(l):{total:0}).total||0);
    },0);
  }

  function partnerCalc(){
    const project=state.partnerProject, from=state.partnerDateFrom, to=state.partnerDateTo;
    const payments=(state.payments||[]).filter(function(p){return inPeriod(p.date,from,to)&&operationProject(p)===project;});
    const refunds=(state.refunds||[]).filter(function(r){return inPeriod(r.date,from,to)&&operationProject(r)===project;});
    const paymentTotal=payments.reduce(function(s,p){return s+Number(p.amount||0);},0);
    const refundTotal=refunds.reduce(function(s,r){return s+Number(r.amount||0);},0);
    const income=paymentTotal-refundTotal;
    const taxRate=Number(state.settings.tax||0);
    const tax=Math.max(0,income)*taxRate/100;
    const salary=partnerSalary(project,from,to);
    const distributable=income-tax-salary;
    const partnerRate=Number(state.settings.partnerShare||0);
    const icubeRate=Number(state.settings.icubeShare||0);
    const partnerShare=distributable*partnerRate/100;
    const icubeShare=distributable*icubeRate/100;
    const cash=currentCash();
    const transfer=partnerShare-cash;
    return {payments:paymentTotal,refunds:refundTotal,income:income,taxRate:taxRate,tax:tax,salary:salary,distributable:distributable,partnerRate:partnerRate,icubeRate:icubeRate,partnerShare:partnerShare,icubeShare:icubeShare,cash:cash,transfer:transfer};
  }

  window.applyPartnerFiltersV123=function(){
    state.partnerProject=document.querySelector('#partner-project')?.value||state.partnerProject;
    state.partnerDateFrom=document.querySelector('#partner-from')?.value||state.partnerDateFrom;
    state.partnerDateTo=document.querySelector('#partner-to')?.value||state.partnerDateTo;
    render();
  };
  window.setPartnerCashV123=function(v){
    state.partnerCash[cashKey(state.partnerProject,state.partnerDateFrom,state.partnerDateTo)]=Number(v||0);
    render();
  };

  window.partner=function(){
    const projects=ensurePartnerProject();
    const c=partnerCalc();

    let html=pageHead('Партнёр','Расчёт по реальным операциям и занятиям партнёрского проекта.');
    html+='<div class="toolbar">';
    html+='<select class="select" id="partner-project" style="max-width:240px">';
    projects.forEach(function(p){html+='<option'+(p===state.partnerProject?' selected':'')+'>'+p+'</option>';});
    html+='</select>';
    html+='<input class="input" id="partner-from" type="date" value="'+state.partnerDateFrom+'" style="max-width:180px">';
    html+='<input class="input" id="partner-to" type="date" value="'+state.partnerDateTo+'" style="max-width:180px">';
    html+='<button class="btn primary" onclick="applyPartnerFiltersV123()">Рассчитать</button>';
    html+='</div>';

    html+='<div class="card pad partner-settlement">';
    html+='<div class="section-title"><div><h2 style="font-size:22px">'+state.partnerProject+'</h2><div class="muted">'+fmtDate(state.partnerDateFrom)+' — '+fmtDate(state.partnerDateTo)+'</div></div><span class="badge purple">Партнёр</span></div>';
    html+='<div class="partner-lines">';
    html+='<div class="partner-line"><span>Оплаты</span><b>'+money(c.payments)+'</b></div>';
    html+='<div class="partner-line"><span>Возвраты</span><b>'+money(c.refunds)+'</b></div>';
    html+='<div class="partner-line"><span>Доход после возвратов</span><b>'+money(c.income)+'</b></div>';
    html+='<div class="partner-line"><span>Налог '+c.taxRate+'%</span><b>− '+money(c.tax)+'</b></div>';
    html+='<div class="partner-line"><span>ЗП преподавателей</span><b>− '+money(c.salary)+'</b></div>';
    html+='<div class="partner-line partner-divider"><span>К разделению</span><b>'+money(c.distributable)+'</b></div>';
    html+='<div class="partner-line"><span>Партнёру '+c.partnerRate+'%</span><b>'+money(c.partnerShare)+'</b></div>';
    html+='<div class="partner-line"><span>iCube '+c.icubeRate+'%</span><b>'+money(c.icubeShare)+'</b></div>';
    html+='</div>';

    html+='<div class="partner-cash-box"><label>Получено партнёром наличными</label><input class="input" type="number" step="1" min="0" value="'+c.cash+'" onchange="setPartnerCashV123(this.value)" placeholder="0"></div>';

    const positive=c.transfer>=0;
    html+='<div class="partner-final '+(positive?'partner-final-pay':'partner-final-return')+'">'+
      '<span>'+(positive?'К переводу партнёру':'Партнёр должен вернуть iCube')+'</span>'+
      '<b>'+money(Math.abs(c.transfer))+'</b>'+
    '</div>';
    html+='</div>';

    html+='<div class="muted mini" style="margin-top:10px">Наличные не прибавляются к выручке повторно: они используются только для финального взаиморасчёта. Налог и доли берутся из настроек.</div>';
    return html;
  };

  render();
})();

/* ===== Стабилизированный раздел из v124.js ===== */
// iCube CRM v1.1.14 — automatic payment ownership + automatic partner cash.
(function(){
  const CASH='Наличные';
  const CASHLESS='Безналичный расчёт';

  function normalizeMethod(method){
    const v=String(method||'').trim();
    if(v==='Наличными партнёру' || v==='Наличными' || v===CASH) return CASH;
    if(v==='На счёт iCube' || v==='На счет iCube' || v==='На счёт iCubeRobots' || v==='На счет iCubeRobots' || v===CASHLESS) return CASHLESS;
    return v || CASHLESS;
  }

  (state.payments||[]).forEach(function(p){ p.method=normalizeMethod(p.method); });

  function enrollmentFor(childId,direction){
    const child=byId(state.children,childId);
    return (child?.enrollments||[]).find(function(e){return e.direction===direction;}) || null;
  }

  function projectForEnrollment(childId,direction){
    const e=enrollmentFor(childId,direction);
    const g=e && e.groupId!=null ? byId(state.groups,e.groupId) : null;
    return g ? {project:g.project||null,groupId:g.id} : {project:null,groupId:null};
  }

  function resolvePendingPayments(childId,direction){
    (state.payments||[]).forEach(function(p){
      if(Number(p.childId)!==Number(childId)) return;
      if(direction && p.direction!==direction) return;
      if(p.project!=null && p.project!=='') return;
      const owner=projectForEnrollment(p.childId,p.direction);
      if(owner.project){
        p.project=owner.project;
        p.groupId=owner.groupId;
      }
    });
  }

  // Payment form: human-friendly method names.
  const paymentFormBeforeV124=window.paymentForm;
  window.paymentForm=function(childId,direction,paymentId){
    paymentFormBeforeV124(childId,direction,paymentId);
    const select=document.querySelector('#pf-method');
    if(!select) return;
    const existing=paymentId?byId(state.payments,paymentId):null;
    const current=normalizeMethod(existing?.method || select.value);
    select.innerHTML=
      '<option value="'+CASHLESS+'"'+(current===CASHLESS?' selected':'')+'>'+CASHLESS+'</option>'+
      '<option value="'+CASH+'"'+(current===CASH?' selected':'')+'>'+CASH+'</option>';
    const label=select.closest('.field')?.querySelector('label');
    if(label) label.textContent='Способ оплаты';
  };

  // Preserve project/group snapshot on historical payment edits.
  // New payments get the current group owner, or remain unresolved while the child has no group.
  const savePaymentBeforeV124=window.savePaymentV116;
  window.savePaymentV116=function(paymentId){
    const existing=paymentId?byId(state.payments,paymentId):null;
    const immutable=existing ? {
      project:(existing.project==null?'__unset__':existing.project),
      groupId:(existing.groupId==null?'__unset__':existing.groupId)
    } : null;
    const childId=Number(document.querySelector('#pf-child')?.value);
    const direction=document.querySelector('#pf-dir')?.value;

    const result=savePaymentBeforeV124(paymentId);

    let rec=existing;
    if(!rec && childId && direction){
      rec=(state.payments||[]).slice().reverse().find(function(p){
        return Number(p.childId)===childId && p.direction===direction;
      });
    }
    if(!rec) return result;

    rec.method=normalizeMethod(rec.method);

    if(immutable && immutable.project!=='__unset__'){
      rec.project=immutable.project;
      rec.groupId=immutable.groupId==='__unset__' ? null : immutable.groupId;
    }else{
      const owner=projectForEnrollment(rec.childId,rec.direction);
      if(owner.project){
        rec.project=owner.project;
        rec.groupId=owner.groupId;
      }else{
        rec.project=null;
        rec.groupId=null;
      }
    }
    render();
    return result;
  };

  // As soon as a child without a group is assigned to one, bind only still-unresolved payments.
  if(typeof window.saveManagedDirection==='function'){
    const saveManagedDirectionBeforeV124=window.saveManagedDirection;
    window.saveManagedDirection=function(childId,oldDirection){
      const newDirection=document.querySelector('#md-dir')?.value || oldDirection;
      const result=saveManagedDirectionBeforeV124(childId,oldDirection);
      resolvePendingPayments(childId,newDirection);
      render();
      return result;
    };
  }

  if(typeof window.saveChild==='function'){
    const saveChildBeforeV124=window.saveChild;
    window.saveChild=function(id){
      const result=saveChildBeforeV124(id);
      const childId=id || state.selectedChild;
      const child=byId(state.children,childId);
      (child?.enrollments||[]).forEach(function(e){resolvePendingPayments(childId,e.direction);});
      render();
      return result;
    };
  }

  function parseRuDate(s){
    const p=String(s||'').split('.').map(Number);
    return new Date(p[2]||0,(p[1]||1)-1,p[0]||1);
  }
  function parseIsoDate(s){
    const p=String(s||'').split('-').map(Number);
    return new Date(p[0]||0,(p[1]||1)-1,p[2]||1);
  }
  function inPeriod(ru,fromIso,toIso){
    const d=parseRuDate(ru),from=parseIsoDate(fromIso),to=parseIsoDate(toIso);
    to.setHours(23,59,59,999);
    return d>=from && d<=to;
  }
  function fmtDate(iso){
    const p=String(iso||'').split('-');
    return p.length===3?p[2]+'.'+p[1]+'.'+p[0]:iso;
  }

  function historicalProject(record){
    if(record?.project) return record.project;
    if(record?.groupId!=null){
      const g=byId(state.groups,record.groupId);
      if(g) return g.project||null;
    }
    const child=byId(state.children,record?.childId);
    if(!child) return null;
    const opDate=parseRuDate(record.date);
    const history=(child.enrollmentHistory||[]).filter(function(e){
      return e.direction===record.direction && e.groupId!=null && e.endedAt;
    }).sort(function(a,b){return new Date(a.endedAt)-new Date(b.endedAt);});
    const historical=history.find(function(e){return opDate<=new Date(e.endedAt);});
    if(historical){
      const g=byId(state.groups,historical.groupId);
      if(g) return g.project||null;
    }
    const owner=projectForEnrollment(record.childId,record.direction);
    return owner.project;
  }

  function partnerProjects(){
    const rows=Array.from(new Set((state.groups||[]).map(function(g){return g.project;}).filter(function(p){return p&&p!=='iCubeRobots';})));
    return rows.length?rows:['Зебра'];
  }
  function ensurePartnerProject(){
    const rows=partnerProjects();
    if(!rows.includes(state.partnerProject)) state.partnerProject=rows[0];
    return rows;
  }
  function partnerSalary(project,from,to){
    return (state.lessons||[]).filter(function(l){
      const g=byId(state.groups,l.groupId);
      if(!g || g.project!==project || !inPeriod(l.date,from,to)) return false;
      return !!l.emptyTrip || (!!l.done && !l.cancelled);
    }).reduce(function(sum,l){
      return sum+Number((typeof window.salaryCalculation==='function'?window.salaryCalculation(l):{total:0}).total||0);
    },0);
  }

  function partnerCalc(){
    const project=state.partnerProject,from=state.partnerDateFrom,to=state.partnerDateTo;
    const payments=(state.payments||[]).filter(function(p){
      return inPeriod(p.date,from,to) && historicalProject(p)===project;
    });
    const refunds=(state.refunds||[]).filter(function(r){
      return inPeriod(r.date,from,to) && historicalProject(r)===project;
    });
    const paymentTotal=payments.reduce(function(s,p){return s+Number(p.amount||0);},0);
    const refundTotal=refunds.reduce(function(s,r){return s+Number(r.amount||0);},0);
    const cash=payments.filter(function(p){return normalizeMethod(p.method)===CASH;})
      .reduce(function(s,p){return s+Number(p.amount||0);},0);
    const income=paymentTotal-refundTotal;
    const taxRate=Number(state.settings.tax||0);
    const tax=Math.max(0,income)*taxRate/100;
    const salary=partnerSalary(project,from,to);
    const distributable=income-tax-salary;
    const partnerRate=Number(state.settings.partnerShare||0);
    const icubeRate=Number(state.settings.icubeShare||0);
    const partnerShare=distributable*partnerRate/100;
    const icubeShare=distributable*icubeRate/100;
    const transfer=partnerShare-cash;
    return {payments:paymentTotal,refunds:refundTotal,income:income,taxRate:taxRate,tax:tax,salary:salary,distributable:distributable,partnerRate:partnerRate,icubeRate:icubeRate,partnerShare:partnerShare,icubeShare:icubeShare,cash:cash,transfer:transfer};
  }

  window.partner=function(){
    const projects=ensurePartnerProject();
    const c=partnerCalc();
    let html=pageHead('Партнёр','Расчёт по реальным операциям и занятиям партнёрского проекта.');
    html+='<div class="toolbar"><select class="select" id="partner-project" style="max-width:240px">';
    projects.forEach(function(p){html+='<option'+(p===state.partnerProject?' selected':'')+'>'+p+'</option>';});
    html+='</select><input class="input" id="partner-from" type="date" value="'+state.partnerDateFrom+'" style="max-width:180px">';
    html+='<input class="input" id="partner-to" type="date" value="'+state.partnerDateTo+'" style="max-width:180px">';
    html+='<button class="btn primary" onclick="applyPartnerFiltersV123()">Рассчитать</button></div>';

    html+='<div class="card pad partner-settlement">';
    html+='<div class="section-title"><div><h2 style="font-size:22px">'+state.partnerProject+'</h2><div class="muted">'+fmtDate(state.partnerDateFrom)+' — '+fmtDate(state.partnerDateTo)+'</div></div><span class="badge purple">Партнёр</span></div>';
    html+='<div class="partner-lines">';
    html+='<div class="partner-line"><span>Оплаты</span><b>'+money(c.payments)+'</b></div>';
    html+='<div class="partner-line"><span>Получено партнёром наличными</span><b>'+money(c.cash)+'</b></div>';
    html+='<div class="partner-line"><span>Возвраты</span><b>'+money(c.refunds)+'</b></div>';
    html+='<div class="partner-line"><span>Доход после возвратов</span><b>'+money(c.income)+'</b></div>';
    html+='<div class="partner-line"><span>Налог '+c.taxRate+'%</span><b>− '+money(c.tax)+'</b></div>';
    html+='<div class="partner-line"><span>ЗП преподавателей</span><b>− '+money(c.salary)+'</b></div>';
    html+='<div class="partner-line partner-divider"><span>К разделению</span><b>'+money(c.distributable)+'</b></div>';
    html+='<div class="partner-line"><span>Партнёру '+c.partnerRate+'%</span><b>'+money(c.partnerShare)+'</b></div>';
    html+='<div class="partner-line"><span>iCube '+c.icubeRate+'%</span><b>'+money(c.icubeShare)+'</b></div>';
    html+='</div>';

    const positive=c.transfer>=0;
    html+='<div class="partner-final '+(positive?'partner-final-pay':'partner-final-return')+'"><span>'+(positive?'К переводу партнёру':'Партнёр должен вернуть iCube')+'</span><b>'+money(Math.abs(c.transfer))+'</b></div>';
    html+='</div>';
    html+='<div class="muted mini" style="margin-top:10px">Наличные определяются автоматически по оплатам детей этого партнёрского проекта. Наличные оплаты детей iCube сюда не попадают. Историческая принадлежность оплаты сохраняется после перевода ребёнка.</div>';
    return html;
  };

  render();
})();

/* ===== Стабилизированный раздел из v125.js ===== */
// iCube CRM v1.1.15 — club effectiveness statistics.
(function(){
  state.statsDateFrom = state.statsDateFrom || '2026-09-01';
  state.statsDateTo = state.statsDateTo || '2026-09-30';
  state.statsProject = state.statsProject || 'all';
  state.statsDirection = state.statsDirection || 'all';
  state.statsMetric = state.statsMetric || 'attendance';

  function esc(s){
    return String(s??'').replace(/[&<>"']/g,function(ch){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
    });
  }
  function ruDate(s){
    const p=String(s||'').split('.').map(Number);
    return new Date(p[2]||0,(p[1]||1)-1,p[0]||1);
  }
  function isoDate(s){
    const p=String(s||'').slice(0,10).split('-').map(Number);
    return new Date(p[0]||0,(p[1]||1)-1,p[2]||1);
  }
  function isoToday(){
    const d=new Date();
    const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
    return y+'-'+m+'-'+day;
  }
  function inRangeDate(d,from,to){
    const a=isoDate(from),b=isoDate(to); b.setHours(23,59,59,999);
    return d>=a && d<=b;
  }
  function pct(n,d){
    return d>0 ? Math.round(n/d*100) : 0;
  }
  function pluralChildren(n){
    const x=Math.abs(Number(n))%100, y=x%10;
    if(x>10&&x<20) return 'детей';
    if(y===1) return 'ребёнок';
    if(y>=2&&y<=4) return 'ребёнка';
    return 'детей';
  }
  function groupMatches(g,project,direction){
    if(!g) return false;
    if(project!=='all' && g.project!==project) return false;
    if(direction!=='all' && g.direction!==direction) return false;
    return true;
  }
  function completedLesson(l){
    return !!l && !!l.done && !l.cancelled;
  }
  function lessonExpectedIds(l){
    return Object.keys(l.attendance||{}).map(Number).filter(function(id){
      const child=byId(state.children,id);
      if(!child || (child.status!=='Активный' && child.status!=='Лид')) return false;
      return !(l.trialChildren && l.trialChildren[id]);
    });
  }
  function lessonCounts(l){
    const ids=lessonExpectedIds(l);
    let present=0;
    ids.forEach(function(id){ if(l.attendance && l.attendance[id]) present++; });
    return {expected:ids.length,present:present,missed:Math.max(0,ids.length-present)};
  }
  function filteredLessons(from,to,project,direction){
    return (state.lessons||[]).filter(function(l){
      if(!completedLesson(l) || !inRangeDate(ruDate(l.date),from,to)) return false;
      return groupMatches(byId(state.groups,l.groupId),project,direction);
    });
  }
  function attendanceSummary(from,to,project,direction){
    return filteredLessons(from,to,project,direction).reduce(function(a,l){
      const c=lessonCounts(l);
      a.expected+=c.expected; a.present+=c.present; a.missed+=c.missed;
      return a;
    },{expected:0,present:0,missed:0});
  }
  function scopeChildIds(project,direction){
    const ids=new Set();
    (state.children||[]).forEach(function(c){
      if(c.status!=='Активный' && c.status!=='Лид') return;
      (c.enrollments||[]).forEach(function(e){
        const g=e.groupId!=null?byId(state.groups,e.groupId):null;
        if(groupMatches(g,project,direction)) ids.add(Number(c.id));
      });
    });
    return ids;
  }
  function firstPermanentVisit(childId,project,direction){
    const rows=[];
    (state.lessons||[]).forEach(function(l){
      if(!completedLesson(l)) return;
      const g=byId(state.groups,l.groupId);
      if(!groupMatches(g,project,direction)) return;
      const main=!!(l.attendance&&l.attendance[childId]);
      const mainTrial=!!(l.trialChildren&&l.trialChildren[childId]);
      const ex=(l.extras||[]).find(function(x){return Number(x.childId)===Number(childId);});
      if((main&&!mainTrial) || (ex&&!ex.trial)) rows.push(l);
    });
    rows.sort(function(a,b){return ruDate(a.date)-ruDate(b.date);});
    return rows[0]||null;
  }
  function newChildren(from,to,project,direction){
    const result=[];
    scopeChildIds(project,direction).forEach(function(id){
      const l=firstPermanentVisit(id,project,direction);
      if(l && inRangeDate(ruDate(l.date),from,to)) result.push(id);
    });
    return result;
  }
  function leftEvents(from,to,project,direction){
    const out=[];
    (state.children||[]).forEach(function(c){
      // Only the CURRENT inactive status matters.
      if(c.status!=='Пауза' && c.status!=='Закончил') return;

      // Primary source: the latest status-change fields saved on the child itself.
      let date=c.statusChangedAt||null;
      let eventProject=c.statusChangedProject||null;
      let eventDirection=c.statusChangedDirection||null;

      // Backward-compatible fallback for children changed before these fields existed.
      if(!date){
        const history=(c.statusHistory||[]).slice().reverse();
        const h=history.find(function(x){
          return x.to===c.status && (x.to==='Пауза' || x.to==='Закончил');
        });
        if(h){
          date=h.date;
          eventProject=h.project||null;
          eventDirection=h.direction||null;
        }
      }
      if(!date) return;

      const d=isoDate(date);
      if(!inRangeDate(d,from,to)) return;
      if(project!=='all' && eventProject!==project) return;
      if(direction!=='all' && eventDirection!==direction) return;

      out.push({
        childId:c.id,
        event:{to:c.status,date:date,project:eventProject,direction:eventDirection}
      });
    });
    return out;
  }

  function leftPercent(from,to,project,direction){
    const left=leftEvents(from,to,project,direction);
    const active=scopeChildIds(project,direction).size;
    const base=active+left.length;
    return {count:left.length,percent:pct(left.length,base)};
  }
  function denominatorForPeople(from,to,project,direction){
    const ids=new Set();
    filteredLessons(from,to,project,direction).forEach(function(l){
      lessonExpectedIds(l).forEach(function(id){ids.add(id);});
    });
    scopeChildIds(project,direction).forEach(function(id){ids.add(id);});
    return ids.size;
  }
  function siteName(g){
    const s=g?byId(state.sites,g.siteId):null;
    return s?s.name:'—';
  }
  function shortGroup(g){
    const d=g.direction==='Робототехника'?'Р':'П';
    const day=String(g.day||'').slice(0,2);
    const time=g.startTime||String(g.time||'').split('–')[0]||'';
    return d+', '+day+', '+siteName(g)+', '+time;
  }
  function groupStats(g,from,to){
    const lessons=(state.lessons||[]).filter(function(l){
      return completedLesson(l) && Number(l.groupId)===Number(g.id) && inRangeDate(ruDate(l.date),from,to);
    });
    let expected=0,present=0,missed=0;
    lessons.forEach(function(l){
      const c=lessonCounts(l); expected+=c.expected; present+=c.present; missed+=c.missed;
    });
    const kids=groupChildren(g.id).length;
    return {
      kids:kids,
      fill:Math.round(kids/8*100),
      attendance:pct(present,expected),
      misses:pct(missed,expected),
      expected:expected
    };
  }
  function monthKey(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');}
  function monthLabel(key){
    const p=key.split('-').map(Number);
    const names=['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
    return names[p[1]-1]+' '+String(p[0]).slice(2);
  }
  function monthsBetween(from,to){
    const a=isoDate(from),b=isoDate(to),out=[];
    let d=new Date(a.getFullYear(),a.getMonth(),1);
    const end=new Date(b.getFullYear(),b.getMonth(),1);
    while(d<=end && out.length<24){
      out.push(monthKey(d)); d=new Date(d.getFullYear(),d.getMonth()+1,1);
    }
    return out;
  }
  function monthBounds(key){
    const p=key.split('-').map(Number);
    const a=new Date(p[0],p[1]-1,1), b=new Date(p[0],p[1],0);
    const fmt=function(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
    return {from:fmt(a),to:fmt(b)};
  }
  function metricValue(metric,from,to,project,direction){
    if(metric==='attendance' || metric==='misses'){
      const a=attendanceSummary(from,to,project,direction);
      return metric==='attendance'?pct(a.present,a.expected):pct(a.missed,a.expected);
    }
    const den=denominatorForPeople(from,to,project,direction);
    if(metric==='new') return pct(newChildren(from,to,project,direction).length,den);
    return leftPercent(from,to,project,direction).percent;
  }
  function chartSvg(points){
    const W=820,H=240,L=46,R=18,T=22,B=42;
    if(!points.length) return '<div class="empty">Нет данных для графика.</div>';
    const innerW=W-L-R, innerH=H-T-B;
    const max=Math.max(100,...points.map(function(p){return p.value;}));
    const x=function(i){return points.length===1?L+innerW/2:L+i*innerW/(points.length-1);};
    const y=function(v){return T+innerH-(v/max)*innerH;};
    let s='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Динамика статистики" style="width:100%;height:auto;display:block">';
    [0,25,50,75,100].forEach(function(v){
      const yy=y(v);
      s+='<line x1="'+L+'" y1="'+yy+'" x2="'+(W-R)+'" y2="'+yy+'" stroke="#e5e7eb" stroke-width="1"/>';
      s+='<text x="'+(L-8)+'" y="'+(yy+4)+'" text-anchor="end" font-size="11" fill="#667085">'+v+'%</text>';
    });
    const path=points.map(function(p,i){return (i?'L':'M')+x(i)+' '+y(p.value);}).join(' ');
    s+='<path d="'+path+'" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>';
    points.forEach(function(p,i){
      s+='<circle cx="'+x(i)+'" cy="'+y(p.value)+'" r="5" fill="white" stroke="currentColor" stroke-width="3"/>';
      s+='<text x="'+x(i)+'" y="'+(y(p.value)-10)+'" text-anchor="middle" font-size="12" font-weight="700" fill="#101828">'+p.value+'%</text>';
      s+='<text x="'+x(i)+'" y="'+(H-14)+'" text-anchor="middle" font-size="11" fill="#667085">'+p.label+'</text>';
    });
    return s+'</svg>';
  }

  window.applyStatsFiltersV125=function(){
    state.statsDateFrom=document.querySelector('#stats-from')?.value||state.statsDateFrom;
    state.statsDateTo=document.querySelector('#stats-to')?.value||state.statsDateTo;
    state.statsProject=document.querySelector('#stats-project')?.value||state.statsProject;
    state.statsDirection=document.querySelector('#stats-direction')?.value||state.statsDirection;
    render();
  };
  window.setStatsMetricV125=function(metric){
    state.statsMetric=metric; render();
  };

  // Status history is recorded directly by the base child save flow in app.js.

  window.stats=function(){
    const from=state.statsDateFrom,to=state.statsDateTo,project=state.statsProject,direction=state.statsDirection;
    const att=attendanceSummary(from,to,project,direction);
    const attendance=pct(att.present,att.expected), misses=pct(att.missed,att.expected);
    const newIds=newChildren(from,to,project,direction);
    const left=leftEvents(from,to,project,direction);
    const peopleDen=denominatorForPeople(from,to,project,direction);
    const leftRate=leftPercent(from,to,project,direction);
    const newPct=pct(newIds.length,peopleDen), leftPct=leftRate.percent;

    let html=pageHead('Статистика','Посещаемость, движение детей, заполненность групп и динамика по реальным данным CRM.');
    html+='<div class="toolbar" style="align-items:end;flex-wrap:wrap">';
    html+='<div class="field" style="min-width:160px"><label>Период: от</label><input class="input" id="stats-from" type="date" value="'+from+'"></div>';
    html+='<div class="field" style="min-width:160px"><label>До</label><input class="input" id="stats-to" type="date" value="'+to+'"></div>';
    html+='<div class="field" style="min-width:190px"><label>Проект</label><select class="select" id="stats-project"><option value="all">Все</option><option value="iCubeRobots"'+(project==='iCubeRobots'?' selected':'')+'>iCubeRobots</option><option value="Зебра"'+(project==='Зебра'?' selected':'')+'>Зебра</option></select></div>';
    html+='<div class="field" style="min-width:210px"><label>Направление</label><select class="select" id="stats-direction"><option value="all">Все</option><option value="Робототехника"'+(direction==='Робототехника'?' selected':'')+'>Робототехника</option><option value="Программирование"'+(direction==='Программирование'?' selected':'')+'>Программирование</option></select></div>';
    html+='<button class="btn primary" onclick="applyStatsFiltersV125()">Применить</button></div>';

    html+='<div class="grid cols-4">';
    html+='<div class="card metric"><div class="label">Посещаемость</div><div class="value">'+attendance+'%</div><div class="sub">'+att.present+' из '+att.expected+' посещений по расписанию</div></div>';
    html+='<div class="card metric"><div class="label">Пропуски</div><div class="value">'+misses+'%</div><div class="sub">'+att.missed+' пропусков</div></div>';
    html+='<div class="card metric"><div class="label">Новые дети</div><div class="value">'+newPct+'%</div><div class="sub">'+newIds.length+' '+pluralChildren(newIds.length)+'</div></div>';
    html+='<div class="card metric"><div class="label">Ушли</div><div class="value">'+leftPct+'%</div><div class="sub">'+left.length+' '+pluralChildren(left.length)+'</div></div>';
    html+='</div>';

    const groups=(state.groups||[]).filter(function(g){return groupMatches(g,project,direction);});
    html+='<div class="card child-ledger-card" style="margin-top:16px"><div class="child-ledger-head"><div><h2>Эффективность групп</h2><div class="muted mini child-ledger-count">Нормальная вместимость — 8 детей</div></div></div>';
    if(!groups.length){
      html+='<div class="empty">По выбранным фильтрам групп нет.</div>';
    }else{
      html+='<div class="list"><div class="row header" style="grid-template-columns:2.2fr .7fr 1fr 1fr 1fr"><div>Группа</div><div>Детей</div><div>Заполненность</div><div>Посещаемость</div><div>Пропуски</div></div>';
      html+=groups.map(function(g){
        const s=groupStats(g,from,to);
        const noData=s.expected===0;
        return '<div class="row" style="grid-template-columns:2.2fr .7fr 1fr 1fr 1fr">'+
          '<div><b>'+esc(shortGroup(g))+'</b><div class="muted mini">'+esc(g.name)+' · '+esc(g.project)+'</div></div>'+
          '<div><b>'+s.kids+'</b></div>'+
          '<div><b>'+s.fill+'%</b></div>'+
          '<div>'+(noData?'—':'<b>'+s.attendance+'%</b>')+'</div>'+
          '<div>'+(noData?'—':s.misses+'%')+'</div>'+
        '</div>';
      }).join('');
      html+='</div>';
    }
    html+='</div>';

    const metricNames={attendance:'Посещаемость',misses:'Пропуски',new:'Новые дети',left:'Ушли'};
    const months=monthsBetween(from,to);
    const points=months.map(function(k){
      const b=monthBounds(k);
      return {label:monthLabel(k),value:metricValue(state.statsMetric,b.from,b.to,project,direction)};
    });
    html+='<div class="card pad" style="margin-top:16px"><div class="section-title"><div><h2>Динамика</h2><div class="muted mini">По месяцам · '+metricNames[state.statsMetric]+'</div></div></div>';
    html+='<div class="tabs" style="margin-bottom:12px">';
    Object.keys(metricNames).forEach(function(k){
      html+='<button class="'+(state.statsMetric===k?'active':'')+'" onclick="setStatsMetricV125(\''+k+'\')">'+metricNames[k]+'</button>';
    });
    html+='</div>';
    html+='<div style="color:#2563eb">'+chartSvg(points)+'</div></div>';

    html+='<div class="muted mini" style="margin-top:10px">В посещаемость и пропуски входят только проведённые занятия и только постоянные ученики по расписанию. Ознакомительные и отменённые занятия не учитываются. «Новые дети» определяются по первому обычному посещению в выбранном проекте/направлении. «Ушли» — это дети, которым в выбранный период присвоили текущий статус «Пауза» или «Закончил». Если ребёнка вернуть в «Лид» или «Активный», он сразу перестаёт считаться ушедшим. Дети на паузе и закончившие не входят в текущую посещаемость, пропуски и заполненность групп.</div>';
    return html;
  };

  render();
})();

/* ===== Стабилизированный раздел из v126.js ===== */
// iCube CRM v1.1.16 — navigable calendar with month/week history.
(function(){
  function pad(n){return String(n).padStart(2,'0');}
  function formatRuDate(d){return pad(d.getDate())+'.'+pad(d.getMonth()+1)+'.'+d.getFullYear();}
  function monthTitle(d){
    const names=['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
    return names[d.getMonth()]+' '+d.getFullYear();
  }
  function weekTitle(start,end){
    const months=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
    if(start.getMonth()===end.getMonth() && start.getFullYear()===end.getFullYear()){
      return 'Неделя '+pad(start.getDate())+'–'+pad(end.getDate())+' '+months[start.getMonth()]+' '+start.getFullYear();
    }
    return 'Неделя '+pad(start.getDate())+' '+months[start.getMonth()]+' — '+pad(end.getDate())+' '+months[end.getMonth()]+' '+end.getFullYear();
  }
  function todayDate(){return new Date(2026,8,10);}
  function ensureState(){
    if(!state.calendarMode) state.calendarMode='month';
    if(!state.calendarProject) state.calendarProject='all';
    if(!state.calendarTeacher) state.calendarTeacher='all';
    if(!state.calendarCursor) state.calendarCursor='2026-09-10';
  }
  function parseCursor(){
    ensureState();
    const p=String(state.calendarCursor).split('-').map(Number);
    return new Date(p[0],(p[1]||1)-1,p[2]||1);
  }
  function saveCursor(d){
    state.calendarCursor=d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
  }
  function currentRange(){
    const cursor=parseCursor();
    if(state.calendarMode==='week'){
      const offset=(cursor.getDay()+6)%7;
      const start=new Date(cursor); start.setDate(cursor.getDate()-offset);
      const end=new Date(start); end.setDate(start.getDate()+6);
      return {start:start,end:end,title:weekTitle(start,end)};
    }
    const start=new Date(cursor.getFullYear(),cursor.getMonth(),1);
    const end=new Date(cursor.getFullYear(),cursor.getMonth()+1,0);
    return {start:start,end:end,title:monthTitle(cursor)};
  }

  window.changeCalendarPeriodV126=function(step){
    const d=parseCursor();
    if(state.calendarMode==='week') d.setDate(d.getDate()+Number(step)*7);
    else d.setMonth(d.getMonth()+Number(step));
    saveCursor(d);
    render();
  };
  window.goCalendarTodayV126=function(){
    saveCursor(todayDate());
    render();
  };
  window.setCalendarModeV12=function(v){
    state.calendarMode=v;
    render();
  };

  window.openUnifiedCalendarEvent=function(key,role){
    const range=currentRange();
    const teacherId=role==='teacher' && typeof currentPrototypeTeacherId==='function' ? currentPrototypeTeacherId() : null;
    let event=(typeof window.sharedCalendarEvents==='function'
      ? window.sharedCalendarEvents(range.start,range.end,teacherId)
      : []).find(function(e){return e.key===key;});

    if(!event){
      const l=(state.lessons||[]).find(function(x){return x.occurrenceKey===key;});
      if(l){
        const g=byId(state.groups,l.groupId);
        event={key:key,groupId:l.groupId,project:g?.project,scheduledDate:l.scheduledDate||l.date,scheduledTime:l.scheduledTime||l.time,date:l.date,time:l.time,lesson:l};
      }
    }
    if(!event) return;

    let lesson=event.lesson;
    if(!lesson && typeof window.materializeEvent==='function') lesson=window.materializeEvent(event);
    if(!lesson) return;

    state.selectedLesson=lesson.id;
    state.page=role==='teacher'?'teacherLesson':'lesson';
    render();
  };

  function statusBadgeHtml(e){
    if(e.cancelled) return '<span class="badge red">Отменено</span>';
    if(e.moved) return '<span class="badge amber">Перенесено</span>';
    if(e.done) return '<span class="badge green">Проведено</span>';
    return '';
  }
  function timeStart(t){return String(t||'').split('–')[0]||'';}

  window.calendar=function(){
    ensureState();
    const range=currentRange();
    const events=(typeof window.sharedCalendarEvents==='function'
      ? window.sharedCalendarEvents(range.start,range.end,null)
      : []).filter(function(e){
        const projectOk=state.calendarProject==='all'||e.project===state.calendarProject;
        const teacherOk=state.calendarTeacher==='all'||Number(state.calendarTeacher)===Number(e.teacherId);
        return projectOk&&teacherOk;
      });

    let html=pageHead('Календарь',range.title+' · история, переносы и отмены занятий');

    html+='<div class="toolbar" style="justify-content:space-between;align-items:center;flex-wrap:wrap">';
    html+='<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">';
    html+='<button class="btn" onclick="changeCalendarPeriodV126(-1)">←</button>';
    html+='<button class="btn" onclick="goCalendarTodayV126()">Сегодня</button>';
    html+='<button class="btn" onclick="changeCalendarPeriodV126(1)">→</button>';
    html+='<b style="min-width:170px;text-align:center">'+range.title+'</b>';
    html+='</div>';

    html+='<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">';
    html+='<button class="btn '+(state.calendarMode==='week'?'soft':'')+'" onclick="setCalendarModeV12(\'week\')">Неделя</button>';
    html+='<button class="btn '+(state.calendarMode==='month'?'soft':'')+'" onclick="setCalendarModeV12(\'month\')">Месяц</button>';
    html+='<select class="select" style="max-width:220px" onchange="setCalendarProjectV12(this.value)">';
    html+='<option value="all"'+(state.calendarProject==='all'?' selected':'')+'>Все проекты</option>';
    html+='<option value="iCubeRobots"'+(state.calendarProject==='iCubeRobots'?' selected':'')+'>iCubeRobots</option>';
    html+='<option value="Зебра"'+(state.calendarProject==='Зебра'?' selected':'')+'>Зебра</option></select>';
    html+='<select class="select" style="max-width:240px" onchange="setCalendarTeacherV12(this.value)">';
    html+='<option value="all"'+(state.calendarTeacher==='all'?' selected':'')+'>Все преподаватели</option>';
    (state.teachers||[]).filter(function(t){return t.active!==false||Number(state.calendarTeacher)===t.id;}).forEach(function(t){
      html+='<option value="'+t.id+'"'+(Number(state.calendarTeacher)===t.id?' selected':'')+'>'+t.name+'</option>';
    });
    html+='</select></div></div>';

    html+='<div class="calendar" style="margin-bottom:8px">';
    ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].forEach(function(x){
      html+='<div class="muted mini" style="padding:0 8px 4px;font-weight:700">'+x+'</div>';
    });
    html+='</div><div class="calendar">';

    const cells=[];
    if(state.calendarMode==='week'){
      for(let i=0;i<7;i++){
        const d=new Date(range.start); d.setDate(range.start.getDate()+i); cells.push(d);
      }
    }else{
      const blanks=(range.start.getDay()+6)%7;
      for(let i=0;i<blanks;i++) cells.push(null);
      for(let d=1;d<=range.end.getDate();d++) cells.push(new Date(range.start.getFullYear(),range.start.getMonth(),d));
    }

    const today=formatRuDate(todayDate());
    cells.forEach(function(d){
      if(!d){html+='<div class="day" style="opacity:.35"></div>';return;}
      const date=formatRuDate(d);
      const dayEvents=events.filter(function(e){return e.date===date;})
        .sort(function(a,b){return timeStart(a.time).localeCompare(timeStart(b.time));});

      html+='<div class="day"'+(state.calendarMode==='week'?' style="min-height:260px"':'')+'>';
      html+='<div class="date">'+pad(d.getDate())+'.'+pad(d.getMonth()+1)+(date===today?' · сегодня':'')+'</div>';

      dayEvents.forEach(function(e){
        const g=byId(state.groups,e.groupId); if(!g) return;
        html+='<div class="event '+(e.project==='Зебра'?'partner':'')+(e.done?' done':'')+(e.cancelled?' event-cancelled':'')+'" onclick="openUnifiedCalendarEvent(\''+e.key+'\',\'director\')">';
        html+='<div style="display:flex;justify-content:space-between;gap:6px"><b>'+timeStart(e.time)+'</b><span class="mini">'+(e.project==='Зебра'?'Зебра':'iCube')+'</span></div>';
        html+='<div>'+g.name+'</div><div style="margin-top:5px">'+statusBadgeHtml(e)+'</div></div>';
      });
      html+='</div>';
    });

    while(cells.length%7!==0 && state.calendarMode==='month'){
      html+='<div class="day" style="opacity:.35"></div>';
      cells.push(null);
    }

    html+='</div>';
    return html;
  };

  render();
})();

/* ===== Стабилизированный раздел из v127.js ===== */
// iCube CRM v1.1.17 — teacher calendar navigation + group date boundaries.
(function(){
  const DAY_NAMES=['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];

  function pad(n){return String(n).padStart(2,'0');}
  function formatRuDate(d){return pad(d.getDate())+'.'+pad(d.getMonth()+1)+'.'+d.getFullYear();}
  function parseRuDate(s){
    const p=String(s||'').split('.').map(Number);
    return new Date(p[2]||0,(p[1]||1)-1,p[0]||1);
  }
  function parseIsoDate(s){
    const p=String(s||'').slice(0,10).split('-').map(Number);
    return new Date(p[0]||0,(p[1]||1)-1,p[2]||1);
  }
  function toIso(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
  function todayDate(){
    const d=new Date();
    return new Date(d.getFullYear(),d.getMonth(),d.getDate());
  }
  function monthTitle(d){
    const names=['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
    return names[d.getMonth()]+' '+d.getFullYear();
  }
  function weekTitle(start,end){
    const m=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
    if(start.getMonth()===end.getMonth()&&start.getFullYear()===end.getFullYear()){
      return 'Неделя '+pad(start.getDate())+'–'+pad(end.getDate())+' '+m[start.getMonth()]+' '+start.getFullYear();
    }
    return 'Неделя '+pad(start.getDate())+' '+m[start.getMonth()]+' — '+pad(end.getDate())+' '+m[end.getMonth()]+' '+end.getFullYear();
  }
  function timeStart(t){return String(t||'').split('–')[0]||'';}
  function occurrenceKey(groupId,date){return Number(groupId)+'|'+date;}
  function isDeleted(key){return (state.deletedOccurrences||[]).includes(key);}
  function currentTeacherId(){
    if(typeof window.currentPrototypeTeacherId==='function') return Number(window.currentPrototypeTeacherId()||0);
    if(state.prototypeTeacherId!=null) return Number(state.prototypeTeacherId);
    const t=(state.teachers||[]).find(function(x){return x.active!==false;}) || state.teachers?.[0];
    return t?Number(t.id):0;
  }

  // Migration for groups created before start/end dates existed.
  (state.groups||[]).forEach(function(g){
    if(!g.startDate){
      const rows=(state.lessons||[]).filter(function(l){return Number(l.groupId)===Number(g.id);})
        .map(function(l){return parseRuDate(l.scheduledDate||l.date);})
        .sort(function(a,b){return a-b;});
      g.startDate=rows.length?toIso(rows[0]):'2026-09-01';
    }
    if(g.active===false && !g.endDate){
      const rows=(state.lessons||[]).filter(function(l){return Number(l.groupId)===Number(g.id);})
        .map(function(l){return parseRuDate(l.date);})
        .sort(function(a,b){return b-a;});
      g.endDate=rows.length?toIso(rows[0]):toIso(todayDate());
    }
  });

  function dateWithinGroup(g,d){
    const start=g.startDate?parseIsoDate(g.startDate):null;
    const end=g.endDate?parseIsoDate(g.endDate):null;
    if(start && d<start) return false;
    if(end && d>end) return false;
    return true;
  }

  // Rebuild shared calendar events so inactive groups remain visible historically
  // up to their end date, while active groups begin only at startDate.
  window.sharedCalendarEvents=function(startDate,endDate,teacherId){
    const events=[];
    const start=new Date(startDate), end=new Date(endDate);

    (state.groups||[]).forEach(function(g){
      for(let d=new Date(start);d<=end;d.setDate(d.getDate()+1)){
        if(!dateWithinGroup(g,d)) continue;
        if(DAY_NAMES[d.getDay()]!==g.day) continue;

        const scheduledDate=formatRuDate(d);
        const key=occurrenceKey(g.id,scheduledDate);
        if(isDeleted(key)) continue;

        const l=(state.lessons||[]).find(function(x){
          return x.occurrenceKey===key ||
            (Number(x.groupId)===Number(g.id) && (x.scheduledDate||x.date)===scheduledDate);
        });
        const effectiveTeacherId=l?Number(l.teacherId):Number(g.teacherId);
        if(teacherId && effectiveTeacherId!==Number(teacherId)) continue;

        if(l){
          if(!l.occurrenceKey) l.occurrenceKey=key;
          if(!l.scheduledDate) l.scheduledDate=scheduledDate;
          if(!l.scheduledTime) l.scheduledTime=g.startTime+'–'+g.endTime;
          if(l.date===scheduledDate){
            events.push({
              key:key,groupId:g.id,project:g.project,teacherId:effectiveTeacherId,
              scheduledDate:scheduledDate,scheduledTime:l.scheduledTime,
              date:l.date,time:l.time,lesson:l,
              cancelled:!!l.cancelled,moved:!!l.moved,done:!!l.done
            });
          }
        }else{
          const scheduledTime=g.startTime+'–'+g.endTime;
          events.push({
            key:key,groupId:g.id,project:g.project,teacherId:effectiveTeacherId,
            scheduledDate:scheduledDate,scheduledTime:scheduledTime,
            date:scheduledDate,time:scheduledTime,lesson:null,
            cancelled:false,moved:false,done:false
          });
        }
      }
    });

    // Moved lessons appear once on their factual date, even if moved outside the normal weekday.
    (state.lessons||[]).forEach(function(l){
      if(!l.moved || l.date===(l.scheduledDate||l.date) || isDeleted(l.occurrenceKey)) return;
      const actual=parseRuDate(l.date);
      if(actual<start||actual>end) return;
      const g=byId(state.groups,l.groupId);
      if(!g) return;
      if(teacherId && Number(l.teacherId)!==Number(teacherId)) return;
      if(!dateWithinGroup(g,actual)) return;
      if(events.some(function(e){return e.lesson&&Number(e.lesson.id)===Number(l.id);})) return;
      events.push({
        key:l.occurrenceKey||occurrenceKey(g.id,l.scheduledDate||l.date),
        groupId:g.id,project:g.project,teacherId:Number(l.teacherId),
        scheduledDate:l.scheduledDate||l.date,scheduledTime:l.scheduledTime||l.time,
        date:l.date,time:l.time,lesson:l,cancelled:!!l.cancelled,moved:true,done:!!l.done
      });
    });

    return events.sort(function(a,b){
      const d=parseRuDate(a.date)-parseRuDate(b.date);
      return d||timeStart(a.time).localeCompare(timeStart(b.time));
    });
  };

  // Add group date fields to the existing, already polished group form.
  const groupFormBeforeV127=window.groupForm;
  window.groupForm=function(id,suppliedDraft){
    groupFormBeforeV127(id,suppliedDraft);
    const g=id?byId(state.groups,id):null;
    const activeSelect=document.querySelector('#gf-active');
    if(!activeSelect) return;

    const activeField=activeSelect.closest('.field');
    const startValue=g?.startDate||'';
    const endValue=g?.endDate||'';

    const startWrap=document.createElement('div');
    startWrap.className='field';
    startWrap.innerHTML='<label>Дата начала группы <span style="color:var(--red)">*</span></label>'+
      '<input class="input" id="gf-start-date" type="date" value="'+startValue+'" required>'+
      '<div class="muted mini" style="margin-top:4px">До этой даты занятия группы в календаре не создаются.</div>';

    const endWrap=document.createElement('div');
    endWrap.className='field';
    endWrap.id='gf-end-date-wrap';
    endWrap.style.display=activeSelect.value==='false'?'block':'none';
    endWrap.innerHTML='<label>Дата окончания группы <span style="color:var(--red)">*</span></label>'+
      '<input class="input" id="gf-end-date" type="date" value="'+endValue+'">'+
      '<div class="muted mini" style="margin-top:4px">После этой даты группа больше не появляется в календаре.</div>';

    activeField.parentNode.insertBefore(startWrap,activeField.nextSibling);
    startWrap.parentNode.insertBefore(endWrap,startWrap.nextSibling);

    activeSelect.onchange=function(){
      const wrap=document.querySelector('#gf-end-date-wrap');
      if(wrap) wrap.style.display=this.value==='false'?'block':'none';
    };
  };

  const saveGroupBeforeV127=window.saveGroupV111;
  window.saveGroupV111=function(id){
    const start=document.querySelector('#gf-start-date')?.value||'';
    const active=document.querySelector('#gf-active')?.value==='true';
    const end=document.querySelector('#gf-end-date')?.value||'';

    if(!start){
      alert('Укажите дату начала группы.');
      return;
    }
    if(!active && !end){
      alert('Для неактивной группы укажите дату окончания.');
      return;
    }
    if(end && parseIsoDate(end)<parseIsoDate(start)){
      alert('Дата окончания не может быть раньше даты начала.');
      return;
    }

    const beforeIds=new Set((state.groups||[]).map(function(g){return Number(g.id);}));
    const result=saveGroupBeforeV127(id);
    let g=id?byId(state.groups,id):null;
    if(!g) g=(state.groups||[]).slice().reverse().find(function(x){return !beforeIds.has(Number(x.id));});
    if(g){
      g.startDate=start;
      g.endDate=active?null:end;
      g.active=active;
    }
    render();
    return result;
  };

  function ensureCalendarState(teacher){
    if(teacher){
      if(!state.teacherCalendarMode) state.teacherCalendarMode='month';
      if(!state.teacherCalendarProject) state.teacherCalendarProject='all';
      if(!state.teacherCalendarCursor) state.teacherCalendarCursor=toIso(todayDate());
    }else{
      if(!state.calendarMode) state.calendarMode='month';
      if(!state.calendarProject) state.calendarProject='all';
      if(!state.calendarTeacher) state.calendarTeacher='all';
      if(!state.calendarCursor) state.calendarCursor=toIso(todayDate());
    }
  }
  function cursorDate(teacher){
    ensureCalendarState(teacher);
    return parseIsoDate(teacher?state.teacherCalendarCursor:state.calendarCursor);
  }
  function saveCalendarCursor(teacher,d){
    if(teacher) state.teacherCalendarCursor=toIso(d);
    else state.calendarCursor=toIso(d);
  }
  function calendarRange(teacher){
    const mode=teacher?state.teacherCalendarMode:state.calendarMode;
    const d=cursorDate(teacher);
    if(mode==='week'){
      const offset=(d.getDay()+6)%7;
      const start=new Date(d);start.setDate(d.getDate()-offset);
      const end=new Date(start);end.setDate(start.getDate()+6);
      return {start:start,end:end,title:weekTitle(start,end)};
    }
    return {
      start:new Date(d.getFullYear(),d.getMonth(),1),
      end:new Date(d.getFullYear(),d.getMonth()+1,0),
      title:monthTitle(d)
    };
  }

  window.changeTeacherCalendarPeriodV127=function(step){
    const d=cursorDate(true);
    if(state.teacherCalendarMode==='week') d.setDate(d.getDate()+Number(step)*7);
    else d.setMonth(d.getMonth()+Number(step));
    saveCalendarCursor(true,d);render();
  };
  window.goTeacherCalendarTodayV127=function(){saveCalendarCursor(true,todayDate());render();};
  window.setTeacherCalendarMode=function(v){state.teacherCalendarMode=v;render();};
  window.setTeacherCalendarProject=function(v){state.teacherCalendarProject=v;render();};

  // Keep director navigation from v126, but add a clearly highlighted today cell.
  const calendarBeforeV127=window.calendar;
  window.calendar=function(){
    let html=calendarBeforeV127();
    const today=formatRuDate(todayDate());
    const dd=pad(todayDate().getDate())+'.'+pad(todayDate().getMonth()+1)+' · сегодня';
    const needle='<div class="day"><div class="date">'+dd+'</div>';
    const repl='<div class="day" style="background:#eff6ff;box-shadow:inset 0 0 0 2px #93c5fd"><div class="date" style="color:#1d4ed8;font-weight:800">'+dd+'</div>';
    html=html.replace(needle,repl);
    return html;
  };

  function teacherCalendarHtml(){
    ensureCalendarState(true);
    const range=calendarRange(true);
    const teacherId=currentTeacherId();
    const events=window.sharedCalendarEvents(range.start,range.end,teacherId).filter(function(e){
      return state.teacherCalendarProject==='all'||e.project===state.teacherCalendarProject;
    });
    const mode=state.teacherCalendarMode;
    const today=formatRuDate(todayDate());

    let html='<h1 style="margin:2px 0 4px">Календарь</h1><div class="muted" style="margin-bottom:18px">'+range.title+'</div>';
    html+='<div class="toolbar" style="justify-content:space-between;align-items:center;flex-wrap:wrap">';
    html+='<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">';
    html+='<button class="btn" onclick="changeTeacherCalendarPeriodV127(-1)">←</button>';
    html+='<button class="btn" onclick="goTeacherCalendarTodayV127()">Сегодня</button>';
    html+='<button class="btn" onclick="changeTeacherCalendarPeriodV127(1)">→</button>';
    html+='<b style="min-width:170px;text-align:center">'+range.title+'</b></div>';
    html+='<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">';
    html+='<button class="btn '+(mode==='week'?'soft':'')+'" onclick="setTeacherCalendarMode(\'week\')">Неделя</button>';
    html+='<button class="btn '+(mode==='month'?'soft':'')+'" onclick="setTeacherCalendarMode(\'month\')">Месяц</button>';
    html+='<select class="select" style="max-width:220px" onchange="setTeacherCalendarProject(this.value)">';
    html+='<option value="all"'+(state.teacherCalendarProject==='all'?' selected':'')+'>Все проекты</option>';
    html+='<option value="iCubeRobots"'+(state.teacherCalendarProject==='iCubeRobots'?' selected':'')+'>iCubeRobots</option>';
    html+='<option value="Зебра"'+(state.teacherCalendarProject==='Зебра'?' selected':'')+'>Зебра</option></select>';
    html+='</div></div>';

    html+='<div class="calendar" style="margin-bottom:8px">';
    ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].forEach(function(x){
      html+='<div class="muted mini" style="padding:0 8px 4px;font-weight:700">'+x+'</div>';
    });
    html+='</div><div class="calendar">';

    const cells=[];
    if(mode==='week'){
      for(let i=0;i<7;i++){const d=new Date(range.start);d.setDate(range.start.getDate()+i);cells.push(d);}
    }else{
      const blanks=(range.start.getDay()+6)%7;
      for(let i=0;i<blanks;i++)cells.push(null);
      for(let d=1;d<=range.end.getDate();d++)cells.push(new Date(range.start.getFullYear(),range.start.getMonth(),d));
    }

    cells.forEach(function(d){
      if(!d){html+='<div class="day" style="opacity:.35"></div>';return;}
      const date=formatRuDate(d);
      const isToday=date===today;
      const dayEvents=events.filter(function(e){return e.date===date;});
      html+='<div class="day" style="'+(mode==='week'?'min-height:260px;':'')+(isToday?'background:#eff6ff;box-shadow:inset 0 0 0 2px #93c5fd;':'')+'">';
      html+='<div class="date" style="'+(isToday?'color:#1d4ed8;font-weight:800;':'')+'">'+pad(d.getDate())+'.'+pad(d.getMonth()+1)+(isToday?' · сегодня':'')+'</div>';
      dayEvents.forEach(function(e){
        const g=byId(state.groups,e.groupId);if(!g)return;
        html+='<div class="event '+(e.project==='Зебра'?'partner':'')+(e.done?' done':'')+(e.cancelled?' event-cancelled':'')+'" onclick="openUnifiedCalendarEvent(\''+e.key+'\',\'teacher\')">';
        html+='<div style="display:flex;justify-content:space-between;gap:6px"><b>'+timeStart(e.time)+'</b><span class="mini">'+(e.project==='Зебра'?'Зебра':'iCube')+'</span></div>';
        html+='<div>'+g.name+'</div>';
        if(e.cancelled) html+='<div style="margin-top:5px"><span class="badge red">Отменено</span></div>';
        else if(e.moved) html+='<div style="margin-top:5px"><span class="badge amber">Перенесено</span></div>';
        else if(e.done) html+='<div style="margin-top:5px"><span class="badge green">Проведено</span></div>';
        html+='</div>';
      });
      html+='</div>';
    });
    while(cells.length%7!==0&&mode==='month'){html+='<div class="day" style="opacity:.35"></div>';cells.push(null);}
    return html+'</div>';
  }

  window.teacherCalendar=teacherCalendarHtml;

  render();
})();

/* ===== Стабилизированный раздел из v128.js ===== */
// iCube CRM v1.1.18 — polished desktop calendars + mobile agenda view.
(function(){
  function pad(n){return String(n).padStart(2,'0');}
  function toIso(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
  function parseIso(s){const p=String(s||'').split('-').map(Number);return new Date(p[0]||0,(p[1]||1)-1,p[2]||1);}
  function formatRu(d){return pad(d.getDate())+'.'+pad(d.getMonth()+1)+'.'+d.getFullYear();}
  function timeStart(t){return String(t||'').split('–')[0]||'';}
  function todayDate(){const d=new Date();return new Date(d.getFullYear(),d.getMonth(),d.getDate());}
  function monthTitle(d){
    const names=['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
    return names[d.getMonth()]+' '+d.getFullYear();
  }
  function longDay(d){
    const days=['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
    const months=['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
    return days[d.getDay()]+', '+d.getDate()+' '+months[d.getMonth()];
  }
  function weekTitle(start,end){
    if(start.getMonth()===end.getMonth() && start.getFullYear()===end.getFullYear()){
      return pad(start.getDate())+'–'+pad(end.getDate())+' '+monthTitle(start).toLowerCase();
    }
    return pad(start.getDate())+'.'+pad(start.getMonth()+1)+' — '+pad(end.getDate())+'.'+pad(end.getMonth()+1)+'.'+end.getFullYear();
  }
  function teacherId(){
    if(state.prototypeTeacherId!=null) return Number(state.prototypeTeacherId);
    const t=(state.teachers||[]).find(function(x){return x.active!==false;}) || (state.teachers||[])[0];
    return t?Number(t.id):null;
  }
  function ensure(teacher){
    const today=toIso(todayDate());
    if(teacher){
      if(!state.teacherCalendarMode) state.teacherCalendarMode='month';
      if(!state.teacherCalendarProject) state.teacherCalendarProject='all';
      if(!state.teacherCalendarCursor) state.teacherCalendarCursor=today;
    }else{
      if(!state.calendarMode) state.calendarMode='month';
      if(!state.calendarProject) state.calendarProject='all';
      if(!state.calendarTeacher) state.calendarTeacher='all';
      if(!state.calendarCursor) state.calendarCursor=today;
    }
  }
  function range(teacher){
    ensure(teacher);
    const mode=teacher?state.teacherCalendarMode:state.calendarMode;
    const cursor=parseIso(teacher?state.teacherCalendarCursor:state.calendarCursor);
    if(mode==='week'){
      const off=(cursor.getDay()+6)%7;
      const start=new Date(cursor);start.setDate(cursor.getDate()-off);
      const end=new Date(start);end.setDate(start.getDate()+6);
      return {start:start,end:end,title:weekTitle(start,end),mode:mode};
    }
    const start=new Date(cursor.getFullYear(),cursor.getMonth(),1);
    const end=new Date(cursor.getFullYear(),cursor.getMonth()+1,0);
    return {start:start,end:end,title:monthTitle(cursor),mode:mode};
  }
  function statusHtml(e){
    if(e.cancelled) return '<span class="badge red">Отменено</span>';
    if(e.moved) return '<span class="badge amber">Перенесено</span>';
    if(e.done) return '<span class="badge green">Проведено</span>';
    return '';
  }
  function eventHtml(e,role){
    const g=byId(state.groups,e.groupId); if(!g) return '';
    return '<div class="event '+(e.project==='Зебра'?'partner':'')+(e.done?' done':'')+(e.cancelled?' event-cancelled':'')+'" onclick="openUnifiedCalendarEvent(\''+e.key+'\',\''+role+'\')">'+
      '<div class="calendar-event-top"><b>'+timeStart(e.time)+'</b><span>'+ (e.project==='Зебра'?'Зебра':'iCube') +'</span></div>'+
      '<div class="calendar-event-name">'+g.name+'</div>'+
      (statusHtml(e)?'<div class="calendar-event-status">'+statusHtml(e)+'</div>':'')+
    '</div>';
  }
  function eventListForDay(events,date){
    return events.filter(function(e){return e.date===date;}).sort(function(a,b){return timeStart(a.time).localeCompare(timeStart(b.time));});
  }
  function desktopGrid(r,events,role){
    const cells=[];
    if(r.mode==='week'){
      for(let i=0;i<7;i++){const d=new Date(r.start);d.setDate(r.start.getDate()+i);cells.push(d);}
    }else{
      const blanks=(r.start.getDay()+6)%7;
      for(let i=0;i<blanks;i++) cells.push(null);
      for(let d=1;d<=r.end.getDate();d++) cells.push(new Date(r.start.getFullYear(),r.start.getMonth(),d));
      while(cells.length%7!==0) cells.push(null);
    }
    const today=formatRu(todayDate());
    let html='<div class="calendar-desktop"><div class="calendar calendar-weekdays">';
    ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].forEach(function(x){html+='<div>'+x+'</div>';});
    html+='</div><div class="calendar calendar-grid">';
    cells.forEach(function(d){
      if(!d){html+='<div class="day calendar-empty"></div>';return;}
      const date=formatRu(d),isToday=date===today;
      const dayEvents=eventListForDay(events,date);
      html+='<div class="day '+(isToday?'calendar-today':'')+' '+(r.mode==='week'?'calendar-week-day':'')+'">';
      html+='<div class="date">'+pad(d.getDate())+'.'+pad(d.getMonth()+1)+(isToday?'<span class="today-label">сегодня</span>':'')+'</div>';
      dayEvents.forEach(function(e){html+=eventHtml(e,role);});
      html+='</div>';
    });
    return html+'</div></div>';
  }
  function mobileAgenda(r,events,role){
    const today=formatRu(todayDate());
    const days=[];
    for(let d=new Date(r.start);d<=r.end;d.setDate(d.getDate()+1)){
      const copy=new Date(d), date=formatRu(copy), dayEvents=eventListForDay(events,date);
      if(r.mode==='week' || dayEvents.length || date===today) days.push({d:copy,date:date,events:dayEvents});
    }
    let html='<div class="calendar-mobile">';
    if(!days.length) return html+'<div class="calendar-mobile-empty">В этом месяце занятий нет.</div></div>';
    days.forEach(function(x){
      const isToday=x.date===today;
      html+='<section class="calendar-agenda-day '+(isToday?'calendar-today':'')+'">';
      html+='<div class="calendar-agenda-date"><b>'+longDay(x.d)+'</b>'+(isToday?'<span>Сегодня</span>':'')+'</div>';
      if(x.events.length){
        x.events.forEach(function(e){html+=eventHtml(e,role);});
      }else{
        html+='<div class="calendar-no-events">Нет занятий</div>';
      }
      html+='</section>';
    });
    return html+'</div>';
  }
  function toolbar(teacher,r){
    const mode=teacher?state.teacherCalendarMode:state.calendarMode;
    const project=teacher?state.teacherCalendarProject:state.calendarProject;
    const prev=teacher?'changeTeacherCalendarPeriodV127(-1)':'changeCalendarPeriodV126(-1)';
    const next=teacher?'changeTeacherCalendarPeriodV127(1)':'changeCalendarPeriodV126(1)';
    const today=teacher?'goTeacherCalendarTodayV127()':'goCalendarTodayV126()';
    const setMode=teacher?'setTeacherCalendarMode':'setCalendarModeV12';
    const setProject=teacher?'setTeacherCalendarProject':'setCalendarProjectV12';

    let html='<div class="calendar-toolbar">';
    html+='<div class="calendar-toolbar-nav"><button class="btn calendar-arrow" onclick="'+prev+'">←</button><button class="btn" onclick="'+today+'">Сегодня</button><button class="btn calendar-arrow" onclick="'+next+'">→</button><div class="calendar-period-title">'+r.title+'</div></div>';
    html+='<div class="calendar-toolbar-filters"><div class="calendar-mode-switch"><button class="btn '+(mode==='week'?'soft':'')+'" onclick="'+setMode+'(\'week\')">Неделя</button><button class="btn '+(mode==='month'?'soft':'')+'" onclick="'+setMode+'(\'month\')">Месяц</button></div>';
    html+='<select class="select" onchange="'+setProject+'(this.value)"><option value="all"'+(project==='all'?' selected':'')+'>Все проекты</option><option value="iCubeRobots"'+(project==='iCubeRobots'?' selected':'')+'>iCubeRobots</option><option value="Зебра"'+(project==='Зебра'?' selected':'')+'>Зебра</option></select>';
    if(!teacher){
      html+='<select class="select" onchange="setCalendarTeacherV12(this.value)"><option value="all"'+(state.calendarTeacher==='all'?' selected':'')+'>Все преподаватели</option>';
      (state.teachers||[]).filter(function(t){return t.active!==false||Number(state.calendarTeacher)===Number(t.id);}).forEach(function(t){
        html+='<option value="'+t.id+'"'+(Number(state.calendarTeacher)===Number(t.id)?' selected':'')+'>'+t.name+'</option>';
      });
      html+='</select>';
    }
    return html+'</div></div>';
  }
  function calendarPage(teacher){
    ensure(teacher);
    const r=range(teacher);
    const tid=teacher?teacherId():null;
    const project=teacher?state.teacherCalendarProject:state.calendarProject;
    const events=(typeof window.sharedCalendarEvents==='function'?window.sharedCalendarEvents(r.start,r.end,tid):[]).filter(function(e){
      const projectOk=project==='all'||e.project===project;
      const teacherOk=teacher||state.calendarTeacher==='all'||Number(state.calendarTeacher)===Number(e.teacherId);
      return projectOk&&teacherOk;
    });
    const role=teacher?'teacher':'director';
    let html=teacher
      ? '<div class="calendar-page-head"><h1>Календарь</h1><div class="muted">'+r.title+'</div></div>'
      : pageHead('Календарь',r.title+' · история, переносы и отмены занятий');
    html+=toolbar(teacher,r);
    html+=desktopGrid(r,events,role);
    html+=mobileAgenda(r,events,role);
    return html;
  }

  window.calendar=function(){return calendarPage(false);};
  window.teacherCalendar=function(){return calendarPage(true);};

  render();
})();

/* ===== Стабилизированный раздел из v129.js ===== */
// iCube CRM v1.1.19 — full mobile director navigation + responsive polish.
(function(){
  state.mobileMenuOpen = !!state.mobileMenuOpen;

  const mobileNavItems=[
    ['dashboard','Главная'],
    ['children','Дети'],
    ['groups','Группы'],
    ['calendar','Календарь'],
    ['payments','Оплаты'],
    ['refunds','Возвраты'],
    ['balances','Балансы / долги'],
    ['teachers','Преподаватели'],
    ['sites','Площадки'],
    ['salary','Зарплата'],
    ['partner','Партнёр'],
    ['stats','Статистика'],
    ['settings','Настройки']
  ];

  window.openMobileMenuV129=function(){state.mobileMenuOpen=true;render();};
  window.closeMobileMenuV129=function(){state.mobileMenuOpen=false;render();};
  window.mobileNavToV129=function(page){
    state.mobileMenuOpen=false;
    state.page=page;
    render();
  };

  function mobileDrawer(){
    if(!state.mobileMenuOpen) return '';
    return '<div class="mobile-drawer-backdrop" onclick="closeMobileMenuV129()">'+
      '<aside class="mobile-drawer" onclick="event.stopPropagation()">'+
        '<div class="mobile-drawer-head"><div class="brand"><div class="brand-mark">iC</div><div>iCube CRM</div></div><button class="mobile-drawer-close" onclick="closeMobileMenuV129()">×</button></div>'+
        '<div class="mobile-drawer-nav">'+
          mobileNavItems.map(function(x,i){
            return (i===7?'<div class="mobile-drawer-section">Управление</div>':'')+
              '<button class="'+(state.page===x[0]?'active':'')+'" onclick="mobileNavToV129(\''+x[0]+'\')">'+x[1]+'</button>';
          }).join('')+
        '</div>'+
      '</aside>'+
    '</div>';
  }

  const shellBeforeV129=window.shell || shell;
  window.shell=function(content,title){
    let html=shellBeforeV129(content,title);
    html=html.replace(
      '<header class="topbar"><div class="crumb">',
      '<header class="topbar"><div class="mobile-top-left"><button class="mobile-menu-button" onclick="openMobileMenuV129()" aria-label="Открыть меню">☰</button><div class="crumb">'
    );
    html=html.replace(
      '</div><div class="top-actions">',
      '</div></div><div class="top-actions">'
    );
    html=html.replace(/<div class="mobile-nav">[\s\S]*?<\/div><\/main><\/div>$/,
      '</main></div>'+mobileDrawer()
    );
    return html;
  };

  // When switching back from teacher to director, always land on the dashboard.
  const renderBeforeV129=window.render || render;
  window.render=function(){
    if(state.role==='director' && !state.page) state.page='dashboard';
    return renderBeforeV129();
  };

  render();
})();

/* ===== Стабилизированный раздел из v130.js ===== */
// iCube CRM v1.1.20 — mobile page classes + modal scroll lock.
(function(){
  let locked=false;
  let lockedScrollY=0;

  function lockBody(){
    if(locked) return;
    lockedScrollY=window.scrollY||window.pageYOffset||0;
    document.body.classList.add('modal-open');
    document.body.style.position='fixed';
    document.body.style.top='-'+lockedScrollY+'px';
    document.body.style.left='0';
    document.body.style.right='0';
    document.body.style.width='100%';
    locked=true;
  }

  function unlockBody(){
    if(!locked) return;
    document.body.classList.remove('modal-open');
    document.body.style.position='';
    document.body.style.top='';
    document.body.style.left='';
    document.body.style.right='';
    document.body.style.width='';
    locked=false;
    window.scrollTo(0,lockedScrollY);
  }

  function cleanMobileArtifacts(){
    document.querySelectorAll('.page-children .muted.mini').forEach(function(el){
      const t=el.textContent.replace(/\s/g,'');
      if(t===''||t==='·') el.style.display='none';
    });
  }

  function syncUi(){
    const hasModal=!!document.querySelector('.modal-backdrop');
    if(hasModal) lockBody(); else unlockBody();
    cleanMobileArtifacts();
  }

  const shellBeforeV130=window.shell||shell;
  window.shell=function(content,title){
    let html=shellBeforeV130(content,title);
    html=html.replace('<div class="content">','<div class="content page-'+String(state.page||'unknown')+'">');
    return html;
  };

  const renderBeforeV130=window.render||render;
  window.render=function(){
    const result=renderBeforeV130();
    requestAnimationFrame(syncUi);
    return result;
  };

  window.addEventListener('resize',syncUi);
  render();
})();

/* ===== Стабилизированный раздел из v131.js ===== */
// iCube CRM v1.1.23 — safer iPhone form interaction.
(function(){
  function isEditable(el){
    return el && (el.matches('input,textarea,select') || el.isContentEditable);
  }

  // Do not intercept pointer/touch events. On iOS Safari that can make the first
  // tap after editing appear to do nothing, especially inside modals.
  document.addEventListener('focusin',function(e){
    if(!isEditable(e.target)) return;
    document.documentElement.style.overflowX='hidden';
    document.body.style.overflowX='hidden';
  });

  document.addEventListener('focusout',function(){
    setTimeout(function(){
      document.documentElement.style.overflowX='';
      if(!document.body.classList.contains('modal-open')) document.body.style.overflowX='';
    },0);
  });
})();

/* ===== Стабилизированный раздел из v132.js ===== */
// iCube CRM v1.1.32 — add a second independent direction to a child.
(function(){
  const ALL_DIRECTIONS=['Робототехника','Программирование'];

  function childById(id){ return byId(state.children,Number(id)); }

  function availableDirections(child){
    const existing=(child?.enrollments||[]).map(function(e){return e.direction;});
    return ALL_DIRECTIONS.filter(function(d){return !existing.includes(d);});
  }

  function basePriceFor(direction,groupId){
    const g=groupId!=null ? byId(state.groups,Number(groupId)) : null;
    if(g && g.price!=null) return Number(g.price);
    return direction==='Программирование' ? Number(state.settings.codePrice||0) : Number(state.settings.robotPrice||0);
  }

  function groupsHtml(direction){
    let html='<option value="">Без группы</option>';
    (state.groups||[]).filter(function(g){
      return g.active!==false && g.direction===direction;
    }).forEach(function(g){
      html+='<option value="'+g.id+'">'+g.name+'</option>';
    });
    return html;
  }

  window.refreshAddDirectionGroupsV132=function(){
    const direction=document.querySelector('#ad-dir')?.value;
    const box=document.querySelector('#ad-group');
    if(!box) return;
    box.innerHTML=groupsHtml(direction);
    refreshAddDirectionPreviewV132();
  };

  window.toggleAddDirectionPriceV132=function(){
    const individual=document.querySelector('#ad-price-mode')?.value==='individual';
    const wrap=document.querySelector('#ad-individual-wrap');
    if(wrap) wrap.style.display=individual?'block':'none';
    refreshAddDirectionPreviewV132();
  };

  window.refreshAddDirectionPreviewV132=function(){
    const box=document.querySelector('#ad-preview');
    if(!box) return;
    const direction=document.querySelector('#ad-dir')?.value;
    const rawGroup=document.querySelector('#ad-group')?.value;
    const groupId=rawGroup ? Number(rawGroup) : null;
    const individual=document.querySelector('#ad-price-mode')?.value==='individual';
    const packagePrice=Number(document.querySelector('#ad-individual-package')?.value||0);
    const lessonPrice=individual ? (packagePrice>0?packagePrice/4:0) : basePriceFor(direction,groupId);
    const group=groupId!=null ? byId(state.groups,groupId) : null;

    box.innerHTML='<div class="info-list">'+
      '<div class="info-line"><span>Направление</span><b>'+direction+'</b></div>'+
      '<div class="info-line"><span>Группа</span><b>'+(group?group.name:'Без группы')+'</b></div>'+
      '<div class="info-line"><span>Цена абонемента</span><b>'+(lessonPrice>0?money(lessonPrice*4):'—')+'</b></div>'+
      '<div class="info-line"><span>Цена занятия</span><b>'+(lessonPrice>0?money(lessonPrice):'—')+'</b></div>'+
      '</div>'+
      '<div class="muted mini" style="margin-top:10px">Новое направление создаётся отдельно: свой баланс, своя группа и своя цена.</div>';
  };

  window.addDirectionFormV132=function(childId){
    const child=childById(childId);
    if(!child) return;
    const dirs=availableDirections(child);
    if(!dirs.length){
      alert('У ребёнка уже добавлены оба направления.');
      return;
    }
    const initial=dirs[0];
    let html='<h3>Добавить направление</h3>';
    html+='<input type="hidden" id="ad-child-id" value="'+child.id+'">';
    html+='<div class="form-grid">';
    html+='<div class="field"><label>Направление</label><select class="select" id="ad-dir" onchange="refreshAddDirectionGroupsV132()">';
    dirs.forEach(function(d){html+='<option>'+d+'</option>';});
    html+='</select></div>';
    html+='<div class="field"><label>Основная группа</label><select class="select" id="ad-group" onchange="refreshAddDirectionPreviewV132()">'+groupsHtml(initial)+'</select></div>';
    html+='<div class="field span-2"><label>Цена</label><select class="select" id="ad-price-mode" onchange="toggleAddDirectionPriceV132()"><option value="standard">Обычная цена направления / группы</option><option value="individual">Индивидуальная цена</option></select><div class="muted mini" style="margin-top:5px">Для второго направления можно сразу задать скидочную индивидуальную цену.</div></div>';
    html+='<div class="field span-2" id="ad-individual-wrap" style="display:none"><label>Индивидуальная цена абонемента за 4 занятия, ₽</label><input class="input" id="ad-individual-package" type="number" min="0" step="1" placeholder="Например, 2500" oninput="refreshAddDirectionPreviewV132()"><div class="muted mini" style="margin-top:5px">CRM разделит эту сумму на 4 и будет считать отдельную стоимость занятия для этого направления.</div></div>';
    html+='</div>';
    html+='<div id="ad-preview" class="card pad" style="margin-top:14px"></div>';
    html+='<div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn primary" onclick="saveAddedDirectionV132()">Добавить направление</button></div>';
    modal(html);
    setTimeout(refreshAddDirectionPreviewV132,0);
  };

  window.saveAddedDirectionV132=function(){
    const childId=Number(document.querySelector('#ad-child-id')?.value);
    const child=childById(childId);
    if(!child) return;
    const direction=document.querySelector('#ad-dir')?.value;
    if(!direction || !ALL_DIRECTIONS.includes(direction)) return;

    if((child.enrollments||[]).some(function(e){return e.direction===direction;})){
      alert('Это направление уже есть у ребёнка.');
      return;
    }

    const rawGroup=document.querySelector('#ad-group')?.value;
    const groupId=rawGroup ? Number(rawGroup) : null;
    const group=groupId!=null ? byId(state.groups,groupId) : null;
    if(group && group.direction!==direction){
      alert('Выбранная группа относится к другому направлению.');
      return;
    }

    const mode=document.querySelector('#ad-price-mode')?.value||'standard';
    const packagePrice=Number(document.querySelector('#ad-individual-package')?.value||0);
    if(mode==='individual' && !(packagePrice>0)){
      alert('Укажите индивидуальную цену абонемента за 4 занятия.');
      return;
    }

    const individualPrice=mode==='individual' ? packagePrice/4 : null;
    child.enrollments=child.enrollments||[];
    child.enrollments.push({
      direction:direction,
      groupId:groupId,
      individualPrice:individualPrice,
      balance:0
    });

    state.modal=null;
    state.childTab='overview';
    state.page='child';
    render();
  };

  // v1.1.7 intentionally removed the old "+ Добавить направление" button.
  // Restore it only while there is another direction available.
  const previousChildV132=window.child;
  window.child=function(){
    let html=previousChildV132();
    const child=childById(state.selectedChild);
    if(!child) return html;
    const dirs=availableDirections(child);
    if(!dirs.length) return html;

    const button='<button class="btn soft add-direction-btn-v132" onclick="addDirectionFormV132('+child.id+')">+ Добавить направление</button>';
    const heading='<h2>Направления</h2>';
    if(html.includes(heading) && !html.includes('add-direction-btn-v132')){
      html=html.replace(heading,heading+button);
    }
    return html;
  };

  render();
})();

/* ===== Стабилизированный раздел из v133.js ===== */
// iCube CRM v1.1.33 — trial visits are tracked separately per direction.
(function(){
  function hasOwn(obj,key){
    return Object.prototype.hasOwnProperty.call(obj||{},String(key)) ||
      Object.prototype.hasOwnProperty.call(obj||{},Number(key));
  }

  function parseRuDate(s){
    const p=String(s||'').split('.').map(Number);
    return new Date(p[2]||0,(p[1]||1)-1,p[0]||1);
  }

  function lessonDirection(lesson){
    const group=lesson?byId(state.groups,lesson.groupId):null;
    return group?.direction||null;
  }

  function hasPreviousVisitInDirection(childId,currentLesson){
    const direction=lessonDirection(currentLesson);
    if(!direction) return false;
    const currentDate=parseRuDate(currentLesson?.date);

    return (state.lessons||[]).some(function(l){
      if(!l || Number(l.id)===Number(currentLesson?.id) || l.cancelled || !l.done) return false;
      if(parseRuDate(l.date)>currentDate) return false;

      const previousGroup=byId(state.groups,l.groupId);
      if(!previousGroup || previousGroup.direction!==direction) return false;

      const main=!!(l.attendance&&l.attendance[childId]);
      const extra=(l.extras||[]).some(function(e){
        return Number(e.childId)===Number(childId) && e.present!==false;
      });
      return main||extra;
    });
  }

  function ensureDirectionTrialDecision(lesson,childId){
    lesson.trialChildren=lesson.trialChildren||{};
    if(!hasOwn(lesson.trialChildren,childId)){
      lesson.trialChildren[childId]=!hasPreviousVisitInDirection(childId,lesson);
    }
    return !!lesson.trialChildren[childId];
  }

  function isMainTrial(lesson,childId){
    return !!(lesson?.trialChildren&&lesson.trialChildren[childId]);
  }

  // Existing child added from another group: first visit is trial only if
  // there was no earlier completed PRESENT visit in THIS direction.
  const addExtraBeforeV133=window.addExtra;
  window.addExtra=function(id){
    const lesson=byId(state.lessons,state.selectedLesson);
    if(!lesson) return addExtraBeforeV133(id);
    const shouldTrial=!hasPreviousVisitInDirection(Number(id),lesson);

    addExtraBeforeV133(id);

    const ex=(lesson.extras||[]).find(function(e){
      return Number(e.childId)===Number(id);
    });
    if(ex && !!ex.trial!==shouldTrial && typeof window.toggleVisitTrialV121==='function'){
      // Public v121 toggle also corrects the balance for already completed lessons.
      window.toggleVisitTrialV121(Number(id),shouldTrial,true);
    }
  };

  // Main-group child: show and preselect trial independently for each direction.
  window.studentCheck=function(c,l,extra,e){
    const present=extra?true:!!l.attendance[c.id];
    const photo=!!l.photos[c.id];
    const trial=extra?!!e?.trial:ensureDirectionTrialDecision(l,c.id);
    const showTrial=extra || trial || !hasPreviousVisitInDirection(c.id,l);

    const trialControl=showTrial
      ? '<label class="mini trial-inline" style="display:block;margin-top:5px"><input type="checkbox" '+(trial?'checked':'')+' onchange="toggleVisitTrialV121('+c.id+',this.checked,'+(extra?'true':'false')+')"> Ознакомительное</label>'
      : '';

    const more=l.done
      ? '<button class="btn trial-more" title="Дополнительно" onclick="visitTrialOptionsV121('+c.id+','+(extra?'true':'false')+')">⋯</button>'
      : '';

    return '<div class="student-check">'+
      (extra?'<span>✓</span>':'<input type="checkbox" '+(present?'checked':'')+' onchange="attend('+c.id+',this.checked)">')+
      '<div><b>'+c.name+'</b>'+(extra?'<div class="muted mini">из другой группы</div>':'')+
      (trial?'<span class="badge amber" style="margin-top:4px">Ознакомительное</span>':'')+
      trialControl+'</div>'+
      '<div style="display:flex;gap:6px;align-items:center"><button class="photo '+(photo?'done':'')+'" onclick="togglePhoto('+c.id+')">'+(photo?'Фото ✓':'📷 Фото')+'</button>'+more+'</div>'+
    '</div>';
  };

  // Seed the direction-specific trial decision before the older attendance logic runs.
  const attendBeforeV133=window.attend;
  window.attend=function(id,value){
    const lesson=byId(state.lessons,state.selectedLesson);
    if(lesson && value) ensureDirectionTrialDecision(lesson,Number(id));
    return attendBeforeV133(id,value);
  };

  // Same protection when finishing a lesson without manually touching every checkbox.
  const confirmFinishBeforeV133=window.confirmFinish;
  window.confirmFinish=function(){
    const lesson=byId(state.lessons,state.selectedLesson);
    if(lesson && !lesson.attendanceApplied){
      Object.entries(lesson.attendance||{}).forEach(function(row){
        if(row[1]) ensureDirectionTrialDecision(lesson,Number(row[0]));
      });
    }
    return confirmFinishBeforeV133();
  };

  render();
})();

/* ===== Стабилизированный раздел из v134.js ===== */
// iCube CRM v1.1.34 — direction colors: robotics blue, programming orange.
(function(){
  const STYLE_ID='crm-direction-colors-v134';

  function directionForGroupId(groupId){
    const g=byId(state.groups,Number(groupId));
    return g?.direction||'';
  }

  function directionForLessonId(lessonId){
    const l=byId(state.lessons,Number(lessonId));
    return l?directionForGroupId(l.groupId):'';
  }

  function directionClass(direction){
    return direction==='Программирование'?'crm-direction-program':direction==='Робототехника'?'crm-direction-robot':'';
  }

  function setDirectionClass(el,direction){
    if(!el) return;
    el.classList.remove('crm-direction-robot','crm-direction-program');
    const cls=directionClass(direction);
    if(cls) el.classList.add(cls);
  }

  function extractId(el,fnName){
    const raw=el.getAttribute('onclick')||'';
    const re=new RegExp(fnName+'\\s*\\(\\s*(\\d+)');
    const m=raw.match(re);
    return m?Number(m[1]):null;
  }

  function groupIdFromUnifiedEvent(el){
    const raw=el.getAttribute('onclick')||'';
    // Current calendars use keys like "12|02.09.2026".
    const m=raw.match(/openUnifiedCalendarEvent\s*\(\s*['\"](\d+)\|/);
    return m?Number(m[1]):null;
  }

  function directionFromCardText(el){
    const text=(el.textContent||'').trim();
    if(text.includes('Программирование')) return 'Программирование';
    if(text.includes('Робототехника')) return 'Робототехника';

    // Calendar cards usually contain the group name rather than the direction name.
    const groups=(state.groups||[]).slice().sort(function(a,b){return String(b.name||'').length-String(a.name||'').length;});
    const g=groups.find(function(x){return x?.name && text.includes(x.name);});
    return g?.direction||'';
  }

  function applyDirectionColors(){
    // Group cards.
    document.querySelectorAll('.group-card').forEach(function(card){
      const id=extractId(card,'openGroup');
      setDirectionClass(card,id!=null?directionForGroupId(id):directionFromCardText(card));
    });

    // Director + teacher calendar events in v128 use openUnifiedCalendarEvent(key, role).
    document.querySelectorAll('.event, [onclick*="openUnifiedCalendarEvent"]').forEach(function(event){
      let direction='';
      const groupId=groupIdFromUnifiedEvent(event);
      if(groupId!=null) direction=directionForGroupId(groupId);
      if(!direction){
        const lessonId=extractId(event,'openLesson');
        if(lessonId!=null) direction=directionForLessonId(lessonId);
      }
      if(!direction) direction=directionFromCardText(event);
      setDirectionClass(event,direction);
    });

    // Older teacher lesson cards, if present.
    document.querySelectorAll('.teacher-card[onclick*="openLesson"]').forEach(function(card){
      const id=extractId(card,'openLesson');
      if(id!=null) setDirectionClass(card,directionForLessonId(id));
    });
  }

  function installStyles(){
    let style=document.getElementById(STYLE_ID);
    if(!style){
      style=document.createElement('style');
      style.id=STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent=`
      /* Unified direction palette: robotics blue, programming orange. */
      .group-card.crm-direction-robot{
        border-top:4px solid #3b82f6!important;
        background:linear-gradient(180deg,#eff6ff 0,#fff 38%)!important;
      }
      .group-card.crm-direction-program{
        border-top:4px solid #f97316!important;
        background:linear-gradient(180deg,#fff7ed 0,#fff 38%)!important;
      }
      .group-card.crm-direction-robot:hover{border-color:#93c5fd!important}
      .group-card.crm-direction-program:hover{border-color:#fdba74!important}

      /* Only the direction badge becomes orange. Partner/project badges keep their own color. */
      .group-card.crm-direction-program .badge.purple:first-child{
        background:#ffedd5!important;
        color:#c2410c!important;
      }

      /* Own iCube lessons: both background and left stripe show direction. */
      .event.crm-direction-robot:not(.partner):not(.event-cancelled),
      [onclick*="openUnifiedCalendarEvent"].crm-direction-robot:not(.partner):not(.event-cancelled){
        background:#eff6ff!important;
        border-left-color:#2563eb!important;
      }
      .event.crm-direction-program:not(.partner):not(.event-cancelled),
      [onclick*="openUnifiedCalendarEvent"].crm-direction-program:not(.partner):not(.event-cancelled){
        background:#fff7ed!important;
        border-left-color:#f97316!important;
      }

      /* Partner lessons stay purple, but the stripe shows the actual direction. */
      .event.partner:not(.event-cancelled),
      [onclick*="openUnifiedCalendarEvent"].partner:not(.event-cancelled){
        background:#f4f3ff!important;
      }
      .event.partner.crm-direction-robot:not(.event-cancelled),
      [onclick*="openUnifiedCalendarEvent"].partner.crm-direction-robot:not(.event-cancelled){
        border-left-color:#2563eb!important;
      }
      .event.partner.crm-direction-program:not(.event-cancelled),
      [onclick*="openUnifiedCalendarEvent"].partner.crm-direction-program:not(.event-cancelled){
        border-left-color:#f97316!important;
      }

      .event.crm-direction-robot:hover{box-shadow:0 5px 14px rgba(37,99,235,.14)!important}
      .event.crm-direction-program:hover{box-shadow:0 5px 14px rgba(249,115,22,.16)!important}
    `;
  }

  installStyles();
  applyDirectionColors();

  const root=document.getElementById('app');
  if(root){
    let queued=false;
    new MutationObserver(function(){
      if(queued) return;
      queued=true;
      requestAnimationFrame(function(){
        queued=false;
        applyDirectionColors();
      });
    }).observe(root,{childList:true,subtree:true});
  }
})();

/* ===== Стабилизированный раздел из v135.js ===== */
// iCube CRM v1.1.35 — sort Groups page by weekday, direction, then time.
(function(){
  const DAY_ORDER={
    'Понедельник':1,'Пн':1,
    'Вторник':2,'Вт':2,
    'Среда':3,'Ср':3,
    'Четверг':4,'Чт':4,
    'Пятница':5,'Пт':5,
    'Суббота':6,'Сб':6,
    'Воскресенье':7,'Вс':7
  };
  const DIR_ORDER={'Робототехника':1,'Программирование':2};

  function timeKey(g){
    const raw=String(g?.startTime || g?.time || '');
    const m=raw.match(/(\d{1,2}):(\d{2})/);
    return m ? Number(m[1])*60+Number(m[2]) : 9999;
  }

  function sortedGroups(list){
    return (list||[]).slice().sort(function(a,b){
      const dayA=DAY_ORDER[a?.day]||99;
      const dayB=DAY_ORDER[b?.day]||99;
      if(dayA!==dayB) return dayA-dayB;

      const dirA=DIR_ORDER[a?.direction]||99;
      const dirB=DIR_ORDER[b?.direction]||99;
      if(dirA!==dirB) return dirA-dirB;

      const timeA=timeKey(a), timeB=timeKey(b);
      if(timeA!==timeB) return timeA-timeB;

      return Number(a?.id||0)-Number(b?.id||0);
    });
  }

  const groupsBeforeV135=window.groups;
  if(typeof groupsBeforeV135==='function'){
    window.groups=function(){
      const original=state.groups;
      state.groups=sortedGroups(original);
      try{
        return groupsBeforeV135();
      }finally{
        state.groups=original;
      }
    };
  }

  window.sortedGroupsForDisplayV135=sortedGroups;
  render();
})();

/* ===== Стабилизированный раздел из v136.js ===== */
// iCube CRM v1.1.36 — compact Groups filters: project + activity.
(function(){
  if(!state.groupProjectFilterV136) state.groupProjectFilterV136='all';
  if(!state.groupStatusFilterV136) state.groupStatusFilterV136='active';

  function projectOptions(){
    const seen=[];
    (state.groups||[]).forEach(function(g){
      const p=String(g.project||'').trim();
      if(p && !seen.includes(p)) seen.push(p);
    });
    return seen;
  }

  window.setGroupProjectFilterV136=function(value){
    state.groupProjectFilterV136=value||'all';
    render();
  };

  window.setGroupStatusFilterV136=function(value){
    state.groupStatusFilterV136=value||'active';
    render();
  };

  window.groups=function(){
    const project=state.groupProjectFilterV136||'all';
    const status=state.groupStatusFilterV136||'active';

    let rows=(state.groups||[]).filter(function(g){
      const projectOk=project==='all'||String(g.project||'')===project;
      const statusOk=status==='all'||(status==='active'?g.active!==false:g.active===false);
      return projectOk&&statusOk;
    });

    if(typeof window.sortedGroupsForDisplayV135==='function') rows=window.sortedGroupsForDisplayV135(rows);

    const projects=projectOptions();
    let html=pageHead(
      'Группы',
      'Регулярное расписание, площадка, преподаватель, проект и цена',
      '<button class="btn primary" onclick="groupForm(null)">+ Новая группа</button>'
    );

    html+='<div class="toolbar group-filters-v136" style="margin-bottom:16px">';
    html+='<select class="select" style="width:auto;min-width:190px" onchange="setGroupProjectFilterV136(this.value)">';
    html+='<option value="all"'+(project==='all'?' selected':'')+'>Все проекты</option>';
    projects.forEach(function(p){
      html+='<option value="'+p.replace(/"/g,'&quot;')+'"'+(project===p?' selected':'')+'>'+p+'</option>';
    });
    html+='</select>';

    html+='<select class="select" style="width:auto;min-width:170px" onchange="setGroupStatusFilterV136(this.value)">';
    html+='<option value="active"'+(status==='active'?' selected':'')+'>Активные</option>';
    html+='<option value="inactive"'+(status==='inactive'?' selected':'')+'>Неактивные</option>';
    html+='<option value="all"'+(status==='all'?' selected':'')+'>Все</option>';
    html+='</select></div>';

    if(!rows.length){
      html+='<div class="card empty">Нет групп по выбранным фильтрам.</div>';
      return html;
    }

    html+='<div class="grid cols-3">';
    html+=rows.map(function(g){
      const kids=groupChildren(g.id);
      const site=byId(state.sites,g.siteId);
      const teacher=byId(state.teachers,g.teacherId);
      const dirBadge=g.direction==='Программирование'?'purple':'blue';
      const projectBadge=g.project==='Зебра'?'purple':'gray';
      return '<div class="card pad clickable group-card" onclick="openGroup('+g.id+')">'+
        '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap">'+
          '<div style="display:flex;gap:8px;flex-wrap:wrap">'+
            '<span class="badge '+dirBadge+'">'+g.direction+'</span>'+
            '<span class="badge '+projectBadge+'">'+(g.project||'—')+'</span>'+
          '</div>'+
          '<span class="badge '+(g.active!==false?'green':'gray')+'">'+(g.active!==false?'Активна':'Неактивна')+'</span>'+
        '</div>'+
        '<h3 style="margin:14px 0 5px">'+g.name+'</h3>'+
        '<div class="info-list" style="margin-top:12px">'+
          '<div class="info-line"><span>Время</span><b>'+(g.startTime||String(g.time||'').split('–')[0]||'—')+'–'+(g.endTime||String(g.time||'').split('–')[1]||'—')+'</b></div>'+
          '<div class="info-line"><span>Площадка</span><b>'+(site?.shortName||site?.name||'—')+'</b></div>'+
          '<div class="info-line"><span>Преподаватель</span><b>'+(teacher?.name||'—')+'</b></div>'+
          '<div class="info-line"><span>Детей</span><b>'+kids.length+'</b></div>'+
          '<div class="info-line"><span>Цена</span><b>'+(g.price?money(g.price):'Наследуется')+'</b></div>'+
        '</div></div>';
    }).join('');
    html+='</div>';
    return html;
  };

  render();
})();

/* ===== Стабилизированный раздел из v137.js ===== */
// iCube CRM v1.1.37 — paid visits may only affect the matching direction.
(function(){
  function esc(s){
    return String(s??'').replace(/[&<>"']/g,function(ch){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
    });
  }

  function context(){
    const lesson=byId(state.lessons,state.selectedLesson);
    const group=lesson?byId(state.groups,lesson.groupId):null;
    return {lesson:lesson,group:group};
  }

  function hasDirection(child,direction){
    return !!(child?.enrollments||[]).some(function(e){return e.direction===direction;});
  }

  function isMainTrial(lesson,childId){
    return !!(lesson?.trialChildren&&lesson.trialChildren[childId]);
  }

  function isExtraTrial(lesson,childId){
    const ex=(lesson?.extras||[]).find(function(e){return Number(e.childId)===Number(childId);});
    return !!ex?.trial;
  }

  function extraPresent(ex){ return !!ex && ex.present!==false; }

  function recalcSummary(lesson){
    if(!lesson?.summary) return;
    const presentMain=Object.entries(lesson.attendance||{}).filter(function(x){return !!x[1];});
    const extras=(lesson.extras||[]).filter(extraPresent);
    const mainTrials=presentMain.filter(function(x){return isMainTrial(lesson,Number(x[0]));}).length;
    const extraTrials=extras.filter(function(e){return !!e.trial;}).length;
    const missingPhotos=presentMain.filter(function(x){return !lesson.photos?.[x[0]];}).length+
      extras.filter(function(e){return !lesson.photos?.[e.childId];}).length;
    lesson.summary={present:presentMain.length+extras.length,trials:mainTrials+extraTrials,missing:missingPhotos};
  }

  function showNoDirectionMessage(child,direction){
    modal('<h3>Нельзя сделать посещение обычным</h3>'+
      '<div class="notice"><b>'+esc(child?.name||'Ребёнок')+'</b>: в карточке нет направления <b>«'+esc(direction)+'»</b>.<br><br>'+
      'Платное посещение можно списывать только с того же направления, что и занятие. Добавьте ребёнку направление «'+esc(direction)+'» или оставьте это посещение ознакомительным.</div>'+
      '<div class="modal-actions"><button class="btn primary" onclick="closeModal()">Понятно</button></div>');
  }

  function missingPaidVisits(lesson){
    const group=lesson?byId(state.groups,lesson.groupId):null;
    if(!lesson||!group) return [];
    const bad=[];

    Object.entries(lesson.attendance||{}).forEach(function(row){
      const childId=Number(row[0]);
      if(!row[1]||isMainTrial(lesson,childId)) return;
      const child=byId(state.children,childId);
      if(child&&!hasDirection(child,group.direction)) bad.push({child:child,isExtra:false});
    });

    (lesson.extras||[]).forEach(function(ex){
      if(!extraPresent(ex) || ex.trial) return;
      const child=byId(state.children,ex.childId);
      if(child&&!hasDirection(child,group.direction)) bad.push({child:child,isExtra:true});
    });
    return bad;
  }

  // The older v121 helper had a fallback to the child's first enrollment.
  // Guard every public route that can turn a visit into a paid one.
  const toggleBeforeV137=window.toggleVisitTrialV121;
  if(typeof toggleBeforeV137==='function'){
    window.toggleVisitTrialV121=function(childId,checked,isExtra){
      const ctx=context();
      const child=byId(state.children,Number(childId));
      if(ctx.group&&child&&!checked&&!hasDirection(child,ctx.group.direction)){
        showNoDirectionMessage(child,ctx.group.direction);
        return;
      }
      return toggleBeforeV137(Number(childId),!!checked,!!isExtra);
    };
  }

  const forceBeforeV137=window.forceVisitTrialV121;
  if(typeof forceBeforeV137==='function'){
    window.forceVisitTrialV121=function(childId,checked,isExtra){
      const ctx=context();
      const child=byId(state.children,Number(childId));
      if(ctx.group&&child&&!checked&&!hasDirection(child,ctx.group.direction)){
        showNoDirectionMessage(child,ctx.group.direction);
        return;
      }
      return forceBeforeV137(Number(childId),!!checked,!!isExtra);
    };
  }

  // An existing child added to another direction without that enrollment is always trial.
  // This also avoids the old post-completion balance fallback.
  const addExtraBeforeV137=window.addExtra;
  if(typeof addExtraBeforeV137==='function'){
    window.addExtra=function(id){
      const ctx=context();
      const child=byId(state.children,Number(id));
      if(ctx.lesson&&ctx.group&&child&&!hasDirection(child,ctx.group.direction)&&ctx.lesson.done){
        ctx.lesson.extras=ctx.lesson.extras||[];
        if(!ctx.lesson.extras.some(function(e){return Number(e.childId)===Number(id);})){
          ctx.lesson.extras.push({childId:Number(id),trial:true,present:true});
        }
        recalcSummary(ctx.lesson);
        render();
        return;
      }

      const result=addExtraBeforeV137(Number(id));
      if(ctx.lesson&&ctx.group&&child&&!hasDirection(child,ctx.group.direction)){
        const ex=(ctx.lesson.extras||[]).find(function(e){return Number(e.childId)===Number(id);});
        if(ex) ex.trial=true;
        recalcSummary(ctx.lesson);
        render();
      }
      return result;
    };
  }

  // Retroactive attendance edits must never credit/debit another direction either.
  const attendBeforeV137=window.attend;
  if(typeof attendBeforeV137==='function'){
    window.attend=function(id,value){
      const ctx=context();
      const child=byId(state.children,Number(id));
      if(ctx.lesson&&ctx.group&&child&&!hasDirection(child,ctx.group.direction)){
        ctx.lesson.trialChildren=ctx.lesson.trialChildren||{};
        ctx.lesson.trialChildren[id]=true;
      }
      return attendBeforeV137(Number(id),!!value);
    };
  }

  // Final safety check before applying balances.
  const confirmFinishBeforeV137=window.confirmFinish;
  if(typeof confirmFinishBeforeV137==='function'){
    window.confirmFinish=function(){
      const lesson=byId(state.lessons,state.selectedLesson);
      if(lesson&&!lesson.attendanceApplied){
        const bad=missingPaidVisits(lesson);
        if(bad.length){
          const group=byId(state.groups,lesson.groupId);
          const names=bad.map(function(x){return '<b>'+esc(x.child.name)+'</b>';}).join(', ');
          modal('<h3>Не хватает направления</h3>'+
            '<div class="notice">'+names+' '+(bad.length===1?'отмечен':'отмечены')+' как обычное посещение, но в карточке нет направления <b>«'+esc(group?.direction||'')+'»</b>.<br><br>'+
            'Баланс другого направления списан не будет. Добавьте нужное направление или сделайте это посещение ознакомительным.</div>'+
            '<div class="modal-actions"><button class="btn" onclick="closeModal()">Вернуться</button><button class="btn primary" onclick="markMissingDirectionVisitsTrialV137()">Сделать ознакомительными</button></div>');
          return;
        }
      }
      return confirmFinishBeforeV137();
    };
  }

  window.markMissingDirectionVisitsTrialV137=function(){
    const lesson=byId(state.lessons,state.selectedLesson);
    if(!lesson) return;
    const bad=missingPaidVisits(lesson);
    bad.forEach(function(x){
      if(x.isExtra){
        const ex=(lesson.extras||[]).find(function(e){return Number(e.childId)===Number(x.child.id);});
        if(ex) ex.trial=true;
      }else{
        lesson.trialChildren=lesson.trialChildren||{};
        lesson.trialChildren[x.child.id]=true;
      }
    });
    recalcSummary(lesson);
    state.modal=null;
    render();
  };

  // Director warning is only for an actually PRESENT, non-trial (= paid) visit.
  // No direction + introductory visit is a valid scenario and must not create a warning.
  function directionIssues(){
    const map=new Map();
    (state.lessons||[]).forEach(function(lesson){
      if(!lesson||lesson.cancelled||!lesson.done) return;
      const group=byId(state.groups,lesson.groupId);
      if(!group) return;
      const ids=[];
      Object.entries(lesson.attendance||{}).forEach(function(row){
        const childId=Number(row[0]);
        if(row[1] && !isMainTrial(lesson,childId)) ids.push(childId);
      });
      (lesson.extras||[]).forEach(function(ex){
        if(extraPresent(ex) && !ex.trial) ids.push(Number(ex.childId));
      });
      ids.forEach(function(childId){
        const child=byId(state.children,childId);
        if(!child||hasDirection(child,group.direction)) return;
        const key=childId+'|'+group.direction;
        const old=map.get(key);
        if(!old || String(lesson.date||'')>String(old.lesson.date||'')) map.set(key,{child:child,group:group,lesson:lesson});
      });
    });
    return Array.from(map.values());
  }

  // Director dashboard: same idea as the existing teacher-created-child review queue.
  const dashboardBeforeV137=window.dashboard||dashboard;
  window.dashboard=function(){
    const base=dashboardBeforeV137();
    const issues=directionIssues();
    if(!issues.length) return base;

    const rows=issues.map(function(item){
      return '<div class="kpi-line"><div><b>'+esc(item.child.name)+'</b>'+
        '<div class="muted mini">Был на занятии '+esc(item.lesson.date||'')+' · '+esc(item.group.direction)+' · '+esc(item.group.name||'')+'</div>'+
        '<div class="mini" style="margin-top:3px">Добавьте направление «'+esc(item.group.direction)+'» в карточку ребёнка.</div></div>'+
        '<button class="btn soft" onclick="openChild('+item.child.id+')">Открыть карточку</button></div>';
    }).join('');

    const block='<div class="card pad" style="margin-bottom:16px;border-color:#fedf89;background:#fffdf5">'+
      '<div class="section-title"><div><h2>Нужно добавить направление</h2><div class="muted mini">Дети были на платных посещениях направления, которого пока нет в их карточке</div></div><span class="badge amber">'+issues.length+'</span></div>'+rows+'</div>';

    const headEnd=base.indexOf('</div>')+6;
    return headEnd>5?base.slice(0,headEnd)+block+base.slice(headEnd):block+base;
  };

  // Also explain the issue directly in the child's card after the director opens it.
  const childBeforeV137=window.child||child;
  window.child=function(){
    let html=childBeforeV137();
    const selected=byId(state.children,state.selectedChild);
    if(!selected) return html;
    const issues=directionIssues().filter(function(x){return Number(x.child.id)===Number(selected.id);});
    if(!issues.length) return html;
    const dirs=Array.from(new Set(issues.map(function(x){return x.group.direction;})));
    const banner='<div class="notice" style="margin-bottom:16px"><b>Нужно добавить направление</b><div class="mini" style="margin-top:4px">Ребёнок уже был на обычном платном занятии: '+dirs.map(esc).join(', ')+', но этого направления нет в карточке. Используйте «+ Добавить направление» в блоке направлений.</div></div>';
    const tabsPos=html.indexOf('<div class="tabs">');
    return tabsPos>=0?html.slice(0,tabsPos)+banner+html.slice(tabsPos):banner+html;
  };

  window.missingDirectionIssuesV137=directionIssues;
  render();
})();

/* ===== Стабилизированный раздел из v138.js ===== */
// iCube CRM v1.1.38 — extra students can be absent/removed; distinguish teacher-created children.
(function(){
  function extraFor(lesson,childId){
    return (lesson?.extras||[]).find(function(e){return Number(e.childId)===Number(childId);})||null;
  }

  function extraPresent(ex){
    return ex ? ex.present!==false : false;
  }

  function isMainTrial(lesson,childId){
    return !!(lesson?.trialChildren&&lesson.trialChildren[childId]);
  }

  function recalcSummaryV138(lesson){
    if(!lesson) return;
    const presentMain=Object.entries(lesson.attendance||{}).filter(function(x){return !!x[1];});
    const presentExtras=(lesson.extras||[]).filter(extraPresent);
    const mainTrials=presentMain.filter(function(x){return isMainTrial(lesson,Number(x[0]));}).length;
    const extraTrials=presentExtras.filter(function(e){return !!e.trial;}).length;
    const missing=presentMain.filter(function(x){return !lesson.photos?.[x[0]];}).length+
      presentExtras.filter(function(e){return !lesson.photos?.[e.childId];}).length;
    lesson.summary={present:presentMain.length+presentExtras.length,trials:mainTrials+extraTrials,missing:missing};
  }

  // Existing extras predate the explicit attendance flag and are considered present.
  (state.lessons||[]).forEach(function(l){
    (l.extras||[]).forEach(function(ex){
      if(typeof ex.present!=='boolean') ex.present=true;
    });
  });

  // Newly added children start as present, but can now be unchecked without removing them.
  const addExtraBeforeV138=window.addExtra;
  if(typeof addExtraBeforeV138==='function'){
    window.addExtra=function(id){
      const result=addExtraBeforeV138(Number(id));
      const lesson=byId(state.lessons,state.selectedLesson);
      const ex=extraFor(lesson,id);
      if(ex && typeof ex.present!=='boolean') ex.present=true;
      recalcSummaryV138(lesson);
      return result;
    };
  }

  const saveQuickBeforeV138=window.saveTeacherQuickChildV121;
  if(typeof saveQuickBeforeV138==='function'){
    window.saveTeacherQuickChildV121=function(){
      const result=saveQuickBeforeV138();
      const lesson=byId(state.lessons,state.selectedLesson);
      (lesson?.extras||[]).forEach(function(ex){if(typeof ex.present!=='boolean') ex.present=true;});
      recalcSummaryV138(lesson);
      return result;
    };
  }

  window.toggleExtraAttendanceV138=function(childId,checked){
    const lesson=byId(state.lessons,state.selectedLesson);
    const ex=extraFor(lesson,childId);
    if(!lesson||!ex) return;
    ex.present=!!checked;
    recalcSummaryV138(lesson);
    render();
  };

  window.removeExtraFromLessonV138=function(childId){
    const lesson=byId(state.lessons,state.selectedLesson);
    const child=byId(state.children,childId);
    if(!lesson||!child) return;
    const ex=extraFor(lesson,childId);
    if(!ex) return;

    // If a completed paid visit is removed, reuse the existing visit deletion flow so money is corrected safely.
    if(lesson.done && lesson.attendanceApplied && ex.present!==false && typeof window.deleteVisitPrompt==='function'){
      window.deleteVisitPrompt(Number(childId),Number(lesson.id));
      return;
    }

    lesson.extras=(lesson.extras||[]).filter(function(e){return Number(e.childId)!==Number(childId);});
    if(lesson.photos) delete lesson.photos[childId];
    recalcSummaryV138(lesson);
    render();
  };

  // Clearer layout for the teacher: attendance checkbox on the left, identity/status in the middle,
  // photo + remove action on the right.
  window.studentCheck=function(c,l,extra,e){
    const photo=!!l.photos?.[c.id];
    const ex=extra?extraFor(l,c.id):null;
    const present=extra?extraPresent(ex):!!l.attendance?.[c.id];
    const trial=extra?!!ex?.trial:!!l.trialChildren?.[c.id];

    let subtitle='';
    if(extra){
      subtitle=ex?.createdByTeacher || c.createdByTeacher
        ? '<div class="muted mini">добавлен преподавателем</div>'
        : '<div class="muted mini">из другой группы</div>';
    }

    const trialControl=extra
      ? '<label class="mini trial-inline" style="display:block;margin-top:5px"><input type="checkbox" '+(trial?'checked':'')+' onchange="toggleVisitTrialV121('+c.id+',this.checked,true)"> Ознакомительное</label>'
      : ((trial || !(l.done))
          ? '<label class="mini trial-inline" style="display:block;margin-top:5px"><input type="checkbox" '+(trial?'checked':'')+' onchange="toggleVisitTrialV121('+c.id+',this.checked,false)"> Ознакомительное</label>'
          : '');

    const attendanceControl=extra
      ? '<input type="checkbox" '+(present?'checked':'')+' onchange="toggleExtraAttendanceV138('+c.id+',this.checked)">'
      : '<input type="checkbox" '+(present?'checked':'')+' onchange="attend('+c.id+',this.checked)">';

    const remove=extra
      ? '<button class="btn small" title="Убрать с занятия" onclick="removeExtraFromLessonV138('+c.id+')">Убрать</button>'
      : (l.done?'<button class="btn trial-more" title="Дополнительно" onclick="visitTrialOptionsV121('+c.id+',false)">⋯</button>':'');

    return '<div class="student-check">'+attendanceControl+
      '<div><b>'+c.name+'</b>'+subtitle+
      (trial?'<span class="badge amber" style="margin-top:4px">Ознакомительное</span>':'')+
      trialControl+'</div>'+
      '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end">'+
        '<button class="photo '+(photo?'done':'')+'" onclick="togglePhoto('+c.id+')">'+(photo?'Фото ✓':'📷 Фото')+'</button>'+remove+
      '</div></div>';
  };

  // Older finish logic treats every extra as present. Temporarily pass only checked extras to it.
  const finishBeforeV138=window.finishLesson;
  if(typeof finishBeforeV138==='function'){
    window.finishLesson=function(){
      const lesson=byId(state.lessons,state.selectedLesson);
      if(!lesson) return finishBeforeV138();
      const all=lesson.extras||[];
      const absent=all.filter(function(ex){return ex.present===false;});
      if(!absent.length) return finishBeforeV138();
      lesson.extras=all.filter(extraPresent);
      try{return finishBeforeV138();}
      finally{lesson.extras=all;}
    };
  }

  const confirmBeforeV138=window.confirmFinish;
  if(typeof confirmBeforeV138==='function'){
    window.confirmFinish=function(){
      const lesson=byId(state.lessons,state.selectedLesson);
      if(!lesson) return confirmBeforeV138();
      const all=lesson.extras||[];
      const present=all.filter(extraPresent);
      lesson.extras=present;
      try{
        const result=confirmBeforeV138();
        return result;
      }finally{
        lesson.extras=all;
        recalcSummaryV138(lesson);
      }
    };
  }

  // Dashboard warning about missing directions should only consider children who actually attended.
  if(typeof window.missingDirectionIssuesV137==='function'){
    const issuesBefore=window.missingDirectionIssuesV137;
    window.missingDirectionIssuesV138=function(){
      return issuesBefore().filter(function(item){
        const ex=extraFor(item.lesson,item.child.id);
        return !ex || ex.present!==false;
      });
    };
  }

  render();
})();

/* ===== Стабилизированный раздел из v139.js ===== */
// iCube CRM v1.1.39 — removing a teacher-created child removes the temporary CRM record and notifies the director.
(function(){
  state.teacherRemovedChildEvents=state.teacherRemovedChildEvents||[];

  function esc(s){
    return String(s??'').replace(/[&<>"']/g,function(ch){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
    });
  }

  function extraFor(lesson,childId){
    return (lesson?.extras||[]).find(function(e){return Number(e.childId)===Number(childId);})||null;
  }

  function wasCreatedForThisLesson(child,lesson,extra){
    return !!(child?.createdByTeacher || extra?.createdByTeacher) &&
      Number(child?.createdFromLessonId||lesson?.id)===Number(lesson?.id);
  }

  function currentTeacherId(lesson,group){
    if(typeof window.currentPrototypeTeacherId==='function'){
      const id=Number(window.currentPrototypeTeacherId()||0);
      if(id) return id;
    }
    return Number(lesson?.teacherId||group?.teacherId||0)||null;
  }

  function addRemovalEvent(child,lesson,group){
    const teacherId=Number(child?.createdByTeacherId||currentTeacherId(lesson,group)||0)||null;
    state.teacherRemovedChildEvents.unshift({
      id:Date.now()+Math.random(),
      childName:child?.name||'Ребёнок',
      teacherId:teacherId,
      lessonId:lesson?.id||null,
      date:lesson?.date||'',
      direction:group?.direction||'',
      groupName:group?.name||'',
      createdAt:new Date().toISOString()
    });
  }

  function removeTeacherCreatedChildCompletely(childId,lesson){
    const child=byId(state.children,childId);
    const group=lesson?byId(state.groups,lesson.groupId):null;
    const ex=extraFor(lesson,childId);
    if(!child||!lesson||!ex) return false;
    if(!wasCreatedForThisLesson(child,lesson,ex)) return false;

    addRemovalEvent(child,lesson,group);

    // Remove this temporary child from the lesson itself.
    lesson.extras=(lesson.extras||[]).filter(function(e){return Number(e.childId)!==Number(childId);});
    if(lesson.photos) delete lesson.photos[childId];
    if(lesson.trialChildren) delete lesson.trialChildren[childId];
    if(lesson.attendance) delete lesson.attendance[childId];

    // A child created directly on this lesson is a temporary CRM record until the director reviews it.
    // Removing it from that same lesson therefore removes the record itself as requested.
    state.children=(state.children||[]).filter(function(c){return Number(c.id)!==Number(childId);});

    // Defensive cleanup: such a child normally has no financial/history records yet, but make sure
    // no orphan references remain if the action happened before the director touched the card.
    state.payments=(state.payments||[]).filter(function(p){return Number(p.childId)!==Number(childId);});
    state.refunds=(state.refunds||[]).filter(function(r){return Number(r.childId)!==Number(childId);});

    if(lesson.summary){
      const presentMain=Object.values(lesson.attendance||{}).filter(Boolean).length;
      const presentExtras=(lesson.extras||[]).filter(function(e){return e.present!==false;});
      const mainTrials=Object.entries(lesson.attendance||{}).filter(function(row){return row[1]&&!!lesson.trialChildren?.[row[0]];}).length;
      const extraTrials=presentExtras.filter(function(e){return !!e.trial;}).length;
      const missing=Object.entries(lesson.attendance||{}).filter(function(row){return row[1]&&!lesson.photos?.[row[0]];}).length+
        presentExtras.filter(function(e){return !lesson.photos?.[e.childId];}).length;
      lesson.summary={present:presentMain+presentExtras.length,trials:mainTrials+extraTrials,missing:missing};
    }
    return true;
  }

  const removeBeforeV139=window.removeExtraFromLessonV138;
  window.removeExtraFromLessonV138=function(childId){
    const lesson=byId(state.lessons,state.selectedLesson);
    const child=byId(state.children,childId);
    const ex=extraFor(lesson,childId);

    if(lesson&&child&&ex&&wasCreatedForThisLesson(child,lesson,ex)){
      if(removeTeacherCreatedChildCompletely(Number(childId),lesson)){
        render();
        return;
      }
    }

    // A normal child added from another group is only removed from this lesson.
    return typeof removeBeforeV139==='function' ? removeBeforeV139(Number(childId)) : undefined;
  };

  window.dismissTeacherRemovedChildEventV139=function(id){
    state.teacherRemovedChildEvents=(state.teacherRemovedChildEvents||[]).filter(function(x){return String(x.id)!==String(id);});
    render();
  };

  const dashboardBeforeV139=window.dashboard||dashboard;
  window.dashboard=function(){
    const base=dashboardBeforeV139();
    const events=state.teacherRemovedChildEvents||[];
    if(!events.length) return base;

    const rows=events.map(function(ev){
      const teacher=byId(state.teachers,ev.teacherId);
      const details=[ev.date,ev.direction,ev.groupName].filter(Boolean).map(esc).join(' · ');
      return '<div class="kpi-line"><div><b>'+esc(ev.childName)+'</b>'+
        '<div class="muted mini">'+esc(teacher?.name||'Преподаватель')+' создал ребёнка на занятии, затем убрал его.</div>'+
        (details?'<div class="muted mini">'+details+'</div>':'')+
        '</div><button class="btn small" onclick="dismissTeacherRemovedChildEventV139(\''+String(ev.id).replace(/'/g,'')+'\')">Понятно</button></div>';
    }).join('');

    const block='<div class="card pad" style="margin-bottom:16px;border-color:#d0d5dd;background:#fcfcfd">'+
      '<div class="section-title"><div><h2>Изменения на занятиях</h2><div class="muted mini">Информационные сообщения от преподавателей</div></div><span class="badge gray">'+events.length+'</span></div>'+rows+'</div>';

    const headEnd=base.indexOf('</div>')+6;
    return headEnd>5?base.slice(0,headEnd)+block+base.slice(headEnd):block+base;
  };

  render();
})();

/* ===== Стабилизированный раздел из v140.js ===== */
// iCube CRM v1.1.40 — wider teacher calendar on desktop only.
(function(){
  const STYLE_ID='crm-teacher-calendar-desktop-width-v140';
  let style=document.getElementById(STYLE_ID);
  if(!style){
    style=document.createElement('style');
    style.id=STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent=`
    @media (min-width: 761px){
      .teacher-content:has(.calendar){
        max-width:1180px!important;
        width:100%;
      }
      .teacher-content:has(.calendar) .calendar{
        grid-template-columns:repeat(7,minmax(0,1fr))!important;
      }
      .teacher-content:has(.calendar) .day{
        min-width:0;
      }
      .teacher-content:has(.calendar) .event{
        overflow-wrap:anywhere;
      }
    }
  `;
})();

/* ===== Стабилизированный раздел из v141.js ===== */
// iCube CRM v1.1.41 — independent status per child direction while preserving global child status.
(function(){
  const DIR_STATUSES=['Активный','Пауза','Закончил'];

  function isoToday(){
    const d=new Date();
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  function badgeClass(status){
    return status==='Активный'?'green':status==='Пауза'?'amber':'gray';
  }
  function enrollmentStatus(e){ return e?.status||'Активный'; }
  function isEnrollmentActive(e){ return enrollmentStatus(e)==='Активный'; }
  function childGloballyActive(c){ return c && (c.status==='Активный'||c.status==='Лид'); }

  (state.children||[]).forEach(function(c){
    (c.enrollments||[]).forEach(function(e){ if(!e.status) e.status='Активный'; });
  });

  // Helper for old code paths which still only know about groupId.
  // During rendering/calculation we temporarily hide inactive enrollments from groupChildren/scoped statistics,
  // while the real groupId remains stored on the enrollment and is not lost.
  function withInactiveDirectionsMasked(fn,ctx,args){
    const changed=[];
    (state.children||[]).forEach(function(c){
      (c.enrollments||[]).forEach(function(e){
        if(!isEnrollmentActive(e) && e.groupId!=null){
          changed.push({e:e,groupId:e.groupId});
          e.groupId=null;
        }
      });
    });
    try{return fn.apply(ctx,args||[]);}finally{
      changed.forEach(function(x){x.e.groupId=x.groupId;});
    }
  }

  ['groups','group','teacherToday','teacherCalendar','teacherLesson','stats'].forEach(function(name){
    const old=window[name];
    if(typeof old!=='function') return;
    window[name]=function(){ return withInactiveDirectionsMasked(old,this,arguments); };
  });

  // Show only active-direction candidates in the group assignment modal.
  const renderAddBefore=window.renderAddChildrenList;
  if(typeof renderAddBefore==='function'){
    window.renderAddChildrenList=function(){
      const result=renderAddBefore();
      const g=byId(state.groups,state.addChildrenGroupId);
      if(!g) return result;
      document.querySelectorAll('.ac-check').forEach(function(input){
        const c=byId(state.children,Number(input.value));
        const e=(c?.enrollments||[]).find(function(x){return x.direction===g.direction;});
        if(!e || !isEnrollmentActive(e)) input.closest('.student-check')?.remove();
      });
      if(typeof window.updateAddChildrenCount==='function') window.updateAddChildrenCount();
      return result;
    };
  }

  const confirmAddBefore=window.confirmAddChildren;
  if(typeof confirmAddBefore==='function'){
    window.confirmAddChildren=function(){
      const g=byId(state.groups,state.addChildrenGroupId);
      document.querySelectorAll('.ac-check:checked').forEach(function(input){
        const c=byId(state.children,Number(input.value));
        const e=(c?.enrollments||[]).find(function(x){return x.direction===g?.direction;});
        if(!e || !isEnrollmentActive(e)) input.checked=false;
      });
      return confirmAddBefore();
    };
  }

  // Add status selector to the existing unified direction/price editor.
  const manageFormBefore=window.manageDirectionForm;
  if(typeof manageFormBefore==='function'){
    window.manageDirectionForm=function(childId,oldDirection){
      manageFormBefore(childId,oldDirection);
      const child=byId(state.children,Number(childId));
      const e=(child?.enrollments||[]).find(function(x){return x.direction===oldDirection;});
      const grid=document.querySelector('.modal .form-grid');
      if(!grid||!e||document.querySelector('#md-enrollment-status')) return;
      const field=document.createElement('div');
      field.className='field span-2';
      field.innerHTML='<label>Статус направления</label><select class="select" id="md-enrollment-status">'+DIR_STATUSES.map(function(s){return '<option'+(s===enrollmentStatus(e)?' selected':'')+'>'+s+'</option>';}).join('')+'</select><div class="muted mini" style="margin-top:5px">Этот статус действует только на данное направление. Общий статус ребёнка по-прежнему можно менять отдельно.</div>';
      grid.appendChild(field);
    };
  }

  const saveManagedBefore=window.saveManagedDirection;
  if(typeof saveManagedBefore==='function'){
    window.saveManagedDirection=function(childId,oldDirection){
      const child=byId(state.children,Number(childId));
      const oldE=(child?.enrollments||[]).find(function(x){return x.direction===oldDirection;});
      const previous=enrollmentStatus(oldE);
      const nextStatus=document.querySelector('#md-enrollment-status')?.value||previous;
      const newDirection=document.querySelector('#md-dir')?.value||oldDirection;
      const result=saveManagedBefore(childId,oldDirection);
      const target=(child?.enrollments||[]).find(function(x){return x.direction===newDirection;});
      if(target){
        target.status=DIR_STATUSES.includes(nextStatus)?nextStatus:'Активный';
        if(previous!==target.status){
          target.statusChangedAt=isoToday();
          target.statusHistory=target.statusHistory||[];
          target.statusHistory.push({from:previous,to:target.status,date:target.statusChangedAt});
        }
      }
      render();
      return result;
    };
  }

  // Newly created second directions are active by default.
  const saveAddedBefore=window.saveAddedDirectionV132;
  if(typeof saveAddedBefore==='function'){
    window.saveAddedDirectionV132=function(){
      const childId=Number(document.querySelector('#ad-child-id')?.value);
      const direction=document.querySelector('#ad-dir')?.value;
      const child=byId(state.children,childId);
      const result=saveAddedBefore();
      const e=(child?.enrollments||[]).find(function(x){return x.direction===direction;});
      if(e&&!e.status) e.status='Активный';
      render();
      return result;
    };
  }

  // Show per-direction status badges only when the child has multiple directions.
  // With one direction the global child status already communicates enough and the extra badge is visual noise.
  const childBefore=window.child;
  if(typeof childBefore==='function'){
    window.child=function(){
      let html=childBefore();
      const child=byId(state.children,state.selectedChild);
      if(!child) return html;
      const showDirectionStatuses=(child.enrollments||[]).length>1;
      (child.enrollments||[]).forEach(function(e){
        const button='<button class="btn" onclick="manageDirectionForm('+child.id+',\''+e.direction+'\')">Изменить направление / цену</button>';
        if(!html.includes(button) || !showDirectionStatuses) return;
        const badge='<span class="badge '+badgeClass(enrollmentStatus(e))+'" style="margin-right:8px">'+enrollmentStatus(e)+'</span>';
        html=html.replace(button,badge+button);
      });
      return html;
    };
  }

  // Expose helpers for later logic/statistics layers.
  window.enrollmentStatusV141=enrollmentStatus;
  window.isEnrollmentActiveV141=isEnrollmentActive;
  window.childGloballyActiveV141=childGloballyActive;

  render();
})();

/* ===== Стабилизированный раздел из v142.js ===== */
// iCube CRM v1.1.42 — price changes affect future payments only; closed directions can transfer remaining value.
(function(){
  const EPS=1e-7;
  const DIR_STATUSES=['Активный','Пауза','Закончил'];

  function isoToday(){
    const d=new Date();
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  function fmt(n,d){return Number(Number(n||0).toFixed(d==null?4:d));}
  function currentEnrollment(child,direction){
    return (child?.enrollments||[]).find(function(e){return e.direction===direction;})||null;
  }
  function effective(e){return Number(effectivePrice(e)||0);}
  function lotLessons(e){return (e.balanceLotsV142||[]).reduce(function(s,l){return s+Number(l.lessons||0);},0);}
  function lotMoney(e){return (e.balanceLotsV142||[]).reduce(function(s,l){return s+Number(l.lessons||0)*Number(l.price||0);},0);}

  function ensureLots(e){
    if(!e || Array.isArray(e.balanceLotsV142)) return;
    const b=Math.max(0,Number(e.balance||0));
    const p=effective(e);
    e.balanceLotsV142=b>EPS&&p>0?[{lessons:b,price:p,source:'legacy'}]:[];
  }
  function ensureAllLots(){
    (state.children||[]).forEach(function(c){(c.enrollments||[]).forEach(ensureLots);});
  }
  function consumeLots(e,amount){
    let left=Math.max(0,Number(amount||0));
    const lots=e.balanceLotsV142||[];
    while(left>EPS&&lots.length){
      const l=lots[0],q=Number(l.lessons||0);
      const take=Math.min(q,left);
      l.lessons=q-take; left-=take;
      if(Number(l.lessons||0)<=EPS) lots.shift();
    }
  }
  function syncLots(e,preferredPrice){
    if(!e) return;
    ensureLots(e);
    const target=Math.max(0,Number(e.balance||0));
    const have=lotLessons(e);
    if(target<have-EPS){
      consumeLots(e,have-target);
    }else if(target>have+EPS){
      const p=Number(preferredPrice||effective(e)||0);
      if(p>0) e.balanceLotsV142.push({lessons:target-have,price:p,source:'balance-sync'});
    }
  }
  function syncAllLots(){
    (state.children||[]).forEach(function(c){(c.enrollments||[]).forEach(function(e){syncLots(e);});});
  }
  ensureAllLots();

  // Keep the lot ledger in step with the existing balance-changing flows.
  function wrapBalanceMutation(name,priceResolver){
    const old=window[name];
    if(typeof old!=='function') return;
    window[name]=function(){
      ensureAllLots();
      let p=null;
      try{p=typeof priceResolver==='function'?priceResolver.apply(this,arguments):null;}catch(_e){}
      const result=old.apply(this,arguments);
      syncAllLots();
      if(p&&p.enrollment) syncLots(p.enrollment,p.price);
      return result;
    };
  }

  wrapBalanceMutation('savePaymentV116',function(){
    const child=byId(state.children,Number(document.querySelector('#pf-child')?.value));
    const dir=document.querySelector('#pf-dir')?.value;
    const e=currentEnrollment(child,dir);
    return {enrollment:e,price:e?effective(e):null};
  });
  ['confirmDeletePayment','confirmDeleteChildPayment','saveRefundForChild','confirmDeleteVisit','attend','toggleVisitTrialV121','forceVisitTrialV121','confirmFinish','addExtra','removeExtraFromLessonV138'].forEach(function(n){wrapBalanceMutation(n);});

  // Price preview: changing price within the SAME direction no longer converts existing lessons into money.
  const refreshBeforeV142=window.refreshManageDirectionPreview;
  window.refreshManageDirectionPreview=function(){
    const childId=Number(document.querySelector('#md-child-id')?.value);
    const oldDirection=document.querySelector('#md-old-dir')?.value;
    const newDirection=document.querySelector('#md-dir')?.value||oldDirection;
    const child=byId(state.children,childId);
    const e=currentEnrollment(child,oldDirection);
    const box=document.querySelector('#md-preview');
    if(!e||!box) return typeof refreshBeforeV142==='function'?refreshBeforeV142():undefined;
    if(newDirection!==oldDirection) return typeof refreshBeforeV142==='function'?refreshBeforeV142():undefined;

    const rawGroup=document.querySelector('#md-group')?.value;
    const groupId=rawGroup?Number(rawGroup):null;
    const mode=document.querySelector('#md-price-mode')?.value||'standard';
    const packagePrice=Number(document.querySelector('#md-individual-package')?.value||0);
    const draft={direction:oldDirection,groupId:groupId,individualPrice:mode==='individual'?(packagePrice>0?packagePrice/4:0):null};
    const newPrice=effective(draft);
    const oldPrice=effective(e);
    const balance=Number(e.balance||0);

    box.innerHTML='<div class="info-list">'+
      '<div class="info-line"><span>Остаток занятий</span><b>'+fmt(balance,4)+'</b></div>'+
      '<div class="info-line"><span>Текущая цена</span><b>'+money(oldPrice)+' / занятие</b></div>'+
      '<div class="info-line"><span>Новая цена</span><b>'+(newPrice>0?money(newPrice)+' / занятие':'—')+'</b></div>'+
      '<div class="info-line"><span>После изменения</span><b>'+fmt(balance,4)+' занятий</b></div>'+
      '</div>'+
      (Math.abs(newPrice-oldPrice)>EPS?'<div class="notice" style="margin-top:12px">Уже оплаченные занятия <b>не пересчитываются</b>: ребёнок дохаживает текущий остаток. Новая цена применяется только к следующим оплатам.</div>':'<div class="muted mini" style="margin-top:10px">Баланс занятий останется без изменений.</div>');
  };

  // Same-direction save: keep the lesson count exactly as it is. Direction replacement still uses the older migration flow.
  const saveBeforeV142=window.saveManagedDirection;
  window.saveManagedDirection=function(childId,oldDirection){
    const child=byId(state.children,Number(childId));
    const e=currentEnrollment(child,oldDirection);
    const newDirection=document.querySelector('#md-dir')?.value||oldDirection;
    if(!child||!e||newDirection!==oldDirection){
      const result=typeof saveBeforeV142==='function'?saveBeforeV142(childId,oldDirection):undefined;
      ensureAllLots();
      return result;
    }

    ensureLots(e);
    const rawGroup=document.querySelector('#md-group')?.value;
    const groupId=rawGroup?Number(rawGroup):null;
    const mode=document.querySelector('#md-price-mode')?.value||'standard';
    const packagePrice=Number(document.querySelector('#md-individual-package')?.value||0);
    if(mode==='individual'&&!(packagePrice>0)){
      alert('Укажите индивидуальную цену абонемента за 4 занятия.');
      return;
    }
    const previousStatus=e.status||'Активный';
    const nextStatus=document.querySelector('#md-enrollment-status')?.value||previousStatus;
    const keepBalance=Number(e.balance||0);

    e.groupId=groupId;
    e.individualPrice=mode==='individual'?packagePrice/4:null;
    e.balance=keepBalance;
    e.status=DIR_STATUSES.includes(nextStatus)?nextStatus:previousStatus;
    if(previousStatus!==e.status){
      e.statusChangedAt=isoToday();
      e.statusHistory=e.statusHistory||[];
      e.statusHistory.push({from:previousStatus,to:e.status,date:e.statusChangedAt});
    }

    // Bind only unresolved historical payments when a previously groupless direction receives a group.
    const g=groupId!=null?byId(state.groups,groupId):null;
    if(g){
      (state.payments||[]).forEach(function(p){
        if(Number(p.childId)===Number(child.id)&&p.direction===oldDirection&&(p.project==null||p.project==='')){
          p.project=g.project||null; p.groupId=g.id;
        }
      });
    }

    state.modal=null;
    state.childTab='overview';
    state.page='child';
    render();
  };

  function transferTargets(child,source){
    return (child?.enrollments||[]).filter(function(e){return e!==source&&(e.status||'Активный')!=='Закончил';});
  }
  function canTransfer(child,e){
    return !!child&&!!e&&(e.status||'Активный')==='Закончил'&&Number(e.balance||0)>EPS&&transferTargets(child,e).length>0;
  }

  window.transferDirectionBalanceFormV142=function(childId,direction){
    const child=byId(state.children,Number(childId));
    const source=currentEnrollment(child,direction);
    if(!canTransfer(child,source)) return;
    ensureLots(source);
    const targets=transferTargets(child,source);
    const amount=lotMoney(source);
    let html='<h3>Перенести остаток</h3>';
    html+='<div class="notice">Направление <b>«'+direction+'»</b> закрыто. Осталось <b>'+fmt(source.balance,4)+' занятия</b> на сумму <b>'+money(amount)+'</b>.</div>';
    html+='<div class="field" style="margin-top:14px"><label>Перенести на направление</label><select class="select" id="tb-target" onchange="refreshTransferPreviewV142('+child.id+',\''+direction+'\')">';
    targets.forEach(function(e){html+='<option value="'+e.direction+'">'+e.direction+'</option>';});
    html+='</select></div><div id="tb-preview" class="card pad" style="margin-top:14px"></div>';
    html+='<div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn primary" onclick="confirmTransferDirectionBalanceV142('+child.id+',\''+direction+'\')">Перенести остаток</button></div>';
    modal(html);
    setTimeout(function(){refreshTransferPreviewV142(child.id,direction);},0);
  };

  window.refreshTransferPreviewV142=function(childId,direction){
    const child=byId(state.children,Number(childId));
    const source=currentEnrollment(child,direction);
    const target=currentEnrollment(child,document.querySelector('#tb-target')?.value);
    const box=document.querySelector('#tb-preview');
    if(!source||!target||!box) return;
    ensureLots(source); ensureLots(target);
    const amount=lotMoney(source),price=effective(target),lessons=price>0?amount/price:0;
    box.innerHTML='<div class="info-list">'+
      '<div class="info-line"><span>Переносится</span><b>'+money(amount)+'</b></div>'+
      '<div class="info-line"><span>Цена «'+target.direction+'»</span><b>'+money(price)+' / занятие</b></div>'+
      '<div class="info-line"><span>Будет добавлено</span><b>'+fmt(lessons,4)+' занятия</b></div>'+
      '</div><div class="muted mini" style="margin-top:10px">Оплаты и посещения старого направления остаются в его истории. Создаётся отдельная операция переноса остатка.</div>';
  };

  window.confirmTransferDirectionBalanceV142=function(childId,direction){
    const child=byId(state.children,Number(childId));
    const source=currentEnrollment(child,direction);
    const target=currentEnrollment(child,document.querySelector('#tb-target')?.value);
    if(!canTransfer(child,source)||!target) return;
    ensureLots(source); ensureLots(target);
    const amount=lotMoney(source),targetPrice=effective(target);
    if(!(amount>EPS)||!(targetPrice>0)) return;
    const lessons=amount/targetPrice;

    source.balance=0;
    source.balanceLotsV142=[];
    target.balance=Number(target.balance||0)+lessons;
    target.balanceLotsV142.push({lessons:lessons,price:targetPrice,source:'transfer'});

    state.balanceTransfersV142=state.balanceTransfersV142||[];
    state.balanceTransfersV142.unshift({
      id:Date.now()+Math.random(),childId:Number(child.id),from:source.direction,to:target.direction,
      amount:amount,lessons:lessons,targetPrice:targetPrice,date:isoToday()
    });
    state.modal=null;
    state.childTab='overview';
    state.page='child';
    render();
  };

  const childBeforeV142=window.child;
  window.child=function(){
    let html=childBeforeV142();
    const child=byId(state.children,state.selectedChild);
    if(!child) return html;
    (child.enrollments||[]).forEach(function(e){
      if(!canTransfer(child,e)) return;
      const button='<button class="btn" onclick="manageDirectionForm('+child.id+',\''+e.direction+'\')">Изменить направление / цену</button>';
      if(!html.includes(button)) return;
      const transfer='<button class="btn soft" onclick="transferDirectionBalanceFormV142('+child.id+',\''+e.direction+'\')">Перенести остаток</button>';
      html=html.replace(button,button+transfer);
    });
    return html;
  };

  window.remainingDirectionMoneyV142=function(e){ensureLots(e);return lotMoney(e);};
  render();
})();

/* ===== Стабилизированный раздел из v143.js ===== */
// iCube CRM v1.1.43 — show how much to top up a fractional lesson balance to the next whole lesson.
(function(){
  const EPS=1e-7;

  function fmt(n,d){
    return Number(Number(n||0).toFixed(d==null?4:d));
  }

  function topUpInfo(e){
    if(!e) return null;
    const balance=Number(e.balance||0);
    const rounded=Math.round(balance);
    if(Math.abs(balance-rounded)<EPS) return null;

    const price=Number(effectivePrice(e)||0);
    if(!(price>0)) return null;

    // The next integer at or above the current balance. This also behaves sensibly
    // for a fractional debt: -0.5 -> 0, -1.2 -> -1.
    const target=Math.ceil(balance-EPS);
    const lessonPart=target-balance;
    if(!(lessonPart>EPS)) return null;

    return {
      target:target,
      amount:lessonPart*price,
      lessonPart:lessonPart,
      price:price
    };
  }

  window.fractionalBalanceTopUpV143=topUpInfo;

  const childBeforeV143=window.child;
  if(typeof childBeforeV143==='function'){
    window.child=function(){
      let html=childBeforeV143();
      const child=byId(state.children,state.selectedChild);
      if(!child || state.childTab!=='overview') return html;

      (child.enrollments||[]).forEach(function(e){
        const info=topUpInfo(e);
        if(!info) return;

        const balanceText=fmt(e.balance,4)+' занятий';
        const priceText=money(effectivePrice(e))+' / занятие';
        const marker='<div class="money '+(e.balance<0?'negative':e.balance>0?'positive':'')+'">'+balanceText+'</div><div class="muted mini">'+priceText+'</div>';
        if(!html.includes(marker)) return;

        const targetText=info.target===1?'1 занятия':fmt(info.target,4)+' занятий';
        const hint='<div class="muted mini" style="margin-top:4px"><b>Доплатить '+money(info.amount)+'</b> → будет '+targetText+'</div>';
        html=html.replace(marker,marker+hint);
      });
      return html;
    };
  }

  render();
})();

/* ===== Стабилизированный раздел из v144.js ===== */
// iCube CRM v1.1.44 — show the teacher the main group before starting a lesson.
(function(){
  function parseRuDate(s){
    const p=String(s||'').split('.').map(Number);
    return new Date(p[2]||0,(p[1]||1)-1,p[0]||1);
  }

  function extraPresent(ex){return !ex || ex.present!==false;}

  // "Новый" only means the child has no previous completed visit in this
  // direction. Whether today's visit is introductory is decided separately.
  function hasPreviousVisitInDirection(childId,currentLesson,direction){
    const currentDate=parseRuDate(currentLesson?.date);
    return (state.lessons||[]).some(function(l){
      if(!l || Number(l.id)===Number(currentLesson?.id) || l.cancelled || !l.done) return false;
      if(parseRuDate(l.date)>currentDate) return false;
      const g=byId(state.groups,l.groupId);
      if(!g || g.direction!==direction) return false;
      const main=!!(l.attendance&&l.attendance[childId]);
      const extra=(l.extras||[]).some(function(e){
        return Number(e.childId)===Number(childId) && extraPresent(e);
      });
      return main||extra;
    });
  }

  function previewList(lesson,group,kids){
    let html='<div class="teacher-card teacher-prestart-group">';
    html+='<div class="section-title"><h2>Основная группа</h2><span class="badge blue">'+kids.length+' '+(kids.length===1?'ребёнок':kids.length>=2&&kids.length<=4?'ребёнка':'детей')+'</span></div>';
    if(!kids.length){
      html+='<div class="muted mini">В основной группе пока нет детей.</div>';
    }else{
      html+='<div class="attendance">';
      kids.forEach(function(c){
        const isNew=!hasPreviousVisitInDirection(c.id,lesson,group.direction);
        html+='<div class="kpi-line teacher-prestart-child"><b>'+c.name+'</b>'+(isNew?'<span class="badge amber">Новый</span>':'')+'</div>';
      });
      html+='</div>';
    }
    return html+'</div>';
  }

  const teacherLessonBeforeV144=window.teacherLesson;
  window.teacherLesson=function(){
    const lesson=byId(state.lessons,state.selectedLesson);
    if(!lesson || lesson.started || lesson.done) return teacherLessonBeforeV144();
    const group=byId(state.groups,lesson.groupId);
    if(!group) return teacherLessonBeforeV144();
    const kids=groupChildren(group.id);
    let html=teacherLessonBeforeV144();
    const marker='<div class="teacher-card"><h3 style="margin-top:0">Занятие готово</h3>';
    const pos=html.indexOf(marker);
    if(pos<0) return html;
    return html.slice(0,pos)+previewList(lesson,group,kids)+html.slice(pos);
  };

  render();
})();

/* ===== Стабилизированный раздел из v145.js ===== */
// iCube CRM v1.1.45 — all "today" behaviour uses the actual local browser date.
(function(){
  function pad(n){return String(n).padStart(2,'0');}
  function todayDate(){
    const d=new Date();
    return new Date(d.getFullYear(),d.getMonth(),d.getDate());
  }
  function toIso(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
  function toRu(d){return pad(d.getDate())+'.'+pad(d.getMonth()+1)+'.'+d.getFullYear();}
  function parseRu(s){
    const p=String(s||'').split('.').map(Number);
    return new Date(p[2]||0,(p[1]||1)-1,p[0]||1);
  }
  function timeStart(t){return String(t||'').split('–')[0]||'';}
  function longRu(d){
    const days=['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];
    const months=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
    return days[d.getDay()]+', '+d.getDate()+' '+months[d.getMonth()];
  }
  function currentTeacherId(){
    if(typeof window.currentPrototypeTeacherId==='function'){
      const id=Number(window.currentPrototypeTeacherId()||0);
      if(id) return id;
    }
    if(state.prototypeTeacherId!=null) return Number(state.prototypeTeacherId);
    const t=(state.teachers||[]).find(function(x){return x.active!==false;})||(state.teachers||[])[0];
    return t?Number(t.id):null;
  }
  function eventStatusHtml(e){
    if(e.cancelled) return '<span class="badge red">Отменено</span>';
    if(e.moved) return '<span class="badge amber">Перенесено</span>';
    if(e.done) return '<span class="badge green">Проведено</span>';
    return '';
  }

  // v126 initialized the director calendar with a prototype date before newer
  // calendar layers loaded. Repair that legacy initial value on every fresh load.
  const actualToday=todayDate();
  const actualIso=toIso(actualToday);
  const actualMonthStart=toIso(new Date(actualToday.getFullYear(),actualToday.getMonth(),1));
  const actualMonthEnd=toIso(new Date(actualToday.getFullYear(),actualToday.getMonth()+1,0));
  if(state.calendarCursor==='2026-09-10' || !state.calendarCursor) state.calendarCursor=actualIso;
  if(state.teacherCalendarCursor==='2026-09-10') state.teacherCalendarCursor=actualIso;
  if(state.salaryDateFrom==='2026-08-10') state.salaryDateFrom=actualMonthStart;
  if(state.salaryDateTo==='2026-09-10') state.salaryDateTo=actualIso;
  if(state.partnerDateFrom==='2026-08-26') state.partnerDateFrom=actualMonthStart;
  if(state.partnerDateTo==='2026-09-25') state.partnerDateTo=actualIso;
  if(state.statsDateFrom==='2026-09-01') state.statsDateFrom=actualMonthStart;
  if(state.statsDateTo==='2026-09-30') state.statsDateTo=actualMonthEnd;

  window.goCalendarTodayV126=function(){
    state.calendarCursor=toIso(todayDate());
    render();
  };
  window.goTeacherCalendarTodayV127=function(){
    state.teacherCalendarCursor=toIso(todayDate());
    render();
  };

  // Teacher "Today" page used a fixed 09.09.2026 in an older prototype layer.
  window.teacherToday=function(){
    const d=todayDate();
    const teacherId=currentTeacherId();
    const events=(typeof window.sharedCalendarEvents==='function'
      ? window.sharedCalendarEvents(d,d,teacherId)
      : (state.lessons||[]).filter(function(l){return l.date===toRu(d)&&Number(l.teacherId)===Number(teacherId);} ).map(function(l){
          const g=byId(state.groups,l.groupId);
          return {key:l.occurrenceKey||String(l.id),groupId:l.groupId,teacherId:l.teacherId,date:l.date,time:l.time,lesson:l,cancelled:!!l.cancelled,moved:!!l.moved,done:!!l.done,project:g?.project};
        })
    ).sort(function(a,b){return timeStart(a.time).localeCompare(timeStart(b.time));});

    const cards=events.map(function(e){
      const g=byId(state.groups,e.groupId); if(!g) return '';
      const site=byId(state.sites,g.siteId);
      return '<div class="teacher-card" onclick="openUnifiedCalendarEvent(\''+e.key+'\',\'teacher\')">'+
        '<div class="teacher-lesson-head"><div><div class="teacher-time">'+timeStart(e.time)+'</div><h3 style="margin:4px 0">'+g.direction+'</h3><div class="muted">'+g.name+'<br>'+(site?.name||'')+'</div></div><div>'+eventStatusHtml(e)+'</div></div>'+
        '<button class="btn primary" style="width:100%;margin-top:14px">Открыть занятие</button></div>';
    }).join('');

    return '<h1 style="margin:2px 0 4px">Сегодня</h1><div class="muted" style="margin-bottom:18px">'+longRu(d)+' · '+events.length+' занятий</div>'+
      (cards||'<div class="teacher-card"><div class="empty">Сегодня занятий нет.</div></div>');
  };

  // Keep all dashboard notification wrappers, but rebuild the two date-sensitive
  // schedule blocks from the actual current date.
  const dashboardBeforeV145=window.dashboard;
  if(typeof dashboardBeforeV145==='function'){
    window.dashboard=function(){
      let html=dashboardBeforeV145();
      const d=todayDate();
      const start=new Date(d);
      const end=new Date(d); end.setDate(end.getDate()+14);
      const all=(typeof window.sharedCalendarEvents==='function'
        ? window.sharedCalendarEvents(start,end,null)
        : []
      ).sort(function(a,b){
        const dd=parseRu(a.date)-parseRu(b.date);
        return dd||timeStart(a.time).localeCompare(timeStart(b.time));
      });
      const todayRu=toRu(d);
      const todayEvents=all.filter(function(e){return e.date===todayRu;});
      const upcoming=all.filter(function(e){return !e.cancelled && parseRu(e.date)>=d;}).slice(0,3);

      html=html.replace('Среда, 9 сентября · обзор клуба',longRu(d)+' · обзор клуба');

      const upcomingMarker='<div class="card pad"><div class="section-title"><h2>Ближайшие занятия</h2>';
      const todayMarker='<div class="card pad" style="margin-top:16px"><div class="section-title"><h2>Сегодня</h2>';
      const upPos=html.indexOf(upcomingMarker);
      const todayPos=html.indexOf(todayMarker);
      if(upPos>=0 && todayPos>upPos){
        let up='<div class="card pad"><div class="section-title"><h2>Ближайшие занятия</h2><button class="btn" onclick="navTo(\'calendar\')">Календарь</button></div><div class="list">';
        if(upcoming.length){
          up+=upcoming.map(function(e){
            const g=byId(state.groups,e.groupId),site=g?byId(state.sites,g.siteId):null;
            if(!g) return '';
            return '<div class="kpi-line clickable" onclick="openUnifiedCalendarEvent(\''+e.key+'\',\'director\')"><div><b>'+timeStart(e.time)+' · '+g.direction+'</b><div class="muted mini">'+g.name+' · '+(site?.name||'')+'</div></div><span class="badge '+(g.project==='Зебра'?'purple':'blue')+'">'+g.project+'</span></div>';
          }).join('');
        }else up+='<div class="empty">Ближайших занятий нет.</div>';
        up+='</div></div></div>';
        html=html.slice(0,upPos)+up+html.slice(todayPos);
      }

      const freshTodayPos=html.indexOf(todayMarker);
      if(freshTodayPos>=0){
        let block='<div class="card pad" style="margin-top:16px"><div class="section-title"><h2>Сегодня</h2><span class="muted">'+todayEvents.length+' занятий</span></div>';
        if(!todayEvents.length){
          block+='<div class="empty">Сегодня занятий нет.</div>';
        }else{
          block+='<div class="grid cols-2">'+todayEvents.map(function(e){
            const g=byId(state.groups,e.groupId),site=g?byId(state.sites,g.siteId):null,teacher=byId(state.teachers,e.teacherId);
            if(!g) return '';
            return '<div style="border:1px solid var(--line);border-radius:12px;padding:14px"><div class="muted mini">'+e.time+'</div><b style="font-size:16px">'+g.name+'</b><div class="muted">'+(site?.name||'')+' · '+(teacher?.name||'')+'</div><button class="btn soft" style="margin-top:12px" onclick="openUnifiedCalendarEvent(\''+e.key+'\',\'director\')">Открыть занятие</button></div>';
          }).join('')+'</div>';
        }
        block+='</div>';
        html=html.slice(0,freshTodayPos)+block;
      }
      return html;
    };
  }

  // New financial operations should also default to the real current date.
  function wrapNewDateForm(name,inputId){
    const old=window[name];
    if(typeof old!=='function') return;
    window[name]=function(){
      const args=arguments;
      const result=old.apply(this,args);
      const isEdit=(name==='paymentForm' && args.length>=3 && args[2]!=null);
      if(!isEdit){
        setTimeout(function(){
          const input=document.querySelector(inputId);
          if(input) input.value=toIso(todayDate());
        },0);
      }
      return result;
    };
  }
  wrapNewDateForm('paymentForm','#pf-date');
  wrapNewDateForm('refundForm','#rf-date');
  wrapNewDateForm('refundFormForChild','#rf-date');

  window.actualTodayV145=function(){return todayDate();};
  render();
})();

/* ===== Стабилизированный раздел из v146.js ===== */
// iCube CRM v1.1.46 — freeze the main-group roster when a lesson starts.
(function(){
  function uniqueIds(ids){
    return Array.from(new Set((ids||[]).map(Number).filter(function(id){return !!byId(state.children,id);} )));
  }

  function enrollmentActive(e){
    if(typeof window.isEnrollmentActiveV141==='function') return !!window.isEnrollmentActiveV141(e);
    return (e?.status||'Активный')==='Активный';
  }

  function childActive(c){
    if(typeof window.childGloballyActiveV141==='function') return !!window.childGloballyActiveV141(c);
    return !!c && (c.status==='Активный'||c.status==='Лид');
  }

  // Important: the frozen roster must respect the status of this exact direction.
  // Do not rely on the old groupChildren() here because it only knows groupId + global child status.
  function currentRoster(lesson){
    const group=lesson?byId(state.groups,lesson.groupId):null;
    if(!group) return [];
    return (state.children||[]).filter(function(child){
      if(!childActive(child)) return false;
      return (child.enrollments||[]).some(function(e){
        return e.direction===group.direction &&
          Number(e.groupId)===Number(group.id) &&
          enrollmentActive(e);
      });
    });
  }

  function ensureHistoricalSnapshot(lesson){
    if(!lesson || Array.isArray(lesson.groupChildIdsV146)) return;
    // Lessons that were already started/completed before this update already have
    // their old main-group roster encoded in attendance keys. Preserve that history.
    if(lesson.started || lesson.done){
      lesson.groupChildIdsV146=uniqueIds(Object.keys(lesson.attendance||{}));
      lesson.groupRosterFrozenV146=true;
    }
  }

  (state.lessons||[]).forEach(ensureHistoricalSnapshot);

  function freezeRoster(lesson){
    if(!lesson) return [];
    const ids=uniqueIds(currentRoster(lesson).map(function(c){return c.id;}));
    lesson.groupChildIdsV146=ids;
    lesson.groupRosterFrozenV146=true;
    lesson.groupRosterFrozenAtV146=new Date().toISOString();

    // Before start, an occurrence may have been materialized earlier. Rebuild the
    // main attendance map from the actual ACTIVE group composition at the moment of start.
    const previous=lesson.attendance||{};
    const next={};
    ids.forEach(function(id){next[id]=!!previous[id];});
    lesson.attendance=next;
    return ids;
  }

  function rosterIds(lesson){
    ensureHistoricalSnapshot(lesson);
    if(lesson && lesson.groupRosterFrozenV146 && Array.isArray(lesson.groupChildIdsV146)){
      return uniqueIds(lesson.groupChildIdsV146);
    }
    return uniqueIds(currentRoster(lesson).map(function(c){return c.id;}));
  }
  window.lessonRosterIdsV146=rosterIds;

  const startBeforeV146=window.startLesson;
  window.startLesson=function(){
    const lesson=byId(state.lessons,state.selectedLesson);
    if(lesson && !lesson.started) freezeRoster(lesson);
    return typeof startBeforeV146==='function' ? startBeforeV146.apply(this,arguments) : undefined;
  };

  // Older renderers call groupChildren() directly. While rendering a frozen lesson,
  // temporarily make the group's live membership look like the saved roster, then
  // restore every child/enrollment immediately afterwards.
  function withFrozenRoster(lesson,fn){
    if(!lesson || !lesson.groupRosterFrozenV146 || !Array.isArray(lesson.groupChildIdsV146)) return fn();
    const group=byId(state.groups,lesson.groupId);
    if(!group) return fn();
    const wanted=new Set(rosterIds(lesson));
    const restores=[];

    (state.children||[]).forEach(function(child){
      const shouldBe=wanted.has(Number(child.id));
      const matching=(child.enrollments||[]).filter(function(e){return e.direction===group.direction;});
      const inGroup=matching.some(function(e){return Number(e.groupId)===Number(group.id);});

      if(shouldBe){
        const oldStatus=child.status;
        if(child.status!=='Активный' && child.status!=='Лид'){
          child.status='Активный';
          restores.push(function(){child.status=oldStatus;});
        }
        let enrollment=matching.find(function(e){return Number(e.groupId)===Number(group.id);}) || matching[0];
        if(enrollment){
          const oldGroupId=enrollment.groupId, oldEnrollStatus=enrollment.status;
          enrollment.groupId=group.id;
          if(enrollment.status && enrollment.status!=='Активный') enrollment.status='Активный';
          restores.push(function(){enrollment.groupId=oldGroupId; enrollment.status=oldEnrollStatus;});
        }else{
          const temp={direction:group.direction,groupId:group.id,individualPrice:null,balance:0,status:'Активный',__v146Temp:true};
          child.enrollments=child.enrollments||[];
          child.enrollments.push(temp);
          restores.push(function(){child.enrollments=child.enrollments.filter(function(e){return e!==temp;});});
        }
      }else if(inGroup){
        matching.forEach(function(enrollment){
          if(Number(enrollment.groupId)!==Number(group.id)) return;
          const oldGroupId=enrollment.groupId;
          enrollment.groupId=null;
          restores.push(function(){enrollment.groupId=oldGroupId;});
        });
      }
    });

    try{return fn();}
    finally{
      for(let i=restores.length-1;i>=0;i--) restores[i]();
    }
  }

  const teacherLessonBeforeV146=window.teacherLesson;
  if(typeof teacherLessonBeforeV146==='function'){
    window.teacherLesson=function(){
      const lesson=byId(state.lessons,state.selectedLesson);
      return withFrozenRoster(lesson,function(){return teacherLessonBeforeV146();});
    };
  }

  const lessonBeforeV146=window.lesson;
  if(typeof lessonBeforeV146==='function'){
    window.lesson=function(){
      const lesson=byId(state.lessons,state.selectedLesson);
      return withFrozenRoster(lesson,function(){return lessonBeforeV146();});
    };
  }

  // Statistics already uses attendance keys for historical expected attendance.
  // Keep past children counted even if their current global status later becomes
  // Pause/Finished; otherwise old attendance percentages would change retroactively.
  const statsBeforeV146=window.stats;
  if(typeof statsBeforeV146==='function'){
    window.stats=function(){
      const historicalIds=new Set();
      (state.lessons||[]).forEach(function(l){
        if(!l || !l.done || l.cancelled) return;
        rosterIds(l).forEach(function(id){historicalIds.add(id);});
      });
      const restores=[];
      historicalIds.forEach(function(id){
        const child=byId(state.children,id);
        if(child && child.status!=='Активный' && child.status!=='Лид'){
          const old=child.status;
          child.status='Активный';
          restores.push(function(){child.status=old;});
        }
      });
      try{return statsBeforeV146();}
      finally{for(let i=restores.length-1;i>=0;i--) restores[i]();}
    };
  }

  render();
})();

/* ===== Стабилизированный раздел из v147.js ===== */
// iCube CRM v1.1.47 — an added child counts only when extra.present !== false.
(function(){
  function extraPresent(ex){ return !!ex && ex.present!==false; }
  function hasOwn(obj,key){ return Object.prototype.hasOwnProperty.call(obj||{},String(key)) || Object.prototype.hasOwnProperty.call(obj||{},Number(key)); }
  function parseRuDate(s){
    const p=String(s||'').split('.').map(Number);
    return new Date(p[2]||0,(p[1]||1)-1,p[0]||1);
  }
  function lessonDirection(lesson){
    const g=lesson?byId(state.groups,lesson.groupId):null;
    return g?.direction||null;
  }
  function previousPresentVisitInDirection(childId,currentLesson){
    const direction=lessonDirection(currentLesson);
    if(!direction) return false;
    const currentDate=parseRuDate(currentLesson?.date);
    return (state.lessons||[]).some(function(l){
      if(!l || Number(l.id)===Number(currentLesson?.id) || l.cancelled || !l.done) return false;
      if(parseRuDate(l.date)>currentDate) return false;
      const g=byId(state.groups,l.groupId);
      if(!g || g.direction!==direction) return false;
      const main=!!(l.attendance&&l.attendance[childId]);
      const extra=(l.extras||[]).some(function(ex){
        return Number(ex.childId)===Number(childId) && extraPresent(ex);
      });
      return main||extra;
    });
  }

  // Old calculations in several layers treat every extra as present. Run those
  // calculations against a temporary present-only view without changing stored history.
  function withPresentExtrasOnly(fn,ctx,args){
    const restored=[];
    (state.lessons||[]).forEach(function(l){
      if(!(l.extras||[]).some(function(ex){return ex.present===false;})) return;
      const old=l.extras;
      l.extras=old.filter(extraPresent);
      restored.push({lesson:l,extras:old});
    });
    try{return fn.apply(ctx,args||[]);}
    finally{restored.forEach(function(x){x.lesson.extras=x.extras;});}
  }

  ['salary','stats','dashboard','child','deleteChildPrompt'].forEach(function(name){
    const old=window[name];
    if(typeof old!=='function') return;
    window[name]=function(){ return withPresentExtrasOnly(old,this,arguments); };
  });

  // Keep the public salary helper correct too, for any later code that calls it directly.
  const salaryCalcBeforeV147=window.salaryCalculation;
  if(typeof salaryCalcBeforeV147==='function'){
    window.salaryCalculation=function(lesson){
      if(!lesson) return salaryCalcBeforeV147(lesson);
      const old=lesson.extras||[];
      lesson.extras=old.filter(extraPresent);
      try{return salaryCalcBeforeV147(lesson);}
      finally{lesson.extras=old;}
    };
  }

  // Direction-specific "first visit" must ignore an extra who was added but marked absent.
  const attendBeforeV147=window.attend;
  if(typeof attendBeforeV147==='function'){
    window.attend=function(id,value){
      const lesson=byId(state.lessons,state.selectedLesson);
      if(lesson && value){
        lesson.trialChildren=lesson.trialChildren||{};
        if(!hasOwn(lesson.trialChildren,id)){
          lesson.trialChildren[id]=!previousPresentVisitInDirection(Number(id),lesson);
        }
      }
      return attendBeforeV147.apply(this,arguments);
    };
  }

  const addExtraBeforeV147=window.addExtra;
  if(typeof addExtraBeforeV147==='function'){
    window.addExtra=function(id){
      const lesson=byId(state.lessons,state.selectedLesson);
      const desiredTrial=lesson ? !previousPresentVisitInDirection(Number(id),lesson) : null;
      const result=addExtraBeforeV147.apply(this,arguments);
      if(!lesson || desiredTrial==null) return result;
      const ex=(lesson.extras||[]).find(function(x){return Number(x.childId)===Number(id);});
      if(!ex) return result;
      if(typeof ex.present!=='boolean') ex.present=true;
      if(!!ex.trial!==desiredTrial){
        if(typeof window.toggleVisitTrialV121==='function') window.toggleVisitTrialV121(Number(id),desiredTrial,true);
        else ex.trial=desiredTrial;
      }
      return result;
    };
  }

  // Director lesson history keeps absent extras visible, but they must not be shown/count as present.
  const lessonBeforeV147=window.lesson;
  if(typeof lessonBeforeV147==='function'){
    window.lesson=function(){
      const lesson=byId(state.lessons,state.selectedLesson);
      let html=lessonBeforeV147.apply(this,arguments);
      if(!lesson) return html;
      const presentMain=Object.values(lesson.attendance||{}).filter(Boolean).length;
      const presentExtras=(lesson.extras||[]).filter(extraPresent);
      const correctCount=presentMain+presentExtras.length;
      html=html.replace(/(<div class="info-line"><span>Присутствовало<\/span><b>)\d+(<\/b><\/div>)/,'$1'+correctCount+'$2');

      (lesson.extras||[]).filter(function(ex){return ex.present===false;}).forEach(function(ex){
        const child=byId(state.children,ex.childId);
        if(!child) return;
        const needle='<b>'+child.name+'</b>';
        const pos=html.indexOf(needle);
        if(pos<0) return;
        const end=Math.min(html.length,pos+900);
        const part=html.slice(pos,end);
        const changed=part.replace('<span class="badge green">Был</span>','<span class="badge gray">Не был</span>');
        if(changed!==part) html=html.slice(0,pos)+changed+html.slice(end);
      });
      return html;
    };
  }

  window.extraPresentV147=extraPresent;
  render();
})();

/* ===== Стабилизированный раздел из v148.js ===== */
// iCube CRM v1.1.48 — restore contextual trial controls and open calendar events in any month.
(function(){
  function extraPresent(ex){return !!ex && ex.present!==false;}
  function parseRuDate(s){
    const p=String(s||'').split('.').map(Number);
    return new Date(p[2]||0,(p[1]||1)-1,p[0]||1);
  }
  function lessonDirection(lesson){
    const group=lesson?byId(state.groups,lesson.groupId):null;
    return group?.direction||null;
  }
  function hasPreviousPresentVisitInDirection(childId,currentLesson){
    const direction=lessonDirection(currentLesson);
    if(!direction) return false;
    const currentDate=parseRuDate(currentLesson?.date);
    return (state.lessons||[]).some(function(l){
      if(!l || Number(l.id)===Number(currentLesson?.id) || l.cancelled || !l.done) return false;
      if(parseRuDate(l.date)>currentDate) return false;
      const g=byId(state.groups,l.groupId);
      if(!g || g.direction!==direction) return false;
      const main=!!(l.attendance&&l.attendance[childId]);
      const extra=(l.extras||[]).some(function(ex){
        return Number(ex.childId)===Number(childId) && extraPresent(ex);
      });
      return main||extra;
    });
  }

  // v138 intentionally made the trial checkbox easy to reach, but that also made it
  // visible for every main-group child on every unfinished lesson. Restore the intended
  // behaviour: show it only for a potential first visit in this direction, or when the
  // saved visit is already marked as introductory.
  window.studentCheck=function(c,l,extra,e){
    const photo=!!l.photos?.[c.id];
    const ex=extra?(l.extras||[]).find(function(x){return Number(x.childId)===Number(c.id);})||e:null;
    const present=extra?extraPresent(ex):!!l.attendance?.[c.id];
    const trial=extra?!!ex?.trial:!!l.trialChildren?.[c.id];
    const firstInDirection=!hasPreviousPresentVisitInDirection(c.id,l);
    const showTrial=trial||firstInDirection;

    let subtitle='';
    if(extra){
      subtitle=ex?.createdByTeacher || c.createdByTeacher
        ? '<div class="muted mini">добавлен преподавателем</div>'
        : '<div class="muted mini">из другой группы</div>';
    }

    const trialControl=showTrial
      ? '<label class="mini trial-inline" style="display:block;margin-top:5px"><input type="checkbox" '+(trial?'checked':'')+' onchange="toggleVisitTrialV121('+c.id+',this.checked,'+(extra?'true':'false')+')"> Ознакомительное</label>'
      : '';

    const attendanceControl=extra
      ? '<input type="checkbox" '+(present?'checked':'')+' onchange="toggleExtraAttendanceV138('+c.id+',this.checked)">'
      : '<input type="checkbox" '+(present?'checked':'')+' onchange="attend('+c.id+',this.checked)">';

    const remove=extra
      ? '<button class="btn small" title="Убрать с занятия" onclick="removeExtraFromLessonV138('+c.id+')">Убрать</button>'
      : (l.done?'<button class="btn trial-more" title="Дополнительно" onclick="visitTrialOptionsV121('+c.id+',false)">⋯</button>':'');

    return '<div class="student-check">'+attendanceControl+
      '<div><b>'+c.name+'</b>'+subtitle+
      (trial?'<span class="badge amber" style="margin-top:4px">Ознакомительное</span>':'')+
      trialControl+'</div>'+
      '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end">'+
        '<button class="photo '+(photo?'done':'')+'" onclick="togglePhoto('+c.id+')">'+(photo?'Фото ✓':'📷 Фото')+'</button>'+remove+
      '</div></div>';
  };

  function currentTeacherId(){
    if(typeof window.currentPrototypeTeacherId==='function'){
      const id=Number(window.currentPrototypeTeacherId()||0);
      if(id) return id;
    }
    if(state.prototypeTeacherId!=null) return Number(state.prototypeTeacherId);
    const t=(state.teachers||[]).find(function(x){return x.active!==false;})||(state.teachers||[])[0];
    return t?Number(t.id):null;
  }

  // v126 searched for a clicked event only inside the DIRECTOR'S currently visible
  // range. A teacher browsing another month could therefore see an occurrence but fail
  // to open it. Resolve by occurrence key first, and for unmaterialized recurring events
  // query the exact date encoded in that key.
  window.openUnifiedCalendarEvent=function(key,role){
    let lesson=(state.lessons||[]).find(function(l){return l.occurrenceKey===key;})||null;
    if(lesson){
      state.selectedLesson=lesson.id;
      state.page=role==='teacher'?'teacherLesson':'lesson';
      render();
      return;
    }

    const parts=String(key||'').split('|');
    const scheduledDate=parts.length>1?parts.slice(1).join('|'):'';
    const d=parseRuDate(scheduledDate);
    if(!scheduledDate || Number.isNaN(d.getTime())) return;
    const teacherId=role==='teacher'?currentTeacherId():null;
    const event=(typeof window.sharedCalendarEvents==='function'
      ? window.sharedCalendarEvents(d,d,teacherId)
      : []
    ).find(function(e){return e.key===key;});
    if(!event) return;

    lesson=event.lesson;
    if(!lesson && typeof window.materializeEvent==='function') lesson=window.materializeEvent(event);
    if(!lesson) return;
    state.selectedLesson=lesson.id;
    state.page=role==='teacher'?'teacherLesson':'lesson';
    render();
  };

  window.hasPreviousPresentVisitInDirectionV148=hasPreviousPresentVisitInDirection;
  render();
})();

/* ===== Стабилизированный раздел из v149.js ===== */
// iCube CRM v1.1.49 — director reminder for children added by a teacher who still need direction setup.
(function(){
  function esc(s){
    return String(s??'').replace(/[&<>"']/g,function(ch){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
    });
  }
  function extraPresent(ex){ return !!ex && ex.present!==false; }
  function parseRuDate(s){
    const p=String(s||'').split('.').map(Number);
    return new Date(p[2]||0,(p[1]||1)-1,p[0]||1);
  }
  function matchingEnrollment(child,direction){
    return (child?.enrollments||[]).find(function(e){return e.direction===direction;})||null;
  }

  // This is intentionally separate from the paid-visit warning in v137.
  // A trial visit without a direction is valid, but the director should still know
  // that the child's CRM card needs to be completed afterwards.
  function teacherAddedDirectionReminders(){
    const map=new Map();
    (state.lessons||[]).forEach(function(lesson){
      if(!lesson || lesson.cancelled || !lesson.started) return;
      const group=byId(state.groups,lesson.groupId);
      if(!group) return;

      (lesson.extras||[]).forEach(function(ex){
        if(!extraPresent(ex)) return;
        const child=byId(state.children,Number(ex.childId));
        if(!child) return;

        const enrollment=matchingEnrollment(child,group.direction);
        // Existing child with this direction already configured needs no reminder.
        // A teacher-created quick card currently gets a direction placeholder with no
        // group; keep reminding until the director actually assigns/configures it.
        const needsDirection=!enrollment ||
          ((child.createdByTeacher || ex.createdByTeacher || child.needsDirectorReview) && enrollment.groupId==null);
        if(!needsDirection) return;

        const key=Number(child.id)+'|'+group.direction;
        const old=map.get(key);
        const currentStamp=parseRuDate(lesson.date).getTime()*10000+Number(String(lesson.time||'').slice(0,2).replace(/\D/g,'')||0)*100;
        const oldStamp=old?parseRuDate(old.lesson.date).getTime()*10000+Number(String(old.lesson.time||'').slice(0,2).replace(/\D/g,'')||0)*100:-Infinity;
        if(!old || currentStamp>=oldStamp){
          map.set(key,{child:child,group:group,lesson:lesson,extra:ex,enrollment:enrollment});
        }
      });
    });
    return Array.from(map.values());
  }
  window.teacherAddedDirectionRemindersV149=teacherAddedDirectionReminders;

  const dashboardBeforeV149=window.dashboard;
  if(typeof dashboardBeforeV149==='function'){
    window.dashboard=function(){
      const base=dashboardBeforeV149.apply(this,arguments);
      const items=teacherAddedDirectionReminders();
      if(!items.length) return base;

      const rows=items.map(function(item){
        const teacher=byId(state.teachers,item.lesson.teacherId||item.group.teacherId);
        const setupText=item.enrollment
          ? 'Нужно назначить группу и проверить направление «'+esc(item.group.direction)+'».'
          : 'Нужно добавить направление «'+esc(item.group.direction)+'» в карточку ребёнка.';
        return '<div class="kpi-line"><div><b>'+esc(item.child.name)+'</b>'+
          '<div class="muted mini">Был на занятии '+esc(item.lesson.date||'')+' · '+esc(item.group.direction)+' · '+esc(item.group.name||'')+'</div>'+
          '<div class="mini" style="margin-top:3px">'+setupText+(teacher?' Добавил: '+esc(teacher.name)+'.':'')+'</div></div>'+
          '<button class="btn soft" onclick="openChild('+item.child.id+')">Открыть карточку</button></div>';
      }).join('');

      const block='<div class="card pad" style="margin-bottom:16px;border-color:#b2ddff;background:#f5fbff">'+
        '<div class="section-title"><div><h2>Нужно оформить направление</h2><div class="muted mini">Преподаватель добавил ребёнка на занятие, но направление в карточке ещё не оформлено полностью</div></div><span class="badge blue">'+items.length+'</span></div>'+rows+'</div>';

      const headEnd=base.indexOf('</div>')+6;
      return headEnd>5?base.slice(0,headEnd)+block+base.slice(headEnd):block+base;
    };
  }

  render();
})();

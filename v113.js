
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
    return state.children.flatMap(function(c){
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

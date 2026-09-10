
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

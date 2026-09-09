
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

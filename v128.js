
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

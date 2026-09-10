
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

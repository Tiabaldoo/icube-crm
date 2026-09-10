
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

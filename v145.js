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
  if(state.calendarCursor==='2026-09-10' || !state.calendarCursor) state.calendarCursor=actualIso;
  if(state.teacherCalendarCursor==='2026-09-10') state.teacherCalendarCursor=actualIso;

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

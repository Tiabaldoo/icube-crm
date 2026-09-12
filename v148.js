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

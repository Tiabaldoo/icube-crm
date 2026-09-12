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

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

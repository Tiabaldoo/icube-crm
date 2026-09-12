// iCube CRM v1.1.38 — extra students can be absent/removed; distinguish teacher-created children.
(function(){
  function extraFor(lesson,childId){
    return (lesson?.extras||[]).find(function(e){return Number(e.childId)===Number(childId);})||null;
  }

  function extraPresent(ex){
    return ex ? ex.present!==false : false;
  }

  function isMainTrial(lesson,childId){
    return !!(lesson?.trialChildren&&lesson.trialChildren[childId]);
  }

  function recalcSummaryV138(lesson){
    if(!lesson) return;
    const presentMain=Object.entries(lesson.attendance||{}).filter(function(x){return !!x[1];});
    const presentExtras=(lesson.extras||[]).filter(extraPresent);
    const mainTrials=presentMain.filter(function(x){return isMainTrial(lesson,Number(x[0]));}).length;
    const extraTrials=presentExtras.filter(function(e){return !!e.trial;}).length;
    const missing=presentMain.filter(function(x){return !lesson.photos?.[x[0]];}).length+
      presentExtras.filter(function(e){return !lesson.photos?.[e.childId];}).length;
    lesson.summary={present:presentMain.length+presentExtras.length,trials:mainTrials+extraTrials,missing:missing};
  }

  // Existing extras predate the explicit attendance flag and are considered present.
  (state.lessons||[]).forEach(function(l){
    (l.extras||[]).forEach(function(ex){
      if(typeof ex.present!=='boolean') ex.present=true;
    });
  });

  // Newly added children start as present, but can now be unchecked without removing them.
  const addExtraBeforeV138=window.addExtra;
  if(typeof addExtraBeforeV138==='function'){
    window.addExtra=function(id){
      const result=addExtraBeforeV138(Number(id));
      const lesson=byId(state.lessons,state.selectedLesson);
      const ex=extraFor(lesson,id);
      if(ex && typeof ex.present!=='boolean') ex.present=true;
      recalcSummaryV138(lesson);
      return result;
    };
  }

  const saveQuickBeforeV138=window.saveTeacherQuickChildV121;
  if(typeof saveQuickBeforeV138==='function'){
    window.saveTeacherQuickChildV121=function(){
      const result=saveQuickBeforeV138();
      const lesson=byId(state.lessons,state.selectedLesson);
      (lesson?.extras||[]).forEach(function(ex){if(typeof ex.present!=='boolean') ex.present=true;});
      recalcSummaryV138(lesson);
      return result;
    };
  }

  window.toggleExtraAttendanceV138=function(childId,checked){
    const lesson=byId(state.lessons,state.selectedLesson);
    const ex=extraFor(lesson,childId);
    if(!lesson||!ex) return;
    ex.present=!!checked;
    recalcSummaryV138(lesson);
    render();
  };

  window.removeExtraFromLessonV138=function(childId){
    const lesson=byId(state.lessons,state.selectedLesson);
    const child=byId(state.children,childId);
    if(!lesson||!child) return;
    const ex=extraFor(lesson,childId);
    if(!ex) return;

    // If a completed paid visit is removed, reuse the existing visit deletion flow so money is corrected safely.
    if(lesson.done && lesson.attendanceApplied && ex.present!==false && typeof window.deleteVisitPrompt==='function'){
      window.deleteVisitPrompt(Number(childId),Number(lesson.id));
      return;
    }

    lesson.extras=(lesson.extras||[]).filter(function(e){return Number(e.childId)!==Number(childId);});
    if(lesson.photos) delete lesson.photos[childId];
    recalcSummaryV138(lesson);
    render();
  };

  // Clearer layout for the teacher: attendance checkbox on the left, identity/status in the middle,
  // photo + remove action on the right.
  window.studentCheck=function(c,l,extra,e){
    const photo=!!l.photos?.[c.id];
    const ex=extra?extraFor(l,c.id):null;
    const present=extra?extraPresent(ex):!!l.attendance?.[c.id];
    const trial=extra?!!ex?.trial:!!l.trialChildren?.[c.id];

    let subtitle='';
    if(extra){
      subtitle=ex?.createdByTeacher || c.createdByTeacher
        ? '<div class="muted mini">добавлен преподавателем</div>'
        : '<div class="muted mini">из другой группы</div>';
    }

    const trialControl=extra
      ? '<label class="mini trial-inline" style="display:block;margin-top:5px"><input type="checkbox" '+(trial?'checked':'')+' onchange="toggleVisitTrialV121('+c.id+',this.checked,true)"> Ознакомительное</label>'
      : ((trial || !(l.done))
          ? '<label class="mini trial-inline" style="display:block;margin-top:5px"><input type="checkbox" '+(trial?'checked':'')+' onchange="toggleVisitTrialV121('+c.id+',this.checked,false)"> Ознакомительное</label>'
          : '');

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

  // Older finish logic treats every extra as present. Temporarily pass only checked extras to it.
  const finishBeforeV138=window.finishLesson;
  if(typeof finishBeforeV138==='function'){
    window.finishLesson=function(){
      const lesson=byId(state.lessons,state.selectedLesson);
      if(!lesson) return finishBeforeV138();
      const all=lesson.extras||[];
      const absent=all.filter(function(ex){return ex.present===false;});
      if(!absent.length) return finishBeforeV138();
      lesson.extras=all.filter(extraPresent);
      try{return finishBeforeV138();}
      finally{lesson.extras=all;}
    };
  }

  const confirmBeforeV138=window.confirmFinish;
  if(typeof confirmBeforeV138==='function'){
    window.confirmFinish=function(){
      const lesson=byId(state.lessons,state.selectedLesson);
      if(!lesson) return confirmBeforeV138();
      const all=lesson.extras||[];
      const present=all.filter(extraPresent);
      lesson.extras=present;
      try{
        const result=confirmBeforeV138();
        return result;
      }finally{
        lesson.extras=all;
        recalcSummaryV138(lesson);
      }
    };
  }

  // Dashboard warning about missing directions should only consider children who actually attended.
  if(typeof window.missingDirectionIssuesV137==='function'){
    const issuesBefore=window.missingDirectionIssuesV137;
    window.missingDirectionIssuesV138=function(){
      return issuesBefore().filter(function(item){
        const ex=extraFor(item.lesson,item.child.id);
        return !ex || ex.present!==false;
      });
    };
  }

  render();
})();

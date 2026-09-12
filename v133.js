// iCube CRM v1.1.33 — trial visits are tracked separately per direction.
(function(){
  function hasOwn(obj,key){
    return Object.prototype.hasOwnProperty.call(obj||{},String(key)) ||
      Object.prototype.hasOwnProperty.call(obj||{},Number(key));
  }

  function parseRuDate(s){
    const p=String(s||'').split('.').map(Number);
    return new Date(p[2]||0,(p[1]||1)-1,p[0]||1);
  }

  function lessonDirection(lesson){
    const group=lesson?byId(state.groups,lesson.groupId):null;
    return group?.direction||null;
  }

  function hasPreviousVisitInDirection(childId,currentLesson){
    const direction=lessonDirection(currentLesson);
    if(!direction) return false;
    const currentDate=parseRuDate(currentLesson?.date);

    return (state.lessons||[]).some(function(l){
      if(!l || Number(l.id)===Number(currentLesson?.id) || l.cancelled || !l.done) return false;
      if(parseRuDate(l.date)>currentDate) return false;

      const previousGroup=byId(state.groups,l.groupId);
      if(!previousGroup || previousGroup.direction!==direction) return false;

      const main=!!(l.attendance&&l.attendance[childId]);
      const extra=(l.extras||[]).some(function(e){
        return Number(e.childId)===Number(childId);
      });
      return main||extra;
    });
  }

  function ensureDirectionTrialDecision(lesson,childId){
    lesson.trialChildren=lesson.trialChildren||{};
    if(!hasOwn(lesson.trialChildren,childId)){
      lesson.trialChildren[childId]=!hasPreviousVisitInDirection(childId,lesson);
    }
    return !!lesson.trialChildren[childId];
  }

  function isMainTrial(lesson,childId){
    return !!(lesson?.trialChildren&&lesson.trialChildren[childId]);
  }

  // Existing child added from another group: first visit is trial only if
  // there was no earlier completed visit in THIS direction.
  const addExtraBeforeV133=window.addExtra;
  window.addExtra=function(id){
    const lesson=byId(state.lessons,state.selectedLesson);
    if(!lesson) return addExtraBeforeV133(id);
    const shouldTrial=!hasPreviousVisitInDirection(Number(id),lesson);

    addExtraBeforeV133(id);

    const ex=(lesson.extras||[]).find(function(e){
      return Number(e.childId)===Number(id);
    });
    if(ex && !!ex.trial!==shouldTrial && typeof window.toggleVisitTrialV121==='function'){
      // Public v121 toggle also corrects the balance for already completed lessons.
      window.toggleVisitTrialV121(Number(id),shouldTrial,true);
    }
  };

  // Main-group child: show and preselect trial independently for each direction.
  window.studentCheck=function(c,l,extra,e){
    const present=extra?true:!!l.attendance[c.id];
    const photo=!!l.photos[c.id];
    const trial=extra?!!e?.trial:ensureDirectionTrialDecision(l,c.id);
    const showTrial=extra || trial || !hasPreviousVisitInDirection(c.id,l);

    const trialControl=showTrial
      ? '<label class="mini trial-inline" style="display:block;margin-top:5px"><input type="checkbox" '+(trial?'checked':'')+' onchange="toggleVisitTrialV121('+c.id+',this.checked,'+(extra?'true':'false')+')"> Ознакомительное</label>'
      : '';

    const more=l.done
      ? '<button class="btn trial-more" title="Дополнительно" onclick="visitTrialOptionsV121('+c.id+','+(extra?'true':'false')+')">⋯</button>'
      : '';

    return '<div class="student-check">'+
      (extra?'<span>✓</span>':'<input type="checkbox" '+(present?'checked':'')+' onchange="attend('+c.id+',this.checked)">')+
      '<div><b>'+c.name+'</b>'+(extra?'<div class="muted mini">из другой группы</div>':'')+
      (trial?'<span class="badge amber" style="margin-top:4px">Ознакомительное</span>':'')+
      trialControl+'</div>'+
      '<div style="display:flex;gap:6px;align-items:center"><button class="photo '+(photo?'done':'')+'" onclick="togglePhoto('+c.id+')">'+(photo?'Фото ✓':'📷 Фото')+'</button>'+more+'</div>'+
    '</div>';
  };

  // Seed the direction-specific trial decision before the older attendance logic runs.
  const attendBeforeV133=window.attend;
  window.attend=function(id,value){
    const lesson=byId(state.lessons,state.selectedLesson);
    if(lesson && value) ensureDirectionTrialDecision(lesson,Number(id));
    return attendBeforeV133(id,value);
  };

  // Same protection when finishing a lesson without manually touching every checkbox.
  const confirmFinishBeforeV133=window.confirmFinish;
  window.confirmFinish=function(){
    const lesson=byId(state.lessons,state.selectedLesson);
    if(lesson && !lesson.attendanceApplied){
      Object.entries(lesson.attendance||{}).forEach(function(row){
        if(row[1]) ensureDirectionTrialDecision(lesson,Number(row[0]));
      });
    }
    return confirmFinishBeforeV133();
  };

  render();
})();

// iCube CRM v1.1.47 — an added child counts only when extra.present !== false.
(function(){
  function extraPresent(ex){ return !!ex && ex.present!==false; }
  function hasOwn(obj,key){ return Object.prototype.hasOwnProperty.call(obj||{},String(key)) || Object.prototype.hasOwnProperty.call(obj||{},Number(key)); }
  function parseRuDate(s){
    const p=String(s||'').split('.').map(Number);
    return new Date(p[2]||0,(p[1]||1)-1,p[0]||1);
  }
  function lessonDirection(lesson){
    const g=lesson?byId(state.groups,lesson.groupId):null;
    return g?.direction||null;
  }
  function previousPresentVisitInDirection(childId,currentLesson){
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

  // Old calculations in several layers treat every extra as present. Run those
  // calculations against a temporary present-only view without changing stored history.
  function withPresentExtrasOnly(fn,ctx,args){
    const restored=[];
    (state.lessons||[]).forEach(function(l){
      if(!(l.extras||[]).some(function(ex){return ex.present===false;})) return;
      const old=l.extras;
      l.extras=old.filter(extraPresent);
      restored.push({lesson:l,extras:old});
    });
    try{return fn.apply(ctx,args||[]);}
    finally{restored.forEach(function(x){x.lesson.extras=x.extras;});}
  }

  ['salary','stats','dashboard','child','deleteChildPrompt'].forEach(function(name){
    const old=window[name];
    if(typeof old!=='function') return;
    window[name]=function(){ return withPresentExtrasOnly(old,this,arguments); };
  });

  // Keep the public salary helper correct too, for any later code that calls it directly.
  const salaryCalcBeforeV147=window.salaryCalculation;
  if(typeof salaryCalcBeforeV147==='function'){
    window.salaryCalculation=function(lesson){
      if(!lesson) return salaryCalcBeforeV147(lesson);
      const old=lesson.extras||[];
      lesson.extras=old.filter(extraPresent);
      try{return salaryCalcBeforeV147(lesson);}
      finally{lesson.extras=old;}
    };
  }

  // Direction-specific "first visit" must ignore an extra who was added but marked absent.
  const attendBeforeV147=window.attend;
  if(typeof attendBeforeV147==='function'){
    window.attend=function(id,value){
      const lesson=byId(state.lessons,state.selectedLesson);
      if(lesson && value){
        lesson.trialChildren=lesson.trialChildren||{};
        if(!hasOwn(lesson.trialChildren,id)){
          lesson.trialChildren[id]=!previousPresentVisitInDirection(Number(id),lesson);
        }
      }
      return attendBeforeV147.apply(this,arguments);
    };
  }

  const addExtraBeforeV147=window.addExtra;
  if(typeof addExtraBeforeV147==='function'){
    window.addExtra=function(id){
      const lesson=byId(state.lessons,state.selectedLesson);
      const desiredTrial=lesson ? !previousPresentVisitInDirection(Number(id),lesson) : null;
      const result=addExtraBeforeV147.apply(this,arguments);
      if(!lesson || desiredTrial==null) return result;
      const ex=(lesson.extras||[]).find(function(x){return Number(x.childId)===Number(id);});
      if(!ex) return result;
      if(typeof ex.present!=='boolean') ex.present=true;
      if(!!ex.trial!==desiredTrial){
        if(typeof window.toggleVisitTrialV121==='function') window.toggleVisitTrialV121(Number(id),desiredTrial,true);
        else ex.trial=desiredTrial;
      }
      return result;
    };
  }

  // Director lesson history keeps absent extras visible, but they must not be shown/count as present.
  const lessonBeforeV147=window.lesson;
  if(typeof lessonBeforeV147==='function'){
    window.lesson=function(){
      const lesson=byId(state.lessons,state.selectedLesson);
      let html=lessonBeforeV147.apply(this,arguments);
      if(!lesson) return html;
      const presentMain=Object.values(lesson.attendance||{}).filter(Boolean).length;
      const presentExtras=(lesson.extras||[]).filter(extraPresent);
      const correctCount=presentMain+presentExtras.length;
      html=html.replace(/(<div class="info-line"><span>Присутствовало<\/span><b>)\d+(<\/b><\/div>)/,'$1'+correctCount+'$2');

      (lesson.extras||[]).filter(function(ex){return ex.present===false;}).forEach(function(ex){
        const child=byId(state.children,ex.childId);
        if(!child) return;
        const needle='<b>'+child.name+'</b>';
        const pos=html.indexOf(needle);
        if(pos<0) return;
        const end=Math.min(html.length,pos+900);
        const part=html.slice(pos,end);
        const changed=part.replace('<span class="badge green">Был</span>','<span class="badge gray">Не был</span>');
        if(changed!==part) html=html.slice(0,pos)+changed+html.slice(end);
      });
      return html;
    };
  }

  window.extraPresentV147=extraPresent;
  render();
})();


// iCube CRM v1.1.11 — smart trial visits for all children + optional teacher-created phone.
(function(){
  function hasOwn(obj,key){return Object.prototype.hasOwnProperty.call(obj||{},String(key)) || Object.prototype.hasOwnProperty.call(obj||{},Number(key));}

  function parseRuDate(s){
    const p=String(s||'').split('.').map(Number);
    return new Date(p[2]||0,(p[1]||1)-1,p[0]||1);
  }

  function hasPreviousVisit(childId,currentLesson){
    const currentDate=parseRuDate(currentLesson?.date);
    return (state.lessons||[]).some(function(l){
      if(!l || Number(l.id)===Number(currentLesson?.id) || l.cancelled || !l.done) return false;
      // A visit in the future must not prevent today's first visit from being trial.
      if(parseRuDate(l.date)>currentDate) return false;
      const main=!!(l.attendance&&l.attendance[childId]);
      const extra=(l.extras||[]).some(function(e){return Number(e.childId)===Number(childId);});
      return main||extra;
    });
  }

  function ensureMainTrialDecision(lesson,childId){
    lesson.trialChildren=lesson.trialChildren||{};
    if(!hasOwn(lesson.trialChildren,childId) && !hasPreviousVisit(childId,lesson)){
      lesson.trialChildren[childId]=true;
    }
    return !!lesson.trialChildren[childId];
  }

  function isMainTrial(lesson,childId){
    return !!(lesson?.trialChildren&&lesson.trialChildren[childId]);
  }

  function currentEnrollment(child,preferredDirection){
    return (child?.enrollments||[]).find(function(e){return e.direction===preferredDirection;}) ||
      (child?.enrollments||[])[0] || null;
  }

  function historicalPrice(childId,lesson,group){
    if(Number(lesson?.visitPriceSnapshot?.[childId])>0) return Number(lesson.visitPriceSnapshot[childId]);
    const child=byId(state.children,childId);
    const e=(child?.enrollments||[]).find(function(x){return x.direction===group.direction;});
    if(e) return Number(effectivePrice(e)||0);
    const hist=(child?.enrollmentHistory||[]).filter(function(x){return x.direction===group.direction&&Number(x.price)>0;});
    if(hist.length) return Number(hist[hist.length-1].price);
    return group.direction==='Программирование'?Number(state.settings.codePrice||0):Number(state.settings.robotPrice||0);
  }

  function moneyDelta(childId,rubles,preferredDirection){
    const child=byId(state.children,childId);
    const e=currentEnrollment(child,preferredDirection);
    if(!e) return false;
    const price=Number(effectivePrice(e)||0);
    if(!(price>0)) return false;
    e.balance=Number(e.balance||0)+Number(rubles||0)/price;
    return true;
  }

  function updateSummary(lesson){
    if(!lesson?.summary) return;
    const present=Object.values(lesson.attendance||{}).filter(Boolean).length+(lesson.extras||[]).length;
    const mainTrials=Object.entries(lesson.attendance||{}).filter(function(x){return !!x[1]&&isMainTrial(lesson,x[0]);}).length;
    const extraTrials=(lesson.extras||[]).filter(function(e){return !!e.trial;}).length;
    const missing=Object.entries(lesson.attendance||{}).filter(function(x){return x[1]&&!lesson.photos?.[x[0]];}).length+
      (lesson.extras||[]).filter(function(e){return !lesson.photos?.[e.childId];}).length;
    lesson.summary={present:present,trials:mainTrials+extraTrials,missing:missing};
  }

  // Phone is optional for a child created by a teacher.
  const oldTeacherQuickChildForm=window.teacherQuickChildForm;
  window.teacherQuickChildForm=function(){
    const lesson=byId(state.lessons,state.selectedLesson);
    const group=lesson?byId(state.groups,lesson.groupId):null;
    if(!lesson||!group) return;
    let html='<h3>Новый ребёнок на занятии</h3>';
    html+='<div class="notice">Создайте минимальную карточку. Ребёнок сразу появится в CRM и будет отмечен на этом занятии как <b>ознакомительный</b>. Директор позже дополнит данные.</div>';
    html+='<div class="form-grid" style="margin-top:14px">';
    html+='<div class="field span-2"><label>Фамилия Имя</label><input class="input" id="tqc-name" placeholder="Иванов Иван"></div>';
    html+='<div class="field span-2"><label>Телефон родителя <span class="muted" style="font-weight:400">(необязательно)</span></label><input class="input" id="tqc-phone" placeholder="+7 900 000-00-00"></div>';
    html+='</div>';
    html+='<div class="muted mini" style="margin-top:10px">Направление будет указано автоматически: '+group.direction+'. В основную группу ребёнок пока не зачисляется.</div>';
    html+='<div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn primary" onclick="saveTeacherQuickChildV121()">Создать и отметить</button></div>';
    modal(html);
  };

  window.saveTeacherQuickChildV121=function(){
    const lesson=byId(state.lessons,state.selectedLesson);
    const group=lesson?byId(state.groups,lesson.groupId):null;
    if(!lesson||!group) return;
    const name=document.querySelector('#tqc-name')?.value.trim()||'';
    const phone=document.querySelector('#tqc-phone')?.value.trim()||'';
    if(!name){alert('Укажите фамилию и имя ребёнка.');return;}

    const id=(state.children||[]).length?Math.max.apply(null,state.children.map(function(c){return Number(c.id)||0;}))+1:1;
    const teacherId=(typeof window.currentPrototypeTeacherId==='function'?Number(window.currentPrototypeTeacherId()||0):0) || Number(lesson.teacherId||group.teacherId||0);
    state.children.push({
      id:id,name:name,birth:'',school:'',grade:'',shift:'',parent:'',phone:phone,status:'Лид',note:'',
      enrollments:[{direction:group.direction,groupId:null,individualPrice:null,balance:0}],
      needsDirectorReview:true,createdByTeacher:true,createdByTeacherId:teacherId||null,
      createdFromLessonId:lesson.id,createdAt:new Date().toISOString()
    });
    lesson.extras=lesson.extras||[];
    lesson.extras.push({childId:id,trial:true,createdByTeacher:true});
    lesson.photos=lesson.photos||{};
    updateSummary(lesson);
    state.modal=null;
    render();
  };

  // Existing child from another group: default to trial only if this is their first actual visit.
  window.addExtra=function(id){
    const lesson=byId(state.lessons,state.selectedLesson);
    const group=lesson?byId(state.groups,lesson.groupId):null;
    const child=byId(state.children,id);
    if(!lesson||!group||!child) return;
    lesson.extras=lesson.extras||[];
    if(lesson.extras.some(function(e){return Number(e.childId)===Number(id);})) return;

    const trial=!hasPreviousVisit(id,lesson);
    const extra={childId:Number(id),trial:trial};
    lesson.extras.push(extra);

    if(lesson.done&&lesson.attendanceApplied&&!trial){
      const price=historicalPrice(id,lesson,group);
      lesson.visitPriceSnapshot=lesson.visitPriceSnapshot||{};
      lesson.visitPriceSnapshot[id]=price;
      moneyDelta(id,-price,group.direction);
    }
    updateSummary(lesson);
    render();
  };

  // Main-group children get an automatic trial checkbox only for their first visit.
  window.studentCheck=function(c,l,extra,e){
    const present=extra?true:!!l.attendance[c.id];
    const photo=!!l.photos[c.id];
    let trial=extra?!!e?.trial:ensureMainTrialDecision(l,c.id);
    const showTrial=extra || trial || !hasPreviousVisit(c.id,l);

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

  function setTrialState(childId,checked,isExtra){
    const lesson=byId(state.lessons,state.selectedLesson);
    const group=lesson?byId(state.groups,lesson.groupId):null;
    if(!lesson||!group) return;

    let old=false;
    if(isExtra){
      const ex=(lesson.extras||[]).find(function(e){return Number(e.childId)===Number(childId);});
      if(!ex) return;
      old=!!ex.trial;
      if(old===!!checked) return;
      ex.trial=!!checked;
    }else{
      lesson.trialChildren=lesson.trialChildren||{};
      old=!!lesson.trialChildren[childId];
      if(old===!!checked && hasOwn(lesson.trialChildren,childId)) return;
      lesson.trialChildren[childId]=!!checked;
    }

    const isPresent=isExtra || !!lesson.attendance?.[childId];
    if(lesson.done&&lesson.attendanceApplied&&isPresent){
      const price=historicalPrice(childId,lesson,group);
      lesson.visitPriceSnapshot=lesson.visitPriceSnapshot||{};
      if(!lesson.visitPriceSnapshot[childId]) lesson.visitPriceSnapshot[childId]=price;
      if(!old&&checked) moneyDelta(childId,price,group.direction); // paid -> trial: refund
      if(old&&!checked) moneyDelta(childId,-price,group.direction); // trial -> paid: charge
    }
    updateSummary(lesson);
  }

  window.toggleVisitTrialV121=function(childId,checked,isExtra){
    setTrialState(Number(childId),!!checked,!!isExtra);
    render();
  };

  window.visitTrialOptionsV121=function(childId,isExtra){
    const lesson=byId(state.lessons,state.selectedLesson);
    if(!lesson) return;
    const ex=isExtra?(lesson.extras||[]).find(function(e){return Number(e.childId)===Number(childId);}):null;
    const current=isExtra?!!ex?.trial:isMainTrial(lesson,childId);
    const child=byId(state.children,childId);
    modal('<h3>Тип посещения</h3><div class="info-line"><span>Ребёнок</span><b>'+(child?.name||'—')+'</b></div>'+
      '<div class="notice" style="margin-top:12px">Можно исправить тип посещения даже после завершения занятия. При переключении CRM автоматически вернёт или спишет стоимость конкретного занятия. На зарплату преподавателя это не влияет: присутствующий ребёнок учитывается как обычно.</div>'+
      '<div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn primary" onclick="forceVisitTrialV121('+childId+','+(!current)+','+(isExtra?'true':'false')+')">'+(current?'Сделать обычным':'Сделать ознакомительным')+'</button></div>');
  };

  window.forceVisitTrialV121=function(childId,checked,isExtra){
    setTrialState(Number(childId),!!checked,!!isExtra);
    state.modal=null;
    render();
  };

  // Retroactive attendance in an already completed lesson respects automatic trial status.
  window.attend=function(id,value){
    const lesson=byId(state.lessons,state.selectedLesson);
    const group=lesson?byId(state.groups,lesson.groupId):null;
    if(!lesson||!group) return;
    lesson.attendance=lesson.attendance||{};
    const old=!!lesson.attendance[id];
    if(old===!!value){render();return;}

    if(value) ensureMainTrialDecision(lesson,id);
    const trial=isMainTrial(lesson,id);

    if(lesson.done&&lesson.attendanceApplied&&!trial){
      const price=historicalPrice(id,lesson,group);
      lesson.visitPriceSnapshot=lesson.visitPriceSnapshot||{};
      if(value){
        lesson.visitPriceSnapshot[id]=price;
        moneyDelta(id,-price,group.direction);
      }else{
        moneyDelta(id,price,group.direction);
      }
    }
    lesson.attendance[id]=!!value;
    updateSummary(lesson);
    render();
  };

  // Prevent main-group trial children from being charged when finishing a lesson.
  const confirmFinishBeforeV121=window.confirmFinish;
  window.confirmFinish=function(){
    const lesson=byId(state.lessons,state.selectedLesson);
    if(!lesson || lesson.attendanceApplied) return confirmFinishBeforeV121();

    lesson.trialChildren=lesson.trialChildren||{};
    Object.entries(lesson.attendance||{}).filter(function(x){return !!x[1];}).forEach(function(x){
      ensureMainTrialDecision(lesson,Number(x[0]));
    });

    const hidden=[];
    Object.entries(lesson.attendance||{}).forEach(function(x){
      const id=Number(x[0]);
      if(x[1]&&isMainTrial(lesson,id)){
        hidden.push(id);
        lesson.attendance[id]=false;
      }
    });

    const result=confirmFinishBeforeV121();

    hidden.forEach(function(id){lesson.attendance[id]=true;});
    updateSummary(lesson);
    render();
    return result;
  };

  // Deleting a trial visit must not restore money because nothing was charged.
  window.deleteVisitPrompt=function(childId,lessonId){
    const child=byId(state.children,childId);
    const lesson=byId(state.lessons,lessonId);
    const group=lesson?byId(state.groups,lesson.groupId):null;
    if(!child||!lesson||!group) return;
    const extra=(lesson.extras||[]).find(function(e){return Number(e.childId)===Number(childId);});
    const trial=extra?!!extra.trial:isMainTrial(lesson,childId);
    const charged=!!lesson.attendanceApplied&&!trial;
    const price=charged?historicalPrice(childId,lesson,group):0;
    let note='Посещение '+lesson.date+' · '+group.direction+' будет удалено.';
    if(trial) note+=' Оно ознакомительное, поэтому баланс не изменится.';
    else if(charged) note+=' За него было списано <b>'+money(price)+'</b>; эта сумма вернётся в текущий денежный остаток ребёнка.';
    else note+=' Списание ещё не применялось, поэтому баланс не изменится.';
    modal('<h3>Удалить посещение?</h3><div class="notice">'+note+'</div><div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn danger" onclick="confirmDeleteVisitV121('+childId+','+lessonId+')">Удалить посещение</button></div>');
  };

  window.confirmDeleteVisitV121=function(childId,lessonId){
    const lesson=byId(state.lessons,lessonId);
    const group=lesson?byId(state.groups,lesson.groupId):null;
    if(!lesson||!group) return;
    const extra=(lesson.extras||[]).find(function(e){return Number(e.childId)===Number(childId);});
    const trial=extra?!!extra.trial:isMainTrial(lesson,childId);
    if(lesson.attendanceApplied&&!trial){
      const price=historicalPrice(childId,lesson,group);
      if(price>0) moneyDelta(childId,price,group.direction);
    }
    if(extra) lesson.extras=(lesson.extras||[]).filter(function(e){return Number(e.childId)!==Number(childId);});
    else if(lesson.attendance) lesson.attendance[childId]=false;
    if(lesson.photos) delete lesson.photos[childId];
    updateSummary(lesson);
    state.modal=null;state.childTab='visits';state.page='child';render();
  };

  // Show trial status in the child's visit history without rebuilding the whole child screen.
  const childBeforeV121=window.child;
  window.child=function(){
    let html=childBeforeV121();
    const child=byId(state.children,state.selectedChild);
    if(!child) return html;
    (state.lessons||[]).forEach(function(l){
      if(!l.done||l.cancelled) return;
      const ex=(l.extras||[]).find(function(e){return Number(e.childId)===Number(child.id);});
      const present=!!l.attendance?.[child.id]||!!ex;
      const trial=ex?!!ex.trial:isMainTrial(l,child.id);
      if(!present||!trial) return;
      // Existing extra rows already carry this badge; this adds it to main-group trial rows.
      if(!ex){
        const g=byId(state.groups,l.groupId);
        if(!g) return;
        const needle='<div><span class="badge green">Был</span></div><div></div>';
        const replacement='<div><span class="badge green">Был</span></div><div><span class="badge amber">Ознакомительное</span></div>';
        html=html.replace(needle,replacement);
      }
    });
    return html;
  };

  render();
})();

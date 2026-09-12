// iCube CRM v1.1.37 — paid visits may only affect the matching direction.
(function(){
  function esc(s){
    return String(s??'').replace(/[&<>"']/g,function(ch){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
    });
  }

  function context(){
    const lesson=byId(state.lessons,state.selectedLesson);
    const group=lesson?byId(state.groups,lesson.groupId):null;
    return {lesson:lesson,group:group};
  }

  function hasDirection(child,direction){
    return !!(child?.enrollments||[]).some(function(e){return e.direction===direction;});
  }

  function isMainTrial(lesson,childId){
    return !!(lesson?.trialChildren&&lesson.trialChildren[childId]);
  }

  function isExtraTrial(lesson,childId){
    const ex=(lesson?.extras||[]).find(function(e){return Number(e.childId)===Number(childId);});
    return !!ex?.trial;
  }

  function extraPresent(ex){ return !!ex && ex.present!==false; }

  function recalcSummary(lesson){
    if(!lesson?.summary) return;
    const presentMain=Object.entries(lesson.attendance||{}).filter(function(x){return !!x[1];});
    const extras=(lesson.extras||[]).filter(extraPresent);
    const mainTrials=presentMain.filter(function(x){return isMainTrial(lesson,Number(x[0]));}).length;
    const extraTrials=extras.filter(function(e){return !!e.trial;}).length;
    const missingPhotos=presentMain.filter(function(x){return !lesson.photos?.[x[0]];}).length+
      extras.filter(function(e){return !lesson.photos?.[e.childId];}).length;
    lesson.summary={present:presentMain.length+extras.length,trials:mainTrials+extraTrials,missing:missingPhotos};
  }

  function showNoDirectionMessage(child,direction){
    modal('<h3>Нельзя сделать посещение обычным</h3>'+
      '<div class="notice"><b>'+esc(child?.name||'Ребёнок')+'</b>: в карточке нет направления <b>«'+esc(direction)+'»</b>.<br><br>'+
      'Платное посещение можно списывать только с того же направления, что и занятие. Добавьте ребёнку направление «'+esc(direction)+'» или оставьте это посещение ознакомительным.</div>'+
      '<div class="modal-actions"><button class="btn primary" onclick="closeModal()">Понятно</button></div>');
  }

  function missingPaidVisits(lesson){
    const group=lesson?byId(state.groups,lesson.groupId):null;
    if(!lesson||!group) return [];
    const bad=[];

    Object.entries(lesson.attendance||{}).forEach(function(row){
      const childId=Number(row[0]);
      if(!row[1]||isMainTrial(lesson,childId)) return;
      const child=byId(state.children,childId);
      if(child&&!hasDirection(child,group.direction)) bad.push({child:child,isExtra:false});
    });

    (lesson.extras||[]).forEach(function(ex){
      if(!extraPresent(ex) || ex.trial) return;
      const child=byId(state.children,ex.childId);
      if(child&&!hasDirection(child,group.direction)) bad.push({child:child,isExtra:true});
    });
    return bad;
  }

  // The older v121 helper had a fallback to the child's first enrollment.
  // Guard every public route that can turn a visit into a paid one.
  const toggleBeforeV137=window.toggleVisitTrialV121;
  if(typeof toggleBeforeV137==='function'){
    window.toggleVisitTrialV121=function(childId,checked,isExtra){
      const ctx=context();
      const child=byId(state.children,Number(childId));
      if(ctx.group&&child&&!checked&&!hasDirection(child,ctx.group.direction)){
        showNoDirectionMessage(child,ctx.group.direction);
        return;
      }
      return toggleBeforeV137(Number(childId),!!checked,!!isExtra);
    };
  }

  const forceBeforeV137=window.forceVisitTrialV121;
  if(typeof forceBeforeV137==='function'){
    window.forceVisitTrialV121=function(childId,checked,isExtra){
      const ctx=context();
      const child=byId(state.children,Number(childId));
      if(ctx.group&&child&&!checked&&!hasDirection(child,ctx.group.direction)){
        showNoDirectionMessage(child,ctx.group.direction);
        return;
      }
      return forceBeforeV137(Number(childId),!!checked,!!isExtra);
    };
  }

  // An existing child added to another direction without that enrollment is always trial.
  // This also avoids the old post-completion balance fallback.
  const addExtraBeforeV137=window.addExtra;
  if(typeof addExtraBeforeV137==='function'){
    window.addExtra=function(id){
      const ctx=context();
      const child=byId(state.children,Number(id));
      if(ctx.lesson&&ctx.group&&child&&!hasDirection(child,ctx.group.direction)&&ctx.lesson.done){
        ctx.lesson.extras=ctx.lesson.extras||[];
        if(!ctx.lesson.extras.some(function(e){return Number(e.childId)===Number(id);})){
          ctx.lesson.extras.push({childId:Number(id),trial:true,present:true});
        }
        recalcSummary(ctx.lesson);
        render();
        return;
      }

      const result=addExtraBeforeV137(Number(id));
      if(ctx.lesson&&ctx.group&&child&&!hasDirection(child,ctx.group.direction)){
        const ex=(ctx.lesson.extras||[]).find(function(e){return Number(e.childId)===Number(id);});
        if(ex) ex.trial=true;
        recalcSummary(ctx.lesson);
        render();
      }
      return result;
    };
  }

  // Retroactive attendance edits must never credit/debit another direction either.
  const attendBeforeV137=window.attend;
  if(typeof attendBeforeV137==='function'){
    window.attend=function(id,value){
      const ctx=context();
      const child=byId(state.children,Number(id));
      if(ctx.lesson&&ctx.group&&child&&!hasDirection(child,ctx.group.direction)){
        ctx.lesson.trialChildren=ctx.lesson.trialChildren||{};
        ctx.lesson.trialChildren[id]=true;
      }
      return attendBeforeV137(Number(id),!!value);
    };
  }

  // Final safety check before applying balances.
  const confirmFinishBeforeV137=window.confirmFinish;
  if(typeof confirmFinishBeforeV137==='function'){
    window.confirmFinish=function(){
      const lesson=byId(state.lessons,state.selectedLesson);
      if(lesson&&!lesson.attendanceApplied){
        const bad=missingPaidVisits(lesson);
        if(bad.length){
          const group=byId(state.groups,lesson.groupId);
          const names=bad.map(function(x){return '<b>'+esc(x.child.name)+'</b>';}).join(', ');
          modal('<h3>Не хватает направления</h3>'+
            '<div class="notice">'+names+' '+(bad.length===1?'отмечен':'отмечены')+' как обычное посещение, но в карточке нет направления <b>«'+esc(group?.direction||'')+'»</b>.<br><br>'+
            'Баланс другого направления списан не будет. Добавьте нужное направление или сделайте это посещение ознакомительным.</div>'+
            '<div class="modal-actions"><button class="btn" onclick="closeModal()">Вернуться</button><button class="btn primary" onclick="markMissingDirectionVisitsTrialV137()">Сделать ознакомительными</button></div>');
          return;
        }
      }
      return confirmFinishBeforeV137();
    };
  }

  window.markMissingDirectionVisitsTrialV137=function(){
    const lesson=byId(state.lessons,state.selectedLesson);
    if(!lesson) return;
    const bad=missingPaidVisits(lesson);
    bad.forEach(function(x){
      if(x.isExtra){
        const ex=(lesson.extras||[]).find(function(e){return Number(e.childId)===Number(x.child.id);});
        if(ex) ex.trial=true;
      }else{
        lesson.trialChildren=lesson.trialChildren||{};
        lesson.trialChildren[x.child.id]=true;
      }
    });
    recalcSummary(lesson);
    state.modal=null;
    render();
  };

  // Director warning is only for an actually PRESENT, non-trial (= paid) visit.
  // No direction + introductory visit is a valid scenario and must not create a warning.
  function directionIssues(){
    const map=new Map();
    (state.lessons||[]).forEach(function(lesson){
      if(!lesson||lesson.cancelled||!lesson.done) return;
      const group=byId(state.groups,lesson.groupId);
      if(!group) return;
      const ids=[];
      Object.entries(lesson.attendance||{}).forEach(function(row){
        const childId=Number(row[0]);
        if(row[1] && !isMainTrial(lesson,childId)) ids.push(childId);
      });
      (lesson.extras||[]).forEach(function(ex){
        if(extraPresent(ex) && !ex.trial) ids.push(Number(ex.childId));
      });
      ids.forEach(function(childId){
        const child=byId(state.children,childId);
        if(!child||hasDirection(child,group.direction)) return;
        const key=childId+'|'+group.direction;
        const old=map.get(key);
        if(!old || String(lesson.date||'')>String(old.lesson.date||'')) map.set(key,{child:child,group:group,lesson:lesson});
      });
    });
    return Array.from(map.values());
  }

  // Director dashboard: same idea as the existing teacher-created-child review queue.
  const dashboardBeforeV137=window.dashboard||dashboard;
  window.dashboard=function(){
    const base=dashboardBeforeV137();
    const issues=directionIssues();
    if(!issues.length) return base;

    const rows=issues.map(function(item){
      return '<div class="kpi-line"><div><b>'+esc(item.child.name)+'</b>'+
        '<div class="muted mini">Был на занятии '+esc(item.lesson.date||'')+' · '+esc(item.group.direction)+' · '+esc(item.group.name||'')+'</div>'+
        '<div class="mini" style="margin-top:3px">Добавьте направление «'+esc(item.group.direction)+'» в карточку ребёнка.</div></div>'+
        '<button class="btn soft" onclick="openChild('+item.child.id+')">Открыть карточку</button></div>';
    }).join('');

    const block='<div class="card pad" style="margin-bottom:16px;border-color:#fedf89;background:#fffdf5">'+
      '<div class="section-title"><div><h2>Нужно добавить направление</h2><div class="muted mini">Дети были на платных посещениях направления, которого пока нет в их карточке</div></div><span class="badge amber">'+issues.length+'</span></div>'+rows+'</div>';

    const headEnd=base.indexOf('</div>')+6;
    return headEnd>5?base.slice(0,headEnd)+block+base.slice(headEnd):block+base;
  };

  // Also explain the issue directly in the child's card after the director opens it.
  const childBeforeV137=window.child||child;
  window.child=function(){
    let html=childBeforeV137();
    const selected=byId(state.children,state.selectedChild);
    if(!selected) return html;
    const issues=directionIssues().filter(function(x){return Number(x.child.id)===Number(selected.id);});
    if(!issues.length) return html;
    const dirs=Array.from(new Set(issues.map(function(x){return x.group.direction;})));
    const banner='<div class="notice" style="margin-bottom:16px"><b>Нужно добавить направление</b><div class="mini" style="margin-top:4px">Ребёнок уже был на обычном платном занятии: '+dirs.map(esc).join(', ')+', но этого направления нет в карточке. Используйте «+ Добавить направление» в блоке направлений.</div></div>';
    const tabsPos=html.indexOf('<div class="tabs">');
    return tabsPos>=0?html.slice(0,tabsPos)+banner+html.slice(tabsPos):banner+html;
  };

  window.missingDirectionIssuesV137=directionIssues;
  render();
})();

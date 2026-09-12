// iCube CRM v1.1.42 — price changes affect future payments only; closed directions can transfer remaining value.
(function(){
  const EPS=1e-7;
  const DIR_STATUSES=['Активный','Пауза','Закончил'];

  function isoToday(){
    const d=new Date();
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  function fmt(n,d){return Number(Number(n||0).toFixed(d==null?4:d));}
  function currentEnrollment(child,direction){
    return (child?.enrollments||[]).find(function(e){return e.direction===direction;})||null;
  }
  function effective(e){return Number(effectivePrice(e)||0);}
  function lotLessons(e){return (e.balanceLotsV142||[]).reduce(function(s,l){return s+Number(l.lessons||0);},0);}
  function lotMoney(e){return (e.balanceLotsV142||[]).reduce(function(s,l){return s+Number(l.lessons||0)*Number(l.price||0);},0);}

  function ensureLots(e){
    if(!e || Array.isArray(e.balanceLotsV142)) return;
    const b=Math.max(0,Number(e.balance||0));
    const p=effective(e);
    e.balanceLotsV142=b>EPS&&p>0?[{lessons:b,price:p,source:'legacy'}]:[];
  }
  function ensureAllLots(){
    (state.children||[]).forEach(function(c){(c.enrollments||[]).forEach(ensureLots);});
  }
  function consumeLots(e,amount){
    let left=Math.max(0,Number(amount||0));
    const lots=e.balanceLotsV142||[];
    while(left>EPS&&lots.length){
      const l=lots[0],q=Number(l.lessons||0);
      const take=Math.min(q,left);
      l.lessons=q-take; left-=take;
      if(Number(l.lessons||0)<=EPS) lots.shift();
    }
  }
  function syncLots(e,preferredPrice){
    if(!e) return;
    ensureLots(e);
    const target=Math.max(0,Number(e.balance||0));
    const have=lotLessons(e);
    if(target<have-EPS){
      consumeLots(e,have-target);
    }else if(target>have+EPS){
      const p=Number(preferredPrice||effective(e)||0);
      if(p>0) e.balanceLotsV142.push({lessons:target-have,price:p,source:'balance-sync'});
    }
  }
  function syncAllLots(){
    (state.children||[]).forEach(function(c){(c.enrollments||[]).forEach(function(e){syncLots(e);});});
  }
  ensureAllLots();

  // Keep the lot ledger in step with the existing balance-changing flows.
  function wrapBalanceMutation(name,priceResolver){
    const old=window[name];
    if(typeof old!=='function') return;
    window[name]=function(){
      ensureAllLots();
      let p=null;
      try{p=typeof priceResolver==='function'?priceResolver.apply(this,arguments):null;}catch(_e){}
      const result=old.apply(this,arguments);
      syncAllLots();
      if(p&&p.enrollment) syncLots(p.enrollment,p.price);
      return result;
    };
  }

  wrapBalanceMutation('savePaymentV116',function(){
    const child=byId(state.children,Number(document.querySelector('#pf-child')?.value));
    const dir=document.querySelector('#pf-dir')?.value;
    const e=currentEnrollment(child,dir);
    return {enrollment:e,price:e?effective(e):null};
  });
  ['confirmDeletePayment','confirmDeleteChildPayment','saveRefundForChild','confirmDeleteVisit','attend','toggleVisitTrialV121','forceVisitTrialV121','confirmFinish','addExtra','removeExtraFromLessonV138'].forEach(function(n){wrapBalanceMutation(n);});

  // Price preview: changing price within the SAME direction no longer converts existing lessons into money.
  const refreshBeforeV142=window.refreshManageDirectionPreview;
  window.refreshManageDirectionPreview=function(){
    const childId=Number(document.querySelector('#md-child-id')?.value);
    const oldDirection=document.querySelector('#md-old-dir')?.value;
    const newDirection=document.querySelector('#md-dir')?.value||oldDirection;
    const child=byId(state.children,childId);
    const e=currentEnrollment(child,oldDirection);
    const box=document.querySelector('#md-preview');
    if(!e||!box) return typeof refreshBeforeV142==='function'?refreshBeforeV142():undefined;
    if(newDirection!==oldDirection) return typeof refreshBeforeV142==='function'?refreshBeforeV142():undefined;

    const rawGroup=document.querySelector('#md-group')?.value;
    const groupId=rawGroup?Number(rawGroup):null;
    const mode=document.querySelector('#md-price-mode')?.value||'standard';
    const packagePrice=Number(document.querySelector('#md-individual-package')?.value||0);
    const draft={direction:oldDirection,groupId:groupId,individualPrice:mode==='individual'?(packagePrice>0?packagePrice/4:0):null};
    const newPrice=effective(draft);
    const oldPrice=effective(e);
    const balance=Number(e.balance||0);

    box.innerHTML='<div class="info-list">'+
      '<div class="info-line"><span>Остаток занятий</span><b>'+fmt(balance,4)+'</b></div>'+
      '<div class="info-line"><span>Текущая цена</span><b>'+money(oldPrice)+' / занятие</b></div>'+
      '<div class="info-line"><span>Новая цена</span><b>'+(newPrice>0?money(newPrice)+' / занятие':'—')+'</b></div>'+
      '<div class="info-line"><span>После изменения</span><b>'+fmt(balance,4)+' занятий</b></div>'+
      '</div>'+
      (Math.abs(newPrice-oldPrice)>EPS?'<div class="notice" style="margin-top:12px">Уже оплаченные занятия <b>не пересчитываются</b>: ребёнок дохаживает текущий остаток. Новая цена применяется только к следующим оплатам.</div>':'<div class="muted mini" style="margin-top:10px">Баланс занятий останется без изменений.</div>');
  };

  // Same-direction save: keep the lesson count exactly as it is. Direction replacement still uses the older migration flow.
  const saveBeforeV142=window.saveManagedDirection;
  window.saveManagedDirection=function(childId,oldDirection){
    const child=byId(state.children,Number(childId));
    const e=currentEnrollment(child,oldDirection);
    const newDirection=document.querySelector('#md-dir')?.value||oldDirection;
    if(!child||!e||newDirection!==oldDirection){
      const result=typeof saveBeforeV142==='function'?saveBeforeV142(childId,oldDirection):undefined;
      ensureAllLots();
      return result;
    }

    ensureLots(e);
    const rawGroup=document.querySelector('#md-group')?.value;
    const groupId=rawGroup?Number(rawGroup):null;
    const mode=document.querySelector('#md-price-mode')?.value||'standard';
    const packagePrice=Number(document.querySelector('#md-individual-package')?.value||0);
    if(mode==='individual'&&!(packagePrice>0)){
      alert('Укажите индивидуальную цену абонемента за 4 занятия.');
      return;
    }
    const previousStatus=e.status||'Активный';
    const nextStatus=document.querySelector('#md-enrollment-status')?.value||previousStatus;
    const keepBalance=Number(e.balance||0);

    e.groupId=groupId;
    e.individualPrice=mode==='individual'?packagePrice/4:null;
    e.balance=keepBalance;
    e.status=DIR_STATUSES.includes(nextStatus)?nextStatus:previousStatus;
    if(previousStatus!==e.status){
      e.statusChangedAt=isoToday();
      e.statusHistory=e.statusHistory||[];
      e.statusHistory.push({from:previousStatus,to:e.status,date:e.statusChangedAt});
    }

    // Bind only unresolved historical payments when a previously groupless direction receives a group.
    const g=groupId!=null?byId(state.groups,groupId):null;
    if(g){
      (state.payments||[]).forEach(function(p){
        if(Number(p.childId)===Number(child.id)&&p.direction===oldDirection&&(p.project==null||p.project==='')){
          p.project=g.project||null; p.groupId=g.id;
        }
      });
    }

    state.modal=null;
    state.childTab='overview';
    state.page='child';
    render();
  };

  function transferTargets(child,source){
    return (child?.enrollments||[]).filter(function(e){return e!==source&&(e.status||'Активный')!=='Закончил';});
  }
  function canTransfer(child,e){
    return !!child&&!!e&&(e.status||'Активный')==='Закончил'&&Number(e.balance||0)>EPS&&transferTargets(child,e).length>0;
  }

  window.transferDirectionBalanceFormV142=function(childId,direction){
    const child=byId(state.children,Number(childId));
    const source=currentEnrollment(child,direction);
    if(!canTransfer(child,source)) return;
    ensureLots(source);
    const targets=transferTargets(child,source);
    const amount=lotMoney(source);
    let html='<h3>Перенести остаток</h3>';
    html+='<div class="notice">Направление <b>«'+direction+'»</b> закрыто. Осталось <b>'+fmt(source.balance,4)+' занятия</b> на сумму <b>'+money(amount)+'</b>.</div>';
    html+='<div class="field" style="margin-top:14px"><label>Перенести на направление</label><select class="select" id="tb-target" onchange="refreshTransferPreviewV142('+child.id+',\''+direction+'\')">';
    targets.forEach(function(e){html+='<option value="'+e.direction+'">'+e.direction+'</option>';});
    html+='</select></div><div id="tb-preview" class="card pad" style="margin-top:14px"></div>';
    html+='<div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn primary" onclick="confirmTransferDirectionBalanceV142('+child.id+',\''+direction+'\')">Перенести остаток</button></div>';
    modal(html);
    setTimeout(function(){refreshTransferPreviewV142(child.id,direction);},0);
  };

  window.refreshTransferPreviewV142=function(childId,direction){
    const child=byId(state.children,Number(childId));
    const source=currentEnrollment(child,direction);
    const target=currentEnrollment(child,document.querySelector('#tb-target')?.value);
    const box=document.querySelector('#tb-preview');
    if(!source||!target||!box) return;
    ensureLots(source); ensureLots(target);
    const amount=lotMoney(source),price=effective(target),lessons=price>0?amount/price:0;
    box.innerHTML='<div class="info-list">'+
      '<div class="info-line"><span>Переносится</span><b>'+money(amount)+'</b></div>'+
      '<div class="info-line"><span>Цена «'+target.direction+'»</span><b>'+money(price)+' / занятие</b></div>'+
      '<div class="info-line"><span>Будет добавлено</span><b>'+fmt(lessons,4)+' занятия</b></div>'+
      '</div><div class="muted mini" style="margin-top:10px">Оплаты и посещения старого направления остаются в его истории. Создаётся отдельная операция переноса остатка.</div>';
  };

  window.confirmTransferDirectionBalanceV142=function(childId,direction){
    const child=byId(state.children,Number(childId));
    const source=currentEnrollment(child,direction);
    const target=currentEnrollment(child,document.querySelector('#tb-target')?.value);
    if(!canTransfer(child,source)||!target) return;
    ensureLots(source); ensureLots(target);
    const amount=lotMoney(source),targetPrice=effective(target);
    if(!(amount>EPS)||!(targetPrice>0)) return;
    const lessons=amount/targetPrice;

    source.balance=0;
    source.balanceLotsV142=[];
    target.balance=Number(target.balance||0)+lessons;
    target.balanceLotsV142.push({lessons:lessons,price:targetPrice,source:'transfer'});

    state.balanceTransfersV142=state.balanceTransfersV142||[];
    state.balanceTransfersV142.unshift({
      id:Date.now()+Math.random(),childId:Number(child.id),from:source.direction,to:target.direction,
      amount:amount,lessons:lessons,targetPrice:targetPrice,date:isoToday()
    });
    state.modal=null;
    state.childTab='overview';
    state.page='child';
    render();
  };

  const childBeforeV142=window.child;
  window.child=function(){
    let html=childBeforeV142();
    const child=byId(state.children,state.selectedChild);
    if(!child) return html;
    (child.enrollments||[]).forEach(function(e){
      if(!canTransfer(child,e)) return;
      const button='<button class="btn" onclick="manageDirectionForm('+child.id+',\''+e.direction+'\')">Изменить направление / цену</button>';
      if(!html.includes(button)) return;
      const transfer='<button class="btn soft" onclick="transferDirectionBalanceFormV142('+child.id+',\''+e.direction+'\')">Перенести остаток</button>';
      html=html.replace(button,button+transfer);
    });
    return html;
  };

  window.remainingDirectionMoneyV142=function(e){ensureLots(e);return lotMoney(e);};
  render();
})();

// iCube CRM v1.1.7 — safe child direction transfer with preserved history.
(function(){
  function currentEnrollment(child, direction){
    if(!child) return null;
    if(direction) return (child.enrollments||[]).find(function(e){return e.direction===direction;}) || null;
    return (child.enrollments||[])[0] || null;
  }

  function archivedEnrollment(child, direction){
    if(!child) return null;
    const rows=(child.enrollmentHistory||[]).filter(function(e){return e.direction===direction;});
    return rows.length ? rows[rows.length-1] : null;
  }

  function archiveAndReplace(child, oldEnrollment, newDirection, newGroupId){
    if(!child || !oldEnrollment || oldEnrollment.direction===newDirection) return false;
    child.enrollmentHistory = child.enrollmentHistory || [];
    child.enrollmentHistory.push({
      direction:oldEnrollment.direction,
      groupId:oldEnrollment.groupId ?? null,
      individualPrice:oldEnrollment.individualPrice ?? null,
      balance:Number(oldEnrollment.balance||0),
      endedAt:new Date().toISOString(),
      changedTo:newDirection
    });

    const index=child.enrollments.indexOf(oldEnrollment);
    const replacement={
      direction:newDirection,
      groupId:newGroupId ?? null,
      individualPrice:null,
      balance:0
    };
    if(index>=0) child.enrollments.splice(index,1,replacement);
    else child.enrollments.push(replacement);
    return true;
  }

  function directionGroupsHtml(direction, selectedGroupId){
    let html='<option value="">Без группы</option>';
    state.groups.filter(function(g){return g.active && g.direction===direction;}).forEach(function(g){
      html+='<option value="'+g.id+'"'+(Number(selectedGroupId)===Number(g.id)?' selected':'')+'>'+g.name+'</option>';
    });
    return html;
  }

  window.changeDirectionForm=function(childId, oldDirection){
    const child=byId(state.children,childId);
    const oldEnrollment=currentEnrollment(child,oldDirection);
    if(!child || !oldEnrollment) return;

    const targets=['Робототехника','Программирование'].filter(function(d){
      return d!==oldDirection && !(child.enrollments||[]).some(function(e){return e.direction===d;});
    });
    if(!targets.length){
      alert('Другое направление уже добавлено ребёнку. Сначала измените его отдельно.');
      return;
    }
    const target=targets[0];
    const oldPrice=effectivePrice(oldEnrollment);

    let html='<h3>Сменить направление</h3>';
    html+='<div class="notice" style="margin-bottom:14px">История оплат и посещений по «'+oldDirection+'» останется без изменений. Текущий остаток <b>'+Number(oldEnrollment.balance.toFixed(4))+' занятий</b> не переносится автоматически. Новое направление начнёт баланс с <b>0</b>.</div>';
    html+='<div class="form-grid">';
    html+='<div class="field"><label>Текущее направление</label><input class="input" value="'+oldDirection+'" disabled></div>';
    html+='<div class="field"><label>Новое направление</label><select class="select" id="td-dir" onchange="refreshTransferGroups()">';
    targets.forEach(function(d){html+='<option>'+d+'</option>';});
    html+='</select></div>';
    html+='<div class="field span-2"><label>Новая основная группа</label><select class="select" id="td-group"></select></div>';
    html+='</div>';
    html+='<div class="muted mini" style="margin-top:10px">Старая цена '+money(oldPrice)+' / занятие сохраняется только в старых операциях. Новые оплаты будут рассчитаны по цене нового направления/группы.</div>';
    html+='<div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn primary" onclick="confirmDirectionChange('+childId+',\''+oldDirection+'\')">Сменить направление</button></div>';
    modal(html);
    setTimeout(refreshTransferGroups,0);
  };

  window.refreshTransferGroups=function(){
    const direction=document.querySelector('#td-dir')?.value;
    const box=document.querySelector('#td-group');
    if(box) box.innerHTML=directionGroupsHtml(direction,null);
  };

  window.confirmDirectionChange=function(childId, oldDirection){
    const child=byId(state.children,childId);
    const oldEnrollment=currentEnrollment(child,oldDirection);
    const newDirection=document.querySelector('#td-dir')?.value;
    const rawGroup=document.querySelector('#td-group')?.value;
    const groupId=rawGroup ? Number(rawGroup) : null;
    if(!child || !oldEnrollment || !newDirection) return;
    if((child.enrollments||[]).some(function(e){return e.direction===newDirection;})){
      alert('Это направление уже есть у ребёнка.');
      return;
    }
    archiveAndReplace(child,oldEnrollment,newDirection,groupId);
    state.modal=null;
    state.childTab='overview';
    state.page='child';
    render();
  };

  // Add an explicit transfer action next to normal enrollment editing.
  const previousChild=window.child;
  window.child=function(){
    let html=previousChild();
    const child=byId(state.children,state.selectedChild);
    if(!child) return html;

    (child.enrollments||[]).forEach(function(e){
      const needle='<button class="btn" onclick="enrollmentForm('+child.id+',\''+e.direction+'\')">Изменить</button>';
      const replacement=needle+'<button class="btn" onclick="changeDirectionForm('+child.id+',\''+e.direction+'\')">Сменить направление</button>';
      html=html.replace(needle,replacement);
    });

    if((child.enrollmentHistory||[]).length){
      const rows=child.enrollmentHistory.slice().reverse().map(function(e){
        const g=byId(state.groups,e.groupId);
        return '<div class="kpi-line"><div><b>'+e.direction+' → '+e.changedTo+'</b><div class="muted mini">'+(g?g.name:'Без группы')+'</div></div><div style="text-align:right"><span class="badge gray">История</span><div class="muted mini" style="margin-top:4px">остаток был '+Number(Number(e.balance||0).toFixed(4))+'</div></div></div>';
      }).join('');
      const marker='<div class="grid cols-2" style="margin-top:16px">';
      html=html.replace(marker,'<div class="card pad" style="margin-top:16px"><div class="section-title"><h2>История переводов</h2><span class="muted mini">остатки не перенесены</span></div>'+rows+'</div>'+marker);
    }
    return html;
  };

  // Editing a child must not silently rewrite the old direction.
  const previousChildForm=window.childForm;
  window.childForm=function(id){
    previousChildForm(id);
    if(!id) return;
    const select=document.querySelector('#cf-direction');
    if(!select) return;
    select.disabled=true;
    const field=select.closest('.field');
    if(field && !field.querySelector('.direction-edit-hint')){
      const hint=document.createElement('div');
      hint.className='muted mini direction-edit-hint';
      hint.style.marginTop='5px';
      hint.innerHTML='Направление меняется отдельным действием <b>«Сменить направление»</b> в карточке ребёнка, чтобы не переписать историю.';
      field.appendChild(hint);
    }
  };

  // New payments only use current enrollments. Historical payment editing keeps its original direction.
  const previousRefreshPaymentDirections=window.refreshPaymentDirections;
  window.refreshPaymentDirections=function(paymentId,preferred){
    const childId=Number(document.querySelector('#pf-child')?.value);
    const child=byId(state.children,childId);
    const existing=paymentId ? byId(state.payments,paymentId) : null;
    const box=document.querySelector('#pf-dir');
    if(!box) return;

    let dirs=(child?.enrollments||[]).map(function(e){return e.direction;});
    if(existing && Number(existing.childId)===childId && !dirs.includes(existing.direction)){
      dirs=[existing.direction].concat(dirs);
    }
    box.innerHTML=dirs.map(function(d){
      return '<option'+(d===(preferred||existing?.direction)?' selected':'')+'>'+d+'</option>';
    }).join('');
    if(!dirs.length) box.innerHTML='<option value="">Нет направлений</option>';
    if(typeof window.updatePaymentCalc==='function') window.updatePaymentCalc();
  };

  // Historical payment calculation uses its saved price when its enrollment is already archived.
  const previousUpdatePaymentCalc=window.updatePaymentCalc;
  window.updatePaymentCalc=function(){
    const childId=Number(document.querySelector('#pf-child')?.value);
    const direction=document.querySelector('#pf-dir')?.value;
    const child=byId(state.children,childId);
    const current=currentEnrollment(child,direction);
    if(current) return previousUpdatePaymentCalc();

    const box=document.querySelector('#pf-calc');
    if(!box) return;
    const payment=state.payments.find(function(p){
      return Number(p.childId)===childId && p.direction===direction;
    });
    const price=Number(payment?.price || 0);
    const amount=Number(document.querySelector('#pf-amount')?.value||0);
    if(!price){
      box.innerHTML='Это архивное направление. Для новой оплаты выберите текущее направление.';
      return;
    }
    box.innerHTML='Историческая цена операции: <b>'+money(price)+'</b> · '+Number((amount/price).toFixed(6))+' занятия.';
  };

  render();
})();


// Keep payment corrections working after the related direction has moved to history.
(function(){
  function ledgerEnrollment(childId,direction){
    const child=byId(state.children,childId);
    if(!child) return null;
    const current=(child.enrollments||[]).find(function(e){return e.direction===direction;});
    if(current) return current;
    const archived=(child.enrollmentHistory||[]).filter(function(e){return e.direction===direction;});
    return archived.length ? archived[archived.length-1] : null;
  }

  function changeLedgerBalance(childId,direction,delta){
    const e=ledgerEnrollment(childId,direction);
    if(e) e.balance=Number(e.balance||0)+Number(delta||0);
  }

  window.savePaymentV116=function(paymentId){
    const childId=Number(document.querySelector('#pf-child').value);
    const direction=document.querySelector('#pf-dir').value;
    const amount=Number(document.querySelector('#pf-amount').value);
    const target=ledgerEnrollment(childId,direction);
    const existing=paymentId?byId(state.payments,paymentId):null;

    if(!target){
      alert('У выбранного ребёнка нет этого направления.');
      return;
    }
    if(!(amount>0)){
      alert('Укажите сумму оплаты.');
      return;
    }

    if(existing){
      changeLedgerBalance(existing.childId,existing.direction,-Number(existing.lessons||0));
    }

    let price;
    const current=byId(state.children,childId)?.enrollments?.find(function(e){return e.direction===direction;});
    if(current) price=effectivePrice(current);
    else if(existing && Number(existing.childId)===childId && existing.direction===direction) price=Number(existing.price||0);
    else price=effectivePrice(target);

    if(!(price>0)){
      if(existing) changeLedgerBalance(existing.childId,existing.direction,Number(existing.lessons||0));
      alert('Не удалось определить цену операции.');
      return;
    }

    const record={
      id:existing?.id || (typeof safeNextId==='function'?safeNextId(state.payments):Date.now()),
      date:document.querySelector('#pf-date').value.split('-').reverse().join('.'),
      childId:childId,
      direction:direction,
      amount:amount,
      method:document.querySelector('#pf-method').value,
      price:price,
      lessons:amount/price
    };

    if(existing) Object.assign(existing,record);
    else state.payments.push(record);
    changeLedgerBalance(record.childId,record.direction,Number(record.lessons||0));

    state.modal=null;
    state.page='payments';
    render();
  };

  window.confirmDeletePayment=function(id){
    const p=byId(state.payments,id);
    if(!p) return;
    changeLedgerBalance(p.childId,p.direction,-Number(p.lessons||0));
    state.payments=state.payments.filter(function(x){return x.id!==id;});
    state.modal=null;
    state.page='payments';
    render();
  };
})();

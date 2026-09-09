
// iCube CRM v1.1.7 — unified direction/price editing with money-balance transfer.
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

  function basePriceFor(direction, groupId){
    const group=byId(state.groups,groupId);
    if(group && group.price!=null) return Number(group.price);
    return direction==='Программирование' ? Number(state.settings.codePrice||0) : Number(state.settings.robotPrice||0);
  }

  function formatNumber(n, digits){
    const value=Number(n||0);
    return Number(value.toFixed(digits==null?4:digits));
  }

  function directionGroupsHtml(direction, selectedGroupId){
    let html='<option value="">Без группы</option>';
    state.groups.filter(function(g){return g.active && g.direction===direction;}).forEach(function(g){
      html+='<option value="'+g.id+'"'+(Number(selectedGroupId)===Number(g.id)?' selected':'')+'>'+g.name+'</option>';
    });
    return html;
  }

  function proposedPrice(){
    const direction=document.querySelector('#md-dir')?.value;
    const rawGroup=document.querySelector('#md-group')?.value;
    const groupId=rawGroup ? Number(rawGroup) : null;
    const mode=document.querySelector('#md-price-mode')?.value || 'standard';
    if(mode==='individual'){
      const packagePrice=Number(document.querySelector('#md-individual-package')?.value||0);
      return packagePrice>0 ? packagePrice/4 : 0;
    }
    return basePriceFor(direction,groupId);
  }

  window.refreshManageDirectionGroups=function(selectedGroupId){
    const direction=document.querySelector('#md-dir')?.value;
    const box=document.querySelector('#md-group');
    if(!box) return;
    box.innerHTML=directionGroupsHtml(direction,selectedGroupId);
    refreshManageDirectionPreview();
  };

  window.toggleManageIndividualPrice=function(){
    const mode=document.querySelector('#md-price-mode')?.value || 'standard';
    const field=document.querySelector('#md-individual-wrap');
    if(field) field.style.display=mode==='individual'?'block':'none';
    refreshManageDirectionPreview();
  };

  window.refreshManageDirectionPreview=function(){
    const childId=Number(document.querySelector('#md-child-id')?.value);
    const oldDirection=document.querySelector('#md-old-dir')?.value;
    const child=byId(state.children,childId);
    const oldEnrollment=currentEnrollment(child,oldDirection);
    const box=document.querySelector('#md-preview');
    if(!oldEnrollment || !box) return;

    const oldPrice=effectivePrice(oldEnrollment);
    const moneyBalance=Number(oldEnrollment.balance||0)*Number(oldPrice||0);
    const newPrice=proposedPrice();
    const newBalance=newPrice ? moneyBalance/newPrice : 0;
    const newDirection=document.querySelector('#md-dir')?.value || oldDirection;
    const changedDirection=newDirection!==oldDirection;

    let html='<div class="info-list">';
    html+='<div class="info-line"><span>Текущий остаток</span><b>'+money(moneyBalance)+' ('+formatNumber(oldEnrollment.balance,4)+' занятий)</b></div>';
    html+='<div class="info-line"><span>Новая цена</span><b>'+(newPrice?money(newPrice)+' / занятие':'—')+'</b></div>';
    html+='<div class="info-line"><span>Баланс после изменения</span><b>'+(newPrice?formatNumber(newBalance,4)+' занятий':'—')+'</b></div>';
    html+='</div>';
    if(changedDirection){
      html+='<div class="notice" style="margin-top:12px">Денежный остаток <b>'+money(moneyBalance)+'</b> будет автоматически перенесён на «'+newDirection+'» и пересчитан по новой цене. Старые оплаты и посещения останутся в истории прежнего направления.</div>';
    }else if(newPrice && Math.abs(newPrice-oldPrice)>0.000001){
      html+='<div class="notice" style="margin-top:12px">Денежный остаток сохраняется: меняется только количество занятий, соответствующее новой цене.</div>';
    }else{
      html+='<div class="muted mini" style="margin-top:10px">Если направление и цена не меняются, баланс останется прежним.</div>';
    }
    box.innerHTML=html;
  };

  window.manageDirectionForm=function(childId, oldDirection){
    const child=byId(state.children,childId);
    const enrollment=currentEnrollment(child,oldDirection);
    if(!child || !enrollment) return;

    const currentGroupId=enrollment.groupId ?? null;
    const currentPrice=effectivePrice(enrollment);
    const packagePrice=enrollment.individualPrice!=null ? Number(enrollment.individualPrice)*4 : '';
    const directions=['Робототехника','Программирование'].filter(function(d){
      return d===oldDirection || !(child.enrollments||[]).some(function(e){return e.direction===d;});
    });

    let html='<h3>Изменить направление / цену</h3>';
    html+='<input type="hidden" id="md-child-id" value="'+childId+'">';
    html+='<input type="hidden" id="md-old-dir" value="'+oldDirection+'">';
    html+='<div class="form-grid">';
    html+='<div class="field"><label>Направление</label><select class="select" id="md-dir" onchange="refreshManageDirectionGroups()">';
    directions.forEach(function(d){html+='<option'+(d===oldDirection?' selected':'')+'>'+d+'</option>';});
    html+='</select></div>';
    html+='<div class="field"><label>Основная группа</label><select class="select" id="md-group" onchange="refreshManageDirectionPreview()">'+directionGroupsHtml(oldDirection,currentGroupId)+'</select></div>';
    html+='<div class="field span-2"><label>Цена</label><select class="select" id="md-price-mode" onchange="toggleManageIndividualPrice()"><option value="standard"'+(enrollment.individualPrice==null?' selected':'')+'>Обычная цена направления / группы</option><option value="individual"'+(enrollment.individualPrice!=null?' selected':'')+'>Индивидуальная цена</option></select><div class="muted mini" style="margin-top:5px">Сейчас: '+money(currentPrice)+' / занятие.</div></div>';
    html+='<div class="field span-2" id="md-individual-wrap" style="display:'+(enrollment.individualPrice!=null?'block':'none')+'"><label>Индивидуальная цена абонемента за 4 занятия, ₽</label><input class="input" id="md-individual-package" type="number" min="0" step="1" value="'+packagePrice+'" placeholder="Например, 2900" oninput="refreshManageDirectionPreview()"><div class="muted mini" id="md-individual-hint" style="margin-top:5px">CRM будет считать стоимость одного занятия как цену абонемента ÷ 4.</div></div>';
    html+='</div>';
    html+='<div id="md-preview" class="card pad" style="margin-top:14px"></div>';
    html+='<div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn primary" onclick="saveManagedDirection('+childId+',\''+oldDirection+'\')">Сохранить изменения</button></div>';
    modal(html);
    setTimeout(refreshManageDirectionPreview,0);
  };

  window.saveManagedDirection=function(childId, oldDirection){
    const child=byId(state.children,childId);
    const oldEnrollment=currentEnrollment(child,oldDirection);
    if(!child || !oldEnrollment) return;

    const newDirection=document.querySelector('#md-dir')?.value;
    const rawGroup=document.querySelector('#md-group')?.value;
    const groupId=rawGroup ? Number(rawGroup) : null;
    const mode=document.querySelector('#md-price-mode')?.value || 'standard';
    const packagePrice=Number(document.querySelector('#md-individual-package')?.value||0);

    if(mode==='individual' && !(packagePrice>0)){
      alert('Укажите индивидуальную цену абонемента за 4 занятия.');
      return;
    }

    if(newDirection!==oldDirection && (child.enrollments||[]).some(function(e){return e.direction===newDirection;})){
      alert('Это направление уже есть у ребёнка.');
      return;
    }

    const oldPrice=effectivePrice(oldEnrollment);
    const moneyBalance=Number(oldEnrollment.balance||0)*Number(oldPrice||0);
    const individualPrice=mode==='individual' ? packagePrice/4 : null;
    const draft={direction:newDirection,groupId:groupId,individualPrice:individualPrice,balance:0};
    const newPrice=effectivePrice(draft);
    if(!(newPrice>0)){
      alert('Не удалось определить новую цену.');
      return;
    }
    const newBalance=moneyBalance/newPrice;

    if(newDirection!==oldDirection){
      child.enrollmentHistory=child.enrollmentHistory||[];
      child.enrollmentHistory.push({
        direction:oldEnrollment.direction,
        groupId:oldEnrollment.groupId ?? null,
        individualPrice:oldEnrollment.individualPrice ?? null,
        balance:Number(oldEnrollment.balance||0),
        price:Number(oldPrice||0),
        moneyBalance:moneyBalance,
        changedTo:newDirection,
        newPrice:newPrice,
        transferredBalance:newBalance,
        endedAt:new Date().toISOString()
      });
      const index=child.enrollments.indexOf(oldEnrollment);
      const replacement={direction:newDirection,groupId:groupId,individualPrice:individualPrice,balance:newBalance};
      if(index>=0) child.enrollments.splice(index,1,replacement);
      else child.enrollments.push(replacement);
    }else{
      oldEnrollment.groupId=groupId;
      oldEnrollment.individualPrice=individualPrice;
      oldEnrollment.balance=newBalance;
    }

    state.modal=null;
    state.childTab='overview';
    state.page='child';
    render();
  };

  // One management action in the child card: payment + unified direction/price editing.
  const previousChild=window.child;
  window.child=function(){
    let html=previousChild();
    const child=byId(state.children,state.selectedChild);
    if(!child) return html;

    // Remove the separate "+ Добавить направление" action from the header.
    html=html.replace(/<button class="btn soft" onclick="enrollmentForm\('+child\.id+',null\)">\+ Добавить направление<\/button>/g,'');

    (child.enrollments||[]).forEach(function(e){
      const edit='<button class="btn" onclick="enrollmentForm('+child.id+',\''+e.direction+'\')">Изменить</button>';
      const unified='<button class="btn" onclick="manageDirectionForm('+child.id+',\''+e.direction+'\')">Изменить направление / цену</button>';
      html=html.replace(edit,unified);

      const transfer='<button class="btn" onclick="changeDirectionForm('+child.id+',\''+e.direction+'\')">Сменить направление</button>';
      html=html.replace(transfer,'');
    });

    if((child.enrollmentHistory||[]).length){
      const rows=child.enrollmentHistory.slice().reverse().map(function(e){
        const g=byId(state.groups,e.groupId);
        const rub=e.moneyBalance!=null ? money(e.moneyBalance) : money(Number(e.balance||0)*Number(e.price||0));
        return '<div class="kpi-line"><div><b>'+e.direction+' → '+e.changedTo+'</b><div class="muted mini">'+(g?g.name:'Без группы')+'</div></div><div style="text-align:right"><span class="badge gray">История</span><div class="muted mini" style="margin-top:4px">перенесено '+rub+'</div></div></div>';
      }).join('');
      const marker='<div class="grid cols-2" style="margin-top:16px">';
      if(!html.includes('История переводов')){
        html=html.replace(marker,'<div class="card pad" style="margin-top:16px"><div class="section-title"><h2>История переводов</h2><span class="muted mini">перенос по денежному остатку</span></div>'+rows+'</div>'+marker);
      }
    }
    return html;
  };

  // Editing personal data cannot silently change the direction.
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
      hint.innerHTML='Направление и индивидуальная цена меняются в карточке ребёнка кнопкой <b>«Изменить направление / цену»</b>.';
      field.appendChild(hint);
    }
  };

  // Historical payment editing/deletion keeps affecting the ledger that existed at that direction.
  function ledgerEnrollment(childId,direction){
    const child=byId(state.children,childId);
    if(!child) return null;
    const current=(child.enrollments||[]).find(function(e){return e.direction===direction;});
    if(current) return current;
    return archivedEnrollment(child,direction);
  }

  function changeLedgerBalance(childId,direction,delta){
    const e=ledgerEnrollment(childId,direction);
    if(e) e.balance=Number(e.balance||0)+Number(delta||0);
  }

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
    box.innerHTML='Историческая цена операции: <b>'+money(price)+'</b> · '+formatNumber(amount/price,6)+' занятия.';
  };

  window.savePaymentV116=function(paymentId){
    const childId=Number(document.querySelector('#pf-child').value);
    const direction=document.querySelector('#pf-dir').value;
    const amount=Number(document.querySelector('#pf-amount').value);
    const target=ledgerEnrollment(childId,direction);
    const existing=paymentId?byId(state.payments,paymentId):null;

    if(!target){alert('У выбранного ребёнка нет этого направления.');return;}
    if(!(amount>0)){alert('Укажите сумму оплаты.');return;}

    if(existing) changeLedgerBalance(existing.childId,existing.direction,-Number(existing.lessons||0));

    let price;
    const current=byId(state.children,childId)?.enrollments?.find(function(e){return e.direction===direction;});
    if(current) price=effectivePrice(current);
    else if(existing && Number(existing.childId)===childId && existing.direction===direction) price=Number(existing.price||0);
    else price=Number(target.price||0) || effectivePrice(target);

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

  render();
})();

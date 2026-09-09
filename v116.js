
// iCube CRM v1.1.6 — payment corrections + safe empty-system relations.
(function(){
  function nextId(arr){
    return arr.length ? Math.max.apply(null,arr.map(function(x){return Number(x.id)||0;}))+1 : 1;
  }

  // Safety net for entities created from a completely empty sandbox.
  window.safeNextId = nextId;

  // Group must reference real directory records.
  const previousSaveGroup=window.saveGroupV111;
  window.saveGroupV111=function(id){
    const siteValue=document.querySelector('#gf-site')?.value;
    const teacherValue=document.querySelector('#gf-teacher')?.value;
    const siteId=Number(siteValue), teacherId=Number(teacherValue);
    if(!siteValue || siteValue==='new' || !byId(state.sites,siteId)){
      alert('Сначала выберите или создайте площадку.');
      return;
    }
    if(!teacherValue || teacherValue==='new' || !byId(state.teachers,teacherId)){
      alert('Сначала выберите или создайте преподавателя.');
      return;
    }
    return previousSaveGroup(id);
  };

  function paymentEnrollment(childId,direction){
    const c=byId(state.children,childId);
    return c ? c.enrollments.find(function(e){return e.direction===direction;}) : null;
  }

  function undoPayment(p){
    const e=paymentEnrollment(p.childId,p.direction);
    if(e) e.balance-=Number(p.lessons||0);
  }

  function applyPaymentRecord(p){
    const e=paymentEnrollment(p.childId,p.direction);
    if(e) e.balance+=Number(p.lessons||0);
  }

  window.paymentForm=function(childId,direction,paymentId){
    if(!state.children.length){
      alert('Сначала создайте ребёнка.');
      return;
    }
    const existing=paymentId?byId(state.payments,paymentId):null;
    const defaultChild=existing?.childId ?? childId ?? state.children[0].id;
    const child=byId(state.children,defaultChild) || state.children[0];
    const availableDirs=(child.enrollments||[]).map(function(e){return e.direction;});
    const defaultDir=existing?.direction ?? direction ?? availableDirs[0] ?? '';

    let html='<h3>'+(existing?'Редактировать оплату':'Новая оплата')+'</h3><div class="form-grid">';
    html+='<div class="field"><label>Дата</label><input class="input" id="pf-date" type="date" value="'+(existing?existing.date.split('.').reverse().join('-'):'2026-09-10')+'"></div>';
    html+='<div class="field"><label>Ребёнок</label><select class="select" id="pf-child" onchange="refreshPaymentDirections('+ (existing?.id||'null') +')">';
    state.children.forEach(function(c){html+='<option value="'+c.id+'"'+(c.id===child.id?' selected':'')+'>'+c.name+'</option>';});
    html+='</select></div>';
    html+='<div class="field"><label>Направление</label><select class="select" id="pf-dir" onchange="updatePaymentCalc()"></select></div>';
    html+='<div class="field"><label>Сумма, ₽</label><input class="input" id="pf-amount" type="number" step="0.01" value="'+(existing?.amount??4100)+'" oninput="updatePaymentCalc()"></div>';
    html+='<div class="field span-2"><label>Способ получения</label><select class="select" id="pf-method"><option'+((existing?.method||'На счёт iCube')==='На счёт iCube'?' selected':'')+'>На счёт iCube</option><option'+(existing?.method==='Наличными партнёру'?' selected':'')+'>Наличными партнёру</option></select></div>';
    html+='</div><div class="notice" id="pf-calc" style="margin-top:14px"></div><div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn primary" onclick="savePaymentV116('+(existing?.id||'null')+')">'+(existing?'Сохранить изменения':'Сохранить оплату')+'</button></div>';
    modal(html);
    setTimeout(function(){refreshPaymentDirections(existing?.id||null,defaultDir);},0);
  };

  window.refreshPaymentDirections=function(paymentId,preferred){
    const childId=Number(document.querySelector('#pf-child')?.value);
    const c=byId(state.children,childId);
    const box=document.querySelector('#pf-dir');
    if(!box)return;
    const dirs=(c?.enrollments||[]).map(function(e){return e.direction;});
    box.innerHTML=dirs.map(function(d){return '<option'+(d===preferred?' selected':'')+'>'+d+'</option>';}).join('');
    if(!dirs.length)box.innerHTML='<option value="">Нет направлений</option>';
    updatePaymentCalc();
  };

  window.updatePaymentCalc=function(){
    const childId=Number(document.querySelector('#pf-child')?.value);
    const direction=document.querySelector('#pf-dir')?.value;
    const e=paymentEnrollment(childId,direction);
    const box=document.querySelector('#pf-calc');
    if(!box)return;
    if(!e){box.innerHTML='У ребёнка нет выбранного направления.';return;}
    const price=effectivePrice(e),amount=Number(document.querySelector('#pf-amount')?.value||0);
    const lessons=price?amount/price:0;
    box.innerHTML='Цена операции: <b>'+money(price)+'</b> · будет начислено <b>'+Number(lessons.toFixed(6))+' занятия</b>.';
  };

  window.savePaymentV116=function(paymentId){
    const childId=Number(document.querySelector('#pf-child').value);
    const direction=document.querySelector('#pf-dir').value;
    const e=paymentEnrollment(childId,direction);
    const amount=Number(document.querySelector('#pf-amount').value);
    if(!e){alert('У выбранного ребёнка нет этого направления.');return;}
    if(!(amount>0)){alert('Укажите сумму оплаты.');return;}

    const existing=paymentId?byId(state.payments,paymentId):null;
    if(existing)undoPayment(existing);

    const price=effectivePrice(e);
    const record={
      id:existing?.id||nextId(state.payments),
      date:document.querySelector('#pf-date').value.split('-').reverse().join('.'),
      childId:childId,
      direction:direction,
      amount:amount,
      method:document.querySelector('#pf-method').value,
      price:price,
      lessons:amount/price
    };
    if(existing)Object.assign(existing,record);
    else state.payments.push(record);
    applyPaymentRecord(record);
    state.modal=null;
    state.page='payments';
    render();
  };

  window.editPayment=function(id){paymentForm(null,null,id);};

  window.deletePayment=function(id){
    const p=byId(state.payments,id);if(!p)return;
    const c=byId(state.children,p.childId);
    modal('<h3>Удалить оплату?</h3><div class="notice">Оплата '+money(p.amount)+' для '+(c?.name||'ребёнка')+' будет удалена, а начисленные '+Number(p.lessons.toFixed(6))+' занятия будут убраны из баланса.</div><div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn danger" onclick="confirmDeletePayment('+id+')">Удалить</button></div>');
  };

  window.confirmDeletePayment=function(id){
    const p=byId(state.payments,id);if(!p)return;
    undoPayment(p);
    state.payments=state.payments.filter(function(x){return x.id!==id;});
    state.modal=null;
    state.page='payments';
    render();
  };

  window.payments=function(){
    let html=pageHead('Оплаты','Каждая оплата относится к одному ребёнку и одному направлению; ошибочную запись можно исправить или удалить.','<button class="btn primary" onclick="paymentForm()">+ Оплата</button>');
    if(!state.payments.length)return html+'<div class="card pad"><div class="empty">Оплат пока нет.</div></div>';
    html+='<div class="card list"><div class="row header payment-main-row"><div>Ребёнок</div><div>Направление</div><div>Сумма</div><div>Дата</div><div>Занятий</div><div></div></div>';
    html+=state.payments.slice().reverse().map(function(p){
      const c=byId(state.children,p.childId);
      return '<div class="row payment-main-row"><div><b>'+(c?.name||'—')+'</b><div class="muted mini">'+p.method+'</div></div><div>'+p.direction+'</div><div class="money">'+money(p.amount)+'</div><div>'+p.date+'</div><div><span class="badge green">+'+Number(p.lessons.toFixed(4))+'</span></div><div style="display:flex;gap:6px;justify-content:flex-end"><button class="btn" onclick="editPayment('+p.id+')">Изменить</button><button class="btn danger" onclick="deletePayment('+p.id+')">Удалить</button></div></div>';
    }).join('');
    return html+'</div>';
  };

  // Repair ID selection explicitly in the final layer.
  window.openChild=function(id){
    const numeric=Number(id);
    state.selectedChild=numeric;
    state.childTab='overview';
    state.page='child';
    render();
  };
  window.openGroup=function(id){
    state.selectedGroup=Number(id);
    state.page='group';
    render();
  };

  render();
})();


// iCube CRM v1.1.14 — automatic payment ownership + automatic partner cash.
(function(){
  const CASH='Наличные';
  const CASHLESS='Безналичный расчёт';

  function normalizeMethod(method){
    const v=String(method||'').trim();
    if(v==='Наличными партнёру' || v==='Наличными' || v===CASH) return CASH;
    if(v==='На счёт iCube' || v==='На счет iCube' || v==='На счёт iCubeRobots' || v==='На счет iCubeRobots' || v===CASHLESS) return CASHLESS;
    return v || CASHLESS;
  }

  (state.payments||[]).forEach(function(p){ p.method=normalizeMethod(p.method); });

  function enrollmentFor(childId,direction){
    const child=byId(state.children,childId);
    return (child?.enrollments||[]).find(function(e){return e.direction===direction;}) || null;
  }

  function projectForEnrollment(childId,direction){
    const e=enrollmentFor(childId,direction);
    const g=e && e.groupId!=null ? byId(state.groups,e.groupId) : null;
    return g ? {project:g.project||null,groupId:g.id} : {project:null,groupId:null};
  }

  function resolvePendingPayments(childId,direction){
    (state.payments||[]).forEach(function(p){
      if(Number(p.childId)!==Number(childId)) return;
      if(direction && p.direction!==direction) return;
      if(p.project!=null && p.project!=='') return;
      const owner=projectForEnrollment(p.childId,p.direction);
      if(owner.project){
        p.project=owner.project;
        p.groupId=owner.groupId;
      }
    });
  }

  // Payment form: human-friendly method names.
  const paymentFormBeforeV124=window.paymentForm;
  window.paymentForm=function(childId,direction,paymentId){
    paymentFormBeforeV124(childId,direction,paymentId);
    const select=document.querySelector('#pf-method');
    if(!select) return;
    const existing=paymentId?byId(state.payments,paymentId):null;
    const current=normalizeMethod(existing?.method || select.value);
    select.innerHTML=
      '<option value="'+CASHLESS+'"'+(current===CASHLESS?' selected':'')+'>'+CASHLESS+'</option>'+
      '<option value="'+CASH+'"'+(current===CASH?' selected':'')+'>'+CASH+'</option>';
    const label=select.closest('.field')?.querySelector('label');
    if(label) label.textContent='Способ оплаты';
  };

  // Preserve project/group snapshot on historical payment edits.
  // New payments get the current group owner, or remain unresolved while the child has no group.
  const savePaymentBeforeV124=window.savePaymentV116;
  window.savePaymentV116=function(paymentId){
    const existing=paymentId?byId(state.payments,paymentId):null;
    const immutable=existing ? {
      project:(existing.project==null?'__unset__':existing.project),
      groupId:(existing.groupId==null?'__unset__':existing.groupId)
    } : null;
    const childId=Number(document.querySelector('#pf-child')?.value);
    const direction=document.querySelector('#pf-dir')?.value;

    const result=savePaymentBeforeV124(paymentId);

    let rec=existing;
    if(!rec && childId && direction){
      rec=(state.payments||[]).slice().reverse().find(function(p){
        return Number(p.childId)===childId && p.direction===direction;
      });
    }
    if(!rec) return result;

    rec.method=normalizeMethod(rec.method);

    if(immutable && immutable.project!=='__unset__'){
      rec.project=immutable.project;
      rec.groupId=immutable.groupId==='__unset__' ? null : immutable.groupId;
    }else{
      const owner=projectForEnrollment(rec.childId,rec.direction);
      if(owner.project){
        rec.project=owner.project;
        rec.groupId=owner.groupId;
      }else{
        rec.project=null;
        rec.groupId=null;
      }
    }
    render();
    return result;
  };

  // As soon as a child without a group is assigned to one, bind only still-unresolved payments.
  if(typeof window.saveManagedDirection==='function'){
    const saveManagedDirectionBeforeV124=window.saveManagedDirection;
    window.saveManagedDirection=function(childId,oldDirection){
      const newDirection=document.querySelector('#md-dir')?.value || oldDirection;
      const result=saveManagedDirectionBeforeV124(childId,oldDirection);
      resolvePendingPayments(childId,newDirection);
      render();
      return result;
    };
  }

  if(typeof window.saveChild==='function'){
    const saveChildBeforeV124=window.saveChild;
    window.saveChild=function(id){
      const result=saveChildBeforeV124(id);
      const childId=id || state.selectedChild;
      const child=byId(state.children,childId);
      (child?.enrollments||[]).forEach(function(e){resolvePendingPayments(childId,e.direction);});
      render();
      return result;
    };
  }

  function parseRuDate(s){
    const p=String(s||'').split('.').map(Number);
    return new Date(p[2]||0,(p[1]||1)-1,p[0]||1);
  }
  function parseIsoDate(s){
    const p=String(s||'').split('-').map(Number);
    return new Date(p[0]||0,(p[1]||1)-1,p[2]||1);
  }
  function inPeriod(ru,fromIso,toIso){
    const d=parseRuDate(ru),from=parseIsoDate(fromIso),to=parseIsoDate(toIso);
    to.setHours(23,59,59,999);
    return d>=from && d<=to;
  }
  function fmtDate(iso){
    const p=String(iso||'').split('-');
    return p.length===3?p[2]+'.'+p[1]+'.'+p[0]:iso;
  }

  function historicalProject(record){
    if(record?.project) return record.project;
    if(record?.groupId!=null){
      const g=byId(state.groups,record.groupId);
      if(g) return g.project||null;
    }
    const child=byId(state.children,record?.childId);
    if(!child) return null;
    const opDate=parseRuDate(record.date);
    const history=(child.enrollmentHistory||[]).filter(function(e){
      return e.direction===record.direction && e.groupId!=null && e.endedAt;
    }).sort(function(a,b){return new Date(a.endedAt)-new Date(b.endedAt);});
    const historical=history.find(function(e){return opDate<=new Date(e.endedAt);});
    if(historical){
      const g=byId(state.groups,historical.groupId);
      if(g) return g.project||null;
    }
    const owner=projectForEnrollment(record.childId,record.direction);
    return owner.project;
  }

  function partnerProjects(){
    const rows=Array.from(new Set((state.groups||[]).map(function(g){return g.project;}).filter(function(p){return p&&p!=='iCubeRobots';})));
    return rows.length?rows:['Зебра'];
  }
  function ensurePartnerProject(){
    const rows=partnerProjects();
    if(!rows.includes(state.partnerProject)) state.partnerProject=rows[0];
    return rows;
  }
  function partnerSalary(project,from,to){
    return (state.lessons||[]).filter(function(l){
      const g=byId(state.groups,l.groupId);
      if(!g || g.project!==project || !inPeriod(l.date,from,to)) return false;
      return !!l.emptyTrip || (!!l.done && !l.cancelled);
    }).reduce(function(sum,l){
      return sum+Number((typeof window.salaryCalculation==='function'?window.salaryCalculation(l):{total:0}).total||0);
    },0);
  }

  function partnerCalc(){
    const project=state.partnerProject,from=state.partnerDateFrom,to=state.partnerDateTo;
    const payments=(state.payments||[]).filter(function(p){
      return inPeriod(p.date,from,to) && historicalProject(p)===project;
    });
    const refunds=(state.refunds||[]).filter(function(r){
      return inPeriod(r.date,from,to) && historicalProject(r)===project;
    });
    const paymentTotal=payments.reduce(function(s,p){return s+Number(p.amount||0);},0);
    const refundTotal=refunds.reduce(function(s,r){return s+Number(r.amount||0);},0);
    const cash=payments.filter(function(p){return normalizeMethod(p.method)===CASH;})
      .reduce(function(s,p){return s+Number(p.amount||0);},0);
    const income=paymentTotal-refundTotal;
    const taxRate=Number(state.settings.tax||0);
    const tax=Math.max(0,income)*taxRate/100;
    const salary=partnerSalary(project,from,to);
    const distributable=income-tax-salary;
    const partnerRate=Number(state.settings.partnerShare||0);
    const icubeRate=Number(state.settings.icubeShare||0);
    const partnerShare=distributable*partnerRate/100;
    const icubeShare=distributable*icubeRate/100;
    const transfer=partnerShare-cash;
    return {payments:paymentTotal,refunds:refundTotal,income:income,taxRate:taxRate,tax:tax,salary:salary,distributable:distributable,partnerRate:partnerRate,icubeRate:icubeRate,partnerShare:partnerShare,icubeShare:icubeShare,cash:cash,transfer:transfer};
  }

  window.partner=function(){
    const projects=ensurePartnerProject();
    const c=partnerCalc();
    let html=pageHead('Партнёр','Расчёт по реальным операциям и занятиям партнёрского проекта.');
    html+='<div class="toolbar"><select class="select" id="partner-project" style="max-width:240px">';
    projects.forEach(function(p){html+='<option'+(p===state.partnerProject?' selected':'')+'>'+p+'</option>';});
    html+='</select><input class="input" id="partner-from" type="date" value="'+state.partnerDateFrom+'" style="max-width:180px">';
    html+='<input class="input" id="partner-to" type="date" value="'+state.partnerDateTo+'" style="max-width:180px">';
    html+='<button class="btn primary" onclick="applyPartnerFiltersV123()">Рассчитать</button></div>';

    html+='<div class="card pad partner-settlement">';
    html+='<div class="section-title"><div><h2 style="font-size:22px">'+state.partnerProject+'</h2><div class="muted">'+fmtDate(state.partnerDateFrom)+' — '+fmtDate(state.partnerDateTo)+'</div></div><span class="badge purple">Партнёр</span></div>';
    html+='<div class="partner-lines">';
    html+='<div class="partner-line"><span>Оплаты</span><b>'+money(c.payments)+'</b></div>';
    html+='<div class="partner-line"><span>Возвраты</span><b>'+money(c.refunds)+'</b></div>';
    html+='<div class="partner-line"><span>Доход после возвратов</span><b>'+money(c.income)+'</b></div>';
    html+='<div class="partner-line"><span>Налог '+c.taxRate+'%</span><b>− '+money(c.tax)+'</b></div>';
    html+='<div class="partner-line"><span>ЗП преподавателей</span><b>− '+money(c.salary)+'</b></div>';
    html+='<div class="partner-line partner-divider"><span>К разделению</span><b>'+money(c.distributable)+'</b></div>';
    html+='<div class="partner-line"><span>Партнёру '+c.partnerRate+'%</span><b>'+money(c.partnerShare)+'</b></div>';
    html+='<div class="partner-line"><span>iCube '+c.icubeRate+'%</span><b>'+money(c.icubeShare)+'</b></div>';
    html+='</div>';

    html+='<div class="partner-cash-box"><label>Получено партнёром наличными</label><div class="input" style="display:flex;align-items:center;font-weight:700;background:var(--surface-2,#f8fafc)">'+money(c.cash)+'</div></div>';

    const positive=c.transfer>=0;
    html+='<div class="partner-final '+(positive?'partner-final-pay':'partner-final-return')+'"><span>'+(positive?'К переводу партнёру':'Партнёр должен вернуть iCube')+'</span><b>'+money(Math.abs(c.transfer))+'</b></div>';
    html+='</div>';
    html+='<div class="muted mini" style="margin-top:10px">Наличные определяются автоматически по оплатам детей этого партнёрского проекта. Наличные оплаты детей iCube сюда не попадают. Историческая принадлежность оплаты сохраняется после перевода ребёнка.</div>';
    return html;
  };

  render();
})();

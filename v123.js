
// iCube CRM v1.1.13 — group project filter + real partner settlement.
(function(){
  state.groupProjectFilter = state.groupProjectFilter || 'all';
  state.partnerProject = state.partnerProject || '';
  state.partnerDateFrom = state.partnerDateFrom || '2026-08-26';
  state.partnerDateTo = state.partnerDateTo || '2026-09-25';
  state.partnerCash = state.partnerCash || {};

  function parseRuDate(s){
    const p=String(s||'').split('.').map(Number);
    return new Date(p[2]||0,(p[1]||1)-1,p[0]||1);
  }
  function parseIsoDate(s){
    const p=String(s||'').split('-').map(Number);
    return new Date(p[0]||0,(p[1]||1)-1,p[2]||1);
  }
  function inPeriod(ru,fromIso,toIso){
    const d=parseRuDate(ru), from=parseIsoDate(fromIso), to=parseIsoDate(toIso);
    to.setHours(23,59,59,999);
    return d>=from && d<=to;
  }
  function fmtDate(iso){
    const p=String(iso||'').split('-');
    return p.length===3 ? p[2]+'.'+p[1]+'.'+p[0] : iso;
  }
  function operationProject(record){
    if(record?.project) return record.project;
    if(record?.groupId){
      const g=byId(state.groups,record.groupId);
      if(g) return g.project;
    }
    const child=byId(state.children,record?.childId);
    if(!child) return null;

    // For older records without a snapshot, prefer a historical enrollment
    // that was still active on the operation date.
    const opDate=parseRuDate(record.date);
    const history=(child.enrollmentHistory||[]).filter(function(e){
      return e.direction===record.direction && e.groupId!=null && e.endedAt;
    }).sort(function(a,b){return new Date(a.endedAt)-new Date(b.endedAt);});
    const historical=history.find(function(e){return opDate<=new Date(e.endedAt);});
    if(historical){
      const g=byId(state.groups,historical.groupId);
      if(g) return g.project;
    }

    const active=(child.enrollments||[]).find(function(e){return e.direction===record.direction;});
    const g=active?byId(state.groups,active.groupId):null;
    return g?.project || null;
  }
  function operationGroupId(childId,direction){
    const child=byId(state.children,childId);
    const e=(child?.enrollments||[]).find(function(x){return x.direction===direction;});
    return e?.groupId ?? null;
  }

  // Snapshot project/group on new or edited payments, so future moves do not rewrite history.
  const savePaymentBeforeV123=window.savePaymentV116;
  window.savePaymentV116=function(paymentId){
    const childId=Number(document.querySelector('#pf-child')?.value);
    const direction=document.querySelector('#pf-dir')?.value;
    const groupId=operationGroupId(childId,direction);
    const group=byId(state.groups,groupId);
    const beforeIds=new Set((state.payments||[]).map(function(p){return Number(p.id);}));
    const result=savePaymentBeforeV123(paymentId);
    let rec=paymentId?byId(state.payments,paymentId):null;
    if(!rec) rec=(state.payments||[]).slice().reverse().find(function(p){return !beforeIds.has(Number(p.id));});
    if(rec){
      rec.groupId=groupId;
      rec.project=group?.project || rec.project || null;
    }
    return result;
  };

  function snapshotNewestRefund(beforeIds,childId,direction){
    const rec=(state.refunds||[]).slice().reverse().find(function(r){
      return !beforeIds.has(Number(r.id)) && Number(r.childId)===Number(childId) && r.direction===direction;
    });
    if(!rec) return;
    const groupId=operationGroupId(childId,direction);
    const group=byId(state.groups,groupId);
    rec.groupId=groupId;
    rec.project=group?.project || null;
  }

  if(typeof window.saveRefundForChild==='function'){
    const saveRefundChildBeforeV123=window.saveRefundForChild;
    window.saveRefundForChild=function(childId){
      const direction=document.querySelector('#rf-dir')?.value;
      const beforeIds=new Set((state.refunds||[]).map(function(r){return Number(r.id);}));
      const result=saveRefundChildBeforeV123(childId);
      snapshotNewestRefund(beforeIds,childId,direction);
      return result;
    };
  }
  if(typeof window.saveRefund==='function'){
    const saveRefundBeforeV123=window.saveRefund;
    window.saveRefund=function(){
      const childId=Number(document.querySelector('#rf-child')?.value);
      const direction=document.querySelector('#rf-dir')?.value;
      const beforeIds=new Set((state.refunds||[]).map(function(r){return Number(r.id);}));
      const result=saveRefundBeforeV123();
      snapshotNewestRefund(beforeIds,childId,direction);
      return result;
    };
  }

  window.setGroupProjectFilterV123=function(v){
    state.groupProjectFilter=v;
    render();
  };

  window.groups=function(){
    const filtered=(state.groups||[]).filter(function(g){
      return state.groupProjectFilter==='all' || g.project===state.groupProjectFilter;
    });

    let html=pageHead('Группы','Регулярное расписание, площадка, преподаватель, проект и цена','<button class="btn primary" onclick="groupForm(null)">+ Новая группа</button>');
    html+='<div class="toolbar group-project-filter">';
    [['all','Все'],['iCubeRobots','iCubeRobots'],['Зебра','Зебра']].forEach(function(x){
      html+='<button class="btn '+(state.groupProjectFilter===x[0]?'soft':'')+'" onclick="setGroupProjectFilterV123(\''+x[0]+'\')">'+x[1]+'</button>';
    });
    html+='</div>';

    if(!filtered.length) return html+'<div class="card pad"><div class="empty">В этом фильтре групп пока нет.</div></div>';

    html+='<div class="grid cols-3">';
    html+=filtered.map(function(g){
      const kids=groupChildren(g.id);
      const site=byId(state.sites,g.siteId), teacher=byId(state.teachers,g.teacherId);
      const dirClass=g.direction==='Программирование'?'group-direction-program':'group-direction-robot';
      const dirBadge=g.direction==='Программирование'?'purple':'blue';
      return '<div class="card pad clickable group-card '+dirClass+'" onclick="openGroup('+g.id+')">'+
        '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><div style="display:flex;gap:7px;flex-wrap:wrap"><span class="badge '+dirBadge+'">'+g.direction+'</span><span class="badge '+(g.project==='Зебра'?'purple':'gray')+'">'+g.project+'</span></div><span class="badge '+(g.active?'green':'gray')+'">'+(g.active?'Активна':'Неактивна')+'</span></div>'+
        '<h3 style="margin:14px 0 5px">'+g.name+'</h3>'+
        '<div class="info-list" style="margin-top:12px">'+
          '<div class="info-line"><span>Время</span><b>'+(g.startTime||String(g.time||'').split('–')[0])+'–'+(g.endTime||String(g.time||'').split('–')[1]||'')+'</b></div>'+
          '<div class="info-line"><span>Площадка</span><b>'+(site?site.name:'Не выбрана')+'</b></div>'+
          '<div class="info-line"><span>Преподаватель</span><b>'+(teacher?teacher.name:'Не выбран')+'</b></div>'+
          '<div class="info-line"><span>Детей</span><b>'+kids.length+'</b></div>'+
          '<div class="info-line"><span>Цена</span><b>'+(g.price?money(g.price):'Наследуется')+'</b></div>'+
        '</div><div class="group-card-hint">Открыть группу →</div></div>';
    }).join('');
    return html+'</div>';
  };

  function partnerProjects(){
    const projects=Array.from(new Set((state.groups||[]).map(function(g){return g.project;}).filter(function(p){return p&&p!=='iCubeRobots';})));
    return projects.length?projects:['Зебра'];
  }
  function ensurePartnerProject(){
    const projects=partnerProjects();
    if(!projects.includes(state.partnerProject)) state.partnerProject=projects[0];
    return projects;
  }
  function cashKey(project,from,to){return project+'|'+from+'|'+to;}
  function currentCash(){return Number(state.partnerCash[cashKey(state.partnerProject,state.partnerDateFrom,state.partnerDateTo)]||0);}

  function partnerSalary(project,from,to){
    return (state.lessons||[]).filter(function(l){
      const g=byId(state.groups,l.groupId);
      if(!g || g.project!==project || !inPeriod(l.date,from,to)) return false;
      return !!l.emptyTrip || (!!l.done && !l.cancelled);
    }).reduce(function(sum,l){
      return sum + Number((typeof window.salaryCalculation==='function'?window.salaryCalculation(l):{total:0}).total||0);
    },0);
  }

  function partnerCalc(){
    const project=state.partnerProject, from=state.partnerDateFrom, to=state.partnerDateTo;
    const payments=(state.payments||[]).filter(function(p){return inPeriod(p.date,from,to)&&operationProject(p)===project;});
    const refunds=(state.refunds||[]).filter(function(r){return inPeriod(r.date,from,to)&&operationProject(r)===project;});
    const paymentTotal=payments.reduce(function(s,p){return s+Number(p.amount||0);},0);
    const refundTotal=refunds.reduce(function(s,r){return s+Number(r.amount||0);},0);
    const income=paymentTotal-refundTotal;
    const taxRate=Number(state.settings.tax||0);
    const tax=Math.max(0,income)*taxRate/100;
    const salary=partnerSalary(project,from,to);
    const distributable=income-tax-salary;
    const partnerRate=Number(state.settings.partnerShare||0);
    const icubeRate=Number(state.settings.icubeShare||0);
    const partnerShare=distributable*partnerRate/100;
    const icubeShare=distributable*icubeRate/100;
    const cash=currentCash();
    const transfer=partnerShare-cash;
    return {payments:paymentTotal,refunds:refundTotal,income:income,taxRate:taxRate,tax:tax,salary:salary,distributable:distributable,partnerRate:partnerRate,icubeRate:icubeRate,partnerShare:partnerShare,icubeShare:icubeShare,cash:cash,transfer:transfer};
  }

  window.applyPartnerFiltersV123=function(){
    state.partnerProject=document.querySelector('#partner-project')?.value||state.partnerProject;
    state.partnerDateFrom=document.querySelector('#partner-from')?.value||state.partnerDateFrom;
    state.partnerDateTo=document.querySelector('#partner-to')?.value||state.partnerDateTo;
    render();
  };
  window.setPartnerCashV123=function(v){
    state.partnerCash[cashKey(state.partnerProject,state.partnerDateFrom,state.partnerDateTo)]=Number(v||0);
    render();
  };

  window.partner=function(){
    const projects=ensurePartnerProject();
    const c=partnerCalc();

    let html=pageHead('Партнёр','Расчёт по реальным операциям и занятиям партнёрского проекта.');
    html+='<div class="toolbar">';
    html+='<select class="select" id="partner-project" style="max-width:240px">';
    projects.forEach(function(p){html+='<option'+(p===state.partnerProject?' selected':'')+'>'+p+'</option>';});
    html+='</select>';
    html+='<input class="input" id="partner-from" type="date" value="'+state.partnerDateFrom+'" style="max-width:180px">';
    html+='<input class="input" id="partner-to" type="date" value="'+state.partnerDateTo+'" style="max-width:180px">';
    html+='<button class="btn primary" onclick="applyPartnerFiltersV123()">Рассчитать</button>';
    html+='</div>';

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

    html+='<div class="partner-cash-box"><label>Получено партнёром наличными</label><input class="input" type="number" step="1" min="0" value="'+c.cash+'" onchange="setPartnerCashV123(this.value)" placeholder="0"></div>';

    const positive=c.transfer>=0;
    html+='<div class="partner-final '+(positive?'partner-final-pay':'partner-final-return')+'">'+
      '<span>'+(positive?'К переводу партнёру':'Партнёр должен вернуть iCube')+'</span>'+
      '<b>'+money(Math.abs(c.transfer))+'</b>'+
    '</div>';
    html+='</div>';

    html+='<div class="muted mini" style="margin-top:10px">Наличные не прибавляются к выручке повторно: они используются только для финального взаиморасчёта. Налог и доли берутся из настроек.</div>';
    return html;
  };

  render();
})();

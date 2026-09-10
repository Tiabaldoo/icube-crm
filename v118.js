
// iCube CRM v1.1.8 — child cleanup, safe deletion, child-ledger actions and visit rollback.
(function(){
  function fmt(n,digits){
    const v=Number(n||0);
    return Number(v.toFixed(digits==null?4:digits));
  }

  function parseRuDate(s){
    const p=String(s||'').split('.').map(Number);
    return new Date(p[2]||0,(p[1]||1)-1,p[0]||1);
  }

  function childVisitsRows(childId){
    const rows=[];
    state.lessons.forEach(function(l){
      if(l.cancelled) return;
      const own=!!(l.attendance&&l.attendance[childId]);
      const extra=(l.extras||[]).find(function(e){return Number(e.childId)===Number(childId);});
      if(!own&&!extra) return;
      const g=byId(state.groups,l.groupId);
      if(!g) return;
      rows.push({lesson:l,group:g,extra:extra||null});
    });
    return rows.sort(function(a,b){
      return parseRuDate(b.lesson.date)-parseRuDate(a.lesson.date);
    });
  }
  window.childVisitsRowsV118=childVisitsRows;

  function currentEnrollmentForMoney(child, preferredDirection){
    if(!child) return null;
    return (child.enrollments||[]).find(function(e){return e.direction===preferredDirection;}) ||
      (child.enrollments||[])[0] || null;
  }

  function adjustCurrentMoney(childId, amountRub, preferredDirection){
    const child=byId(state.children,childId);
    const e=currentEnrollmentForMoney(child,preferredDirection);
    if(!e) return false;
    const price=Number(effectivePrice(e)||0);
    if(!(price>0)) return false;
    e.balance=Number(e.balance||0)+Number(amountRub||0)/price;
    return true;
  }

  function historicalDirectionPrice(childId,direction,lesson){
    if(lesson?.visitPriceSnapshot && Number(lesson.visitPriceSnapshot[childId])>0){
      return Number(lesson.visitPriceSnapshot[childId]);
    }
    const child=byId(state.children,childId);
    const active=(child?.enrollments||[]).find(function(e){return e.direction===direction;});
    if(active) return Number(effectivePrice(active)||0);

    const history=(child?.enrollmentHistory||[]).filter(function(e){return e.direction===direction && Number(e.price)>0;});
    if(history.length) return Number(history[history.length-1].price);

    const lessonDate=parseRuDate(lesson?.date);
    const payments=(state.payments||[]).filter(function(p){
      return Number(p.childId)===Number(childId) && p.direction===direction && Number(p.price)>0 && parseRuDate(p.date)<=lessonDate;
    }).sort(function(a,b){return parseRuDate(b.date)-parseRuDate(a.date);});
    if(payments.length) return Number(payments[0].price);

    return direction==='Программирование' ? Number(state.settings.codePrice||0) : Number(state.settings.robotPrice||0);
  }

  // Store the exact child lesson price when a lesson is charged.
  const previousConfirmFinish=window.confirmFinish;
  if(typeof previousConfirmFinish==='function'){
    window.confirmFinish=function(){
      const l=byId(state.lessons,state.selectedLesson);
      const g=l?byId(state.groups,l.groupId):null;
      if(l && g && !l.attendanceApplied){
        l.visitPriceSnapshot=l.visitPriceSnapshot||{};
        Object.entries(l.attendance||{}).filter(function(x){return !!x[1];}).forEach(function(x){
          const child=byId(state.children,Number(x[0]));
          const e=(child?.enrollments||[]).find(function(en){return en.direction===g.direction;});
          if(e) l.visitPriceSnapshot[Number(x[0])]=Number(effectivePrice(e)||0);
        });
        (l.extras||[]).filter(function(x){return !x.trial;}).forEach(function(x){
          const child=byId(state.children,x.childId);
          const e=(child?.enrollments||[]).find(function(en){return en.direction===g.direction;});
          if(e) l.visitPriceSnapshot[x.childId]=Number(effectivePrice(e)||0);
        });
      }
      return previousConfirmFinish();
    };
  }

  function childHasVisit(childId){
    return state.lessons.some(function(l){
      return !!(l.attendance&&l.attendance[childId]) ||
        (l.extras||[]).some(function(e){return Number(e.childId)===Number(childId);});
    });
  }

  window.deleteChildPrompt=function(childId){
    const child=byId(state.children,childId);
    if(!child) return;
    const payments=(state.payments||[]).filter(function(p){return Number(p.childId)===Number(childId);}).length;
    const refunds=(state.refunds||[]).filter(function(r){return Number(r.childId)===Number(childId);}).length;
    const visits=childVisitsRows(childId).length;

    if(payments || refunds || visits){
      const reasons=[];
      if(payments) reasons.push('оплаты: '+payments);
      if(refunds) reasons.push('возвраты: '+refunds);
      if(visits) reasons.push('посещения: '+visits);
      modal('<h3>Нельзя удалить ребёнка</h3><div class="notice">У <b>'+child.name+'</b> уже есть история: '+reasons.join(', ')+'. Ребёнка с финансовыми операциями или посещениями удалять нельзя, чтобы не повредить историю CRM.</div><div class="modal-actions"><button class="btn primary" onclick="closeModal()">Понятно</button></div>');
      return;
    }

    modal('<h3>Удалить ребёнка?</h3><div class="notice">У <b>'+child.name+'</b> нет оплат, возвратов и посещений. Карточка будет удалена без возможности восстановления в этом прототипе.</div><div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn danger" onclick="confirmDeleteChild('+childId+')">Удалить ребёнка</button></div>');
  };

  window.confirmDeleteChild=function(childId){
    state.lessons.forEach(function(l){
      if(l.attendance) delete l.attendance[childId];
      if(l.photos) delete l.photos[childId];
      if(l.visitPriceSnapshot) delete l.visitPriceSnapshot[childId];
      l.extras=(l.extras||[]).filter(function(e){return Number(e.childId)!==Number(childId);});
    });
    state.children=state.children.filter(function(c){return Number(c.id)!==Number(childId);});
    state.selectedChild=null;
    state.modal=null;
    state.page='children';
    render();
  };

  window.deleteVisitPrompt=function(childId,lessonId){
    const child=byId(state.children,childId);
    const lesson=byId(state.lessons,lessonId);
    const g=lesson?byId(state.groups,lesson.groupId):null;
    if(!child||!lesson||!g) return;
    const extra=(lesson.extras||[]).find(function(e){return Number(e.childId)===Number(childId);});
    const charged=!!lesson.attendanceApplied && !(extra&&extra.trial);
    const price=charged?historicalDirectionPrice(childId,g.direction,lesson):0;
    const current=currentEnrollmentForMoney(child,g.direction);
    const currentPrice=current?Number(effectivePrice(current)||0):0;
    const addLessons=charged&&currentPrice?price/currentPrice:0;

    let note='Посещение '+lesson.date+' · '+g.direction+' будет удалено.';
    if(charged){
      note+=' За него ранее было списано <b>'+money(price)+'</b>. Эта сумма вернётся в текущий денежный остаток ребёнка';
      if(current) note+=' и составит <b>+'+fmt(addLessons,4)+' занятия</b> по текущей цене '+money(currentPrice)+' / занятие';
      note+='.';
    }else if(extra&&extra.trial){
      note+=' Это ознакомительное посещение, поэтому баланс не изменится.';
    }else{
      note+=' Списание за это посещение ещё не применялось, поэтому баланс не изменится.';
    }

    modal('<h3>Удалить посещение?</h3><div class="notice">'+note+'</div><div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn danger" onclick="confirmDeleteVisit('+childId+','+lessonId+')">Удалить посещение</button></div>');
  };

  window.confirmDeleteVisit=function(childId,lessonId){
    const lesson=byId(state.lessons,lessonId);
    const g=lesson?byId(state.groups,lesson.groupId):null;
    const child=byId(state.children,childId);
    if(!lesson||!g||!child) return;

    const extra=(lesson.extras||[]).find(function(e){return Number(e.childId)===Number(childId);});
    const charged=!!lesson.attendanceApplied && !(extra&&extra.trial);
    if(charged){
      const price=historicalDirectionPrice(childId,g.direction,lesson);
      if(price>0) adjustCurrentMoney(childId,price,g.direction);
    }

    if(extra){
      lesson.extras=(lesson.extras||[]).filter(function(e){return Number(e.childId)!==Number(childId);});
    }else if(lesson.attendance){
      lesson.attendance[childId]=false;
    }
    if(lesson.photos) delete lesson.photos[childId];

    if(lesson.summary){
      const present=Object.values(lesson.attendance||{}).filter(Boolean).length+(lesson.extras||[]).length;
      const trials=(lesson.extras||[]).filter(function(e){return !!e.trial;}).length;
      const missing=Object.entries(lesson.attendance||{}).filter(function(x){return x[1]&&!lesson.photos?.[x[0]];}).length+
        (lesson.extras||[]).filter(function(e){return !lesson.photos?.[e.childId];}).length;
      lesson.summary={present:present,trials:trials,missing:missing};
    }

    state.modal=null;
    state.childTab='visits';
    state.page='child';
    render();
  };

  // Child-specific payment actions return to the child card after completion.
  window.editChildPayment=function(childId,paymentId){
    state.childPaymentEditReturn={childId:Number(childId),paymentId:Number(paymentId)};
    editPayment(paymentId);
  };

  window.deleteChildPayment=function(childId,paymentId){
    const p=byId(state.payments,paymentId);
    if(!p) return;
    modal('<h3>Удалить оплату?</h3><div class="notice">Оплата <b>'+money(p.amount)+'</b> от '+p.date+' будет удалена. Денежный баланс ребёнка будет уменьшен на эту сумму с пересчётом по его текущей цене.</div><div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn danger" onclick="confirmDeleteChildPayment('+childId+','+paymentId+')">Удалить</button></div>');
  };

  window.confirmDeleteChildPayment=function(childId,paymentId){
    const p=byId(state.payments,paymentId);
    if(!p) return;
    adjustCurrentMoney(p.childId,-Number(p.amount||0),p.direction);
    state.payments=state.payments.filter(function(x){return Number(x.id)!==Number(paymentId);});
    state.modal=null;
    state.selectedChild=Number(childId);
    state.childTab='payments';
    state.page='child';
    render();
  };

  // Money is the source of truth when an old payment is corrected after a direction/price change.
  window.savePaymentV116=function(paymentId){
    const childId=Number(document.querySelector('#pf-child').value);
    const direction=document.querySelector('#pf-dir').value;
    const amount=Number(document.querySelector('#pf-amount').value);
    const existing=paymentId?byId(state.payments,paymentId):null;
    const child=byId(state.children,childId);
    const current=(child?.enrollments||[]).find(function(e){return e.direction===direction;});

    if(!(amount>0)){alert('Укажите сумму оплаты.');return;}
    if(!current && !(existing && Number(existing.childId)===childId && existing.direction===direction)){
      alert('Для новой оплаты выберите текущее направление ребёнка.');
      return;
    }

    if(existing){
      adjustCurrentMoney(existing.childId,-Number(existing.amount||0),existing.direction);
    }

    let operationPrice=current?Number(effectivePrice(current)||0):Number(existing?.price||0);
    if(!(operationPrice>0)){
      if(existing) adjustCurrentMoney(existing.childId,Number(existing.amount||0),existing.direction);
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
      price:operationPrice,
      lessons:amount/operationPrice
    };

    if(existing) Object.assign(existing,record);
    else state.payments.push(record);
    adjustCurrentMoney(childId,amount,direction);

    const ret=state.childPaymentEditReturn;
    state.childPaymentEditReturn=null;
    state.modal=null;
    if(ret && existing && Number(ret.paymentId)===Number(existing.id)){
      state.selectedChild=Number(ret.childId);
      state.childTab='payments';
      state.page='child';
    }else{
      state.page='payments';
    }
    render();
  };

  // Global payment delete also uses money, not obsolete historical lesson units.
  window.confirmDeletePayment=function(id){
    const p=byId(state.payments,id);
    if(!p) return;
    adjustCurrentMoney(p.childId,-Number(p.amount||0),p.direction);
    state.payments=state.payments.filter(function(x){return Number(x.id)!==Number(id);});
    state.modal=null;
    state.page='payments';
    render();
  };

  function directionHistoryHtml(c){
    if(!(c.enrollmentHistory||[]).length) return '';
    const rows=c.enrollmentHistory.slice().reverse().map(function(e){
      const g=byId(state.groups,e.groupId);
      const rub=e.moneyBalance!=null?Number(e.moneyBalance):Number(e.balance||0)*Number(e.price||0);
      return '<div class="kpi-line"><div><b>'+e.direction+' → '+e.changedTo+'</b><div class="muted mini">'+(g?g.name:'Без группы')+'</div></div><div style="text-align:right"><span class="badge gray">История</span><div class="muted mini" style="margin-top:4px">перенесено '+money(rub)+'</div></div></div>';
    }).join('');
    return '<div class="card pad" style="margin-top:16px"><div class="section-title"><h2>История переводов</h2><span class="muted mini">денежный остаток</span></div>'+rows+'</div>';
  }

  function childOverviewV118(c){
    const directions=(c.enrollments||[]).map(function(e){
      const g=byId(state.groups,e.groupId);
      return '<div style="border-top:1px solid var(--line);padding:14px 0">'+
        '<div style="display:flex;justify-content:space-between;gap:12px">'+
          '<div><b>'+e.direction+'</b><div class="muted">'+(g?g.name:'Без группы')+'</div></div>'+
          '<div style="text-align:right"><div class="money '+(e.balance<0?'negative':e.balance>0?'positive':'')+'">'+fmt(e.balance,4)+' занятий</div><div class="muted mini">'+money(effectivePrice(e))+' / занятие</div></div>'+
        '</div>'+
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">'+
          '<button class="btn soft" onclick="paymentForm('+c.id+',\''+e.direction+'\')">+ Оплата</button>'+
          '<button class="btn" onclick="manageDirectionForm('+c.id+',\''+e.direction+'\')">Изменить направление / цену</button>'+
        '</div>'+
      '</div>';
    }).join('');

    const payments=(state.payments||[]).filter(function(p){return Number(p.childId)===Number(c.id);}).slice().reverse().slice(0,3);
    const visits=childVisitsRows(c.id).slice(0,3);

    const payMini=payments.length?payments.map(function(p){
      return '<div class="kpi-line"><div><b>'+p.direction+'</b><div class="muted mini">'+p.date+' · '+p.method+'</div></div><div class="money positive">+'+fmt(p.lessons,4)+' · '+money(p.amount)+'</div></div>';
    }).join(''):'<div class="empty">Оплат пока нет</div>';

    const visitMini=visits.length?visits.map(function(x){
      return '<div class="kpi-line clickable" onclick="state.selectedLesson='+x.lesson.id+';state.page=\'lesson\';render()"><div><b>'+x.lesson.date+' · '+x.group.direction+'</b><div class="muted mini">'+(x.lesson.topic||x.group.name)+'</div></div><span class="badge green">Был</span></div>';
    }).join(''):'<div class="empty">Посещений пока нет</div>';

    return '<div class="split">'+
      '<div class="card pad"><div class="section-title"><h2>Направления</h2><span class="badge '+statusBadge(c.status)+'">'+c.status+'</span></div>'+directions+'</div>'+
      '<div class="card pad"><div class="section-title"><h2>Контакты и данные</h2></div><div class="info-list">'+
        '<div class="info-line"><span>Дата рождения</span><b>'+(c.birth||'—')+'</b></div>'+
        '<div class="info-line"><span>Родитель</span><b>'+(c.parent||'—')+'</b></div>'+
        '<div class="info-line"><span>Телефон</span><b>'+(c.phone||'—')+'</b></div>'+
        '<div class="info-line"><span>Примечание</span><span style="text-align:right">'+(c.note||'—')+'</span></div>'+
      '</div></div></div>'+
      directionHistoryHtml(c)+
      '<div class="grid cols-2" style="margin-top:16px">'+
        '<div class="card pad"><div class="section-title"><h2>Последние оплаты</h2><button class="btn" onclick="setChildTab(\'payments\')">Все</button></div>'+payMini+'</div>'+
        '<div class="card pad"><div class="section-title"><h2>История посещений</h2><button class="btn" onclick="setChildTab(\'visits\')">Все</button></div>'+visitMini+'</div>'+
      '</div>';
  }

  function childPaymentsV118(c){
    const rows=(state.payments||[]).filter(function(p){return Number(p.childId)===Number(c.id);}).slice().reverse();
    let html='<div class="card child-ledger-card"><div class="child-ledger-head"><div><h2>Оплаты</h2><div class="muted mini child-ledger-count">'+rows.length+' операций</div></div><button class="btn primary" onclick="paymentForm('+c.id+',\''+((c.enrollments||[])[0]?.direction||'Робототехника')+'\')">+ Оплата</button></div>';
    if(!rows.length) return html+'<div class="empty">Оплат пока нет.</div></div>';
    html+='<div class="list"><div class="row header" style="grid-template-columns:1fr 1.2fr .9fr 1.2fr .7fr 1.2fr"><div>Дата</div><div>Направление</div><div>Сумма</div><div>Способ</div><div>Занятий</div><div></div></div>';
    html+=rows.map(function(p){
      return '<div class="row" style="grid-template-columns:1fr 1.2fr .9fr 1.2fr .7fr 1.2fr">'+
        '<div><b>'+p.date+'</b></div><div>'+p.direction+'</div><div class="money">'+money(p.amount)+'</div><div>'+p.method+'</div><div class="positive">+'+fmt(p.lessons,4)+'</div>'+
        '<div style="display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap"><button class="btn" onclick="editChildPayment('+c.id+','+p.id+')">Изменить</button><button class="btn danger" onclick="deleteChildPayment('+c.id+','+p.id+')">Удалить</button></div>'+
      '</div>';
    }).join('');
    return html+'</div></div>';
  }

  function childVisitsV118(c){
    const rows=childVisitsRows(c.id);
    let html='<div class="card child-ledger-card"><div class="child-ledger-head"><div><h2>Посещения</h2><div class="muted mini child-ledger-count">'+rows.length+' посещений</div></div></div>';
    if(!rows.length) return html+'<div class="empty">Посещений пока нет.</div></div>';
    html+='<div class="list"><div class="row header" style="grid-template-columns:1fr 1fr 1.4fr auto auto auto"><div>Дата</div><div>Направление</div><div>Группа</div><div>Статус</div><div>Тип</div><div></div></div>';
    html+=rows.map(function(x){
      const type=(x.extra?'<span class="badge blue">Добавлен</span>':'')+(x.extra?.trial?' <span class="badge amber">Ознакомительное</span>':'');
      return '<div class="row" style="grid-template-columns:1fr 1fr 1.4fr auto auto auto">'+
        '<div class="clickable" onclick="state.selectedLesson='+x.lesson.id+';state.page=\'lesson\';render()"><b>'+x.lesson.date+'</b><div class="muted mini">'+x.lesson.time+'</div></div>'+
        '<div>'+x.group.direction+'</div><div>'+x.group.name+'</div><div><span class="badge green">Был</span></div><div>'+type+'</div>'+
        '<div><button class="btn danger" onclick="deleteVisitPrompt('+c.id+','+x.lesson.id+')">Удалить</button></div>'+
      '</div>';
    }).join('');
    return html+'</div></div>';
  }

  function childRefundsV118(c){
    const rows=(state.refunds||[]).filter(function(r){return Number(r.childId)===Number(c.id);}).slice().reverse();
    let html='<div class="card child-ledger-card"><div class="child-ledger-head"><div><h2>Возвраты</h2><div class="muted mini child-ledger-count">'+rows.length+' операций</div></div><button class="btn primary" onclick="refundFormForChild('+c.id+')">+ Возврат</button></div>';
    if(!rows.length) return html+'<div class="empty">Возвратов пока нет.</div></div>';
    html+='<div class="list"><div class="row header"><div>Дата</div><div>Направление</div><div>Сумма</div><div>Цена</div><div>Занятий</div></div>';
    html+=rows.map(function(r){
      return '<div class="row"><div><b>'+r.date+'</b></div><div>'+r.direction+'</div><div class="money negative">−'+money(r.amount)+'</div><div>'+money(r.price)+'</div><div>−'+fmt(r.lessons,4)+'</div></div>';
    }).join('');
    return html+'</div></div>';
  }

  // Final child card override.
  window.child=function(){
    const c=byId(state.children,state.selectedChild);
    if(!c) return children();

    let body='';
    if(state.childTab==='payments') body=childPaymentsV118(c);
    else if(state.childTab==='visits') body=childVisitsV118(c);
    else if(state.childTab==='refunds') body=childRefundsV118(c);
    else body=childOverviewV118(c);

    const tabs='<div class="tabs">'+
      '<button class="'+(state.childTab==='overview'?'active':'')+'" onclick="setChildTab(\'overview\')">Обзор</button>'+
      '<button class="'+(state.childTab==='payments'?'active':'')+'" onclick="setChildTab(\'payments\')">Оплаты</button>'+
      '<button class="'+(state.childTab==='visits'?'active':'')+'" onclick="setChildTab(\'visits\')">Посещения</button>'+
      '<button class="'+(state.childTab==='refunds'?'active':'')+'" onclick="setChildTab(\'refunds\')">Возвраты</button>'+
    '</div>';

    return '<button class="btn" style="margin-bottom:14px" onclick="navTo(\'children\')">← Дети</button>'+
      pageHead(c.name,c.school+' · '+c.grade+' · '+c.parent,
        '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" onclick="childForm('+c.id+')">Редактировать</button><button class="btn danger" onclick="deleteChildPrompt('+c.id+')">Удалить ребёнка</button></div>')+
      tabs+body;
  };

  render();
})();

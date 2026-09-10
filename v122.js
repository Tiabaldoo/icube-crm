
// iCube CRM v1.1.12 — trial label in child overview + empty-trip salary independent of completed lesson.
(function(){
  function isTrialVisit(lesson,childId){
    const extra=(lesson?.extras||[]).find(function(e){return Number(e.childId)===Number(childId);});
    if(extra) return !!extra.trial;
    return !!(lesson?.trialChildren && lesson.trialChildren[childId]);
  }

  // In the child's Overview history, show "Ознакомительное" instead of generic "Был".
  const childBeforeV122=window.child;
  window.child=function(){
    let html=childBeforeV122();
    const child=byId(state.children,state.selectedChild);
    if(!child || state.childTab!=='overview') return html;

    const visits=[];
    (state.lessons||[]).forEach(function(l){
      if(l.cancelled && !l.emptyTrip) return;
      const main=!!(l.attendance&&l.attendance[child.id]);
      const extra=(l.extras||[]).some(function(e){return Number(e.childId)===Number(child.id);});
      if(!main&&!extra) return;
      const g=byId(state.groups,l.groupId);
      if(!g) return;
      visits.push({lesson:l,group:g});
    });
    visits.sort(function(a,b){
      const pa=String(a.lesson.date||'').split('.').reverse().join('');
      const pb=String(b.lesson.date||'').split('.').reverse().join('');
      return pb.localeCompare(pa);
    });

    visits.slice(0,3).forEach(function(x){
      if(!isTrialVisit(x.lesson,child.id)) return;
      const marker='<b>'+x.lesson.date+' · '+x.group.direction+'</b>';
      const pos=html.indexOf(marker);
      if(pos<0) return;
      const badgePos=html.indexOf('<span class="badge green">Был</span>',pos);
      if(badgePos<0) return;
      const nextRow=html.indexOf('<div class="kpi-line clickable"',pos+marker.length);
      if(nextRow>=0 && badgePos>nextRow) return;
      html=html.slice(0,badgePos)+
        '<span class="badge amber">Ознакомительное</span>'+
        html.slice(badgePos+'<span class="badge green">Был</span>'.length);
    });
    return html;
  };

  function salaryRatesSnapshotV122(){
    return {
      fix:Number(state.settings.salaryFix||0),
      child:Number(state.settings.salaryChild||0),
      intro:Number(state.settings.salaryIntro||0),
      empty:Number(state.settings.salaryEmpty||0)
    };
  }

  function ensureSalarySnapshotV122(lesson){
    if(!lesson.salarySnapshot) lesson.salarySnapshot=salaryRatesSnapshotV122();
    return lesson.salarySnapshot;
  }

  function salaryPresentCountV122(lesson){
    return Object.values(lesson.attendance||{}).filter(Boolean).length+(lesson.extras||[]).length;
  }

  // Empty trip is paid even when the lesson was cancelled / never conducted.
  window.salaryCalculation=function(lesson){
    const rates=ensureSalarySnapshotV122(lesson);
    const children=salaryPresentCountV122(lesson);

    if(lesson.emptyTrip){
      return {
        type:'Пустой выезд',
        children:0,
        fixed:rates.empty,
        childrenPay:0,
        total:rates.empty,
        rates:rates
      };
    }

    if(lesson.cancelled || !lesson.done){
      return {type:'Не начисляется',children:children,fixed:0,childrenPay:0,total:0,rates:rates};
    }

    if(lesson.intro){
      return {
        type:'Ознакомительное занятие',
        children:children,
        fixed:rates.intro,
        childrenPay:0,
        total:rates.intro,
        rates:rates
      };
    }

    const childrenPay=children*rates.child;
    return {
      type:'Обычное занятие',
      children:children,
      fixed:rates.fix,
      childrenPay:childrenPay,
      total:rates.fix+childrenPay,
      rates:rates
    };
  };

  function parseSalaryDateV122(ru){
    const p=String(ru).split('.').map(Number);
    return new Date(p[2],p[1]-1,p[0]);
  }
  function isoToDateV122(iso){
    const p=String(iso).split('-').map(Number);
    return new Date(p[0],p[1]-1,p[2]);
  }

  function salaryRowsV122(){
    const teacherId=Number(state.salaryTeacher);
    const from=isoToDateV122(state.salaryDateFrom);
    const to=isoToDateV122(state.salaryDateTo);
    to.setHours(23,59,59,999);

    return (state.lessons||[])
      .filter(function(l){
        // Normal salary rows need done; empty trip does not.
        if(!l.emptyTrip && (!l.done || l.cancelled)) return false;
        if(Number(l.teacherId)!==teacherId) return false;
        const d=parseSalaryDateV122(l.date);
        return d>=from && d<=to;
      })
      .map(function(l){
        return {lesson:l,group:byId(state.groups,l.groupId),calc:salaryCalculation(l)};
      })
      .sort(function(a,b){
        return parseSalaryDateV122(a.lesson.date)-parseSalaryDateV122(b.lesson.date) ||
          String(a.lesson.time).localeCompare(String(b.lesson.time));
      });
  }

  window.salary=function(){
    const rows=salaryRowsV122();
    const total=rows.reduce(function(sum,x){return sum+x.calc.total;},0);

    let html=pageHead(
      'Зарплата',
      'Расчёт по проведённым занятиям и пустым выездам фактического преподавателя.',
      '<button class="btn">Скачать PDF</button>'
    );

    html+='<div class="toolbar">';
    html+='<select class="select" id="salary-teacher" style="max-width:260px">';
    state.teachers.forEach(function(t){
      html+='<option value="'+t.id+'"'+(String(t.id)===String(state.salaryTeacher)?' selected':'')+'>'+t.name+(t.active===false?' · неактивен':'')+'</option>';
    });
    html+='</select>';
    html+='<input class="input" id="salary-from" type="date" value="'+state.salaryDateFrom+'" style="max-width:180px">';
    html+='<input class="input" id="salary-to" type="date" value="'+state.salaryDateTo+'" style="max-width:180px">';
    html+='<button class="btn primary" onclick="applySalaryFilters()">Применить</button>';
    html+='</div>';

    html+='<div class="card child-ledger-card">';
    html+='<div class="child-ledger-head"><div><h2>Табель</h2><div class="muted mini child-ledger-count">'+rows.length+' начислений</div></div>';
    const teacher=byId(state.teachers,Number(state.salaryTeacher));
    html+='<div style="text-align:right"><div class="muted mini">Преподаватель</div><b>'+(teacher?teacher.name:'—')+'</b></div></div>';

    if(!rows.length){
      html+='<div class="empty">За выбранный период начислений нет.</div>';
    }else{
      html+='<div class="list"><div class="row header salary-row"><div>Дата / группа</div><div>Детей</div><div>Фикс</div><div>За детей</div><div>Итого</div></div>';
      html+=rows.map(function(x){
        const l=x.lesson,g=x.group,c=x.calc;
        const site=g?byId(state.sites,g.siteId):null;
        const typeBadge=c.type==='Пустой выезд'
          ? '<span class="badge amber">Пустой выезд</span>'
          : c.type==='Ознакомительное занятие'
          ? '<span class="badge purple">Ознакомительное</span>'
          : '';
        return '<div class="row salary-row">'+
          '<div><b>'+l.date+' · '+(g?g.name:'Группа')+'</b><div class="muted mini">'+l.time+(site?' · '+site.name:'')+'</div><div style="margin-top:5px">'+typeBadge+'</div></div>'+
          '<div><b>'+c.children+'</b></div>'+
          '<div>'+money(c.fixed)+'</div>'+
          '<div>'+money(c.childrenPay)+'</div>'+
          '<div class="money"><b>'+money(c.total)+'</b></div>'+
        '</div>';
      }).join('');
      html+='</div>';
    }
    html+='</div>';

    html+='<div class="card pad" style="margin-top:16px;display:flex;justify-content:space-between;align-items:center;gap:16px"><div><b style="font-size:18px">Итого за период</b><div class="muted mini" style="margin-top:3px">Пустой выезд считается отдельным начислением и не требует статуса «Проведено».</div></div><b style="font-size:24px">'+money(total)+'</b></div>';
    html+='<div class="notice" style="margin-top:16px">Обычное занятие: '+money(state.settings.salaryFix)+' + '+money(state.settings.salaryChild)+' × присутствующие. Пустой выезд: '+money(state.settings.salaryEmpty)+'. Отменённое занятие без отметки «Пустой выезд» не оплачивается.</div>';

    return html;
  };

  // Director lesson page: explain empty trip semantics next to existing checkbox.
  const lessonBeforeV122=window.lesson;
  window.lesson=function(){
    let html=lessonBeforeV122();
    const l=byId(state.lessons,state.selectedLesson);
    if(!l) return html;

    const old='<label class="student-check"><input type="checkbox" '+(l.emptyTrip?'checked':'')+' onchange="lToggle(\'emptyTrip\',this.checked)"><span><b>Пустой выезд</b></span></label>';
    const replacement='<label class="student-check"><input type="checkbox" '+(l.emptyTrip?'checked':'')+' onchange="lToggle(\'emptyTrip\',this.checked)"><span><b>Пустой выезд</b><div class="muted mini">Занятие не проводилось, но выезд преподавателя оплачивается отдельно.</div></span></label>';
    html=html.replace(old,replacement);
    return html;
  };

  render();
})();

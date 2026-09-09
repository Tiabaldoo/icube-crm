
// iCube CRM v1.1.4 — real salary ledger from completed concrete lessons.
(function () {
  state.salaryTeacher = state.salaryTeacher || String((state.teachers.find(function(t){return t.active!==false;}) || state.teachers[0] || {id:1}).id);
  state.salaryDateFrom = state.salaryDateFrom || '2026-08-10';
  state.salaryDateTo = state.salaryDateTo || '2026-09-10';

  function salaryRatesSnapshot() {
    return {
      fix:Number(state.settings.salaryFix || 0),
      child:Number(state.settings.salaryChild || 0),
      intro:Number(state.settings.salaryIntro || 0),
      empty:Number(state.settings.salaryEmpty || 0)
    };
  }

  window.ensureSalarySnapshot = function (lesson) {
    if (!lesson) return null;
    if (!lesson.salarySnapshot) {
      lesson.salarySnapshot = salaryRatesSnapshot();
    }
    return lesson.salarySnapshot;
  };

  const previousConfirmFinish = window.confirmFinish;
  if (typeof previousConfirmFinish === 'function') {
    window.confirmFinish = function () {
      const lesson = byId(state.lessons,state.selectedLesson);
      ensureSalarySnapshot(lesson);
      return previousConfirmFinish();
    };
  }

  function salaryPresentCount(lesson) {
    return Object.values(lesson.attendance || {}).filter(Boolean).length +
      (lesson.extras || []).length;
  }

  function salaryCalculation(lesson) {
    const rates = ensureSalarySnapshot(lesson) || salaryRatesSnapshot();
    const children = salaryPresentCount(lesson);

    if (lesson.cancelled || !lesson.done) {
      return {type:'Не начисляется',children:children,fixed:0,childrenPay:0,total:0,rates:rates};
    }

    if (lesson.emptyTrip) {
      return {
        type:'Пустой выезд',
        children:children,
        fixed:rates.empty,
        childrenPay:0,
        total:rates.empty,
        rates:rates
      };
    }

    if (lesson.intro) {
      return {
        type:'Ознакомительное занятие',
        children:children,
        fixed:rates.intro,
        childrenPay:0,
        total:rates.intro,
        rates:rates
      };
    }

    const childrenPay = children * rates.child;
    return {
      type:'Обычное занятие',
      children:children,
      fixed:rates.fix,
      childrenPay:childrenPay,
      total:rates.fix + childrenPay,
      rates:rates
    };
  }
  window.salaryCalculation = salaryCalculation;

  function parseSalaryDate(ru) {
    const p=String(ru).split('.').map(Number);
    return new Date(p[2],p[1]-1,p[0]);
  }

  function isoToDate(iso) {
    const p=String(iso).split('-').map(Number);
    return new Date(p[0],p[1]-1,p[2]);
  }

  function salaryRows() {
    const teacherId=Number(state.salaryTeacher);
    const from=isoToDate(state.salaryDateFrom);
    const to=isoToDate(state.salaryDateTo);
    to.setHours(23,59,59,999);

    return state.lessons
      .filter(function(l){
        if (!l.done || l.cancelled) return false;
        if (Number(l.teacherId)!==teacherId) return false;
        const d=parseSalaryDate(l.date);
        return d>=from && d<=to;
      })
      .map(function(l){
        return {lesson:l,group:byId(state.groups,l.groupId),calc:salaryCalculation(l)};
      })
      .sort(function(a,b){
        return parseSalaryDate(a.lesson.date)-parseSalaryDate(b.lesson.date) ||
          String(a.lesson.time).localeCompare(String(b.lesson.time));
      });
  }

  window.applySalaryFilters = function () {
    state.salaryTeacher=document.querySelector('#salary-teacher').value;
    state.salaryDateFrom=document.querySelector('#salary-from').value;
    state.salaryDateTo=document.querySelector('#salary-to').value;
    render();
  };

  window.salary = function () {
    const rows=salaryRows();
    const total=rows.reduce(function(sum,x){return sum+x.calc.total;},0);

    let html=pageHead(
      'Зарплата',
      'Расчёт по фактически проведённым занятиям и фактическому преподавателю.',
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
    html+='<div class="child-ledger-head"><div><h2>Табель</h2><div class="muted mini child-ledger-count">'+rows.length+' проведённых занятий</div></div>';
    const teacher=byId(state.teachers,Number(state.salaryTeacher));
    html+='<div style="text-align:right"><div class="muted mini">Преподаватель</div><b>'+(teacher?teacher.name:'—')+'</b></div></div>';

    if (!rows.length) {
      html+='<div class="empty">За выбранный период проведённых занятий нет.</div>';
    } else {
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

    html+='<div class="card pad" style="margin-top:16px;display:flex;justify-content:space-between;align-items:center;gap:16px"><div><b style="font-size:18px">Итого за период</b><div class="muted mini" style="margin-top:3px">Исторические ставки зафиксированы внутри проведённых занятий.</div></div><b style="font-size:24px">'+money(total)+'</b></div>';

    html+='<div class="notice" style="margin-top:16px">Обычное занятие: '+money(state.settings.salaryFix)+' + '+money(state.settings.salaryChild)+' × присутствующие. Индивидуальные пробные и добавленные дети учитываются в количестве присутствующих. Замена преподавателя начисляется фактическому преподавателю конкретного занятия.</div>';

    return html;
  };

  render();
})();

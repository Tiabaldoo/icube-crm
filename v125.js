
// iCube CRM v1.1.15 — club effectiveness statistics.
(function(){
  state.statsDateFrom = state.statsDateFrom || '2026-09-01';
  state.statsDateTo = state.statsDateTo || '2026-09-30';
  state.statsProject = state.statsProject || 'all';
  state.statsDirection = state.statsDirection || 'all';
  state.statsMetric = state.statsMetric || 'attendance';

  function esc(s){
    return String(s??'').replace(/[&<>"']/g,function(ch){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
    });
  }
  function ruDate(s){
    const p=String(s||'').split('.').map(Number);
    return new Date(p[2]||0,(p[1]||1)-1,p[0]||1);
  }
  function isoDate(s){
    const p=String(s||'').slice(0,10).split('-').map(Number);
    return new Date(p[0]||0,(p[1]||1)-1,p[2]||1);
  }
  function isoToday(){
    const d=new Date();
    const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
    return y+'-'+m+'-'+day;
  }
  function inRangeDate(d,from,to){
    const a=isoDate(from),b=isoDate(to); b.setHours(23,59,59,999);
    return d>=a && d<=b;
  }
  function pct(n,d){
    return d>0 ? Math.round(n/d*100) : 0;
  }
  function pluralChildren(n){
    const x=Math.abs(Number(n))%100, y=x%10;
    if(x>10&&x<20) return 'детей';
    if(y===1) return 'ребёнок';
    if(y>=2&&y<=4) return 'ребёнка';
    return 'детей';
  }
  function groupMatches(g,project,direction){
    if(!g) return false;
    if(project!=='all' && g.project!==project) return false;
    if(direction!=='all' && g.direction!==direction) return false;
    return true;
  }
  function completedLesson(l){
    return !!l && !!l.done && !l.cancelled;
  }
  function lessonExpectedIds(l){
    return Object.keys(l.attendance||{}).map(Number).filter(function(id){
      return !(l.trialChildren && l.trialChildren[id]);
    });
  }
  function lessonCounts(l){
    const ids=lessonExpectedIds(l);
    let present=0;
    ids.forEach(function(id){ if(l.attendance && l.attendance[id]) present++; });
    return {expected:ids.length,present:present,missed:Math.max(0,ids.length-present)};
  }
  function filteredLessons(from,to,project,direction){
    return (state.lessons||[]).filter(function(l){
      if(!completedLesson(l) || !inRangeDate(ruDate(l.date),from,to)) return false;
      return groupMatches(byId(state.groups,l.groupId),project,direction);
    });
  }
  function attendanceSummary(from,to,project,direction){
    return filteredLessons(from,to,project,direction).reduce(function(a,l){
      const c=lessonCounts(l);
      a.expected+=c.expected; a.present+=c.present; a.missed+=c.missed;
      return a;
    },{expected:0,present:0,missed:0});
  }
  function scopeChildIds(project,direction){
    const ids=new Set();
    (state.children||[]).forEach(function(c){
      (c.enrollments||[]).forEach(function(e){
        const g=e.groupId!=null?byId(state.groups,e.groupId):null;
        if(groupMatches(g,project,direction)) ids.add(Number(c.id));
      });
      (c.enrollmentHistory||[]).forEach(function(e){
        const g=e.groupId!=null?byId(state.groups,e.groupId):null;
        if(groupMatches(g,project,direction)) ids.add(Number(c.id));
      });
    });
    return ids;
  }
  function firstPermanentVisit(childId,project,direction){
    const rows=[];
    (state.lessons||[]).forEach(function(l){
      if(!completedLesson(l)) return;
      const g=byId(state.groups,l.groupId);
      if(!groupMatches(g,project,direction)) return;
      const main=!!(l.attendance&&l.attendance[childId]);
      const mainTrial=!!(l.trialChildren&&l.trialChildren[childId]);
      const ex=(l.extras||[]).find(function(x){return Number(x.childId)===Number(childId);});
      if((main&&!mainTrial) || (ex&&!ex.trial)) rows.push(l);
    });
    rows.sort(function(a,b){return ruDate(a.date)-ruDate(b.date);});
    return rows[0]||null;
  }
  function newChildren(from,to,project,direction){
    const result=[];
    scopeChildIds(project,direction).forEach(function(id){
      const l=firstPermanentVisit(id,project,direction);
      if(l && inRangeDate(ruDate(l.date),from,to)) result.push(id);
    });
    return result;
  }
  function leftEvents(from,to,project,direction){
    const out=[];
    (state.children||[]).forEach(function(c){
      (c.statusHistory||[]).forEach(function(h){
        if(h.to!=='Закончил') return;
        const d=isoDate(h.date);
        if(!inRangeDate(d,from,to)) return;
        if(project!=='all' && h.project!==project) return;
        if(direction!=='all' && h.direction!==direction) return;
        out.push({childId:c.id,event:h});
      });
    });
    return out;
  }
  function denominatorForPeople(from,to,project,direction){
    const ids=new Set();
    filteredLessons(from,to,project,direction).forEach(function(l){
      lessonExpectedIds(l).forEach(function(id){ids.add(id);});
    });
    scopeChildIds(project,direction).forEach(function(id){ids.add(id);});
    return ids.size;
  }
  function siteName(g){
    const s=g?byId(state.sites,g.siteId):null;
    return s?s.name:'—';
  }
  function shortGroup(g){
    const d=g.direction==='Робототехника'?'Р':'П';
    const day=String(g.day||'').slice(0,2);
    const time=g.startTime||String(g.time||'').split('–')[0]||'';
    return d+', '+day+', '+siteName(g)+', '+time;
  }
  function groupStats(g,from,to){
    const lessons=(state.lessons||[]).filter(function(l){
      return completedLesson(l) && Number(l.groupId)===Number(g.id) && inRangeDate(ruDate(l.date),from,to);
    });
    let expected=0,present=0,missed=0;
    lessons.forEach(function(l){
      const c=lessonCounts(l); expected+=c.expected; present+=c.present; missed+=c.missed;
    });
    const kids=groupChildren(g.id).length;
    return {
      kids:kids,
      fill:Math.round(kids/8*100),
      attendance:pct(present,expected),
      misses:pct(missed,expected),
      expected:expected
    };
  }
  function monthKey(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');}
  function monthLabel(key){
    const p=key.split('-').map(Number);
    const names=['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
    return names[p[1]-1]+' '+String(p[0]).slice(2);
  }
  function monthsBetween(from,to){
    const a=isoDate(from),b=isoDate(to),out=[];
    let d=new Date(a.getFullYear(),a.getMonth(),1);
    const end=new Date(b.getFullYear(),b.getMonth(),1);
    while(d<=end && out.length<24){
      out.push(monthKey(d)); d=new Date(d.getFullYear(),d.getMonth()+1,1);
    }
    return out;
  }
  function monthBounds(key){
    const p=key.split('-').map(Number);
    const a=new Date(p[0],p[1]-1,1), b=new Date(p[0],p[1],0);
    const fmt=function(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
    return {from:fmt(a),to:fmt(b)};
  }
  function metricValue(metric,from,to,project,direction){
    if(metric==='attendance' || metric==='misses'){
      const a=attendanceSummary(from,to,project,direction);
      return metric==='attendance'?pct(a.present,a.expected):pct(a.missed,a.expected);
    }
    const den=denominatorForPeople(from,to,project,direction);
    if(metric==='new') return pct(newChildren(from,to,project,direction).length,den);
    return pct(leftEvents(from,to,project,direction).length,den);
  }
  function chartSvg(points){
    const W=820,H=240,L=46,R=18,T=22,B=42;
    if(!points.length) return '<div class="empty">Нет данных для графика.</div>';
    const innerW=W-L-R, innerH=H-T-B;
    const max=Math.max(100,...points.map(function(p){return p.value;}));
    const x=function(i){return points.length===1?L+innerW/2:L+i*innerW/(points.length-1);};
    const y=function(v){return T+innerH-(v/max)*innerH;};
    let s='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Динамика статистики" style="width:100%;height:auto;display:block">';
    [0,25,50,75,100].forEach(function(v){
      const yy=y(v);
      s+='<line x1="'+L+'" y1="'+yy+'" x2="'+(W-R)+'" y2="'+yy+'" stroke="#e5e7eb" stroke-width="1"/>';
      s+='<text x="'+(L-8)+'" y="'+(yy+4)+'" text-anchor="end" font-size="11" fill="#667085">'+v+'%</text>';
    });
    const path=points.map(function(p,i){return (i?'L':'M')+x(i)+' '+y(p.value);}).join(' ');
    s+='<path d="'+path+'" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>';
    points.forEach(function(p,i){
      s+='<circle cx="'+x(i)+'" cy="'+y(p.value)+'" r="5" fill="white" stroke="currentColor" stroke-width="3"/>';
      s+='<text x="'+x(i)+'" y="'+(y(p.value)-10)+'" text-anchor="middle" font-size="12" font-weight="700" fill="#101828">'+p.value+'%</text>';
      s+='<text x="'+x(i)+'" y="'+(H-14)+'" text-anchor="middle" font-size="11" fill="#667085">'+p.label+'</text>';
    });
    return s+'</svg>';
  }

  window.applyStatsFiltersV125=function(){
    state.statsDateFrom=document.querySelector('#stats-from')?.value||state.statsDateFrom;
    state.statsDateTo=document.querySelector('#stats-to')?.value||state.statsDateTo;
    state.statsProject=document.querySelector('#stats-project')?.value||state.statsProject;
    state.statsDirection=document.querySelector('#stats-direction')?.value||state.statsDirection;
    render();
  };
  window.setStatsMetricV125=function(metric){
    state.statsMetric=metric; render();
  };

  // Keep a simple real status history from now on so "Ушли" is based on CRM events.
  if(typeof window.saveChild==='function'){
    const saveChildBeforeStats=window.saveChild;
    window.saveChild=function(id){
      const before=id?byId(state.children,id):null;
      const oldStatus=before?.status;
      const snapshot=before ? {
        project:(function(){
          const e=(before.enrollments||[])[0],g=e&&e.groupId!=null?byId(state.groups,e.groupId):null;
          return g?.project||null;
        })(),
        direction:(before.enrollments||[])[0]?.direction||null
      } : null;
      const result=saveChildBeforeStats(id);
      const child=byId(state.children,id||state.selectedChild);
      if(child && !child.createdAt) child.createdAt=new Date().toISOString();
      if(child && id && oldStatus && oldStatus!==child.status){
        child.statusHistory=child.statusHistory||[];
        child.statusHistory.push({
          from:oldStatus,to:child.status,date:isoToday(),
          project:snapshot?.project||null,direction:snapshot?.direction||null
        });
      }
      return result;
    };
  }

  window.stats=function(){
    const from=state.statsDateFrom,to=state.statsDateTo,project=state.statsProject,direction=state.statsDirection;
    const att=attendanceSummary(from,to,project,direction);
    const attendance=pct(att.present,att.expected), misses=pct(att.missed,att.expected);
    const newIds=newChildren(from,to,project,direction);
    const left=leftEvents(from,to,project,direction);
    const peopleDen=denominatorForPeople(from,to,project,direction);
    const newPct=pct(newIds.length,peopleDen), leftPct=pct(left.length,peopleDen);

    let html=pageHead('Статистика','Посещаемость, движение детей, заполненность групп и динамика по реальным данным CRM.');
    html+='<div class="toolbar" style="align-items:end;flex-wrap:wrap">';
    html+='<div class="field" style="min-width:160px"><label>Период: от</label><input class="input" id="stats-from" type="date" value="'+from+'"></div>';
    html+='<div class="field" style="min-width:160px"><label>До</label><input class="input" id="stats-to" type="date" value="'+to+'"></div>';
    html+='<div class="field" style="min-width:190px"><label>Проект</label><select class="select" id="stats-project"><option value="all">Все</option><option value="iCubeRobots"'+(project==='iCubeRobots'?' selected':'')+'>iCubeRobots</option><option value="Зебра"'+(project==='Зебра'?' selected':'')+'>Зебра</option></select></div>';
    html+='<div class="field" style="min-width:210px"><label>Направление</label><select class="select" id="stats-direction"><option value="all">Все</option><option value="Робототехника"'+(direction==='Робототехника'?' selected':'')+'>Робототехника</option><option value="Программирование"'+(direction==='Программирование'?' selected':'')+'>Программирование</option></select></div>';
    html+='<button class="btn primary" onclick="applyStatsFiltersV125()">Применить</button></div>';

    html+='<div class="grid cols-4">';
    html+='<div class="card metric"><div class="label">Посещаемость</div><div class="value">'+attendance+'%</div><div class="sub">'+att.present+' из '+att.expected+' посещений по расписанию</div></div>';
    html+='<div class="card metric"><div class="label">Пропуски</div><div class="value">'+misses+'%</div><div class="sub">'+att.missed+' пропусков</div></div>';
    html+='<div class="card metric"><div class="label">Новые дети</div><div class="value">'+newPct+'%</div><div class="sub">'+newIds.length+' '+pluralChildren(newIds.length)+'</div></div>';
    html+='<div class="card metric"><div class="label">Ушли</div><div class="value">'+leftPct+'%</div><div class="sub">'+left.length+' '+pluralChildren(left.length)+'</div></div>';
    html+='</div>';

    const groups=(state.groups||[]).filter(function(g){return groupMatches(g,project,direction);});
    html+='<div class="card child-ledger-card" style="margin-top:16px"><div class="child-ledger-head"><div><h2>Эффективность групп</h2><div class="muted mini child-ledger-count">Нормальная вместимость — 8 детей</div></div></div>';
    if(!groups.length){
      html+='<div class="empty">По выбранным фильтрам групп нет.</div>';
    }else{
      html+='<div class="list"><div class="row header" style="grid-template-columns:2.2fr .7fr 1fr 1fr 1fr"><div>Группа</div><div>Детей</div><div>Заполненность</div><div>Посещаемость</div><div>Пропуски</div></div>';
      html+=groups.map(function(g){
        const s=groupStats(g,from,to);
        const noData=s.expected===0;
        return '<div class="row" style="grid-template-columns:2.2fr .7fr 1fr 1fr 1fr">'+
          '<div><b>'+esc(shortGroup(g))+'</b><div class="muted mini">'+esc(g.name)+' · '+esc(g.project)+'</div></div>'+
          '<div><b>'+s.kids+'</b></div>'+
          '<div><b>'+s.fill+'%</b></div>'+
          '<div>'+(noData?'—':'<b>'+s.attendance+'%</b>')+'</div>'+
          '<div>'+(noData?'—':s.misses+'%')+'</div>'+
        '</div>';
      }).join('');
      html+='</div>';
    }
    html+='</div>';

    const metricNames={attendance:'Посещаемость',misses:'Пропуски',new:'Новые дети',left:'Ушли'};
    const months=monthsBetween(from,to);
    const points=months.map(function(k){
      const b=monthBounds(k);
      return {label:monthLabel(k),value:metricValue(state.statsMetric,b.from,b.to,project,direction)};
    });
    html+='<div class="card pad" style="margin-top:16px"><div class="section-title"><div><h2>Динамика</h2><div class="muted mini">По месяцам · '+metricNames[state.statsMetric]+'</div></div></div>';
    html+='<div class="tabs" style="margin-bottom:12px">';
    Object.keys(metricNames).forEach(function(k){
      html+='<button class="'+(state.statsMetric===k?'active':'')+'" onclick="setStatsMetricV125(\''+k+'\')">'+metricNames[k]+'</button>';
    });
    html+='</div>';
    html+='<div style="color:#2563eb">'+chartSvg(points)+'</div></div>';

    html+='<div class="muted mini" style="margin-top:10px">В посещаемость и пропуски входят только проведённые занятия и только постоянные ученики по расписанию. Ознакомительные и отменённые занятия не учитываются. «Новые дети» определяются по первому обычному посещению в выбранном проекте/направлении. Статус «Ушли» считается по сохранённой истории изменения статуса на «Закончил».</div>';
    return html;
  };

  render();
})();

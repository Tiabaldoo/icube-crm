// iCube CRM v1.1.36 — compact Groups filters: project + activity.
(function(){
  if(!state.groupProjectFilterV136) state.groupProjectFilterV136='all';
  if(!state.groupStatusFilterV136) state.groupStatusFilterV136='active';

  function projectOptions(){
    const seen=[];
    (state.groups||[]).forEach(function(g){
      const p=String(g.project||'').trim();
      if(p && !seen.includes(p)) seen.push(p);
    });
    return seen;
  }

  window.setGroupProjectFilterV136=function(value){
    state.groupProjectFilterV136=value||'all';
    render();
  };

  window.setGroupStatusFilterV136=function(value){
    state.groupStatusFilterV136=value||'active';
    render();
  };

  window.groups=function(){
    const project=state.groupProjectFilterV136||'all';
    const status=state.groupStatusFilterV136||'active';

    let rows=(state.groups||[]).filter(function(g){
      const projectOk=project==='all'||String(g.project||'')===project;
      const statusOk=status==='all'||(status==='active'?g.active!==false:g.active===false);
      return projectOk&&statusOk;
    });

    if(typeof window.sortedGroupsForDisplayV135==='function') rows=window.sortedGroupsForDisplayV135(rows);

    const projects=projectOptions();
    let html=pageHead(
      'Группы',
      'Регулярное расписание, площадка, преподаватель, проект и цена',
      '<button class="btn primary" onclick="groupForm(null)">+ Новая группа</button>'
    );

    html+='<div class="toolbar group-filters-v136" style="margin-bottom:16px">';
    html+='<select class="select" style="width:auto;min-width:190px" onchange="setGroupProjectFilterV136(this.value)">';
    html+='<option value="all"'+(project==='all'?' selected':'')+'>Все проекты</option>';
    projects.forEach(function(p){
      html+='<option value="'+p.replace(/"/g,'&quot;')+'"'+(project===p?' selected':'')+'>'+p+'</option>';
    });
    html+='</select>';

    html+='<select class="select" style="width:auto;min-width:170px" onchange="setGroupStatusFilterV136(this.value)">';
    html+='<option value="active"'+(status==='active'?' selected':'')+'>Активные</option>';
    html+='<option value="inactive"'+(status==='inactive'?' selected':'')+'>Неактивные</option>';
    html+='<option value="all"'+(status==='all'?' selected':'')+'>Все</option>';
    html+='</select></div>';

    if(!rows.length){
      html+='<div class="card empty">Нет групп по выбранным фильтрам.</div>';
      return html;
    }

    html+='<div class="grid cols-3">';
    html+=rows.map(function(g){
      const kids=groupChildren(g.id);
      const site=byId(state.sites,g.siteId);
      const teacher=byId(state.teachers,g.teacherId);
      const dirBadge=g.direction==='Программирование'?'purple':'blue';
      const projectBadge=g.project==='Зебра'?'purple':'gray';
      return '<div class="card pad clickable group-card" onclick="openGroup('+g.id+')">'+
        '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap">'+
          '<div style="display:flex;gap:8px;flex-wrap:wrap">'+
            '<span class="badge '+dirBadge+'">'+g.direction+'</span>'+
            '<span class="badge '+projectBadge+'">'+(g.project||'—')+'</span>'+
          '</div>'+
          '<span class="badge '+(g.active!==false?'green':'gray')+'">'+(g.active!==false?'Активна':'Неактивна')+'</span>'+
        '</div>'+
        '<h3 style="margin:14px 0 5px">'+g.name+'</h3>'+
        '<div class="info-list" style="margin-top:12px">'+
          '<div class="info-line"><span>Время</span><b>'+(g.startTime||String(g.time||'').split('–')[0]||'—')+'–'+(g.endTime||String(g.time||'').split('–')[1]||'—')+'</b></div>'+
          '<div class="info-line"><span>Площадка</span><b>'+(site?.shortName||site?.name||'—')+'</b></div>'+
          '<div class="info-line"><span>Преподаватель</span><b>'+(teacher?.name||'—')+'</b></div>'+
          '<div class="info-line"><span>Детей</span><b>'+kids.length+'</b></div>'+
          '<div class="info-line"><span>Цена</span><b>'+(g.price?money(g.price):'Наследуется')+'</b></div>'+
        '</div></div>';
    }).join('');
    html+='</div>';
    return html;
  };

  render();
})();

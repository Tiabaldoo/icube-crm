// iCube CRM v1.1.32 — add a second independent direction to a child.
(function(){
  const ALL_DIRECTIONS=['Робототехника','Программирование'];

  function childById(id){ return byId(state.children,Number(id)); }

  function availableDirections(child){
    const existing=(child?.enrollments||[]).map(function(e){return e.direction;});
    return ALL_DIRECTIONS.filter(function(d){return !existing.includes(d);});
  }

  function basePriceFor(direction,groupId){
    const g=groupId!=null ? byId(state.groups,Number(groupId)) : null;
    if(g && g.price!=null) return Number(g.price);
    return direction==='Программирование' ? Number(state.settings.codePrice||0) : Number(state.settings.robotPrice||0);
  }

  function groupsHtml(direction){
    let html='<option value="">Без группы</option>';
    (state.groups||[]).filter(function(g){
      return g.active!==false && g.direction===direction;
    }).forEach(function(g){
      html+='<option value="'+g.id+'">'+g.name+'</option>';
    });
    return html;
  }

  window.refreshAddDirectionGroupsV132=function(){
    const direction=document.querySelector('#ad-dir')?.value;
    const box=document.querySelector('#ad-group');
    if(!box) return;
    box.innerHTML=groupsHtml(direction);
    refreshAddDirectionPreviewV132();
  };

  window.toggleAddDirectionPriceV132=function(){
    const individual=document.querySelector('#ad-price-mode')?.value==='individual';
    const wrap=document.querySelector('#ad-individual-wrap');
    if(wrap) wrap.style.display=individual?'block':'none';
    refreshAddDirectionPreviewV132();
  };

  window.refreshAddDirectionPreviewV132=function(){
    const box=document.querySelector('#ad-preview');
    if(!box) return;
    const direction=document.querySelector('#ad-dir')?.value;
    const rawGroup=document.querySelector('#ad-group')?.value;
    const groupId=rawGroup ? Number(rawGroup) : null;
    const individual=document.querySelector('#ad-price-mode')?.value==='individual';
    const packagePrice=Number(document.querySelector('#ad-individual-package')?.value||0);
    const lessonPrice=individual ? (packagePrice>0?packagePrice/4:0) : basePriceFor(direction,groupId);
    const group=groupId!=null ? byId(state.groups,groupId) : null;

    box.innerHTML='<div class="info-list">'+
      '<div class="info-line"><span>Направление</span><b>'+direction+'</b></div>'+
      '<div class="info-line"><span>Группа</span><b>'+(group?group.name:'Без группы')+'</b></div>'+
      '<div class="info-line"><span>Цена абонемента</span><b>'+(lessonPrice>0?money(lessonPrice*4):'—')+'</b></div>'+
      '<div class="info-line"><span>Цена занятия</span><b>'+(lessonPrice>0?money(lessonPrice):'—')+'</b></div>'+
      '</div>'+
      '<div class="muted mini" style="margin-top:10px">Новое направление создаётся отдельно: свой баланс, своя группа и своя цена.</div>';
  };

  window.addDirectionFormV132=function(childId){
    const child=childById(childId);
    if(!child) return;
    const dirs=availableDirections(child);
    if(!dirs.length){
      alert('У ребёнка уже добавлены оба направления.');
      return;
    }
    const initial=dirs[0];
    let html='<h3>Добавить направление</h3>';
    html+='<input type="hidden" id="ad-child-id" value="'+child.id+'">';
    html+='<div class="form-grid">';
    html+='<div class="field"><label>Направление</label><select class="select" id="ad-dir" onchange="refreshAddDirectionGroupsV132()">';
    dirs.forEach(function(d){html+='<option>'+d+'</option>';});
    html+='</select></div>';
    html+='<div class="field"><label>Основная группа</label><select class="select" id="ad-group" onchange="refreshAddDirectionPreviewV132()">'+groupsHtml(initial)+'</select></div>';
    html+='<div class="field span-2"><label>Цена</label><select class="select" id="ad-price-mode" onchange="toggleAddDirectionPriceV132()"><option value="standard">Обычная цена направления / группы</option><option value="individual">Индивидуальная цена</option></select><div class="muted mini" style="margin-top:5px">Для второго направления можно сразу задать скидочную индивидуальную цену.</div></div>';
    html+='<div class="field span-2" id="ad-individual-wrap" style="display:none"><label>Индивидуальная цена абонемента за 4 занятия, ₽</label><input class="input" id="ad-individual-package" type="number" min="0" step="1" placeholder="Например, 2500" oninput="refreshAddDirectionPreviewV132()"><div class="muted mini" style="margin-top:5px">CRM разделит эту сумму на 4 и будет считать отдельную стоимость занятия для этого направления.</div></div>';
    html+='</div>';
    html+='<div id="ad-preview" class="card pad" style="margin-top:14px"></div>';
    html+='<div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn primary" onclick="saveAddedDirectionV132()">Добавить направление</button></div>';
    modal(html);
    setTimeout(refreshAddDirectionPreviewV132,0);
  };

  window.saveAddedDirectionV132=function(){
    const childId=Number(document.querySelector('#ad-child-id')?.value);
    const child=childById(childId);
    if(!child) return;
    const direction=document.querySelector('#ad-dir')?.value;
    if(!direction || !ALL_DIRECTIONS.includes(direction)) return;

    if((child.enrollments||[]).some(function(e){return e.direction===direction;})){
      alert('Это направление уже есть у ребёнка.');
      return;
    }

    const rawGroup=document.querySelector('#ad-group')?.value;
    const groupId=rawGroup ? Number(rawGroup) : null;
    const group=groupId!=null ? byId(state.groups,groupId) : null;
    if(group && group.direction!==direction){
      alert('Выбранная группа относится к другому направлению.');
      return;
    }

    const mode=document.querySelector('#ad-price-mode')?.value||'standard';
    const packagePrice=Number(document.querySelector('#ad-individual-package')?.value||0);
    if(mode==='individual' && !(packagePrice>0)){
      alert('Укажите индивидуальную цену абонемента за 4 занятия.');
      return;
    }

    const individualPrice=mode==='individual' ? packagePrice/4 : null;
    child.enrollments=child.enrollments||[];
    child.enrollments.push({
      direction:direction,
      groupId:groupId,
      individualPrice:individualPrice,
      balance:0
    });

    state.modal=null;
    state.childTab='overview';
    state.page='child';
    render();
  };

  // v1.1.7 intentionally removed the old "+ Добавить направление" button.
  // Restore it only while there is another direction available.
  const previousChildV132=window.child;
  window.child=function(){
    let html=previousChildV132();
    const child=childById(state.selectedChild);
    if(!child) return html;
    const dirs=availableDirections(child);
    if(!dirs.length) return html;

    const button='<button class="btn soft add-direction-btn-v132" onclick="addDirectionFormV132('+child.id+')">+ Добавить направление</button>';
    const heading='<h2>Направления</h2>';
    if(html.includes(heading) && !html.includes('add-direction-btn-v132')){
      html=html.replace(heading,heading+button);
    }
    return html;
  };

  render();
})();


// iCube CRM v1.1.10 — teacher quick child creation + director review queue.
(function(){
  function nextChildId(){
    return (state.children||[]).length
      ? Math.max.apply(null,state.children.map(function(c){return Number(c.id)||0;}))+1
      : 1;
  }

  function currentTeacherId(){
    if(typeof window.currentPrototypeTeacherId==='function') return Number(window.currentPrototypeTeacherId()||0);
    return Number(state.prototypeTeacherId||0);
  }

  function esc(s){
    return String(s??'').replace(/[&<>"']/g,function(ch){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
    });
  }

  window.teacherQuickChildForm=function(){
    const lesson=byId(state.lessons,state.selectedLesson);
    const group=lesson?byId(state.groups,lesson.groupId):null;
    if(!lesson||!group) return;

    let html='<h3>Новый ребёнок на занятии</h3>';
    html+='<div class="notice">Создайте минимальную карточку. Ребёнок сразу появится в CRM и будет отмечен на этом занятии как <b>ознакомительный</b>. Директор позже дополнит данные.</div>';
    html+='<div class="form-grid" style="margin-top:14px">';
    html+='<div class="field span-2"><label>Фамилия Имя</label><input class="input" id="tqc-name" placeholder="Иванов Иван"></div>';
    html+='<div class="field span-2"><label>Телефон родителя</label><input class="input" id="tqc-phone" placeholder="+7 900 000-00-00"></div>';
    html+='</div>';
    html+='<div class="muted mini" style="margin-top:10px">Направление будет указано автоматически: '+esc(group.direction)+'. В основную группу ребёнок пока не зачисляется.</div>';
    html+='<div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn primary" onclick="saveTeacherQuickChild()">Создать и отметить</button></div>';
    modal(html);
  };

  window.saveTeacherQuickChild=function(){
    const lesson=byId(state.lessons,state.selectedLesson);
    const group=lesson?byId(state.groups,lesson.groupId):null;
    if(!lesson||!group) return;

    const name=document.querySelector('#tqc-name')?.value.trim()||'';
    const phone=document.querySelector('#tqc-phone')?.value.trim()||'';
    if(!name){alert('Укажите фамилию и имя ребёнка.');return;}
    if(!phone){alert('Укажите телефон родителя.');return;}

    const id=nextChildId();
    const teacherId=currentTeacherId() || Number(lesson.teacherId||group.teacherId||0);

    const child={
      id:id,
      name:name,
      birth:'',
      school:'',
      grade:'',
      shift:'',
      parent:'',
      phone:phone,
      status:'Лид',
      note:'',
      enrollments:[{
        direction:group.direction,
        groupId:null,
        individualPrice:null,
        balance:0
      }],
      needsDirectorReview:true,
      createdByTeacher:true,
      createdByTeacherId:teacherId||null,
      createdFromLessonId:lesson.id,
      createdAt:new Date().toISOString()
    };
    state.children.push(child);

    lesson.extras=lesson.extras||[];
    if(!lesson.extras.some(function(e){return Number(e.childId)===id;})){
      lesson.extras.push({
        childId:id,
        trial:true,
        createdByTeacher:true
      });
    }
    lesson.photos=lesson.photos||{};

    if(lesson.summary){
      lesson.summary.present=Object.values(lesson.attendance||{}).filter(Boolean).length+(lesson.extras||[]).length;
      lesson.summary.trials=(lesson.extras||[]).filter(function(e){return !!e.trial;}).length;
    }

    state.modal=null;
    render();
  };

  // Search existing children and always offer quick creation below the results.
  window.showExtraResults=function(q){
    const box=document.querySelector('#extraResults');
    if(!box) return;
    const lesson=byId(state.lessons,state.selectedLesson);
    const group=lesson?byId(state.groups,lesson.groupId):null;
    if(!lesson||!group){box.innerHTML='';return;}

    const query=String(q||'').trim().toLowerCase();
    let results=[];
    if(query){
      results=(state.children||[]).filter(function(c){
        const inMainGroup=groupChildren(group.id).some(function(k){return Number(k.id)===Number(c.id);});
        const alreadyExtra=(lesson.extras||[]).some(function(e){return Number(e.childId)===Number(c.id);});
        return !inMainGroup && !alreadyExtra &&
          (String(c.name||'').toLowerCase().includes(query) || String(c.phone||'').toLowerCase().includes(query));
      }).slice(0,4);
    }

    let html='';
    if(results.length){
      html+=results.map(function(c){
        return '<button class="btn" style="width:100%;margin-top:6px;justify-content:flex-start" onclick="addExtra('+c.id+')">'+esc(c.name)+'</button>';
      }).join('');
    }else if(query){
      html+='<div class="muted mini" style="margin-top:8px">Совпадений не найдено.</div>';
    }

    html+='<button class="btn soft" style="width:100%;margin-top:10px;justify-content:center" onclick="teacherQuickChildForm()">+ Новый ребёнок</button>';
    box.innerHTML=html;
  };

  // Make the new-child action visible even before teacher starts typing.
  const teacherLessonBeforeV110=window.teacherLesson;
  window.teacherLesson=function(){
    let html=teacherLessonBeforeV110();
    if(!html) return html;
    const marker='<div id="extraResults"></div>';
    const replacement='<div id="extraResults"><button class="btn soft" style="width:100%;margin-top:10px;justify-content:center" onclick="teacherQuickChildForm()">+ Новый ребёнок</button></div>';
    return html.replace(marker,replacement);
  };

  window.confirmTeacherCreatedChild=function(childId){
    const child=byId(state.children,childId);
    if(!child) return;
    child.needsDirectorReview=false;
    child.reviewedByDirector=true;
    child.reviewedAt=new Date().toISOString();
    render();
  };

  function pendingTeacherChildren(){
    return (state.children||[]).filter(function(c){return !!c.needsDirectorReview;});
  }

  // Director dashboard: review queue above the regular dashboard content.
  const dashboardBeforeV110=window.dashboard;
  window.dashboard=function(){
    const base=dashboardBeforeV110();
    const pending=pendingTeacherChildren();
    if(!pending.length) return base;

    const rows=pending.map(function(c){
      const teacher=byId(state.teachers,c.createdByTeacherId);
      const lesson=byId(state.lessons,c.createdFromLessonId);
      const group=lesson?byId(state.groups,lesson.groupId):null;
      return '<div class="kpi-line"><div><b>'+esc(c.name)+'</b><div class="muted mini">'+
        (teacher?'Создал: '+esc(teacher.name):'Создан преподавателем')+
        (group?' · '+esc(group.direction)+' · '+esc(group.name):'')+
        '</div><div class="muted mini">'+esc(c.phone||'Телефон не указан')+'</div></div>'+
        '<button class="btn soft" onclick="openChild('+c.id+')">Проверить</button></div>';
    }).join('');

    const block='<div class="card pad director-review-card" style="margin-bottom:16px;border-color:#fedf89;background:#fffdf5">'+
      '<div class="section-title"><div><h2>Новые дети от преподавателей</h2><div class="muted mini">Нужно проверить и дополнить карточки</div></div><span class="badge amber">'+pending.length+'</span></div>'+
      rows+'</div>';

    const headEnd=base.indexOf('</div>')+6;
    return base.slice(0,headEnd)+block+base.slice(headEnd);
  };

  // Child card: visible warning and explicit confirmation.
  const childBeforeV110=window.child;
  window.child=function(){
    let html=childBeforeV110();
    const child=byId(state.children,state.selectedChild);
    if(!child || !child.needsDirectorReview) return html;

    const teacher=byId(state.teachers,child.createdByTeacherId);
    const lesson=byId(state.lessons,child.createdFromLessonId);
    const group=lesson?byId(state.groups,lesson.groupId):null;
    const banner='<div class="notice" style="margin-bottom:16px;background:#fffaeb">'+
      '<div style="display:flex;justify-content:space-between;gap:14px;align-items:center;flex-wrap:wrap">'+
        '<div><b>Преподаватель создал нового ребёнка</b><div class="mini" style="margin-top:4px">'+
          (teacher?esc(teacher.name):'Преподаватель')+
          (group?' · '+esc(group.direction)+' · '+esc(lesson.date):'')+
          '. Проверьте данные, дополните карточку через «Редактировать» и подтвердите.</div></div>'+
        '<button class="btn primary" onclick="confirmTeacherCreatedChild('+child.id+')">Подтвердить ребёнка</button>'+
      '</div></div>';

    const tabsPos=html.indexOf('<div class="tabs">');
    if(tabsPos>=0) html=html.slice(0,tabsPos)+banner+html.slice(tabsPos);
    return html;
  };

  render();
})();

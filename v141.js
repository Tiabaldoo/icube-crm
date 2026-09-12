// iCube CRM v1.1.41 — independent status per child direction while preserving global child status.
(function(){
  const DIR_STATUSES=['Активный','Пауза','Закончил'];

  function isoToday(){
    const d=new Date();
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  function badgeClass(status){
    return status==='Активный'?'green':status==='Пауза'?'amber':'gray';
  }
  function enrollmentStatus(e){ return e?.status||'Активный'; }
  function isEnrollmentActive(e){ return enrollmentStatus(e)==='Активный'; }
  function childGloballyActive(c){ return c && (c.status==='Активный'||c.status==='Лид'); }

  (state.children||[]).forEach(function(c){
    (c.enrollments||[]).forEach(function(e){ if(!e.status) e.status='Активный'; });
  });

  // Helper for old code paths which still only know about groupId.
  // During rendering/calculation we temporarily hide inactive enrollments from groupChildren/scoped statistics,
  // while the real groupId remains stored on the enrollment and is not lost.
  function withInactiveDirectionsMasked(fn,ctx,args){
    const changed=[];
    (state.children||[]).forEach(function(c){
      (c.enrollments||[]).forEach(function(e){
        if(!isEnrollmentActive(e) && e.groupId!=null){
          changed.push({e:e,groupId:e.groupId});
          e.groupId=null;
        }
      });
    });
    try{return fn.apply(ctx,args||[]);}finally{
      changed.forEach(function(x){x.e.groupId=x.groupId;});
    }
  }

  ['groups','group','teacherToday','teacherCalendar','teacherLesson','stats'].forEach(function(name){
    const old=window[name];
    if(typeof old!=='function') return;
    window[name]=function(){ return withInactiveDirectionsMasked(old,this,arguments); };
  });

  // Show only active-direction candidates in the group assignment modal.
  const renderAddBefore=window.renderAddChildrenList;
  if(typeof renderAddBefore==='function'){
    window.renderAddChildrenList=function(){
      const result=renderAddBefore();
      const g=byId(state.groups,state.addChildrenGroupId);
      if(!g) return result;
      document.querySelectorAll('.ac-check').forEach(function(input){
        const c=byId(state.children,Number(input.value));
        const e=(c?.enrollments||[]).find(function(x){return x.direction===g.direction;});
        if(!e || !isEnrollmentActive(e)) input.closest('.student-check')?.remove();
      });
      if(typeof window.updateAddChildrenCount==='function') window.updateAddChildrenCount();
      return result;
    };
  }

  const confirmAddBefore=window.confirmAddChildren;
  if(typeof confirmAddBefore==='function'){
    window.confirmAddChildren=function(){
      const g=byId(state.groups,state.addChildrenGroupId);
      document.querySelectorAll('.ac-check:checked').forEach(function(input){
        const c=byId(state.children,Number(input.value));
        const e=(c?.enrollments||[]).find(function(x){return x.direction===g?.direction;});
        if(!e || !isEnrollmentActive(e)) input.checked=false;
      });
      return confirmAddBefore();
    };
  }

  // Add status selector to the existing unified direction/price editor.
  const manageFormBefore=window.manageDirectionForm;
  if(typeof manageFormBefore==='function'){
    window.manageDirectionForm=function(childId,oldDirection){
      manageFormBefore(childId,oldDirection);
      const child=byId(state.children,Number(childId));
      const e=(child?.enrollments||[]).find(function(x){return x.direction===oldDirection;});
      const grid=document.querySelector('.modal .form-grid');
      if(!grid||!e||document.querySelector('#md-enrollment-status')) return;
      const field=document.createElement('div');
      field.className='field span-2';
      field.innerHTML='<label>Статус направления</label><select class="select" id="md-enrollment-status">'+DIR_STATUSES.map(function(s){return '<option'+(s===enrollmentStatus(e)?' selected':'')+'>'+s+'</option>';}).join('')+'</select><div class="muted mini" style="margin-top:5px">Этот статус действует только на данное направление. Общий статус ребёнка по-прежнему можно менять отдельно.</div>';
      grid.appendChild(field);
    };
  }

  const saveManagedBefore=window.saveManagedDirection;
  if(typeof saveManagedBefore==='function'){
    window.saveManagedDirection=function(childId,oldDirection){
      const child=byId(state.children,Number(childId));
      const oldE=(child?.enrollments||[]).find(function(x){return x.direction===oldDirection;});
      const previous=enrollmentStatus(oldE);
      const nextStatus=document.querySelector('#md-enrollment-status')?.value||previous;
      const newDirection=document.querySelector('#md-dir')?.value||oldDirection;
      const result=saveManagedBefore(childId,oldDirection);
      const target=(child?.enrollments||[]).find(function(x){return x.direction===newDirection;});
      if(target){
        target.status=DIR_STATUSES.includes(nextStatus)?nextStatus:'Активный';
        if(previous!==target.status){
          target.statusChangedAt=isoToday();
          target.statusHistory=target.statusHistory||[];
          target.statusHistory.push({from:previous,to:target.status,date:target.statusChangedAt});
        }
      }
      render();
      return result;
    };
  }

  // Newly created second directions are active by default.
  const saveAddedBefore=window.saveAddedDirectionV132;
  if(typeof saveAddedBefore==='function'){
    window.saveAddedDirectionV132=function(){
      const childId=Number(document.querySelector('#ad-child-id')?.value);
      const direction=document.querySelector('#ad-dir')?.value;
      const child=byId(state.children,childId);
      const result=saveAddedBefore();
      const e=(child?.enrollments||[]).find(function(x){return x.direction===direction;});
      if(e&&!e.status) e.status='Активный';
      render();
      return result;
    };
  }

  // Show per-direction status badges only when the child has multiple directions.
  // With one direction the global child status already communicates enough and the extra badge is visual noise.
  const childBefore=window.child;
  if(typeof childBefore==='function'){
    window.child=function(){
      let html=childBefore();
      const child=byId(state.children,state.selectedChild);
      if(!child) return html;
      const showDirectionStatuses=(child.enrollments||[]).length>1;
      (child.enrollments||[]).forEach(function(e){
        const button='<button class="btn" onclick="manageDirectionForm('+child.id+',\''+e.direction+'\')">Изменить направление / цену</button>';
        if(!html.includes(button) || !showDirectionStatuses) return;
        const badge='<span class="badge '+badgeClass(enrollmentStatus(e))+'" style="margin-right:8px">'+enrollmentStatus(e)+'</span>';
        html=html.replace(button,badge+button);
      });
      return html;
    };
  }

  // Expose helpers for later logic/statistics layers.
  window.enrollmentStatusV141=enrollmentStatus;
  window.isEnrollmentActiveV141=isEnrollmentActive;
  window.childGloballyActiveV141=childGloballyActive;

  render();
})();

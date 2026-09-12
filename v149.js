// iCube CRM v1.1.49 — director reminder for children added by a teacher who still need direction setup.
(function(){
  function esc(s){
    return String(s??'').replace(/[&<>"']/g,function(ch){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
    });
  }
  function extraPresent(ex){ return !!ex && ex.present!==false; }
  function parseRuDate(s){
    const p=String(s||'').split('.').map(Number);
    return new Date(p[2]||0,(p[1]||1)-1,p[0]||1);
  }
  function matchingEnrollment(child,direction){
    return (child?.enrollments||[]).find(function(e){return e.direction===direction;})||null;
  }

  // This is intentionally separate from the paid-visit warning in v137.
  // A trial visit without a direction is valid, but the director should still know
  // that the child's CRM card needs to be completed afterwards.
  function teacherAddedDirectionReminders(){
    const map=new Map();
    (state.lessons||[]).forEach(function(lesson){
      if(!lesson || lesson.cancelled || !lesson.started) return;
      const group=byId(state.groups,lesson.groupId);
      if(!group) return;

      (lesson.extras||[]).forEach(function(ex){
        if(!extraPresent(ex)) return;
        const child=byId(state.children,Number(ex.childId));
        if(!child) return;

        const enrollment=matchingEnrollment(child,group.direction);
        // Existing child with this direction already configured needs no reminder.
        // A teacher-created quick card currently gets a direction placeholder with no
        // group; keep reminding until the director actually assigns/configures it.
        const needsDirection=!enrollment ||
          ((child.createdByTeacher || ex.createdByTeacher || child.needsDirectorReview) && enrollment.groupId==null);
        if(!needsDirection) return;

        const key=Number(child.id)+'|'+group.direction;
        const old=map.get(key);
        const currentStamp=parseRuDate(lesson.date).getTime()*10000+Number(String(lesson.time||'').slice(0,2).replace(/\D/g,'')||0)*100;
        const oldStamp=old?parseRuDate(old.lesson.date).getTime()*10000+Number(String(old.lesson.time||'').slice(0,2).replace(/\D/g,'')||0)*100:-Infinity;
        if(!old || currentStamp>=oldStamp){
          map.set(key,{child:child,group:group,lesson:lesson,extra:ex,enrollment:enrollment});
        }
      });
    });
    return Array.from(map.values());
  }
  window.teacherAddedDirectionRemindersV149=teacherAddedDirectionReminders;

  const dashboardBeforeV149=window.dashboard;
  if(typeof dashboardBeforeV149==='function'){
    window.dashboard=function(){
      const base=dashboardBeforeV149.apply(this,arguments);
      const items=teacherAddedDirectionReminders();
      if(!items.length) return base;

      const rows=items.map(function(item){
        const teacher=byId(state.teachers,item.lesson.teacherId||item.group.teacherId);
        const setupText=item.enrollment
          ? 'Нужно назначить группу и проверить направление «'+esc(item.group.direction)+'».'
          : 'Нужно добавить направление «'+esc(item.group.direction)+'» в карточку ребёнка.';
        return '<div class="kpi-line"><div><b>'+esc(item.child.name)+'</b>'+
          '<div class="muted mini">Был на занятии '+esc(item.lesson.date||'')+' · '+esc(item.group.direction)+' · '+esc(item.group.name||'')+'</div>'+
          '<div class="mini" style="margin-top:3px">'+setupText+(teacher?' Добавил: '+esc(teacher.name)+'.':'')+'</div></div>'+
          '<button class="btn soft" onclick="openChild('+item.child.id+')">Открыть карточку</button></div>';
      }).join('');

      const block='<div class="card pad" style="margin-bottom:16px;border-color:#b2ddff;background:#f5fbff">'+
        '<div class="section-title"><div><h2>Нужно оформить направление</h2><div class="muted mini">Преподаватель добавил ребёнка на занятие, но направление в карточке ещё не оформлено полностью</div></div><span class="badge blue">'+items.length+'</span></div>'+rows+'</div>';

      const headEnd=base.indexOf('</div>')+6;
      return headEnd>5?base.slice(0,headEnd)+block+base.slice(headEnd):block+base;
    };
  }

  render();
})();

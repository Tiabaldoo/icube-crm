// iCube CRM v1.1.44 — show the teacher the main group before starting a lesson.
(function(){
  function parseRuDate(s){
    const p=String(s||'').split('.').map(Number);
    return new Date(p[2]||0,(p[1]||1)-1,p[0]||1);
  }

  function extraPresent(ex){return !ex || ex.present!==false;}

  // A trial preview is direction-specific: previous robotics attendance must not
  // suppress the first programming trial, and vice versa.
  function hasPreviousVisitInDirection(childId,currentLesson,direction){
    const currentDate=parseRuDate(currentLesson?.date);
    return (state.lessons||[]).some(function(l){
      if(!l || Number(l.id)===Number(currentLesson?.id) || l.cancelled || !l.done) return false;
      if(parseRuDate(l.date)>currentDate) return false;
      const g=byId(state.groups,l.groupId);
      if(!g || g.direction!==direction) return false;
      const main=!!(l.attendance&&l.attendance[childId]);
      const extra=(l.extras||[]).some(function(e){
        return Number(e.childId)===Number(childId) && extraPresent(e);
      });
      return main||extra;
    });
  }

  function previewList(lesson,group,kids){
    let html='<div class="teacher-card teacher-prestart-group">';
    html+='<div class="section-title"><h2>Основная группа</h2><span class="badge blue">'+kids.length+' '+(kids.length===1?'ребёнок':kids.length>=2&&kids.length<=4?'ребёнка':'детей')+'</span></div>';
    if(!kids.length){
      html+='<div class="muted mini">В основной группе пока нет детей.</div>';
    }else{
      html+='<div class="attendance">';
      kids.forEach(function(c){
        const trial=!hasPreviousVisitInDirection(c.id,lesson,group.direction);
        html+='<div class="kpi-line teacher-prestart-child"><b>'+c.name+'</b>'+(trial?'<span class="badge amber">Ознакомительное</span>':'')+'</div>';
      });
      html+='</div>';
    }
    return html+'</div>';
  }

  const teacherLessonBeforeV144=window.teacherLesson;
  window.teacherLesson=function(){
    const lesson=byId(state.lessons,state.selectedLesson);
    if(!lesson || lesson.started || lesson.done) return teacherLessonBeforeV144();
    const group=byId(state.groups,lesson.groupId);
    if(!group) return teacherLessonBeforeV144();
    const kids=groupChildren(group.id);
    let html=teacherLessonBeforeV144();
    const marker='<div class="teacher-card"><h3 style="margin-top:0">Занятие готово</h3>';
    const pos=html.indexOf(marker);
    if(pos<0) return html;
    return html.slice(0,pos)+previewList(lesson,group,kids)+html.slice(pos);
  };

  render();
})();

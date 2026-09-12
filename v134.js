// iCube CRM v1.1.34 — direction colors: robotics blue, programming orange.
(function(){
  const STYLE_ID='crm-direction-colors-v134';

  function directionForGroupId(groupId){
    const g=byId(state.groups,Number(groupId));
    return g?.direction||'';
  }

  function directionForLessonId(lessonId){
    const l=byId(state.lessons,Number(lessonId));
    return l?directionForGroupId(l.groupId):'';
  }

  function directionClass(direction){
    return direction==='Программирование'?'crm-direction-program':direction==='Робототехника'?'crm-direction-robot':'';
  }

  function setDirectionClass(el,direction){
    if(!el) return;
    el.classList.remove('crm-direction-robot','crm-direction-program');
    const cls=directionClass(direction);
    if(cls) el.classList.add(cls);
  }

  function extractId(el,fnName){
    const raw=el.getAttribute('onclick')||'';
    const re=new RegExp(fnName+'\\s*\\(\\s*(\\d+)');
    const m=raw.match(re);
    return m?Number(m[1]):null;
  }

  function applyDirectionColors(){
    // Group cards.
    document.querySelectorAll('.group-card').forEach(function(card){
      const id=extractId(card,'openGroup');
      if(id!=null) setDirectionClass(card,directionForGroupId(id));
      else {
        const text=card.textContent||'';
        if(text.includes('Программирование')) setDirectionClass(card,'Программирование');
        else if(text.includes('Робототехника')) setDirectionClass(card,'Робототехника');
      }
    });

    // Standard director calendar events.
    document.querySelectorAll('.event').forEach(function(event){
      const id=extractId(event,'openLesson');
      if(id!=null) setDirectionClass(event,directionForLessonId(id));
      else {
        const text=event.textContent||'';
        if(text.includes('Программирование')) setDirectionClass(event,'Программирование');
        else if(text.includes('Робототехника')) setDirectionClass(event,'Робототехника');
      }
    });

    // Any lesson cards inside director/teacher calendar containers from newer layouts.
    document.querySelectorAll('[class*="calendar"] [onclick*="openLesson"], .teacher-card[onclick*="openLesson"]').forEach(function(card){
      const id=extractId(card,'openLesson');
      if(id!=null) setDirectionClass(card,directionForLessonId(id));
    });
  }

  function installStyles(){
    if(document.getElementById(STYLE_ID)) return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
      /* Unified direction palette */
      .group-card.crm-direction-robot{
        border-top:4px solid #3b82f6!important;
        background:linear-gradient(180deg,#f8fbff 0,#fff 34%)!important;
      }
      .group-card.crm-direction-program{
        border-top:4px solid #f97316!important;
        background:linear-gradient(180deg,#fff7ed 0,#fff 34%)!important;
      }
      .group-card.crm-direction-robot:hover{border-color:#93c5fd!important}
      .group-card.crm-direction-program:hover{border-color:#fdba74!important}

      .event.crm-direction-robot:not(.event-cancelled),
      [class*="calendar"] .crm-direction-robot[onclick*="openLesson"]:not(.event-cancelled),
      .teacher-card.crm-direction-robot[onclick*="openLesson"]:not(.event-cancelled){
        background:#eff6ff!important;
        border-left-color:#2563eb!important;
      }
      .event.crm-direction-program:not(.event-cancelled),
      [class*="calendar"] .crm-direction-program[onclick*="openLesson"]:not(.event-cancelled),
      .teacher-card.crm-direction-program[onclick*="openLesson"]:not(.event-cancelled){
        background:#fff7ed!important;
        border-left-color:#f97316!important;
      }

      .event.crm-direction-robot:hover{box-shadow:0 5px 14px rgba(37,99,235,.14)!important}
      .event.crm-direction-program:hover{box-shadow:0 5px 14px rgba(249,115,22,.16)!important}
    `;
    document.head.appendChild(style);
  }

  installStyles();
  applyDirectionColors();

  const root=document.getElementById('app');
  if(root){
    let queued=false;
    new MutationObserver(function(){
      if(queued) return;
      queued=true;
      requestAnimationFrame(function(){
        queued=false;
        applyDirectionColors();
      });
    }).observe(root,{childList:true,subtree:true});
  }
})();

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

  function groupIdFromUnifiedEvent(el){
    const raw=el.getAttribute('onclick')||'';
    // Current calendars use keys like "12|02.09.2026".
    const m=raw.match(/openUnifiedCalendarEvent\s*\(\s*['\"](\d+)\|/);
    return m?Number(m[1]):null;
  }

  function directionFromCardText(el){
    const text=(el.textContent||'').trim();
    if(text.includes('Программирование')) return 'Программирование';
    if(text.includes('Робототехника')) return 'Робототехника';

    // Calendar cards usually contain the group name rather than the direction name.
    const groups=(state.groups||[]).slice().sort(function(a,b){return String(b.name||'').length-String(a.name||'').length;});
    const g=groups.find(function(x){return x?.name && text.includes(x.name);});
    return g?.direction||'';
  }

  function applyDirectionColors(){
    // Group cards.
    document.querySelectorAll('.group-card').forEach(function(card){
      const id=extractId(card,'openGroup');
      setDirectionClass(card,id!=null?directionForGroupId(id):directionFromCardText(card));
    });

    // Director + teacher calendar events in v128 use openUnifiedCalendarEvent(key, role).
    document.querySelectorAll('.event, [onclick*="openUnifiedCalendarEvent"]').forEach(function(event){
      let direction='';
      const groupId=groupIdFromUnifiedEvent(event);
      if(groupId!=null) direction=directionForGroupId(groupId);
      if(!direction){
        const lessonId=extractId(event,'openLesson');
        if(lessonId!=null) direction=directionForLessonId(lessonId);
      }
      if(!direction) direction=directionFromCardText(event);
      setDirectionClass(event,direction);
    });

    // Older teacher lesson cards, if present.
    document.querySelectorAll('.teacher-card[onclick*="openLesson"]').forEach(function(card){
      const id=extractId(card,'openLesson');
      if(id!=null) setDirectionClass(card,directionForLessonId(id));
    });
  }

  function installStyles(){
    let style=document.getElementById(STYLE_ID);
    if(!style){
      style=document.createElement('style');
      style.id=STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent=`
      /* Unified direction palette: robotics blue, programming orange. */
      .group-card.crm-direction-robot{
        border-top:4px solid #3b82f6!important;
        background:linear-gradient(180deg,#eff6ff 0,#fff 38%)!important;
      }
      .group-card.crm-direction-program{
        border-top:4px solid #f97316!important;
        background:linear-gradient(180deg,#fff7ed 0,#fff 38%)!important;
      }
      .group-card.crm-direction-robot:hover{border-color:#93c5fd!important}
      .group-card.crm-direction-program:hover{border-color:#fdba74!important}

      /* Only the direction badge becomes orange. Partner/project badges keep their own color. */
      .group-card.crm-direction-program .badge.purple:first-child{
        background:#ffedd5!important;
        color:#c2410c!important;
      }

      /* Own iCube lessons: both background and left stripe show direction. */
      .event.crm-direction-robot:not(.partner):not(.event-cancelled),
      [onclick*="openUnifiedCalendarEvent"].crm-direction-robot:not(.partner):not(.event-cancelled){
        background:#eff6ff!important;
        border-left-color:#2563eb!important;
      }
      .event.crm-direction-program:not(.partner):not(.event-cancelled),
      [onclick*="openUnifiedCalendarEvent"].crm-direction-program:not(.partner):not(.event-cancelled){
        background:#fff7ed!important;
        border-left-color:#f97316!important;
      }

      /* Partner lessons stay purple, but the stripe shows the actual direction. */
      .event.partner:not(.event-cancelled),
      [onclick*="openUnifiedCalendarEvent"].partner:not(.event-cancelled){
        background:#f4f3ff!important;
      }
      .event.partner.crm-direction-robot:not(.event-cancelled),
      [onclick*="openUnifiedCalendarEvent"].partner.crm-direction-robot:not(.event-cancelled){
        border-left-color:#2563eb!important;
      }
      .event.partner.crm-direction-program:not(.event-cancelled),
      [onclick*="openUnifiedCalendarEvent"].partner.crm-direction-program:not(.event-cancelled){
        border-left-color:#f97316!important;
      }

      .event.crm-direction-robot:hover{box-shadow:0 5px 14px rgba(37,99,235,.14)!important}
      .event.crm-direction-program:hover{box-shadow:0 5px 14px rgba(249,115,22,.16)!important}
    `;
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

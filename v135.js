// iCube CRM v1.1.35 — sort Groups page by weekday, direction, then time.
(function(){
  const DAY_ORDER={
    'Понедельник':1,'Пн':1,
    'Вторник':2,'Вт':2,
    'Среда':3,'Ср':3,
    'Четверг':4,'Чт':4,
    'Пятница':5,'Пт':5,
    'Суббота':6,'Сб':6,
    'Воскресенье':7,'Вс':7
  };
  const DIR_ORDER={'Робототехника':1,'Программирование':2};

  function timeKey(g){
    const raw=String(g?.startTime || g?.time || '');
    const m=raw.match(/(\d{1,2}):(\d{2})/);
    return m ? Number(m[1])*60+Number(m[2]) : 9999;
  }

  function sortedGroups(list){
    return (list||[]).slice().sort(function(a,b){
      const dayA=DAY_ORDER[a?.day]||99;
      const dayB=DAY_ORDER[b?.day]||99;
      if(dayA!==dayB) return dayA-dayB;

      const dirA=DIR_ORDER[a?.direction]||99;
      const dirB=DIR_ORDER[b?.direction]||99;
      if(dirA!==dirB) return dirA-dirB;

      const timeA=timeKey(a), timeB=timeKey(b);
      if(timeA!==timeB) return timeA-timeB;

      return Number(a?.id||0)-Number(b?.id||0);
    });
  }

  const groupsBeforeV135=window.groups;
  if(typeof groupsBeforeV135==='function'){
    window.groups=function(){
      const original=state.groups;
      state.groups=sortedGroups(original);
      try{
        return groupsBeforeV135();
      }finally{
        state.groups=original;
      }
    };
  }

  window.sortedGroupsForDisplayV135=sortedGroups;
  render();
})();

// iCube CRM v1.1.40 — wider teacher calendar on desktop only.
(function(){
  const STYLE_ID='crm-teacher-calendar-desktop-width-v140';
  let style=document.getElementById(STYLE_ID);
  if(!style){
    style=document.createElement('style');
    style.id=STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent=`
    @media (min-width: 761px){
      .teacher-content:has(.calendar){
        max-width:1180px!important;
        width:100%;
      }
      .teacher-content:has(.calendar) .calendar{
        grid-template-columns:repeat(7,minmax(0,1fr))!important;
      }
      .teacher-content:has(.calendar) .day{
        min-width:0;
      }
      .teacher-content:has(.calendar) .event{
        overflow-wrap:anywhere;
      }
    }
  `;
})();

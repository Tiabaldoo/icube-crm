// iCube CRM v1.1.23 — safer iPhone form interaction.
(function(){
  function isEditable(el){
    return el && (el.matches('input,textarea,select') || el.isContentEditable);
  }

  // Do not intercept pointer/touch events. On iOS Safari that can make the first
  // tap after editing appear to do nothing, especially inside modals.
  document.addEventListener('focusin',function(e){
    if(!isEditable(e.target)) return;
    document.documentElement.style.overflowX='hidden';
    document.body.style.overflowX='hidden';
  });

  document.addEventListener('focusout',function(){
    setTimeout(function(){
      document.documentElement.style.overflowX='';
      if(!document.body.classList.contains('modal-open')) document.body.style.overflowX='';
    },0);
  });
})();
// iCube CRM v1.1.22 — iPhone form interaction polish.
(function(){
  function isEditable(el){
    return el && (el.matches('input,textarea,select') || el.isContentEditable);
  }

  // On iOS Safari the first tap after closing the keyboard can be consumed by
  // the still-focused field. Blur it on pointer-down so the same tap can trigger
  // the intended button/control normally.
  document.addEventListener('pointerdown',function(e){
    const active=document.activeElement;
    if(!isEditable(active)) return;
    const target=e.target.closest('button,[role="button"],a,.btn');
    if(!target) return;
    if(active!==target) active.blur();
  },true);

  // Keep focused fields visible without horizontally shifting the page.
  document.addEventListener('focusin',function(e){
    if(!isEditable(e.target)) return;
    document.documentElement.style.overflowX='hidden';
    document.body.style.overflowX='hidden';
    setTimeout(function(){
      try{e.target.scrollIntoView({block:'nearest',inline:'nearest',behavior:'smooth'});}catch(_e){}
    },120);
  });

  document.addEventListener('focusout',function(){
    setTimeout(function(){
      document.documentElement.style.overflowX='';
      if(!document.body.classList.contains('modal-open')) document.body.style.overflowX='';
    },120);
  });
})();
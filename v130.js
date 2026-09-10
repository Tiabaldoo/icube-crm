// iCube CRM v1.1.20 — mobile page classes + modal scroll lock.
(function(){
  let locked=false;
  let lockedScrollY=0;

  function lockBody(){
    if(locked) return;
    lockedScrollY=window.scrollY||window.pageYOffset||0;
    document.body.classList.add('modal-open');
    document.body.style.position='fixed';
    document.body.style.top='-'+lockedScrollY+'px';
    document.body.style.left='0';
    document.body.style.right='0';
    document.body.style.width='100%';
    locked=true;
  }

  function unlockBody(){
    if(!locked) return;
    document.body.classList.remove('modal-open');
    document.body.style.position='';
    document.body.style.top='';
    document.body.style.left='';
    document.body.style.right='';
    document.body.style.width='';
    locked=false;
    window.scrollTo(0,lockedScrollY);
  }

  function cleanMobileArtifacts(){
    document.querySelectorAll('.page-children .muted.mini').forEach(function(el){
      const t=el.textContent.replace(/\s/g,'');
      if(t===''||t==='·') el.style.display='none';
    });
  }

  function syncUi(){
    const hasModal=!!document.querySelector('.modal-backdrop');
    if(hasModal) lockBody(); else unlockBody();
    cleanMobileArtifacts();
  }

  const shellBeforeV130=window.shell||shell;
  window.shell=function(content,title){
    let html=shellBeforeV130(content,title);
    html=html.replace('<div class="content">','<div class="content page-'+String(state.page||'unknown')+'">');
    return html;
  };

  const renderBeforeV130=window.render||render;
  window.render=function(){
    const result=renderBeforeV130();
    requestAnimationFrame(syncUi);
    return result;
  };

  window.addEventListener('resize',syncUi);
  render();
})();

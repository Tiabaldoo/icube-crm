
// iCube CRM v1.1.19 — full mobile director navigation + responsive polish.
(function(){
  state.mobileMenuOpen = !!state.mobileMenuOpen;

  const mobileNavItems=[
    ['dashboard','Главная'],
    ['children','Дети'],
    ['groups','Группы'],
    ['calendar','Календарь'],
    ['payments','Оплаты'],
    ['refunds','Возвраты'],
    ['balances','Балансы / долги'],
    ['teachers','Преподаватели'],
    ['sites','Площадки'],
    ['salary','Зарплата'],
    ['partner','Партнёр'],
    ['stats','Статистика'],
    ['settings','Настройки']
  ];

  window.openMobileMenuV129=function(){state.mobileMenuOpen=true;render();};
  window.closeMobileMenuV129=function(){state.mobileMenuOpen=false;render();};
  window.mobileNavToV129=function(page){
    state.mobileMenuOpen=false;
    state.page=page;
    render();
  };

  function mobileDrawer(){
    if(!state.mobileMenuOpen) return '';
    return '<div class="mobile-drawer-backdrop" onclick="closeMobileMenuV129()">'+
      '<aside class="mobile-drawer" onclick="event.stopPropagation()">'+
        '<div class="mobile-drawer-head"><div class="brand"><div class="brand-mark">iC</div><div>iCube CRM</div></div><button class="mobile-drawer-close" onclick="closeMobileMenuV129()">×</button></div>'+
        '<div class="mobile-drawer-nav">'+
          mobileNavItems.map(function(x,i){
            return (i===7?'<div class="mobile-drawer-section">Управление</div>':'')+
              '<button class="'+(state.page===x[0]?'active':'')+'" onclick="mobileNavToV129(\''+x[0]+'\')">'+x[1]+'</button>';
          }).join('')+
        '</div>'+
      '</aside>'+
    '</div>';
  }

  const shellBeforeV129=window.shell || shell;
  window.shell=function(content,title){
    let html=shellBeforeV129(content,title);
    html=html.replace(
      '<header class="topbar"><div class="crumb">',
      '<header class="topbar"><div class="mobile-top-left"><button class="mobile-menu-button" onclick="openMobileMenuV129()" aria-label="Открыть меню">☰</button><div class="crumb">'
    );
    html=html.replace(
      '</div><div class="top-actions">',
      '</div></div><div class="top-actions">'
    );
    html=html.replace(/<div class="mobile-nav">[\s\S]*?<\/div><\/main><\/div>$/,
      '</main></div>'+mobileDrawer()
    );
    return html;
  };

  // When switching back from teacher to director, always land on the dashboard.
  const renderBeforeV129=window.render || render;
  window.render=function(){
    if(state.role==='director' && !state.page) state.page='dashboard';
    return renderBeforeV129();
  };

  render();
})();

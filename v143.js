// iCube CRM v1.1.43 — show how much to top up a fractional lesson balance to the next whole lesson.
(function(){
  const EPS=1e-7;

  function fmt(n,d){
    return Number(Number(n||0).toFixed(d==null?4:d));
  }

  function topUpInfo(e){
    if(!e) return null;
    const balance=Number(e.balance||0);
    const rounded=Math.round(balance);
    if(Math.abs(balance-rounded)<EPS) return null;

    const price=Number(effectivePrice(e)||0);
    if(!(price>0)) return null;

    // The next integer at or above the current balance. This also behaves sensibly
    // for a fractional debt: -0.5 -> 0, -1.2 -> -1.
    const target=Math.ceil(balance-EPS);
    const lessonPart=target-balance;
    if(!(lessonPart>EPS)) return null;

    return {
      target:target,
      amount:lessonPart*price,
      lessonPart:lessonPart,
      price:price
    };
  }

  window.fractionalBalanceTopUpV143=topUpInfo;

  const childBeforeV143=window.child;
  if(typeof childBeforeV143==='function'){
    window.child=function(){
      let html=childBeforeV143();
      const child=byId(state.children,state.selectedChild);
      if(!child || state.childTab!=='overview') return html;

      (child.enrollments||[]).forEach(function(e){
        const info=topUpInfo(e);
        if(!info) return;

        const balanceText=fmt(e.balance,4)+' занятий';
        const priceText=money(effectivePrice(e))+' / занятие';
        const marker='<div class="money '+(e.balance<0?'negative':e.balance>0?'positive':'')+'">'+balanceText+'</div><div class="muted mini">'+priceText+'</div>';
        if(!html.includes(marker)) return;

        const targetText=info.target===1?'1 занятия':fmt(info.target,4)+' занятий';
        const hint='<div class="muted mini" style="margin-top:4px"><b>Доплатить '+money(info.amount)+'</b> → будет '+targetText+'</div>';
        html=html.replace(marker,marker+hint);
      });
      return html;
    };
  }

  render();
})();

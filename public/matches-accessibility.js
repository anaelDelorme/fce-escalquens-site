(()=>{
  const enhance=()=>{
    const active=typeof tab==='string'?tab:'upcoming';
    document.querySelectorAll('[data-tab]').forEach(button=>{
      const selected=button.dataset.tab===active;
      button.classList.toggle('active',selected);
      button.setAttribute('aria-selected',String(selected));
      button.setAttribute('tabindex',selected?'0':'-1');
    });
    document.querySelectorAll('#standings-page table thead th').forEach((cell,index)=>{
      cell.setAttribute('scope','col');
      const labels=['Position','Équipe','Matchs joués','Victoires','Matchs nuls','Défaites','Points'];
      cell.setAttribute('aria-label',labels[index]||cell.textContent.trim());
    });
  };
  if(typeof draw==='function'){
    const baseDraw=draw;
    draw=function(){const result=baseDraw.apply(this,arguments);enhance();return result};
  }
  document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    const tabs=[...document.querySelectorAll('[data-tab]')];let index=tabs.indexOf(button);
    if(event.key==='ArrowRight')index=(index+1)%tabs.length;
    if(event.key==='ArrowLeft')index=(index-1+tabs.length)%tabs.length;
    if(event.key==='Home')index=0;if(event.key==='End')index=tabs.length-1;
    event.preventDefault();tabs[index].focus();tabs[index].click();
  }));
  const observer=new MutationObserver(enhance);const standings=document.querySelector('#standings-page');if(standings)observer.observe(standings,{childList:true,subtree:true});
  enhance();
})();

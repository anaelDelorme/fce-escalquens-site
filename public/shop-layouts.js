// Manual rails: native swipe/keyboard scrolling plus a discreet progress scrubber.
export function initShopRails(doc=document){
 if(doc.body.dataset.shopLayout!=='rail')return;
 doc.querySelectorAll('[data-shop-category]').forEach(section=>{
  const rail=section.querySelector('.shop-product-grid');if(!rail||section.querySelector('.shop-rail-navigation'))return;
  const name=section.querySelector('h3')?.textContent||'Articles';
  rail.id='shop-rail-'+section.dataset.shopCategory;rail.tabIndex=0;rail.setAttribute('role','region');rail.setAttribute('aria-label',name+' : articles à faire défiler');
  const shell=doc.createElement('div');shell.className='shop-rail-shell';rail.before(shell);shell.append(rail);
  const controls=doc.createElement('div');controls.className='shop-rail-navigation';
  const hint=doc.createElement('span');hint.className='shop-rail-hint';hint.textContent='Molette ou glisser pour explorer';
  const progress=doc.createElement('input');progress.type='range';progress.min='0';progress.max='100';progress.step='1';progress.value='0';progress.setAttribute('aria-label','Défilement des articles : '+name);progress.setAttribute('aria-controls',rail.id);
  const count=doc.createElement('span');count.className='shop-rail-count';
  controls.append(hint,progress,count);shell.after(controls);
  const update=()=>{
   const maximum=Math.max(0,rail.scrollWidth-rail.clientWidth),value=maximum?Math.round(rail.scrollLeft/maximum*100):0;
   progress.value=String(Math.max(0,Math.min(100,value)));progress.style.setProperty('--rail-progress',progress.value+'%');progress.setAttribute('aria-valuetext',progress.value+' % de la collection');
   const total=rail.querySelectorAll('[data-shop-product]:not([hidden])').length;count.textContent=total+' article'+(total>1?'s':'');
   controls.hidden=maximum<=2;shell.classList.toggle('has-before',rail.scrollLeft>2);shell.classList.toggle('has-after',rail.scrollLeft<maximum-2);
  };
  progress.addEventListener('input',()=>{rail.scrollLeft=Math.max(0,rail.scrollWidth-rail.clientWidth)*Number(progress.value)/100;update();});
  // Wheel over the cards, keeping vertical page scrolling at either end.
  rail.addEventListener('wheel',event=>{
   if(event.ctrlKey||Math.abs(event.deltaX)>Math.abs(event.deltaY))return;
   const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?rail.clientWidth:1),maximum=Math.max(0,rail.scrollWidth-rail.clientWidth);
   if((delta>0&&rail.scrollLeft>=maximum-2)||(delta<0&&rail.scrollLeft<=2)||!maximum)return;
   event.preventDefault();rail.scrollLeft=Math.max(0,Math.min(maximum,rail.scrollLeft+delta));update();
  },{passive:false});
  let drag=null,swiped=false;
  rail.addEventListener('pointerdown',event=>{
   swiped=false;if(event.pointerType!=='mouse'||event.button!==0||event.target.closest('button:not([data-zoom-image]),a,input'))return;
   drag={id:event.pointerId,x:event.clientX,left:rail.scrollLeft};
  });
  rail.addEventListener('pointermove',event=>{
   if(!drag||drag.id!==event.pointerId)return;
   if(!swiped&&Math.abs(event.clientX-drag.x)<6)return;
   if(!swiped){rail.setPointerCapture(event.pointerId);swiped=true;rail.classList.add('is-dragging');}
   event.preventDefault();rail.scrollLeft=drag.left+drag.x-event.clientX;update();
  });
  const end=()=>{drag=null;rail.classList.remove('is-dragging');};
  rail.addEventListener('pointerup',end);rail.addEventListener('pointercancel',()=>{swiped=false;end();});rail.addEventListener('lostpointercapture',end);
  rail.addEventListener('pointerleave',()=>{if(!swiped)end();});
  rail.addEventListener('dragstart',event=>event.preventDefault());
  rail.addEventListener('click',event=>{if(swiped){event.preventDefault();event.stopImmediatePropagation();swiped=false;}},true);
  rail.addEventListener('scroll',update,{passive:true});doc.addEventListener('shop-filter-changed',()=>{rail.scrollLeft=0;update();});
  doc.defaultView.addEventListener('resize',update);update();
 });
}
if(typeof document!=='undefined')document.addEventListener('shop-loaded',()=>initShopRails());

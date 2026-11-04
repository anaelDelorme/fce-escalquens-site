// Boutique 5: category lockers with native thumbnail scrolling.
export function initShopStudio(doc=document){
 if(doc.body.dataset.shopLayout!=='experimental')return;
 const catalogue=doc.querySelector('#shop-categories');
 if(!catalogue)return;
 // Compose the opening from real catalogue photos; no additional catalogue request.
 const showcase=doc.querySelector('#studio-hero-pieces');
 if(showcase){
  showcase.querySelectorAll('.studio-hero-piece').forEach(node=>node.remove());
  const categoryPhotos=[...catalogue.querySelectorAll('[data-shop-category]')].map(section=>section.querySelector('.product-card-visual img'));
  const photos=[...categoryPhotos,...catalogue.querySelectorAll('.product-card-visual img')],seen=new Set();
  for(const photo of photos){
   const src=photo?.getAttribute('src');if(!src?.startsWith('/media/')||seen.has(src))continue;
   seen.add(src);const piece=doc.createElement('div'),image=doc.createElement('img');piece.className='studio-hero-piece';image.src=src;image.alt='';image.decoding='async';
   image.onerror=()=>{piece.remove();showcase.classList.toggle('has-products',!!showcase.querySelector('.studio-hero-piece'));};
   piece.append(image);showcase.append(piece);if(seen.size===3)break;
  }
  showcase.classList.toggle('has-products',seen.size>0);
 }
 catalogue._studioDispose?.();
 const disposers=[];
 catalogue.querySelectorAll('[data-shop-category]').forEach((section,sectionIndex)=>{
 const stage=section.querySelector('.shop-product-grid');if(!stage)return;
 section.querySelector('.studio-shell')?.replaceWith(stage);
 section.querySelector('.studio-navigation')?.remove();
 const cards=[...stage.querySelectorAll('[data-shop-product]')];if(!cards.length)return;
 section.classList.add('studio-locker');stage.classList.add('studio-stage');
 stage.id='studio-stage-'+sectionIndex;
 const title=section.querySelector('header h3');
 const categoryName=title?.textContent||'Collection';
 if(title){title.id='studio-category-'+sectionIndex;section.setAttribute('aria-labelledby',title.id);}
 let selected=cards[0],overview=false;
 const create=(tag,className,text)=>{const node=doc.createElement(tag);node.className=className;if(text)node.textContent=text;return node;};
 const nav=create('div','studio-navigation');
 const hint=create('p','studio-browse-hint','Choisissez votre article');
 const live=create('span','studio-live');live.setAttribute('role','status');live.setAttribute('aria-live','polite');live.setAttribute('aria-atomic','true');
 const view=create('button','studio-view','Vue d’ensemble');view.type='button';view.setAttribute('aria-pressed','false');view.setAttribute('aria-controls',stage.id);
 nav.append(hint,live,view);stage.before(nav);
 const shell=create('div','studio-shell'),thumbnails=create('nav','studio-thumbnails');thumbnails.setAttribute('aria-label','Choisir un article : '+categoryName);
 stage.before(shell);shell.append(stage,thumbnails);
 const shelf=create('div','studio-thumbnail-items');shelf.setAttribute('role','group');shelf.setAttribute('aria-label','Articles : '+categoryName);thumbnails.append(shelf);
 const entries=cards.map(card=>{
  const name=card.querySelector('h3')?.textContent||'Article',button=create('button','studio-thumbnail');button.type='button';button.setAttribute('aria-label',name);button.setAttribute('aria-controls',stage.id);
  const source=card.querySelector('.product-card-visual img'),image=create('img','');image.src=source?.getAttribute('src')||'/logo-fce.webp';image.alt='';image.loading='lazy';image.draggable=false;image.onerror=()=>{image.onerror=null;image.src='/logo-fce.webp';};
  const label=create('span','studio-thumbnail-name',name);
  button.append(image,label);shelf.append(button);
  card.querySelector('.product-card-visual')?.removeAttribute('data-studio-number');
  button.addEventListener('click',()=>select(card));
  button.addEventListener('keydown',event=>{
   const visible=entries.filter(entry=>available().includes(entry.card)),at=visible.findIndex(entry=>entry.button===button);
   let target;if(event.key==='ArrowRight'||event.key==='ArrowDown')target=visible[Math.min(visible.length-1,at+1)];
   else if(event.key==='ArrowLeft'||event.key==='ArrowUp')target=visible[Math.max(0,at-1)];else if(event.key==='Home')target=visible[0];else if(event.key==='End')target=visible.at(-1);else return;
   event.preventDefault();if(target){select(target.card);target.button.focus({preventScroll:true});}
  });
  return {card,button,name};
 });
 const available=()=>cards.filter(card=>!card.hidden&&!card.closest('[data-shop-category]')?.hidden);
 // Keep the selected thumbnail in view without scrolling the document.
 const reveal=button=>{
  if(!button)return;
  const r=button.getBoundingClientRect(),bounds=shelf.getBoundingClientRect();
  if(r.top<bounds.top)shelf.scrollTop-=bounds.top-r.top;
  else if(r.bottom>bounds.bottom)shelf.scrollTop+=r.bottom-bounds.bottom;
  if(r.left<bounds.left)shelf.scrollLeft-=bounds.left-r.left;
  else if(r.right>bounds.right)shelf.scrollLeft+=r.right-bounds.right;
 };
 const draw=()=>{
  const visible=available();if(!visible.includes(selected))selected=visible[0]||null;
  nav.hidden=shell.hidden=!visible.length;
  shell.classList.toggle('is-overview',overview);thumbnails.hidden=overview;
  cards.forEach(card=>card.classList.toggle('studio-inactive',!overview&&card!==selected));
  entries.forEach(entry=>{entry.button.hidden=!visible.includes(entry.card);const active=entry.card===selected;entry.button.setAttribute('aria-pressed',String(active));entry.button.tabIndex=active?0:-1;});
  view.setAttribute('aria-pressed',String(overview));view.textContent=overview?'Vue immersive':'Vue d’ensemble';
  live.textContent=selected?(overview?visible.length+' articles affichés':entries.find(entry=>entry.card===selected).name):'Aucun article';
  if(!overview)reveal(entries.find(entry=>entry.card===selected)?.button);
 };
 const select=card=>{selected=card;draw();};
 view.addEventListener('click',()=>{overview=!overview;draw();});
 // Native touch and vertical wheel scrolling; horizontal wheel conversion on mobile only.
 shelf.addEventListener('wheel',event=>{
  if(event.ctrlKey||Math.abs(event.deltaX)>Math.abs(event.deltaY)||shelf.scrollWidth<=shelf.clientWidth+2||shelf.scrollHeight>shelf.clientHeight+2)return;
  const maximum=shelf.scrollWidth-shelf.clientWidth,delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?shelf.clientWidth:1);
  if((delta>0&&shelf.scrollLeft>=maximum-2)||(delta<0&&shelf.scrollLeft<=2))return;
  event.preventDefault();shelf.scrollLeft=Math.max(0,Math.min(maximum,shelf.scrollLeft+delta));
 },{passive:false});
 let drag=null,swiped=false;
 shelf.addEventListener('pointerdown',event=>{
  swiped=false;if(event.pointerType!=='mouse'||event.button!==0)return;
  drag={id:event.pointerId,x:event.clientX,y:event.clientY,left:shelf.scrollLeft,top:shelf.scrollTop};
 });
 shelf.addEventListener('pointermove',event=>{
  if(!drag||drag.id!==event.pointerId)return;
  if(!swiped&&Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<6)return;
  if(!swiped){shelf.setPointerCapture(event.pointerId);swiped=true;shelf.classList.add('is-dragging');}
  event.preventDefault();shelf.scrollLeft=drag.left+drag.x-event.clientX;shelf.scrollTop=drag.top+drag.y-event.clientY;
 });
 const endDrag=()=>{drag=null;shelf.classList.remove('is-dragging');};
 shelf.addEventListener('pointerup',endDrag);shelf.addEventListener('pointercancel',()=>{swiped=false;endDrag();});shelf.addEventListener('lostpointercapture',endDrag);shelf.addEventListener('pointerleave',()=>{if(!swiped)endDrag();});
 shelf.addEventListener('dragstart',event=>event.preventDefault());
 shelf.addEventListener('click',event=>{if(swiped){event.preventDefault();event.stopImmediatePropagation();swiped=false;}},true);
 const onFilter=()=>draw();
 doc.addEventListener('shop-filter-changed',onFilter);
 disposers.push(()=>doc.removeEventListener('shop-filter-changed',onFilter));
 draw();
 });
 catalogue._studioDispose=()=>disposers.forEach(dispose=>dispose());
}
if(typeof document!=='undefined')document.addEventListener('shop-loaded',()=>initShopStudio());

// Boutique 5: a single product stage, using the existing cards and order controls.
export function initShopStudio(doc=document){
 if(doc.body.dataset.shopLayout!=='experimental')return;
 const catalogue=doc.querySelector('#shop-categories');
 if(!catalogue)return;
 // The catalogue may be replaced on reload: dispose the previous filter listener.
 catalogue._studioDispose?.();
 doc.querySelector('.studio-shell')?.replaceWith(catalogue);
 doc.querySelector('.studio-navigation')?.remove();
 const cards=[...catalogue.querySelectorAll('[data-shop-product]')];
 if(!cards.length)return;
 let selected=cards[0],overview=false;
 const create=(tag,className,text)=>{const node=doc.createElement(tag);node.className=className;if(text)node.textContent=text;return node;};
 const nav=create('div','studio-navigation');
 const context=create('p','studio-context'),category=create('span','studio-category'),counter=create('span','studio-counter');context.append(category,counter);
 const live=create('span','studio-live');live.setAttribute('role','status');live.setAttribute('aria-live','polite');live.setAttribute('aria-atomic','true');
 const actions=create('div','studio-navigation-actions');
 const previous=create('button','studio-step','←'),next=create('button','studio-step','→'),view=create('button','studio-view','Vue d’ensemble');
 for(const [button,label] of [[previous,'Article précédent'],[next,'Article suivant']]){button.type='button';button.setAttribute('aria-label',label);button.setAttribute('aria-controls','shop-categories');}
 view.type='button';view.setAttribute('aria-pressed','false');view.setAttribute('aria-controls','shop-categories');actions.append(previous,next,view);nav.append(context,live,actions);catalogue.before(nav);
 const shell=create('div','studio-shell'),thumbnails=create('nav','studio-thumbnails');thumbnails.setAttribute('aria-label','Choisir un article de la collection');
 catalogue.before(shell);shell.append(catalogue,thumbnails);
 const entries=cards.map((card,index)=>{
  const name=card.querySelector('h3')?.textContent||'Article',button=create('button','studio-thumbnail');button.type='button';button.setAttribute('aria-label',name);button.setAttribute('aria-controls','shop-categories');
  const source=card.querySelector('.product-card-visual img'),image=create('img','');image.src=source?.getAttribute('src')||'/logo-fce.webp';image.alt='';image.loading='lazy';image.draggable=false;image.onerror=()=>{image.onerror=null;image.src='/logo-fce.webp';};
  const number=create('span','studio-thumbnail-number',String(index+1).padStart(2,'0')),label=create('span','studio-thumbnail-name',name);
  button.append(image,number,label);thumbnails.append(button);
  card.querySelector('.product-card-visual')?.setAttribute('data-studio-number',String(index+1).padStart(2,'0'));
  button.addEventListener('click',()=>select(card));
  button.addEventListener('keydown',event=>{
   const visible=entries.filter(entry=>!entry.button.hidden),at=visible.findIndex(entry=>entry.button===button);
   let target;if(event.key==='ArrowRight'||event.key==='ArrowDown')target=visible[Math.min(visible.length-1,at+1)];
   else if(event.key==='ArrowLeft'||event.key==='ArrowUp')target=visible[Math.max(0,at-1)];else if(event.key==='Home')target=visible[0];else if(event.key==='End')target=visible.at(-1);else return;
   event.preventDefault();if(target){select(target.card);target.button.focus({preventScroll:true});}
  });
  return {card,button,name};
 });
 const available=()=>cards.filter(card=>!card.hidden&&!card.closest('[data-shop-category]')?.hidden);
 const reveal=button=>{
  // Scroll only the thumbnail shelf, without jumping the page or moving focus.
  if(!button)return;
  const top=button.offsetTop-thumbnails.offsetTop,left=button.offsetLeft-thumbnails.offsetLeft;
  if(top<thumbnails.scrollTop)thumbnails.scrollTop=top;
  else if(top+button.offsetHeight>thumbnails.scrollTop+thumbnails.clientHeight)thumbnails.scrollTop=top+button.offsetHeight-thumbnails.clientHeight;
  if(left<thumbnails.scrollLeft)thumbnails.scrollLeft=left;
  else if(left+button.offsetWidth>thumbnails.scrollLeft+thumbnails.clientWidth)thumbnails.scrollLeft=left+button.offsetWidth-thumbnails.clientWidth;
 };
 const draw=()=>{
  const visible=available();if(!visible.includes(selected))selected=visible[0]||null;
  const index=visible.indexOf(selected);nav.hidden=shell.hidden=!visible.length;
  shell.classList.toggle('is-overview',overview);thumbnails.hidden=overview;
  cards.forEach(card=>card.classList.toggle('studio-inactive',!overview&&card!==selected));
  entries.forEach(entry=>{entry.button.hidden=!visible.includes(entry.card);const active=entry.card===selected;entry.button.setAttribute('aria-pressed',String(active));entry.button.tabIndex=active?0:-1;});
  category.textContent=selected?.closest('[data-shop-category]')?.querySelector('header h3')?.textContent||'';
  counter.textContent=visible.length?String(index+1).padStart(2,'0')+' / '+String(visible.length).padStart(2,'0'):'';
  previous.disabled=index<=0;next.disabled=index>=visible.length-1;previous.hidden=next.hidden=overview;
  view.setAttribute('aria-pressed',String(overview));view.textContent=overview?'Vue immersive':'Vue d’ensemble';
  live.textContent=selected?(overview?visible.length+' articles affichés':entries.find(entry=>entry.card===selected).name+', article '+(index+1)+' sur '+visible.length):'Aucun article';
  if(!overview)reveal(entries.find(entry=>entry.card===selected)?.button);
 };
 const select=card=>{selected=card;draw();};
 previous.addEventListener('click',()=>{const visible=available();select(visible[Math.max(0,visible.indexOf(selected)-1)]);});
 next.addEventListener('click',()=>{const visible=available();select(visible[Math.min(visible.length-1,visible.indexOf(selected)+1)]);});
 view.addEventListener('click',()=>{overview=!overview;draw();});
 doc.addEventListener('shop-filter-changed',draw);
 catalogue._studioDispose=()=>doc.removeEventListener('shop-filter-changed',draw);
 draw();
}
if(typeof document!=='undefined')document.addEventListener('shop-loaded',()=>initShopStudio());

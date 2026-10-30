// Boutique 5: independent category lockers, with four thumbnails per page.
export function initShopStudio(doc=document){
 if(doc.body.dataset.shopLayout!=='experimental')return;
 const catalogue=doc.querySelector('#shop-categories');
 if(!catalogue)return;
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
 let selected=cards[0],overview=false,page=0;
 const pageSize=4;
 const create=(tag,className,text)=>{const node=doc.createElement(tag);node.className=className;if(text)node.textContent=text;return node;};
 const nav=create('div','studio-navigation');
 const context=create('p','studio-context'),category=create('span','studio-category'),counter=create('span','studio-counter');context.append(category,counter);
 const live=create('span','studio-live');live.setAttribute('role','status');live.setAttribute('aria-live','polite');live.setAttribute('aria-atomic','true');
 const actions=create('div','studio-navigation-actions');
 const previous=create('button','studio-step','←'),next=create('button','studio-step','→'),view=create('button','studio-view','Vue d’ensemble');
 for(const [button,label] of [[previous,'Article précédent'],[next,'Article suivant']]){button.type='button';button.setAttribute('aria-label',label);button.setAttribute('aria-controls',stage.id);}
 view.type='button';view.setAttribute('aria-pressed','false');view.setAttribute('aria-controls',stage.id);actions.append(previous,next,view);nav.append(context,live,actions);stage.before(nav);
 const shell=create('div','studio-shell'),thumbnails=create('nav','studio-thumbnails');thumbnails.setAttribute('aria-label','Choisir un article : '+categoryName);
 stage.before(shell);shell.append(stage,thumbnails);
 const shelf=create('div','studio-thumbnail-items'),paging=create('div','studio-thumbnail-paging');
 const pagePrevious=create('button','studio-shelf-step','←'),pageNext=create('button','studio-shelf-step','→'),pageStatus=create('span','studio-shelf-count');
 for(const [button,label] of [[pagePrevious,'Miniatures précédentes'],[pageNext,'Miniatures suivantes']]){button.type='button';button.setAttribute('aria-label',label+' : '+categoryName);}
 paging.append(pagePrevious,pageStatus,pageNext);thumbnails.append(shelf,paging);
 const entries=cards.map((card,index)=>{
  const name=card.querySelector('h3')?.textContent||'Article',button=create('button','studio-thumbnail');button.type='button';button.setAttribute('aria-label',name);button.setAttribute('aria-controls',stage.id);
  const source=card.querySelector('.product-card-visual img'),image=create('img','');image.src=source?.getAttribute('src')||'/logo-fce.webp';image.alt='';image.loading='lazy';image.draggable=false;image.onerror=()=>{image.onerror=null;image.src='/logo-fce.webp';};
  const number=create('span','studio-thumbnail-number',String(index+1).padStart(2,'0')),label=create('span','studio-thumbnail-name',name);
  button.append(image,number,label);shelf.append(button);
  card.querySelector('.product-card-visual')?.setAttribute('data-studio-number',String(index+1).padStart(2,'0'));
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
 const draw=(followSelection=true)=>{
  const visible=available();if(!visible.includes(selected))selected=visible[0]||null;
  const index=visible.indexOf(selected);nav.hidden=shell.hidden=!visible.length;
  if(followSelection)page=Math.max(0,Math.floor(index/pageSize));
  page=Math.max(0,Math.min(page,Math.ceil(visible.length/pageSize)-1));
  const shown=visible.slice(page*pageSize,(page+1)*pageSize);
  shell.classList.toggle('is-overview',overview);thumbnails.hidden=overview;
  cards.forEach(card=>card.classList.toggle('studio-inactive',!overview&&card!==selected));
  entries.forEach(entry=>{entry.button.hidden=!shown.includes(entry.card);const active=entry.card===selected;entry.button.setAttribute('aria-pressed',String(active));entry.button.tabIndex=(active&&shown.includes(entry.card))||(!shown.includes(selected)&&entry.card===shown[0])?0:-1;});
  category.textContent=categoryName;
  counter.textContent=visible.length?String(index+1).padStart(2,'0')+' / '+String(visible.length).padStart(2,'0'):'';
  previous.disabled=index<=0;next.disabled=index>=visible.length-1;previous.hidden=next.hidden=overview;
  view.setAttribute('aria-pressed',String(overview));view.textContent=overview?'Vue immersive':'Vue d’ensemble';
  live.textContent=selected?(overview?visible.length+' articles affichés':entries.find(entry=>entry.card===selected).name+', article '+(index+1)+' sur '+visible.length):'Aucun article';
  pagePrevious.disabled=page<=0;pageNext.disabled=(page+1)*pageSize>=visible.length;
  paging.hidden=visible.length<=pageSize;
  pageStatus.textContent=visible.length?(page*pageSize+1)+'–'+Math.min((page+1)*pageSize,visible.length)+' / '+visible.length:'';
 };
 const select=card=>{selected=card;draw();};
 previous.addEventListener('click',()=>{const visible=available();select(visible[Math.max(0,visible.indexOf(selected)-1)]);});
 next.addEventListener('click',()=>{const visible=available();select(visible[Math.min(visible.length-1,visible.indexOf(selected)+1)]);});
 view.addEventListener('click',()=>{overview=!overview;draw();});
 pagePrevious.addEventListener('click',()=>{page--;draw(false);});
 pageNext.addEventListener('click',()=>{page++;draw(false);});
 const onFilter=()=>draw();
 doc.addEventListener('shop-filter-changed',onFilter);
 disposers.push(()=>doc.removeEventListener('shop-filter-changed',onFilter));
 draw();
 });
 catalogue._studioDispose=()=>disposers.forEach(dispose=>dispose());
}
if(typeof document!=='undefined')document.addEventListener('shop-loaded',()=>initShopStudio());

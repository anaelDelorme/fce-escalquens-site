// Carousels are manual: native touch scrolling and keyboard access remain available.
export function initShopRails(doc=document){
 if(doc.body.dataset.shopLayout!=='rail')return;
 doc.querySelectorAll('[data-shop-category]').forEach(section=>{
  const rail=section.querySelector('.shop-product-grid');if(!rail||section.querySelector('.shop-rail-controls'))return;
  const name=section.querySelector('h3')?.textContent||'Articles';
  rail.id='shop-rail-'+section.dataset.shopCategory;rail.tabIndex=0;rail.setAttribute('role','region');rail.setAttribute('aria-label',name+' : articles à faire défiler');
  const controls=doc.createElement('div');controls.className='shop-rail-controls';
  for(const [direction,label,glyph] of [[-1,'Articles précédents','←'],[1,'Articles suivants','→']]){
   const button=doc.createElement('button');button.type='button';button.textContent=glyph;button.setAttribute('aria-label',label+' : '+name);button.setAttribute('aria-controls',rail.id);
   button.onclick=()=>rail.scrollBy({left:direction*Math.max(240,rail.clientWidth*.85),behavior:doc.defaultView.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});controls.append(button);
  }
  section.querySelector('header').append(controls);
  const [previous,next]=controls.querySelectorAll('button');
  const update=()=>{previous.disabled=rail.scrollLeft<=1;next.disabled=rail.scrollLeft+rail.clientWidth>=rail.scrollWidth-2;};
  rail.addEventListener('scroll',update,{passive:true});doc.addEventListener('shop-filter-changed',()=>{rail.scrollLeft=0;update();});
  doc.defaultView.addEventListener('resize',update);update();
 });
}
if(typeof document!=='undefined')document.addEventListener('shop-loaded',()=>initShopRails());

// Image zoom stays local to the viewer; the page and basket are untouched.
export function initShopGallery(doc=document){
 if(doc.querySelector('#image-zoom-dialog'))return;
 const dialog=doc.createElement('dialog');dialog.id='image-zoom-dialog';dialog.className='commerce-dialog shop-image-dialog';dialog.setAttribute('aria-labelledby','image-zoom-title');
 dialog.innerHTML='<div class="shop-image-head"><strong id="image-zoom-title"></strong><button type="button" data-image-close aria-label="Fermer la photo">×</button></div><div class="shop-image-tools"><button type="button" data-image-less aria-label="Réduire la photo">−</button><span role="status" data-image-scale>100 %</span><button type="button" data-image-more aria-label="Agrandir la photo">+</button></div><p class="shop-image-help" id="image-zoom-help">Molette pour zoomer · Glissez pour explorer · Sur mobile, utilisez + puis faites glisser.</p><p data-image-error role="status" hidden>Cette image ne peut pas être chargée.</p><div class="shop-image-stage" tabindex="0" aria-label="Photo agrandie" aria-describedby="image-zoom-help"><img alt="" draggable="false"></div>';
 doc.body.append(dialog);
 const image=dialog.querySelector('img'),stage=dialog.querySelector('.shop-image-stage');let scale=1,trigger=null,drag=null;
 const draw=()=>{
  const ratio=(image.naturalWidth||1)/(image.naturalHeight||1),base=Math.min(stage.clientWidth||640,(stage.clientHeight||Math.max(180,doc.defaultView.innerHeight-210))*ratio);
  image.style.width=Math.round(base*scale)+'px';dialog.querySelector('[data-image-scale]').textContent=Math.round(scale*100)+' %';
  dialog.querySelector('[data-image-less]').disabled=scale<=1;dialog.querySelector('[data-image-more]').disabled=scale>=4;stage.classList.toggle('is-zoomed',scale>1);
 };
 const zoom=(value,x,y)=>{
  const bounds=stage.getBoundingClientRect(),before=image.getBoundingClientRect();
  x??=bounds.left+bounds.width/2;y??=bounds.top+bounds.height/2;
  const px=before.width?(x-before.left)/before.width:.5,py=before.height?(y-before.top)/before.height:.5;
  scale=Math.max(1,Math.min(4,value));draw();
  const after=image.getBoundingClientRect();stage.scrollLeft+=after.left+px*after.width-x;stage.scrollTop+=after.top+py*after.height-y;
  if(scale===1)stage.scrollTop=stage.scrollLeft=0;
 };
 dialog.querySelector('[data-image-close]').onclick=()=>dialog.close();
 dialog.querySelector('[data-image-less]').onclick=()=>zoom(scale-.5);
 dialog.querySelector('[data-image-more]').onclick=()=>zoom(scale+.5);
 stage.addEventListener('wheel',event=>{
  if(!event.deltaY)return;event.preventDefault();
  const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?stage.clientHeight:1);
  zoom(scale*Math.exp(-Math.max(-120,Math.min(120,delta))*.0025),event.clientX,event.clientY);
 },{passive:false});
 stage.addEventListener('pointerdown',event=>{
  if(event.pointerType==='touch'||event.button!==0||scale<=1)return;
  drag={id:event.pointerId,x:event.clientX,y:event.clientY,left:stage.scrollLeft,top:stage.scrollTop};
  stage.setPointerCapture(event.pointerId);stage.classList.add('is-dragging');event.preventDefault();stage.focus({preventScroll:true});
 });
 stage.addEventListener('pointermove',event=>{if(drag?.id!==event.pointerId)return;stage.scrollLeft=drag.left+drag.x-event.clientX;stage.scrollTop=drag.top+drag.y-event.clientY;});
 const endDrag=()=>{drag=null;stage.classList.remove('is-dragging');};
 stage.addEventListener('pointerup',endDrag);stage.addEventListener('pointercancel',endDrag);stage.addEventListener('lostpointercapture',endDrag);
 image.onload=draw;image.onerror=()=>{image.hidden=true;dialog.querySelector('[data-image-error]').hidden=false;};
 dialog.addEventListener('close',()=>{endDrag();image.removeAttribute('src');trigger?.focus();});
 dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();});
 doc.addEventListener('click',event=>{
  const button=event.target.closest('[data-zoom-image]');if(!button)return;
  const source=button.dataset.zoomImage;if(!source?.startsWith('/media/')||source.startsWith('//'))return;
  trigger=button;scale=1;image.hidden=false;dialog.querySelector('[data-image-error]').hidden=true;
  dialog.querySelector('#image-zoom-title').textContent=button.dataset.zoomTitle||'Photo de l’article';image.alt=button.dataset.zoomTitle||'Photo de l’article';
  image.src=source;dialog.showModal();stage.scrollTop=stage.scrollLeft=0;draw();dialog.querySelector('[data-image-close]').focus();
 });
 doc.defaultView.addEventListener('resize',()=>{if(dialog.open)draw();});
}
if(typeof document!=='undefined')initShopGallery();

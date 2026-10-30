// Manual image viewer: no network call beyond the existing article image.
export function initShopGallery(doc=document){
 if(doc.querySelector('#image-zoom-dialog'))return;
 const dialog=doc.createElement('dialog');dialog.id='image-zoom-dialog';dialog.className='commerce-dialog shop-image-dialog';dialog.setAttribute('aria-labelledby','image-zoom-title');
 dialog.innerHTML='<div class="shop-image-head"><strong id="image-zoom-title"></strong><button type="button" data-image-close aria-label="Fermer la photo">×</button></div><div class="shop-image-tools"><button type="button" data-image-less aria-label="Réduire la photo">−</button><span role="status" data-image-scale>100 %</span><button type="button" data-image-more aria-label="Agrandir la photo">+</button><button type="button" data-image-reset>Ajuster</button></div><p class="shop-image-help">Agrandissez puis faites défiler pour voir les détails.</p><p data-image-error role="status" hidden>Cette image ne peut pas être chargée.</p><div class="shop-image-stage" tabindex="0" aria-label="Photo agrandie, défilement disponible"><img alt=""></div>';
 doc.body.append(dialog);
 const image=dialog.querySelector('img'),stage=dialog.querySelector('.shop-image-stage');let scale=1,trigger=null;
 const draw=()=>{
  const ratio=(image.naturalWidth||1)/(image.naturalHeight||1),base=Math.min(stage.clientWidth||640,Math.max(180,(doc.defaultView.innerHeight-210))*ratio);
  image.style.width=Math.round(base*scale)+'px';dialog.querySelector('[data-image-scale]').textContent=Math.round(scale*100)+' %';
  dialog.querySelector('[data-image-less]').disabled=scale<=1;dialog.querySelector('[data-image-more]').disabled=scale>=3;
 };
 dialog.querySelector('[data-image-close]').onclick=()=>dialog.close();
 dialog.querySelector('[data-image-less]').onclick=()=>{scale=Math.max(1,scale-.5);draw();};
 dialog.querySelector('[data-image-more]').onclick=()=>{scale=Math.min(3,scale+.5);draw();};
 dialog.querySelector('[data-image-reset]').onclick=()=>{scale=1;stage.scrollTop=stage.scrollLeft=0;draw();};
 image.onload=draw;image.onerror=()=>{image.hidden=true;dialog.querySelector('[data-image-error]').hidden=false;};
 dialog.addEventListener('close',()=>{image.removeAttribute('src');trigger?.focus();});
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

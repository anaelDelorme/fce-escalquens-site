import {api} from '../../public/shop-common.js';

// Rasterize same-origin media in the browser: WebP/AVIF/GIF are supported without
// another provider, image-conversion secret or transmission to a third party.
async function imagePng(path) {
  const url=new URL(path,location.origin);
  if(url.origin!==location.origin)throw new Error('Image externe refusée.');
  const image=new Image();image.src=url.href;
  let timeout;try{await Promise.race([image.decode(),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Délai de chargement de la photo dépassé.')),12000);})]);}finally{clearTimeout(timeout);}
  const scale=Math.min(1,850/Math.max(image.naturalWidth,image.naturalHeight));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('La génération des photos est indisponible.');ctx.drawImage(image,0,0,canvas.width,canvas.height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('Conversion de la photo impossible.');return new Uint8Array(await blob.arrayBuffer());
}
const button=document.querySelector('#shop-catalogue'),status=document.querySelector('#catalogue-status');
button?.addEventListener('click',async()=>{
  button.disabled=true;const initial=button.textContent;button.textContent='Préparation du catalogue…';status.textContent='Lecture des articles disponibles…';
  try{
    const {cataloguePdf}=await import('../shop/catalogue-pdf');
    const cat=await api('/api/shop/catalogue');if(!cat.products.length)throw new Error('Aucun article n’est visible pour le moment.');const logo=await imagePng('/logo-fce.webp'),products=new Map();let failures=0,completed=0;
    // Bounded parallelism avoids decoding all full-resolution photos at once on mobile.
    const queue=[...cat.products];await Promise.all(Array.from({length:Math.min(3,queue.length)},async()=>{while(queue.length){const p=queue.shift();try{products.set(String(p.id),await imagePng('/media/'+encodeURIComponent(p.image_key).replace(/%2F/g,'/')));}catch{failures++;}status.textContent=`Préparation des visuels : ${++completed} / ${cat.products.length}`;}}));
    const bytes=await cataloguePdf(cat,new Date(),{logo,products});const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));const link=document.createElement('a');link.href=url;link.download='catalogue-fce.pdf';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
    status.textContent=`Catalogue généré avec ${cat.products.length} article(s).${failures?` ${failures} photo(s) indisponible(s), remplacée(s) par le logo du club.`:''}`;
  }catch(error){status.textContent=`Le catalogue n’a pas pu être généré : ${error.message} Réessayez dans quelques instants.`;}
  finally{button.disabled=false;button.textContent=initial;}
});

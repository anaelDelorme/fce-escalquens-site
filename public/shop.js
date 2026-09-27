const shopEsc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const shopLines=value=>String(value||'').split(/\s*\|\s*|\n+/).map(line=>line.trim()).filter(Boolean);
const shopRichText=value=>{
  let text=shopEsc(value).replace(/\r\n?/g,'\n');
  text=text
    .replace(/\[bordeaux\]([\s\S]*?)\[\/bordeaux\]/gi,'<span class="shop-text-wine">$1</span>')
    .replace(/\[or\]([\s\S]*?)\[\/or\]/gi,'<span class="shop-text-gold">$1</span>')
    .replace(/\*\*([\s\S]*?)\*\*/g,'<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g,'$1<em>$2</em>');
  return text.replace(/\n/g,'<br>');
};
const productDescriptions=product=>{
  const short=String(product.short_description||'').trim();
  const description=String(product.description||'').trim();
  const same=short&&description&&short===description;
  if(!short&&!description)return '';
  return `<div class="product-descriptions">
    ${short?`<p class="product-lead shop-rich">${shopRichText(short)}</p>`:''}
    ${description&&!same?`<p class="product-description shop-rich">${shopRichText(description)}</p>`:''}
  </div>`;
};
const productVisual=(product,featured=false)=>product.image_key
  ?`<img src="/media/${encodeURIComponent(product.image_key).replace(/%2F/g,'/')}" alt="${shopEsc(product.name)}" ${featured?'':'loading="lazy"'}>`
  :`<div class="product-placeholder"><img src="/logo-fce.webp" alt=""><span>${shopEsc(product.name)}</span><small>Photo à venir</small></div>`;
const productMeta=product=>{
  const sizes=shopLines(product.sizes),options=shopLines(product.options),prices=shopLines(product.price_details);
  const delay=String(product.delivery_delay||'').trim();
  return `<div class="product-meta">
    ${prices.length?`<div><small>Tarifs</small>${prices.map(line=>`<span>${shopEsc(line)}</span>`).join('')}</div>`:''}
    ${sizes.length?`<div><small>Tailles</small>${sizes.map(line=>`<span>${shopEsc(line)}</span>`).join('')}</div>`:''}
    ${options.length?`<div><small>Options</small>${options.map(line=>`<span>${shopEsc(line)}</span>`).join('')}</div>`:''}
    ${delay?`<div class="product-delay"><small>Délai indicatif</small><span>${shopEsc(delay)}</span></div>`:''}
  </div>`;
};
const orderButton=product=>`<button class="product-order" type="button" data-order-product="${shopEsc(product.name)}">Commander cet article →</button>`;
const productCard=product=>`<article class="shop-product-card">
  <div class="product-card-visual">${productVisual(product)}</div>
  <div class="product-card-copy"><small>${shopEsc(product.price_label||'Prix à confirmer')}</small><h3>${shopEsc(product.name)}</h3>${productDescriptions(product)}${productMeta(product)}${orderButton(product)}</div>
</article>`;
const revealShopHero=media=>{
  const hero=document.querySelector('#shop-hero-image');if(!hero)return;
  const fallback=hero.dataset.fallbackSrc||'/hero-foot.webp';
  const custom=media?.object_key?`/media/${encodeURIComponent(media.object_key).replace(/%2F/g,'/')}`:'';
  const source=custom||fallback;if(media?.alt_text)hero.alt=media.alt_text;
  const load=(candidate,allowFallback)=>{const loader=new Image();loader.onload=()=>{hero.src=candidate;hero.classList.add('is-ready')};loader.onerror=()=>{if(allowFallback&&candidate!==fallback)load(fallback,false)};loader.src=candidate};
  load(source,true);
};
async function loadShop(){
  const featuredNode=document.querySelector('#shop-featured'),categoriesNode=document.querySelector('#shop-categories');
  try{
    const response=await fetch('/api/page/shop?v=2'),data=await response.json();
    if(!response.ok)throw new Error(data.error||'Boutique indisponible');
    const products=data.products||[],categories=data.categories||[],featured=products.find(product=>Number(product.featured)===1)||products[0];
    window.shopSettings=data.settings||{};
    revealShopHero((data.site_media||[]).find(item=>item.slot==='shop_hero'));
    if(featured){
      featuredNode.innerHTML=`<div class="featured-visual">${productVisual(featured,true)}<span>À la une</span></div><div class="featured-copy"><small>${shopEsc(featured.price_label||'Prix à confirmer')}</small><h3>${shopEsc(featured.name)}</h3>${productDescriptions(featured)}${productMeta(featured)}${orderButton(featured)}</div>`;
    }else featuredNode.innerHTML='<p class="shop-empty">La sélection de la boutique arrive bientôt.</p>';
    categoriesNode.innerHTML=categories.map((category,categoryIndex)=>{
      const visible=products.filter(product=>String(product.shop_category_id)===String(category.id)).sort((a,b)=>Number(b.highlighted)-Number(a.highlighted));
      if(!visible.length)return '';
      return `<section class="shop-category"><header><span>${String(categoryIndex+1).padStart(2,'0')}</span><div><h3>${shopEsc(category.name)}</h3><p>${shopEsc(category.description||'')}</p></div></header><div class="shop-product-grid">${visible.map(productCard).join('')}</div></section>`;
    }).join('')||'<p class="shop-empty">La sélection de la boutique arrive bientôt.</p>';
    const catalogue=document.querySelector('#shop-catalogue');
    if(data.settings?.catalogue_key){catalogue.href=`/media/${encodeURIComponent(data.settings.catalogue_key).replace(/%2F/g,'/')}`;catalogue.textContent=`${data.settings.catalogue_title||'Catalogue complet'} →`;catalogue.target='_blank';catalogue.rel='noopener';catalogue.removeAttribute('aria-disabled')}
    bindProductButtons();
  }catch(error){revealShopHero(null);featuredNode.innerHTML='<p class="shop-empty">L’article à la une est momentanément indisponible.</p>';categoriesNode.innerHTML='<p class="shop-empty">La boutique ne peut pas être chargée pour le moment.</p>'}
}
function bindProductButtons(){document.querySelectorAll('[data-order-product]').forEach(button=>button.addEventListener('click',()=>{
  const textarea=document.querySelector('#shop-order-form textarea[name="request"]'),line=`- ${button.dataset.orderProduct}\n  Quantité : 1\n  Taille : \n  Option(s) : `;
  textarea.value=textarea.value.trim()?`${textarea.value.trim()}\n\n${line}`:line;
  document.querySelector('#commander').scrollIntoView({behavior:'smooth'});setTimeout(()=>textarea.focus(),450);
}))}
document.querySelector('#shop-order-form')?.addEventListener('submit',event=>{
  event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget));
  const settings=window.shopSettings||{},email=settings.contact_email||'fcescalquens@gmail.com',subject=settings.order_subject||'Commande boutique FC Escalquens';
  const body=['Bonjour,','','Je souhaite commander les articles suivants :','',values.request,'',`Mon adresse e-mail : ${values.contact_email}`,`Mon numéro de téléphone : ${values.contact_phone}`,`Nom du licencié : ${values.licensed_name||'Non précisé'}`,`Équipe / catégorie : ${values.team||'Non précisée'}`,'','Merci de me confirmer la disponibilité, le délai, le prix final et les modalités de paiement.','','Sportivement.'].join('\n');
  const status=document.querySelector('#shop-order-status');if(status)status.textContent='Votre application e-mail va s’ouvrir avec la commande préremplie. Vérifiez le message puis cliquez sur « Envoyer ».';
  window.location.href=`mailto:${String(email).replace(/[^a-z0-9@._+-]/gi,'')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
});
loadShop();

import {priceMarkup} from "./shop-common.js";
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
const productDescriptions=product=>String(product.short_description||'').trim()?`<div class="product-descriptions"><p class="product-lead shop-rich">${shopRichText(product.short_description)}</p></div>`:'';
const productVisual=(product,featured=false)=>product.image_key
  ?`<img src="/media/${encodeURIComponent(product.image_key).replace(/%2F/g,'/')}" alt="${shopEsc(product.name)}" ${featured?'':'loading="lazy"'}>`
  :`<div class="product-placeholder"><img src="/logo-fce.webp" alt=""><span>${shopEsc(product.name)}</span><small>Photo à venir</small></div>`;
const productMeta=product=>{
  const sizes=shopLines(product.sizes),options=shopLines(product.options),prices=shopLines(product.price_details);
  const delay=String(product.delivery_delay||'').trim();
  return `<div class="product-meta">
    ${prices.length?`<div><small>Tarifs</small>${prices.map(line=>`<span>${shopEsc(line)}</span>`).join('')}</div>`:''}
    ${sizes.length?`<div><small>Tailles</small>${sizes.map(line=>`<span>${shopEsc(line)}</span>`).join('')}</div>`:''}
    ${options.length?`<div><small>Personnalisations</small>${options.map(line=>`<span>${shopEsc(line)}</span>`).join('')}</div>`:''}
    ${delay?`<div class="product-delay"><small>Délai indicatif</small><span>${shopEsc(delay)}</span></div>`:''}
  </div>`;
};
const orderButton=product=>`<div class="product-actions"><button class="product-order" type="button" data-order-product="${product.id}" ${product.sellable?'':'disabled'}>${shopEsc(product.orderLabel||'Commande bientôt disponible')} →</button><button class="product-detail" type="button" data-product-detail="${product.id}">Détails de l’article</button></div>`;
const productCard=product=>`<article class="shop-product-card" data-shop-product="${product.id}">
  <div class="product-card-visual">${productVisual(product)}</div>
  <div class="product-card-copy">${product.price_markup||`<small>${shopEsc(product.price_label||'Prix à confirmer')}</small>`}<h3>${shopEsc(product.name)}</h3>${productDescriptions(product)}${productMeta(product)}${orderButton(product)}</div>
</article>`;
const revealShopHero=media=>{
  const hero=document.querySelector('#shop-hero-image');if(!hero)return;
  const fallback=hero.dataset.fallbackSrc||'/hero-foot.webp';
  const custom=media?.object_key?`/media/${encodeURIComponent(media.object_key).replace(/%2F/g,'/')}`:'';
  const source=custom||fallback;if(media?.alt_text)hero.alt=media.alt_text;
  const load=(candidate,allowFallback)=>{const loader=new Image();loader.onload=()=>{hero.src=candidate;hero.classList.add('is-ready')};loader.onerror=()=>{if(allowFallback&&candidate!==fallback)load(fallback,false)};loader.src=candidate};
  load(source,true);
};
const showShopMaintenance=settings=>{
  const page=document.querySelector('#shop-page');
  const section=document.querySelector('#shop-maintenance');
  const image=document.querySelector('#shop-maintenance-image');
  const fallback=document.querySelector('#shop-maintenance-fallback');
  if(!page||!section)return;
  const enabled=Number(settings?.shop_enabled??1)!==0;
  page.classList.remove('is-loading');
  if(enabled){page.classList.remove('is-closed');section.hidden=true;return;}
  page.classList.add('is-closed');section.hidden=false;
  const key=String(settings?.maintenance_image_key||'').trim();
  if(key&&image){
    image.src=`/media/${encodeURIComponent(key).replace(/%2F/g,'/')}`;
    image.hidden=false;if(fallback)fallback.hidden=true;
    image.onerror=()=>{image.hidden=true;if(fallback)fallback.hidden=false;};
  }else{if(image)image.hidden=true;if(fallback)fallback.hidden=false;}
};

async function loadShop(){
  const featuredNode=document.querySelector('#shop-featured'),categoriesNode=document.querySelector('#shop-categories');
  try{
    const [response,commerceResponse]=await Promise.all([fetch('/api/page/shop?v=3'),fetch('/api/shop/catalogue')]);const data=await response.json();const commerce=commerceResponse.ok?await commerceResponse.json():null;
    for(const p of data.products||[]){const variants=commerce?.variants.filter(v=>v.product_id===p.id)||[],options=commerce?.options.filter(o=>o.product_id===p.id)||[];p.options=options.map(o=>o.label).join('\n');p.sellable=variants.length>0;p.orderLabel=!variants.length?'Tailles et tarifs bientôt disponibles':variants.length>1?(options.length?'Choisir ma taille et personnaliser':'Choisir ma taille'):options.length?'Personnaliser mon article':'Ajouter au panier';p.price_markup=priceMarkup(variants);if(variants.length){const prices=variants.map(v=>v.price_cents),min=Math.min(...prices),max=Math.max(...prices);const money=n=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(n/100);p.price_label=min!==max?'De '+money(min)+' à '+money(max):money(min);p.price_details='';p.sizes=variants.map(v=>v.label).join('\n');p.options=options.map(o=>o.label+(o.price_cents?' · +'+money(o.price_cents):'')).join('\n');}}
    if(!response.ok)throw new Error(data.error||'Boutique indisponible');
    const products=data.products||[],categories=data.categories||[],featured=products.find(product=>Number(product.featured)===1)||products[0];
    window.shopSettings=data.settings||{};
    showShopMaintenance(window.shopSettings);
    if(Number(window.shopSettings.shop_enabled??1)===0)return;
    revealShopHero((data.site_media||[]).find(item=>item.slot==='shop_hero'));
    if(featured){
      featuredNode.innerHTML=`<div class="featured-visual">${productVisual(featured,true)}<span>À la une</span></div><div class="featured-copy">${featured.price_markup||`<small>${shopEsc(featured.price_label||'Prix à confirmer')}</small>`}<h3>${shopEsc(featured.name)}</h3>${productDescriptions(featured)}${productMeta(featured)}${orderButton(featured)}</div>`;
    }else featuredNode.innerHTML='<p class="shop-empty">La sélection de la boutique arrive bientôt.</p>';
    categoriesNode.innerHTML=categories.map((category,categoryIndex)=>{
      const visible=products.filter(product=>String(product.shop_category_id)===String(category.id)).sort((a,b)=>Number(b.highlighted)-Number(a.highlighted));
      if(!visible.length)return '';
      return `<section class="shop-category" data-shop-category="${category.id}"><header><span>${String(categoryIndex+1).padStart(2,'0')}</span><div><h3>${shopEsc(category.name)}</h3><p>${shopEsc(category.description||'')}</p></div></header><div class="shop-product-grid">${visible.map(productCard).join('')}</div></section>`;
    }).join('')||'<p class="shop-empty">La sélection de la boutique arrive bientôt.</p>';
    setupShopBrowse(products,categories);
    document.dispatchEvent(new CustomEvent('shop-loaded',{detail:commerce}));
  }catch(error){document.querySelector('#shop-page')?.classList.remove('is-loading');revealShopHero(null);featuredNode.innerHTML='<p class="shop-empty">L’article à la une est momentanément indisponible.</p>';categoriesNode.innerHTML='<div class="shop-empty"><p>La boutique ne peut pas être chargée pour le moment. Vous pouvez réessayer.</p><button id="retry-shop" type="button">Recharger la boutique</button></div>';document.querySelector('#retry-shop').onclick=()=>loadShop()}
}
function setupShopBrowse(products,categories) {
  const browse=document.querySelector('#shop-browse');if(!browse)return;
  browse.hidden=false;
  const search=document.querySelector('#shop-search'), chips=document.querySelector('#shop-category-filters');
  let category='';
  const used=categories.filter(c=>products.some(p=>String(p.shop_category_id)===String(c.id)));
  chips.innerHTML=`<button type="button" data-category="" aria-pressed="true">Tout voir</button>${used.map(c=>`<button type="button" data-category="${c.id}" aria-pressed="false">${shopEsc(c.name)}</button>`).join('')}`;
  const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const draw=()=>{
    const term=normalize(search.value.trim());let count=0;
    document.querySelectorAll('[data-shop-category]').forEach(section=>{
      let matches=0;
      section.querySelectorAll('[data-shop-product]').forEach(card=>{
        const p=products.find(p=>String(p.id)===card.dataset.shopProduct);
        const visible=(!category||section.dataset.shopCategory===category)&&!!p&&normalize(`${p.name} ${p.short_description||''}`).includes(term);
        card.hidden=!visible;if(visible){matches++;count++;}
      });section.hidden=!matches;
    });
    document.querySelector('#shop-results').textContent=`${count} article${count>1?'s':''} ${count>1?'disponibles':'disponible'}`;
    document.querySelector('#shop-no-results').hidden=count!==0;
    chips.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.category===category)));
  };
  chips.querySelectorAll('button').forEach(b=>b.onclick=()=>{category=b.dataset.category;draw();});
  search.oninput=draw;
  document.querySelector('#shop-clear-search').onclick=()=>{search.value='';category='';draw();search.focus();};
  draw();
}
loadShop();

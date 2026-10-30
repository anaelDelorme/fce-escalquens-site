import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Window} from 'happy-dom';
import {renderContent} from '../src/scripts/admin-shop-content.js';
import {renderVariants} from '../src/scripts/admin-shop-variants.js';
const next=()=>new Promise(resolve=>setImmediate(resolve));
const fixture={products:[{id:1,name:'Maillot',image_key:'maillot.webp',short_description:'Accroche publique',description:'Composition uniquement dans les détails',active:1},{id:2,name:'Sac',image_key:'sac.webp',active:1}],variants:[{id:'v1',product_id:1,label:'6 ans',price_cents:2000},{id:'v2',product_id:1,label:'M',price_cents:2500},{id:'v3',product_id:2,label:'Unique',price_cents:1500}],options:[{id:'o1',product_id:1,label:'Initiales',price_cents:250,requires_text:1,max_length:4}],checkout_available:false,environment:'sandbox'};
function setup(catalogue=fixture,coachMarkup=false){
 const window=new Window({url:'https://boutique.example/boutique/',settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});
 window.document.write('<button id="open-cart"><span id="cart-count"></span></button><button id="show-cart"></button><div id="commerce-notice" hidden></div><button data-order-product="1">Choisir</button><button data-order-product="2">Ajouter</button><button data-product-detail="1">Détails</button><dialog id="product-dialog"><button data-close></button><div id="product-content"></div></dialog><dialog id="cart-dialog"><button data-close></button><div id="cart-content"></div></dialog><dialog id="detail-dialog"><button data-close></button><div id="detail-content"></div></dialog>');
 if(coachMarkup)window.document.body.insertAdjacentHTML("beforeend",'<a href="#coach-access" id="open-coach">Tarifs coach</a><section id="coach-access"></section><div id="shop-browse"></div>');
 window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;};
 window.fetch=(async()=>Response.json(catalogue)) as any;
 const common=readFileSync(new URL('../public/shop-common.js',import.meta.url),'utf8').replace(/export /g,'');
 const commerce=readFileSync(new URL('../public/shop-commerce.js',import.meta.url),'utf8').replace(/^import[\s\S]*?from "\.\/shop-common.js";/,'');
 window.eval(common+'\n'+commerce);return window;
}
test('panier DOM : taille, personnalisation, ajout, ouverture du panier, modification et retrait sans boucle',async()=>{
 const w=setup(),d=w.document;
 d.querySelector<HTMLElement>('[data-order-product="1"]')!.click();await next();
 assert.equal(d.querySelector<HTMLDialogElement>('#product-dialog')!.open,true);
 const form=d.querySelector<HTMLFormElement>('#product-form')!;
 (form.elements.namedItem('variant') as HTMLSelectElement).value='v2';
 (form.elements.namedItem('option:o1') as HTMLInputElement).checked=true;
 form.dispatchEvent(new w.Event('input',{bubbles:true}));
 (form.elements.namedItem('text:o1') as HTMLInputElement).value='AD';
 assert.match(d.querySelector('#product-price')!.textContent!,/27,50/);
 form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await next();
 assert.equal(d.querySelector<HTMLDialogElement>('#product-dialog')!.open,false);
 assert.equal(d.querySelector<HTMLDialogElement>('#cart-dialog')!.open,true);
 assert.equal(d.querySelector('#cart-count')!.textContent,'1');assert.match(d.querySelector('#cart-content')!.textContent!,/AD/);
 d.querySelector<HTMLElement>('[data-edit="0"]')!.click();
 const edit=d.querySelector<HTMLFormElement>('#product-form')!;(edit.elements.namedItem('quantity') as HTMLInputElement).value='2';edit.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 assert.equal(d.querySelector('#cart-count')!.textContent,'2');
 d.querySelector<HTMLElement>('[data-remove="0"]')!.click();assert.equal(d.querySelector('#cart-count')!.textContent,'0');
 await w.happyDOM.abort();w.close();
});
test('panier DOM : article unique ajouté directement, fiche détails séparée, aucun lien de retour vers Ajouter',async()=>{
 const w=setup(),d=w.document;d.querySelector<HTMLElement>('[data-order-product="2"]')!.click();await next();
 assert.equal(d.querySelector('#cart-count')!.textContent,'1');assert.equal(d.querySelector<HTMLDialogElement>('#cart-dialog')!.open,true);
 d.querySelector<HTMLElement>('#cart-dialog [data-close]')!.click();d.querySelector<HTMLElement>('[data-product-detail="1"]')!.click();await next();
 assert.match(d.querySelector('#detail-content')!.textContent!,/Composition uniquement/);
 d.querySelector<HTMLElement>('#detail-order')!.click();assert.equal(d.querySelector<HTMLDialogElement>('#product-dialog')!.open,true);
 await w.happyDOM.abort();w.close();
});
test('éditeur : filtres catégorie/visibilité, bouton Masquer et tailles/options dans la même fiche',async()=>{
 const w=new Window({url:'https://boutique.example/admin-boutique/articles/'});w.document.body.innerHTML='<p id="admin-shop-message"></p><div id="root"></div>';
 Object.assign(globalThis,{document:w.document,location:w.location,sessionStorage:w.sessionStorage,FormData:w.FormData});
 const rows=[{id:1,name:'Maillot',active:1,image_key:'m.webp',shop_category_id:1},{id:2,name:'Sac masqué',active:0,image_key:'s.webp',shop_category_id:2}];const changes:any[]=[];
 const call=async(path:string,options:any={})=>{if(options.method==='PUT'){changes.push(options.data);Object.assign(rows.find(r=>r.id===Number(path.split('/').pop()))!,options.data);return {ok:true};}if(path==='content/shop_products')return structuredClone(rows);if(path==='content/shop_categories')return [{id:1,name:'Textile',active:1},{id:2,name:'Sacs',active:1}];if(path==='suppliers')return {suppliers:[{id:'supplier1',name:'Intersport',active:1}]};if(path==='catalogue')return {products:rows,variants:[],options:[]};throw new Error(path);};
 await renderContent(w.document.querySelector('#root'),call,()=>{},'shop_products');
 const filter=w.document.querySelector<HTMLSelectElement>('#content-category')!;filter.value='2';filter.dispatchEvent(new w.Event('change'));assert.equal(w.document.querySelectorAll('.commerce-catalogue-row').length,1);assert.match(w.document.querySelector('#content-list')!.textContent!,/Sac masqué/);
 filter.value='';filter.dispatchEvent(new w.Event('change'));const hidden=w.document.querySelector<HTMLSelectElement>('#content-visibility')!;hidden.value='0';hidden.dispatchEvent(new w.Event('change'));assert.equal(w.document.querySelectorAll('.commerce-catalogue-row').length,1);
 hidden.value='';hidden.dispatchEvent(new w.Event('change'));w.HTMLElement.prototype.scrollIntoView=()=>{};
 w.document.querySelector<HTMLElement>('[data-edit-content="1"]')!.click();await next();assert.ok(w.document.querySelector('#variant-form'));assert.equal(w.document.querySelector('#option-form'),null);assert.match(w.document.querySelector('#content-form')!.textContent!,/Texte court/);assert.match(w.document.querySelector('#content-form')!.textContent!,/fenêtre Détails/);
 w.document.querySelector<HTMLElement>('[data-toggle-content="1"]')!.click();await next();await next();assert.equal(changes[0].active,0);assert.equal(changes[0].image_key,'m.webp');assert.equal(rows[0].active,0);
 await w.happyDOM.abort();w.close();
});
test('carte publique : texte court seulement et aucun bouton Ajouter trompeur sans tarif',async()=>{
 const w=new Window({url:'https://boutique.example/boutique/',settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});
 w.document.body.innerHTML='<main id="shop-page" class="is-loading"><div id="shop-featured"></div><div id="shop-categories"></div></main><section id="shop-maintenance" hidden></section>';
 w.fetch=(async(url:string)=>Response.json(String(url).includes('/api/page/')?{products:fixture.products.map(p=>({...p,shop_category_id:1})),categories:[{id:1,name:'Collection'}],settings:{shop_enabled:1}}:{...fixture,variants:[],options:[]})) as any;
 w.eval(readFileSync(new URL('../public/shop-common.js',import.meta.url),'utf8').replace(/export /g,'')+'\n'+readFileSync(new URL('../public/shop.js',import.meta.url),'utf8').replace(/^import[^\n]*\n/,''));await next();await next();
 assert.match(w.document.querySelector('#shop-featured')!.textContent!,/Accroche publique/);assert.doesNotMatch(w.document.querySelector('#shop-featured')!.textContent!,/Composition uniquement/);
 const order=w.document.querySelector<HTMLButtonElement>('[data-order-product="1"]')!;assert.equal(order.disabled,true);assert.match(order.textContent!,/Tailles et tarifs bientôt disponibles/);assert.doesNotMatch(order.textContent!,/Ajouter/);
 await w.happyDOM.abort();w.close();
});

test('article simple : un prix et un fournisseur sélectionné, aucune taille ni option à saisir',async()=>{
 const w=new Window({url:'https://boutique.example/admin-boutique/articles/'});w.document.body.innerHTML='<p id="admin-shop-message"></p><div id="root"></div>';
 Object.assign(globalThis,{document:w.document,location:w.location,sessionStorage:w.sessionStorage,FormData:w.FormData});
 let variants:any[]=[],saved:any=null;const call=async(path:string,options:any={})=>{
  if(path==='catalogue')return {products:[{id:1,name:'Mug'}],variants,options:[]};if(path==='suppliers')return {suppliers:[{id:'s1',name:'Fournisseur club',active:1}]};
  if(path==='variants'){saved=options.data;variants=[{...saved,id:'v1',price_cents:saved.price_cents}];return {ok:true,id:'v1'};}throw new Error(path);
 };
 let label='';await renderVariants(w.document.querySelector('#root'),call,()=>{},1,price=>label=price);
 assert.equal(w.document.querySelector('[name="size"]'),null);assert.equal(w.document.querySelector('#option-form'),null);assert.equal(w.document.querySelector('[name="supplier"]'),null);
 const form=w.document.querySelector<HTMLFormElement>('#variant-form')!;
 const priceInput=form.elements.namedItem('price') as HTMLInputElement;assert.equal(priceInput.step,'0.01');
 // Happy DOM computes decimal steps with raw JS %, unlike browser number inputs.
 // Keep required/min/max validation; exercise exact cents in the server tests.
 priceInput.step='any';priceInput.value='12.50';(form.elements.namedItem('supplier_id') as HTMLSelectElement).value='s1';assert.equal(form.reportValidity(),true,Array.from(form.elements).filter((x:any)=>x.validity&&!x.validity.valid).map((x:any)=>x.name+': '+x.validationMessage).join(';'));form.dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));await next();await next();
 assert.ok(saved,w.document.querySelector('#admin-shop-message')!.textContent||'Enregistrement non exécuté');assert.equal(form.elements.namedItem('sku'),null);assert.equal(form.elements.namedItem('color'),null);assert.equal(Object.hasOwn(saved,'sku'),false);assert.equal(Object.hasOwn(saved,'color'),false);assert.equal(saved.simple,true);assert.equal(saved.price_cents,1250);assert.equal(saved.supplier_id,'s1');assert.equal(saved.label,'Taille unique');assert.match(label,/12,50/);
 w.document.querySelector<HTMLElement>('[data-product-mode="choices"]')!.click();assert.equal(w.document.querySelector<HTMLFormElement>('#option-form')!.hidden,true);w.document.querySelector<HTMLElement>('#add-product-option')!.click();assert.equal(w.document.querySelector<HTMLFormElement>('#option-form')!.hidden,false);
 await w.happyDOM.abort();w.close();
});
test('administration boutique DOM : tableaux des modèles et des personnalisations sans champ de présentation des options',async()=>{
 const w=new Window({url:'https://example.org/admin-boutique/articles/'});w.document.write('<p id="admin-shop-message"></p><div id="root"></div>');
 const data={variants:[{id:'m',product_id:1,label:'Adulte M',size:'M',color:'Bordeaux',price_cents:2000,sku:'SKU-M',supplier_id:'s1',active:1},{id:'l',product_id:1,label:'Adulte L',size:'L',price_cents:2500,sku:'SKU-L',supplier_id:'s1',active:1}],options:[{id:'initials',product_id:1,label:'Initiales',price_cents:200,requires_text:1,max_length:4,active:1}]};
 const call=async(path:string)=>path==='catalogue'?data:{suppliers:[{id:'s1',name:'Kappa',active:1}]};
 await renderVariants(w.document.querySelector('#root'),call,()=>{},1);
 assert.equal(w.document.querySelectorAll('table').length,2);assert.doesNotMatch(w.document.querySelectorAll('table')[0].textContent!,/Référence|couleur|SKU-|Bordeaux/);assert.match(w.document.querySelectorAll('table')[0].textContent!,/Adulte L/);assert.match(w.document.querySelectorAll('table')[1].textContent!,/Initiales/);assert.equal(w.document.querySelector('#variant-select'),null);assert.equal(w.document.querySelector('#option-select'),null);assert.match(w.document.querySelector('#published-variant-price')!.textContent!,/De 20,00.*à 25,00/);
 w.document.querySelector<HTMLElement>('[data-edit-variant="l"]')!.click();assert.equal((w.document.querySelector('[name=price]') as HTMLInputElement).value,'25');
 assert.equal(w.document.querySelector('[name=sku]'),null);assert.equal(w.document.querySelector('[name=color]'),null);w.document.querySelector<HTMLElement>('[data-edit-personalization="initials"]')!.click();assert.equal(w.document.querySelectorAll('#option-form input[type=checkbox]').length,0);assert.equal((w.document.querySelector('#option-form [name=label]') as HTMLInputElement).value,'Initiales');
 await w.happyDOM.abort();w.close();
});

test('paramètres boutique DOM : enregistrement du contact et avertissement distinct de la sauvegarde',async()=>{
 const w=new Window({url:'https://example.org/admin-boutique/parametres/'});w.document.write('<main class="commerce-admin" data-page="settings"><div id="shop-environment"></div><p id="admin-shop-message"></p><div id="admin-shop-content"></div></main>');
 let saved:any;
 let settings={version:0,organization_slug:'fce',contact_email:'club@example.org',seller_name:'FCE',seller_address:'',seller_id:'',seller_phone:'',collection_address:'',collection_instructions:'',delivery_days:30,legal_ready:false,checkout_enabled:false};
 w.fetch=(async(_path:any,init:any={})=>{if(init.method==='PUT'){saved=JSON.parse(init.body);settings={...saved,version:1};return Response.json({ok:true});}return Response.json({settings,environment:'sandbox',configuration:{},availability:{ready:false,missing:[{key:'mail_provider',label:'Configurer le transport mail.'}]}});}) as any;
 const common=readFileSync(new URL('../public/shop-common.js',import.meta.url),'utf8').replace(/export /g,'');
 const source=readFileSync(new URL('../src/scripts/admin-shop.js',import.meta.url),'utf8').replace(/^import[\s\S]*?from [^;]+;\n?/gm,'');const visibility=readFileSync(new URL('../src/scripts/admin-shop-visibility.js',import.meta.url),'utf8').replace(/export /g,'');w.eval(common+'\n'+visibility+'\n'+source);await next();await next();
 const form=w.document.querySelector<HTMLFormElement>('#settings-form')!;(form.elements.namedItem('contact_email') as HTMLInputElement).value='nouveau@example.org';(form.elements.namedItem('checkout_enabled') as HTMLInputElement).checked=true;form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await next();await next();await next();
 assert.equal(saved.contact_email,'nouveau@example.org');assert.equal(saved.checkout_enabled,true);assert.match(w.document.querySelector('#admin-shop-message')!.textContent!,/Paramètres enregistrés/);assert.match(w.document.querySelector('#admin-shop-message')!.className,/commerce-success/);assert.match(w.document.querySelector('#admin-shop-content')!.textContent!,/Configurer le transport mail/);assert.equal((w.document.querySelector('[name=contact_email]') as HTMLInputElement).value,'nouveau@example.org');await w.happyDOM.abort();w.close();
});

test('panier en deux étapes : retour et modification conservent les coordonnées uniquement en mémoire',async()=>{
 const w=setup({...fixture,checkout_available:true}),d=w.document;
 d.querySelector<HTMLElement>('[data-order-product="2"]')!.click();await next();
 let form=d.querySelector<HTMLFormElement>('#checkout-form')!;assert.equal(form.hidden,true);
 d.querySelector<HTMLElement>('#cart-to-checkout')!.click();assert.equal(form.hidden,false);assert.equal(d.querySelector('#cart-step-details')!.getAttribute('aria-current'),'step');
 const email=form.elements.namedItem('email') as HTMLInputElement;email.value='prive@example.org';email.dispatchEvent(new w.Event('input',{bubbles:true}));
 (form.querySelector('[value=club]') as HTMLInputElement).checked=true;form.dispatchEvent(new w.Event('input',{bubbles:true}));form.dispatchEvent(new w.Event('change',{bubbles:true}));
 assert.equal((form.elements.namedItem('team') as HTMLInputElement).required,false);
 d.querySelector<HTMLElement>('#cart-back')!.click();assert.equal(form.hidden,true);
 d.querySelector<HTMLElement>('[data-edit]')!.click();await next();
 const edit=d.querySelector<HTMLFormElement>('#product-form')!;(edit.elements.namedItem('quantity') as HTMLInputElement).value='2';edit.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 form=d.querySelector<HTMLFormElement>('#checkout-form')!;assert.equal((form.elements.namedItem('email') as HTMLInputElement).value,'prive@example.org');assert.equal((form.elements.namedItem('team') as HTMLInputElement).required,false);
 assert.doesNotMatch(w.sessionStorage.getItem('fce-cart-v1')||'',/prive@example/);
 assert.equal(d.querySelectorAll('.commerce-cart-image').length,1);
 await w.happyDOM.abort();w.close();
});
test('catalogue : recherche sans accents, filtres combinés, état vide et réinitialisation',async()=>{
 const w=new Window({url:'https://boutique.example/boutique/',settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});
 w.document.write('<main id="shop-page"><div id="shop-featured"></div><div id="shop-categories"></div><div id="shop-browse" hidden><input id="shop-search"><div id="shop-category-filters"></div><p id="shop-results"></p><div id="shop-no-results" hidden></div><button id="shop-clear-search"></button></div></main>');
 const data={products:[{...fixture.products[0],name:'Maillot entraînement',shop_category_id:1},{...fixture.products[1],shop_category_id:2}],categories:[{id:1,name:'Tenues'},{id:2,name:'Accessoires'}],settings:{shop_enabled:1}};
 w.fetch=(async(path:any)=>Response.json(String(path).includes('/api/page/')?data:fixture)) as any;
 w.eval(readFileSync(new URL('../public/shop-common.js',import.meta.url),'utf8').replace(/export /g,'')+'\n'+readFileSync(new URL('../public/shop.js',import.meta.url),'utf8').replace(/^import[^\n]*\n/,''));await next();await next();
 const d=w.document,search=d.querySelector<HTMLInputElement>('#shop-search')!;
 assert.equal(d.querySelector('#shop-browse')!.hasAttribute('hidden'),false);assert.match(d.querySelector('#shop-results')!.textContent!,/2 articles/);
 search.value='entrainement';search.dispatchEvent(new w.Event('input'));assert.match(d.querySelector('#shop-results')!.textContent!,/1 article/);
 d.querySelector<HTMLElement>('[data-category="2"]')!.click();assert.equal((d.querySelector('#shop-no-results') as HTMLElement).hidden,false);
 d.querySelector<HTMLElement>('#shop-clear-search')!.click();assert.equal(search.value,'');assert.match(d.querySelector('#shop-results')!.textContent!,/2 articles/);assert.equal(d.querySelector('[data-category=""]')!.getAttribute('aria-pressed'),'true');
 await w.happyDOM.abort();w.close();
});
test('administration boutique : raccourcis de préparation et remise appliquent les filtres serveur',async()=>{
 const w=new Window({url:'https://example.org/admin-boutique/'});w.document.write('<main class="commerce-admin" data-page="orders"><div id="shop-environment"></div><p id="admin-shop-message"></p><div id="admin-shop-content"></div></main>');
 const queries:URL[]=[];
 w.fetch=(async(path:any)=>{const url=new URL(String(path),'https://example.org');if(url.pathname.endsWith('/settings'))return Response.json({settings:{},environment:'sandbox',configuration:{}});queries.push(url);return Response.json({orders:[],has_more:false});}) as any;
 const common=readFileSync(new URL('../public/shop-common.js',import.meta.url),'utf8').replace(/export /g,'');
 const source=readFileSync(new URL('../src/scripts/admin-shop.js',import.meta.url),'utf8').replace(/^import[\s\S]*?from [^;]+;\n?/gm,'');const visibility=readFileSync(new URL('../src/scripts/admin-shop-visibility.js',import.meta.url),'utf8').replace(/export /g,'');w.eval(common+'\n'+visibility+'\n'+source);await next();await next();
 w.document.querySelector<HTMLElement>('[data-order-filter=prepare]')!.click();await next();assert.equal(queries.at(-1)!.searchParams.get('payment'),'paid');assert.equal(queries.at(-1)!.searchParams.get('fulfillment'),'new');
 w.document.querySelector<HTMLElement>('[data-order-filter=ready]')!.click();await next();assert.equal(queries.at(-1)!.searchParams.get('fulfillment'),'ready');assert.equal(queries.at(-1)!.searchParams.get('payment'),'');
 w.document.querySelector<HTMLElement>('#empty-reset-orders')!.click();await next();assert.equal(queries.at(-1)!.searchParams.get('fulfillment'),'');assert.equal(w.document.querySelector('#next-orders')!.hasAttribute('disabled'),true);
 await w.happyDOM.abort();w.close();
});
test('mails : états compréhensibles et aucune réponse brute du prestataire affichée',async()=>{
 const {mailStatusList}=await import('../public/shop-common.js');
 const html=mailStatusList([{kind:'created',status:'failed',attempts:8,last_error:'MAIL_SMTP_AUTH'},{kind:'tracking',status:'sent',attempts:1,sent_at:1700000000},{kind:'<script>',status:'pending',last_error:'PRIVATE_TOKEN <img src=x onerror=alert(1)>'}]);
 assert.match(html,/OVH refuse les identifiants/);assert.match(html,/Accepté par le serveur/);assert.match(html,/ne confirme pas sa réception/);assert.doesNotMatch(html,/PRIVATE_TOKEN|<script>|<img/);
});

test('prix : comparaison discrète, tailles cohérentes et absence de référence gérée',async()=>{
 const {priceMarkup}=await import('../public/shop-common.js');
 assert.doesNotMatch(priceMarkup([{price_cents:2000}]),/Prix catalogue/);
 const exact=priceMarkup([{price_cents:2000,catalogue_price_cents:3000}]);assert.match(exact,/Tarif FCE/);assert.match(exact,/Prix catalogue/);assert.doesNotMatch(exact,/économ|%|promo/i);
 assert.match(priceMarkup([{price_cents:1800,price_kind:'coach'}]),/Tarif coach/);
 const mixed=priceMarkup([{price_cents:2000,catalogue_price_cents:3000},{price_cents:2500,catalogue_price_cents:null}]);assert.match(mixed,/Prix catalogue/);assert.doesNotMatch(mixed,/Référence catalogue renseignée|certaines tailles/);
 const w=setup({...fixture,variants:fixture.variants.map(v=>({...v,catalogue_price_cents:v.id==='v2'?4000:null}))}),d=w.document;
 d.querySelector<HTMLElement>('[data-order-product="1"]')!.click();await next();
 const select=d.querySelector<HTMLSelectElement>('[name=variant]')!;select.value='v2';select.dispatchEvent(new w.Event('input',{bubbles:true}));assert.match(d.querySelector('#product-price-comparison')!.textContent!,/40\s*€/);
 select.value='v1';select.dispatchEvent(new w.Event('input',{bubbles:true}));assert.doesNotMatch(d.querySelector('#product-price-comparison')!.textContent!,/catalogue/);
 await w.happyDOM.abort();w.close();
});

test('photos : aperçu existant, nouvelle clé et erreur explicite dans la zone d’envoi',async()=>{
 const {mediaPreview,bindMediaPreviews}=await import('../public/shop-common.js');
 const w=new Window({url:"https://boutique.example/admin-boutique/",settings:{enableImageFileLoading:false}});w.document.body.innerHTML=`<form><input name="image_key" value="articles/maillot.webp">${mediaPreview('articles/maillot.webp','image_key')}</form>`;
 const form=w.document.querySelector('form')!;bindMediaPreviews(form);
 const image=form.querySelector<HTMLImageElement>('img')!;assert.match(image.getAttribute('src')!,/\/media\/articles\/maillot.webp$/);
 const input=form.querySelector('input')!;input.value='articles/nouveau.webp';input.dispatchEvent(new w.Event('change'));assert.match(image.getAttribute('src')!,/nouveau.webp$/);
 image.dispatchEvent(new w.Event('error'));assert.equal(image.hidden,true);assert.match(form.textContent!,/Aperçu indisponible/);
 input.value='';input.dispatchEvent(new w.Event('input'));assert.equal(image.hidden,true);assert.match(form.textContent!,/Aucun visuel/);
 input.value='image.webp';input.dispatchEvent(new w.Event('change'));assert.equal(image.hidden,false);
 await w.happyDOM.abort();w.close();
});

test('accès coach : formulaire discret, erreur explicite, code absent du stockage et sortie accessible',async()=>{
 const w=setup(),d=w.document;d.body.insertAdjacentHTML('beforeend','<div id="shop-browse"></div>');
 d.dispatchEvent(new w.CustomEvent('shop-loaded',{detail:{...fixture,coach_access_enabled:true,pricing_mode:'fce'}}));
 const input=d.querySelector<HTMLInputElement>('#coach-code-form [name=code]')!;assert.equal(input.type,'password');input.value='code-confidentiel';
 let submitted:any;w.fetch=(async(path:any,options:any)=>{submitted=JSON.parse(options.body);return Response.json({error:'Code incorrect.',code:'COACH_CODE'},{status:403});}) as any;
 d.querySelector('form')!.dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));await next();assert.equal(submitted.code,'code-confidentiel');assert.match(d.querySelector('#coach-access [role=alert]')!.textContent!,/Code incorrect/);
 assert.doesNotMatch(JSON.stringify(Object.entries(w.sessionStorage)),/code-confidentiel/);assert.equal(w.location.search,'');
 d.dispatchEvent(new w.CustomEvent('shop-loaded',{detail:{...fixture,coach_access_enabled:true,pricing_mode:'coach'}}));assert.ok(d.querySelector('#coach-logout'));assert.equal(d.querySelector('#coach-code-form'),null);
 await w.happyDOM.abort();w.close();
});

test('tournois : photo et affiche visibles dans leurs zones d’upload, PDF sans faux aperçu',async()=>{
 const {eventEditor}=await import('../src/scripts/tournament-events-editor.js');
 const w=new Window({url:'https://example.org/admin-tournois/',settings:{enableImageFileLoading:false}});w.document.body.innerHTML='<div id="root"></div>';w.HTMLElement.prototype.scrollIntoView=()=>{};
 Object.assign(globalThis,{document:w.document,location:w.location,sessionStorage:w.sessionStorage,FormData:w.FormData});
 const call=async(path:string)=>path==='events'?{events:[{id:1,name:'Tournoi',categories:'[]',image_key:'tournoi.webp',poster_key:'affiche.png',rules_key:'regles.pdf'}]}:{sales:[]};
 await eventEditor(w.document.querySelector('#root'),call,async(_button:any,fn:any)=>fn());
 w.document.querySelector<HTMLElement>('[data-event="1"]')!.click();
 const form=w.document.querySelector('form')!;assert.equal(form.querySelectorAll('[data-media-preview]').length,2);
 assert.match(form.querySelector('[data-media-preview=image_key]')!.getAttribute('src')!,/tournoi.webp$/);assert.match(form.querySelector('[data-media-preview=poster_key]')!.getAttribute('src')!,/affiche.png$/);assert.equal(form.querySelector('[data-media-preview=rules_key]'),null);
 await w.happyDOM.abort();w.close();
});

test('résumé des tailles : bornes enfant/adulte uniquement, XXL normalisé et taille unique conservée',async()=>{
 const {sizeSummary}=await import('../public/shop-common.js');
 const summary=sizeSummary(['10 ans','6ans','14 ans','XS','M','XXL','S','XL','L'].map(size=>({size})));
 assert.equal(summary,'Enfant : 6 ans à 14 ans\nAdulte : XS à 2XL');assert.doesNotMatch(summary,/10 ans|Adulte : M/);
 assert.equal(sizeSummary([{size:'',label:'Taille unique'}]),'Taille unique');
});

test('tarifs groupés DOM : sélectionner enfant, appliquer deux prix, préserver le troisième et trier',async()=>{
 const w=new Window({url:'https://example.org/admin-boutique/articles/'});w.document.body.innerHTML='<p id="admin-shop-message"></p><div id="root"></div>';
 Object.assign(globalThis,{document:w.document,location:w.location,sessionStorage:w.sessionStorage,FormData:w.FormData});
 const variants=['6 ans','10 ans','XS','L'].map((size,i)=>({id:'bulk'+i,product_id:1,label:size,size,price_cents:2500,catalogue_price_cents:3500,coach_price_cents:1900,active:1}));
 const calls:any[]=[];const call=async(path:string,options:any={})=>{if(options.method){calls.push({path,...options});return {ok:true};}if(path==='catalogue')return {products:[{id:1,name:'Maillot'}],variants,options:[]};if(path==='suppliers')return {suppliers:[]};throw new Error(path);};
 await renderVariants(w.document.querySelector('#root'),call,()=>{},1);
 const d=w.document,form=d.querySelector<HTMLFormElement>('#bulk-prices')!;assert.ok(form);assert.equal((form.querySelector('[type=submit]') as HTMLButtonElement).disabled,true);
 d.querySelector<HTMLElement>('[data-size-preset=child]')!.click();assert.equal(d.querySelectorAll('[data-select-variant]:checked').length,2);
 for(const [key,value] of [['price_cents','23'],['catalogue_price_cents','32']]){const select=form.querySelector<HTMLSelectElement>(`[data-bulk-action=${key}]`)!;select.value='set';select.dispatchEvent(new w.Event('change'));const input=form.querySelector<HTMLInputElement>(`[data-bulk-price=${key}]`)!;assert.equal(input.hidden,false);input.step='any';input.value=value;} // Happy DOM uses binary floating-point modulo for step validity.
 assert.equal((form.querySelector('[type=submit]') as HTMLButtonElement).disabled,false);form.dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));await next();await next();
 assert.equal(calls[0].path,'variants/prices');assert.deepEqual(calls[0].data,{product_id:1,variant_ids:['bulk0','bulk1'],prices:{price_cents:2300,catalogue_price_cents:3200}});
 d.querySelector<HTMLElement>('[data-move-variant=bulk1][data-direction="-1"]')!.click();await next();await next();assert.equal(calls[1].path,'variants/order');assert.deepEqual(calls[1].data.variant_ids,['bulk1','bulk0','bulk2','bulk3']);
 d.querySelector<HTMLElement>('[data-size-preset=adult]')!.click();assert.equal(d.querySelectorAll('[data-select-variant]:checked').length,2);
 d.querySelector<HTMLElement>('#natural-size-order')!.click();await next();assert.equal(calls[2].data.action,'automatic');
 await w.happyDOM.abort();w.close();
});

test('accès coach visible : lien du haut ouvre le formulaire et affiche le code à la demande',async()=>{
 const w=setup({...fixture,coach_access_enabled:true},true),d=w.document;w.HTMLElement.prototype.scrollIntoView=()=>{};
 d.dispatchEvent(new w.CustomEvent('shop-loaded',{detail:{...fixture,coach_access_enabled:true}}));
 d.querySelector<HTMLElement>('#open-coach')!.click();await next();assert.equal((d.querySelector('#coach-access details') as HTMLDetailsElement).open,true);
 const input=d.querySelector<HTMLInputElement>('#coach-code-form [name=code]')!;assert.equal(input.placeholder,'FCE-XXXX-XXXX');d.querySelector<HTMLElement>('#reveal-coach')!.click();assert.equal(input.type,'text');d.querySelector<HTMLElement>('#reveal-coach')!.click();assert.equal(input.type,'password');
 assert.doesNotMatch(d.querySelector('#coach-access')!.textContent!,/8 heures/);
 await w.happyDOM.abort();w.close();
});

test('carte publique : référence catalogue partielle visible avant de choisir une taille et tailles condensées',async()=>{
 const w=new Window({url:'https://example.org/boutique/',settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true,enableImageFileLoading:false}});
 w.document.body.innerHTML='<main id="shop-page"><div id="shop-featured"></div><div id="shop-categories"></div></main>';
 const variants=['6 ans','8 ans','14 ans','XS','M','2XL'].map((size,i)=>({id:'price'+i,product_id:1,size,label:size,price_cents:i<3?2500:2700,catalogue_price_cents:i===5?4000:null}));
 const data={products:[{...fixture.products[0],shop_category_id:1}],categories:[{id:1,name:'Tenues'}],settings:{shop_enabled:1}};
 w.fetch=(async(path:any)=>Response.json(String(path).includes('/api/page/')?data:{...fixture,variants})) as any;
 w.eval(readFileSync(new URL('../public/shop-common.js',import.meta.url),'utf8').replace(/export /g,'')+'\n'+readFileSync(new URL('../public/shop.js',import.meta.url),'utf8').replace(/^import[^\n]*\n/,''));await next();await next();
 const card=w.document.querySelector('.shop-product-card')!;assert.match(card.textContent!,/Prix catalogue/);assert.match(card.textContent!,/40\s*€/);assert.match(card.textContent!,/Tarif FCE/);assert.match(card.querySelector('.product-summary')!.textContent!,/Enfant & adulte/);assert.match(card.querySelector('.product-summary')!.textContent!,/Personnalisable/);assert.equal(card.querySelector('.product-card-visual .product-badges'),null);assert.equal(card.querySelector('.product-card-visual .shop-zoom-hint'),null);assert.doesNotMatch(card.querySelector('.product-card-visual')!.textContent!,/Agrandir|Enfant|Personnalisable/);assert.equal(card.querySelector('[data-product-detail]')!.textContent,'Voir les détails');
 await w.happyDOM.abort();w.close();
});

test('dupliquer DOM : bouton par article, reprise réseau sans doublon et ouverture de la copie masquée',async()=>{
 const w=new Window({url:'https://example.org/admin-boutique/articles/'});w.document.body.innerHTML='<p id="admin-shop-message"></p><div id="root"></div>';w.HTMLElement.prototype.scrollIntoView=()=>{};
 Object.assign(globalThis,{document:w.document,location:w.location,sessionStorage:w.sessionStorage,FormData:w.FormData});
 const rows:any[]=[{id:1,name:'Maillot',slug:'maillot',active:1,image_key:'m.webp',shop_category_id:1}],keys:string[]=[],created=new Map<string,number>();let first=true;const notices:string[]=[];
 const call=async(path:string,options:any={})=>{
  if(path==='products/1/duplicate'){const key=options.data.idempotency_key;keys.push(key);if(!created.has(key)){const id=rows.length+1;created.set(key,id);rows.push({...rows[0],id,slug:'copie-'+key,name:'Maillot (copie)',active:0,featured:0,highlighted:0});}if(first){first=false;throw new Error('Connexion interrompue. Réessayez.');}return {id:created.get(key)};}
  if(path==='content/shop_products')return structuredClone(rows);if(path==='content/shop_categories')return [{id:1,name:'Textile',active:1}];if(path==='suppliers')return {suppliers:[]};if(path==='catalogue')return {products:rows,variants:rows.map(r=>({id:'size'+r.id,product_id:r.id,label:'M',size:'M',price_cents:2500,active:1})),options:[]};throw new Error(path);
 };
 await renderContent(w.document.querySelector('#root'),call,message=>notices.push(message),'shop_products');
 const d=w.document,filter=d.querySelector<HTMLSelectElement>('#content-visibility')!;filter.value='1';filter.dispatchEvent(new w.Event('change'));
 d.querySelector<HTMLElement>('[data-duplicate-product="1"]')!.click();await next();assert.match(d.querySelector('#admin-shop-message')!.textContent!,/Connexion interrompue/);assert.equal(rows.length,2);
 d.querySelector<HTMLElement>('[data-duplicate-product="1"]')!.click();await next();await next();assert.equal(keys[0],keys[1]);assert.equal(rows.length,2);assert.equal(filter.value,'');
 const input=d.querySelector<HTMLInputElement>('#content-form [name=name]')!;assert.equal(input.value,'Maillot (copie)');assert.equal((d.querySelector('#content-form [name=active]') as HTMLInputElement).checked,false);assert.equal(d.activeElement,input);assert.equal(rows[0].active,1);assert.match(notices.at(-1)!,/copie est masquée/);assert.ok(d.querySelector('#product-pricing'));
 d.querySelector<HTMLElement>('[data-duplicate-product="1"]')!.click();await next();await next();assert.notEqual(keys[2],keys[1]);assert.equal(rows.length,3);
 await w.happyDOM.abort();w.close();
});

test('détails compacts : tarifs regroupés, photo cliquable et toutes les tailles conservées dans le choix',async()=>{
 const sizes=['6 ans','8 ans','10 ans','12 ans','14 ans','S','M','L','XL'];
 const variants=sizes.map((size,i)=>({id:'compact'+i,product_id:1,label:size,size,price_cents:i<5?2600:3000,catalogue_price_cents:i<5?3000:3500}));
 const w=setup({...fixture,variants}),d=w.document;d.body.insertAdjacentHTML('beforeend','<button data-product-detail="1">Détails</button>');
 d.querySelector<HTMLElement>('[data-product-detail]')!.click();await next();
 assert.equal(d.querySelectorAll('.detail-tariff-groups>li').length,2);assert.match(d.querySelector('.detail-tariff-groups')!.textContent!,/6 ans à 14 ans/);assert.ok(d.querySelector('#detail-content [data-zoom-image]'));
 d.querySelector<HTMLElement>('#detail-order')!.click();await next();assert.equal(d.querySelector<HTMLDialogElement>('#detail-dialog')!.open,false);assert.equal(d.querySelector<HTMLDialogElement>('#product-dialog')!.open,true);
 assert.equal(d.querySelectorAll('[name=variant] option').length,sizes.length+1);await w.happyDOM.abort();w.close();
});

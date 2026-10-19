import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Window} from 'happy-dom';
import {renderContent} from '../src/scripts/admin-shop-content.js';
import {renderVariants} from '../src/scripts/admin-shop-variants.js';
const next=()=>new Promise(resolve=>setImmediate(resolve));
const fixture={products:[{id:1,name:'Maillot',image_key:'maillot.webp',short_description:'Accroche publique',description:'Composition uniquement dans les détails',active:1},{id:2,name:'Sac',image_key:'sac.webp',active:1}],variants:[{id:'v1',product_id:1,label:'6 ans',price_cents:2000},{id:'v2',product_id:1,label:'M',price_cents:2500},{id:'v3',product_id:2,label:'Unique',price_cents:1500}],options:[{id:'o1',product_id:1,label:'Initiales',price_cents:250,requires_text:1,max_length:4}],checkout_available:false,environment:'sandbox'};
function setup(){
 const window=new Window({url:'https://boutique.example/boutique/',settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});
 window.document.write('<button id="open-cart"><span id="cart-count"></span></button><button id="show-cart"></button><div id="commerce-notice" hidden></div><button data-order-product="1">Choisir</button><button data-order-product="2">Ajouter</button><button data-product-detail="1">Détails</button><dialog id="product-dialog"><button data-close></button><div id="product-content"></div></dialog><dialog id="cart-dialog"><button data-close></button><div id="cart-content"></div></dialog><dialog id="detail-dialog"><button data-close></button><div id="detail-content"></div></dialog>');
 window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;};
 window.fetch=(async()=>Response.json(fixture)) as any;
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
 w.eval(readFileSync(new URL('../public/shop.js',import.meta.url),'utf8'));await next();await next();
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
 const source=readFileSync(new URL('../src/scripts/admin-shop.js',import.meta.url),'utf8').replace(/^import[\s\S]*?from [^;]+;\n?/gm,'');w.eval(common+'\n'+source);await next();await next();
 const form=w.document.querySelector<HTMLFormElement>('#settings-form')!;(form.elements.namedItem('contact_email') as HTMLInputElement).value='nouveau@example.org';(form.elements.namedItem('checkout_enabled') as HTMLInputElement).checked=true;form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await next();await next();await next();
 assert.equal(saved.contact_email,'nouveau@example.org');assert.equal(saved.checkout_enabled,true);assert.match(w.document.querySelector('#admin-shop-message')!.textContent!,/Paramètres enregistrés/);assert.match(w.document.querySelector('#admin-shop-message')!.className,/commerce-success/);assert.match(w.document.querySelector('#admin-shop-content')!.textContent!,/Configurer le transport mail/);assert.equal((w.document.querySelector('[name=contact_email]') as HTMLInputElement).value,'nouveau@example.org');await w.happyDOM.abort();w.close();
});

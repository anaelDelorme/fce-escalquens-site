import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Window} from 'happy-dom';
import {renderContent} from '../src/scripts/admin-shop-content.js';
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
 const call=async(path:string,options:any={})=>{if(options.method==='PUT'){changes.push(options.data);Object.assign(rows.find(r=>r.id===Number(path.split('/').pop()))!,options.data);return {ok:true};}if(path==='content/shop_products')return structuredClone(rows);if(path==='content/shop_categories')return [{id:1,name:'Textile',active:1},{id:2,name:'Sacs',active:1}];if(path==='catalogue')return {products:rows,variants:[],options:[]};throw new Error(path);};
 await renderContent(w.document.querySelector('#root'),call,()=>{},'shop_products');
 const filter=w.document.querySelector<HTMLSelectElement>('#content-category')!;filter.value='2';filter.dispatchEvent(new w.Event('change'));assert.equal(w.document.querySelectorAll('.commerce-catalogue-row').length,1);assert.match(w.document.querySelector('#content-list')!.textContent!,/Sac masqué/);
 filter.value='';filter.dispatchEvent(new w.Event('change'));const hidden=w.document.querySelector<HTMLSelectElement>('#content-visibility')!;hidden.value='0';hidden.dispatchEvent(new w.Event('change'));assert.equal(w.document.querySelectorAll('.commerce-catalogue-row').length,1);
 hidden.value='';hidden.dispatchEvent(new w.Event('change'));w.HTMLElement.prototype.scrollIntoView=()=>{};
 w.document.querySelector<HTMLElement>('[data-edit-content="1"]')!.click();await next();assert.ok(w.document.querySelector('#variant-form'));assert.ok(w.document.querySelector('#option-form'));assert.match(w.document.querySelector('#content-form')!.textContent!,/Texte court/);assert.match(w.document.querySelector('#content-form')!.textContent!,/fenêtre Détails/);
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

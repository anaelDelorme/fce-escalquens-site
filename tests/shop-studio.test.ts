import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Window} from 'happy-dom';
const script=readFileSync(new URL('../public/shop-studio.js',import.meta.url),'utf8').replace(/export /g,'');
function fixture(layout='experimental'){
 const w=new Window({url:'https://example.org/boutique-5/',settings:{enableImageFileLoading:false}}),d=w.document;
 d.body.dataset.shopLayout=layout;
 d.body.innerHTML='<div id="shop-categories">'+[1,2].map(category=>`<section data-shop-category="${category}"><header><h3>Catégorie ${category}</h3></header><div class="shop-product-grid">`+[1,2].map(i=>{
  const id=(category-1)*2+i;return `<article data-shop-product="${id}"><div class="product-card-visual"><button data-zoom-image="/media/${id}.webp"><img src="/media/${id}.webp" alt="Article ${id}"></button></div><div class="product-card-copy"><h3>Article ${id}</h3><button data-order-product="${id}">Choisir ma taille</button></div></article>`;
 }).join('')+'</div></section>').join('')+'</div>';
 w.eval(script);d.dispatchEvent(new w.Event('shop-loaded'));return {w,d};
}
test('vestiaire : navigation, clavier, vue d’ensemble et conservation des vrais boutons de commande',()=>{
 const {w,d}=fixture();
 const active=()=>[...d.querySelectorAll<HTMLElement>('[data-shop-product]')].filter(card=>!card.classList.contains('studio-inactive')).map(card=>card.dataset.shopProduct);
 assert.deepEqual(active(),['1']);assert.equal(d.querySelector('.studio-counter')!.textContent,'01 / 04');
 const order=d.querySelector('[data-order-product="2"]');let ordered=0;order!.addEventListener('click',()=>ordered++);
 const next=d.querySelector<HTMLButtonElement>('[aria-label="Article suivant"]')!,previous=d.querySelector<HTMLButtonElement>('[aria-label="Article précédent"]')!;
 assert.equal(previous.disabled,true);next.click();assert.deepEqual(active(),['2']);order!.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));assert.equal(ordered,1);
 const thumbnails=[...d.querySelectorAll<HTMLButtonElement>('.studio-thumbnail')];assert.equal(thumbnails[1].getAttribute('aria-pressed'),'true');assert.equal(thumbnails[1].tabIndex,0);assert.equal(thumbnails[0].tabIndex,-1);
 thumbnails[1].dispatchEvent(new w.KeyboardEvent('keydown',{key:'End',bubbles:true,cancelable:true}));assert.deepEqual(active(),['4']);assert.equal(d.activeElement,thumbnails[3]);assert.equal(next.disabled,true);assert.equal(d.querySelector('.studio-category')!.textContent,'Catégorie 2');
 const view=d.querySelector<HTMLButtonElement>('.studio-view')!;view.click();assert.equal(view.getAttribute('aria-pressed'),'true');assert.deepEqual(active(),['1','2','3','4']);assert.equal(d.querySelector<HTMLElement>('.studio-thumbnails')!.hidden,true);assert.equal(next.hidden,true);
 view.click();assert.deepEqual(active(),['4']);previous.click();assert.deepEqual(active(),['3']);assert.equal(d.querySelector('[data-order-product="2"]'),order);
 d.dispatchEvent(new w.Event('shop-loaded'));assert.equal(d.querySelectorAll('.studio-shell').length,1);assert.equal(d.querySelectorAll('.studio-thumbnail').length,4);assert.equal(d.querySelector('[data-order-product="2"]'),order);w.close();
});
test('vestiaire : filtres, aucun résultat, rechargement et isolation des autres boutiques',()=>{
 const {w,d}=fixture();const cards=[...d.querySelectorAll<HTMLElement>('[data-shop-product]')];
 cards[0].hidden=cards[1].hidden=true;d.querySelector<HTMLElement>('[data-shop-category="1"]')!.hidden=true;
 d.dispatchEvent(new w.Event('shop-filter-changed'));assert.equal(d.querySelector('.studio-counter')!.textContent,'01 / 02');assert.equal(d.querySelector('.studio-live')!.textContent,'Article 3, article 1 sur 2');assert.equal(d.querySelectorAll('.studio-thumbnail[hidden]').length,2);
 cards[2].hidden=cards[3].hidden=true;d.dispatchEvent(new w.Event('shop-filter-changed'));assert.equal(d.querySelector<HTMLElement>('.studio-shell')!.hidden,true);assert.equal(d.querySelector<HTMLElement>('.studio-navigation')!.hidden,true);
 cards[3].hidden=false;d.dispatchEvent(new w.Event('shop-filter-changed'));assert.equal(d.querySelector<HTMLElement>('.studio-shell')!.hidden,false);assert.equal(d.querySelector('.studio-counter')!.textContent,'01 / 01');
 // A catalogue refresh must replace the thumbnails and release old filter listeners.
 d.querySelector('#shop-categories')!.innerHTML='<section data-shop-category="3"><header><h3>Nouveau</h3></header><article data-shop-product="9"><h3>Sac</h3><button data-order-product="9">Ajouter</button></article></section>';
 d.dispatchEvent(new w.Event('shop-loaded'));assert.equal(d.querySelectorAll('.studio-thumbnail').length,1);assert.equal(d.querySelector('.studio-live')!.textContent,'Sac, article 1 sur 1');
 d.dispatchEvent(new w.Event('shop-filter-changed'));assert.equal(d.querySelectorAll('.studio-shell').length,1);w.close();
 const other=fixture('grid');assert.equal(other.d.querySelector('.studio-shell'),null);assert.equal(other.d.querySelectorAll('.studio-inactive').length,0);other.w.close();
});

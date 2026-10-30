import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Window} from 'happy-dom';
const script=readFileSync(new URL('../public/shop-studio.js',import.meta.url),'utf8').replace(/export /g,'');
function fixture(layout='experimental',perCategory=2){
 const w=new Window({url:'https://example.org/boutique-5/',settings:{enableImageFileLoading:false}}),d=w.document;
 d.body.dataset.shopLayout=layout;
 d.body.innerHTML='<div id="shop-categories">'+[1,2].map(category=>`<section data-shop-category="${category}"><header><h3>Catégorie ${category}</h3></header><div class="shop-product-grid">`+Array.from({length:perCategory},(_,index)=>index+1).map(i=>{
  const id=(category-1)*perCategory+i;return `<article data-shop-product="${id}"><div class="product-card-visual"><button data-zoom-image="/media/${id}.webp"><img src="/media/${id}.webp" alt="Article ${id}"></button></div><div class="product-card-copy"><h3>Article ${id}</h3><button data-order-product="${id}">Choisir ma taille</button></div></article>`;
 }).join('')+'</div></section>').join('')+'</div>';
 w.eval(script);d.dispatchEvent(new w.Event('shop-loaded'));return {w,d};
}
test('vestiaires par catégorie : navigation indépendante, clavier, vue d’ensemble et boutons conservés',()=>{
 const {w,d}=fixture();
 const first=d.querySelector<HTMLElement>('[data-shop-category="1"]')!,second=d.querySelector<HTMLElement>('[data-shop-category="2"]')!;
 const active=(section:HTMLElement)=>[...section.querySelectorAll<HTMLElement>('[data-shop-product]')].filter(card=>!card.classList.contains('studio-inactive')).map(card=>card.dataset.shopProduct);
 assert.equal(d.querySelectorAll('.studio-shell').length,2);assert.deepEqual(active(first),['1']);assert.deepEqual(active(second),['3']);assert.equal(first.querySelector('.studio-counter')!.textContent,'01 / 02');
 const order=first.querySelector('[data-order-product="2"]');let ordered=0;order!.addEventListener('click',()=>ordered++);
 const next=first.querySelector<HTMLButtonElement>('[aria-label="Article suivant"]')!,previous=first.querySelector<HTMLButtonElement>('[aria-label="Article précédent"]')!;
 assert.equal(previous.disabled,true);next.click();assert.deepEqual(active(first),['2']);assert.deepEqual(active(second),['3']);assert.equal(next.disabled,true);
 order!.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));assert.equal(ordered,1);
 const thumbnails=[...first.querySelectorAll<HTMLButtonElement>('.studio-thumbnail')];assert.equal(thumbnails[1].getAttribute('aria-pressed'),'true');assert.equal(thumbnails[1].tabIndex,0);assert.equal(thumbnails[0].tabIndex,-1);
 thumbnails[1].dispatchEvent(new w.KeyboardEvent('keydown',{key:'Home',bubbles:true,cancelable:true}));assert.deepEqual(active(first),['1']);assert.equal(d.activeElement,thumbnails[0]);
 const view=first.querySelector<HTMLButtonElement>('.studio-view')!;view.click();assert.equal(view.getAttribute('aria-pressed'),'true');assert.deepEqual(active(first),['1','2']);assert.deepEqual(active(second),['3']);assert.equal(first.querySelector<HTMLElement>('.studio-thumbnails')!.hidden,true);assert.equal(next.hidden,true);
 view.click();assert.deepEqual(active(first),['1']);assert.equal(d.querySelector('[data-order-product="2"]'),order);
 d.dispatchEvent(new w.Event('shop-loaded'));assert.equal(d.querySelectorAll('.studio-shell').length,2);assert.equal(d.querySelectorAll('.studio-thumbnail').length,4);assert.equal(d.querySelector('[data-order-product="2"]'),order);w.close();
});
test('vestiaires : filtres, aucun résultat, rechargement et isolation des autres boutiques',()=>{
 const {w,d}=fixture();const cards=[...d.querySelectorAll<HTMLElement>('[data-shop-product]')];
 const first=d.querySelector<HTMLElement>('[data-shop-category="1"]')!,second=d.querySelector<HTMLElement>('[data-shop-category="2"]')!;
 cards[0].hidden=cards[1].hidden=true;first.hidden=true;
 d.dispatchEvent(new w.Event('shop-filter-changed'));assert.equal(first.querySelector<HTMLElement>('.studio-shell')!.hidden,true);assert.equal(second.querySelector('.studio-counter')!.textContent,'01 / 02');assert.equal(second.querySelector('.studio-live')!.textContent,'Article 3, article 1 sur 2');
 cards[2].hidden=cards[3].hidden=true;d.dispatchEvent(new w.Event('shop-filter-changed'));assert.equal(second.querySelector<HTMLElement>('.studio-shell')!.hidden,true);assert.equal(second.querySelector<HTMLElement>('.studio-navigation')!.hidden,true);
 cards[3].hidden=false;d.dispatchEvent(new w.Event('shop-filter-changed'));assert.equal(second.querySelector<HTMLElement>('.studio-shell')!.hidden,false);assert.equal(second.querySelector('.studio-counter')!.textContent,'01 / 01');
 d.querySelector('#shop-categories')!.innerHTML='<section data-shop-category="3"><header><h3>Nouveau</h3></header><div class="shop-product-grid"><article data-shop-product="9"><h3>Sac</h3><button data-order-product="9">Ajouter</button></article></div></section>';
 d.dispatchEvent(new w.Event('shop-loaded'));assert.equal(d.querySelectorAll('.studio-thumbnail').length,1);assert.equal(d.querySelector('.studio-live')!.textContent,'Sac, article 1 sur 1');
 d.dispatchEvent(new w.Event('shop-filter-changed'));assert.equal(d.querySelectorAll('.studio-shell').length,1);w.close();
 const other=fixture('grid');assert.equal(other.d.querySelector('.studio-shell'),null);assert.equal(other.d.querySelectorAll('.studio-inactive').length,0);other.w.close();
});
test('vestiaires : quatre miniatures par page, pagination et clavier limités à leur catégorie',()=>{
 const {w,d}=fixture('experimental',7),first=d.querySelector<HTMLElement>('[data-shop-category="1"]')!,second=d.querySelector<HTMLElement>('[data-shop-category="2"]')!;
 const shown=(section:HTMLElement)=>[...section.querySelectorAll<HTMLButtonElement>('.studio-thumbnail')].filter(button=>!button.hidden);
 assert.equal(shown(first).length,4);assert.equal(first.querySelector('.studio-shelf-count')!.textContent,'1–4 / 7');
 first.querySelector<HTMLButtonElement>('[aria-label^="Miniatures suivantes"]')!.click();assert.equal(shown(first).length,3);assert.equal(first.querySelector('.studio-shelf-count')!.textContent,'5–7 / 7');assert.equal(second.querySelector('.studio-shelf-count')!.textContent,'1–4 / 7');
 assert.equal(first.querySelector('.studio-counter')!.textContent,'01 / 07');shown(first)[0].click();assert.equal(first.querySelector('.studio-counter')!.textContent,'05 / 07');
 shown(first)[0].dispatchEvent(new w.KeyboardEvent('keydown',{key:'Home',bubbles:true,cancelable:true}));assert.equal(first.querySelector('.studio-shelf-count')!.textContent,'1–4 / 7');assert.equal(first.querySelector('.studio-counter')!.textContent,'01 / 07');
 for(let i=0;i<6;i++)first.querySelector<HTMLButtonElement>('[aria-label="Article suivant"]')!.click();assert.equal(first.querySelector('.studio-counter')!.textContent,'07 / 07');assert.equal(shown(first).length,3);
 assert.equal(second.querySelector('.studio-counter')!.textContent,'01 / 07');
 for(const card of first.querySelectorAll<HTMLElement>('[data-shop-product]'))card.hidden=card.dataset.shopProduct!=='7';d.dispatchEvent(new w.Event('shop-filter-changed'));
 assert.equal(shown(first).length,1);assert.equal(first.querySelector<HTMLElement>('.studio-thumbnail-paging')!.hidden,true);assert.equal(first.querySelector('.studio-counter')!.textContent,'01 / 01');w.close();
});

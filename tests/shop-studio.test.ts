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
 assert.equal(d.querySelectorAll('.studio-shell').length,2);assert.deepEqual(active(first),['1']);assert.deepEqual(active(second),['3']);assert.equal(first.querySelector('.studio-counter'),null);
 const order=first.querySelector('[data-order-product="2"]');let ordered=0;order!.addEventListener('click',()=>ordered++);
 first.querySelectorAll<HTMLButtonElement>('.studio-thumbnail')[1].click();assert.deepEqual(active(first),['2']);assert.deepEqual(active(second),['3']);assert.equal(first.querySelector('.studio-step'),null);
 order!.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));assert.equal(ordered,1);
 const thumbnails=[...first.querySelectorAll<HTMLButtonElement>('.studio-thumbnail')];assert.equal(thumbnails[1].getAttribute('aria-pressed'),'true');assert.equal(thumbnails[1].tabIndex,0);assert.equal(thumbnails[0].tabIndex,-1);
 thumbnails[1].dispatchEvent(new w.KeyboardEvent('keydown',{key:'Home',bubbles:true,cancelable:true}));assert.deepEqual(active(first),['1']);assert.equal(d.activeElement,thumbnails[0]);
 const view=first.querySelector<HTMLButtonElement>('.studio-view')!;view.click();assert.equal(view.getAttribute('aria-pressed'),'true');assert.deepEqual(active(first),['1','2']);assert.deepEqual(active(second),['3']);assert.equal(first.querySelector<HTMLElement>('.studio-thumbnails')!.hidden,true);assert.equal(first.querySelector('.studio-thumbnail-paging'),null);
 view.click();assert.deepEqual(active(first),['1']);assert.equal(d.querySelector('[data-order-product="2"]'),order);
 d.dispatchEvent(new w.Event('shop-loaded'));assert.equal(d.querySelectorAll('.studio-shell').length,2);assert.equal(d.querySelectorAll('.studio-thumbnail').length,4);assert.equal(d.querySelector('[data-order-product="2"]'),order);w.close();
});
test('vestiaires : filtres, aucun résultat, rechargement et isolation des autres boutiques',()=>{
 const {w,d}=fixture();const cards=[...d.querySelectorAll<HTMLElement>('[data-shop-product]')];
 const first=d.querySelector<HTMLElement>('[data-shop-category="1"]')!,second=d.querySelector<HTMLElement>('[data-shop-category="2"]')!;
 cards[0].hidden=cards[1].hidden=true;first.hidden=true;
 d.dispatchEvent(new w.Event('shop-filter-changed'));assert.equal(first.querySelector<HTMLElement>('.studio-shell')!.hidden,true);assert.equal(second.querySelector('.studio-live')!.textContent,'Article 3');
 cards[2].hidden=cards[3].hidden=true;d.dispatchEvent(new w.Event('shop-filter-changed'));assert.equal(second.querySelector<HTMLElement>('.studio-shell')!.hidden,true);assert.equal(second.querySelector<HTMLElement>('.studio-navigation')!.hidden,true);
 cards[3].hidden=false;d.dispatchEvent(new w.Event('shop-filter-changed'));assert.equal(second.querySelector<HTMLElement>('.studio-shell')!.hidden,false);assert.equal(second.querySelector('.studio-live')!.textContent,'Article 4');
 d.querySelector('#shop-categories')!.innerHTML='<section data-shop-category="3"><header><h3>Nouveau</h3></header><div class="shop-product-grid"><article data-shop-product="9"><h3>Sac</h3><button data-order-product="9">Ajouter</button></article></div></section>';
 d.dispatchEvent(new w.Event('shop-loaded'));assert.equal(d.querySelectorAll('.studio-thumbnail').length,1);assert.equal(d.querySelector('.studio-live')!.textContent,'Sac');
 d.dispatchEvent(new w.Event('shop-filter-changed'));assert.equal(d.querySelectorAll('.studio-shell').length,1);w.close();
 const other=fixture('grid');assert.equal(other.d.querySelector('.studio-shell'),null);assert.equal(other.d.querySelectorAll('.studio-inactive').length,0);other.w.close();
});
test('vestiaires : défilement direct, glisser sans sélection accidentelle, clavier et filtres',()=>{
 const {w,d}=fixture('experimental',7),first=d.querySelector<HTMLElement>('[data-shop-category="1"]')!,second=d.querySelector<HTMLElement>('[data-shop-category="2"]')!;
 const shelf=first.querySelector<HTMLElement>('.studio-thumbnail-items')!,buttons=[...shelf.querySelectorAll<HTMLButtonElement>('.studio-thumbnail')];
 assert.equal(buttons.filter(b=>!b.hidden).length,7);assert.equal(first.querySelector('.studio-thumbnail-number'),null);assert.equal(first.querySelector('.studio-thumbnail-paging'),null);
 assert.equal(first.querySelector('[data-studio-number]'),null);
 Object.defineProperties(shelf,{clientWidth:{value:300},scrollWidth:{value:900},clientHeight:{value:100},scrollHeight:{value:100,writable:true}});
 const wheel=new w.WheelEvent('wheel',{deltaY:100,cancelable:true});shelf.dispatchEvent(wheel);assert.equal(wheel.defaultPrevented,true);assert.equal(shelf.scrollLeft,100);
 const ctrl=new w.WheelEvent('wheel',{deltaY:100,cancelable:true});Object.defineProperty(ctrl,'ctrlKey',{value:true});shelf.dispatchEvent(ctrl);assert.equal(ctrl.defaultPrevented,false);
 shelf.scrollLeft=600;const edge=new w.WheelEvent('wheel',{deltaY:100,cancelable:true});shelf.dispatchEvent(edge);assert.equal(edge.defaultPrevented,false);
 Object.defineProperty(shelf,'scrollHeight',{value:900});const vertical=new w.WheelEvent('wheel',{deltaY:100,cancelable:true});shelf.dispatchEvent(vertical);assert.equal(vertical.defaultPrevented,false);
 shelf.setPointerCapture=()=>{};shelf.scrollTop=0;
 shelf.dispatchEvent(new w.PointerEvent('pointerdown',{pointerType:'mouse',button:0,pointerId:1,clientX:30,clientY:200}));
 shelf.dispatchEvent(new w.PointerEvent('pointermove',{pointerId:1,clientX:30,clientY:100}));assert.equal(shelf.scrollTop,100);
 shelf.dispatchEvent(new w.PointerEvent('pointerup',{pointerId:1}));
 const click=new w.MouseEvent('click',{bubbles:true,cancelable:true});buttons[3].dispatchEvent(click);assert.equal(click.defaultPrevented,true);assert.equal(first.querySelector('.studio-live')!.textContent,'Article 1');
 buttons[3].click();assert.equal(first.querySelector('.studio-live')!.textContent,'Article 4');assert.equal(second.querySelector('.studio-live')!.textContent,'Article 8');
 // Keyboard selection reveals only the shelf; never call scrollIntoView on the page.
 shelf.getBoundingClientRect=()=>({top:10,bottom:110,left:10,right:310,width:300,height:100,x:10,y:10,toJSON:()=>({})});
 buttons[6].getBoundingClientRect=()=>({top:210,bottom:250,left:10,right:80,width:70,height:40,x:10,y:210,toJSON:()=>({})});
 const before=shelf.scrollTop;
 buttons[3].dispatchEvent(new w.KeyboardEvent('keydown',{key:'End',bubbles:true,cancelable:true}));assert.equal(first.querySelector('.studio-live')!.textContent,'Article 7');assert.equal(d.activeElement,buttons[6]);assert.equal(shelf.scrollTop,before+140);
 for(const card of first.querySelectorAll<HTMLElement>('[data-shop-product]'))card.hidden=card.dataset.shopProduct!=='7';d.dispatchEvent(new w.Event('shop-filter-changed'));
 assert.equal(buttons.filter(b=>!b.hidden).length,1);assert.equal(first.querySelector('.studio-live')!.textContent,'Article 7');w.close();
});
test('vestiaires : en-tête illustré par le catalogue, sans doublons, reprise et repli logo',()=>{
 const {w,d}=fixture();
 const hero=d.createElement('div');hero.id='studio-hero-pieces';hero.innerHTML='<img class="studio-hero-fallback" src="/logo-fce.webp" alt="">';d.body.prepend(hero);
 d.dispatchEvent(new w.Event('shop-loaded'));
 const images=()=>[...hero.querySelectorAll<HTMLImageElement>('.studio-hero-piece img')];
 assert.deepEqual(images().map(img=>img.getAttribute('src')),['/media/1.webp','/media/3.webp','/media/2.webp']);assert.equal(hero.classList.contains('has-products'),true);
 d.dispatchEvent(new w.Event('shop-loaded'));assert.equal(images().length,3);assert.equal(d.querySelectorAll('.studio-shell').length,2);
 images().forEach(img=>img.dispatchEvent(new w.Event('error')));assert.equal(hero.classList.contains('has-products'),false);assert.ok(hero.querySelector('.studio-hero-fallback'));
 d.querySelectorAll('.product-card-visual img').forEach(img=>img.setAttribute('src','/logo-fce.webp'));
 d.dispatchEvent(new w.Event('shop-loaded'));assert.equal(images().length,0);assert.equal(hero.classList.contains('has-products'),false);w.close();
});

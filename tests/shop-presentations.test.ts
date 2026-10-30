import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Window} from 'happy-dom';
import {priceMarkup,groupedVariantPricesMarkup,zoomImageMarkup} from '../public/shop-common.js';
const next=()=>new Promise(resolve=>setImmediate(resolve));
test('présentations boutique : espaces dans les fourchettes et regroupement fidèle des tarifs',()=>{
 const variants=['6 ans','8 ans','10 ans','14 ans','S','M','XL'].map((size,i)=>({id:String(i),label:size,size,price_cents:i<4?2600:3000,catalogue_price_cents:i<4?3000:3500}));
 assert.match(priceMarkup(variants),/26 – 30 €/);assert.match(priceMarkup(variants),/30 – 35 €/);
 const html=groupedVariantPricesMarkup(variants);assert.equal((html.match(/<li>/g)||[]).length,2);assert.match(html,/6 ans à 14 ans/);assert.match(html,/S à XL/);assert.doesNotMatch(html,/8 ans|10 ans/);
 assert.equal((groupedVariantPricesMarkup([...variants,{...variants[0],catalogue_price_cents:null}]).match(/<li>/g)||[]).length,3);
 assert.match(zoomImageMarkup({name:'<Maillot>',image_key:'uploads/photo.webp'}),/aria-label="Agrandir la photo : &lt;Maillot&gt;"/);
});
test('zoom boutique : ouverture, agrandissement, erreur image et retour du focus',async()=>{
 const w=new Window({url:'https://example.org/boutique/',settings:{enableImageFileLoading:false}}),d=w.document;
 d.body.innerHTML=zoomImageMarkup({name:'Maillot',image_key:'uploads/maillot.webp'});
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 w.eval(readFileSync(new URL('../public/shop-gallery.js',import.meta.url),'utf8').replace(/export /g,''));
 const trigger=d.querySelector<HTMLButtonElement>('[data-zoom-image]')!;trigger.click();const dialog=d.querySelector<HTMLDialogElement>('#image-zoom-dialog')!;assert.equal(dialog.open,true);assert.equal(dialog.querySelector('img')!.alt,'Maillot');
 dialog.querySelector<HTMLElement>('[data-image-more]')!.click();assert.equal(dialog.querySelector('[data-image-scale]')!.textContent,'150 %');dialog.querySelector<HTMLElement>('[data-image-reset]')!.click();assert.equal(dialog.querySelector('[data-image-scale]')!.textContent,'100 %');
 dialog.querySelector('img')!.dispatchEvent(new w.Event('error'));assert.equal(dialog.querySelector<HTMLElement>('[data-image-error]')!.hidden,false);
 dialog.querySelector<HTMLElement>('[data-image-close]')!.click();assert.equal(dialog.open,false);assert.equal(d.activeElement,trigger);assert.equal(dialog.querySelector('img')!.hasAttribute('src'),false);
 await w.happyDOM.abort();w.close();
});
test('boutique horizontale : flèches accessibles, limites du défilement et filtres',()=>{
 const w=new Window({url:'https://example.org/boutique-2/'}),d=w.document;d.body.dataset.shopLayout='rail';
 d.body.innerHTML='<section data-shop-category="1"><header><h3>Tenues</h3></header><div class="shop-product-grid"></div></section>';
 const rail=d.querySelector<HTMLElement>('.shop-product-grid')!;Object.defineProperties(rail,{clientWidth:{value:400},scrollWidth:{value:1000}});let distance=0;
 rail.scrollBy=(options:any)=>{distance=options.left;rail.scrollLeft+=distance;rail.dispatchEvent(new w.Event('scroll'));};
 w.eval(readFileSync(new URL('../public/shop-layouts.js',import.meta.url),'utf8').replace(/export /g,''));d.dispatchEvent(new w.Event('shop-loaded'));
 const buttons=d.querySelectorAll<HTMLButtonElement>('.shop-rail-controls button');assert.equal(buttons.length,2);assert.equal(buttons[0].disabled,true);assert.equal(buttons[1].disabled,false);buttons[1].click();assert.ok(distance>0);assert.equal(buttons[0].disabled,false);
 rail.scrollLeft=600;rail.dispatchEvent(new w.Event('scroll'));assert.equal(buttons[1].disabled,true);d.dispatchEvent(new w.Event('shop-filter-changed'));assert.equal(rail.scrollLeft,0);assert.equal(rail.tabIndex,0);
 d.dispatchEvent(new w.Event('shop-loaded'));assert.equal(d.querySelectorAll('.shop-rail-controls').length,1);w.close();
});

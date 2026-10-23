import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Window} from 'happy-dom';
import {mountShopVisibility} from '../src/scripts/admin-shop-visibility.js';
const next=()=>new Promise(resolve=>setImmediate(resolve));

test('affichage boutique : masquer et réafficher ne modifie que shop_enabled, double clic bloqué et erreur réessayable',async()=>{
 const w=new Window({url:'https://example.org/admin-boutique/'});w.document.body.innerHTML='<div id="switch"></div>';
 Object.assign(globalThis,{document:w.document});
 const settings={id:1,shop_enabled:1,maintenance_image_key:'uploads/attente.webp',contact_email:'contact@example.org'},changes:any[]=[],messages:string[]=[];
 let fail=false;
 const call=async(path:string,options:any={})=>{
  if(options.method==='PUT'){changes.push(options.data);await next();if(fail)throw new Error('Session expirée');Object.assign(settings,options.data);return {ok:true};}
  return [structuredClone(settings)];
 };
 await mountShopVisibility(w.document.querySelector('#switch'),call,(message:string)=>messages.push(message));
 let button=w.document.querySelector<HTMLButtonElement>('button')!;assert.match(button.textContent!,/uniquement l’image/);button.click();button.click();await next();await next();
 assert.deepEqual(changes,[{shop_enabled:0}]);assert.match(w.document.querySelector('h2')!.textContent!,/masquée/);assert.equal(settings.maintenance_image_key,'uploads/attente.webp');assert.equal(settings.contact_email,'contact@example.org');
 fail=true;button=w.document.querySelector('button')!;button.click();await next();await next();assert.equal(settings.shop_enabled,0);assert.match(w.document.querySelector('[role=status]')!.textContent!,/Session expirée/);assert.equal(button.disabled,false);
 fail=false;button.click();await next();await next();assert.equal(settings.shop_enabled,1);assert.deepEqual(changes.at(-1),{shop_enabled:1});assert.equal(messages.length,2);
 await w.happyDOM.abort();w.close();
});

test('affichage boutique : image nécessaire avant masquage et actualisation après sauvegarde du visuel',async()=>{
 const w=new Window({url:'https://example.org/admin-boutique/couverture/'});w.document.body.innerHTML='<div id="switch"></div>';Object.assign(globalThis,{document:w.document});
 const settings={id:1,shop_enabled:1,maintenance_image_key:''};
 await mountShopVisibility(w.document.querySelector('#switch'),async()=>[structuredClone(settings)],()=>{});
 assert.equal(w.document.querySelector<HTMLButtonElement>('button')!.disabled,true);assert.equal(w.document.querySelector('a')!.getAttribute('href'),'/admin-boutique/couverture/');
 settings.maintenance_image_key='uploads/attente.webp';w.document.dispatchEvent(new w.CustomEvent('shop-display-updated'));await next();
 assert.equal(w.document.querySelector<HTMLButtonElement>('button')!.disabled,false);assert.match(w.document.querySelector('img')!.getAttribute('src')!,/attente.webp/);
 await w.happyDOM.abort();w.close();
});

test('boutique publique : page d’attente avec image, catalogue masqué puis réouverture',async()=>{
 const w=new Window({url:'https://example.org/boutique/',settings:{enableImageFileLoading:false}});
 w.document.body.innerHTML='<div class="commerce-toolbar"></div><main id="shop-page" class="is-loading"><section id="shop-maintenance" hidden><img id="shop-maintenance-image" hidden><div id="shop-maintenance-fallback"></div></section><div id="shop-featured"></div><div id="shop-categories"></div></main>';
 w.eval(readFileSync(new URL('../public/shop.js',import.meta.url),'utf8').replace(/^import[^\n]*\n/,'').replace(/loadShop\(\);\s*$/,'')+'\nwindow.testMaintenance=showShopMaintenance;');
 (w as any).testMaintenance({shop_enabled:0,maintenance_image_key:'uploads/attente.webp'});
 assert.equal(w.document.body.classList.contains('shop-is-closed'),true);assert.equal(w.document.querySelector('#shop-page')!.classList.contains('is-closed'),true);
 assert.equal(w.document.querySelector<HTMLElement>('#shop-maintenance')!.hidden,false);assert.equal(w.document.querySelector<HTMLElement>('#shop-maintenance-image')!.hidden,false);assert.match(w.document.querySelector('img')!.getAttribute('src')!,/attente.webp/);
 (w as any).testMaintenance({shop_enabled:1});assert.equal(w.document.body.classList.contains('shop-is-closed'),false);assert.equal(w.document.querySelector<HTMLElement>('#shop-maintenance')!.hidden,true);
 await w.happyDOM.abort();w.close();
});

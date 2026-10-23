import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Window} from 'happy-dom';
import {startNewsAdmin} from '../src/scripts/admin-news.js';
import {card,escapeHtml} from '../src/news/content';
const next=()=>new Promise(r=>setImmediate(r));
function setup(){const w=new Window({url:'https://example.org/admin/actualites/',settings:{enableImageFileLoading:false}});w.document.body.innerHTML='<main id="news-admin-root"><button id="news-add"></button><p id="news-admin-message"></p><section id="news-admin-list"></section><section id="news-admin-editor" hidden></section></main>';w.HTMLElement.prototype.scrollIntoView=()=>{};(w as any).installAdminImageCropper=({upload}:any)=>upload;Object.assign(globalThis,{window:w,document:w.document,location:w.location,sessionStorage:w.sessionStorage,FormData:w.FormData,confirm:()=>true});return w;}
test('annonces DOM : création, aperçu, raccourci tournoi, reprise réseau, publication et retrait',async()=>{
 const w=setup(),d=w.document,rows:any[]=[],sent:any[]=[];let failFirst=true;
 const transport=async(path:any,options:any={})=>{if(options.method==='POST'||options.method==='PUT'){const data=JSON.parse(options.body);sent.push(data);if(options.method==='POST'){if(!rows.length)rows.push({...data,id:1,version:1,created_at:1});if(failFirst){failFirst=false;throw new Error('network');}return Response.json(rows[0]);}rows[0]={...data,id:1,version:rows[0].version+1,created_at:1};return Response.json(rows[0]);}if(options.method==='DELETE'){rows.splice(0);return Response.json({ok:true});}return Response.json({news:rows});};
 await startNewsAdmin(d.querySelector('#news-admin-root'),transport);assert.doesNotMatch(d.querySelector('#news-admin-message')!.textContent!,/Chargement/);d.querySelector<HTMLElement>('#news-add')!.click();
 let form=d.querySelector<HTMLFormElement>('#news-form')!;(form.elements.namedItem('title') as HTMLInputElement).value='Tournoi U11';(form.elements.namedItem('body') as HTMLTextAreaElement).value='**Les inscriptions sont ouvertes**';form.dispatchEvent(new w.Event('input',{bubbles:true}));d.querySelector<HTMLElement>('[data-news-link=tournoi]')!.click();assert.match(d.querySelector('#news-live-preview')!.innerHTML,/<strong>Les inscriptions/);assert.equal(d.querySelector('#news-live-preview a')!.getAttribute('href'),'/tournois/');
 const submit=(status:string)=>form.dispatchEvent(new w.SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:form.querySelector(`[data-status=${status}]`)}));submit('draft');await next();assert.match(d.querySelector('#news-form-error')!.textContent!,/saisie est conservée/);assert.equal((form.elements.namedItem('title') as HTMLInputElement).value,'Tournoi U11');assert.equal((form.elements.namedItem('title') as HTMLInputElement).disabled,false);
 submit('draft');await next();await next();assert.equal(sent[0].idempotency_key,sent[1].idempotency_key);assert.equal(rows.length,1);assert.match(d.querySelector('#news-admin-list')!.textContent!,/Brouillon/);
 form=d.querySelector<HTMLFormElement>('#news-form')!;submit('published');await next();await next();assert.equal(sent.at(-1).status,'published');assert.equal(sent.at(-1).version,1);assert.match(d.querySelector('#news-admin-list')!.textContent!,/Visible/);
 d.querySelector<HTMLElement>('[data-delete-news]')!.click();await next();await next();assert.equal(rows.length,0);assert.match(d.querySelector('#news-admin-list')!.textContent!,/Aucune annonce/);await w.happyDOM.abort();w.close();
});
test('annonces DOM : image importée affichée dans l’aperçu puis retirée sans publier',async()=>{
 const w=setup(),d=w.document;await startNewsAdmin(d.querySelector('#news-admin-root'),async(path:any)=>Response.json(String(path).endsWith('upload')?{key:'uploads/news.png'}:{news:[]}));d.querySelector<HTMLElement>('#news-add')!.click();const input=d.querySelector<HTMLInputElement>('#news-upload')!;Object.defineProperty(input,'files',{value:[new w.File(['image'],'image.png',{type:'image/png'})]});input.dispatchEvent(new w.Event('change'));await next();assert.match(d.querySelector('#news-live-preview img')!.getAttribute('src')!,/uploads\/news.png/);assert.match(d.querySelector('#news-upload-status')!.textContent!,/Image chargée/);d.querySelector<HTMLElement>('#news-remove-image')!.click();assert.equal(d.querySelector('#news-live-preview img'),null);await w.happyDOM.abort();w.close();
});
test('accueil : aucune section vide, annonces entièrement affichées, panne isolée et nouvelle vérification au retour',async()=>{
 const w=new Window({url:'https://example.org/',settings:{enableImageFileLoading:false}});w.document.body.innerHTML='<section id="home-news" hidden><div id="home-news-items"></div></section>';let news:any[]=[],fail=false;(w as any).card=card;w.fetch=(async()=>fail?new Response('',{status:500}):Response.json({news})) as any;w.eval(readFileSync(new URL('../src/scripts/news-public.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/,''));await next();assert.equal((w.document.querySelector('#home-news') as HTMLElement).hidden,true);
 news=[{id:1,title:'Super résultat',body:'Victoire **3–0**',link_url:'/matchs/',link_label:'Voir les résultats'}];w.document.dispatchEvent(new w.Event('visibilitychange'));await next();assert.equal((w.document.querySelector('#home-news') as HTMLElement).hidden,false);assert.match(w.document.querySelector('#home-news-items')!.textContent!,/Victoire 3–0/);assert.equal(w.document.querySelector('a')!.getAttribute('href'),'/matchs/');fail=true;w.document.dispatchEvent(new w.Event('visibilitychange'));await next();assert.equal((w.document.querySelector('#home-news') as HTMLElement).hidden,true);await w.happyDOM.abort();w.close();
});

test('annonces DOM : recadrage annulé conserve la photo et ne déclenche aucun envoi',async()=>{
 const w=setup(),d=w.document;let uploads=0;let resolveCrop:any;
 (w as any).installAdminImageCropper=()=>()=>new Promise(resolve=>{resolveCrop=resolve;});
 await startNewsAdmin(d.querySelector('#news-admin-root'),async(path:any)=>{if(String(path).endsWith('upload'))uploads++;return Response.json({news:[{id:1,title:'Annonce',body:'Texte',image_key:'uploads/existing.webp',version:1}]});});
 d.querySelector<HTMLElement>('[data-edit-news]')!.click();const input=d.querySelector<HTMLInputElement>('#news-upload')!;
 Object.defineProperty(input,'files',{value:[new w.File(['image'],'image.png',{type:'image/png'})]});input.dispatchEvent(new w.Event('change'));await next();
 assert.equal(d.querySelector<HTMLButtonElement>('[data-status=published]')!.disabled,true);
 resolveCrop();await next();assert.equal(uploads,0);assert.match(d.querySelector('#news-live-preview img')!.getAttribute('src')!,/existing.webp/);
 assert.equal(d.querySelector<HTMLButtonElement>('[data-status=published]')!.disabled,false);assert.match(d.querySelector('#news-upload-status')!.textContent!,/annulé/);
 await w.happyDOM.abort();w.close();
});

test('accueil : titre visible avant le bandeau principal, lien vers l’annonce, plusieurs annonces et retrait',async()=>{
 const w=new Window({url:'https://example.org/',settings:{enableImageFileLoading:false}});
 w.document.body.innerHTML='<main><div id="home-news-alert" hidden></div><section class="hero"></section><section id="home-news" hidden><div id="home-news-items"></div></section></main>';
 let news:any[]=[{id:17,title:'Boutique <FCE>',body:'Ouverture',image_key:'uploads/photo.webp'},{id:18,title:'Tournoi',body:'Inscriptions'}];
 (w as any).card=card;(w as any).esc=escapeHtml;w.fetch=(async()=>Response.json({news})) as any;
 w.eval(readFileSync(new URL('../src/scripts/news-public.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/,''));await next();
 const alert=w.document.querySelector<HTMLElement>('#home-news-alert')!;
 assert.equal(alert.hidden,false);assert.match(alert.textContent!,/Boutique <FCE>/);assert.equal(alert.querySelector('strong')!.children.length,0);
 const href=alert.querySelector('a')!.getAttribute('href')!;assert.equal(href,'#annonce-17');assert.ok(w.document.querySelector(href));assert.match(alert.querySelector('.home-news-all')!.textContent!,/1 actualité/);
 news=[news[1]];w.document.dispatchEvent(new w.Event('visibilitychange'));await next();assert.equal(alert.querySelector('.home-news-all'),null);assert.equal(alert.querySelector('img'),null);
 news=[];w.document.dispatchEvent(new w.Event('visibilitychange'));await next();assert.equal(alert.hidden,true);assert.equal(w.document.querySelector<HTMLElement>('#home-news')!.hidden,true);
 await w.happyDOM.abort();w.close();
});

test('administration : annonces dans le même menu, même bouton Ajouter et abandon protégé avant une autre rubrique',async()=>{
 const w=setup(),d=w.document;
 const page=readFileSync(new URL('../src/pages/admin/index.astro',import.meta.url),'utf8');
 d.body.innerHTML=page.match(/<body>([\s\S]*)<\/body>/)![1].replace(/<script\b[\s\S]*?<\/script>/g,'');
 w.fetch=(async()=>Response.json([])) as any;
 w.eval(readFileSync(new URL('../public/admin.js',import.meta.url),'utf8'));
 await startNewsAdmin(d.querySelector('#news-admin-root'),async()=>Response.json({news:[]}));await next();
 const initialURL=w.location.pathname;
 d.querySelector<HTMLElement>('[data-name=news]')!.click();await next();
 assert.equal(w.location.pathname,initialURL);assert.equal(d.querySelector<HTMLElement>('#news-admin-root')!.hidden,false);assert.match(d.querySelector('#title')!.textContent!,/Annonces/);
 d.querySelector<HTMLElement>('#new')!.click();assert.ok(d.querySelector('#news-form'));
 const field=d.querySelector<HTMLInputElement>('[name=title]')!;field.value='Annonce non enregistrée';field.dispatchEvent(new w.Event('input',{bubbles:true}));
 (globalThis as any).confirm=()=>false;d.querySelector<HTMLElement>('[data-name=venues]')!.click();assert.equal(d.querySelector<HTMLElement>('#news-admin-root')!.hidden,false);assert.equal(field.value,'Annonce non enregistrée');
 (globalThis as any).confirm=()=>true;d.querySelector<HTMLElement>('[data-name=venues]')!.click();await next();assert.equal(d.querySelector<HTMLElement>('#news-admin-root')!.hidden,true);assert.equal(d.querySelector('#title')!.textContent,'Terrains');
 assert.doesNotMatch(page,/news\.css|news-admin-main/);assert.match(readFileSync(new URL('../src/pages/admin/actualites/index.astro',import.meta.url),'utf8'),/location.replace\('\/admin\/#news'\)/);
 await w.happyDOM.abort();w.close();
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Window} from 'happy-dom';
const next=()=>new Promise(resolve=>setImmediate(resolve));
const common=readFileSync(new URL('../public/shop-common.js',import.meta.url),'utf8').replace(/export /g,'');
const source=(name:string)=>readFileSync(new URL(`../src/scripts/${name}.js`,import.meta.url),'utf8').replace(/^import[\s\S]*?from [^;]+;/,'');
test('tournois DOM : formulaire par équipe, paiement différé et suivi conservé après une erreur HelloAsso',async()=>{
 const w=new Window({url:'https://example.org/tournois/',settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});
 Object.defineProperty(w,'crypto',{value:globalThis.crypto});Object.defineProperty(w,'TextEncoder',{value:TextEncoder});
 w.document.write('<button data-tournament-register="1">Inscrire mon équipe</button>');
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 let posted:any;
 w.fetch=(async(path:any,init:any)=>{
  if(path==='/api/tournaments/catalogue')return Response.json({tournaments:[{id:1,name:'Tournoi <test>',version:3,fee_cents:3250,allow_pay_later:1,payment_deadline:1900000000,available:true,terms:'Conditions du tournoi.'}]});
  posted=JSON.parse(init.body);return Response.json({error:'HelloAsso indisponible',code:'HELLOASSO_AUTH',order_id:'11111111-1111-4111-8111-111111111111',tracking_token:'a'.repeat(64)},{status:503});
 }) as any;
 w.eval(common+'\n'+source('tournaments-checkout'));
 w.document.querySelector<HTMLElement>('button')!.click();await next();
 assert.equal(w.document.querySelector<HTMLDialogElement>('dialog')!.open,true);assert.equal(w.document.querySelector('h2')!.textContent,'Tournoi <test>');assert.equal(w.document.querySelector('h2 test'),null);assert.match(w.document.querySelector('dialog')!.textContent!,/32,50/);
 const form=w.document.querySelector<HTMLFormElement>('form')!;
 for(const name of ['club_name','team_name','category','first_name','last_name']) (form.elements.namedItem(name) as HTMLInputElement).value=name;
 (form.elements.namedItem('email') as HTMLInputElement).value='responsable@example.org';(form.elements.namedItem('phone') as HTMLInputElement).value='0612345678';
 (form.querySelector('[value=later]') as HTMLInputElement).checked=true;(form.elements.namedItem('accept_terms') as HTMLInputElement).checked=true;
 form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 for(let n=0;n<10&&!posted;n++)await next();await next();
 assert.equal(posted.expected_total,3250);assert.equal(posted.payment_choice,'later');assert.equal(posted.accept_terms,true);assert.equal(posted.version,3);
 assert.match(w.document.querySelector('[data-error]')!.textContent!,/HelloAsso indisponible/);assert.match(w.document.querySelector('[data-recovery] a')!.getAttribute('href')!,/\/tournois\/suivi\/#11111111/);
 assert.equal(JSON.parse(w.sessionStorage.getItem('fce-tournament-link')!).token,'a'.repeat(64));assert.equal(w.sessionStorage.getItem('fce-tournament-draft'),null);
 await w.happyDOM.abort();w.close();
});
test('retour DOM : un code succeeded ne confirme jamais le paiement et permet la récupération par mail',async()=>{
 const w=new Window({url:'https://example.org/paiements/retour/?context=tournois&code=succeeded&order=unknown',settings:{disableJavaScriptFileLoading:true}});
 w.document.write('<p id="payment-return-message"></p><a id="payment-return-link"></a>');
 w.eval(common+'\n'+source('payment-return'));
 assert.equal(w.document.querySelector('a')!.getAttribute('href'),'/tournois/suivi/');assert.match(w.document.querySelector('p')!.textContent!,/demandez son renvoi/);assert.doesNotMatch(w.document.querySelector('p')!.textContent!,/confirmé|réussi/);
 await w.happyDOM.abort();w.close();
});
test('administration tournois DOM : liste, détail et validation distincte du paiement',async()=>{
 const w=new Window({url:'https://example.org/admin-tournois/',settings:{disableJavaScriptFileLoading:true}});
 w.document.write('<p id="tournament-environment"></p><p id="tournament-admin-message"></p><div id="tournament-admin" data-page="registrations"></div>');
 w.HTMLElement.prototype.scrollIntoView=function(){};
 const id='11111111-1111-4111-8111-111111111111';let update:any;
 const order={id,reference:'FCE-T-TEST',version:2,payment_status:'pending',total_cents:4900,first_name:'Responsable',last_name:'Test',email:'test@example.org',phone:'0612345678',public_note:'',internal_note:''},registration={order_id:id,tournament_name:'Tournoi U11',club_name:'Club',team_name:'Équipe A',category:'U11',registration_status:'pending'};
 w.fetch=(async(path:any,init:any)=>{
  if(init.method==='PUT'){update=JSON.parse(init.body);return Response.json({ok:true});}
  if(path.endsWith('/status'))return Response.json({environment:'sandbox'});
  if(path.endsWith('/registrations'))return Response.json({registrations:[{...order,...registration}]});
  return Response.json({order,registration,events:[],mails:[],attempts:[]});
 }) as any;
 w.eval(common+'\n'+source('admin-tournaments'));await next();await next();
 assert.match(w.document.querySelector('#tournament-environment')!.textContent!,/SANDBOX/);
 assert.match(w.document.querySelector('table')!.textContent!,/Équipe A/);
 w.document.querySelector<HTMLElement>('[data-order]')!.click();await next();await next();
 const form=w.document.querySelector<HTMLFormElement>('#registration-detail form')!;assert.ok(form);
 (form.elements.namedItem('registration_status') as HTMLSelectElement).value='accepted';(form.elements.namedItem('public_note') as HTMLTextAreaElement).value='Bienvenue';form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await next();await next();
 assert.equal(update.version,2);assert.equal(update.registration_status,'accepted');assert.equal(update.public_note,'Bienvenue');assert.equal(update.payment_status,undefined);
 await w.happyDOM.abort();w.close();
});

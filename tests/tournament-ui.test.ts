import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Window} from 'happy-dom';
const next=()=>new Promise(resolve=>setImmediate(resolve));
const until=async(condition:()=>boolean)=>{const deadline=Date.now()+2000;while(!condition()&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,5));assert.ok(condition(),'Le traitement asynchrone du formulaire n’a pas terminé.');};
const common=readFileSync(new URL('../public/shop-common.js',import.meta.url),'utf8').replace(/export /g,'');
const source=(name:string)=>readFileSync(new URL(`../src/scripts/${name}.js`,import.meta.url),'utf8').replace(/^import[\s\S]*?from [^;]+;\n?/gm,'').replace(/export /g,'');
test('tournois DOM : formulaire par tournoi, quantités par section, total par équipe et paiement différé et suivi conservé après une erreur HelloAsso',async()=>{
 const w=new Window({url:'https://example.org/tournois/',settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});
 Object.defineProperty(w,'crypto',{value:globalThis.crypto});Object.defineProperty(w,'TextEncoder',{value:TextEncoder});
 w.document.write('<button data-tournament-register="1">Inscrire mon équipe</button>');
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 let posted:any;
 w.fetch=(async(path:any,init:any)=>{
  if(path==='/api/tournaments/catalogue')return Response.json({tournaments:[{id:1,name:'Tournoi <test>',sections:['U11','U13'],version:3,fee_cents:3250,allow_cheque:1,cheque_payee:'FCE',cheque_address:'1 rue du Stade',cheque_deadline:1900000000,allow_pay_later:1,payment_deadline:1900000000,available:true,terms:'Conditions du tournoi.'}]});
  posted=JSON.parse(init.body);return Response.json({error:'HelloAsso indisponible',code:'HELLOASSO_AUTH',order_id:'11111111-1111-4111-8111-111111111111',tracking_token:'a'.repeat(64)},{status:503});
 }) as any;
 w.eval(common+'\n'+source('tournament-form-fields')+'\n'+source('tournaments-checkout'));
 w.document.querySelector<HTMLElement>('button')!.click();await next();
 assert.equal(w.document.querySelector<HTMLDialogElement>('dialog')!.open,true);assert.equal(w.document.querySelector('h2')!.textContent,'Tournoi <test>');assert.equal(w.document.querySelector('h2 test'),null);assert.match(w.document.querySelector('dialog')!.textContent!,/32,50/);
 const form=w.document.querySelector<HTMLFormElement>('form')!;
 for(const name of ['club_name','first_name','last_name']) (form.elements.namedItem(name) as HTMLInputElement).value=name;
 (form.elements.namedItem('email') as HTMLInputElement).value='responsable@example.org';(form.elements.namedItem('phone') as HTMLInputElement).value='0612345678';
 assert.equal(form.querySelector('input[name="section:0"]'),null);
 assert.equal((form.elements.namedItem('quantity:0') as HTMLInputElement).value,'0');
 assert.equal((form.elements.namedItem('quantity:1') as HTMLInputElement).value,'0');
 assert.equal(form.querySelector('details')!.open,false);assert.match(form.querySelector('[value=cheque]')!.parentElement!.textContent!,/1 rue du Stade/);
 (form.elements.namedItem('quantity:0') as HTMLInputElement).value='3';form.dispatchEvent(new w.Event('input',{bubbles:true}));
 assert.match(form.querySelector('[data-total-price]')!.textContent!,/97,50/);
 (form.querySelector('[value=later]') as HTMLInputElement).checked=true;(form.elements.namedItem('accept_terms') as HTMLInputElement).checked=true;
 form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 await until(()=>Boolean(posted)&&Boolean(w.document.querySelector('[data-recovery] a')));
 assert.equal(posted.expected_total,9750);assert.deepEqual(posted.sections,[{section:"U11",participating:true,quantity:3},{section:"U13",participating:false,quantity:0}]);assert.equal(posted.payment_choice,'later');assert.equal(posted.accept_terms,true);assert.equal(posted.version,3);
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
 w.eval(common+'\n'+source('tournament-form-fields')+'\n'+source('admin-tournaments'));await next();await next();
 assert.match(w.document.querySelector('#tournament-environment')!.textContent!,/SANDBOX/);
 assert.match(w.document.querySelector('table')!.textContent!,/Équipe A/);
 w.document.querySelector<HTMLElement>('[data-order]')!.click();await next();await next();
 const form=w.document.querySelector<HTMLFormElement>('#registration-detail form')!;assert.ok(form);
 (form.elements.namedItem('registration_status') as HTMLSelectElement).value='accepted';(form.elements.namedItem('public_note') as HTMLTextAreaElement).value='Bienvenue';form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await next();await next();
 assert.equal(update.version,2);assert.equal(update.registration_status,'accepted');assert.equal(update.public_note,'Bienvenue');assert.equal(update.payment_status,undefined);
 await w.happyDOM.abort();w.close();
});
test('éditeur de formulaire DOM : ajout, types de champs, ordre et suppression des questions',async()=>{
 const w=new Window({url:'https://example.org/admin-tournois/parametres/'});Object.defineProperty(w,'crypto',{value:globalThis.crypto});Object.defineProperty(w,'structuredClone',{value:structuredClone});w.document.write('<div id="builder"></div>');
 w.eval(common+'\n'+source('tournament-form-editor')+'\nwindow.readFields=formEditor(document.querySelector("#builder"),[{id:"transport",label:"Transport",type:"select",required:true,choices:["Bus","Voiture"]}]);');
 assert.match(w.document.querySelector('table')!.textContent!,/Question/);w.document.querySelector<HTMLElement>('[data-add-question]')!.click();assert.equal(w.document.querySelectorAll('tbody tr').length,2);
 const second=w.document.querySelector('[data-question="1"]')!;(second.querySelector('[data-label]') as HTMLInputElement).value='Commentaire';(second.querySelector('[data-type]') as HTMLSelectElement).value='textarea';second.querySelector('[data-type]')!.dispatchEvent(new w.Event('change'));w.document.querySelector<HTMLElement>('[data-up="1"]')!.click();
 let fields=(w as any).readFields();assert.equal(fields[0].label,'Commentaire');assert.equal(fields[0].type,'textarea');assert.deepEqual(Array.from(fields[1].choices),['Bus','Voiture']);w.document.querySelector<HTMLElement>('[data-remove="0"]')!.click();fields=(w as any).readFields();assert.equal(fields.length,1);assert.equal(fields[0].id,'transport');
 await w.happyDOM.abort();w.close();
});
test('tournois publics : aucun lien vers un formulaire externe hérité',async()=>{
 const w=new Window({url:'https://example.org/tournois/'});w.document.write('<div id="tournaments-list"></div>');w.fetch=(async(path:any)=>Response.json(path==='/api/page/tournaments'?{tournaments:[{id:1,name:'Tournoi',starts_on:'2027-06-10',status:'open',categories:'[]',registration_url:'https://formulaire-externe.example'}]}:{tournaments:[]})) as any;
 w.eval(readFileSync(new URL('../public/tournaments.js',import.meta.url),'utf8'));await next();await next();assert.match(w.document.querySelector('#tournaments-list')!.textContent!,/Tournoi/);assert.equal(w.document.querySelector('a[href="https://formulaire-externe.example"]'),null);await w.happyDOM.abort();w.close();
});

test('carte tournoi : tarif courant même fermé, adresse et itinéraire du lieu du club',async()=>{
 const w=new Window({url:'https://example.org/tournois/'});w.document.write('<div id="tournaments-list"></div>');
 w.fetch=(async(path:any)=>Response.json(path==='/api/page/tournaments'?{tournaments:[{id:1,name:'Tournoi',status:'open',venue_id:4,registration_price:'Ancien tarif'}],venues:[{id:4,name:'Stade',address:'1 rue du Stade',maps_url:'https://maps.example/stade'}]}:{tournaments:[{id:1,fee_cents:3500,available:false,unavailable_reason:'Les inscriptions ne sont pas encore ouvertes.'}]})) as any;
 w.eval(readFileSync(new URL('../public/tournaments.js',import.meta.url),'utf8'));await next();await next();
 const text=w.document.querySelector('#tournaments-list')!.textContent!;assert.match(text,/35,00/);assert.doesNotMatch(text,/Ancien tarif/);assert.match(text,/1 rue du Stade/);assert.match(text,/pas encore ouvertes/);assert.equal(w.document.querySelector('a[href="https://maps.example/stade"]')!.textContent,'Itinéraire ↗');await w.happyDOM.abort();w.close();
});
test('chargement partiel : les tournois restent visibles si les inscriptions ne répondent pas',async()=>{
 const w=new Window({url:'https://example.org/tournois/'});w.document.write('<div id="tournaments-list"></div>');
 w.fetch=(async(path:any)=>path==='/api/page/tournaments'?Response.json({tournaments:[{id:1,name:'Tournoi visible',status:'open'}]}):Response.json({error:'Indisponible'},{status:503})) as any;
 w.eval(readFileSync(new URL('../public/tournaments.js',import.meta.url),'utf8'));await next();await next();assert.match(w.document.querySelector('#tournaments-list')!.textContent!,/Tournoi visible/);assert.match(w.document.querySelector('[role=status]')!.textContent!,/ne peuvent pas être chargés/);await w.happyDOM.abort();w.close();
});
test('éditeur tournoi : lieu sélectionné et adresse affichée sans saisie libre',async()=>{
 const w=new Window({url:'https://example.org/admin-tournois/tournois/'});Object.defineProperty(w,'structuredClone',{value:structuredClone});w.document.write('<div id="root"></div>');w.HTMLElement.prototype.scrollIntoView=function(){};
 w.eval(common+'\n'+source('tournament-form-editor')+'\n'+source('tournament-sales-fields')+'\n'+source('tournament-events-editor')+'\nwindow.start=eventEditor(document.querySelector("#root"),async()=>({events:[],venues:[{id:1,name:"Stade",address:"1 rue du Stade",active:1}]}),()=>{});');await (w as any).start;
 w.document.querySelector<HTMLElement>('#new-tournament')!.click();const select=w.document.querySelector<HTMLSelectElement>('[name=venue_id]')!;assert.ok(select);assert.equal(w.document.querySelector('[name=venue]'),null);select.value='1';select.dispatchEvent(new w.Event('change'));assert.match(w.document.querySelector('[data-venue-address]')!.textContent!,/1 rue du Stade/);await w.happyDOM.abort();w.close();
});

test('éditeur unique : présentation, tarif et questions dans un formulaire, reprise sans création après erreur',async()=>{
 const w=new Window({url:'https://example.org/admin-tournois/tournois/'});Object.defineProperty(w,'structuredClone',{value:structuredClone});w.document.write('<div id="root"></div>');w.HTMLElement.prototype.scrollIntoView=function(){};
 let eventWrites:any[]=[],saleWrites:any[]=[],failure:any;
 (w as any).callMock=async(path:string,options:any={})=>{
   if(path==='events')return {events:[{id:1,name:'Tournoi',slug:'tournoi',starts_on:'2027-07-01',categories:'["U11"]',status:'open',version:1}],venues:[]};
   if(path==='sales'&&!options.method)return {sales:[{id:1,version:2,fee_cents:5000,capacity:20,registration_deadline:1900000000,payment_deadline:1900100000,terms:'Conditions du tournoi suffisamment détaillées pour décrire les inscriptions, annulations et remboursements.',form_json:'[]'}]};
   if(path==='events/1'){eventWrites.push(options.data);return {id:1,version:eventWrites.length+1};}
   if(path==='sales'){saleWrites.push(options.data);if(saleWrites.length===1)throw new Error('Erreur temporaire');return {ok:true};}
   throw new Error(path);
 };
 (w as any).actionMock=async(_button:any,fn:any)=>{try{await fn();}catch(error){failure=error;}};
 w.eval(common+'\n'+source('tournament-form-editor')+'\n'+source('tournament-sales-fields')+'\n'+source('tournament-events-editor')+'\nwindow.start=eventEditor(document.querySelector("#root"),window.callMock,window.actionMock);');await (w as any).start;
 w.document.querySelector<HTMLElement>('[data-event="1"]')!.click();const form=w.document.querySelector<HTMLFormElement>('#event-editor form')!;
 assert.equal((form.elements.namedItem('status') as HTMLSelectElement).value,'open');
 const fee=form.elements.namedItem('fee') as HTMLInputElement;assert.equal(fee.step,'0.01');fee.step='any';
 assert.equal(form.reportValidity(),true,Array.from(form.elements).filter((x:any)=>x.validity&&!x.validity.valid).map((x:any)=>x.name+': '+x.validationMessage).join(';'));
 assert.ok(form.querySelector('[name=name]'));assert.ok(form.querySelector('[name=fee]'));assert.ok(form.querySelector('#tournament-form-builder'));assert.equal(form.querySelector('[name=enabled]'),null);
 form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await until(()=>Boolean(failure));assert.match(failure.message,/présentation est enregistrée/);assert.equal(saleWrites[0].tournament_id,1);assert.equal(saleWrites[0].enabled,true);
 form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await until(()=>saleWrites.length===2);assert.equal(eventWrites.length,2);assert.equal(eventWrites[1].version,2);assert.equal(saleWrites[1].version,2);
 await w.happyDOM.abort();w.close();
});

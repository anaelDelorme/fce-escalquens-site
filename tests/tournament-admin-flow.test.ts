import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {Window} from 'happy-dom';
import {TestDatabase} from './d1';
import {tournamentRoute,tournamentEnv} from '../src/tournaments/service';
import {findOrder,reconcile,settings} from '../src/shop/service';
import type {ShopEnv} from '../src/shop/service';

const common=readFileSync('public/shop-common.js','utf8').replace(/export /g,'');
const source=(name:string)=>readFileSync(`src/scripts/${name}.js`,'utf8').replace(/^import[\s\S]*?from [^;]+;\n?/gm,'').replace(/export /g,'');
const until=async(condition:()=>boolean)=>{const end=Date.now()+2000;while(!condition()&&Date.now()<end)await new Promise(r=>setTimeout(r,5));assert.ok(condition(),'Le parcours admin n’a pas abouti.');};

async function fixture(t:any) {
  const site=new TestDatabase(),orders=new TestDatabase(),tournaments=new TestDatabase(),tasks:Promise<unknown>[]=[],messages:any[]=[];
  for(const [db,directory] of [[orders,'migrations-orders'],[tournaments,'migrations-tournaments']] as const)for(const file of readdirSync(directory).filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync(directory+'/'+file,'utf8'));
  await orders.exec(`UPDATE settings SET data='{"contact_email":"club@example.org","organization_slug":"fc-escalquens"}'`);
  await tournaments.exec("INSERT INTO module_imports VALUES('v5.2',1);INSERT INTO tournaments(id,slug,name,starts_on,status) VALUES(1,'futsal','Futsal','2027-01-01','open')");
  const id='11111111-1111-4111-8111-111111111111';
  await tournaments.prepare("INSERT INTO orders(id,reference,request_hash,token_hash,token_expires,email,first_name,last_name,phone,delivery_method,total_cents,terms_version,terms_snapshot,terms_accepted_at,created_at,updated_at,kind) VALUES(?,'FCE-T-TEST','hash','token',9999999999,'contact@example.org','Camille','Exemple','0612345678','club',15000,'v1','Conditions',1,1,1,'tournament')").bind(id).run();
  const sections=[{section:'U11',quantity:2,participating:true},{section:'U13F',quantity:1,participating:true},{section:'U15',quantity:0,participating:false}];
  await tournaments.prepare("INSERT INTO tournament_registrations(order_id,tournament_id,tournament_name,club_name,team_name,category,payment_choice,payment_deadline,created_at,sections_json,team_count,payment_method,cheque_snapshot) VALUES(?,1,'Futsal','Club exemple','3 équipes','U11, U13F','later',9999999999,1,?,3,'cheque','Chèque à l’ordre du FCE')").bind(id,JSON.stringify(sections)).run();
  const env={DB:site,ORDERS:orders,TOURNAMENTS:tournaments,APP_ENV:'local',SHOP_ORIGIN:'http://localhost:8787',DEV_ADMIN_TOKEN:'local-test',TRACKING_SECRET:'a'.repeat(64),MAIL_PROVIDER:'cloudflare',MAIL_FROM:'club@example.org',MAIL_TEST_TO:'test@example.org',EMAIL:{send:async(message:any)=>{messages.push(message);return {messageId:'simulated'};}}} as unknown as ShopEnv;
  const w=new Window({url:'http://localhost:8787/admin-tournois/'}),calls:{path:string;method:string}[]=[];
  w.HTMLElement.prototype.scrollIntoView=function(){};
  w.document.write('<p id="tournament-environment"></p><p id="tournament-admin-message"></p><div id="tournament-admin" data-page="registrations"></div>');
  w.fetch=(async(path:any,options:any={})=>{
    const url=new URL(String(path),w.location.href),headers=new Headers(options.headers);
    headers.set('x-admin-token','local-test');headers.set('origin',w.location.origin);
    calls.push({path:url.pathname,method:options.method||'GET'});
    const response=await tournamentRoute(new Request(url,{...options,headers}),env,{waitUntil(p:Promise<unknown>){tasks.push(p);}} as any);
    assert.ok(response);return response;
  }) as any;
  t.after(async()=>{await Promise.allSettled(tasks);await w.happyDOM.abort();w.close();site.close();orders.close();tournaments.close();});
  w.eval(common+'\n'+source('tournament-form-fields')+'\n'+source('admin-tournaments'));
  await until(()=>Boolean(w.document.querySelector('[data-order]')));
  return {w,tournaments,id,calls,env,messages,tasks};
}

test('fiche réelle : ouverture depuis la liste et les catégories, chèque reçu et annulation accessibles',async t=>{
  const f=await fixture(t),d=f.w.document;
  d.querySelector<HTMLElement>('[data-order]')!.click();
  await until(()=>Boolean(d.querySelector('#registration-detail form')));
  assert.match(d.querySelector('#registration-detail')!.textContent!,/En attente de confirmation/);
  d.querySelector<HTMLElement>('#close-registration-detail')!.click();
  d.querySelector<HTMLElement>('[data-category-order]')!.click();
  await until(()=>Boolean(d.querySelector('[data-cheque-received]')));
  d.querySelector<HTMLElement>('[data-cheque-received]')!.click();
  await until(()=>Boolean(d.querySelector('#registration-detail form'))&&!d.querySelector('[data-cheque-received]'));
  assert.equal((await f.tournaments.prepare('SELECT payment_status FROM orders WHERE id=?').bind(f.id).first<any>()).payment_status,'paid');
  assert.equal(f.calls.filter(c=>c.method==='POST'&&c.path.endsWith('/cheque-received')).length,1);
  const form=d.querySelector<HTMLFormElement>('#registration-detail form.commerce-form-grid')!;
  (form.elements.namedItem('registration_status') as HTMLSelectElement).value='cancelled';
  form.dispatchEvent(new f.w.Event('submit',{cancelable:true,bubbles:true}));
  await until(()=>{const updated=d.querySelector<HTMLFormElement>('#registration-detail form.commerce-form-grid');return Boolean(updated&&updated!==form&&d.querySelector('#registration-table')!.textContent!.includes('Annulée'));});
  assert.equal((await f.tournaments.prepare('SELECT registration_status FROM tournament_registrations WHERE order_id=?').bind(f.id).first<any>()).registration_status,'cancelled');
  assert.equal((await f.tournaments.prepare('SELECT payment_status FROM orders WHERE id=?').bind(f.id).first<any>()).payment_status,'paid');
  await Promise.allSettled(f.tasks);
  const cancellation=f.messages.find(m=>m.subject.includes('inscription est annulée'));assert.ok(cancellation);assert.doesNotMatch(cancellation.text,/Règlement par chèque/);
});

test('CSV réel : une ligne par catégorie avec quantité, montants sans doublon et filtre respecté',async t=>{
  const f=await fixture(t),d=f.w.document;
  let blob:any,filename='';
  f.w.URL.createObjectURL=(value:any)=>{blob=value;return 'blob:csv-test';};f.w.URL.revokeObjectURL=()=>{};
  f.w.HTMLAnchorElement.prototype.click=function(){filename=this.download;};
  async function csvRows(){
    d.querySelector<HTMLElement>('#export-registrations')!.click();
    const lines=(await blob.text()).replace(/^\uFEFF/,'').split('\r\n').map((line:string)=>line.split(';').map(cell=>cell.slice(1,-1).replaceAll('""','"')));
    return lines.slice(1).map((row:string[])=>Object.fromEntries(lines[0].map((key:string,i:number)=>[key,row[i]])));
  }
  const rows=await csvRows();assert.equal(filename,'inscriptions-tournoi-1.csv');assert.equal(rows.length,2);
  assert.deepEqual(rows.map((r:any)=>[r.category,Number(r.nb_equipes)]),[['U11',2],['U13F',1]]);
  assert.equal(rows.reduce((n:number,r:any)=>n+Number(r.nb_equipes),0),3);
  assert.equal(rows.reduce((n:number,r:any)=>n+Number(r.total_cents),0),15000);
  assert.ok(rows.every((r:any)=>r.registration_total_cents==='15000'));
  assert.deepEqual(rows.map((r:any)=>r.team_name),['2 équipes','1 équipe']);
  const category=d.querySelector<HTMLSelectElement>('#category-filter')!;category.value='U11';category.dispatchEvent(new f.w.Event('change'));
  const filtered=await csvRows();assert.equal(filtered.length,1);assert.equal(filtered[0].category,'U11');assert.equal(filtered[0].nb_equipes,'2');assert.equal(filtered[0].total_cents,'10000');
});

test('retirer une inscription annulée : disparition du suivi et du CSV, restauration et historique de paiement conservé',async t=>{
  const f=await fixture(t),d=f.w.document;
  await f.tournaments.exec("UPDATE orders SET payment_status='paid',paid_at=1,fulfillment='cancelled';UPDATE tournament_registrations SET registration_status='cancelled',payment_method='helloasso';INSERT INTO checkout_attempts(id,order_id,intent_id,state,created_at) VALUES('attempt','11111111-1111-4111-8111-111111111111',17,'completed',1);INSERT INTO payments VALUES(31,'11111111-1111-4111-8111-111111111111','attempt','Authorized',15000,0,1)");
  const history=JSON.stringify((await f.tournaments.prepare('SELECT * FROM payments').all()).results);
  d.querySelector<HTMLElement>('[data-order]')!.click();await until(()=>Boolean(d.querySelector('[data-archive-registration]')));
  d.querySelector<HTMLElement>('[data-archive-registration]')!.click();
  await until(()=>!d.querySelector('#registration-table [data-order]'));
  assert.equal(d.querySelector<HTMLButtonElement>('#export-registrations')!.disabled,true);
  assert.equal((await f.tournaments.prepare('SELECT payment_status FROM orders').first<any>()).payment_status,'paid');
  assert.equal(JSON.stringify((await f.tournaments.prepare('SELECT * FROM payments').all()).results),history);
  const archived=await f.tournaments.prepare('SELECT archived_at,archived_by FROM tournament_registrations').first<any>();assert.ok(archived.archived_at);assert.equal(archived.archived_by,'local-admin');
  const checkbox=d.querySelector<HTMLInputElement>('#include-archived')!;checkbox.checked=true;checkbox.dispatchEvent(new f.w.Event('change'));
  await until(()=>Boolean(d.querySelector('#registration-table [data-order]')));assert.match(d.querySelector('#registration-table')!.textContent!,/Retirée du suivi/);
  d.querySelector<HTMLElement>('[data-order]')!.click();await until(()=>Boolean(d.querySelector('[data-archive-registration]')));
  assert.equal(d.querySelector('[data-archive-registration]')!.textContent,'Remettre dans le suivi');
  d.querySelector<HTMLElement>('[data-archive-registration]')!.click();await until(()=>!d.querySelector('#registration-detail [data-archive-registration]'));
  assert.equal((await f.tournaments.prepare('SELECT archived_at FROM tournament_registrations').first<any>()).archived_at,null);
  assert.equal((await f.tournaments.prepare('SELECT registration_status FROM tournament_registrations').first<any>()).registration_status,'cancelled');
  assert.equal(JSON.stringify((await f.tournaments.prepare('SELECT * FROM payments').all()).results),history);
  assert.deepEqual((await f.tournaments.prepare('SELECT kind FROM order_events ORDER BY kind').all<any>()).results.map((r:any)=>r.kind),['archived','restored']);assert.equal(f.messages.length,0);
});

test('retrait : inscription active, origine étrangère et accès sans autorisation refusés ; concurrence versionnée',async t=>{
  const f=await fixture(t),url=`http://localhost:8787/admin-tournois/api/registrations/${f.id}/archive`;
  const request=(headers:any,data:any={version:0,archived:true})=>new Request(url,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(data)});
  const unauthorized=await tournamentRoute(request({origin:'http://localhost:8787'}),f.env,{waitUntil(){}} as any);assert.notEqual(unauthorized!.status,200);
  const foreign=await tournamentRoute(request({'x-admin-token':'local-test',origin:'https://other.example'}),f.env,{waitUntil(){}} as any);assert.equal(foreign!.status,403);
  const post=async(data:any)=>f.w.fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
  assert.equal((await post({version:0,archived:true})).status,409);assert.equal((await post({version:0,archived:'true'})).status,400);
  await f.tournaments.exec("UPDATE tournament_registrations SET registration_status='cancelled'");
  assert.equal((await post({version:99,archived:true})).status,409);
  const outcomes=await Promise.all([post({version:0,archived:true}),post({version:0,archived:true})]);assert.deepEqual(outcomes.map(r=>r.status).sort(),[200,409]);
  assert.equal((await f.tournaments.prepare('SELECT COUNT(*) AS n FROM order_events').first<any>()).n,1);
});

test('vérification HelloAsso : attente, temporisation, paiement confirmé et erreur affichés dans la fiche',async t=>{
  const f=await fixture(t),d=f.w.document;let paid=false,providerError=false,reads=0;
  f.env.HELLOASSO_CLIENT_ID='fake-client';f.env.HELLOASSO_CLIENT_SECRET='fake-secret';
  await f.tournaments.prepare("UPDATE tournament_registrations SET payment_method='helloasso'").run();
  await f.tournaments.prepare("INSERT INTO checkout_attempts(id,order_id,intent_id,state,created_at) VALUES('attempt',?,17,'pending',?)").bind(f.id,Math.floor(Date.now()/1000)).run();
  t.mock.method(globalThis,'fetch',async(url:any,options:any={})=>{
    if(String(url).endsWith('/oauth2/token'))return Response.json({access_token:'fake',expires_in:1800});
    assert.equal(options.method,'GET');assert.match(String(url),/checkout-intents\/17$/);reads++;
    if(providerError)return Response.json({message:'PRIVATE_PROVIDER_DETAILS'},{status:503});
    return Response.json({id:17,...(paid?{order:{id:29,organizationSlug:'fc-escalquens',formType:'Checkout',checkoutIntentId:17,amount:{total:15000},payments:[{id:31,state:'Authorized',amount:15000}]}}:{})});
  });
  d.querySelector<HTMLElement>('[data-order]')!.click();await until(()=>Boolean(d.querySelector('[data-reconcile]')));
  d.querySelector<HTMLElement>('[data-reconcile]')!.click();await until(()=>/ne confirme pas encore/.test(d.querySelector('#helloasso-verification-result')?.textContent||''));assert.equal(reads,1);
  d.querySelector<HTMLElement>('[data-reconcile]')!.click();await until(()=>/en cours/.test(d.querySelector('#helloasso-verification-result')?.textContent||'')&&!/Vérification HelloAsso en cours/.test(d.querySelector('#helloasso-verification-result')?.textContent||''));assert.equal(reads,1);
  paid=true;await f.tournaments.exec('UPDATE orders SET last_checked=0');
  d.querySelector<HTMLElement>('[data-reconcile]')!.click();await until(()=>/confirme le paiement/.test(d.querySelector('#helloasso-verification-result')?.textContent||''));assert.equal(reads,2);assert.equal((await f.tournaments.prepare('SELECT payment_status FROM orders').first<any>()).payment_status,'paid');
  providerError=true;await f.tournaments.exec('UPDATE orders SET last_checked=0');
  d.querySelector<HTMLElement>('[data-reconcile]')!.click();await until(()=>/momentanément indisponible/.test(d.querySelector('#helloasso-verification-result')?.textContent||''));assert.doesNotMatch(d.querySelector('#helloasso-verification-result')!.textContent!,/PRIVATE_PROVIDER_DETAILS/);assert.equal((await f.tournaments.prepare('SELECT payment_status FROM orders').first<any>()).payment_status,'paid');
});

test('vérification sans référence et règlement par chèque : résultat explicite, paiement existant préservé',async t=>{
  const f=await fixture(t),d=f.w.document;
  await f.tournaments.exec("UPDATE orders SET payment_status='paid',paid_at=1");
  d.querySelector<HTMLElement>('[data-order]')!.click();await until(()=>Boolean(d.querySelector('#registration-detail form')));assert.equal(d.querySelector('[data-reconcile]'),null);
  const env=tournamentEnv(f.env),s=await settings(env),result=await reconcile(env,s,f.id);assert.deepEqual(result,{checked:false,reason:'cheque'});assert.equal((await findOrder(env,f.id)).payment_status,'paid');
  await f.tournaments.exec("UPDATE orders SET last_checked=0;UPDATE tournament_registrations SET payment_method='helloasso'");
  const response=await f.w.fetch(`/admin-tournois/api/registrations/${f.id}/reconcile`,{method:'POST'});const body=await response.json() as any;
  assert.equal(body.verification.checked,false);assert.match(body.verification.message,/Aucune référence/);assert.equal(body.order.payment_status,'paid');
});

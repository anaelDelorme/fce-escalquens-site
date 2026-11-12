import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {TestDatabase} from './d1';
import {checkout,settings,type ShopEnv} from '../src/shop/service';
import {connectionStatus} from '../src/shop/helloasso';
import {tournamentEnv} from '../src/tournaments/service';

async function fixture(t:any){
 const site=new TestDatabase(),orders=new TestDatabase(),tournaments=new TestDatabase();
 for(const [db,directory] of [[orders,'migrations-orders'],[tournaments,'migrations-tournaments']] as const)for(const file of readdirSync(directory).filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync(directory+'/'+file,'utf8'));
 await orders.exec(`UPDATE settings SET data='{"organization_slug":"fc-escalquens"}'`);
 await tournaments.exec(`UPDATE settings SET data='{"organization_slug":"obsolete-tournament-slug"}'`);
 const env={APP_ENV:'production',SHOP_ORIGIN:'https://example.org',HELLOASSO_CLIENT_ID:'test-client',HELLOASSO_CLIENT_SECRET:'test-secret',TRACKING_SECRET:'x'.repeat(64),DB:site,ORDERS:orders,TOURNAMENTS:tournaments} as unknown as ShopEnv;
 t.after(()=>{site.close();orders.close();tournaments.close();});
 async function order(db:TestDatabase,kind:string){
  const id=crypto.randomUUID();
  await db.prepare("INSERT INTO orders(id,reference,request_hash,token_hash,token_expires,email,first_name,last_name,phone,delivery_method,total_cents,terms_version,terms_snapshot,terms_accepted_at,created_at,updated_at,kind) VALUES(?,?,?,?,9999999999,'payeur@example.org','Prénom','Nom','0612345678','club',5000,'test','Conditions',1,1,1,?)")
   .bind(id,'FCE-'+id,'hash-'+id,'token-'+id,kind).run();
  return (await db.prepare('SELECT * FROM orders WHERE id=?').bind(id).first())!;
 }
 return {env,orders,tournaments,order};
}
test('HelloAsso : boutique et tournois créent leur demande avec la même association et le même compte production',async t=>{
 const f=await fixture(t),requests:any[]=[],tEnv=tournamentEnv(f.env);let oauth=0;
 t.mock.method(globalThis,'fetch',async(url:any,options:any={})=>{
  if(String(url).endsWith('/oauth2/token')){oauth++;return Response.json({access_token:'fake-access-token',expires_in:1800});}
  requests.push({url:String(url),method:options.method,body:JSON.parse(options.body)});
  return Response.json({id:requests.length,redirectUrl:'https://www.helloasso.com/checkout/test'});
 });
 await checkout(f.env,await settings(f.env),await f.order(f.orders,'shop'),'private-tracking-link');
 await checkout(tEnv,await settings(tEnv),await f.order(f.tournaments,'tournament'),'private-tracking-link');
 assert.equal(oauth,1);assert.equal(requests.length,2);
 for(const r of requests){assert.equal(r.url,'https://api.helloasso.com/v5/organizations/fc-escalquens/checkout-intents');assert.equal(r.method,'POST');assert.equal(r.body.totalAmount,5000);assert.equal(r.body.initialAmount,5000);assert.equal(r.body.containsDonation,false);assert.doesNotMatch(JSON.stringify(r.body),/private-tracking-link|obsolete-tournament-slug/);}
 assert.match(requests[0].body.returnUrl,/context=boutique/);assert.match(requests[1].body.returnUrl,/context=tournois/);
 assert.equal((await f.orders.prepare('SELECT COUNT(*) AS n FROM checkout_attempts').first<any>()).n,1);assert.equal((await f.tournaments.prepare('SELECT COUNT(*) AS n FROM checkout_attempts').first<any>()).n,1);
});
test('HelloAsso : connexion en lecture réussie puis Checkout interdit, HTTP 403 précis sans données du payeur',async t=>{
 const f=await fixture(t),env=tournamentEnv(f.env),order=await f.order(f.tournaments,'tournament');let attempts=0;
 t.mock.method(globalThis,'fetch',async(url:any,options:any={})=>{
  const path=String(url);
  if(path.endsWith('/oauth2/token'))return Response.json({access_token:'fake-access-token',expires_in:1800});
  if(path.endsWith('/users/me/organizations'))return Response.json([{organizationSlug:'fc-escalquens'}]);
  if(path.endsWith('/organizations/fc-escalquens'))return Response.json({isCashInCompliant:true});
  assert.equal(options.method,'POST');attempts++;
  return Response.json({message:'PRIVATE_PROVIDER_DETAILS payeur@example.org secret-token'},{status:403});
 });
 assert.equal((await connectionStatus(env,'fc-escalquens')).can_receive_payments,true);
 const s=await settings(env);
 await assert.rejects(()=>checkout(env,s,order,'private-token'),(error:any)=>{assert.equal(error.code,'HELLOASSO_REJECTED');assert.match(error.message,/HTTP 403/);assert.match(error.message,/autorisation Checkout/);assert.doesNotMatch(error.message,/PRIVATE_PROVIDER_DETAILS|payeur@example.org|secret-token/);return true;});
 assert.equal(attempts,1);
 assert.equal((await f.tournaments.prepare('SELECT state FROM checkout_attempts').first<any>()).state,'failed');
 assert.equal((await f.tournaments.prepare('SELECT payment_status FROM orders').first<any>()).payment_status,'pending');
});
test('HelloAsso : données rejetées distinctes des droits, délais incertains sans seconde création',async t=>{
 for(const status of [400,422]){
  const f=await fixture(t),env=tournamentEnv(f.env),order=await f.order(f.tournaments,'tournament');let attempts=0;
  const mock=t.mock.method(globalThis,'fetch',async(url:any)=>{
   if(String(url).endsWith('/oauth2/token'))return Response.json({access_token:'fake-access-token',expires_in:1800});
   attempts++;return Response.json({message:'PRIVATE_PROVIDER_DETAILS'},{status});
  });
  const s=await settings(env);
  await assert.rejects(()=>checkout(env,s,order,'private-token'),(error:any)=>{assert.equal(error.code,'HELLOASSO_REJECTED');assert.match(error.message,new RegExp('HTTP '+status));assert.match(error.message,/informations de la demande/);assert.doesNotMatch(error.message,/PRIVATE_PROVIDER_DETAILS|autorisation Checkout/);return true;});
  assert.equal(attempts,1);assert.equal((await f.tournaments.prepare('SELECT state FROM checkout_attempts').first<any>()).state,'failed');mock.mock.restore();
 }
 const f=await fixture(t),env=tournamentEnv(f.env),order=await f.order(f.tournaments,'tournament');let attempts=0;
 t.mock.method(globalThis,'fetch',async(url:any)=>{if(String(url).endsWith('/oauth2/token'))return Response.json({access_token:'fake-access-token',expires_in:1800});attempts++;throw new DOMException('PRIVATE_PROVIDER_DETAILS','TimeoutError');});
 const s=await settings(env);
 await assert.rejects(()=>checkout(env,s,order,'private-token'));
 await assert.rejects(()=>checkout(env,s,order,'private-token'),(error:any)=>error.code==='PAYMENT_UNCERTAIN');
 assert.equal(attempts,1);assert.equal((await f.tournaments.prepare('SELECT state FROM checkout_attempts').first<any>()).state,'uncertain');
});

test('HelloAsso : HTTP 400 conservé avec le champ du payeur, une seule demande et aucun montant ou statut modifié',async t=>{
 const f=await fixture(t),order=await f.order(f.orders,'shop');let requests=0;
 t.mock.method(globalThis,'fetch',async(url:any)=>{if(String(url).endsWith('/oauth2/token'))return Response.json({access_token:'fake-token',expires_in:1800});requests++;return Response.json({errors:{'payer.firstName':['PRIVATE_PAYER_VALUE secret@example.org TOKEN']}},{status:400});});
 const before=await f.orders.prepare('SELECT * FROM orders').all(),s=await settings(f.env);
 await assert.rejects(()=>checkout(f.env,s,order,'private-token'),(error:any)=>{assert.match(error.message,/Prénom du payeur/);assert.doesNotMatch(error.message,/PRIVATE_|secret@|TOKEN/);return true;});
 assert.equal(requests,1);const attempt=await f.orders.prepare('SELECT state,last_error FROM checkout_attempts').first<any>();assert.deepEqual({...attempt},{state:'failed',last_error:'HELLOASSO_REJECTED:400:first_name'});
 assert.deepEqual(await f.orders.prepare('SELECT * FROM orders').all(),before);assert.equal((await f.orders.prepare('SELECT COUNT(*) AS n FROM payments').first<any>()).n,0);
});

test('HelloAsso : ancien paiement actif ou déjà payé repris sans revalider ni modifier son identité',async t=>{
 const f=await fixture(t),order=await f.order(f.orders,'shop');let requests=0;
 await f.orders.prepare("UPDATE orders SET first_name='123',phone='......',payment_status='paid' WHERE id=?").bind(order.id).run();
 let saved=await f.orders.prepare('SELECT * FROM orders WHERE id=?').bind(order.id).first<any>();
 t.mock.method(globalThis,'fetch',async(url:any)=>{requests++;if(String(url).endsWith('/oauth2/token'))return Response.json({access_token:'fake',expires_in:1800});return Response.json({id:789,redirectUrl:'https://www.helloasso.com/checkout/existing'});});
 assert.deepEqual(await checkout(f.env,await settings(f.env),saved,'token'),{paid:true});assert.equal(requests,0);
 await f.orders.prepare("UPDATE orders SET payment_status='pending',last_checked=0 WHERE id=?").bind(order.id).run();await f.orders.prepare("INSERT INTO checkout_attempts(id,order_id,intent_id,state,created_at) VALUES('existing',?,789,'pending',?)").bind(order.id,Math.floor(Date.now()/1000)).run();
 saved=await f.orders.prepare('SELECT * FROM orders WHERE id=?').bind(order.id).first<any>();
 assert.deepEqual(await checkout(f.env,await settings(f.env),saved,'token'),{redirect_url:'https://www.helloasso.com/checkout/existing'});
 assert.equal((await f.orders.prepare('SELECT COUNT(*) AS n FROM checkout_attempts').first<any>()).n,1);
 assert.equal((await f.orders.prepare('SELECT first_name FROM orders').first<any>()).first_name,'123');
});

test('annulation client : commande sans paiement annulée une seule fois et reprise interdite',async t=>{
 const f=await fixture(t),order=await f.order(f.orders,'shop'),s=await settings(f.env);
 const {cancelCustomerOrder}=await import('../src/shop/service');
 const result=await cancelCustomerOrder(f.env,s,order);
 assert.equal(result.order.fulfillment,'cancelled');
 const saved=await f.orders.prepare('SELECT * FROM orders WHERE id=?').bind(order.id).first<any>();
 assert.equal((await cancelCustomerOrder(f.env,s,saved)).order.fulfillment,'cancelled');
 assert.equal((await f.orders.prepare('SELECT COUNT(*) AS n FROM order_events WHERE order_id=?').bind(order.id).first<any>()).n,1);
 await assert.rejects(()=>checkout(f.env,s,saved,'token'),(e:any)=>e.code==='ORDER_CANCELLED');
});

test('annulation client : refus des commandes payées, incertaines et en cours de création',async t=>{
 const f=await fixture(t),s=await settings(f.env);
 const {cancelCustomerOrder}=await import('../src/shop/service');
 for(const state of ['paid','review','creating','uncertain']){
  const order=await f.order(f.orders,'shop');
  if(['paid','review'].includes(state)){
   await f.orders.prepare('UPDATE orders SET payment_status=? WHERE id=?').bind(state,order.id).run();order.payment_status=state;
  }else await f.orders.prepare('INSERT INTO checkout_attempts(id,order_id,state,created_at) VALUES(?,?,?,1)').bind(crypto.randomUUID(),order.id,state).run();
  await assert.rejects(()=>cancelCustomerOrder(f.env,s,order),(e:any)=>['CANCEL_PAYMENT','PAYMENT_UNCERTAIN'].includes(e.code));
  assert.equal((await f.orders.prepare('SELECT fulfillment FROM orders WHERE id=?').bind(order.id).first<any>()).fulfillment,'new');
 }
});

test('annulation client : abandon HelloAsso vérifié, références conservées pour un paiement tardif',async t=>{
 const f=await fixture(t),order=await f.order(f.orders,'shop'),s=await settings(f.env),attempt=crypto.randomUUID();
 const {cancelCustomerOrder,reconcile}=await import('../src/shop/service');
 await f.orders.prepare("INSERT INTO checkout_attempts(id,order_id,intent_id,state,created_at) VALUES(?,?,987,'pending',?)").bind(attempt,order.id,Math.floor(Date.now()/1000)).run();
 let paid=false;
 t.mock.method(globalThis,'fetch',async(url:any)=>{
  if(String(url).endsWith('/oauth2/token'))return Response.json({access_token:'fake-token',expires_in:1800});
  if(String(url).endsWith('/checkout-intents/987'))return Response.json({id:987,metadata:{order_id:order.id,attempt_id:attempt},...(paid?{order:{id:654,organizationSlug:'fc-escalquens',formType:'Checkout',checkoutIntentId:987,amount:{total:5000},payments:[{id:321,state:'Authorized',amount:5000}]}}:{})});
  if(String(url).endsWith('/orders/654'))return Response.json({id:654,organizationSlug:'fc-escalquens',checkoutIntentId:987,metadata:{order_id:order.id,attempt_id:attempt},payments:[{id:321,state:'Authorized',amount:5000}]});
  throw Error('Unexpected provider request');
 });
 assert.equal((await cancelCustomerOrder(f.env,s,order)).order.fulfillment,'cancelled');
 assert.equal((await f.orders.prepare('SELECT intent_id FROM checkout_attempts WHERE id=?').bind(attempt).first<any>()).intent_id,987);
 paid=true;await f.orders.prepare('UPDATE orders SET last_checked=0 WHERE id=?').bind(order.id).run();
 await reconcile(f.env,s,order.id);
 const saved=await f.orders.prepare('SELECT * FROM orders WHERE id=?').bind(order.id).first<any>();
 assert.equal(saved.fulfillment,'cancelled');assert.equal(saved.payment_status,'review');
 assert.equal((await f.orders.prepare("SELECT COUNT(*) AS n FROM outbox WHERE order_id=? AND kind='paid'").bind(order.id).first<any>()).n,0);
});

test('annulation API : lien personnel et origine exigés, paiement détecté avant annulation',async t=>{
 const f=await fixture(t),order=await f.order(f.orders,'shop');
 const {shopRoute}=await import('../src/shop/service');const {sha256}=await import('../src/shop/domain');
 const token='a'.repeat(64);await f.orders.prepare('UPDATE orders SET token_hash=? WHERE id=?').bind(await sha256(token),order.id).run();
 const call=async(auth:string,origin='https://example.org')=>{
  const response=await shopRoute(new Request(`https://example.org/api/shop/orders/${order.id}/cancel`,{method:'POST',headers:{origin,authorization:`Bearer ${auth}`,'content-type':'application/json'},body:'{}'}),f.env,{} as ExecutionContext);
  assert.ok(response);return {status:response.status,data:await response.json() as any};
 };
 assert.equal((await call('b'.repeat(64))).status,404);
 assert.equal((await call(token,'https://foreign.example')).status,403);
 const cancelled=await call(token);assert.equal(cancelled.status,200);assert.equal(cancelled.data.order.fulfillment,'cancelled');
});

test('annulation : indisponibilité HelloAsso ou paiement confirmé ne libèrent pas la commande',async t=>{
 const f=await fixture(t),s=await settings(f.env);const {cancelCustomerOrder}=await import('../src/shop/service');let paid=false;
 t.mock.method(globalThis,'fetch',async(url:any)=>{
  if(String(url).endsWith('/oauth2/token'))return Response.json({access_token:'fake-token',expires_in:1800});
  if(!paid)return new Response('',{status:503});
  return Response.json({id:456,order:{id:765,organizationSlug:'fc-escalquens',formType:'Checkout',amount:{total:5000},payments:[{id:45678,state:'Authorized',amount:5000}]}});
 });
 for(const confirmed of [false,true]){
  paid=confirmed;const order=await f.order(f.orders,'shop');
  await f.orders.prepare("INSERT INTO checkout_attempts(id,order_id,intent_id,state,created_at) VALUES(?,?,?,'pending',?)").bind(crypto.randomUUID(),order.id,confirmed?456:457,Math.floor(Date.now()/1000)).run();
  await assert.rejects(()=>cancelCustomerOrder(f.env,s,order),(e:any)=>confirmed?e.code==='CANCEL_PAYMENT':e.code==='HELLOASSO_UNAVAILABLE');
  assert.equal((await f.orders.prepare('SELECT fulfillment FROM orders WHERE id=?').bind(order.id).first<any>()).fulfillment,'new');
 }
});

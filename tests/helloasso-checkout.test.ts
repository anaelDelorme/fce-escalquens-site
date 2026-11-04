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

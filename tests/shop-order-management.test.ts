import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {Window} from 'happy-dom';
import {TestDatabase} from './d1';
import {shopRoute,checkout,settings,findOrder,type ShopEnv} from '../src/shop/service';
import {tournamentRoute,tournamentEnv} from '../src/tournaments/service';

const source=(name:string)=>readFileSync(`src/scripts/${name}.js`,'utf8').replace(/^import[\s\S]*?from [^;]+;\n?/gm,'').replace(/export /g,'');
const until=async(test:()=>boolean)=>{const end=Date.now()+2500;while(!test()&&Date.now()<end)await new Promise(r=>setTimeout(r,5));assert.ok(test(),'Le parcours d’administration n’a pas abouti.');};
async function fixture(t:any){
  const site=new TestDatabase(),orders=new TestDatabase(),tournaments=new TestDatabase();
  for(const [db,directory] of [[orders,'migrations-orders'],[tournaments,'migrations-tournaments']] as const)for(const file of readdirSync(directory).filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync(directory+'/'+file,'utf8'));
  await site.exec('CREATE TABLE shop_settings(id INTEGER PRIMARY KEY,shop_enabled INTEGER);INSERT INTO shop_settings VALUES(1,0)');
  await tournaments.exec("INSERT INTO module_imports VALUES('v5.2',1)");
  await orders.exec(`UPDATE settings SET data='{"organization_slug":"fc-escalquens"}'`);
  const env={DB:site,ORDERS:orders,TOURNAMENTS:tournaments,APP_ENV:'local',SHOP_ORIGIN:'http://localhost:8787',DEV_ADMIN_TOKEN:'local-test',HELLOASSO_CLIENT_ID:'fake',HELLOASSO_CLIENT_SECRET:'fake',TRACKING_SECRET:'x'.repeat(64),CF_ACCESS_ISSUER:'https://unit.cloudflareaccess.com',CF_ACCESS_SHOP_AUD:'shop',CF_ACCESS_TOURNAMENT_AUD:'tournament'} as unknown as ShopEnv;
  t.after(()=>{site.close();orders.close();tournaments.close();});
  async function seed(kind='shop',fulfillment='new',payment='pending',first='Camille (coach u10)'){
    const db=kind==='shop'?orders:tournaments,id=crypto.randomUUID();
    await db.prepare("INSERT INTO orders(id,reference,kind,request_hash,token_hash,token_expires,email,first_name,last_name,phone,delivery_method,total_cents,payment_status,fulfillment,terms_version,terms_snapshot,terms_accepted_at,created_at,updated_at) VALUES(?,?,?,?,?,9999999999,'client@example.org',?,'Exemple','0612345678','club',9000,?,?,'v1','Conditions',1,1,1)")
      .bind(id,'FCE-'+id,kind,'original-hash','token-'+id,first,payment,fulfillment).run();
    await db.prepare("INSERT INTO order_items(id,order_id,product_id,variant_id,name,sku,supplier,size,color,options_json,unit_cents,quantity) VALUES(?,?,1,'variant','Article','REF','Fournisseur','M','Bordeaux','[{\"label\":\"Initiales\",\"text\":\"CE\"}]',4500,2)").bind('item-'+id,id).run();
    if(kind==='tournament')await db.prepare("INSERT INTO tournament_registrations(order_id,tournament_id,tournament_name,club_name,team_name,category,payment_choice,payment_deadline,created_at,registration_status) VALUES(?,1,'Tournoi','Club','Équipe','U11','later',9999999999,1,?)").bind(id,fulfillment==='cancelled'?'cancelled':'pending').run();
    return {id,db,kind};
  }
  const ctx={waitUntil(){assert.fail('Cette action ne doit envoyer aucun mail ni programmer de paiement.');}} as any;
  async function request(kind:string,path:string,data?:any,admin=true,origin='http://localhost:8787'){
    const url='http://localhost:8787'+(kind==='shop'?'/admin-boutique/api/':'/admin-tournois/api/')+path;
    const req=new Request(url,{method:data?'POST':'GET',headers:{...(admin?{'x-admin-token':'local-test'}:{}),...(data?{origin,'content-type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});
    const res=kind==='shop'?await shopRoute(req,env,ctx):await tournamentRoute(req,env,ctx);assert.ok(res);return {status:res.status,body:await res.json() as any};
  }
  const saved=(o:any)=>findOrder(o.kind==='shop'?env:tournamentEnv(env),o.id);
  return {site,orders,tournaments,env,seed,request,saved};
}
const snapshot=async(db:TestDatabase,id:string)=>JSON.stringify(await Promise.all(['order_items','checkout_attempts','payments','outbox'].map(async table=>[table,(await db.prepare('SELECT * FROM '+table+' WHERE order_id=? ORDER BY rowid').bind(id).all()).results])));

test('commande annulée : retrait et remise dans le suivi, export filtré, paiement et articles conservés',async t=>{
  const f=await fixture(t),o=await f.seed('shop','cancelled','paid');
  await o.db.prepare("INSERT INTO checkout_attempts(id,order_id,intent_id,state,created_at) VALUES('attempt',?,123,'completed',1)").bind(o.id).run();
  await o.db.prepare("INSERT INTO payments(id,order_id,attempt_id,state,amount_cents,updated_at) VALUES(456,?,'attempt','Authorized',9000,1)").bind(o.id).run();
  const before=await snapshot(o.db,o.id),order=await f.saved(o);
  assert.equal((await f.request('shop',`orders/${o.id}/archive`,{version:0,archived:true})).status,200);
  let saved=await f.saved(o);const archive=(await f.request('shop',`orders/${o.id}`)).body.order;assert.ok(archive.archived_at);assert.equal(archive.archived_by,'local-admin');assert.equal(saved.payment_status,'paid');assert.equal(saved.fulfillment,'cancelled');
  for(const key of ['reference','email','request_hash','token_hash','total_cents','paid_at','closed_at'])assert.equal(saved[key],order[key]);
  assert.equal((await f.request('shop','orders')).body.orders.length,0);assert.equal((await f.request('shop','orders/export')).body.orders.length,0);
  assert.equal((await f.request('shop','orders?include_archived=1')).body.orders.length,1);assert.equal((await f.request('shop','orders/export?include_archived=1')).body.orders.length,1);
  assert.equal((await f.request('shop',`orders/${o.id}/archive`,{version:saved.version,archived:false})).status,200);
  saved=await f.saved(o);assert.equal((await f.request('shop',`orders/${o.id}`)).body.order.archived_at,null);assert.equal(saved.fulfillment,'cancelled');assert.equal((await f.request('shop','orders')).body.orders.length,1);
  assert.equal(await snapshot(o.db,o.id),before);
  const events=(await o.db.prepare('SELECT kind FROM order_events WHERE order_id=? ORDER BY rowid').bind(o.id).all<any>()).results.map(r=>r.kind);assert.deepEqual(events,['archived','restored']);
});

test('retrait du suivi : annulation, droits, origine, type et version contrôlés ; une seule mutation concurrente',async t=>{
  const f=await fixture(t),o=await f.seed(),path=`orders/${o.id}/archive`;
  assert.equal((await f.request('shop',path,{version:0,archived:true})).status,409);
  await o.db.prepare("UPDATE orders SET fulfillment='cancelled' WHERE id=?").bind(o.id).run();
  assert.equal((await f.request('shop',path,{version:0,archived:true},false)).status,401);assert.equal((await f.request('shop',path,{version:0,archived:true},true,'https://attacker.example')).status,403);
  assert.equal((await f.request('shop',path,{version:0,archived:'true'})).status,400);assert.equal((await f.request('shop',path,{version:9,archived:true})).status,409);
  const results=await Promise.all([f.request('shop',path,{version:0,archived:true}),f.request('shop',path,{version:0,archived:true})]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  assert.equal((await o.db.prepare('SELECT COUNT(*) AS n FROM order_events').first<any>()).n,1);
});

test('boutique et tournois : correction manuelle du payeur après refus, même commande et seul nouveau paiement demandé explicitement',async t=>{
  const f=await fixture(t),calls:any[]=[];
  t.mock.method(globalThis,'fetch',async(url:any,options:any={})=>{if(String(url).endsWith('/oauth2/token'))return Response.json({access_token:'fake',expires_in:1800});calls.push(JSON.parse(options.body));return Response.json({id:100+calls.length,redirectUrl:'https://www.helloasso-sandbox.com/checkout/example'});});
  for(const kind of ['shop','tournament']){
    const o=await f.seed(kind),before=await snapshot(o.db,o.id),order=await f.saved(o),count=calls.length;
    const prefix=kind==='shop'?'orders':'registrations';
    const res=await f.request(kind,`${prefix}/${o.id}/payer`,{version:0,first_name:'Camille',last_name:'Exemple'});assert.equal(res.status,200);assert.equal(calls.length,count);
    const saved=await f.saved(o);assert.equal(saved.first_name,'Camille');assert.equal(saved.last_name,'Exemple');assert.equal(saved.version,1);
    for(const key of ['id','reference','request_hash','token_hash','email','phone','total_cents','payment_status','fulfillment'])assert.equal(saved[key],order[key]);
    assert.equal(await snapshot(o.db,o.id),before);
    const scoped=kind==='shop'?f.env:tournamentEnv(f.env);await checkout(scoped,await settings(scoped),saved,'existing-private-token');
    assert.equal(calls.length,count+1);assert.equal(calls.at(-1).payer.firstName,'Camille');assert.equal(calls.at(-1).totalAmount,9000);assert.equal(calls.at(-1).metadata.order_id,o.id);
    assert.equal((await o.db.prepare('SELECT COUNT(*) AS n FROM orders').first<any>()).n,1);assert.equal((await o.db.prepare('SELECT COUNT(*) AS n FROM payments').first<any>()).n,0);
  }
});

test('correction du payeur : refus après paiement, intention ou état incertain, montant/destinataire immuables, contrôle de version',async t=>{
  const f=await fixture(t);
  for(const kind of ['shop','tournament']){
    const o=await f.seed(kind),prefix=kind==='shop'?'orders':'registrations',path=`${prefix}/${o.id}/payer`,data={version:0,first_name:'Camille',last_name:'Exemple'};
    assert.equal((await f.request(kind,path,data,false)).status,401);assert.equal((await f.request(kind,path,data,true,'https://attacker.example')).status,403);
    for(const extra of [{total_cents:1},{email:'other@example.org'}])assert.equal((await f.request(kind,path,{...data,...extra})).status,400);
    assert.equal((await f.request(kind,path,{...data,first_name:'Camille (coach u10)'})).status,400);assert.equal((await f.request(kind,path,{...data,version:9})).status,409);
    await o.db.prepare("UPDATE orders SET payment_status='paid' WHERE id=?").bind(o.id).run();assert.equal((await f.request(kind,path,data)).status,409);
    await o.db.prepare("UPDATE orders SET payment_status='pending' WHERE id=?").bind(o.id).run();
    for(const [state,intent] of [['creating',null],['uncertain',null],['failed',123],['expired',123]] as const){
      await o.db.prepare('INSERT INTO checkout_attempts(id,order_id,state,intent_id,created_at) VALUES(?,?,?,?,1)').bind('test',o.id,state,intent).run();assert.equal((await f.request(kind,path,data)).status,409);await o.db.prepare("DELETE FROM checkout_attempts WHERE id='test'").run();
    }
    await o.db.prepare("INSERT INTO checkout_attempts(id,order_id,state,created_at) VALUES('paid-attempt',?,'failed',1)").bind(o.id).run();
    await o.db.prepare("INSERT INTO payments(id,order_id,attempt_id,state,amount_cents,updated_at) VALUES(999,?,'paid-attempt','Authorized',9000,1)").bind(o.id).run();
    assert.equal((await f.request(kind,path,data)).status,409);
    assert.equal((await o.db.prepare('SELECT COUNT(*) AS n FROM order_events').first<any>()).n,0);assert.equal((await f.saved(o)).first_name,'Camille (coach u10)');
  }
});

test('correction concurrente : une ancienne lecture ne peut lancer un paiement avec le nom précédent',async t=>{
  const f=await fixture(t),o=await f.seed('shop','new','pending','Camille'),old=await f.saved(o);
  t.mock.method(globalThis,'fetch',()=>assert.fail('Aucun appel HelloAsso avant relecture de la commande corrigée.'));
  assert.equal((await f.request('shop',`orders/${o.id}/payer`,{version:0,first_name:'Anne-Marie',last_name:'Exemple'})).status,200);
  const s=await settings(f.env);await assert.rejects(()=>checkout(f.env,s,old,'token'),(e:any)=>e.code==='ORDER_CHANGED');
  assert.equal((await o.db.prepare('SELECT COUNT(*) AS n FROM checkout_attempts').first<any>()).n,0);assert.equal((await f.saved(o)).first_name,'Anne-Marie');
});

test('administration boutique et vraie API : retrait depuis la fiche, filtre et restauration accessibles',async t=>{
  const f=await fixture(t),o=await f.seed('shop','cancelled','paid'),w=new Window({url:'http://localhost:8787/admin-boutique/'}),d=w.document;
  t.after(async()=>{await w.happyDOM.abort();w.close();});w.HTMLElement.prototype.scrollIntoView=function(){};w.sessionStorage.setItem('fce-shop-local-token',JSON.stringify('local-test'));
  d.write('<main class="commerce-admin" data-page="orders"><div id="shop-environment"></div><p id="admin-shop-message"></p><div id="admin-shop-content"></div></main>');
  w.fetch=(async(path:any,options:any={})=>{const result=await f.request('shop',String(path).replace('/admin-boutique/api/',''),options.body?JSON.parse(options.body):undefined);return Response.json(result.body,{status:result.status});}) as any;
  w.eval(readFileSync('public/shop-common.js','utf8').replace(/export /g,'')+'\n'+readFileSync('public/shop-contact.js','utf8').replace(/export /g,'')+'\n'+source('admin-shop-exports')+'\n'+source('admin-shop-visibility')+'\n'+source('admin-shop'));
  await until(()=>Boolean(d.querySelector('[data-order]')));d.querySelector<HTMLElement>('[data-order]')!.click();await until(()=>Boolean(d.querySelector('[data-archive-order]')));
  d.querySelector<HTMLElement>('[data-archive-order]')!.click();await until(()=>Boolean(d.querySelector('#empty-reset-orders')));assert.equal(d.querySelector('#order-detail')!.textContent,'');assert.equal(d.querySelector<HTMLButtonElement>('[data-export-orders=csv]')!.disabled,true);
  const form=d.querySelector<HTMLFormElement>('#order-filters')!;(form.elements.namedItem('include_archived') as HTMLInputElement).checked=true;form.dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));
  await until(()=>Boolean(d.querySelector('[data-order]')));assert.match(d.querySelector('#orders-list')!.textContent!,/Retirée du suivi/);
  d.querySelector<HTMLElement>('[data-order]')!.click();await until(()=>d.querySelector('[data-archive-order]')?.textContent==='Remettre dans le suivi');d.querySelector<HTMLElement>('[data-archive-order]')!.click();
  await until(()=>!d.querySelector('#orders-list')!.textContent!.includes('Retirée du suivi')&&!d.querySelector('[data-archive-order]'));
  assert.equal((await f.request('shop',`orders/${o.id}`)).body.order.archived_at,null);assert.equal((await f.saved(o)).fulfillment,'cancelled');
});

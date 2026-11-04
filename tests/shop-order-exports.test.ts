import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {Window} from 'happy-dom';
import {TestDatabase} from './d1';
import {shopRoute,type ShopEnv} from '../src/shop/service';
import worker from '../src/worker';
import {ordersCsv,collectOrderExport} from '../src/scripts/admin-shop-exports.js';

const source=(name:string)=>readFileSync(`src/scripts/${name}.js`,'utf8').replace(/^import[\s\S]*?from [^;]+;\n?/gm,'').replace(/export /g,'');
const until=async(test:()=>boolean)=>{const end=Date.now()+3000;while(!test()&&Date.now()<end)await new Promise(r=>setTimeout(r,5));assert.ok(test(),'Le téléchargement n’a pas abouti.');};
async function fixture(t:any){
  const orders=new TestDatabase(),site=new TestDatabase();
  for(const file of readdirSync('migrations-orders').filter(f=>f.endsWith('.sql')).sort())await orders.exec(readFileSync('migrations-orders/'+file,'utf8'));
  await site.exec('CREATE TABLE shop_settings(id INTEGER PRIMARY KEY,shop_enabled INTEGER);INSERT INTO shop_settings VALUES(1,0)');
  for(let i=0;i<71;i++){
    const id=`00000000-0000-4000-8000-${i.toString(16).padStart(12,'0')}`;
    await orders.prepare("INSERT INTO orders(id,reference,request_hash,token_hash,token_expires,email,first_name,last_name,phone,licensed_name,team,delivery_method,total_cents,terms_version,terms_snapshot,terms_accepted_at,created_at,updated_at,payment_status,fulfillment,kind,internal_note) VALUES(?,?,?,?,1,?,'Camille',?,'0612345678','Léa','U13','club',4750,'v1','Conditions',1,1700000000,1700000000,?,?,?,'Note privée à exclure')")
      .bind(id,`FCE-EXPORT-${i}`,'hash','secret-'+i,`contact-${i}@example.org`,i===68?'Autre':'Durand',i===66?'pending':'paid',i===67?'cancelled':i===69?'ready':'new',i===70?'tournament':'shop').run();
    await orders.prepare("INSERT INTO order_items(id,order_id,product_id,variant_id,name,sku,supplier,size,color,options_json,unit_cents,quantity) VALUES(?,?,1,'variant','Maillot','SKU-PRIVE','Intersport','M','Bordeaux',?,1750,2)")
      .bind(id+'-1',id,JSON.stringify([{label:'Initiales',text:'CD";\nDeuxième ligne'}])).run();
    await orders.prepare("INSERT INTO order_items(id,order_id,product_id,variant_id,name,sku,supplier,size,color,options_json,unit_cents,quantity) VALUES(?,?,2,'sac','Sac','SKU-SAC','Kappa','Unique','','[]',1250,1)").bind(id+'-2',id).run();
  }
  const env={DB:site,ORDERS:orders,APP_ENV:'local',DEV_ADMIN_TOKEN:'local-test',SHOP_ORIGIN:'http://localhost:8787',CF_ACCESS_ISSUER:'https://test.cloudflareaccess.com',CF_ACCESS_SHOP_AUD:'shop'} as unknown as ShopEnv;
  const calls:string[]=[];
  async function request(path:string,admin=true){
    const response=await shopRoute(new Request('http://localhost:8787/admin-boutique/api/'+path,{headers:admin?{'x-admin-token':'local-test'}:{}}),env,{waitUntil(){assert.fail('Un export ne doit pas programmer de mail.');}} as any);
    assert.ok(response);return response;
  }
  const call=async(path:string)=>{calls.push(path);const response=await request(path);const data=await response.json() as any;if(!response.ok)throw new Error(data.error);return data;};
  t.after(()=>{orders.close();site.close();});
  return {orders,site,env,request,call,calls};
}

test('exports dans le Worker : base strictement en lecture, paiements existants et file mail conservés, aucun appel externe',async t=>{
  const f=await fixture(t),id='00000000-0000-4000-8000-000000000000';
  await f.orders.prepare("INSERT INTO checkout_attempts(id,order_id,intent_id,state,created_at) VALUES('existing-attempt',?,123,'completed',1700000000)").bind(id).run();
  await f.orders.prepare("INSERT INTO payments(id,order_id,attempt_id,state,amount_cents,updated_at) VALUES(456,?,'existing-attempt','Authorized',4750,1700000000)").bind(id).run();
  await f.orders.prepare("INSERT INTO order_events(id,order_id,kind,actor,message,created_at) VALUES('event',?,'paid','helloasso','Paiement confirmé',1700000000)").bind(id).run();
  await f.orders.prepare("INSERT INTO outbox(id,order_id,kind,status,available_at) VALUES('mail',?,'paid','pending',1700000000)").bind(id).run();
  const snapshot=()=>[f.orders,f.site].map(db=>db.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map((row:any)=>[row.name,db.db.prepare(`SELECT * FROM "${row.name}" ORDER BY rowid`).all()]));
  const before=JSON.stringify(snapshot());
  await f.orders.exec('PRAGMA query_only=ON');await f.site.exec('PRAGMA query_only=ON');
  t.mock.method(globalThis,'fetch',()=>assert.fail('Les exports ne doivent pas contacter HelloAsso ou un transport mail.'));
  const ctx={waitUntil(){assert.fail('Les exports ne doivent pas programmer de tâche de fond.');}} as any;
  const request=async(path:string)=>{
    const response=await worker.fetch(new Request('http://localhost:8787/admin-boutique/api/'+path,{headers:{'x-admin-token':'local-test'}}),f.env as any,ctx);
    assert.equal(response.status,200);return response.json();
  };
  const csv=await collectOrderExport(request,'orders/export',{q:'Durand'});
  const pdf=await collectOrderExport(request,'orders/purchase-orders',{q:'Durand'});
  assert.equal(csv.orders.length,69);assert.equal(pdf.orders.length,67);
  assert.equal(JSON.stringify(snapshot()),before,'Aucune table de production ne doit être modifiée par un export.');
});

test('exports boutique : mêmes filtres que la liste, toutes les pages et dates identiques sans doublon',async t=>{
  const f=await fixture(t),filters={q:'Durand',payment:'paid',fulfillment:'new'};
  const before=JSON.stringify((await f.orders.prepare('SELECT * FROM orders ORDER BY id').all()).results);
  const list=[];let page=0,result;
  do{result=await f.call('orders?'+new URLSearchParams({...filters,page:String(page++)}));list.push(...result.orders);}while(result.has_more);
  assert.equal(list.length,66);
  const exported=await collectOrderExport(f.call,'orders/export',filters);
  assert.deepEqual(exported.orders.map((o:any)=>o.id),list.map(o=>o.id));
  assert.equal(new Set(exported.orders.map((o:any)=>o.id)).size,66);
  assert.ok(exported.orders.every((o:any)=>o.items.length===2));
  const csv=ordersCsv(exported.orders);
  assert.ok(csv.startsWith('\uFEFF"Référence";"Date de commande";"Nom";"Prénom"'));
  assert.match(csv,/"État de préparation";"État du paiement";"Détail de la commande"/);
  assert.match(csv,/"En préparation";"Payé"/);assert.match(csv,/2 × Maillot — M · Bordeaux — Initiales : CD"";\nDeuxième ligne/);
  assert.match(csv,/1 × Sac/);assert.match(csv,/"3";"47,50";"Au club"/);
  assert.doesNotMatch(csv,/secret-|Note privée|SKU-PRIVE|FCE-EXPORT-6[6789]|FCE-EXPORT-70/);
  assert.equal(JSON.stringify((await f.orders.prepare('SELECT * FROM orders ORDER BY id').all()).results),before);
  assert.equal((await f.orders.prepare('SELECT COUNT(*) AS n FROM outbox').first<any>()).n,0);
  assert.equal((await f.orders.prepare('SELECT COUNT(*) AS n FROM order_events').first<any>()).n,0);
});

test('bons groupés : uniquement les commandes payées non annulées de la recherche, données fournisseur minimisées',async t=>{
  const f=await fixture(t);
  const data=await collectOrderExport(f.call,'orders/purchase-orders',{q:'Durand',payment:'',fulfillment:''});
  assert.equal(data.orders.length,67);
  const refs=data.orders.map((o:any)=>o.order.reference);
  assert.ok(refs.includes('FCE-EXPORT-69'));assert.ok(!refs.includes('FCE-EXPORT-66'));assert.ok(!refs.includes('FCE-EXPORT-67'));assert.ok(!refs.includes('FCE-EXPORT-68'));assert.ok(!refs.includes('FCE-EXPORT-70'));
  assert.ok(data.orders.every((o:any)=>o.order.last_name==='Durand'&&o.items.length===2));
  assert.doesNotMatch(JSON.stringify(data.orders),/contact-\d+@|0612345678|unit_cents|total_cents|SKU-|secret-|Note privée|created_at/);
  assert.equal((await f.request('orders/export',false)).status,401);assert.equal((await f.request('orders/purchase-orders',false)).status,401);
  assert.equal((await f.request('orders/export?cursor=invalide')).status,400);
  assert.equal((await f.request('orders/purchase-orders?cursor=9999999999999999:00000000-0000-4000-8000-000000000000')).status,400);
  const empty=await f.request('orders/export?q='+encodeURIComponent("' OR 1=1 --"));assert.equal(empty.status,200);assert.deepEqual((await empty.json() as any).orders,[]);
  const privateResponse=await f.request('orders/export');assert.match(privateResponse.headers.get('cache-control')||'',/no-store/);
});

test('CSV boutique : champs dangereux neutralisés et export interrompu sans fichier partiel',async()=>{
  const csv=ordersCsv([{reference:'=1+1',created_at:1700000000,last_name:'  +SOMME(1;2)',first_name:'@client',email:'\t=1',phone:'-123',licensed_name:'"Léa"',items:[],total_cents:1234,fulfillment:'cancelled',payment_status:'refunded',delivery_method:'coach'}]);
  assert.match(csv,/"'=1\+1"/);assert.match(csv,/"'  \+SOMME\(1;2\)"/);assert.match(csv,/"'@client"/);assert.match(csv,/"'\t=1"/);assert.match(csv,/"'-123"/);assert.match(csv,/""Léa""/);assert.match(csv,/"Annulée";"Remboursé"/);assert.match(csv,/"12,34"/);
  let calls=0;
  await assert.rejects(collectOrderExport(async()=>{if(++calls===1)return {orders:[{}],next_cursor:'suite'};throw new Error('Session expirée');},'orders/export',{}),/Session expirée/);
  await assert.rejects(collectOrderExport(async()=>({orders:[],next_cursor:'boucle'}),'orders/export',{}),/pas pu être terminé/);
});

test('CSV boutique DOM et vraie API : recherche appliquée exportée au-delà de la pagination, saisie non appliquée ignorée',async t=>{
  const f=await fixture(t),w=new Window({url:'http://localhost:8787/admin-boutique/'}),d=w.document;
  t.after(async()=>{await w.happyDOM.abort();w.close();});
  w.sessionStorage.setItem('fce-shop-local-token',JSON.stringify('local-test'));
  d.write('<main class="commerce-admin" data-page="orders"><div id="shop-environment"></div><p id="admin-shop-message"></p><div id="admin-shop-content"></div></main>');
  w.fetch=(async(path:any)=>f.request(String(path).replace('/admin-boutique/api/',''))) as any;
  let blob:any,filename='';w.URL.createObjectURL=(value:any)=>{blob=value;return 'blob:export';};w.URL.revokeObjectURL=()=>{};
  w.HTMLAnchorElement.prototype.click=function(){filename=this.download;};
  w.eval(readFileSync('public/shop-common.js','utf8').replace(/export /g,'')+'\n'+source('admin-shop-exports')+'\n'+source('admin-shop-visibility')+'\n'+source('admin-shop'));
  await until(()=>Boolean(d.querySelector('[data-export-orders=csv]')));
  const form=d.querySelector<HTMLFormElement>('#order-filters')!;
  (form.elements.namedItem('q') as HTMLInputElement).value='Durand';(form.elements.namedItem('payment') as HTMLSelectElement).value='paid';
  (form.elements.namedItem('fulfillment') as HTMLSelectElement).value='new';form.dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));
  await until(()=>d.querySelector('[data-order-filter=prepare]')?.getAttribute('aria-pressed')==='false'&&!d.querySelector('#orders-list')!.hasAttribute('aria-busy'));
  (form.elements.namedItem('q') as HTMLInputElement).value='Autre';
  d.querySelector<HTMLElement>('[data-export-orders=csv]')!.click();
  await until(()=>Boolean(blob));
  const csv=await blob.text();assert.match(filename,/^commandes-boutique-\d{4}-\d{2}-\d{2}\.csv$/);
  assert.equal((csv.match(/"FCE-EXPORT-/g)||[]).length,66);assert.doesNotMatch(csv,/FCE-EXPORT-68/);
  assert.match(d.querySelector('#admin-shop-message')!.textContent!,/66 commandes/);
  (form.elements.namedItem('q') as HTMLInputElement).value='Introuvable';form.dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));
  await until(()=>Boolean(d.querySelector('#empty-reset-orders')));
  assert.equal(d.querySelector<HTMLButtonElement>('[data-export-orders=csv]')!.disabled,true);assert.equal(d.querySelector<HTMLButtonElement>('[data-export-orders=pdf]')!.disabled,true);
});

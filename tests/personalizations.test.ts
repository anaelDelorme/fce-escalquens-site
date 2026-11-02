import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {TestDatabase} from './d1';
import {shopRoute,type ShopEnv} from '../src/shop/service';
import {priceCart} from '../src/shop/domain';

async function fixture(t:any){
 const DB=new TestDatabase(),ORDERS=new TestDatabase();t.after(()=>{DB.close();ORDERS.close();});
 for(const name of ['0018_shop.sql','0023_shop_content_and_sponsor_packages.sql','0029_shop_checkout.sql','0030_shop_suppliers.sql','0033_shop_reference_coach_prices.sql','0034_shop_variant_order.sql'])await DB.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
 for(const name of readdirSync(new URL('../migrations-orders/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())await ORDERS.exec(readFileSync(new URL('../migrations-orders/'+name,import.meta.url),'utf8'));
 await DB.exec("INSERT INTO shop_categories(id,slug,name) VALUES(1,'textile','Textile');INSERT INTO shop_products(id,slug,name,image_key,shop_category_id) VALUES(1,'maillot','Maillot','m.webp',1),(2,'short','Short','s.webp',1),(3,'sac','Sac','sac.webp',1);");
 const ids=Array.from({length:4},()=>crypto.randomUUID());
 for(let i=0;i<3;i++)await DB.prepare("INSERT INTO shop_options(id,product_id,label,price_cents,requires_text,max_length,active) VALUES(?,?,'Initiales',200,1,4,?)").bind(ids[i],i+1,i===2?0:1).run();
 await DB.prepare("INSERT INTO shop_options(id,product_id,label,price_cents,requires_text,max_length) VALUES(?,3,'Initiales',500,1,4)").bind(ids[3]).run();
 const duplicateId=crypto.randomUUID();
 await DB.prepare("INSERT INTO shop_options(id,product_id,label,price_cents,requires_text,max_length,active) VALUES(?,1,'Initiales',200,1,4,0)").bind(duplicateId).run();
 for(const id of [1,2,3])await DB.prepare("INSERT INTO shop_variants(id,product_id,label,size,sku,price_cents) VALUES(?,?,'M','M','',1000)").bind(`v${id}`,id).run();
 await DB.exec(readFileSync(new URL('../migrations/0035_shared_personalizations.sql',import.meta.url),'utf8'));
 const env={DB,ORDERS,APP_ENV:'local',DEV_ADMIN_TOKEN:'test',SHOP_ORIGIN:'http://localhost:8787',TRACKING_SECRET:'x'.repeat(64)} as unknown as ShopEnv;
 const call=async(path:string,data?:any,{admin=true,origin='http://localhost:8787'}={})=>{
  const request=new Request(`http://localhost:8787${path.startsWith('/api/')?path:'/admin-boutique/api/'+path}`,{method:data===undefined?'GET':'PUT',headers:{origin,...(admin?{'x-admin-token':'test'}:{}),'content-type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)})});
  const result=await shopRoute(request,env,{waitUntil(){}} as any);assert.ok(result);return {status:result.status,body:await result.json() as any};
 };
 return {DB,call,ids};
}

test('migration : définitions identiques regroupées, tarifs différents et activations conservés',async t=>{
 const {DB,call,ids}=await fixture(t);
 const definitions=(await call('personalizations')).body.personalizations;
 assert.equal(definitions.length,2);assert.equal(definitions.find((p:any)=>p.price_cents===200).article_count,2);
 const links=(await DB.prepare('SELECT * FROM shop_options ORDER BY product_id').all<any>()).results;
 assert.equal(links.length,4);assert.equal(links.find(o=>o.id===ids[0]).active,1);assert.equal(links.find(o=>o.id===ids[2]).active,0);
 assert.equal(links[0].personalization_id,links[1].personalization_id);
 assert.equal((await DB.prepare('PRAGMA foreign_key_check').all()).results.length,0);
 assert.throws(()=>DB.db.exec(`INSERT INTO shop_options VALUES('duplicate',1,'${links[0].personalization_id}',1)`));
});

test('tarif commun : catalogue et total serveur actualisés pour plusieurs articles, instantané précédent conservé',async t=>{
 const {call}=await fixture(t),list=(await call('personalizations')).body.personalizations;
 const p=list.find((p:any)=>p.price_cents===200);
 const before=(await call('/api/shop/catalogue')).body;
 const lines=before.products.filter((p:any)=>p.id<3).map((p:any)=>({variant_id:`v${p.id}`,quantity:1,options:[{id:before.options.find((o:any)=>o.product_id===p.id).id,text:'AD',price_cents:0}]}));
 const original=priceCart(lines,before.variants,before.options,before.products);assert.equal(original.total,2400);
 assert.equal((await call('personalizations',{...p,active:true,requires_text:true,price_cents:350})).status,200);
 const after=(await call('/api/shop/catalogue')).body;
 assert.equal(priceCart(lines,after.variants,after.options,after.products).total,2700);
 assert.equal(original.total,2400);assert.equal(original.items[0].options[0].price_cents,200);
 assert.ok(after.options.filter((o:any)=>o.product_id<3).every((o:any)=>o.price_cents===350));
 const forged=[{variant_id:'v3',quantity:1,options:[{id:before.options.find((o:any)=>o.product_id===1).id,text:'AD'}]}];
 assert.throws(()=>priceCart(forged,after.variants,after.options,after.products));
});

test('associations : zéro à plusieurs choix, identifiants stables et désactivation globale réversible',async t=>{
 const {call}=await fixture(t),initial=(await call('personalizations')).body.personalizations.find((p:any)=>p.price_cents===200);
 const created=await call('personalizations',{label:'Logo',price_cents:0,requires_text:false,max_length:4,active:true});assert.equal(created.status,200);
 const id=created.body.id;
 let cat=(await call('catalogue')).body;
 const oldLink=cat.options.find((o:any)=>o.product_id===1).id;
 const save=async(ids:string[])=>{const version=cat.products.find((p:any)=>p.id===1).personalizations_version;const result=await call('products/1/personalizations',{version,personalization_ids:ids});cat=(await call('catalogue')).body;return result;};
 assert.equal((await save([initial.id,id])).status,200);
 assert.equal(cat.options.filter((o:any)=>o.product_id===1&&o.active).length,2);
 assert.equal((await save([])).status,200);assert.equal((await call('/api/shop/catalogue')).body.options.filter((o:any)=>o.product_id===1).length,0);
 assert.equal((await save([initial.id])).status,200);assert.equal(cat.options.find((o:any)=>o.product_id===1&&o.active).id,oldLink);
 assert.equal((await call('personalizations',{...initial,active:false,requires_text:true})).status,200);
 assert.equal((await call('/api/shop/catalogue')).body.options.filter((o:any)=>o.personalization_id===initial.id).length,0);
 assert.equal((await call('personalizations',{...initial,version:initial.version+1,active:true,requires_text:true})).status,200);
 assert.equal((await call('/api/shop/catalogue')).body.options.filter((o:any)=>o.personalization_id===initial.id).length,2);
});

test('sécurité et concurrence : accès contrôlé, montants invalides et sélections périmées refusés sans écriture',async t=>{
 const {call,DB}=await fixture(t),p=(await call('personalizations')).body.personalizations[0];
 assert.ok([401,403,503].includes((await call('personalizations',undefined,{admin:false})).status));
 assert.equal((await call('personalizations',{...p,active:true},{origin:'https://other.example'})).status,403);
 for(const price_cents of [-1,1.5,100001])assert.equal((await call('personalizations',{...p,active:true,price_cents})).status,400);
 assert.equal((await call('personalizations',{...p,active:true,price_cents:400})).status,200);
 assert.equal((await call('personalizations',{...p,active:true,price_cents:500})).status,409);
 const snapshot=JSON.stringify((await DB.prepare('SELECT * FROM shop_options ORDER BY id').all()).results);
 for(const personalization_ids of [[p.id,p.id],[crypto.randomUUID()],['invalid']])assert.equal((await call('products/1/personalizations',{version:1,personalization_ids})).status,400);
 assert.equal(JSON.stringify((await DB.prepare('SELECT * FROM shop_options ORDER BY id').all()).results),snapshot);
 assert.equal((await call('products/1/personalizations',{version:1,personalization_ids:[]})).status,200);
 const concurrent=await call('products/1/personalizations',{version:1,personalization_ids:[p.id]});assert.equal(concurrent.status,409);
 assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM shop_options WHERE product_id=1 AND active=1').first<any>()).n,0);
 assert.equal((await call('products/999/personalizations',{version:1,personalization_ids:[]})).status,404);
 assert.equal((await call('options',{product_id:1})).status,410);
});

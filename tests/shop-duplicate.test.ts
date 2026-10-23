import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {TestDatabase} from './d1';
import {shopRoute,type ShopEnv} from '../src/shop/service';
import {uuid} from '../src/shop/domain';

async function fixture(t:any){
 const DB=new TestDatabase(),ORDERS=new TestDatabase();t.after(()=>{DB.close();ORDERS.close();});
 for(const file of ['0018_shop.sql','0023_shop_content_and_sponsor_packages.sql','0029_shop_checkout.sql','0030_shop_suppliers.sql','0033_shop_reference_coach_prices.sql','0034_shop_variant_order.sql'])await DB.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
 for(const file of readdirSync(new URL('../migrations-orders/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())await ORDERS.exec(readFileSync(new URL('../migrations-orders/'+file,import.meta.url),'utf8'));
 await DB.exec("INSERT INTO shop_categories(id,slug,name) VALUES(1,'textile','Textile');INSERT INTO shop_products(id,slug,name,shop_category_id,short_description,description,price_label,price_details,sizes,options,delivery_delay,image_key,featured,highlighted,display_order) VALUES(1,'maillot','Maillot',1,'Texte carte','Composition détaillée','25 €','Texte historique','6 ans, M','Initiales','3 semaines','photos/m.webp',1,1,7);");
 const supplier=(await DB.prepare('SELECT id FROM shop_suppliers LIMIT 1').first<any>()).id;
 for(const [i,size] of ['6 ans','M'].entries())await DB.prepare('INSERT INTO shop_variants(id,product_id,label,size,color,sku,supplier,supplier_id,price_cents,catalogue_price_cents,coach_price_cents,active,display_order) VALUES(?,1,?,?,\'Bordeaux\',\'ancienne-réf\',\'Intersport / Kappa\',?,2500,3500,1900,?,?)').bind(crypto.randomUUID(),size,size,supplier,i===0?1:0,1-i).run();
 await DB.prepare('INSERT INTO shop_options(id,product_id,label,price_cents,requires_text,max_length,active) VALUES(?,1,\'Initiales\',300,1,12,1),(?,1,\'Logo\',0,0,4,0)').bind(crypto.randomUUID(),crypto.randomUUID()).run();
 // Existing order and line snapshots are independent of the site catalogue.
 await ORDERS.exec("INSERT INTO orders(id,reference,request_hash,token_hash,token_expires,email,first_name,last_name,phone,delivery_method,total_cents,terms_version,terms_snapshot,terms_accepted_at,created_at,updated_at) VALUES('existing','FCE-TEST','hash','token',1,'client@example.org','A','B','0102030405','club',2800,'v1','conditions',1,1,1);INSERT INTO order_items(id,order_id,product_id,variant_id,name,sku,supplier,size,color,options_json,unit_cents,quantity) VALUES('item','existing',1,'old','Maillot','','Club','M','','[]',2800,1);");
 const env={DB,ORDERS,APP_ENV:'local',TRACKING_SECRET:'a'.repeat(64),DEV_ADMIN_TOKEN:'test',SHOP_ORIGIN:'http://localhost:8787'} as unknown as ShopEnv;
 const call=async(id:number,key:any=crypto.randomUUID(),{admin=true,origin='http://localhost:8787',method='POST'}={})=>{
  const request=new Request(`http://localhost:8787/admin-boutique/api/products/${id}/duplicate`,{method,headers:{...(admin?{'x-admin-token':'test'}:{}),origin,'content-type':'application/json'},...(method==='POST'?{body:JSON.stringify({idempotency_key:key})}:{})});
  const response=await shopRoute(request,env,{waitUntil(){}} as any);assert.ok(response);return {status:response.status,body:await response.json() as any};
 };
 const rows=async(table:string,product?:number)=>(await DB.prepare(`SELECT * FROM ${table}${product!==undefined?' WHERE product_id=?':''} ORDER BY id`).bind(...(product!==undefined?[product]:[])).all<any>()).results;
 return {DB,ORDERS,call,rows};
}

test('dupliquer : fiche complète masquée, nouveaux identifiants et tailles/trois prix/options indépendants',async t=>{
 const {DB,ORDERS,call,rows}=await fixture(t),source=(await rows('shop_products'))[0],before=JSON.stringify(await rows('shop_variants'));
 const orderBefore=JSON.stringify((await ORDERS.prepare('SELECT * FROM order_items').all()).results);
 const result=await call(1);assert.equal(result.status,201,JSON.stringify(result.body));const copy=(await rows('shop_products')).find(p=>p.id===result.body.id)!;
 assert.notEqual(copy.id,source.id);assert.notEqual(copy.slug,source.slug);assert.equal(copy.name,'Maillot (copie)');assert.equal(copy.active,0);assert.equal(copy.featured,0);assert.equal(copy.highlighted,0);
 for(const key of ['shop_category_id','short_description','description','price_label','price_details','sizes','options','delivery_delay','image_key','display_order'])assert.equal(copy[key],source[key],key);
 for(const table of ['shop_variants','shop_options']){
  const original=await rows(table,1),clones=await rows(table,copy.id);assert.equal(clones.length,original.length);
  for(const clone of clones){uuid(clone.id);assert.ok(!original.some(v=>v.id===clone.id));const row=original.find(v=>v.label===clone.label)!;for(const key of Object.keys(row).filter(k=>!['id','product_id'].includes(k)))assert.equal(clone[key],row[key],key);}
 }
 await DB.prepare('UPDATE shop_variants SET price_cents=1700 WHERE product_id=?').bind(copy.id).run();assert.equal(JSON.stringify(await rows('shop_variants',1)),before);
 await DB.prepare('UPDATE shop_options SET label=\'Autre texte\' WHERE product_id=?').bind(copy.id).run();assert.equal((await rows('shop_options',1)).filter(v=>v.label==='Initiales').length,1);
 assert.equal(JSON.stringify((await ORDERS.prepare('SELECT * FROM order_items').all()).results),orderBefore);
});

test('dupliquer : reprise et requêtes concurrentes ne créent qu’une copie complète',async t=>{
 const {call,rows}=await fixture(t),key=crypto.randomUUID();const [a,b]=await Promise.all([call(1,key),call(1,key)]);assert.ok([200,201].includes(a.status));assert.equal(a.body.id,b.body.id);
 assert.equal((await rows('shop_products')).length,2);assert.equal((await rows('shop_variants',a.body.id)).length,2);assert.equal((await rows('shop_options',a.body.id)).length,2);
 const again=await call(1,key);assert.equal(again.status,200);assert.equal(again.body.id,a.body.id);assert.equal((await rows('shop_products')).length,2);
 const next=await call(1);assert.equal(next.status,201);assert.notEqual(next.body.id,a.body.id);
});

test('dupliquer : échec en fin de transaction annule aussi la fiche et les tailles',async t=>{
 const {DB,call,rows}=await fixture(t),key=crypto.randomUUID();
 await DB.exec("CREATE TRIGGER reject_copy BEFORE INSERT ON shop_options WHEN NEW.product_id<>1 BEGIN SELECT RAISE(ABORT,'test rollback');END;");
 assert.equal((await call(1,key)).status,500);assert.equal((await rows('shop_products')).length,1);assert.equal((await rows('shop_variants')).length,2);assert.equal((await rows('shop_options')).length,2);
 await DB.exec('DROP TRIGGER reject_copy');assert.equal((await call(1,key)).status,201);assert.equal((await rows('shop_products')).length,2);
});

test('dupliquer : accès et origine contrôlés, article absent et clé invalide refusés, article simple conservé',async t=>{
 const {DB,call,rows}=await fixture(t);
 assert.ok([401,403,503].includes((await call(1,crypto.randomUUID(),{admin:false})).status));assert.equal((await call(1,crypto.randomUUID(),{origin:'https://other.example'})).status,403);
 assert.equal((await call(1,'bad')).status,400);assert.equal((await call(99)).status,404);assert.equal((await call(1,crypto.randomUUID(),{method:'GET'})).status,405);assert.equal((await rows('shop_products')).length,1);
 await DB.exec("INSERT INTO shop_products(id,slug,name,active) VALUES(2,'ancien','Ancien article',0)");const copied=await call(2);assert.equal(copied.status,201);assert.equal((await rows('shop_variants',copied.body.id)).length,0);assert.equal((await rows('shop_options',copied.body.id)).length,0);
});

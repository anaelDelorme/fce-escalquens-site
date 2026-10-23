import {body,rateLimit,response} from './security';
import {fail,uuid,type Row} from './domain';
import type {ShopEnv} from './service';

// Each copied size/customization gets a new UUID v4, generated inside the transaction.
const newUuid="lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-'||substr('89ab',(random()&3)+1,1)||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6)))";

export async function duplicateProduct(request:Request,env:ShopEnv,sourceId:number,actor:string){
 const data=await body(request),key=uuid(data.idempotency_key);
 await rateLimit(env,`duplicate-product:${actor}`,30,60);
 // A stable unique slug makes a retry return the existing copy, including after a lost response.
 const slug=`copie-${sourceId}-${key}`;
 const existing=()=>env.DB.prepare('SELECT id,name,active FROM shop_products WHERE slug=?').bind(slug).first<Row>();
 const prior=await existing();if(prior)return response({...prior,reused:true});
 if(!await env.DB.prepare('SELECT id FROM shop_products WHERE id=?').bind(sourceId).first())fail('PRODUCT_MISSING',404,'Cet article n’existe plus. Rechargez la liste.');
 const productFields=['shop_category_id','short_description','description','price_label','price_details','sizes','options','delivery_delay','image_key','display_order'];
 const variantFields=['label','size','color','sku','supplier','supplier_id','price_cents','catalogue_price_cents','coach_price_cents','active','display_order'];
 const optionFields=['label','price_cents','requires_text','max_length','active'];
 try{
  await env.DB.batch([
   env.DB.prepare(`INSERT INTO shop_products(slug,name,active,featured,highlighted,${productFields.join(',')}) SELECT ?,substr(name,1,990)||' (copie)',0,0,0,${productFields.join(',')} FROM shop_products WHERE id=?`).bind(slug,sourceId),
   env.DB.prepare(`INSERT INTO shop_variants(id,product_id,${variantFields.join(',')}) SELECT ${newUuid},(SELECT id FROM shop_products WHERE slug=?),${variantFields.join(',')} FROM shop_variants WHERE product_id=?`).bind(slug,sourceId),
   env.DB.prepare(`INSERT INTO shop_options(id,product_id,${optionFields.join(',')}) SELECT ${newUuid},(SELECT id FROM shop_products WHERE slug=?),${optionFields.join(',')} FROM shop_options WHERE product_id=?`).bind(slug,sourceId),
  ]);
 }catch(error){
  // Concurrent retries race on the unique slug; D1 rolls the failed batch back in full.
  const copied=await existing();if(copied)return response({...copied,reused:true});
  throw error;
 }
 const copied=await existing();if(!copied)fail('PRODUCT_MISSING',404,'L’article a été supprimé avant la copie. Rechargez la liste.');
 return response({...copied,reused:false},201);
}

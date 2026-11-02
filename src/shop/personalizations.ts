import {body,response} from './security';
import {fail,integer,text,uuid,type Row} from './domain';
import type {ShopEnv} from './service';

// Public option IDs belong to the article assignment. Definitions are always
// joined live so a shared price change also reaches checkout and catalogue PDF.
export const optionQuery = (publicOnly=false) => `SELECT o.id,o.product_id,o.personalization_id,o.active,
 p.label,p.price_cents,p.requires_text,p.max_length,p.active AS personalization_active
 FROM shop_options o JOIN shop_personalizations p ON p.id=o.personalization_id
 ${publicOnly?'WHERE o.active=1 AND p.active=1':''} ORDER BY o.product_id,p.label,o.id`;

export async function listPersonalizations(env:ShopEnv){
 return (await env.DB.prepare(`SELECT p.*,COUNT(o.id) AS article_count
 FROM shop_personalizations p LEFT JOIN shop_options o ON o.personalization_id=p.id AND o.active=1
 GROUP BY p.id ORDER BY p.label,p.price_cents,p.id`).all<Row>()).results;
}

export async function savePersonalization(request:Request,env:ShopEnv){
 const data=await body(request),id=data.id?uuid(data.id):crypto.randomUUID();
 const values=[text(data.label,120,true),integer(data.price_cents,0,100000),data.requires_text===true?1:0,integer(data.max_length,1,40),data.active===true?1:0];
 if(data.id){
  const result=await env.DB.prepare(`UPDATE shop_personalizations SET label=?,price_cents=?,requires_text=?,max_length=?,active=?,version=version+1 WHERE id=? AND version=?`)
   .bind(...values,id,integer(data.version,1,Number.MAX_SAFE_INTEGER)).run();
  if(!result.meta.changes)fail('PERSONALIZATION_CHANGED',409,'Cette personnalisation a changé. Rechargez la liste avant de modifier son tarif.');
 }else{
  await env.DB.prepare('INSERT INTO shop_personalizations(id,label,price_cents,requires_text,max_length,active) VALUES(?,?,?,?,?,?)').bind(id,...values).run();
 }
 return response({ok:true,id});
}

export async function assignPersonalizations(request:Request,env:ShopEnv,productId:number){
 const data=await body(request),version=integer(data.version,1,Number.MAX_SAFE_INTEGER);
 if(!Array.isArray(data.personalization_ids)||data.personalization_ids.length>100)fail('PERSONALIZATIONS',400,'Choisissez au maximum 100 personnalisations.');
 const ids=data.personalization_ids.map((id:unknown)=>uuid(id));
 if(new Set(ids).size!==ids.length)fail('PERSONALIZATIONS',400,'Une personnalisation est sélectionnée plusieurs fois.');
 if(!await env.DB.prepare('SELECT id FROM shop_products WHERE id=?').bind(productId).first())fail('PRODUCT',404,'Article introuvable.');
 if(ids.length){
  const found=await env.DB.prepare(`SELECT id FROM shop_personalizations WHERE id IN (${ids.map(()=>'?').join(',')})`).bind(...ids).all();
  if(found.results.length!==ids.length)fail('PERSONALIZATION_MISSING',400,'Une personnalisation n’existe plus. Rechargez la fiche.');
 }
 // The version guard covers every write in the atomic D1 batch. Disabled links
 // are retained so toggling an option off/on preserves its public selection ID.
 const guard='EXISTS(SELECT 1 FROM shop_products WHERE id=? AND personalizations_version=?)';
 const statements=[env.DB.prepare(`UPDATE shop_options SET active=0 WHERE product_id=? AND ${guard}`).bind(productId,productId,version)];
 for(const id of ids)statements.push(env.DB.prepare(`INSERT INTO shop_options(id,product_id,personalization_id,active)
  SELECT ?,?,?,1 WHERE ${guard} ON CONFLICT(product_id,personalization_id) DO UPDATE SET active=1`)
  .bind(crypto.randomUUID(),productId,id,productId,version));
 statements.push(env.DB.prepare('UPDATE shop_products SET personalizations_version=personalizations_version+1 WHERE id=? AND personalizations_version=?').bind(productId,version));
 const results=await env.DB.batch(statements);
 if(!results.at(-1)!.meta.changes)fail('PERSONALIZATIONS_CHANGED',409,'Les personnalisations de cet article ont changé. Rechargez la fiche avant de les enregistrer.');
 return response({ok:true,version:version+1});
}

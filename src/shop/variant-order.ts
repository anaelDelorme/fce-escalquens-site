import {body,response} from './security';
import {fail,integer,type Row} from './domain';
import {priceLabelStatement} from './catalogue-pricing';
import type {ShopEnv} from './service';
const letters=['XXXS','XXS','XS','S','M','L','XL','2XL','3XL','4XL','5XL','6XL'];
export function sizeKey(row:Row):[number,number,string] {
 const value=String(row.size||row.label||'').trim().toUpperCase();
 const age=value.match(/(\d+(?:[.,]\d+)?)\s*(?:ANS?|MOIS)\b/);
 if(age)return [0,Number(age[1].replace(',','.'))*(value.includes('MOIS')?1/12:1),value];
 const alpha=value.replace(/^ADULTES?\s*/,'').replace(/\bXXL\b/,'2XL').replace(/\bXXXL\b/,'3XL').replace(/\bXXXXL\b/,'4XL');
 const index=letters.indexOf(alpha);if(index>=0)return [1,index,value];
 const number=value.match(/^(?:ADULTES?\s*)?(\d+(?:[.,]\d+)?)$/);if(number)return [2,Number(number[1].replace(',','.')),value];
 return [3,0,value];
}
export function sortVariants<T extends Row>(variants:T[]):T[]{
 return [...variants].sort((a,b)=>{
  if(a.product_id!==b.product_id)return Number(a.product_id)-Number(b.product_id);
  if(a.display_order!=null||b.display_order!=null){const d=(a.display_order??100000)-(b.display_order??100000);if(d)return d;}
  const ak=sizeKey(a),bk=sizeKey(b);return ak[0]-bk[0]||ak[1]-bk[1]||ak[2].localeCompare(bk[2],'fr',{numeric:true})||String(a.id).localeCompare(String(b.id));
 });
}
// One product only; validation precedes a single atomic D1 batch.
export async function changeVariants(request:Request,env:ShopEnv,reorder=false){
 const data=await body(request),product=integer(data.product_id,1,Number.MAX_SAFE_INTEGER);
 const existing=(await env.DB.prepare('SELECT id FROM shop_variants WHERE product_id=?').bind(product).all<Row>()).results;
 if(!existing.length)fail('VARIANTS',400,'Cet article ne possède pas encore de tailles.');
 if(reorder&&data.action==='automatic'){
  await env.DB.prepare('UPDATE shop_variants SET display_order=NULL WHERE product_id=?').bind(product).run();return response({ok:true});
 }
 const ids=data.variant_ids;
 if(!Array.isArray(ids)||!ids.length||ids.length>100||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!existing.some(v=>v.id===id)))fail('VARIANTS',400,'Sélectionnez des tailles appartenant à cet article, sans doublon.');
 if(reorder){
  if(ids.length!==existing.length)fail('VARIANT_ORDER',409,'La liste des tailles a changé. Rechargez la fiche avant de les trier.');
  await env.DB.batch(ids.map((id,index)=>env.DB.prepare('UPDATE shop_variants SET display_order=? WHERE id=? AND product_id=?').bind(index,id,product)));
 } else {
  const prices=data.prices;if(!prices||typeof prices!=='object'||Array.isArray(prices))fail('PRICES',400,'Choisissez au moins un prix à modifier.');
  const allowed=['price_cents','catalogue_price_cents','coach_price_cents'];
  const keys=Object.keys(prices);if(!keys.length||keys.some(k=>!allowed.includes(k)))fail('PRICES',400,'Choisissez uniquement les tarifs à modifier.');
  const values=keys.map(key=>prices[key]===null&&key!=='price_cents'?null:integer(prices[key],1,1000000));
  await env.DB.batch([...ids.map(id=>env.DB.prepare(`UPDATE shop_variants SET ${keys.map(k=>k+'=?').join(',')} WHERE id=? AND product_id=?`).bind(...values,id,product)),priceLabelStatement(env.DB,product)]);
 }
 return response({ok:true,count:ids.length});
}

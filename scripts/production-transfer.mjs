import {createHash} from 'node:crypto';
import {quote} from './tournaments-transfer.mjs';

export const shopTables=['shop_categories','shop_suppliers','shop_personalizations','shop_products','shop_variants','shop_options','shop_settings','site_media'];
export const tournamentTables=['tournaments','tournament_sales','tournament_teams'];
const columns={
 shop_categories:['slug','name','description','display_order','active'],
 shop_suppliers:['id','name','contact_name','email','phone','address','notes','active'],
 shop_personalizations:['id','label','price_cents','requires_text','max_length','active','required'],
 shop_products:['slug','name','short_description','description','price_label','price_details','sizes','options','delivery_delay','image_key','featured','highlighted','active','display_order'],
 shop_variants:['id','label','size','color','sku','supplier','price_cents','catalogue_price_cents','coach_price_cents','active','display_order'],
 shop_options:['id','personalization_id','active'],
 tournaments:['slug','name','summary','starts_on','ends_on','venue','categories','status','tournify_url','organizer','registration_price'],
 tournament_sales:['fee_cents','allow_pay_later','capacity','registration_deadline','payment_deadline','terms','form_json','allow_cheque','cheque_payee','cheque_address','cheque_deadline'],
};
const rows=(bundle,table)=>bundle?.[table]||[];
const pick=(row,table)=>Object.fromEntries(columns[table].filter(k=>Object.hasOwn(row,k)).map(k=>[k,row[k]]));
const ref=(table,key,value)=>`(SELECT id FROM ${table} WHERE ${key}=${quote(value)})`;
function insert(table,row,key,expressions={}){
 const keys=Object.keys(row),values=keys.map(k=>expressions[k]??quote(row[k]));
 return `INSERT INTO ${table}(${keys.join(',')}) VALUES(${values.join(',')}) ON CONFLICT(${key}) DO UPDATE SET ${keys.filter(k=>k!==key).map(k=>`${k}=excluded.${k}`).join(',')};`;
}
function checkBundle(bundle,allowed){
 for(const [table,value] of Object.entries(bundle||{}))if(!allowed.includes(table)||!Array.isArray(value))throw Error('Table hors périmètre : '+table);
}
export function productionPlan(source,target,release){
 if(!/^[a-z0-9][a-z0-9-]{0,70}$/.test(release))throw Error('Identifiant de reprise invalide.');
 checkBundle(source.shop,shopTables);checkBundle(source.tournaments,tournamentTables);
 const media=new Map(),shop=['UPDATE shop_settings SET shop_enabled=0 WHERE id=1;','DELETE FROM shop_options;','DELETE FROM shop_variants;'],tournaments=['DELETE FROM tournament_sales;'];
 function mediaKey(key){
  if(!key)return '';
  if(typeof key!=='string'||key.startsWith('/')||key.includes('://')||key.split('/').some(s=>s==='..'||s==='.')||/[\x00-\x1f]/.test(key))throw Error('Clé média invalide.');
  if(!media.has(key))media.set(key,{source_key:key,target_key:`releases/${release}/shop/${key}`,file:'media/'+createHash('sha256').update(key).digest('hex')+'.bin'});
  return media.get(key).target_key;
 }
 const products=new Map(rows(source.shop,'shop_products').map(p=>[p.id,p]));
 const categories=new Map(rows(source.shop,'shop_categories').map(p=>[p.id,p]));
 const suppliers=new Map(rows(source.shop,'shop_suppliers').map(p=>[p.id,p]));
 const definitions=new Map(rows(source.shop,'shop_personalizations').map(p=>[p.id,p]));
 const targetProducts=new Map(rows(target.shop,'shop_products').map(p=>[p.id,p]));
 const slugs=new Set([...products.values()].map(p=>p.slug));
 if(slugs.size!==products.size||[...products.values()].some(p=>!p.slug))throw Error('Slugs article absents ou en double.');
 for(const table of ['shop_variants','shop_options'])for(const row of rows(source.shop,table)){
  if(!products.has(row.product_id))throw Error('Choix sans article source.');
  const collision=rows(target.shop,table).find(p=>p.id===row.id);
  if(collision&&targetProducts.get(collision.product_id)?.slug!==products.get(row.product_id).slug)throw Error('Identifiant de choix déjà utilisé par un autre article en production.');
 }
 const removeOthers=(table,key,values)=>`DELETE FROM ${table}${values.length?` WHERE ${key} NOT IN (${values.map(quote).join(',')})`:''};`;
 for(const c of categories.values())shop.push(insert('shop_categories',pick(c,'shop_categories'),'slug'));
 for(const s of suppliers.values()){
  const existing=rows(target.shop,'shop_suppliers').find(p=>p.name.toLowerCase()===s.name.toLowerCase());
  const id=existing?.id||s.id;
  if(rows(target.shop,'shop_suppliers').some(p=>p.id===id&&p.name.toLowerCase()!==s.name.toLowerCase()))throw Error('Identifiant fournisseur en conflit.');
  shop.push(insert('shop_suppliers',{...pick(s,'shop_suppliers'),id},'id'));
  shop.push(`UPDATE shop_suppliers SET version=version+1 WHERE id=${quote(id)};`);
 }
 for(const d of definitions.values()){
  shop.push(insert('shop_personalizations',pick(d,'shop_personalizations'),'id'));
  shop.push(`UPDATE shop_personalizations SET version=version+1 WHERE id=${quote(d.id)};`);
 }
 for(const p of products.values()){
  const row={...pick(p,'shop_products'),image_key:mediaKey(p.image_key),shop_category_id:null};
  if(p.shop_category_id!=null&&!categories.has(p.shop_category_id))throw Error('Catégorie source absente.');
  shop.push(insert('shop_products',row,'slug',p.shop_category_id==null?{}:{shop_category_id:ref('shop_categories','slug',categories.get(p.shop_category_id).slug)}));
  shop.push(`UPDATE shop_variants SET active=0 WHERE product_id=${ref('shop_products','slug',p.slug)};`);
  shop.push(`UPDATE shop_options SET active=0 WHERE product_id=${ref('shop_products','slug',p.slug)};`);
  shop.push(`UPDATE shop_products SET personalizations_version=personalizations_version+1 WHERE slug=${quote(p.slug)};`);
 }
 for(const v of rows(source.shop,'shop_variants')){
  const supplier=suppliers.get(v.supplier_id);if(!supplier)throw Error('Fournisseur source absent.');
  shop.push(insert('shop_variants',{...pick(v,'shop_variants'),product_id:null,supplier_id:null},'id',{product_id:ref('shop_products','slug',products.get(v.product_id).slug),supplier_id:ref('shop_suppliers','name',supplier.name)}));
 }
 for(const o of rows(source.shop,'shop_options')){
  if(!definitions.has(o.personalization_id))throw Error('Personnalisation source absente.');
  const p=products.get(o.product_id);
  const existing=rows(target.shop,'shop_options').find(x=>x.personalization_id===o.personalization_id&&targetProducts.get(x.product_id)?.slug===p.slug);
  shop.push(insert('shop_options',{...pick(o,'shop_options'),id:existing?.id||o.id,product_id:null},'id',{product_id:ref('shop_products','slug',p.slug)}));
 }
 // Exact replacement of the configurable catalogue. Historical order lines
 // live in ORDERS and keep their name/price/options snapshots independently.
 shop.push(removeOthers('shop_products','slug',[...slugs]));
 shop.push(removeOthers('shop_categories','slug',[...categories.values()].map(c=>c.slug)));
 shop.push(removeOthers('shop_personalizations','id',[...definitions.keys()]));
 shop.push(removeOthers('shop_suppliers','id',[...suppliers.values()].map(s=>rows(target.shop,'shop_suppliers').find(p=>p.name.toLowerCase()===s.name.toLowerCase())?.id||s.id)));
 const settings=rows(source.shop,'shop_settings')[0];
 if(settings)shop.push(`UPDATE shop_settings SET catalogue_title=${quote(settings.catalogue_title||'Catalogue')},catalogue_key=${quote(mediaKey(settings.catalogue_key))},maintenance_image_key=${quote(mediaKey(settings.maintenance_image_key))},shop_enabled=0 WHERE id=1;`);
 for(const hero of rows(source.shop,'site_media').filter(p=>p.slot==='shop_hero'))shop.push(`UPDATE site_media SET object_key=${quote(mediaKey(hero.object_key))},alt_text=${quote(hero.alt_text||'')} WHERE slot='shop_hero';`);
 const events=new Map(rows(source.tournaments,'tournaments').map(t=>[t.id,t]));
 if(events.size)tournaments.push(`UPDATE tournament_sales SET enabled=0 WHERE tournament_id IN (SELECT id FROM tournaments WHERE slug IN (${[...events.values()].map(t=>quote(t.slug)).join(',')}));`);
 for(const t of events.values()){
  tournaments.push(insert('tournaments',{...pick(t,'tournaments'),image_key:'',poster_key:'',rules_key:null},'slug'));
  tournaments.push(`UPDATE tournaments SET version=version+1 WHERE slug=${quote(t.slug)};`);
 }
 for(const sale of rows(source.tournaments,'tournament_sales')){
  const t=events.get(sale.tournament_id);if(!t)throw Error('Tarif sans tournoi source.');
  tournaments.push(insert('tournament_sales',{...pick(sale,'tournament_sales'),enabled:0,tournament_id:null},'tournament_id',{tournament_id:ref('tournaments','slug',t.slug)}));
  tournaments.push(`UPDATE tournament_sales SET version=version+1 WHERE tournament_id=${ref('tournaments','slug',t.slug)};`);
 }
 const sourceTeams=new Map((source.teams||[]).map(t=>[t.id,t.slug]));
 for(const t of events.values())tournaments.push(`DELETE FROM tournament_teams WHERE tournament_id=${ref('tournaments','slug',t.slug)};`);
 for(const link of rows(source.tournaments,'tournament_teams')){
  const t=events.get(link.tournament_id),team=(target.teams||[]).find(x=>x.slug===sourceTeams.get(link.team_id));
  if(!t||!team)throw Error('Équipe de tournoi sans correspondance production.');
  tournaments.push(`INSERT INTO tournament_teams(tournament_id,team_id,notes) VALUES(${ref('tournaments','slug',t.slug)},${quote(team.id)},${quote(link.notes||'')});`);
 }
 const eventSlugs=[...events.values()].map(t=>t.slug);
 tournaments.push(`DELETE FROM tournament_sales WHERE tournament_id NOT IN (SELECT id FROM tournaments${eventSlugs.length?` WHERE slug IN (${eventSlugs.map(quote).join(',')})`:' WHERE 0'});`);
 tournaments.push(removeOthers('tournaments','slug',eventSlugs));
 return {release,shop_sql:shop.join('\n')+'\n',tournaments_sql:tournaments.join('\n')+'\n',media:[...media.values()],counts:{articles:products.size,variants:rows(source.shop,'shop_variants').length,personalizations:definitions.size,tournaments:events.size,media:media.size},desired_shop_enabled:settings?.shop_enabled??1,desired_tournament_sales:rows(source.tournaments,'tournament_sales').map(s=>({slug:events.get(s.tournament_id).slug,enabled:s.enabled})),sales_closed:true};
}

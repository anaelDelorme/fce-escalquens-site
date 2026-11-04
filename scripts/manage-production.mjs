import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,lstatSync,realpathSync,chmodSync,rmSync} from 'node:fs';
import {resolve,join,dirname,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {productionIssues} from './check-production.mjs';
import {productionPlan,shopTables,tournamentTables,transferColumns} from './production-transfer.mjs';
import {quote} from './tournaments-transfer.mjs';

const bindings=['DB','ORDERS','TOURNAMENTS'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=value=>JSON.stringify(normalize(value));
function normalize(value){
 if(Array.isArray(value))return value.map(normalize).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,normalize(value[k])]));
 return value;
}
function regularFile(folder,name){
 const file=join(folder,name);
 if(!lstatSync(file).isFile()||lstatSync(file).isSymbolicLink()||!realpathSync(file).startsWith(realpathSync(folder)+sep))throw Error('Fichier de reprise invalide.');
 return readFileSync(file);
}
function targets(config){return Object.fromEntries(bindings.map(name=>[name,config.d1_databases.find(b=>b.binding===name).database_id]));}
function requireConfig(config){
 const issues=productionIssues(config);if(issues.length)throw Error('Configuration production incomplète : '+issues.join(', '));
}
export function reviewedPlan(config,folder,expectedHash,{scope='all'}={}){
 requireConfig(config);
 if(!/^[a-f0-9]{64}$/.test(expectedHash||''))throw Error('Empreinte SHA-256 du manifeste relu requise.');
 const bytes=regularFile(folder,'manifest.json');
 if(sha(bytes)!==expectedHash)throw Error('Le manifeste ne correspond pas à l’empreinte validée.');
 const manifest=JSON.parse(bytes),source=JSON.parse(regularFile(folder,'source.json')),target=JSON.parse(regularFile(folder,'target.json'));
 if((manifest.scope||'all')!==scope)throw Error('Périmètre du manifeste différent de l’opération demandée.');
 const expected=targets(config),bucket=config.r2_buckets.find(b=>b.binding==='MEDIA').bucket_name;
 if(manifest.target_site_db!==expected.DB||manifest.target_orders_db!==expected.ORDERS||manifest.target_tournaments_db!==expected.TOURNAMENTS||manifest.target_bucket!==bucket||manifest.source_bucket!==config.env.staging.r2_buckets.find(b=>b.binding==='MEDIA').bucket_name)throw Error('Destinations de reprise différentes de la configuration production.');
 if((scope==='all'&&(manifest.production_tournaments_initialized!==true||manifest.production_tournament_snapshot_from!=='TOURNAMENTS'))||manifest.sales_closed!==true)throw Error('Refaire une préparation après l’initialisation des bases production.');
 const plan=productionPlan(source,target,manifest.release,{organizationSlug:config.vars.HELLOASSO_ORGANIZATION_SLUG,scope});
 for(const [name,sql] of [['shop',plan.shop_sql],['tournaments',plan.tournaments_sql],['settings',plan.settings_sql]]){
  const saved=regularFile(folder,name+'.sql');
  if(saved.toString()!==sql||sha(saved)!==manifest.sql_sha256?.[name])throw Error('SQL modifié ou non conforme au périmètre validé.');
 }
 if(canonical(plan.counts)!==canonical(manifest.counts)||plan.media.length!==manifest.media?.length)throw Error('Quantités du manifeste incohérentes.');
 for(const [index,object] of plan.media.entries()){
  const saved=manifest.media[index];
  if(!['source_key','target_key','file'].every(k=>object[k]===saved[k])||!/^media\/[a-f0-9]{64}\.bin$/.test(saved.file))throw Error('Clé ou chemin média hors du périmètre validé.');
  const media=regularFile(folder,saved.file);
  if(sha(media)!==saved.sha256||media.length!==saved.bytes)throw Error('Média absent ou empreinte différente du manifeste.');
  saved.content_type=mediaType(saved);
 }
 return {manifest,source,target};
}
function mediaType(object){
 const types={webp:'image/webp',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',gif:'image/gif',svg:'image/svg+xml',avif:'image/avif',pdf:'application/pdf'};
 const type=object.content_type&&object.content_type!=='application/octet-stream'?object.content_type:types[object.source_key.split('.').pop().toLowerCase()];
 if(!type||!Object.values(types).includes(type))throw Error('Type MIME du média non reconnu.');
 return type;
}
export class ProductionOperations {
 constructor(config,run,copyInitial){requireConfig(config);this.config=config;this.run=run;this.copyInitial=copyInitial;}
 query(db,sql){
  const stdout=this.run(['d1','execute',db,'--remote','--env','','--command',sql,'--json']);
  let result;try{result=JSON.parse(stdout);}catch{throw Error('Réponse D1 illisible : '+db);}
  if(!Array.isArray(result)||result.some(r=>r.success===false))throw Error('Réponse D1 invalide.');
  return result.flatMap(r=>r.results||[]);
 }
 executeFile(db,file){this.run(['d1','execute',db,'--remote','--env','','--file',file]);}
 tables(db){return new Set(this.query(db,"SELECT name FROM sqlite_master WHERE type='table'").map(r=>r.name));}
 backup(folder){
  mkdirSync(dirname(folder),{recursive:true,mode:0o700});
  mkdirSync(folder,{recursive:false,mode:0o700});
  const manifest={created_at:new Date().toISOString(),run_id:process.env.GITHUB_RUN_ID||null,databases:targets(this.config),files:{}};
  for(const db of bindings){
   const name=db+'.sql';this.run(['d1','export',db,'--remote','--env','','--output',join(folder,name)]);
   const bytes=regularFile(folder,name);if(!bytes.length)throw Error('Export de sauvegarde vide : '+db);
   chmodSync(join(folder,name),0o600);
   manifest.files[name]=sha(bytes);
  }
  writeFileSync(join(folder,'backup.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
  return {backup_complete:true};
 }
 requireBackup(folder){
  const manifest=JSON.parse(regularFile(folder,'backup.json')),age=Date.now()-Date.parse(manifest.created_at);
  if(canonical(manifest.databases)!==canonical(targets(this.config))||!Number.isFinite(age)||age<0||age>3600000||manifest.run_id!==(process.env.GITHUB_RUN_ID||null))throw Error('Sauvegarde récente des trois bases production requise pour cette exécution.');
  for(const db of bindings)if(sha(regularFile(folder,db+'.sql'))!==manifest.files[db+'.sql'])throw Error('Sauvegarde absente ou modifiée : '+db);
 }
 closeSales(){
  for(const db of bindings){
   const tables=this.tables(db);
   if(db==='DB'&&tables.has('shop_settings')&&this.query(db,'PRAGMA table_info(shop_settings)').some(c=>c.name==='shop_enabled'))this.query(db,'UPDATE shop_settings SET shop_enabled=0 WHERE id=1');
   if(db!=='DB'&&tables.has('settings'))this.query(db,"UPDATE settings SET data=json_set(data,'$.checkout_enabled',json('false')),version=version+1 WHERE id=1");
   if(db!=='ORDERS'&&tables.has('tournament_sales'))this.query(db,'UPDATE tournament_sales SET enabled=0,version=version+1 WHERE enabled=1');
  }
 }
 initialize(backupFolder,email){
  if(!/^[^\s@'"<>]+@[^\s@'"<>]+\.[^\s@'"<>]+$/.test(email||'')||email.length>254)throw Error('Adresse du premier responsable boutique/tournois requise.');
  this.requireBackup(backupFolder);
  this.closeSales();
  for(const db of bindings)this.run(['d1','migrations','apply',db,'--remote','--env','']);
  this.closeSales();
  if(!this.query('TOURNAMENTS',"SELECT id FROM module_imports WHERE id='v5.2'").length){
   if(!this.copyInitial)throw Error('Copie initiale des tournois indisponible.');
   this.copyInitial();
  }
  if(!this.query('TOURNAMENTS',"SELECT id FROM module_imports WHERE id='v5.2'").length)throw Error('Copie initiale des tournois non validée.');
  for(const [db,table] of [['ORDERS','shop_admins'],['TOURNAMENTS','tournament_admins']]){
   this.query(db,`INSERT OR IGNORE INTO ${table}(email,name,active) VALUES(${quote(email.toLowerCase())},'',1)`);
   if(this.query(db,`SELECT active FROM ${table} WHERE email=${quote(email.toLowerCase())}`)[0]?.active!==1)throw Error('Le responsable existe mais son accès est désactivé. Vérifier ses droits avant de continuer.');
  }
  this.checkForeignKeys();this.requireClosed();
  return {initialized:true,sales_closed:true};
 }
 requireClosed(){
  if(this.query('DB','SELECT shop_enabled FROM shop_settings WHERE id=1')[0]?.shop_enabled!==0||this.query('ORDERS',"SELECT COALESCE(json_extract(data,'$.checkout_enabled'),0) AS enabled FROM settings WHERE id=1")[0]?.enabled!==0)throw Error('Fermer la boutique avant toute reprise.');
  for(const db of ['DB','TOURNAMENTS'])if(this.query(db,'SELECT COUNT(*) AS n FROM tournament_sales WHERE enabled=1')[0]?.n!==0)throw Error('Fermer les inscriptions avant toute reprise.');
 }
 checkForeignKeys(){for(const db of bindings)if(this.query(db,'PRAGMA foreign_key_check').length)throw Error('Référence D1 incohérente après opération : '+db);}
 snapshot(){
  const tables=(db,names)=>Object.fromEntries(names.map(name=>[name,this.query(db,`SELECT * FROM ${name}${name==='site_media'?" WHERE slot='shop_hero'":''}`)]));
  return {shop:tables('DB',shopTables),tournaments:tables('TOURNAMENTS',tournamentTables),teams:this.query('DB','SELECT id,slug FROM teams'),venues:this.query('DB','SELECT id,name,address FROM venues'),seasons:this.query('DB','SELECT id,label FROM seasons')};
 }
 transactions(){
  const result={};
  for(const db of ['ORDERS','TOURNAMENTS'])for(const table of ['orders','order_items','checkout_attempts','payments','order_events','outbox','surveys','tournament_registrations'])result[db+':'+table]=sha(canonical(this.query(db,'SELECT * FROM '+table)));
  return result;
 }
 shopSnapshot(){return Object.fromEntries(shopTables.map(name=>[name,this.query('DB',`SELECT * FROM ${name}${name==='site_media'?" WHERE slot='shop_hero'":''}`)]));}
 checkShopImport(folder,expectedHash){
  const reviewed=reviewedPlan(this.config,folder,expectedHash,{scope:'shop'});
  if(!reviewed.source.shop.shop_products.length)throw Error('Catalogue staging vide : copie boutique refusée.');
  if(canonical(this.shopSnapshot())!==canonical(reviewed.target.shop))throw Error('La boutique production a changé depuis l’export. Refaire la préparation.');
  return reviewed;
 }
 copyMedia(manifest,folder,backupFolder){
  const verification=join(backupFolder,'media-verification.bin');
  try{for(const object of manifest.media){
   const key=manifest.target_bucket+'/'+object.target_key;
   this.run(['r2','object','put',key,'--remote','--env','','--file',join(folder,object.file),'--content-type',object.content_type,'--force']);
   this.run(['r2','object','get',key,'--remote','--env','','--file',verification]);
   if(sha(regularFile(backupFolder,'media-verification.bin'))!==object.sha256)throw Error('Vérification R2 du média transféré en échec.');
  }}finally{rmSync(verification,{force:true});}
 }
 importShop(folder,expectedHash,backupFolder){
  this.requireBackup(backupFolder);
  const {manifest,source,target}=this.checkShopImport(folder,expectedHash);
  const enabled=target.shop.shop_settings[0]?.shop_enabled;
  if(![0,1].includes(enabled))throw Error('État d’ouverture boutique invalide.');
  this.copyMedia(manifest,folder,backupFolder);
  this.checkShopImport(folder,expectedHash);
  // All catalogue writes use DB only. ORDERS and TOURNAMENTS are never updated.
  this.query('DB','UPDATE shop_settings SET shop_enabled=0 WHERE id=1');
  this.executeFile('DB',join(folder,'shop.sql'));
  if(this.query('DB','PRAGMA foreign_key_check').length)throw Error('Référence catalogue incohérente : garder la boutique fermée.');
  this.verifyShopContents(source,target,manifest);
  this.query('DB',`UPDATE shop_settings SET shop_enabled=${enabled} WHERE id=1`);
  if(this.query('DB','SELECT shop_enabled FROM shop_settings WHERE id=1')[0]?.shop_enabled!==enabled)throw Error('État d’ouverture boutique non restauré.');
  return {imported:true,scope:'shop',shop_enabled:enabled,images_verified:manifest.media.length,counts:manifest.counts,manifest_sha256:expectedHash};
 }
 verifyShopContents(source,target,manifest){
  const current=this.shopSnapshot(),same=(a,b)=>{if(canonical(a)!==canonical(b))throw Error('Contenu boutique différent du staging : garder la boutique fermée.');};
  const mediaKey=key=>key?`releases/${manifest.release}/shop/${key}`:'';
  const fields=(row,table)=>Object.fromEntries(transferColumns[table].map(k=>[k,row[k]??null]));
  for(const table of ['shop_categories','shop_personalizations'])same(current[table].map(r=>fields(r,table)),source.shop[table].map(r=>fields(r,table)));
  const suppliers=b=>b.shop_suppliers.map(r=>{const v=fields(r,'shop_suppliers');delete v.id;return v;});same(suppliers(current),suppliers(source.shop));
  const products=b=>b.shop_products.map(r=>({...fields(r,'shop_products'),category:b.shop_categories.find(c=>c.id===r.shop_category_id)?.slug??null}));
  same(products(current),products(source.shop).map(r=>({...r,image_key:mediaKey(r.image_key)})));
  const variants=b=>b.shop_variants.map(r=>({...fields(r,'shop_variants'),product:b.shop_products.find(p=>p.id===r.product_id)?.slug,supplier:b.shop_suppliers.find(s=>s.id===r.supplier_id)?.name}));
  same(variants(current),variants(source.shop).map(r=>({...r,coach_price_cents:null})));
  const options=b=>b.shop_options.map(r=>({product:b.shop_products.find(p=>p.id===r.product_id)?.slug,personalization_id:r.personalization_id,active:r.active}));same(options(current),options(source.shop));
  same(current.site_media.map(r=>({slot:r.slot,object_key:r.object_key,alt_text:r.alt_text})),source.shop.site_media.map(r=>({slot:r.slot,object_key:mediaKey(r.object_key),alt_text:r.alt_text||''})));
  const expected={...target.shop.shop_settings[0],catalogue_title:source.shop.shop_settings[0].catalogue_title||'Catalogue',catalogue_key:mediaKey(source.shop.shop_settings[0].catalogue_key),maintenance_image_key:mediaKey(source.shop.shop_settings[0].maintenance_image_key),shop_enabled:0};
  same(current.shop_settings,[expected]);
 }
 checkImport(folder,expectedHash){
  const reviewed=reviewedPlan(this.config,folder,expectedHash);
  if(!this.query('TOURNAMENTS',"SELECT id FROM module_imports WHERE id='v5.2'").length)throw Error('Copie initiale des tournois non validée.');
  this.requireClosed();
  if(canonical(this.snapshot())!==canonical(reviewed.target))throw Error('La production a changé depuis l’export. Refaire la préparation et sa revue.');
  return reviewed;
 }
 import(folder,expectedHash,backupFolder){
  this.requireBackup(backupFolder);
  const {manifest,source}=this.checkImport(folder,expectedHash),before=this.transactions();
  this.copyMedia(manifest,folder,backupFolder);
  // Detect concurrent catalogue changes again after the media transfer.
  this.checkImport(folder,expectedHash);
  for(const [db,file] of [['DB','shop.sql'],['TOURNAMENTS','tournaments.sql'],['ORDERS','settings.sql']])this.executeFile(db,join(folder,file));
  this.checkForeignKeys();this.requireClosed();
  if(canonical(before)!==canonical(this.transactions()))throw Error('Des données transactionnelles ont changé pendant la reprise. Garder les ventes fermées et contrôler les sauvegardes.');
  this.verifyContents(source,manifest);
  return {imported:true,sales_closed:true,counts:manifest.counts,manifest_sha256:expectedHash};
 }
 verifyContents(source,manifest){
  const current=this.snapshot(),same=(a,b)=>{if(canonical(a)!==canonical(b))throw Error('Contenus ou tarifs repris différents du catalogue validé.');};
  for(const [table,count] of [['shop_products','articles'],['shop_variants','variants'],['shop_personalizations','personalizations']])if(current.shop[table].length!==manifest.counts[count])throw Error('Nombre d’articles, tailles ou personnalisations incorrect.');
  same(current.shop.shop_products.map(p=>p.slug),source.shop.shop_products.map(p=>p.slug));
  same(current.tournaments.tournaments.map(t=>t.slug),source.tournaments.tournaments.map(t=>t.slug));
  same(current.shop.shop_personalizations.map(({id,label,price_cents,requires_text,max_length,active,required})=>({id,label,price_cents,requires_text,max_length,active,required})),source.shop.shop_personalizations.map(({id,label,price_cents,requires_text,max_length,active,required})=>({id,label,price_cents,requires_text,max_length,active,required})));
  const variantFields=['id','label','size','color','sku','price_cents','catalogue_price_cents','coach_price_cents','active','display_order'];
  const variants=bundle=>bundle.shop_variants.map(v=>({...Object.fromEntries(variantFields.map(k=>[k,v[k]])),product:bundle.shop_products.find(p=>p.id===v.product_id)?.slug,supplier:bundle.shop_suppliers.find(s=>s.id===v.supplier_id)?.name}));
  same(variants(current.shop),variants(source.shop));
  const options=bundle=>bundle.shop_options.map(o=>({product:bundle.shop_products.find(p=>p.id===o.product_id)?.slug,personalization_id:o.personalization_id,active:o.active}));same(options(current.shop),options(source.shop));
  const saleFields=['fee_cents','allow_pay_later','capacity','registration_deadline','payment_deadline','terms','form_json','allow_cheque','cheque_payee','cheque_address','cheque_deadline'];
  const sales=bundle=>bundle.tournament_sales.map(s=>({slug:bundle.tournaments.find(t=>t.id===s.tournament_id)?.slug,...Object.fromEntries(saleFields.map(k=>[k,s[k]]))}));same(sales(current.tournaments),sales(source.tournaments));
  for(const p of current.shop.shop_products){const original=source.shop.shop_products.find(s=>s.slug===p.slug);if(p.image_key!==(original.image_key?`releases/${manifest.release}/shop/${original.image_key}`:''))throw Error('Image article différente de la reprise validée.');}
  if(current.tournaments.tournaments.some(t=>t.image_key||t.poster_key||t.rules_key))throw Error('Média tournoi présent dans la reprise.');
 }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const args=process.argv.slice(2),known=['--action','--folder','--backup','--admin-email','--manifest-sha256'];
  for(let i=0;i<args.length;i+=2)if(!known.includes(args[i])||!args[i+1]||args[i+1].startsWith('--'))throw Error('Arguments de préparation production invalides.');
  const get=key=>args.includes(key)?args[args.indexOf(key)+1]:undefined,action=get('--action');
  if(!['backup','initialize','check-import','import','check-shop-import','import-shop'].includes(action))throw Error('Action production invalide.');
  const config=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
  const run=argv=>{
   const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js',...argv,'--config',resolve('wrangler.jsonc')],{encoding:'utf8',maxBuffer:128*1024*1024});
   if(result.status!==0)throw Error('Commande Cloudflare en échec ('+argv.slice(0,3).join(' ')+'). Vérifier les droits D1/R2 ; les services doivent rester fermés.');
   return result.stdout;
  };
  const copyInitial=()=>{const result=spawnSync(process.execPath,['scripts/copy-tournaments.mjs','--env','production','--apply'],{encoding:'utf8',maxBuffer:128*1024*1024});if(result.status!==0)throw Error('Copie initiale des tournois production en échec. Sources et sauvegardes conservées ; vérifier la reprise avant toute ouverture.');};
  const operations=new ProductionOperations(config,run,copyInitial);
  const backup=get('--backup')&&resolve(get('--backup')),folder=get('--folder')&&resolve(get('--folder'));
  if(!backup)throw Error('Dossier de sauvegarde requis.');
  if(['check-import','import','check-shop-import','import-shop'].includes(action)&&!folder)throw Error('Dossier de préparation requis.');
  const result=action==='import-shop'?operations.importShop(folder,get('--manifest-sha256'),backup):action==='check-shop-import'?(operations.checkShopImport(folder,get('--manifest-sha256')),{reviewed:true,scope:'shop'}):action==='backup'?operations.backup(backup):action==='initialize'?operations.initialize(backup,get('--admin-email')):action==='check-import'?(operations.checkImport(folder,get('--manifest-sha256')),{reviewed:true}):operations.import(folder,get('--manifest-sha256'),backup);
  if(['initialize','import','import-shop'].includes(action))writeFileSync(join(backup,'result.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify(result));
 }catch(error){console.error(error.message);process.exitCode=1;}
}

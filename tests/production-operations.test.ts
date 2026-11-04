import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,rmSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {ProductionOperations,reviewedPlan} from '../scripts/manage-production.mjs';
import {productionPlan} from '../scripts/production-transfer.mjs';
import {copyStatements} from '../scripts/tournaments-transfer.mjs';

const hash=(value:any)=>createHash('sha256').update(value).digest('hex');
const config=()=>JSON.parse(readFileSync('wrangler.jsonc','utf8'));
function fixture(t:any,{freshTournaments=false}={}){
 const folder=mkdtempSync(join(tmpdir(),'fce-production-ops-'));
 const databases:any={DB:new DatabaseSync(':memory:'),ORDERS:new DatabaseSync(':memory:'),TOURNAMENTS:new DatabaseSync(':memory:')};
 const directories:any={DB:'migrations',ORDERS:'migrations-orders',TOURNAMENTS:'migrations-tournaments'},migrated=new Set<string>();
 function migrate(name:string){if(migrated.has(name))return;for(const file of readdirSync(directories[name]).filter(f=>f.endsWith('.sql')).sort())databases[name].exec(readFileSync(join(directories[name],file),'utf8'));migrated.add(name);}
 for(const db of Object.values(databases) as DatabaseSync[])db.exec('PRAGMA foreign_keys=ON');
 migrate('DB');migrate('ORDERS');if(!freshTournaments){migrate('TOURNAMENTS');databases.TOURNAMENTS.exec("INSERT INTO module_imports VALUES('v5.2',1)");}
 databases.DB.exec("UPDATE shop_settings SET shop_enabled=0;INSERT INTO teams(id,slug,name,category,group_name) VALUES(99,'u11','U11','U11','Jeunes')");
 const calls:any[]=[],media=new Map<string,Buffer>(),state={failExport:'',corruptMedia:false,copyCount:0};
 const query=(name:string,sql:string)=>databases[name].prepare(sql).all();
 const run=(args:string[])=>{
  calls.push(args);
  assert.ok(args.includes('--remote'));assert.equal(args[args.indexOf('--env')+1],'');
  const value=(key:string)=>args[args.indexOf(key)+1];
  if(args[0]==='d1'){
   if(args[1]==='export'){if(args[2]===state.failExport)throw Error('Export interrompu');writeFileSync(value('--output'),'-- sauvegarde privée '+args[2]);return '';}
   if(args[1]==='migrations'){migrate(args[3]);return '';}
   if(args.includes('--file')){databases[args[2]].exec(readFileSync(value('--file'),'utf8'));return 'progression import non JSON';}
   return JSON.stringify([{success:true,results:query(args[2],value('--command'))}]);
  }
  if(args[0]==='r2'){
   if(args[2]==='put')media.set(args[3],readFileSync(value('--file')));
   else writeFileSync(value('--file'),state.corruptMedia?Buffer.from('corrompu'):media.get(args[3])!);
   return '';
  }
  throw Error('Commande inattendue');
 };
 const copyInitial=()=>{
  state.copyCount++;
  const data:any={};for(const table of ['tournaments','tournament_sales','tournament_teams'])data[table]=query('DB','SELECT * FROM '+table);
  data.tournament_admins=query('ORDERS','SELECT * FROM tournament_admins');data.orders=query('ORDERS',"SELECT * FROM orders WHERE kind='tournament'");
  for(const table of ['tournament_registrations','order_items','checkout_attempts','payments','order_events','outbox'])data[table]=query('ORDERS',`SELECT c.* FROM ${table} c JOIN orders o ON o.id=c.order_id WHERE o.kind='tournament'`);
  databases.TOURNAMENTS.exec(copyStatements(data).join('\n')+"INSERT INTO module_imports VALUES('v5.2',1);");
 };
 const operations=new ProductionOperations(config(),run,copyInitial);
 t.after(()=>{for(const db of Object.values(databases) as DatabaseSync[])db.close();rmSync(folder,{recursive:true,force:true});});
 return {folder,databases,calls,media,state,query,operations};
}
function order(db:DatabaseSync,id:string,kind='shop'){
 db.prepare("INSERT INTO orders(id,reference,request_hash,token_hash,token_expires,email,first_name,last_name,phone,delivery_method,total_cents,terms_version,terms_snapshot,terms_accepted_at,created_at,updated_at,kind) VALUES(?,?,?,?,1,'real@example.org','A','B','0102030405','club',3500,'v1','CGV',1,1,1,?)").run(id,'FCE-'+id,'hash-'+id,'token-'+id,kind);
}
function archive(t:any,target:any){
 const stage=fixture(t);
 stage.databases.DB.exec("INSERT INTO shop_categories(id,slug,name) VALUES(1,'tenues','Tenues');INSERT INTO shop_products(id,slug,name,shop_category_id,image_key) VALUES(5,'maillot','Maillot',1,'uploads/maillot.webp');INSERT INTO shop_suppliers(id,name) VALUES('supplier','Kappa');INSERT INTO shop_variants(id,product_id,label,size,sku,supplier_id,price_cents,catalogue_price_cents,coach_price_cents) VALUES('v',5,'M','M','M-1','supplier',3500,4000,3000);INSERT INTO shop_personalizations(id,label,price_cents,required) VALUES('badge','Écusson',250,1);INSERT INTO shop_options(id,product_id,personalization_id) VALUES('option',5,'badge');UPDATE shop_settings SET shop_enabled=1;");
 stage.databases.TOURNAMENTS.exec("INSERT INTO tournaments(id,slug,name,starts_on,image_key) VALUES(10,'coupe','Coupe FCE','2027-06-01','tournoi.webp');INSERT INTO tournament_sales(tournament_id,fee_cents,enabled,form_json) VALUES(10,6000,1,'[{\"id\":\"club\",\"label\":\"Club\",\"type\":\"text\",\"required\":true}]');INSERT INTO tournament_teams(tournament_id,team_id,notes) VALUES(10,99,'U11');");
 const snapshot=stage.operations.snapshot(),source={...snapshot,business_settings:{contact_email:'club@example.org'}};
 const planned=productionPlan(source,target.operations.snapshot(),'reviewed-release',{organizationSlug:config().vars.HELLOASSO_ORGANIZATION_SLUG}),folder=join(target.folder,'archive');mkdirSync(join(folder,'media'),{recursive:true});
 const settings=config(),ids=Object.fromEntries(settings.d1_databases.map((b:any)=>[b.binding,b.database_id]));
 const manifest:any={release:'reviewed-release',counts:planned.counts,source_bucket:settings.env.staging.r2_buckets[0].bucket_name,target_bucket:settings.r2_buckets[0].bucket_name,target_site_db:ids.DB,target_orders_db:ids.ORDERS,target_tournaments_db:ids.TOURNAMENTS,production_tournaments_initialized:true,production_tournament_snapshot_from:'TOURNAMENTS',sales_closed:true,sql_sha256:{},media:planned.media};
 for(const [name,sql] of [['shop',planned.shop_sql],['tournaments',planned.tournaments_sql],['settings',planned.settings_sql]]){writeFileSync(join(folder,name+'.sql'),sql);manifest.sql_sha256[name]=hash(sql);}
 for(const object of manifest.media){const bytes=Buffer.from('image de test');writeFileSync(join(folder,object.file),bytes);object.sha256=hash(bytes);object.bytes=bytes.length;object.content_type='image/webp';}
 writeFileSync(join(folder,'source.json'),JSON.stringify(source));writeFileSync(join(folder,'target.json'),JSON.stringify(target.operations.snapshot()));
 const saveManifest=()=>{const bytes=JSON.stringify(manifest);writeFileSync(join(folder,'manifest.json'),bytes);return hash(bytes);};
 return {folder,manifest,source,saveManifest,digest:saveManifest()};
}

test('initialisation production : sauvegardes requises, historique réel copié et responsables explicites',t=>{
 const f=fixture(t,{freshTournaments:true}),backup=join(f.folder,'backup');
 f.databases.DB.exec("UPDATE shop_settings SET shop_enabled=1;INSERT INTO tournaments(id,slug,name,starts_on) VALUES(8,'ancien','Ancien','2027-01-01');INSERT INTO tournament_sales(tournament_id,fee_cents,enabled) VALUES(8,1000,1)");
 order(f.databases.ORDERS,'shop-real');order(f.databases.ORDERS,'tournament-real','tournament');
 assert.throws(()=>f.operations.initialize(backup,'admin@example.org'));
 assert.equal(f.query('DB','SELECT shop_enabled FROM shop_settings')[0].shop_enabled,1);
 f.operations.backup(backup);const before=JSON.stringify(f.query('ORDERS','SELECT * FROM orders'));
 const result=f.operations.initialize(backup,'Admin@example.org');assert.equal(result.initialized,true);
 assert.equal(f.state.copyCount,1);assert.equal(JSON.stringify(f.query('ORDERS','SELECT * FROM orders')),before);
 assert.equal(f.query('TOURNAMENTS','SELECT id FROM orders')[0].id,'tournament-real');
 assert.equal(f.query('ORDERS','SELECT email FROM shop_admins')[0].email,'admin@example.org');assert.equal(f.query('TOURNAMENTS','SELECT email FROM tournament_admins')[0].email,'admin@example.org');
 f.operations.requireClosed();assert.equal(f.calls.some(a=>a[0]==='r2'),false);
 // A rerun never recopies legacy data into an active module.
 f.operations.initialize(backup,'admin@example.org');assert.equal(f.state.copyCount,1);
});

test('sauvegarde production : export incomplet ou modifié bloque les écritures',t=>{
 const f=fixture(t),backup=join(f.folder,'backup');f.state.failExport='TOURNAMENTS';
 assert.throws(()=>f.operations.backup(backup),/Export interrompu/);assert.equal(existsSync(join(backup,'backup.json')),false);
 f.calls.length=0;assert.throws(()=>f.operations.initialize(backup,'admin@example.org'));assert.equal(f.calls.length,0);
 f.state.failExport='';const valid=join(f.folder,'valid');f.operations.backup(valid);writeFileSync(join(valid,'DB.sql'),'modifié');f.calls.length=0;
 assert.throws(()=>f.operations.initialize(valid,'admin@example.org'),/modifiée/);assert.equal(f.calls.length,0);
});

test('import production : catalogue remplacé, médias vérifiés, tarifs/formulaires exacts et transactions conservées',t=>{
 const f=fixture(t),backup=join(f.folder,'backup');
 f.databases.DB.exec("INSERT INTO shop_products(slug,name) VALUES('ancien','Ancien')");order(f.databases.ORDERS,'real');order(f.databases.TOURNAMENTS,'real-tournament','tournament');
 const a=archive(t,f),before=f.operations.transactions();f.operations.backup(backup);
 const result=f.operations.import(a.folder,a.digest,backup);assert.equal(result.imported,true);assert.deepEqual(f.operations.transactions(),before);
 const product=f.query('DB','SELECT slug,image_key FROM shop_products');assert.equal(product.length,1);assert.equal(product[0].slug,'maillot');assert.equal(product[0].image_key,'releases/reviewed-release/shop/uploads/maillot.webp');
 assert.equal(f.query('DB','SELECT price_cents FROM shop_variants')[0].price_cents,3500);assert.equal(f.query('DB','SELECT required FROM shop_personalizations')[0].required,1);
 assert.equal(f.query('TOURNAMENTS','SELECT fee_cents FROM tournament_sales')[0].fee_cents,6000);assert.match(f.query('TOURNAMENTS','SELECT form_json FROM tournament_sales')[0].form_json,/Club/);
 assert.equal(f.media.size,a.manifest.media.length);assert.ok(f.calls.filter(a=>a[0]==='r2'&&a[2]==='put').every(a=>a.includes('--content-type')));f.operations.requireClosed();
 assert.equal(JSON.parse(f.query('ORDERS','SELECT data FROM settings')[0].data).contact_email,'club@example.org');
});

test('import production : refus du manifeste altéré, SQL hors périmètre et export antérieur à l’initialisation',t=>{
 const f=fixture(t),a=archive(t,f);
 assert.throws(()=>reviewedPlan(config(),a.folder,'a'.repeat(64)),/empreinte validée/);
 a.manifest.production_tournaments_initialized=false;assert.throws(()=>reviewedPlan(config(),a.folder,a.saveManifest()),/initialisation/);a.manifest.production_tournaments_initialized=true;
 const sql=readFileSync(join(a.folder,'shop.sql'),'utf8')+'DELETE FROM orders;';writeFileSync(join(a.folder,'shop.sql'),sql);a.manifest.sql_sha256.shop=hash(sql);
 assert.throws(()=>reviewedPlan(config(),a.folder,a.saveManifest()),/SQL modifié/);assert.equal(f.calls.some(c=>c[0]==='r2'),false);
});

test('import production : changement concurrent ou média R2 corrompu laisse le catalogue et les commandes intacts',t=>{
 const f=fixture(t),a=archive(t,f),backup=join(f.folder,'backup');f.operations.backup(backup);
 f.databases.DB.exec("UPDATE shop_settings SET catalogue_title='Modification concurrente'");
 assert.throws(()=>f.operations.import(a.folder,a.digest,backup),/production a changé/);assert.equal(f.calls.some(c=>c[0]==='r2'),false);
 f.databases.DB.prepare('UPDATE shop_settings SET catalogue_title=?').run(JSON.parse(readFileSync(join(a.folder,'target.json'),'utf8')).shop.shop_settings[0].catalogue_title);
 f.state.corruptMedia=true;const before=f.operations.transactions(),catalogue=JSON.stringify(f.operations.snapshot());
 assert.throws(()=>f.operations.import(a.folder,a.digest,backup),/R2 du média/);
 assert.equal(JSON.stringify(f.operations.snapshot()),catalogue);assert.deepEqual(f.operations.transactions(),before);
 assert.equal(f.calls.some(c=>c.includes('--file')&&c[0]==='d1'&&c[1]==='execute'),false);
});

test('workflow production : seuls les lancements manuels explicites initialisent/importent, aucun push de préparation ne déploie',()=>{
 const yaml=readFileSync('.github/workflows/deploy.yml','utf8');
 const selected=(event:string,branch:string,operation:string,prepare_only=true)=>{
  const github={event_name:event,ref:'refs/heads/'+branch},inputs={operation,prepare_only};
  return ['prepare','maintenance','deploy'].filter(job=>{
   const expression=yaml.match(new RegExp('^  '+job+':\\n    if: (.+)$','m'))![1];
   return new Function('github','inputs','return ('+expression+');')(github,inputs);
  });
 };
 assert.deepEqual(selected('push','release/boutique-tournois-production',''),['prepare']);
 assert.deepEqual(selected('push','main',''),['deploy']);assert.deepEqual(selected('push','staging',''),[]);
 for(const branch of ['main','release/boutique-tournois-production'])for(const operation of ['initialiser','importer'])for(const prepare of [true,false])assert.deepEqual(selected('workflow_dispatch',branch,operation,prepare),['maintenance']);
 assert.deepEqual(selected('workflow_dispatch','staging','initialiser'),[]);
 assert.deepEqual(selected('workflow_dispatch','main','preparer'),['prepare']);
 assert.deepEqual(selected('workflow_dispatch','main','preparer',false),['deploy']);
 assert.ok(yaml.indexOf('name: Conserver les sauvegardes privées')<yaml.indexOf('name: Exécuter uniquement l’opération demandée'));
 const uploads=[...yaml.matchAll(/uses: actions\/upload-artifact@v4[\s\S]*?path: ([^\n]+)/g)].map(m=>m[1]);
 assert.equal(uploads.length,3);assert.ok(uploads.every(path=>path.startsWith('.production-encrypted/')&&path.endsWith('.fce')),'Les artefacts du dépôt public doivent être chiffrés avant publication.');
});

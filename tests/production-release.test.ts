import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdtempSync,writeFileSync,rmSync,mkdirSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {TestDatabase} from './d1';
import {productionPlan} from '../scripts/production-transfer.mjs';
import {productionIssues} from '../scripts/check-production.mjs';
import {connectionStatus,apiBase} from '../src/shop/helloasso';
import {mailRecipient} from '../src/shop/mail';
import {publicMedia} from '../scripts/public-media.mjs';

test('reprise production : remappage des articles et tournois, médias boutique isolés et commandes conservées',async t=>{
 const DB=new TestDatabase(),TOURNAMENTS=new TestDatabase();t.after(()=>{DB.close();TOURNAMENTS.close();});
 for(const file of readdirSync(new URL('../migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())await DB.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
 for(const file of readdirSync(new URL('../migrations-tournaments/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())await TOURNAMENTS.exec(readFileSync(new URL('../migrations-tournaments/'+file,import.meta.url),'utf8'));
 await DB.exec("INSERT INTO shop_categories(id,slug,name) VALUES(20,'tenues','Ancien');INSERT INTO shop_products(id,slug,name,image_key,shop_category_id) VALUES(44,'maillot','Ancien','prod.webp',20),(45,'autre','Autre','other.webp',20);INSERT INTO shop_suppliers(id,name) VALUES('prod-supplier','Kappa');");
 await TOURNAMENTS.exec("INSERT INTO tournaments(id,slug,name,starts_on,image_key,poster_key,rules_key) VALUES(73,'coupe','Ancien','2027-06-01','prod-event.webp','prod-poster.webp','prod-rules.pdf');INSERT INTO orders(id,reference,request_hash,token_hash,token_expires,email,first_name,last_name,phone,delivery_method,total_cents,terms_version,terms_snapshot,terms_accepted_at,created_at,updated_at) VALUES('real','FCE-REAL','hash','token',1,'client@example.org','A','B','0102030405','club',1000,'v1','CGV',1,1,1);");
 const before=JSON.stringify((await TOURNAMENTS.prepare('SELECT * FROM orders').all()).results);
 const source={business_settings:{contact_email:'club@example.org',organization_slug:'sandbox-slug',HELLOASSO_CLIENT_SECRET:'must-not-copy'},shop:{
  shop_categories:[{id:1,slug:'tenues',name:'Tenues',active:1}],
  shop_suppliers:[{id:'stage-supplier',name:'Kappa',active:1}],
  shop_personalizations:[{id:'badge',label:'Écusson',price_cents:250,requires_text:0,max_length:4,active:1,required:1}],
  shop_products:[{id:1,slug:'maillot',name:"Maillot d'été",shop_category_id:1,image_key:'uploads/maillot.webp',active:1}],
  shop_variants:[{id:'variant',product_id:1,label:'M',size:'M',supplier_id:'stage-supplier',price_cents:2000,sku:'',active:1}],
  shop_options:[{id:'option',product_id:1,personalization_id:'badge',active:1}],
  shop_settings:[{id:1,catalogue_key:'catalogue.pdf',maintenance_image_key:'attente.webp'}],
  site_media:[{slot:'shop_hero',object_key:'uploads/cover.webp',alt_text:'Couverture'}],
 },tournaments:{
  tournaments:[{id:5,slug:'coupe',name:'Coupe FCE',starts_on:'2027-06-02',image_key:'stage-tournament.webp'},{id:6,slug:'nouveau',name:'Nouveau tournoi',starts_on:'2027-06-03',poster_key:'stage-poster.webp'}],
  tournament_sales:[{tournament_id:5,fee_cents:2500,enabled:1,form_json:'[{"id":"club","label":"Club","type":"text"}]',allow_pay_later:1}],
  tournament_teams:[{tournament_id:5,team_id:3,notes:'U11'}],
 },teams:[{id:3,slug:'u11'}]};
 const target={shop:{shop_products:[{id:44,slug:'maillot'},{id:45,slug:'autre'}],shop_suppliers:[{id:'prod-supplier',name:'Kappa'}]},tournaments:{},teams:[{id:99,slug:'u11'}]};
 const plan=productionPlan(source,target,'release-test',{organizationSlug:'fce'});
 await DB.exec(plan.shop_sql);await TOURNAMENTS.exec(plan.tournaments_sql);
 const product=await DB.prepare("SELECT * FROM shop_products WHERE slug='maillot'").first<any>();assert.equal(product.id,44);assert.equal(product.shop_category_id,20);assert.equal(product.name,"Maillot d'été");assert.equal(product.image_key,'releases/release-test/shop/uploads/maillot.webp');
 assert.equal(await DB.prepare("SELECT * FROM shop_products WHERE id=45").first(),null);
 const v=await DB.prepare('SELECT * FROM shop_variants').first<any>();assert.equal(v.product_id,44);assert.equal(v.supplier_id,'prod-supplier');assert.equal(v.price_cents,2000);
 assert.equal((await DB.prepare('SELECT * FROM shop_personalizations').first<any>()).required,1);
 assert.equal((await DB.prepare('SELECT shop_enabled FROM shop_settings').first<any>()).shop_enabled,0);
 const event=await TOURNAMENTS.prepare("SELECT * FROM tournaments WHERE slug='coupe'").first<any>();assert.equal(event.id,73);assert.equal(event.image_key,'');assert.equal(event.poster_key,'');assert.equal(event.rules_key,null);
 assert.equal((await TOURNAMENTS.prepare("SELECT * FROM tournaments WHERE slug='nouveau'").first<any>()).image_key,'');
 const sale=await TOURNAMENTS.prepare('SELECT * FROM tournament_sales').first<any>();assert.equal(sale.tournament_id,73);assert.equal(sale.fee_cents,2500);assert.equal(sale.enabled,0);assert.match(sale.form_json,/Club/);
 assert.equal((await TOURNAMENTS.prepare('SELECT team_id FROM tournament_teams').first<any>()).team_id,99);
 assert.equal(JSON.stringify((await TOURNAMENTS.prepare('SELECT * FROM orders').all()).results),before);
 assert.ok(plan.media.every(m=>!m.source_key.includes('tournament')&&!m.source_key.includes('poster')));assert.equal(plan.media.length,4);
 // Re-running a reviewed import updates existing rows instead of duplicating them.
 await DB.exec(plan.shop_sql);await TOURNAMENTS.exec(plan.tournaments_sql);
 assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM shop_products').first<any>()).n,1);
 assert.equal((await TOURNAMENTS.prepare('SELECT COUNT(*) AS n FROM tournaments').first<any>()).n,2);
 assert.equal((await DB.prepare('PRAGMA foreign_key_check').all()).results.length,0);
 const ORDERS=new TestDatabase();t.after(()=>ORDERS.close());await ORDERS.exec("CREATE TABLE settings(id INTEGER PRIMARY KEY,data TEXT,version INTEGER);INSERT INTO settings VALUES(1,'{}',0);CREATE TABLE orders(id TEXT PRIMARY KEY);INSERT INTO orders VALUES('real-order');");
 await ORDERS.exec(plan.settings_sql);const business=JSON.parse((await ORDERS.prepare('SELECT data FROM settings').first<any>()).data);
 assert.equal(business.contact_email,'club@example.org');assert.equal(business.organization_slug,'fce');assert.equal(business.checkout_enabled,false);assert.equal(business.legal_ready,false);assert.doesNotMatch(plan.settings_sql,/must-not-copy|sandbox-slug/);assert.equal((await ORDERS.prepare('SELECT id FROM orders').first<any>()).id,'real-order');
});

test('reprise production : tables de paiement, chemins média et correspondances ambiguës refusés',()=>{
 assert.throws(()=>productionPlan({shop:{orders:[{id:'sandbox'}]},tournaments:{}},{},'release'),/hors périmètre/);
 assert.throws(()=>productionPlan({shop:{shop_products:[{id:1,slug:'x',name:'X',image_key:'../secret'}]},tournaments:{}},{},'release'),/média/);
 assert.throws(()=>productionPlan({shop:{shop_products:[{id:1,slug:'x'}],shop_variants:[{id:'v',product_id:1}]},tournaments:{}},{shop:{shop_products:[{id:2,slug:'y'}],shop_variants:[{id:'v',product_id:2}]}},'release'),/autre article/);
});

test('HelloAsso production : test de connexion limité à OAuth et deux lectures, aucun checkout',async t=>{
 const DB=new TestDatabase();t.after(()=>DB.close());await DB.exec("CREATE TABLE helloasso_tokens(cache_key TEXT PRIMARY KEY,encrypted TEXT DEFAULT '',expires_at INTEGER DEFAULT 0,lock_id TEXT DEFAULT '',locked_until INTEGER DEFAULT 0)");
 const requests:any[]=[];
 t.mock.method(globalThis,'fetch',async(url:any,options:any={})=>{
  requests.push([String(url),options.method]);
  if(String(url).endsWith('/oauth2/token'))return Response.json({access_token:'private-test-token',expires_in:1800});
  if(String(url).endsWith('/users/me/organizations'))return Response.json({data:[{organizationSlug:'club-prod'}]});
  if(String(url).endsWith('/organizations/club-prod'))return Response.json({isCashInCompliant:true});
  throw Error('Unexpected request');
 });
 const env={APP_ENV:'production',HELLOASSO_CLIENT_ID:'id',HELLOASSO_CLIENT_SECRET:'secret',TRACKING_SECRET:'x'.repeat(64),ORDERS:DB} as any;
 assert.equal(apiBase(env),'https://api.helloasso.com');
 const result=await connectionStatus(env,'club-prod');assert.equal(result.can_receive_payments,true);assert.doesNotMatch(JSON.stringify(result),/private-test-token/);
 assert.deepEqual(requests,[['https://api.helloasso.com/oauth2/token','POST'],['https://api.helloasso.com/v5/users/me/organizations','GET'],['https://api.helloasso.com/v5/organizations/club-prod','GET']]);
});

test('mails production : client et club gardent leurs vrais destinataires même avec MAIL_TEST_TO',()=>{
 const env={APP_ENV:'production',MAIL_TEST_TO:'tester@example.org'} as any,settings={contact_email:'club@example.org'} as any,order={email:'client@example.org'};
 assert.equal(mailRecipient(env,settings,{audience:'customer'},order),'client@example.org');assert.equal(mailRecipient(env,settings,{audience:'club'},order),'club@example.org');
 assert.equal(mailRecipient({...env,APP_ENV:'staging'},settings,{audience:'customer'},order),'tester@example.org');
});

test('préparation production : paramètres manquants détectés et configuration SMTP sans redirection de test implicite',()=>{
 const config=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
 const incomplete=structuredClone(config);incomplete.d1_databases=incomplete.d1_databases.filter((b:any)=>b.binding!=='ORDERS');delete incomplete.vars.HELLOASSO_ORGANIZATION_SLUG;
 assert.ok(productionIssues(incomplete).some(s=>s.includes('ORDERS')));assert.ok(productionIssues(incomplete).some(s=>s.includes('HELLOASSO')));
 const folder=mkdtempSync(join(tmpdir(),'fce-prod-'));try{
  const file=join(folder,'config.json');writeFileSync(file,JSON.stringify(config));
  const r=spawnSync(process.execPath,['scripts/configure-ovh-mail.mjs','--env','production','--config',file],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
  const saved=JSON.parse(readFileSync(file,'utf8'));assert.equal(saved.vars.MAIL_TEST_TO,undefined);assert.deepEqual(saved.env.staging,config.env.staging);
 }finally{rmSync(folder,{recursive:true,force:true});}
});

test('préparation CLI : exports et médias téléchargés dans un dossier privé, aucune écriture distante',()=>{
 const folder=mkdtempSync(join(tmpdir(),'fce-prod-export-'));
 try{
  const config=JSON.parse(readFileSync('wrangler.jsonc','utf8'));writeFileSync(join(folder,'wrangler.jsonc'),JSON.stringify(config));
  const fake=join(folder,'node_modules/wrangler/bin');mkdirSync(fake,{recursive:true});
  writeFileSync(join(fake,'wrangler.js'),`
const fs=require('node:fs'),args=process.argv.slice(2),value=k=>args[args.indexOf(k)+1];
fs.appendFileSync('calls.jsonl',JSON.stringify(args)+'\\n');
if(args[0]==='r2'&&args[1]==='object'&&args[2]==='get'){if(process.env.FAIL_MEDIA)process.exit(1);fs.writeFileSync(value('--file'),'test-image');process.exit(0);}
if(args[0]!=='d1'||args[1]!=='execute')process.exit(2);
const sql=value('--command'),stage=value('--env')==='staging';
const names=['shop_categories','shop_suppliers','shop_personalizations','shop_products','shop_variants','shop_options','shop_settings','site_media','tournaments','tournament_sales','tournament_teams'];
let rows=[];
if(sql.includes('sqlite_master'))rows=names.map(name=>({name}));
else if(sql.startsWith('PRAGMA'))rows=[{name:'required'}];
else if(!sql.startsWith('SELECT'))process.exit(3);
else if(stage&&sql==='SELECT * FROM shop_products')rows=[{id:1,slug:'test',name:'Test',image_key:'uploads/test.webp'}];
console.log(JSON.stringify([{success:true,results:rows}]));
`);
  const cli=resolve('scripts/prepare-production.mjs');
  const result=spawnSync(process.execPath,[cli,'--release','test-release'],{cwd:folder,encoding:'utf8'});assert.equal(result.status,0,result.stderr);
  const base=join(folder,'.production-preparation/test-release');
  const manifest=JSON.parse(readFileSync(join(base,'manifest.json'),'utf8'));assert.equal(manifest.counts.articles,1);assert.equal(manifest.media.length,1);assert.equal(manifest.media[0].bytes,10);
  assert.equal(readFileSync(join(base,manifest.media[0].file),'utf8'),'test-image');
  assert.ok(readFileSync(join(folder,'calls.jsonl'),'utf8').trim().split('\n').map(s=>JSON.parse(s)).every(a=>a[0]==='d1'?(a.includes('--command')&&/^(SELECT|PRAGMA)/.test(a[a.indexOf('--command')+1])):a[2]==='get'));
  const failed=spawnSync(process.execPath,[cli,'--release','failed-release','--media-source','r2'],{cwd:folder,encoding:'utf8',env:{...process.env,FAIL_MEDIA:'1'}});assert.notEqual(failed.status,0);assert.equal(existsSync(join(folder,'.production-preparation/failed-release/manifest.json')),false);
 }finally{rmSync(folder,{recursive:true,force:true});}
});

test('médias publics : GET HTTPS sans redirection et refus des pages de connexion',async()=>{
 const calls:any[]=[];
 const result=await publicMedia('https://staging.example.org','uploads/photo club.webp',async(url:any,options:any)=>{calls.push([String(url),options]);return new Response('bytes',{headers:{'content-type':'image/webp'}});});
 assert.equal(result.bytes.toString(),'bytes');assert.equal(result.content_type,'image/webp');assert.equal(calls[0][0],'https://staging.example.org/media/uploads/photo%20club.webp');assert.equal(calls[0][1].redirect,'error');
 await assert.rejects(()=>publicMedia('https://staging.example.org','photo.webp',async()=>new Response('<html>Login</html>',{headers:{'content-type':'text/html'}})),/non média/);
 await assert.rejects(()=>publicMedia('http://staging.example.org','photo.webp'),/HTTPS/);
});

test('compte rendu Actions : seul le statut contrôlé est publié, branche main inchangée',()=>{
 const folder=mkdtempSync(join(tmpdir(),'fce-prod-report-'));
 const run=(command:string,args:string[],cwd=folder,env=process.env)=>spawnSync(command,args,{cwd,env,encoding:'utf8'});
 try{
  assert.equal(run('git',['init','--bare','remote.git']).status,0);assert.equal(run('git',['init','work']).status,0);
  const work=join(folder,'work');assert.equal(run('git',['remote','add','origin',join(folder,'remote.git')],work).status,0);
  const data=join(work,'.production-preparation/preparation-123');mkdirSync(data,{recursive:true});
  writeFileSync(join(data,'source.json'),JSON.stringify({private:'must not be committed'}));
  writeFileSync(join(data,'manifest.json'),JSON.stringify({counts:{articles:4},sql_sha256:{shop:'abc',tournaments:'def'}}));
  const result=run(process.execPath,[resolve('scripts/production-report.mjs')],work,{...process.env,GITHUB_RUN_ID:'123',GITHUB_SHA:'code-sha',GITHUB_REPOSITORY:'club/site',PREPARATION_OUTCOME:'success',PR_OUTCOME:'success',PR_URL:'https://github.com/club/site/pull/1'});
  assert.equal(result.status,0,result.stderr);
  const remote=join(folder,'remote.git'),ref='refs/heads/release/production-preparation-report';
  const files=run('git',['ls-tree','--name-only',ref],remote);assert.equal(files.stdout.trim(),'status.json');
  const status=JSON.parse(run('git',['show',ref+':status.json'],remote).stdout);assert.equal(status.counts.articles,4);assert.equal(status.production_writes,0);assert.doesNotMatch(JSON.stringify(status),/must not be committed/);
  assert.notEqual(run('git',['rev-parse','--verify','refs/heads/main'],remote).status,0);
 }finally{rmSync(folder,{recursive:true,force:true});}
});

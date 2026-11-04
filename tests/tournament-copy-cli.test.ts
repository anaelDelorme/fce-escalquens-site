import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,mkdirSync,copyFileSync,writeFileSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

function fixture(){
 const folder=mkdtempSync(join(process.cwd(),'.tournaments-copy-test-'));
 mkdirSync(join(folder,'scripts'));mkdirSync(join(folder,'node_modules/wrangler/bin'),{recursive:true});
 for(const file of ['copy-tournaments.mjs','configure-tournaments.mjs','tournaments-transfer.mjs'])copyFileSync(join(process.cwd(),'scripts',file),join(folder,'scripts',file));
 writeFileSync(join(folder,'wrangler.jsonc'),JSON.stringify({d1_databases:[],env:{staging:{d1_databases:[{binding:'DB',database_id:'11111111-1111-4111-8111-111111111111'},{binding:'ORDERS',database_id:'22222222-2222-4222-8222-222222222222'},{binding:'TOURNAMENTS',database_id:'33333333-3333-4333-8333-333333333333',migrations_dir:'migrations-tournaments'}]}}}));
 const site=new DatabaseSync(join(folder,'DB.sqlite'));site.exec("CREATE TABLE venues(id INTEGER PRIMARY KEY,name TEXT);CREATE TABLE tournaments(id INTEGER PRIMARY KEY,slug TEXT,name TEXT,starts_on TEXT,venue TEXT,venue_id INTEGER,registration_url TEXT);CREATE TABLE tournament_teams(id INTEGER PRIMARY KEY,tournament_id INTEGER,team_id INTEGER,notes TEXT);CREATE TABLE tournament_sales(tournament_id INTEGER PRIMARY KEY,enabled INTEGER,fee_cents INTEGER);INSERT INTO venues VALUES(1,'Stade');INSERT INTO tournaments VALUES(1,'tournoi','Tournoi test','2027-06-10','',1,'https://ancien-formulaire.example');INSERT INTO tournament_sales VALUES(1,0,4900);");site.close();
 const orders=new DatabaseSync(join(folder,'ORDERS.sqlite'));
 for(const file of readdirSync(new URL('../migrations-orders/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())orders.exec(readFileSync(new URL(`../migrations-orders/${file}`,import.meta.url),'utf8'));
 orders.close();
 writeFileSync(join(folder,'node_modules/wrangler/package.json'),JSON.stringify({type:'commonjs'}));
 const target=new DatabaseSync(join(folder,'TOURNAMENTS.sqlite'));for(const file of readdirSync(new URL('../migrations-tournaments/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())target.exec(readFileSync(new URL(`../migrations-tournaments/${file}`,import.meta.url),'utf8'));target.close();
 writeFileSync(join(folder,'node_modules/wrangler/bin/wrangler.js'),String.raw`
const {DatabaseSync}=require('node:sqlite');const {readFileSync}=require('node:fs');
const args=process.argv.slice(2),db=new DatabaseSync(args[2]+'.sqlite');
const file=args.indexOf('--file');
if(file>=0){
 if(process.env.TOURNEY_TEST_FAIL_IMPORT==='1'){console.log('Import progress containing private diagnostic data');process.exit(1);}
 if(process.env.TOURNEY_TEST_SKIP_IMPORT!=='1')db.exec(readFileSync(args[file+1],'utf8'));
 console.log('Checking if file needs uploading\nUploading complete.');
 console.log(JSON.stringify([{results:[{'Total queries executed':1}],success:true}]));
}else{const sql=args[args.indexOf('--command')+1];const rows=db.prepare(sql).all();console.log(JSON.stringify([{results:rows,success:true}]));}
db.close();
`);
 return folder;
}

function run(folder:string,flags:Record<string,string>={}){return spawnSync(process.execPath,['scripts/copy-tournaments.mjs','--env','staging','--apply'],{cwd:folder,encoding:'utf8',env:{...process.env,...flags},timeout:30000});}
function inspect(folder:string,sql:string){const db=new DatabaseSync(join(folder,'TOURNAMENTS.sqlite'));try{return db.prepare(sql).all();}finally{db.close();}}
test('CLI copie : progression non JSON de --file acceptée, puis contrôle réel des lignes avant validation',()=>{
 const folder=fixture();try{const result=run(folder);assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/Copie vérifiée/);assert.equal(inspect(folder,"SELECT id FROM module_imports WHERE id='v5.2'").length,1);const rows=inspect(folder,'SELECT name,venue,registration_url FROM tournaments');assert.equal(rows[0].venue,'Stade');assert.equal(rows[0].registration_url,null);}finally{rmSync(folder,{recursive:true,force:true});}
});
test('CLI copie : reprise après import déjà écrit, sans effacement ni doublon',()=>{
 const folder=fixture();try{const db=new DatabaseSync(join(folder,'TOURNAMENTS.sqlite'));db.exec("INSERT INTO module_imports(id,imported_at) VALUES('v5.2-started',0);INSERT INTO tournaments(id,slug,name,starts_on,venue) VALUES(1,'tournoi','Tournoi test','2027-06-10','Stade');");db.close();const result=run(folder);assert.equal(result.status,0,result.stderr);assert.equal(inspect(folder,'SELECT id FROM tournaments').length,1);assert.equal(inspect(folder,"SELECT id FROM module_imports WHERE id='v5.2'").length,1);}finally{rmSync(folder,{recursive:true,force:true});}
});
test('CLI copie : un exit 0 sans lignes importées ne suffit pas pour créer le marqueur final',()=>{
 const folder=fixture();try{const result=run(folder,{TOURNEY_TEST_SKIP_IMPORT:'1'});assert.notEqual(result.status,0);assert.match(result.stderr,/Copie incomplète/);assert.equal(inspect(folder,"SELECT id FROM module_imports WHERE id='v5.2'").length,0);}finally{rmSync(folder,{recursive:true,force:true});}
});
test('CLI copie : échec de commande refusé sans exposer sa sortie privée',()=>{
 const folder=fixture();try{const result=run(folder,{TOURNEY_TEST_FAIL_IMPORT:'1'});assert.notEqual(result.status,0);assert.match(result.stderr,/Échec D1/);assert.doesNotMatch(result.stdout+result.stderr,/private diagnostic data/);assert.equal(inspect(folder,"SELECT id FROM module_imports WHERE id='v5.2'").length,0);}finally{rmSync(folder,{recursive:true,force:true});}
});
test('CLI copie : responsables initialisés avant la copie conservés, désactivation locale non écrasée',()=>{
 const folder=fixture();try{
  const source=new DatabaseSync(join(folder,'ORDERS.sqlite'));source.exec("INSERT INTO tournament_admins(email,name,active) VALUES('club@example.org','Nom source',1);");source.close();
  const target=new DatabaseSync(join(folder,'TOURNAMENTS.sqlite'));target.exec("INSERT INTO tournament_admins(email,name,active) VALUES('club@example.org','Nom modifié',0),('premier@example.org','Premier responsable',1);");target.close();
  const result=run(folder);assert.equal(result.status,0,result.stderr);assert.equal(inspect(folder,"SELECT id FROM module_imports WHERE id='v5.2'").length,1);
  const admins=inspect(folder,'SELECT email,name,active FROM tournament_admins ORDER BY email');assert.equal(admins.length,2);assert.equal(admins[0].name,'Nom modifié');assert.equal(admins[0].active,0);assert.equal(admins[1].active,1);
 }finally{rmSync(folder,{recursive:true,force:true});}
});
test('CLI copie : reprise avec administrateurs supplémentaires et adresses insensibles à la casse',()=>{
 const folder=fixture();try{
  const source=new DatabaseSync(join(folder,'ORDERS.sqlite'));source.exec("INSERT INTO tournament_admins(email,name,active) VALUES('CLUB@example.org','Source',1),('nouveau@example.org','À copier',1);");source.close();
  const target=new DatabaseSync(join(folder,'TOURNAMENTS.sqlite'));target.exec("INSERT INTO module_imports(id,imported_at) VALUES('v5.2-started',0);INSERT INTO tournament_admins(email,name,active) VALUES('club@example.org','Local',0),('premier@example.org','Premier',1);");target.close();
  const result=run(folder);assert.equal(result.status,0,result.stderr);const admins=inspect(folder,'SELECT email,active FROM tournament_admins ORDER BY email');assert.equal(admins.length,3);assert.equal(admins[0].email,'club@example.org');assert.equal(admins[0].active,0);assert.equal(admins[1].email,'nouveau@example.org');assert.equal(inspect(folder,"SELECT id FROM module_imports WHERE id='v5.2'").length,1);
 }finally{rmSync(folder,{recursive:true,force:true});}
});
test('CLI copie : les lignes supplémentaires hors responsables restent bloquantes',()=>{
 const folder=fixture();try{
  const target=new DatabaseSync(join(folder,'TOURNAMENTS.sqlite'));target.exec("INSERT INTO module_imports(id,imported_at) VALUES('v5.2-started',0);INSERT INTO tournaments(id,slug,name,starts_on) VALUES(99,'autre','Autre tournoi','2027-07-01');");target.close();
  const result=run(folder);assert.notEqual(result.status,0);assert.match(result.stderr,/Nombre de lignes inattendu dans tournaments \(source : 1, destination : 2\)/);assert.equal(inspect(folder,"SELECT id FROM module_imports WHERE id='v5.2'").length,0);
 }finally{rmSync(folder,{recursive:true,force:true});}
});
test('CLI copie : tous les responsables source doivent être présents malgré la tolérance des ajouts locaux',()=>{
 const folder=fixture();try{
  const source=new DatabaseSync(join(folder,'ORDERS.sqlite'));source.exec("INSERT INTO tournament_admins(email,name,active) VALUES('source@example.org','Source',1);");source.close();
  const target=new DatabaseSync(join(folder,'TOURNAMENTS.sqlite'));target.exec("INSERT INTO module_imports(id,imported_at) VALUES('v5.2-started',0);INSERT INTO tournaments(id,slug,name,starts_on,venue) VALUES(1,'tournoi','Tournoi test','2027-06-10','Stade');INSERT INTO tournament_sales(tournament_id,enabled,fee_cents) VALUES(1,0,4900);INSERT INTO tournament_admins(email,name,active) VALUES('premier@example.org','Premier',1);");target.close();
  const result=run(folder,{TOURNEY_TEST_SKIP_IMPORT:'1'});assert.notEqual(result.status,0);assert.match(result.stderr,/Copie incomplète pour tournament_admins/);assert.equal(inspect(folder,"SELECT id FROM module_imports WHERE id='v5.2'").length,0);
 }finally{rmSync(folder,{recursive:true,force:true});}
});

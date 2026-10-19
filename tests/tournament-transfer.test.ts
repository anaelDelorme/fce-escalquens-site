import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {TestDatabase} from './d1';
import {copyStatements} from '../scripts/tournaments-transfer.mjs';
import {formFields,formAnswers} from '../src/tournaments/forms';
test('copie tournois : schéma dédié, données échappées, idempotence et refus des commandes boutique',async()=>{
 const db=new TestDatabase();try{await db.exec(readFileSync(new URL('../migrations-tournaments/0001_tournaments.sql',import.meta.url),'utf8'));
 const input={tournaments:[{id:1,slug:'tournoi',name:"Tournoi d'Escalquens",starts_on:'2027-06-10',registration_url:'https://ancienne-inscription.example'}],tournament_sales:[{tournament_id:1,fee_cents:1000,enabled:0}],tournament_admins:[{email:"test'o@example.org",name:'Responsable',active:1}]};const sql=copyStatements(input).join('\n');await db.exec(sql);await db.exec(sql);
 const row=await db.prepare('SELECT * FROM tournaments').first<any>();assert.equal(row.name,"Tournoi d'Escalquens");assert.equal(row.registration_url,null);assert.equal((await db.prepare('SELECT count(*) n FROM tournaments').first<any>()).n,1);assert.equal((await db.prepare('PRAGMA foreign_key_check').all()).results.length,0);assert.throws(()=>copyStatements({orders:[{id:'test',kind:'shop'}]}),/boutique/);
 }finally{db.close();}
});
test('binding tournois : conserve les autres bases et refuse leur réutilisation',()=>{
 const folder=mkdtempSync(join(process.cwd(),'.access-test-'));try{const file=join(folder,'wrangler.jsonc'),id='44444444-4444-4444-8444-444444444444',config={d1_databases:[{binding:'DB',database_id:'11111111-1111-4111-8111-111111111111'}],env:{staging:{vars:{CF_ACCESS_SHOP_AUD:'unchanged'},d1_databases:[{binding:'DB',database_id:'22222222-2222-4222-8222-222222222222'},{binding:'ORDERS',database_id:'33333333-3333-4333-8333-333333333333'}]}}};writeFileSync(file,JSON.stringify(config));
 const args=['scripts/configure-tournaments.mjs','--config',file,'--env','staging','--id',id];let result=spawnSync(process.execPath,args,{encoding:'utf8'});assert.equal(result.status,0,result.stderr);const updated=JSON.parse(readFileSync(file,'utf8'));assert.deepEqual(updated.d1_databases,config.d1_databases);assert.deepEqual(updated.env.staging.d1_databases.slice(0,2),config.env.staging.d1_databases);assert.equal(updated.env.staging.vars.CF_ACCESS_SHOP_AUD,'unchanged');assert.equal(updated.env.staging.d1_databases[2].migrations_dir,'migrations-tournaments');
 result=spawnSync(process.execPath,[...args.slice(0,-1),config.env.staging.d1_databases[1].database_id],{encoding:'utf8'});assert.notEqual(result.status,0);assert.equal(JSON.parse(readFileSync(file,'utf8')).env.staging.d1_databases[2].database_id,id);
 }finally{rmSync(folder,{recursive:true,force:true});}
});
test('formulaires : champs uniques et réponses validées côté serveur',()=>{
 const fields=formFields([{id:'transport',label:'Transport',type:'select',required:true,choices:['Bus','Voiture']},{id:'checked',label:'Confirmation',type:'checkbox',required:false}]);assert.deepEqual(formAnswers(fields,{transport:'Bus',checked:false}),{transport:'Bus',checked:false});assert.throws(()=>formAnswers(fields,{transport:'Vélo',checked:false}));assert.throws(()=>formFields([{id:'x',label:'X',type:'html'}]));assert.throws(()=>formFields([{id:'x',label:'X',type:'text'},{id:'x',label:'X2',type:'text'}]));
});

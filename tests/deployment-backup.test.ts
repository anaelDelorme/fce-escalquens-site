import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {captureRestorationPoints,verifyRestorationPoints} from '../scripts/deployment-backup.mjs';
import {packArchive,unpackArchive} from '../scripts/production-archive.mjs';

const config=()=>JSON.parse(readFileSync('wrangler.jsonc','utf8'));
const bookmark='00000001-00000002-00004dfe-9e713dfcb7310c4a6ef61b093a8bdaaa';
const setup=(t:any)=>{const folder=mkdtempSync(join(tmpdir(),'fce-restoration-points-'));t.after(()=>rmSync(folder,{recursive:true,force:true}));return folder;};
test('avant déploiement : points D1 en lecture pour trois bases au même instant, archive chiffrée relue et CLI de vérification',async t=>{
 const folder=setup(t),source=join(folder,'source'),output=join(folder,'points.fce'),restored=join(folder,'restored'),calls:string[][]=[];
 captureRestorationPoints(config(),source,(args:string[])=>{calls.push(args);return JSON.stringify({bookmark,private_response:'ne pas conserver'});});
 assert.deepEqual(calls.map(args=>args.slice(0,4)),['DB','ORDERS','TOURNAMENTS'].map(binding=>['d1','time-travel','info',binding]));
 assert.ok(calls.every(args=>args[args.indexOf('--env')+1]===''&&args.includes('--json')));
 assert.equal(new Set(calls.map(args=>args[args.indexOf('--timestamp')+1])).size,1);
 const manifest=JSON.parse(readFileSync(join(source,'restore-points.json'),'utf8'));
 assert.deepEqual(manifest.databases.map((p:any)=>({binding:p.binding,database_id:p.database_id})),config().d1_databases.map((p:any)=>({binding:p.binding,database_id:p.database_id})));
 assert.doesNotMatch(JSON.stringify(manifest),/private_response|ne pas conserver/);
 assert.deepEqual(verifyRestorationPoints(config(),source),{restore_points_verified:true});
 const password='test-points-restore-'.repeat(4);
 await packArchive(source,output,password);assert.equal(readFileSync(output).includes(Buffer.from(bookmark)),false);
 await unpackArchive(output,restored,password);
 assert.deepEqual(verifyRestorationPoints(config(),restored),{restore_points_verified:true});
 const cli=spawnSync(process.execPath,[resolve('scripts/deployment-backup.mjs'),'--action','verify','--folder',restored],{encoding:'utf8'});
 assert.equal(cli.status,0,cli.stderr);assert.deepEqual(JSON.parse(cli.stdout),{restore_points_verified:true});
 assert.doesNotMatch(cli.stdout+cli.stderr,new RegExp(bookmark));
});

test('avant déploiement : point absent, incomplet, altéré, ancien ou d’une autre exécution bloque la validation',t=>{
 const folder=setup(t),settings=config();
 for(const failing of ['DB','ORDERS','TOURNAMENTS']){
  const source=join(folder,'failure-'+failing);
  assert.throws(()=>captureRestorationPoints(settings,source,(args:string[])=>JSON.stringify(args[3]===failing?{}:{bookmark})),/Point de restauration D1 absent/);
  assert.equal(existsSync(source),false);
 }
 const source=join(folder,'valid');captureRestorationPoints(settings,source,()=>JSON.stringify({bookmark}));
 const manifest=JSON.parse(readFileSync(join(source,'restore-points.json'),'utf8'));
 const save=(data:any,checksum=true)=>{const bytes=JSON.stringify(data);writeFileSync(join(source,'restore-points.json'),bytes);if(checksum)writeFileSync(join(source,'restore-points.sha256'),createHash('sha256').update(bytes).digest('hex'));};
 save({...manifest,version:2},false);assert.throws(()=>verifyRestorationPoints(settings,source),/modifiés ou incomplets/);
 save({...manifest,databases:manifest.databases.slice(0,2)});assert.throws(()=>verifyRestorationPoints(settings,source),/trois bases production/);
 save({...manifest,databases:manifest.databases.map((p:any,i:number)=>({...p,database_id:i===1?'wrong-id':p.database_id}))});assert.throws(()=>verifyRestorationPoints(settings,source),/trois bases production/);
 save({...manifest,created_at:new Date(Date.now()-7200000).toISOString()});assert.throws(()=>verifyRestorationPoints(settings,source),/récents de cette exécution/);
 save({...manifest,run_id:'other-run'});assert.throws(()=>verifyRestorationPoints(settings,source),/récents de cette exécution/);
 const cli=spawnSync(process.execPath,[resolve('scripts/deployment-backup.mjs'),'--action','verify','--folder',source],{encoding:'utf8'});
 assert.notEqual(cli.status,0);assert.match(cli.stderr,/Aucun déploiement autorisé/);
});

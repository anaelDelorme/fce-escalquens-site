import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {main} from '../scripts/sync-matches.mjs';
import worker from '../src/worker.ts';
import {fixture} from './helpers/d1-fixture.mjs';
import {replayBrowser} from './helpers/browser-fixture.mjs';
async function run({dryRun=false,badRanking=false,verify=false}={}){
 const {html}=await replayBrowser();
 const capture=badRanking?html.replace('"detected":1,"parsed":1','"detected":1,"parsed":0'):html;
 const {db,env}=fixture();env.FCE_SYNC_TOKEN='secret-test-token';globalThis.caches={default:{delete:async()=>true}};
 const reportDir=mkdtempSync(join(tmpdir(),'fff-run-'));let writes=0;
 const result=await main({ZENROWS_API_KEY:'secret-test-key',FCE_SYNC_TOKEN:env.FCE_SYNC_TOKEN,FCE_SITE_URL:'https://test.local',SYNC_DRY_RUN:dryRun?'1':'0',...(verify?{SYNC_VERIFY_DATE:'2026-10-03',SYNC_VERIFY_COUNT:'14'}:{})},{
  now:()=>new Date('2026-10-02T18:00:00Z'),reportDir,print:()=>{},request:async(url,options)=>{
   if(new URL(url).hostname==='api.zenrows.com')return new Response(capture,{headers:{'x-request-cost':'0.025'}});
   writes++;return worker.fetch(new Request(url,options),env,{});
  }
 });
 return {db,result,reportDir,writes};
}
test('complete CLI orchestration writes running then success, persists replayable evidence, and excludes secrets from logs',async()=>{
 const {db,result,reportDir}=await run();
 try{
  assert.equal(result.status,'success');assert.equal(result.imported_count,9);
  assert.deepEqual(db.prepare('SELECT status FROM sync_runs ORDER BY id').all().map(r=>r.status),['running','success']);
  const log=readFileSync(join(reportDir,'events.jsonl'),'utf8');assert.ok(!log.includes('secret-test'));
  assert.ok(JSON.parse(readFileSync(join(reportDir,'zenrows.json'))).scripts.length>0);
  assert.equal(JSON.parse(readFileSync(join(reportDir,'result.json'))).status,'success');
 }finally{db.close();rmSync(reportDir,{recursive:true,force:true});}
});
test('audit mode performs no Worker write, including status logging',async()=>{
 const {db,result,reportDir,writes}=await run({dryRun:true});
 try{assert.equal(result.status,'success');assert.equal(writes,0);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM matches').get().n,0);}
 finally{db.close();rmSync(reportDir,{recursive:true,force:true});}
});
test('a ranking collection failure publishes partial status after verified match import',async()=>{
 const {db,result,reportDir}=await run({badRanking:true});
 try{assert.equal(result.status,'partial');assert.equal(result.imported_count,9);assert.equal(db.prepare('SELECT status FROM sync_runs ORDER BY id DESC LIMIT 1').get().status,'partial');}
 finally{db.close();rmSync(reportDir,{recursive:true,force:true});}
});

test('the actual 9-versus-14 acceptance requirement fails an audit without importing or claiming recovery',async()=>{
 const {db,result,reportDir,writes}=await run({dryRun:true,verify:true});
 try{assert.equal(result.status,'error');assert.equal(writes,0);assert.match(result.sources[0].error,/9 événements reçus, 14 attendus/);}
 finally{db.close();rmSync(reportDir,{recursive:true,force:true});}
});

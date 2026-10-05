import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../src/worker.ts';
import {fixture} from './helpers/d1-fixture.mjs';
import {replayBrowser} from './helpers/browser-fixture.mjs';
import {normalizeEpreuves,normalizeEpreuvesFal} from '../scripts/lib/fff-normalize.mjs';
import {createSyncClient} from '../scripts/lib/sync-client.mjs';
import {synchronize} from '../scripts/lib/sync-engine.mjs';
const actualStandings=JSON.parse(readFileSync(new URL('fixtures/published-standings.json',import.meta.url)));
async function collection(){
 const {payloads}=await replayBrowser();payloads.standings=actualStandings;payloads.standingsMeta={detected:14,parsed:14,rows:84};
 return {payloads,rows:[...normalizeEpreuves(payloads.matches['hydra:member']),...normalizeEpreuvesFal(payloads.fal,payloads.falGamePayloads)]};
}
function connection({intercept}={}){
 const {db,env}=fixture();env.FCE_SYNC_TOKEN='test-token';
 globalThis.caches={default:{delete:async()=>true}};
 const client=createSyncClient({siteUrl:'https://test.local',token:'test-token',sleep:async()=>{},request:async(url,options)=>{
  if(intercept){const response=await intercept(url,options,db);if(response)return response;}
  return worker.fetch(new Request(url,options),env,{});
 }});
 return {db,client};
}
test('browser replay → parsing → real Worker → SQLite → readback imports 9 actual events and 84 actual standings',async()=>{
 const source=await collection(),{db,client}=connection();
 const result=await synchronize({collection:source,client,chunkSize:4});
 assert.equal(result.status,'success');assert.equal(result.imported_count,9);assert.equal(result.verified_count,9);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM matches').get().n,9);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM standings').get().n,84);
 const before=db.prepare('SELECT * FROM matches ORDER BY id').all();
 const repeat=await synchronize({collection:source,client});assert.equal(repeat.status,'success');
 assert.deepEqual(db.prepare('SELECT * FROM matches ORDER BY id').all(),before);db.close();
});
test('rankings failure retains old rankings while updating verified matches and reporting partial failure',async()=>{
 const source=await collection(),{db,client}=connection();
 await client.standings(actualStandings);
 const before=db.prepare('SELECT * FROM standings ORDER BY id').all();source.payloads.standingsMeta.parsed=0;
 const result=await synchronize({collection:source,client});
 assert.equal(result.status,'partial');assert.equal(result.verified_count,9);assert.deepEqual(db.prepare('SELECT * FROM standings ORDER BY id').all(),before);db.close();
});
test('a lying import acknowledgement is detected by database readback',async()=>{
 const source=await collection(),{db,client}=connection({intercept:async(url,options)=>url.endsWith('/matches')?Response.json({ok:true,received:JSON.parse(options.body).rows.length,accepted:JSON.parse(options.body).rows.length}):null});
 const result=await synchronize({collection:source,client});
 assert.equal(result.status,'partial');assert.equal(result.verified_count,0);assert.match(result.sources.find(s=>s.source==='matches').error,/409/);db.close();
});
test('failure in the second batch records the first batch count and a rerun completes safely',async()=>{
 const source=await collection();let imports=0,fail=true;
 const {db,client}=connection({intercept:async url=>url.endsWith('/matches')&&++imports>=2&&fail?new Response('database unavailable',{status:503}):null});
 const result=await synchronize({collection:source,client,chunkSize:4});
 assert.equal(result.status,'partial');assert.equal(result.imported_count,4);assert.equal(result.verified_count,4);
 fail=false;assert.equal((await synchronize({collection:source,client,chunkSize:4})).status,'success');assert.equal(db.prepare('SELECT COUNT(*) AS n FROM matches').get().n,9);db.close();
});
test('scored 0-0 conflicts are retained and reported after readback',async()=>{
 const source=await collection(),{db,client}=connection();await synchronize({collection:source,client});
 const match=source.rows.find(r=>r.source==='fff');db.prepare("UPDATE matches SET home_score=0,away_score=0,status='finished' WHERE source=? AND source_id=?").run(match.source,match.source_id);
 const before=db.prepare('SELECT * FROM matches WHERE source=? AND source_id=?').get(match.source,match.source_id);
 const events=[];const result=await synchronize({collection:source,client,log:(...args)=>events.push(args)});
 assert.equal(result.status,'success');assert.equal(result.protected_count,1);assert.ok(events.some(event=>event[1]==='protected_result_conflicts'));
 assert.deepEqual(db.prepare('SELECT * FROM matches WHERE source=? AND source_id=?').get(match.source,match.source_id),before);db.close();
});
test('400 validation failures are not retried',async()=>{
 let attempts=0;
 const client=createSyncClient({siteUrl:'https://test.local',token:'token',sleep:async()=>{},request:async()=>{attempts++;return new Response('invalid',{status:400});}});
 await assert.rejects(client.matches([{}]),/400/);assert.equal(attempts,1);
});
test('empty or truncated ranking import cannot delete previous rankings',async()=>{
 const {db,client}=connection();await client.standings(actualStandings);const before=db.prepare('SELECT * FROM standings ORDER BY id').all();
 await assert.rejects(client.standings([]),/400/);
 await assert.rejects(client.standings([{source:'fff',phase_id:'phase',team_name:'Club',position:2}]),/400/);
 assert.deepEqual(db.prepare('SELECT * FROM standings ORDER BY id').all(),before);db.close();
});

import {fixture} from './helpers/d1-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {upsertMatch} from '../src/worker.ts';
const row={source:'fff',source_id:'test',starts_at:'2026-10-03T14:00:00+02:00',home_team:'FCE',away_team:'Club',status:'scheduled'};
test('scheduled match updates, scored 0-0 match stays completely unchanged',async()=>{
 const {db,env}=fixture();await upsertMatch(env,row);
 await upsertMatch(env,{...row,venue:'Terrain',home_score:0,away_score:0,status:'finished'});
 const before=db.prepare('SELECT * FROM matches').get();
 await upsertMatch(env,{...row,home_score:8,away_score:2,venue:'Erreur',participants:[{name:'Autre'}]});
 assert.deepEqual(db.prepare('SELECT * FROM matches').get(),before);db.close();
});
test('single acquired score and manual entries are protected',async()=>{
 for(const extra of [{home_score:0},{manually_created:true}]){
  const {db,env}=fixture();await upsertMatch(env,{...row,...extra});const before=db.prepare('SELECT * FROM matches').get();
  await upsertMatch(env,{...row,away_team:'Erreur'});assert.deepEqual(db.prepare('SELECT * FROM matches').get(),before);db.close();
 }
});
test('empty or conflicting plateau collection preserves scored mini-match and its ID',async()=>{
 const {db,env}=fixture();
 const game={source_game_id:'FCE|Club|0|1',home_team:'FCE',away_team:'Club',home_score:0,away_score:1,status:'finished'};
 await upsertMatch(env,{...row,event_type:'plateau',plateau_games:[game]});
 const before=db.prepare('SELECT * FROM plateau_games').get();
 await upsertMatch(env,{...row,event_type:'plateau',plateau_games:[]});
 assert.deepEqual(db.prepare('SELECT * FROM plateau_games').get(),before);
 await upsertMatch(env,{...row,event_type:'plateau',plateau_games:[{...game,source_game_id:'new-stable-id',home_score:null,away_score:null,status:'scheduled'}]});
 assert.deepEqual(db.prepare('SELECT * FROM plateau_games').get(),before);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM plateau_games').get().n,1);db.close();
});

test('invalid row rejects the whole batch before any writes',async()=>{
 const {default:worker}=await import('../src/worker.ts');
 const {db,env}=fixture();env.FCE_SYNC_TOKEN='test-token';
 for(const invalid of [null,{...row,source:'unknown'},{...row,home_score:-1},{...row,starts_at:'invalid'}]){
  const result=await worker.fetch(new Request('https://example.test/internal/sync/matches',{method:'POST',headers:{authorization:'Bearer test-token','content-type':'application/json'},body:JSON.stringify({rows:[row,invalid]})}),env,{});
  assert.equal(result.status,400);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM matches').get().n,0);
 }
 db.close();
});

test('the acquired score lock survives clearing scores and later automatic imports',async()=>{
 const {db,env}=fixture();await upsertMatch(env,{...row,home_score:0,away_score:0,status:'finished'});
 db.prepare('UPDATE matches SET home_score=NULL,away_score=NULL').run();
 const before=db.prepare('SELECT * FROM matches').get();assert.ok(before.score_locked_at);
 await upsertMatch(env,{...row,away_team:'Wrong opponent'});assert.deepEqual(db.prepare('SELECT * FROM matches').get(),before);
 db.close();
});
test('a mini-match that once had a score survives clearing and an empty scrape',async()=>{
 const {db,env}=fixture();await upsertMatch(env,{...row,event_type:'plateau',plateau_games:[{source_game_id:'official',home_team:'FCE',away_team:'Club',home_score:0,away_score:1,status:'finished'}]});
 db.prepare('UPDATE plateau_games SET home_score=NULL,away_score=NULL').run();
 const before=db.prepare('SELECT * FROM plateau_games').get();assert.ok(before.score_locked_at);
 await upsertMatch(env,{...row,event_type:'plateau',plateau_games:[]});assert.deepEqual(db.prepare('SELECT * FROM plateau_games').get(),before);db.close();
});
test('same clubs in two different official mini-matches do not get mistaken for a legacy duplicate',async()=>{
 const {db,env}=fixture();const game={source_game_id:'official-1',home_team:'FCE',away_team:'Club',home_score:0,away_score:0,status:'finished'};
 await upsertMatch(env,{...row,event_type:'plateau',plateau_games:[game]});
 await upsertMatch(env,{...row,event_type:'plateau',plateau_games:[{...game,source_game_id:'official-2'}]});
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM plateau_games').get().n,2);db.close();
});

// Upgrade an existing schema with acquired scores, as on deployed D1 databases.
test('migration 0027 preserves and locks existing match and plateau results',()=>{
 const db=new DatabaseSync(':memory:');
 const migrationDir=new URL('../migrations/',import.meta.url);
 const files=readdirSync(migrationDir).filter(path=>path.endsWith('.sql')).sort();
 for(const file of files.filter(path=>path<'0027_')) db.exec(readFileSync(new URL(file,migrationDir),'utf8'));
 db.prepare("INSERT INTO matches(source,source_id,starts_at,home_team,away_team,home_score,away_score) VALUES('fff','upgrade','2026-10-03','FCE','Club',0,0)").run();
 const matchId=db.prepare("SELECT id FROM matches WHERE source_id='upgrade'").get().id;
 db.prepare("INSERT INTO plateau_games(plateau_match_id,source_game_id,home_team,away_team,home_score,away_score) VALUES(?,'upgrade-game','FCE','Club',0,1)").run(matchId);
 const beforeMatch=db.prepare('SELECT * FROM matches WHERE id=?').get(matchId);
 const beforeGame=db.prepare("SELECT * FROM plateau_games WHERE source_game_id='upgrade-game'").get();
 db.exec(readFileSync(new URL('0027_persistent_score_lock.sql',migrationDir),'utf8'));
 const {score_locked_at:matchLock,...afterMatch}=db.prepare('SELECT * FROM matches WHERE id=?').get(matchId);
 const {score_locked_at:gameLock,...afterGame}=db.prepare("SELECT * FROM plateau_games WHERE source_game_id='upgrade-game'").get();
 assert.ok(matchLock);assert.ok(gameLock);
 assert.deepEqual(afterMatch,{...beforeMatch});assert.deepEqual(afterGame,{...beforeGame});
 db.prepare('UPDATE matches SET home_score=NULL,away_score=NULL WHERE id=?').run(matchId);
 db.prepare("UPDATE plateau_games SET home_score=NULL,away_score=NULL WHERE source_game_id='upgrade-game'").run();
 assert.equal(db.prepare('SELECT score_locked_at FROM matches WHERE id=?').get(matchId).score_locked_at,matchLock);
 assert.equal(db.prepare("SELECT score_locked_at FROM plateau_games WHERE source_game_id='upgrade-game'").get().score_locked_at,gameLock);
 db.close();
});

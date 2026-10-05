import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {fetchZenRows,normalizeEpreuvesFal,normalizeFalGames} from '../scripts/sync-matches.mjs';
test('the actual generated browser program compiles before contacting ZenRows',async()=>{
 const original=globalThis.fetch;process.env.ZENROWS_API_KEY='fake-test-key';
 globalThis.fetch=async url=>{
  const instructions=JSON.parse(new URL(url).searchParams.get('js_instructions'));
  const program=instructions.find(row=>row.evaluate).evaluate;
  assert.doesNotThrow(()=>new vm.Script(program));
  assert.match(program,/fetchCompleteMatches/);
  return {ok:false,status:500,text:async()=>''};
 };
 try{await assert.rejects(fetchZenRows({seasonYear:2026,matches:['https://epreuves.fff.fr/api/data/matches'],fal:[]}),/500/);}finally{globalThis.fetch=original;delete process.env.ZENROWS_API_KEY;}
});
test('two plateau sites are retained and joDate is accepted when date is absent',()=>{
 const site={epreuve:{epNo:1,caCod:'U8'},phNo:1,joNo:2,siNo:3,joDate:'2026-10-03T10:00:00+02:00',equipes:[{eqCod:1,club:{clNo:101544}}]};
 const rows=normalizeEpreuvesFal({sites:[site,{...site,siNo:4}],sitesWithoutDate:[]});
 assert.equal(rows.length,2);assert.equal(rows[0].starts_at,site.joDate);
 assert.throws(()=>normalizeEpreuvesFal({sites:[{...site,joDate:null}]}),/sans date/);
});
test('mini-match fallback identity never changes with its score',()=>{
 const game={equipe1:{eqNom:'FCE',club:{clNo:101544}},equipe2:{eqNom:'Club'},score1:0,score2:0};
 const normalize=g=>normalizeFalGames({api_payloads:[{body:[g]}]})[0];
 assert.equal(normalize(game).source_game_id,normalize({...game,score1:1}).source_game_id);
 assert.equal(normalize(game).status,'finished');
});

test('mini-match identity includes squad numbers when two same-named squads share a plateau',()=>{
 const game={equipe1:{eqNom:'FCE',eqCod:1,club:{clNo:101544}},equipe2:{eqNom:'Club',eqCod:1},score1:0,score2:0};
 const second={...game,equipe1:{...game.equipe1,eqCod:2}};
 assert.equal(normalizeFalGames({api_payloads:[{body:[game,second]}]}).length,2);
});

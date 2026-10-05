import test from 'node:test';
import assert from 'node:assert/strict';
import {replayBrowser,published} from './helpers/browser-fixture.mjs';
import {normalizeEpreuves,normalizeEpreuvesFal,enrichMatchPayloads} from '../scripts/lib/fff-normalize.mjs';
import {assertCollection,assertStandings} from '../scripts/lib/fff-integrity.mjs';
import {makeTargets} from '../scripts/lib/fff-periods.mjs';
const normalize=p=>[...normalizeEpreuves(p.matches['hydra:member']),...normalizeEpreuvesFal(p.fal,p.falGamePayloads)];
test('execute real browser program on the nine published events, parse its HTML and reconcile identities',async()=>{
 const {payloads}=await replayBrowser();const rows=normalize(payloads);
 assert.equal(rows.length,9);assert.equal(payloads.daily.length,10);
 assert.deepEqual(rows.map(row=>`${row.source}/${row.source_id}`).sort(),published.expected.map(row=>`${row.source}/${row.source_id}`).sort());
 assert.doesNotThrow(()=>assertCollection(payloads,rows,payloads.reference));assert.doesNotThrow(()=>assertStandings(payloads));
});
test('daily FFF requests recover events omitted by a successful monthly response',async()=>{
 const {payloads}=await replayBrowser({mutateResponse:result=>{
  if(result.url.pathname==='/api/data/matches'&&result.url.searchParams.get('dateDebut').slice(0,10)==='2026-10-01')result.body={'hydra:totalItems':0,'hydra:member':[]};
  return result;
 }});
 const rows=normalize(payloads);assert.equal(rows.length,9);assert.doesNotThrow(()=>assertCollection(payloads,rows,payloads.reference));
});
test('one failed daily FFF page refuses validation instead of masking the failure with monthly data',async()=>{
 const {payloads}=await replayBrowser({mutateResponse:result=>{
  if(result.url.pathname==='/api/data/matches'&&result.url.searchParams.get('dateDebut').startsWith('2026-10-03'))result.status=503;
  return result;
 }});
 assert.throws(()=>assertCollection(payloads,normalize(payloads),payloads.reference),/journalier/);
});
test('stale detail enriches venue without replacing official date or acquired score',()=>{
 const primary={'hydra:member':[{donneesFormatees:{maNo:1,date:'2026-10-03',joue:true,recevant:{buts:0},visiteur:{buts:0}}}]};
 const enriched=enrichMatchPayloads(primary,[{maNo:1,date:'2025-01-01',joue:false,terrain:{nom:'Terrain'}}]);
 const item=enriched['hydra:member'][0].donneesFormatees;
 assert.equal(item.date,'2026-10-03');assert.equal(item.joue,true);assert.equal(item.recevant.buts,0);assert.equal(item.terrain.nom,'Terrain');
});
test('FFF queries use Paris day boundaries across the change from summer to winter time',()=>{
 const targets=makeTargets(new Date('2026-10-24T23:15:00Z'));
 const day=targets.days.find(day=>day.day==='2026-10-25');
 assert.equal(new URL(day.matches).searchParams.get('dateDebut'),'2026-10-25T00:00:00+02:00');
 assert.equal(new URL(day.matches).searchParams.get('dateFin'),'2026-10-25T23:59:59+01:00');
});

test('a detail with an obsolete club record cannot remove a match from the verified primary response',async()=>{
 const {payloads}=await replayBrowser({mutateResponse:result=>{
  if(result.url.pathname.startsWith('/api/matches/'))result.body={...result.body,donneesFormatees:{...result.body.donneesFormatees,recevant:{},visiteur:{},terrain:{nom:'Terrain'}}};
  return result;
 }});
 assert.equal(normalize(payloads).filter(row=>row.source==='fff').length,5);
});
test('the ten-day verification range stays inside the current football season',()=>{
 for(const date of ['2026-07-01','2027-06-30']){
  const targets=makeTargets(new Date(`${date}T12:00:00Z`));assert.equal(targets.days.length,10);
  assert.ok(targets.days.every(item=>item.day>='2026-07-01'&&item.day<='2027-06-30'));
 }
});

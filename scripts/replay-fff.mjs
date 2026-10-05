import {readFileSync} from 'node:fs';
import {epreuvesPayloadFromZenRows} from './lib/fff-response.mjs';
import {normalizeEpreuves,normalizeEpreuvesFal} from './lib/fff-normalize.mjs';
import {assertCollection,assertStandings} from './lib/fff-integrity.mjs';
if(!process.argv[2])throw new Error('Usage : node scripts/replay-fff.mjs sync-reports/source.json|zenrows.json');
const saved=JSON.parse(readFileSync(process.argv[2],'utf8'));
const payloads=saved.payloads||epreuvesPayloadFromZenRows(saved.scripts.join(''));
const rows=[...normalizeEpreuves(payloads.matches['hydra:member']),...normalizeEpreuvesFal(payloads.fal,payloads.falGamePayloads)];
const checks=[];
for(const [source,check] of [['matches',()=>assertCollection(payloads,rows,payloads.reference)],['standings',()=>assertStandings(payloads)]]){
 try{check();checks.push({source,status:'ok'});}catch(error){checks.push({source,status:'error',error:error.message});}
}
console.log(JSON.stringify({count:rows.length,checks,events:rows.map(({source,source_id,starts_at,home_team,away_team})=>({source,source_id,starts_at,home_team,away_team}))},null,2));
if(checks.some(check=>check.status==='error'))process.exitCode=1;

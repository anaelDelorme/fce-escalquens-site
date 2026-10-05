import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchCompleteMatches,assertCollection} from '../scripts/lib/fff-integrity.mjs';
const base='https://epreuves.fff.fr/api/data/matches?clNo=101544';
const payload=(ids,total=ids.length,next)=>({'hydra:member':ids.map(maNo=>({donneesFormatees:{maNo}})),'hydra:totalItems':total,'hydra:view':{'hydra:next':next}});
const response=value=>({ok:true,json:async()=>value});
test('paginate all 14 official identities instead of silently accepting 9',async()=>{
 let calls=0;
 const result=await fetchCompleteMatches(base,async()=>response(++calls===1?payload([1,2,3,4,5,6,7,8,9],14,'?clNo=101544&page=2'):payload([10,11,12,13,14],14)));
 assert.equal(calls,2);assert.equal(result['hydra:totalItems'],14);assert.equal(result['hydra:member'].length,14);
});
test('pagination fallback when Hydra next is absent',async()=>{
 const urls=[];await fetchCompleteMatches(base,async url=>{urls.push(url);return response(urls.length===1?payload([1],2):payload([2],2));});
 assert.equal(new URL(urls[1]).searchParams.get('page'),'2');
});
test('reject duplicate pages, shifting totals, missing totals, failed pages and foreign links',async()=>{
 await assert.rejects(fetchCompleteMatches(base,async()=>response(payload([1],2))),/sans nouveaux/);
 let n=0;await assert.rejects(fetchCompleteMatches(base,async()=>response(++n===1?payload([1],2):payload([2],3))),/modifié/);
 await assert.rejects(fetchCompleteMatches(base,async()=>response({'hydra:member':[]})),/total absent/);
 await assert.rejects(fetchCompleteMatches(base,async()=>({ok:false,status:503})),/503/);
 await assert.rejects(fetchCompleteMatches(base,async()=>response(payload([1],2,'https://evil.example/api/data/matches'))),/hors périmètre/);
});
test('pagination refuses changes in announced total even when all responses are 200',async()=>{
 let calls=0;await assert.rejects(fetchCompleteMatches(base,async()=>response(++calls===1?payload([1],2):payload([2],1))),/modifié/);
});

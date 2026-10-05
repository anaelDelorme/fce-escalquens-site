import {pathToFileURL} from 'node:url';
import {mkdirSync,appendFileSync,writeFileSync} from 'node:fs';
import {fetchZenRows} from './lib/fff-transport.mjs';
import {normalizeEpreuves,normalizeEpreuvesFal} from './lib/fff-normalize.mjs';
import {makeTargets,parisDay} from './lib/fff-periods.mjs';
import {createSyncClient} from './lib/sync-client.mjs';
import {synchronize} from './lib/sync-engine.mjs';
export {fetchZenRows} from './lib/fff-transport.mjs';
export {mergeMatchPayloads,mergeFalPayloads,normalizeEpreuves,normalizeEpreuvesFal,normalizeFalGames} from './lib/fff-normalize.mjs';
const VERSION='2026.10.05-integrity-36';

export async function main(env=process.env,{request=fetch,now=()=>new Date(),reportDir='sync-reports',print=console.log}={}){
  const runId=env.GITHUB_RUN_ID||crypto.randomUUID(),dryRun=env.SYNC_DRY_RUN==='1';
  const secrets=[env.FCE_SYNC_TOKEN,env.ZENROWS_API_KEY].filter(Boolean);
  const redact=value=>secrets.reduce((text,secret)=>text.replaceAll(secret,'[REDACTED]'),String(value));
  mkdirSync(reportDir,{recursive:true});
  const report=(name,data)=>writeFileSync(`${reportDir}/${name}.json`,redact(JSON.stringify(data,null,2)));
  const log=(level,event,data={})=>{
    const entry=redact(JSON.stringify({at:new Date().toISOString(),run_id:runId,level,event,...data}));
    appendFileSync(`${reportDir}/events.jsonl`,entry+'\n');print(entry);
  };
  const previousLog=console.log;
  // Retain diagnostic output from the existing standings collector and transport.
  console.log=(...args)=>{const message=redact(args.map(value=>typeof value==='string'?value:JSON.stringify(value)).join(' '));appendFileSync(`${reportDir}/events.jsonl`,JSON.stringify({at:new Date().toISOString(),run_id:runId,level:'info',event:'transport',message})+'\n');print(message);};
  let client,summary={status:'error',imported_count:0,sources:[]};
  try{
    if(!env.ZENROWS_API_KEY)throw new Error('ZENROWS_API_KEY absent');
    if(!dryRun&&(!env.FCE_SITE_URL||!env.FCE_SYNC_TOKEN))throw new Error('FCE_SITE_URL ou FCE_SYNC_TOKEN absent');
    client=createSyncClient({siteUrl:env.FCE_SITE_URL||'',token:env.FCE_SYNC_TOKEN,log,request});
    if(!dryRun)await client.status({status:'running',imported_count:0,sources:[{source:'collector',run_id:runId,version:VERSION}]});
    const targets=makeTargets(now());
    const payloads=await fetchZenRows(targets,{apiKey:env.ZENROWS_API_KEY,request,onSnapshot:snapshot=>report('zenrows',snapshot)});
    // Source snapshots are saved before normalization/validation, so failures can be replayed.
    report('source',{run_id:runId,version:VERSION,targets,payloads});
    let rows=[],matchError;
    try{rows=[...normalizeEpreuves(payloads.matches['hydra:member']),...normalizeEpreuvesFal(payloads.fal,payloads.falGamePayloads)];}catch(error){matchError=error.message;}
    report('collection',{run_id:runId,version:VERSION,rows,matchError,daily:payloads.daily?.map(entry=>({day:entry.day,official_match_count:entry.matches?.['hydra:totalItems'],plateau_count:entry.fal?.sites?.length}))});
    if(env.SYNC_VERIFY_DATE||env.SYNC_VERIFY_COUNT){
      const expected=Number(env.SYNC_VERIFY_COUNT);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(env.SYNC_VERIFY_DATE||'')||!env.SYNC_VERIFY_COUNT||!Number.isInteger(expected)||expected<0)throw new Error('Les deux paramètres verify_date et verify_count sont requis et doivent être valides');
      const actual=rows.filter(row=>parisDay(new Date(row.starts_at))===env.SYNC_VERIFY_DATE).length;
      if(actual!==expected)throw new Error(`${env.SYNC_VERIFY_DATE} : ${actual} événements reçus, ${expected} attendus`);
    }
    summary=await synchronize({collection:{payloads,rows,matchError},client,dryRun,log});
  }catch(error){summary.sources.push({source:'collector',status:'error',error:redact(error.message)});summary.status='error';log('error','collector_failed',{error:redact(error.message)});}
  finally{
    console.log=previousLog;
    summary={...summary,run_id:runId,version:VERSION,dry_run:dryRun};
    report('result',summary);
    if(client&&!dryRun){
      try{await client.status(summary);}catch(error){summary.status='error';summary.sources.push({source:'status',status:'error',error:redact(error.message)});report('result',summary);previousLog(`::error::${redact(error.message)}`);}
    }
  }
  return summary;
}
if(import.meta.url===pathToFileURL(process.argv[1]||'').href){const result=await main();process.exitCode=result.status==='success'?0:1;}

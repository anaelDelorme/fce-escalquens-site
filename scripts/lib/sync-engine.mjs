import {assertCollection,assertStandings} from './fff-integrity.mjs';

// Pure orchestration: network, reporting and logging are injected.
export async function synchronize({collection,client,dryRun=false,log=()=>{},chunkSize=40}){
  const sources=[],summary={status:'error',imported_count:0,verified_count:0,protected_count:0,sources};
  let matchReady=true,standingReady=true;
  try{if(collection.matchError)throw new Error(collection.matchError);assertCollection(collection.payloads,collection.rows,collection.payloads.reference);}catch(error){matchReady=false;sources.push({source:'matches',status:'error',error:error.message});}
  try{assertStandings(collection.payloads);}catch(error){standingReady=false;sources.push({source:'standings',status:'error',error:error.message});}
  if(matchReady){
    try{
      for(let offset=0;offset<collection.rows.length;offset+=chunkSize){
        const chunk=collection.rows.slice(offset,offset+chunkSize);
        if(!dryRun){
          const result=await client.matches(chunk,{final:offset+chunkSize>=collection.rows.length});
          summary.imported_count+=result.accepted;
          const verification=await client.verify(chunk);
          summary.verified_count+=verification.verified;
          summary.protected_count+=verification.protected_count||0;
          if(verification.conflicts?.length)log('warning','protected_result_conflicts',{conflicts:verification.conflicts});
        }
        log('info','matches_batch_verified',{offset,count:chunk.length,dry_run:dryRun});
      }
      sources.push({source:'matches',status:'ok',count:collection.rows.length});
    }catch(error){sources.push({source:'matches',status:'error',error:error.message});}
  }
  if(standingReady){
    try{
      if(!dryRun)await client.standings(collection.payloads.standings);
      sources.push({source:'standings',status:'ok',count:collection.payloads.standings.length});
    }catch(error){sources.push({source:'standings',status:'error',error:error.message});}
  }
  const details=collection.payloads.falGameMeta;
  if(!details?.complete||details.targeted!==details.succeeded){
    sources.push({source:'plateau_details',status:'error',error:'Détails de plateaux incomplets',details});
  }else sources.push({source:'plateau_details',status:'ok',count:details.succeeded});
  const failures=sources.some(source=>source.status==='error');
  summary.status=failures?(sources.some(source=>['matches','standings'].includes(source.source)&&source.status==='ok')?'partial':'error'):'success';
  log(failures?'error':'info','sync_finished',summary);
  return summary;
}

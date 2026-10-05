export function createSyncClient({siteUrl,token,request=fetch,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),log=()=>{}}){
  async function post(path,body){
    let lastError;
    for(let attempt=1;attempt<=3;attempt++){
      try{
        const response=await request(`${siteUrl.replace(/\/$/,'')}/internal/sync/${path}`,{
          method:'POST',signal:AbortSignal.timeout(45000),
          headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(body)
        });
        const raw=await response.text();
        if(!response.ok){
          const error=new Error(`${path} HTTP ${response.status}: ${raw.slice(0,500)}`);
          error.retryable=[408,429,500,502,503,504].includes(response.status);throw error;
        }
        let result;try{result=JSON.parse(raw)}catch{const error=new Error(`${path}: réponse JSON invalide`);error.retryable=false;throw error;}
        if(result.ok!==true){const error=new Error(`${path}: réponse sans confirmation de succès`);error.retryable=false;throw error;}
        return result;
      }catch(error){
        lastError=error;
        if(error.retryable===false||attempt===3)break;
        log('warning','http_retry',{path,attempt,error:error.message});await sleep(1000*attempt);
      }
    }
    throw lastError;
  }
  return {
    async matches(rows,{final=false}={}){
      const result=await post('matches',{rows,batch:{final}});
      if(result.accepted!==rows.length||result.received!==rows.length)throw new Error(`Import incomplet : ${result.accepted}/${rows.length}`);
      return result;
    },
    async verify(rows){
      const result=await post('verify',{rows});
      if(result.verified!==rows.length)throw new Error(`Vérification incomplète : ${result.verified}/${rows.length}`);
      return result;
    },
    async standings(rows){
      const groups=new Map();
      for(const row of rows){const phase=String(row?.phase_id||'');if(!groups.has(phase))groups.set(phase,[]);groups.get(phase).push(row);}
      if(!groups.size)throw new Error('standings HTTP 400: classement vide');
      let accepted=0,linked=0;
      for(const [phase,group] of groups){
        const result=await post('standings',{rows:group});
        if(result.accepted!==group.length)throw new Error(`Classements incomplets : ${result.accepted}/${group.length} dans ${phase}`);
        accepted+=result.accepted;linked+=result.linked||0;
        log('info','standings_phase_imported',{phase,count:result.accepted});
      }
      return {ok:true,accepted,linked};
    },
    status:body=>post('status',body)
  };
}

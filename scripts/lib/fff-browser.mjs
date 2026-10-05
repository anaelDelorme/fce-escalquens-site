import {fetchCompleteMatches} from './fff-integrity.mjs';
import {browserCollectStandings} from '../standings-integrated.mjs';
const CLUB_NO='101544',CLUB_CODE='550350',DISTRICT_NO='86';
export function buildBrowserProgram(targetUrls,{collectStandings=browserCollectStandings}={}){
  const browserTargets=[
    ...targetUrls.matches.map((src,index)=>[`fce-matches-${index}`,src]),
    ...targetUrls.fal.map((src,index)=>[`fce-fal-${index}`,src]),
    ...(targetUrls.days||[]).flatMap(({day,matches,fal})=>[[`fce-day-matches-${day}`,matches],[`fce-day-fal-${day}`,fal]])
  ];
  const fetchScript=`(async()=>{
    const targets=${JSON.stringify(browserTargets)};
    const node=document.querySelector('#ng-state');
    let state;
    try{state=JSON.parse(node?.textContent||'[]')}catch{}
    const roots=Array.isArray(state)?state:[state];
    const entries=roots.flatMap(item=>Object.entries(item||{}));
    const securityToken=entries.find(([key])=>key==='VLJAXE')?.[1]||entries.find(([key,value])=>key.includes('/api/app-security-token/')&&value?.body?.token)?.[1]?.body?.token;
    if(!securityToken){document.documentElement.setAttribute('data-fce-sync-error','token-X-Competition-introuvable');return}
    const initialMatches=entries.find(([key,value])=>key.includes('analog_GET|/api/data/matches?')&&value?.status===200)?.[1]?.body;
    const initialFal=entries.find(([key,value])=>key.includes('/api/fal/cdg/${DISTRICT_NO}/club/${CLUB_NO}/sites?')&&value?.status===200)?.[1]?.body;
    const reference={
      matchIds:(initialMatches?.['hydra:member']||[]).filter(wrapper=>{const item=wrapper.donneesFormatees||wrapper;return [item.recevant,item.visiteur].some(team=>(String(team?.club?.clNo)==='${CLUB_NO}'||String(team?.equipe?.id||'').includes('_${CLUB_NO}_')));}).map(wrapper=>String(wrapper.donneesFormatees?.maNo||wrapper.maNo||wrapper.id)),
      plateauIds:[...(initialFal?.sites||[]),...(initialFal?.sitesWithoutDate||[])].filter(site=>(site.equipes||[]).some(team=>String(team.club?.clNo)==='${CLUB_NO}')&&(site.date||site.joDate)).map(site=>[site.epreuve?.epNo,site.phNo,site.joNo,site.siNo].join(':'))
    };
    const refOutput=document.createElement('script');refOutput.id='fce-reference';refOutput.type='application/json';refOutput.textContent=JSON.stringify({status:200,body:reference});document.body.appendChild(refOutput);
    const fetchCompleteMatches=${fetchCompleteMatches.toString()};
    const saved=[];
    const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const retryable=status=>[0,429,500,502,503,504].includes(Number(status));

    const fetchOne=async(id,src)=>{
      let status=0,body='',attempt=0;

      while(attempt<3){
        attempt++;

        try{
          if(id.startsWith('fce-matches-')||id.startsWith('fce-day-matches-')){
            const payload=await fetchCompleteMatches(src,url=>fetch(url,{credentials:'include',
              signal:AbortSignal.timeout(20000),headers:{Accept:'application/json','X-Competition':String(securityToken)}}));
            status=200;body=JSON.stringify(payload);break;
          }
          const response=await fetch(
            src,
            {
              credentials:'include',
              signal:AbortSignal.timeout(20000),
              headers:{
                Accept:'application/json, text/plain, */*',
                'X-Competition':String(securityToken)
              }
            }
          );

          status=response.status;
          body=await response.text();

          if(response.ok||!retryable(status))break;
        }catch(error){
          status=0;
          body=JSON.stringify({fce_error:String(error)});
        }

        if(attempt<3){
          await sleep(600*attempt);
        }
      }

      const output=document.createElement('script');
      output.type='application/json';
      output.id=id;

      let envelopeBody=body;
      try{envelopeBody=JSON.parse(body)}catch{}

      output.textContent=JSON.stringify({
        status,
        body:envelopeBody,
        attempts:attempt
      });

      document.body.appendChild(output);
      saved.push({id,status,body,attempts:attempt});
    };

    const runLimited=async(items,limit=4)=>{
      let cursor=0;

      const worker=async()=>{
        while(cursor<items.length){
          const index=cursor++;
          const [id,src]=items[index];
          await fetchOne(id,src);
        }
      };

      await Promise.all(
        Array.from(
          {length:Math.min(limit,items.length)},
          ()=>worker()
        )
      );
    };

    await runLimited(targets,4);

    const min=Date.now()-7*86400000,max=Date.now()+45*86400000,details=new Map();
    for(const result of saved.filter(item=>(item.id.startsWith('fce-matches-')||item.id.startsWith('fce-day-matches-'))&&item.status===200)){
      try{
        const payload=JSON.parse(result.body),members=payload['hydra:member']||payload.items||[];
        for(const wrapper of members){
          const item=wrapper.donneesFormatees||wrapper,date=new Date(item.date).getTime();
          if(date<min||date>max)continue;
          const matchId=String(item.maNo||wrapper.id||'');
          if(!matchId)continue;
          const candidates=[wrapper['@id'],\`/api/matches/\${matchId}\`,\`/api/data/matches/\${matchId}\`].filter(Boolean);
          details.set(matchId,[...new Set(candidates)]);
        }
      }catch{}
    }

    const fetchBestDetail=async(id,paths)=>{
      let bestBody='';
      let bestScore=-1;

      for(const path of paths){
        try{
          const response=await fetch(
            new URL(path,'https://epreuves.fff.fr').href,
            {
              credentials:'include',
              signal:AbortSignal.timeout(20000),
              headers:{
                Accept:'application/json, text/plain, */*',
                'X-Competition':String(securityToken)
              }
            }
          );

          if(!response.ok)continue;

          const body=await response.text();

          const score=
            Number(/"(?:terrain|installation|stade)"\\s*:/.test(body))*10+
            Number(/"(?:adresse|address|lieu)"\\s*:/.test(body))*5+
            Math.min(body.length/10000,4);

          if(score>bestScore){
            bestScore=score;
            bestBody=body;
          }

          if(score>=15)break;
        }catch{}
      }

      if(!bestBody)return;

      const output=document.createElement('script');
      output.type='application/json';
      output.id='fce-detail-'+id;
      let envelopeBody=bestBody;
      try{envelopeBody=JSON.parse(bestBody)}catch{}
      output.textContent=JSON.stringify({
        status:200,
        body:envelopeBody
      });

      document.body.appendChild(output);

      // Le détail contient notamment l'identifiant FFF exact de l'équipe.
      // Le collecteur de classements le réutilise dans la même session.
      saved.push({
        id:'fce-detail-'+id,
        status:200,
        body:bestBody
      });
    };

    const detailItems=[...details];let detailCursor=0;
    await Promise.all(Array.from({length:Math.min(4,detailItems.length)},async()=>{
      while(detailCursor<detailItems.length){const [id,paths]=detailItems[detailCursor++];await fetchBestDetail(id,paths);}
    }));
    // Les mini-matchs d'un plateau sont chargés depuis la page SSR dédiée.
    // On ne cible que J-14 à J+21 : les résultats déjà importés restent en
    // base, et on évite de recharger inutilement tous les plateaux de l'année.
    const plateauMin=Date.now()-14*86400000,plateauMax=Date.now()+21*86400000,plateauSites=new Map();
    for(const result of saved.filter(item=>(item.id.startsWith('fce-fal-')||item.id.startsWith('fce-day-fal-'))&&item.status===200)){
      try{
        const payload=JSON.parse(result.body);
        for(const site of [...(payload.sites||[]),...(payload.sitesWithoutDate||[])]){
          const when=new Date(site.date||site.joDate).getTime();
          const ep=site.epreuve?.epNo,po=site.poNo,jo=site.joNo,si=site.siNo;
          if(when<plateauMin||when>plateauMax||!ep||!po||!jo||!si)continue;
          // La phase n'est pas toujours exposée de la même façon entre la
          // liste des sites et la page de détail. Épreuve + journée + site
          // identifient déjà sans ambiguïté le plateau à rattacher.
          const key=[ep,jo,si].join(':');
          plateauSites.set(key,{key,url:\`https://epreuves.fff.fr/animation-loisir/cdg/${DISTRICT_NO}/club/${CLUB_NO}/epreuve/\${ep}/poule/\${po}/journee/\${jo}/site/\${si}/matchs\`});
        }
      }catch{}
    }
    const plateauResults=[];

    const fetchPlateau=async({key,url})=>{
      let status=0,body='',attempt=0;

      while(attempt<2){
        attempt++;

        try{
          const response=await fetch(
            url,
            {
              credentials:'include',
              signal:AbortSignal.timeout(20000),
              headers:{Accept:'text/html,application/xhtml+xml'}
            }
          );

          status=response.status;
          const html=await response.text();

          if(response.ok){
            const stateText=
              html.match(
                /<script[^>]+id=["']ng-state["'][^>]*>([\\s\\S]*?)<\\/script>/i
              )?.[1]
              ||'';

            const state=
              stateText
                ?JSON.parse(stateText)
                :[];

            const entries=
              (Array.isArray(state)?state:[state])
                .flatMap(item=>Object.entries(item||{}));

            const apiPayloads=
              entries
                .filter(
                  ([name,value])=>
                    name.includes('/api/fal/')
                    &&value?.status===200
                    &&value?.body
                )
                .map(
                  ([name,value])=>({
                    name,
                    body:value.body
                  })
                );

            if(!apiPayloads.length)throw new Error('Plateau HTTP 200 sans données FFF exploitables');
            body=JSON.stringify({site_key:key,api_payloads:apiPayloads});

            break;
          }

          body=JSON.stringify({
            site_key:key,
            fce_error:'HTTP '+status
          });

        }catch(error){
          status=0;
          body=JSON.stringify({
            site_key:key,
            fce_error:String(error)
          });
        }

        if(attempt<2&&retryable(status)){
          await sleep(500*attempt);
          continue;
        }

        break;
      }

      const output=document.createElement('script');
      output.type='application/json';
      output.id=\`fce-fal-games-\${key.replaceAll(':','-')}\`;

      let envelopeBody=body;
      try{envelopeBody=JSON.parse(body)}catch{}

      output.textContent=JSON.stringify({
        status,
        body:envelopeBody,
        attempts:attempt
      });

      document.body.appendChild(output);

      plateauResults.push({
        key,
        status,
        attempts:attempt
      });
    };

    const plateauItems=[...plateauSites.values()];
    let plateauCursor=0;

    const plateauWorker=async()=>{
      while(plateauCursor<plateauItems.length){
        const index=plateauCursor++;
        await fetchPlateau(plateauItems[index]);
      }
    };

    await Promise.all(
      Array.from(
        {length:Math.min(4,plateauItems.length)},
        ()=>plateauWorker()
      )
    );

    const plateauMetaOutput=document.createElement('script');
    plateauMetaOutput.type='application/json';
    plateauMetaOutput.id='fce-plateau-detail-meta';
    plateauMetaOutput.textContent=JSON.stringify({
      status:200,
      body:{
        complete:true,
        targeted:plateauItems.length,
        succeeded:plateauResults.filter(item=>item.status===200).length,
        failed:plateauResults.filter(item=>item.status!==200)
      }
    });
    document.body.appendChild(plateauMetaOutput);

    // Les classements passent APRÈS les données des matchs/plateaux.
    // Les données principales sont disponibles même si la session navigateur
    // approche la limite de temps ZenRows.
    try{
      await (${collectStandings.toString()})(
        saved,
        '${CLUB_NO}',
        '${CLUB_CODE}',
        ${Number(targetUrls.seasonYear)}
      );
    }catch(error){
      const appendFailure=(id,data)=>{
        const output=document.createElement('script');
        output.type='application/json';
        output.id=id;
        output.textContent=JSON.stringify({status:200,body:data});
        document.body.appendChild(output);
      };

      appendFailure('fce-standings',[]);
      appendFailure('fce-standings-meta',{
        detected:0,
        parsed:0,
        rows:0,
        error:String(error?.stack||error?.message||error),
        discovery:{
          dom:0,
          fetched:0,
          fallback:0,
          teams:0,
          details:0,
          season:${Number(targetUrls.seasonYear)}
        }
      });
    }

    // Réduire drastiquement la réponse ZenRows : on ne renvoie pas la page
    // Angular complète, seulement les JSON utiles au collecteur.
    const fcePayloads=[...document.querySelectorAll('script[id^="fce-"]')];
    document.head.replaceChildren();
    document.body.replaceChildren(...fcePayloads);
    document.documentElement.setAttribute('data-fce-sync-done','1');
  })()`;
  return fetchScript;
}

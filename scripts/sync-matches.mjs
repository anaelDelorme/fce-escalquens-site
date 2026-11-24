import { browserCollectStandings, verified2026 } from './standings-integrated.mjs';
import { pathToFileURL } from 'node:url';
import { dofaMatchCollections, fetchDofaPools, fetchDofaSeason } from './fff-dofa.mjs';
import { browserProbePublicCalendar } from './fff-public-calendar-probe.mjs';
import { browserCollectPublishedWeeks } from './fff-published-weeks.mjs';
import { browserCollectCompetitionMatches, browserCollectCalendarFallback, browserCollectTeamMonths, fetchCompleteMatches, isCompleteMatchCollection, missingTeamMonthTargets } from './fff-match-coverage.mjs';
const SYNC_VERSION='2026.11.23-semaines-publiees',CLUB_NO='101544',CLUB_CODE='550350',DISTRICT_NO='86';
const siteUrl=process.env.FCE_SITE_URL?.replace(/\/$/,'');
const endpoint=siteUrl+'/internal/sync/matches';
const standingsEndpoint=siteUrl+'/internal/sync/standings';
const statusEndpoint=siteUrl+'/internal/sync/status';
const token=process.env.FCE_SYNC_TOKEN;

export function zenRowsBudget(value, request=fetch){
  const limit=/^(?:[1-9]|[12][0-9]|30)$/.test(String(value||''))?Number(value):0;
  let remaining=limit;
  return {
    available:()=>remaining>0,
    async request(url,options){
      if(!remaining)throw new Error('Budget ZenRows épuisé ou désactivé');
      remaining--;
      const response=await request(url,options);
      if([401,402,403,429].includes(response.status))remaining=0;
      return response;
    }
  };
}

let paidRequests;
const zenRows=()=>paidRequests??=zenRowsBudget(process.env.FCE_ZENROWS_MAX_REQUESTS);
const zenRowsEnabled=()=>Boolean(process.env.ZENROWS_API_KEY)&&zenRows().available();

let latestStandings=[];
let latestStandingsInfo={
  attempted:false,
  detected:0,
  parsed:0,
  rows:0
};
// Le YAML pilote désormais la cadence via un seul cron par créneau (champ
// `timezone: Europe/Paris`), donc chaque déclenchement du workflow doit
// lancer une collecte : plus de vérification d'heure locale ici.
const headers={accept:'application/ld+json, application/json, text/html;q=0.9','accept-language':'fr-FR,fr;q=0.9','user-agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/128 Safari/537.36',referer:'https://occitanie.fff.fr/'};
const first=(...values)=>values.find(value=>value!==undefined&&value!==null&&value!=='');
const text=value=>typeof value==='string'?value:value?.name||value?.nom||value?.label||value?.short_name||value?.libelle||'';
const entityName=entity=>text(first(entity?.short_name_federation,entity?.short_name_ligue,entity?.short_name,entity?.name,entity?.label,entity?.nom,entity?.code));
const iso=(date,time='')=>{if(!date)return '';const raw=String(date);if(raw.includes('T'))return raw;const normalized=String(time||'12:00').replace('h',':').padEnd(5,'0');return `${raw}T${/^\d{1,2}:\d{2}$/.test(normalized)?normalized:'12:00'}:00`};
const cleanUrl=value=>{const raw=String(value||''),markdown=raw.match(/^\[[^\]]+\]\((https?:\/\/[^)]+)\)$/);return markdown?markdown[1]:raw};
const numberOrNull=value=>value===undefined||value===null||value===''?null:Number(value);
const addressText=value=>{
  if(Array.isArray(value))return value.filter(Boolean).join(' · ');
  if(typeof value==='string')return value;
  if(!value||typeof value!=='object')return '';
  return first(
    value.formatted,value.libelle,value.label,value.adresseComplete,value.fullAddress,
    [value.adresse1,value.adresse2,value.codePostal||value.cp,value.ville].filter(Boolean).join(' · ')
  )||'';
};
async function fetchOk(url,kind='json',extraHeaders={}){const response=await fetch(url,{headers:{...headers,...extraHeaders},redirect:'follow'});if(!response.ok){const detail=(await response.text()).replace(/\s+/g,' ').slice(0,180);throw new Error(`${new URL(url).hostname} HTTP ${response.status}${detail?` — ${detail}`:''}`)}return kind==='text'?response.text():response.json()}
const payloadItems=payload=>Array.isArray(payload)?payload:payload['hydra:member']||payload.items||payload.data||payload.matches||[];
const parseJson=(value,label='réponse')=>{try{return typeof value==='string'?JSON.parse(value):value}catch{throw new Error(`${label} JSON invalide`)}};
const epreuvesPayloadsFromState=state=>{
  const values=(Array.isArray(state)?state:[state]).flatMap(item=>Object.entries(item||{}));
  const matches=values.find(([key,value])=>key.includes('analog_GET|/api/data/matches?')&&value?.status===200&&value?.body)?.[1]?.body||null;
  const fal=values.find(([key,value])=>key.includes(`/api/fal/cdg/${DISTRICT_NO}/club/${CLUB_NO}/sites?`)&&value?.status===200&&value?.body)?.[1]?.body||null;
  return {matches,fal};
};
const epreuvesPayloadsFromHtml=html=>{
  const match=String(html||'').match(/<script[^>]+id=["']ng-state["'][^>]*>([\s\S]*?)<\/script>/i);
  return match?epreuvesPayloadsFromState(parseJson(match[1],'ng-state')):{matches:null,fal:null};
};
const embeddedPayloadFromHtml=(html,id)=>{
  const match=String(html||'').match(new RegExp(`<script[^>]+id=["']${id}["'][^>]*>([\\s\\S]*?)<\\/script>`,'i'));
  if(!match)return null;
  const envelope=parseJson(match[1],id);
  if(Number(envelope.status)!==200)return null;
  return parseJson(envelope.body,id);
};
const embeddedStatusFromHtml=(html,id)=>{
  const match=String(html||'').match(new RegExp(`<script[^>]+id=["']${id}["'][^>]*>([\\s\\S]*?)<\\/script>`,'i'));
  if(!match)return 0;
  try{return Number(parseJson(match[1],id).status||0)}catch{return 0}
};
const embeddedPayloadsByPrefix=(html,prefix)=>{
  const results=[],pattern=new RegExp(`<script[^>]+id=["']${prefix}[^"']*["'][^>]*>([\\s\\S]*?)<\\/script>`,'gi');
  for(const match of String(html||'').matchAll(pattern)){
    try{const envelope=parseJson(match[1],prefix);if(envelope.status===200)results.push(parseJson(envelope.body,prefix))}catch{}
  }
  return results;
};
const embeddedEntriesByPrefix=(html,prefix)=>{
  const results=[],pattern=new RegExp(`<script[^>]+id=["'](${prefix}[^"']*)["'][^>]*>([\\s\\S]*?)<\\/script>`,'gi');
  for(const match of String(html||'').matchAll(pattern)){
    try{
      const envelope=parseJson(match[2],prefix);
      if(envelope.status===200)results.push({id:match[1],payload:parseJson(envelope.body,prefix)});
    }catch{}
  }
  return results;
};
export const mergeMatchPayloads=payloads=>{
  const unique=new Map();
  for(const payload of payloads){
    const members=payloadItems(payload),wrappers=members.length?members:(payload?.donneesFormatees||payload?.maNo?[payload]:[]);
    for(const wrapper of wrappers){
    const item=wrapper?.donneesFormatees||wrapper;
    const id=String(item?.maNo||wrapper?.id||wrapper?.['@id']||'');
    if(id){
      const previous=unique.get(id);
      const venueScore=value=>{
        const detail=value?.donneesFormatees||value||{};
        const serialized=JSON.stringify(detail);
        return Number(Boolean(detail.terrain||detail.installation||detail.stade||detail.site?.terrain||detail.rencontre?.terrain))*10+
          Number(/"(?:terrain|installation|stade)"\s*:/.test(serialized))*5+
          Number(Boolean(detail.lieu||detail.adresse));
      };
      const quality=value=>{
        const row=value?.donneesFormatees||value||{};
        const sides=[row.recevant,row.visiteur];
        const complete=sides.every(side=>side?.club?.nom||side?.club?.nomAbr);
        const result=[true,1,'1','true'].includes(row.joue) && sides.every(side=>side?.buts!=null);
        return Number(complete)*100+Number(result)*50+Number(!value?.dofa)*20+venueScore(value);
      };
      if(!previous||quality(wrapper)>=quality(previous))unique.set(id,wrapper);
    }
    }
  }
  return {'@context':'/api/contexts/Match','@id':'/api/matches','@type':'hydra:Collection','hydra:totalItems':unique.size,'hydra:member':[...unique.values()]};
};
const mergeFalPayloads=payloads=>{
  const sites=new Map(),epreuves=new Map(),sitesWithoutDate=new Map();
  for(const payload of payloads){
    for(const item of payload?.epreuves||[])epreuves.set(String(item.epNo||item['@id']),item);
    for(const site of payload?.sites||[])sites.set(`${site.epreuve?.epNo}:${site.phNo}:${site.joNo}:${site.siNo}`,site);
    for(const site of payload?.sitesWithoutDate||[])sitesWithoutDate.set(`${site.epreuve?.epNo}:${site.phNo}:${site.joNo}:${site.siNo}`,site);
  }
  const sample=payloads.find(Boolean)||{};
  return {...sample,epreuves:[...epreuves.values()],sites:[...sites.values()],sitesWithoutDate:[...sitesWithoutDate.values()]};
};

const falDateMs=value=>{
  if(value===undefined||value===null||value==='')return NaN;
  if(typeof value==='number')return value<1e12?value*1000:value;
  if(typeof value==='object'){
    for(const candidate of [value.date,value.dateTime,value.datetime,value.value,value.iso]){
      const parsed=falDateMs(candidate);
      if(Number.isFinite(parsed))return parsed;
    }
    return NaN;
  }
  const raw=String(value).trim();
  const parsed=Date.parse(raw);
  return Number.isFinite(parsed)?parsed:NaN;
};

function plateauDetailTargets(falPayload){
  const min=Date.now()-14*86400000,max=Date.now()+45*86400000;
  const targets=new Map();
  const stats={seen:0,invalidDate:0,outsideWindow:0,missingIds:0};

  for(const site of [...(falPayload?.sites||[]),...(falPayload?.sitesWithoutDate||[])]){
    stats.seen++;
    const ep=site.epreuve?.epNo??site.epNo??site.faEpNo;
    const po=site.poNo??site.poule?.poNo??site.epreuve?.poNo??site.po?.poNo;
    const jo=site.joNo??site.journee?.joNo??site.faJoNo;
    const si=site.siNo??site.site?.siNo??site.faSiNo;

    if([ep,po,jo,si].some(value=>value===undefined||value===null||value==='')){
      stats.missingIds++;continue;
    }

    const when=falDateMs(site.date??site.joDate??site.journee?.date??site.dateDebut??site.site?.date);
    if(!Number.isFinite(when)){stats.invalidDate++;continue}
    // Rejouer les plateaux U13F de la saison pour retrouver les scores manquants.
    if((when<min&&String(ep)!=='9833')||when>max){stats.outsideWindow++;continue}

    const key=[ep,jo,si].join(':');
    targets.set(key,{
      key,
      url:`https://epreuves.fff.fr/animation-loisir/cdg/${DISTRICT_NO}/club/${CLUB_NO}/epreuve/${ep}/poule/${po}/journee/${jo}/site/${si}/matchs`
    });
  }

  return {targets:[...targets.values()],stats};
}

async function browserCollectPlateauDetails(targets){
  const results=[];
  let cursor=0;

  const append=(id,status,body)=>{
    const output=document.createElement('script');
    output.type='application/json';
    output.id=id;
    output.textContent=JSON.stringify({status,body});
    document.body.appendChild(output);
  };

  const collectOne=async target=>{
    let status=0,payload={site_key:target.key,api_payloads:[]};
    try{
      const response=await fetch(target.url,{credentials:'include',headers:{Accept:'text/html,application/xhtml+xml'}});
      status=response.status;
      const html=await response.text();

      if(response.ok){
        const stateText=html.match(/<script[^>]+id=["']ng-state["'][^>]*>([\s\S]*?)<\/script>/i)?.[1]||'';
        let state=[];
        try{state=stateText?JSON.parse(stateText):[]}catch{}
        const entries=(Array.isArray(state)?state:[state]).flatMap(item=>Object.entries(item||{}));
        payload={
          site_key:target.key,
          api_payloads:entries
            .filter(([name,value])=>name.includes('/api/fal/')&&value?.status===200&&value?.body)
            .map(([name,value])=>({name,body:value.body}))
        };
      }else{
        payload={site_key:target.key,fce_error:'HTTP '+status};
      }
    }catch(error){
      payload={site_key:target.key,fce_error:String(error)};
    }

    append('fce-fal-games-'+target.key.replaceAll(':','-'),status,payload);
    results.push({key:target.key,status,api_payloads:Array.isArray(payload.api_payloads)?payload.api_payloads.length:0});
  };

  const worker=async()=>{
    while(cursor<targets.length){
      const index=cursor++;
      await collectOne(targets[index]);
    }
  };

  await Promise.all(Array.from({length:Math.min(4,targets.length)},()=>worker()));

  append('fce-plateau-detail-meta',200,{
    targeted:targets.length,
    succeeded:results.filter(item=>item.status===200).length,
    with_api_payloads:results.filter(item=>item.api_payloads>0).length
  });

  const payloads=[...document.querySelectorAll('script[id^="fce-"]')];
  document.head.replaceChildren();
  document.body.replaceChildren(...payloads);
  document.documentElement.setAttribute('data-fce-plateau-done','1');
}

async function fetchPlateauDetailsZenRows(falPayload,existingEntries=[]){
  const {targets,stats}=plateauDetailTargets(falPayload);
  const existingKeys=new Set((existingEntries||[]).map(entry=>entry?.payload?.api_payloads?.length?String(entry.payload.site_key||''):'').filter(Boolean));
  const missingTargets=targets.filter(target=>!existingKeys.has(target.key));

  console.log(
    `FFF : sélection détails plateau isolée — ${stats.seen} site(s) vu(s), `+
    `${stats.invalidDate} date(s) invalide(s), ${stats.outsideWindow} hors fenêtre, `+
    `${stats.missingIds} identifiant(s) incomplet(s), ${targets.length} ciblé(s).`
  );

  if(!missingTargets.length){
    return {entries:existingEntries||[],meta:{targeted:targets.length,succeeded:(existingEntries||[]).length,reused:(existingEntries||[]).length}};
  }

  const apiKey=process.env.ZENROWS_API_KEY;
  if(!apiKey)throw new Error('ZENROWS_API_KEY absent pour les détails de plateaux');

  const evaluate=`(${browserCollectPlateauDetails.toString()})(${JSON.stringify(missingTargets)})`;
  const instructions=[
    {wait:350},
    {evaluate},
    {wait_for:'html[data-fce-plateau-done="1"]'},
    {wait:250}
  ];

  const url=new URL('https://api.zenrows.com/v1/');
  url.searchParams.set('apikey',apiKey);
  url.searchParams.set('url',missingTargets[0].url);
  url.searchParams.set('js_render','true');
  url.searchParams.set('premium_proxy','true');
  url.searchParams.set('proxy_country','fr');
  url.searchParams.set('json_response','false');
  url.searchParams.set('js_instructions',JSON.stringify(instructions));

  const response=await zenRows().request(url,{headers:{accept:'application/json'},redirect:'follow',signal:AbortSignal.timeout(90000)});
  const body=await response.text();
  if(!response.ok)throw new Error(`ZenRows plateaux HTTP ${response.status}`);

  const credits=response.headers.get('x-request-credits');
  const cost=response.headers.get('x-request-cost');
  if(credits)console.log(`ZenRows plateaux : ${credits} crédit(s) consommé(s).`);
  if(cost)console.log(`ZenRows plateaux : coût indiqué ${cost}.`);

  let result;
  try{result=JSON.parse(body)}catch{result={html:body}}
  const html=result?.html||body;
  const isolatedEntries=embeddedEntriesByPrefix(html,'fce-fal-games-');
  const isolatedMeta=embeddedPayloadFromHtml(html,'fce-plateau-detail-meta')||{};

  console.log(
    `FFF : détails de plateau isolés — ${Number(isolatedMeta.targeted||missingTargets.length)} ciblé(s), `+
    `${Number(isolatedMeta.succeeded||isolatedEntries.length)} réussi(s), `+
    `${Number(isolatedMeta.with_api_payloads||0)} avec payload(s) FAL.`
  );

  return {
    entries:[...(existingEntries||[]),...isolatedEntries.filter(entry=>entry.payload?.api_payloads?.length)],
    meta:{...isolatedMeta,targeted:targets.length,reused:(existingEntries||[]).length}
  };
}

const zenRowsHtml=body=>{
  try{return JSON.parse(body)?.html||''}catch{return body}
};

const epreuvesPayloadFromZenRows=body=>{
  const html=zenRowsHtml(body);
  const monthly=(prefix,isValid)=>Array.from({length:12},(_,index)=>{
    const id=prefix+index;
    const status=embeddedStatusFromHtml(html,id);
    try{
      const payload=embeddedPayloadFromHtml(html,id);
      return {id,payload:isValid(payload)?payload:null,status};
    }catch{
      return {id,payload:null,status};
    }
  });
  const matchesByMonth=monthly('fce-matches-',isCompleteMatchCollection);
  const falByMonth=monthly('fce-fal-',payload=>Array.isArray(payload?.sites));
  const matchPayloads=matchesByMonth.flatMap(entry=>entry.payload?[entry.payload]:[]);
  const falPayloads=falByMonth.flatMap(entry=>entry.payload?[entry.payload]:[]);
  const failedMonthly=[...matchesByMonth,...falByMonth].filter(entry=>!entry.payload);
  const fallback=embeddedPayloadFromHtml(html,'fce-calendar-fallback')||{};
  const detailPayloads=embeddedPayloadsByPrefix(html,'fce-detail-');
  const falGamePayloads=embeddedEntriesByPrefix(html,'fce-fal-games-');
  const falGameMeta=embeddedPayloadFromHtml(html,'fce-plateau-detail-meta')||{};
  const standings=embeddedPayloadFromHtml(html,'fce-standings')||[];
  const standingsMetaPayload=embeddedPayloadFromHtml(html,'fce-standings-meta');
  const standingsMeta=standingsMetaPayload||{};
  const venueDetails=detailPayloads.filter(payload=>{
    const item=payload?.donneesFormatees||payload||{};
    return /"(?:terrain|installation|stade)"\s*:/.test(JSON.stringify(item));
  }).length;
  return {
    matches:mergeMatchPayloads([...(fallback.collections||[]),...matchPayloads,...detailPayloads]),fal:mergeFalPayloads(falPayloads),
    monthlyMatches:mergeMatchPayloads(matchPayloads),calendarResults:fallback.results||[],calendarTeamIds:fallback.teamIds||[],
    calendarPoolPaths:fallback.poolPaths||[],
    matchMonths:matchPayloads.length,falMonths:falPayloads.length,
    detailCount:detailPayloads.length,venueDetailCount:venueDetails,
    falGamePayloads,
    falGameMeta,
    standings,
    standingsMeta,
    standingsMetaPresent:Boolean(standingsMetaPayload),
    failedMonthly
  };
};
async function runFffBrowser(evaluate,ready,label, pagePath){
  const apiKey=process.env.ZENROWS_API_KEY;
  if(!apiKey)throw new Error('ZENROWS_API_KEY absent');
  const clubBase=`https://epreuves.fff.fr/competition/club/${CLUB_CODE}-f-c-escalquens`;
  const clubPage=pagePath?.startsWith('/competition/')?new URL(pagePath,clubBase).href:clubBase+(pagePath||'/club');
  const instructions=[
    {wait_for:pagePath?'#ng-state':'app-match app-matches-wrapper'},
    {wait:500},
    {evaluate},
    {wait_for:ready},
    {wait:500}
  ];
  const url=new URL('https://api.zenrows.com/v1/');
  url.searchParams.set('apikey',apiKey);
  url.searchParams.set('url',clubPage);
  url.searchParams.set('js_render','true');
  url.searchParams.set('premium_proxy','true');
  url.searchParams.set('proxy_country','fr');
  url.searchParams.set('json_response','false');
  url.searchParams.set('js_instructions',JSON.stringify(instructions));
  const response=await zenRows().request(url,{headers:{accept:'application/json'},redirect:'follow',signal:AbortSignal.timeout(90000)});
  const body=await response.text();
  if(!response.ok)throw new Error(`HTTP ${response.status}`);
  const credits=response.headers.get('x-request-credits');
  const cost=response.headers.get('x-request-cost');
  if(credits)console.log(`${label} : ${credits} crédit(s) consommé(s).`);
  if(cost)console.log(`${label} : coût indiqué ${cost}.`);
  return body;
}

const knownCompetitions=year=>Number(year)===2026?verified2026:[];
const embeddedBrowserResult=(id,expression)=>`(async()=>{
  const data=await ${expression};
  const output=document.createElement('script');
  output.id=${JSON.stringify(id)};
  output.type='application/json';
  output.textContent=JSON.stringify({status:200,body:data});
  document.head.replaceChildren();
  document.body.replaceChildren(output);
  document.documentElement.setAttribute('data-fce-extra-done','1');
})()`;

async function diagnosePublicCalendar(){
  const path='/competition/engagement/461480-u15-fem-r1/phase/1/3/resultats-et-calendrier';
  const evidence=embeddedBrowserResult('fce-calendar-probe',`(${browserProbePublicCalendar.toString()})()`);
  try{
    const body=await runFffBrowser(evidence,'html[data-fce-extra-done="1"]','ZenRows diagnostic calendrier',path);
    const probe=embeddedPayloadFromHtml(zenRowsHtml(body),'fce-calendar-probe');
    console.log(`FFF diagnostic calendrier public : ${JSON.stringify(probe)}`);
  }catch(error){
    console.log(`::warning title=Calendrier public FFF::Diagnostic indisponible (${error?.message?.match(/^HTTP \d{3}$/)?.[0]||'échec de la session'}).`);
  }
}

async function collectPublishedPoolWeeks(pools, teamWindows){
  const selected=pools.filter(pool=>pool.publishedWeeks>1&&(pool.matchIds.length||pool.teamIds.length));
  // Les poules déjà liées à nos équipes passent avant les liens de navigation génériques.
  selected.sort((first,second)=>Number(Boolean(second.teamIds.length))-Number(Boolean(first.teamIds.length)));
  const pending=selected.values();
  const merged=[];
  const reports=[];
  const read=async(pool,direction)=>{
    const evaluate=embeddedBrowserResult('fce-pool-weeks',
      `(${browserCollectPublishedWeeks.toString()})('${CLUB_NO}',55000,'${direction}')`);
    const body=await runFffBrowser(evaluate,'html[data-fce-extra-done="1"]','ZenRows semaines',pool.path);
    const data=embeddedPayloadFromHtml(zenRowsHtml(body),'fce-pool-weeks');
    if(!data)throw new Error('aucun résultat de navigation');
    return data;
  };
  await Promise.all(Array.from({length:Math.min(4,selected.length)},async()=>{
    for(const pool of pending){
      try{
        const future=await read(pool,'future');
        const expectedWeeks=new Set(future.expectedWeeks);
        const verifiedWeeks=new Set(future.verifiedWeeks);
        const collections=[...(future.collections||[])];
        const failures=[...(future.failures||[])];
        // Une session neuve évite que l'application serve en mémoire les
        // semaines déjà traversées avant de revenir à l'automne.
        const missingPast=future.expectedWeeks?.some(week=>week<future.initialWeek&&!verifiedWeeks.has(week));
        if(missingPast){
          try{
            const past=await read(pool,'past');
            for(const week of past.expectedWeeks||[])expectedWeeks.add(week);
            for(const week of past.verifiedWeeks||[])verifiedWeeks.add(week);
            collections.push(...(past.collections||[]));
            failures.push(...(past.failures||[]));
          }catch{
            failures.push('collecte des semaines passées indisponible');
          }
        }
        const matches=normalizeEpreuves(payloadItems(mergeMatchPayloads(collections)));
        if(pool.path.includes('/454552-feminines-u18-a-8-ca-tlse-31/phase/1/1/')){
          const entries=Map.groupBy(matches.filter(row=>/^\d{4}_101544_U18F_\d+$/.test(row.team_fff_id)
            &&row.competition),row=>row.team_fff_id+'|'+row.competition);
          for(const rows of entries.values()){
            for(const week of verifiedWeeks){
              const end=new Date(Date.parse(week)+7*86400000).toISOString().slice(0,10);
              const ids=rows.filter(row=>row.starts_at.slice(0,10)>=week&&row.starts_at.slice(0,10)<end)
                .map(row=>row.source_id);
              if(ids.length)teamWindows.push({team_fff_id:rows[0].team_fff_id,competition:rows[0].competition,
                starts_on:week,ends_before:end,ids});
            }
          }
        }
        const days=matches.map(row=>row.starts_at.slice(0,10)).sort();
        const verified=verifiedWeeks.size,expected=expectedWeeks.size;
        reports.push({path:pool.path,verified,expected,matches:matches.length});
        merged.push(...collections);
        console.log(`FFF semaines ${pool.path} : ${verified}/${expected} semaines vérifiées, ${matches.length} matchs du club${days.length?` du ${days[0]} au ${days.at(-1)}`:''}.`);
        if(failures.length&&verified<expected)console.log(`::warning title=Semaines FFF::${pool.path} — ${failures.join(' ; ')}`);
      }catch(error){
        console.log(`::warning title=Semaines FFF::${pool.path} — ${error?.message?.match(/^HTTP \d{3}$/)?.[0]||'session indisponible'}.`);
      }
    }
  }));
  console.log(`FFF calendrier publié : ${reports.filter(report=>report.expected>0&&report.verified===report.expected).length}/${selected.length} poules parcourues intégralement.`);
  return merged;
}

async function collectStandingsSeparately(payloads, seasonYear){
  const matches=normalizeEpreuves(payloadItems(payloads.matches));
  const teamIds=[...new Set(matches.map(row=>row.team_fff_id).filter(Boolean))];
  const matchesById=new Map(matches.map(row=>[row.source_id,row]));
  const poolLabels=Object.fromEntries((payloads.pools||[]).flatMap(pool=>{
    const label=pool.matchIds.map(id=>matchesById.get(id)?.official_team?.pool).find(Boolean);
    return label?[[pool.path,label]]:[];
  }));
  const competitions=[...new Set([...knownCompetitions(seasonYear),...(payloads.calendarPoolPaths||[]).map(pool=>pool.path)])];
  const saved=[{id:'fce-matches-all',status:200,body:teamIds}];
  const evaluate=`(async()=>{
    await (${browserCollectStandings.toString()})(${JSON.stringify(saved)},'${CLUB_NO}','${CLUB_CODE}',${seasonYear},${JSON.stringify(competitions)},${JSON.stringify(poolLabels)});
    document.head.replaceChildren();
    document.body.replaceChildren(...document.querySelectorAll('script[id^="fce-standings"]'));
    document.documentElement.setAttribute('data-fce-extra-done','1');
  })()`;
  try{
    const body=await runFffBrowser(evaluate,'html[data-fce-extra-done="1"]','ZenRows classements');
    const result=epreuvesPayloadFromZenRows(body);
    Object.assign(payloads,{
      standings:result.standings, standingsMeta:result.standingsMeta,
      standingsMetaPresent:result.standingsMetaPresent
    });
  }catch{
    console.log('::warning title=Classements FFF::Session dédiée indisponible.');
  }
}

export async function fetchZenRows(targetUrls){
  const singleRequest=process.env.FCE_ZENROWS_MAX_REQUESTS==='1';
  // L'application Angular lit un jeton dynamique dans ng-state et l'envoie
  // dans X-Competition. Sans cet en-tête, l'API répond 200 avec des listes vides.
  const browserTargets=[
    ...targetUrls.matches.map((src,index)=>[`fce-matches-${index}`,src]),
    ...targetUrls.fal.map((src,index)=>[`fce-fal-${index}`,src])
  ];
  const fetchScript=`(async()=>{
    const targets=${JSON.stringify(browserTargets)};
    const node=document.querySelector('#ng-state');
    let state;
    try{state=JSON.parse(node?.textContent||'[]')}catch{}
    const roots=Array.isArray(state)?state:[state];
    const entries=roots.flatMap(item=>Object.entries(item||{}));
    const securityToken=entries.find(([key])=>key==='VLJAXE')?.[1]||entries.find(([key,value])=>key.includes('/api/app-security-token/')&&value?.body?.token)?.[1]?.body?.token;
    const singleRequest=${singleRequest};
    if(!securityToken&&!singleRequest){document.documentElement.setAttribute('data-fce-sync-error','token-X-Competition-introuvable');return}
    const fetchCompleteMatches=${fetchCompleteMatches.toString()};
    const saved=[];
    const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const retryable=status=>[0,429,500,502,503,504].includes(Number(status));

    const fetchOne=async(id,src)=>{
      let status=0,body='',attempt=0;

      while(attempt<3){
        attempt++;

        try{
          const request=url=>fetch(url,{
            credentials:'include',
            signal:AbortSignal.timeout(8000),
            headers:{Accept:'application/json, text/plain, */*','X-Competition':String(securityToken)}
          });
          if(id.startsWith('fce-matches-')){
            body=JSON.stringify(await fetchCompleteMatches(src,request));
            status=200;
            break;
          }
          const response=await request(src);
          status=response.status;
          body=await response.text();
          if(response.ok||!retryable(status))break;
        }catch(error){
          status=Number(String(error?.message).match(/HTTP (\\d{3})/)?.[1]||0);
          body=JSON.stringify({fce_error:String(error)});
          if(!retryable(status))break;
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

    if(securityToken)await runLimited(targets,4);

    const monthlyFailed=!securityToken||saved.some(item=>item.id.startsWith('fce-matches-')&&item.status!==200);
    const fallback=await (${browserCollectCalendarFallback.toString()})(state,${Number(targetUrls.seasonYear)},'${CLUB_NO}',monthlyFailed);
    const calendarOutput=document.createElement('script');
    calendarOutput.id='fce-calendar-fallback';
    calendarOutput.type='application/json';
    calendarOutput.textContent=JSON.stringify({status:200,body:fallback});
    document.body.appendChild(calendarOutput);

    if(singleRequest){
      const standingsTargets=[...${JSON.stringify(knownCompetitions(targetUrls.seasonYear))},...(fallback.poolPaths||[]).map(pool=>pool.path)];
      const standingsInputs=[...saved,...(fallback.collections||[]).map((body,index)=>({id:'fce-matches-public-'+index,status:200,body}))];
      try{
        await (${browserCollectStandings.toString()})(standingsInputs,'${CLUB_NO}','${CLUB_CODE}',${Number(targetUrls.seasonYear)},standingsTargets);
      }catch{
        // Les matchs et plateaux collectés restent disponibles.
      }
      const outputs=[...document.querySelectorAll('script[id^="fce-"]')];
      document.head.replaceChildren();
      document.body.replaceChildren(...outputs);
      document.documentElement.setAttribute('data-fce-sync-done','1');
      return;
    }

    const min=Date.now()-7*86400000,max=Date.now()+45*86400000,details=new Map();
    for(const result of saved.filter(item=>item.id.startsWith('fce-matches-')&&item.status===200)){
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
              headers:{
                Accept:'application/json, text/plain, */*',
                'X-Competition':String(securityToken)
              }
            }
          );

          if(!response.ok)continue;

          const body=await response.text();

          const score=
            Number(/"(?:terrain|installation|stade)"\s*:/.test(body))*10+
            Number(/"(?:adresse|address|lieu)"\s*:/.test(body))*5+
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

    await Promise.all(
      [...details].map(([id,paths])=>fetchBestDetail(id,paths))
    );
    // Les mini-matchs d'un plateau sont chargés depuis la page SSR dédiée.
    // On ne cible que J-14 à J+21 : les résultats déjà importés restent en
    // base, et on évite de recharger inutilement tous les plateaux de l'année.
    const plateauMin=Date.now()-14*86400000,plateauMax=Date.now()+21*86400000,plateauSites=new Map();
    for(const result of saved.filter(item=>item.id.startsWith('fce-fal-')&&item.status===200)){
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

            body=JSON.stringify({
              site_key:key,
              api_payloads:apiPayloads
            });

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
        targeted:plateauItems.length,
        succeeded:plateauResults.filter(item=>item.status===200).length,
        failed:plateauResults.filter(item=>item.status!==200)
      }
    });
    document.body.appendChild(plateauMetaOutput);

    // Réduire drastiquement la réponse ZenRows : on ne renvoie pas la page
    // Angular complète, seulement les JSON utiles au collecteur.
    const fcePayloads=[...document.querySelectorAll('script[id^="fce-"]')];
    document.head.replaceChildren();
    document.body.replaceChildren(...fcePayloads);
    document.documentElement.setAttribute('data-fce-sync-done','1');
  })()`;
  let payloads;
  try{
    const body=await runFffBrowser(fetchScript,'html[data-fce-sync-done="1"]','ZenRows');
    payloads=epreuvesPayloadFromZenRows(body);
  }catch(error){
    if(singleRequest)throw error;
    if(!targetUrls.teamPeriods?.length)throw error;
    console.log('::warning title=Collecte FFF::Session principale indisponible, recours aux calendriers publics.');
    payloads=epreuvesPayloadFromZenRows('');
  }
  if(singleRequest)return payloads;
  let registeredTeams=[];
  if(payloads.matchMonths<12&&targetUrls.teamPeriods?.length){
    try{
      const response=await fetch(siteUrl+'/internal/sync/teams',{
        headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(8000)
      });
      if(!response.ok)throw new Error('liste indisponible');
      const registry=await response.json();
      if(Array.isArray(registry.teams))registeredTeams=registry.teams.filter(team=>typeof team==='string');
    }catch{
      console.log('::warning title=Programme FFF::Inventaire D1 indisponible, utilisation des équipes découvertes sur la FFF.');
    }
  }
  const answeredTeams=new Set(payloads.calendarResults.filter(result=>result.collections>0).map(result=>result.id));
  const pendingTeams=registeredTeams.filter(team=>!answeredTeams.has(team));
  if(payloads.matchMonths<12&&(!answeredTeams.size||pendingTeams.length)){
    console.log('FFF : collecte isolée des calendriers d’équipe manquants.');
    const evaluate=`(async()=>{
      let state=[];
      try{state=JSON.parse(document.querySelector('#ng-state')?.textContent||'[]')}catch{}
      const fallback=await (${browserCollectCalendarFallback.toString()})(state,${Number(targetUrls.seasonYear)},'${CLUB_NO}',true,${JSON.stringify(pendingTeams)});
      const output=document.createElement('script');
      output.id='fce-calendar-fallback';
      output.type='application/json';
      output.textContent=JSON.stringify({status:200,body:fallback});
      document.head.replaceChildren();
      document.body.replaceChildren(output);
      document.documentElement.setAttribute('data-fce-calendars-done','1');
    })()`;
    try{
      const isolatedBody=await runFffBrowser(evaluate,'html[data-fce-calendars-done="1"]','ZenRows calendriers');
      const isolated=epreuvesPayloadFromZenRows(isolatedBody);
      payloads.matches=mergeMatchPayloads([isolated.matches,payloads.matches]);
      payloads.calendarResults.push(...isolated.calendarResults.filter(result=>!answeredTeams.has(result.id)));
      payloads.calendarTeamIds.push(...isolated.calendarTeamIds);
      payloads.calendarPoolPaths.push(...isolated.calendarPoolPaths);
      if(!isolated.calendarResults.some(result=>result.collections>0)){
        console.log('::warning title=Calendriers FFF::La session isolée n’a renvoyé aucune collection d’équipe.');
      }
    }catch(error){
      const status=String(error?.message||'').match(/^HTTP [0-9]{3}$/)?.[0]||'réponse indisponible';
      console.log(`::warning title=Calendriers FFF::Collecte isolée en échec (${status}).`);
    }
  }
  if(payloads.matchMonths<12&&targetUrls.teamPeriods?.length){
    const categories=[...new Set([...registeredTeams,...payloads.calendarTeamIds]
      .map(id=>id.split('_')[2]).filter(value=>/^U\d{1,2}F?$/.test(value||'')))];
    const discovery={organisation:'/ligue-et-district/14',categories};
    const evaluate=embeddedBrowserResult('fce-competitions',
      `(${browserCollectCompetitionMatches.toString()})('${CLUB_NO}',${JSON.stringify(knownCompetitions(targetUrls.seasonYear))},${JSON.stringify(payloads.calendarPoolPaths)},${JSON.stringify(discovery)})`);
    try{
      const body=await runFffBrowser(evaluate,'html[data-fce-extra-done="1"]','ZenRows compétitions');
      const html=zenRowsHtml(body);
      const result=embeddedPayloadFromHtml(html,'fce-competitions');
      if(result){
        payloads.matches=mergeMatchPayloads([payloads.matches,...result.collections]);
        payloads.calendarPoolPaths.push(...(result.poolPaths||[]));
        payloads.pools=result.pools||[];
        console.log(`FFF : ${result.answered}/${result.targeted} calendriers de poule reçus.`);
        if(result.hub)console.log(`FFF portail Occitanie : HTTP ${result.hub.status}, ${result.hub.candidates.length} compétitions pertinentes, ${result.hub.expanded} examinées.`);
        const youthPools=(result.pools||[]).filter(pool=>/u15.*(?:fem|territoire-f|u15f)/i.test(pool.path)
          ||pool.teamIds.some(id=>id.includes('_U15F_')));
        for(const pool of youthPools)console.log(`FFF poule U15F : ${pool.path} — ${pool.matchIds.length} match(s), ${pool.endpoints.join(', ')}.`);
        payloads.poolTeamWindows=[];
        const weeks=await collectPublishedPoolWeeks(result.pools||[],payloads.poolTeamWindows);
        payloads.matches=mergeMatchPayloads([payloads.matches,...weeks]);
      }
    }catch{
      console.log('::warning title=Calendriers FFF::Session des poules indisponible.');
    }
  }
  const matchRequests=payloads.failedMonthly.filter(item=>item.id.startsWith('fce-matches-'));
  const matchesForbidden=matchRequests.length===12&&matchRequests.every(item=>item.status===403);
  if(matchesForbidden)console.log('FFF : 12 refus HTTP 403 sur l’API Épreuves ; collecte des mois par équipe ignorée sur ce même service.');
  if(payloads.matchMonths<12&&targetUrls.teamPeriods?.length&&!matchesForbidden){
    const teamIds=[...payloads.calendarTeamIds,...payloads.calendarResults.map(result=>result.id),
      ...normalizeEpreuves(payloadItems(payloads.matches)).map(row=>row.team_fff_id)];
    teamIds.push(...registeredTeams);
    const missing=missingTeamMonthTargets(teamIds,targetUrls.teamPeriods,payloads.calendarResults,targetUrls.seasonYear,CLUB_NO);
    const batches=[];
    for(let index=0;index<missing.length;index+=32)batches.push(missing.slice(index,index+32));
    const collectBatch=async batch=>{
      const evaluate=`(async()=>{
        const results=await (${browserCollectTeamMonths.toString()})(${JSON.stringify(batch)},${fetchCompleteMatches.toString()});
        const output=document.createElement('script');
        output.id='fce-team-months';
        output.type='application/json';
        output.textContent=JSON.stringify({status:200,body:results});
        document.head.replaceChildren();
        document.body.replaceChildren(output);
        document.documentElement.setAttribute('data-fce-team-done','1');
      })()`;
      try{
        const raw=await runFffBrowser(evaluate,'html[data-fce-team-done="1"]','ZenRows équipes');
        let html=raw;
        try{html=JSON.parse(raw)?.html||raw}catch{}
        const results=embeddedPayloadFromHtml(html,'fce-team-months')||[];
        const byTarget=new Map(results.map(result=>[result.team+'/'+result.month,result]));
        return batch.flatMap(({team,month})=>{
          const result=byTarget.get(team+'/'+month);
          if(isCompleteMatchCollection(result?.payload)&&result.payload['hydra:member'].length){
            console.log(`FFF : ${team} ${month} — ${result.payload['hydra:totalItems']} match(s) confirmé(s).`);
            return [result.payload];
          }
          console.log(`::warning title=Programme FFF::${team} ${month} — ${result?.error||'réponse non vérifiée'}`);
          return [];
        });
      }catch{
        console.log('::warning title=Programme FFF::Session complémentaire indisponible.');
        return [];
      }
    };
    const collections=[];
    for(let index=0;index<batches.length;index+=2){
      collections.push(...(await Promise.all(batches.slice(index,index+2).map(collectBatch))).flat());
    }
    payloads.matches=mergeMatchPayloads([payloads.matches,...collections]);
    console.log(`FFF : calendrier des équipes — ${collections.length}/${missing.length} requêtes complémentaires valides.`);
  }
  console.log(`FFF : ${payloads.matchMonths}/12 mois de matchs et ${payloads.falMonths}/12 mois de plateaux capturés.`);
  if(payloads.calendarResults.length)console.log(`FFF : calendriers d’équipe — ${payloads.calendarResults.map(({id,status,collections})=>`${id}: HTTP ${status}, ${collections} collection(s)`).join(' ; ')}.`);
  for(const {id,coverage} of payloads.calendarResults){
    const verifiedMonths=[...new Set((coverage||[]).flatMap(({window})=>{
      if(!window||!window.starts_on.endsWith('-01'))return [];
      const month=window.starts_on.slice(0,7);
      const [year,number]=month.split('-').map(Number);
      const lastDay=new Date(Date.UTC(year,number,0)).toISOString().slice(0,10);
      return window.ends_before===lastDay?[month]:[];
    }))].sort();
    if(verifiedMonths.length)console.log(`FFF : ${id} — mois confirmés par le calendrier public : ${verifiedMonths.join(', ')}.`);
    if(/_U(?:15|18)F_/.test(id)&&coverage?.length){
      console.log(`FFF : couverture SSR ${id} — ${JSON.stringify(coverage)}.`);
    }
  }
  console.log(`FFF : ${payloads.detailCount} détail(s) de match reçu(s), dont ${payloads.venueDetailCount} avec un terrain.`);

  try{
    const isolated=await fetchPlateauDetailsZenRows(payloads.fal,payloads.falGamePayloads);
    payloads.falGamePayloads=isolated.entries;
    payloads.falGameMeta={...(payloads.falGameMeta||{}),...(isolated.meta||{})};
  }catch(error){
    console.log(`::warning title=Détails plateaux isolés::${String(error?.message||error).split('\n').join(' ').split('\r').join(' ').slice(0,800)}`);
  }

  const plateauGameCount=payloads.falGamePayloads.reduce((total,entry)=>total+normalizeFalGames(entry.payload).length,0);
  const plateauDetailTargeted=Number(payloads.falGameMeta?.targeted||payloads.falGamePayloads.length);
  const plateauDetailSucceeded=Number(payloads.falGameMeta?.succeeded||payloads.falGamePayloads.length);
  console.log(
    `FFF : détails de plateau — ${plateauDetailTargeted} ciblé(s), `+
    `${plateauDetailSucceeded} réussi(s), ${plateauGameCount} mini-match(s) trouvé(s), `+
    `collecte isolée activée si nécessaire.`
  );
  if(Array.isArray(payloads.falGameMeta?.failed)&&payloads.falGameMeta.failed.length){
    console.log(
      `::warning title=Détails plateaux FFF::`+
      payloads.falGameMeta.failed
        .map(item=>`${item.key} HTTP ${item.status||'réseau'} (${item.attempts||1} essai(s))`)
        .join(', ')
    );
  }
  if(payloads.falGamePayloads.length)console.log(`FFF : rattachement des mini-matchs — ${payloads.falGamePayloads.map(entry=>`${entry.payload?.site_key||'clé inconnue'}=${normalizeFalGames(entry.payload).length}`).join(', ')}.`);
  if(payloads.failedMonthly?.length){
    console.log(
      `::warning title=FFF partiel::Sous-requêtes mensuelles encore en échec après retry : `+
      payloads.failedMonthly.map(item=>`${item.id} ${item.status===200?'contenu incomplet':item.status?'HTTP '+item.status:'réseau'}`).join(', ')
    );
  }
  return payloads;
}

async function fetchEpreuves(targetUrls){
  try{
    const extraHeaders={accept:'application/ld+json, application/json',referer:`https://epreuves.fff.fr/competition/club/${CLUB_CODE}-escalquens-fc/club`};
    const probeIndex=targetUrls.probeIndex;
    const request=url=>fetch(url,{headers:{...headers,...extraHeaders},signal:AbortSignal.timeout(8000)});
    const probe=await fetchCompleteMatches(targetUrls.matches[probeIndex],request);
    const [matchResults,falResults]=await Promise.all([
      Promise.allSettled(targetUrls.matches.map((url,index)=>index===probeIndex?probe:fetchCompleteMatches(url,request))),
      Promise.allSettled(targetUrls.fal.map(async url=>{
        const response=await request(url);
        return response.ok?response.json():null;
      }))
    ]);
    const matches=matchResults.flatMap(result=>result.status==='fulfilled'?[result.value]:[]);
    const fal=falResults.flatMap(result=>result.status==='fulfilled'&&Array.isArray(result.value?.sites)?[result.value]:[]);
    const monthlyMatches=mergeMatchPayloads(matches);
    if(!payloadItems(monthlyMatches).length)throw new Error('API directe : aucun match sur la saison');
    const direct={matches:monthlyMatches,monthlyMatches,fal:mergeFalPayloads(fal),matchMonths:matches.length,falMonths:fal.length};
    if(matches.length===12&&fal.length===12)return {payloads:direct,transport:'direct'};
    if(!zenRowsEnabled())return {payloads:direct,transport:'direct partiel'};
    try{
      const fallback=await fetchZenRows(targetUrls);
      return {payloads:{
        ...fallback,
        matches:mergeMatchPayloads([fallback.matches,direct.matches]),
        monthlyMatches:matches.length>=fallback.matchMonths?direct.monthlyMatches:fallback.monthlyMatches,
        matchMonths:Math.max(matches.length,fallback.matchMonths),
        fal:mergeFalPayloads([direct.fal,fallback.fal]),
        falMonths:Math.max(fal.length,fallback.falMonths)
      },transport:'direct + zenrows-browser'};
    }catch{
      return {payloads:direct,transport:'direct partiel'};
    }
  }catch(directError){
    if(!zenRowsEnabled())throw directError;
    console.log(`Accès FFF direct indisponible, essai via ZenRows : ${String(directError?.message||directError).replace(/\r?\n/g,' ')}`);
    try{return {payloads:await fetchZenRows(targetUrls),transport:'zenrows-browser'}}
    catch(zenrowsError){throw new Error(`FFF direct : ${directError?.message||directError} ; ZenRows : ${zenrowsError?.message||zenrowsError}`)}
  }
}
const teamCategory=id=>{
  const code=String(id||'').split('_')[2]||'';
  if(code==='SEM')return 'Seniors';
  if(code==='SEF')return 'Seniors F';
  return code;
};
export function normalizeEpreuves(items){
  const matches=new Map();
  for(const wrapper of items){
    const item=wrapper.donneesFormatees||wrapper;
    const competition=item.competition?.donneesFormatees||item.competition||{};
    const home=item.recevant||{},away=item.visiteur||{};
    const isClub=side=>String(side.club?.clNo)===CLUB_NO||String(side.equipe?.id||'').split('_')[1]===CLUB_NO;
    const clubSide=isClub(home)?home:isClub(away)?away:null;
    const sourceId=String(item.maNo||wrapper.id||'');
    const played=[true,1,'1','true'].includes(item.joue);
    const statusLabel=String(item.maStatutLib||'').toLowerCase();
    const venueData=first(
      item.terrain,item.installation,item.stade,item.site?.terrain,item.site?.installation,
      item.rencontre?.terrain,item.rencontre?.installation,item.match?.terrain,item.match?.installation,
      item.donnees?.terrain,item.donnees?.installation
    )||{};
    const venue=text(first(venueData,item.lieu,item.site?.nom));
    const venueAddress=addressText(first(venueData.adresse,venueData.address,item.adresse,item.site?.adresse));
    const participants=[
      {name:home.club?.nomAbr||home.club?.nom||'',club_number:home.club?.clNo||'',team_number:home.equipe?.eqCod||home.equipe?.eqNo||home.equipe?.id||'',logo_url:cleanUrl(home.club?.logo),is_club:isClub(home)},
      {name:away.club?.nomAbr||away.club?.nom||'',club_number:away.club?.clNo||'',team_number:away.equipe?.eqCod||away.equipe?.eqNo||away.equipe?.id||'',logo_url:cleanUrl(away.club?.logo),is_club:isClub(away)}
    ];
    const row={
      source:'fff',source_id:sourceId,
      team_fff_id:clubSide?.equipe?.id||'',
      official_team:{
        name:clubSide?.club?.nomAbr||clubSide?.club?.nom||'',
        team_number:String(clubSide?.equipe?.eqCod||''),
        category_code:teamCategory(clubSide?.equipe?.id),
        competition_name:competition.nom||'',
        division:competition.lcLib||competition.niveau||'',
        pool:item.groupe?.nom||''
      },
      category:teamCategory(clubSide?.equipe?.id)||competition.lcLib||'',
      competition:[competition.nom,item.groupe?.nom].filter(Boolean).join(' · '),
      starts_at:item.date,venue,venue_address:venueAddress,
      latitude:numberOrNull(first(venueData.latitude,venueData.lat,item.latitude)),
      longitude:numberOrNull(first(venueData.longitude,venueData.lng,venueData.lon,item.longitude)),
      home_team:home.club?.nomAbr||home.club?.nom||'',
      away_team:away.club?.nomAbr||away.club?.nom||'',
      home_score:played?home.buts:null,away_score:played?away.buts:null,
      status:played?'finished':statusLabel.includes('report')?'postponed':statusLabel.includes('annul')?'cancelled':'scheduled',
      event_type:'match',
      source_url:`https://epreuves.fff.fr/competition/club/${CLUB_CODE}-escalquens-fc/club`,
      external_updated_at:wrapper.cachedAt||null,
      home_logo_url:cleanUrl(home.club?.logo),away_logo_url:cleanUrl(away.club?.logo),
      time_confirmed:item.heureCommuniquee!==false,
      participants,
      raw_json:wrapper
    };
    if(row.source_id&&row.starts_at&&row.home_team&&row.away_team&&clubSide)matches.set(row.source_id,row);
  }
  return [...matches.values()];
}
const falTeamName=team=>typeof team==='string'?team:text(first(
  team?.eqNom,team?.nom,team?.name,team?.label,team?.club?.clNom,
  team?.club?.nom,team?.club?.name
));
const falTeamLogo=team=>cleanUrl(first(team?.logo,team?.logoUrl,team?.club?.logo,team?.club?.logoUrl));
const falClubTeam=(team,name)=>String(first(team?.club?.clNo,team?.clNo,team?.club_number))===CLUB_NO||/escalquens/i.test(String(name||''));
const falScore=(game,team,side)=>{
  const home=side==='home';
  const value=first(
    team?.buts,team?.score,team?.nbButs,
    home?game.home_score:game.away_score,
    home?game.homeScore:game.awayScore,
    home?game.scoreEquipe1:game.scoreEquipe2,
    home?game.score1:game.score2,
    home?game.butsEquipe1:game.butsEquipe2,
    home?game.butsRecevant:game.butsVisiteur,
    home?game.scoreRecevant:game.scoreVisiteur
  );
  const number=numberOrNull(value);
  return Number.isFinite(number)?number:null;
};
const falPair=game=>[
  [game?.recevant,game?.visiteur],
  [game?.equipe1,game?.equipe2],
  [game?.equipeA,game?.equipeB],
  [game?.home,game?.away],
  [game?.domicile,game?.exterieur],
  [game?.homeTeam,game?.awayTeam]
].find(([home,away])=>falTeamName(home)&&falTeamName(away));
function normalizeFalGames(detail){
  const found=new Map();
  const visit=(value,depth=0)=>{
    if(!value||depth>8)return;
    if(Array.isArray(value)){for(const item of value)visit(item,depth+1);return}
    if(typeof value!=='object')return;
    const pair=falPair(value);
    if(pair){
      const [home,away]=pair,homeTeam=falTeamName(home),awayTeam=falTeamName(away);
      // Le programme FFF contient aussi les rencontres entre les autres clubs.
      // Le site du FCE ne conserve que celles où Escalquens participe.
      if(!falClubTeam(home,homeTeam)&&!falClubTeam(away,awayTeam))return;
      const homeScore=falScore(value,home,'home'),awayScore=falScore(value,away,'away');
      const officialId=first(value.maNo,value.matchId,value.match_id,value.mrNo,value.id,value['@id']);
      const key=String(officialId||`${homeTeam}|${awayTeam}|${homeScore??''}|${awayScore??''}`);
      if(!found.has(key))found.set(key,{
        source_game_id:key,home_team:homeTeam,away_team:awayTeam,
        home_score:homeScore,away_score:awayScore,
        status:homeScore!==null&&awayScore!==null?'finished':value.isCancelled||value.annule?'cancelled':'scheduled',
        home_logo_url:falTeamLogo(home),away_logo_url:falTeamLogo(away),raw_json:value
      });
      return;
    }
    for(const child of Object.values(value))visit(child,depth+1);
  };
  for(const entry of detail?.api_payloads||[])visit(entry?.body);
  return [...found.values()];
}
export function normalizeEpreuvesFal(payload,falGamePayloads=[]){
  const rows=new Map();
  const gameDetails=new Map(falGamePayloads.filter(entry=>entry?.payload?.api_payloads?.length)
    .map(entry=>[String(entry.payload.site_key||''),entry.payload]));
  for(const site of [...(payload?.sites||[]),...(payload?.sitesWithoutDate||[])]){
    const epreuve=site.epreuve||{};
    const clubTeam=(site.equipes||[]).find(team=>String(first(team.club?.clNo,team.clNo))===CLUB_NO);
    const startsAt=first(site.date,site.joDate);
    if(!clubTeam||!startsAt)continue;
    const category=String(epreuve.epNom||'').match(/\bU\d{1,2}F\b/i)?.[0].toUpperCase()||epreuve.caCod||clubTeam.caCod||'';
    const falTeamId=clubTeam.id||clubTeam.eqId||`FAL:${epreuve.epNo}:${epreuve.caCod||clubTeam.caCod||'categorie'}:${clubTeam.eqCod||1}`;
    // siNo évite d'écraser deux plateaux de la même journée organisés sur
    // des sites différents (cas fréquent lorsqu'un groupe engage U9-1/2/3).
    const sourceId=[epreuve.epNo,site.phNo,site.joNo,site.siNo].filter(value=>value!==undefined&&value!==null&&value!=='').join(':');
    const sourceUrl=`https://epreuves.fff.fr/animation-loisir/cdg/${DISTRICT_NO}/club/${CLUB_NO}/epreuve/${epreuve.epNo}/poule/${site.poNo}/journee/${site.joNo}/site/${site.siNo}/matchs`;
    const gameDetailKey=[epreuve.epNo,site.joNo,site.siNo].join(':');
    const plateauGames=gameDetails.has(gameDetailKey)?normalizeFalGames(gameDetails.get(gameDetailKey)):[];
    const organizer=site.organisateur?.clNom||'';
    const participants=(site.equipes||[]).map(team=>({
      name:team.eqNom||team.club?.clNom||team.club?.nom||'Équipe',
      club_number:team.club?.clNo||'',team_number:team.eqCod||team.eqNo||team.id||'',
      logo_url:cleanUrl(team.logo||team.club?.logo),
      is_club:String(team.club?.clNo)===CLUB_NO
    }));
    const opponents=participants.filter(team=>!team.is_club).map(team=>team.name);
    const terrain=site.terrain?.nom||'';
    const venueAddress=addressText(site.terrain?.adresse);
    const competition=[epreuve.epNom,site.phLib,site.seLib,site.poLib].filter(Boolean).join(' · ');
    const organizerIsClub=String(site.organisateur?.clNo)===CLUB_NO;
    const awayLabel=organizerIsClub
      ?`Plateau · ${opponents.length?opponents.join(', '):'participants à confirmer'}`
      :`Plateau à ${organizer||'confirmer'}`;
    const row={
      source:'district_fal',source_id:sourceId,
      team_fff_id:falTeamId,
      official_team:{
        name:clubTeam.eqNom||clubTeam.club?.clNom||clubTeam.club?.nom||'',
        team_number:String(clubTeam.eqCod||''),
        category_code:category,
        competition_name:epreuve.epNom||'',
        division:site.phLib||'',
        pool:site.poLib||site.seLib||''
      },
      category,competition,
      starts_at:startsAt,venue:terrain||organizer,venue_address:venueAddress,
      latitude:numberOrNull(first(site.terrain?.latitude,site.terrain?.lat,site.latitude)),
      longitude:numberOrNull(first(site.terrain?.longitude,site.terrain?.lng,site.terrain?.lon,site.longitude)),
      home_team:'FC Escalquens',away_team:awayLabel,
      status:site.isCancelled?'cancelled':'scheduled',event_type:'plateau',
      source_url:sourceUrl,
      external_updated_at:null,
      home_logo_url:cleanUrl(payload?.logo),
      away_logo_url:organizerIsClub?'':cleanUrl(site.organisateur?.logo),
      time_confirmed:Boolean(site.date)&&site.heureCommuniquee!==false,
      participants,
      // Une page sans données FAL laisse les mini-matchs existants en place.
      plateau_games:
        gameDetails.has(gameDetailKey)
          ?plateauGames
          :undefined,
      raw_json:site
    };
    if(sourceId)rows.set(sourceId,row);
  }
  return [...rows.values()];
}
async function collectEpreuvesFFF(){
  const now=new Date();
  const seasonYear=now.getUTCMonth()>=6?now.getUTCFullYear():now.getUTCFullYear()-1;
  const probeIndex=Math.max(0,Math.min(11,(now.getUTCFullYear()-seasonYear)*12+now.getUTCMonth()-6));
  const periods=Array.from({length:12},(_,offset)=>{
    const start=new Date(Date.UTC(seasonYear,6+offset,1));
    const end=new Date(Date.UTC(seasonYear,7+offset,0,23,59,59));
    return {start,end};
  });
  const targetUrls={
    probeIndex,
    seasonYear,
    matches:periods.map(({start,end})=>{
      const query=new URLSearchParams({dateDebut:start.toISOString().replace('.000Z','+00:00'),dateFin:end.toISOString().replace('.000Z','+00:00'),clNo:CLUB_NO,itemsPerPage:'100',pagination:'true'});
      return `https://epreuves.fff.fr/api/data/matches?${query}`;
    }),
    teamPeriods:periods,
    fal:periods.map(({start,end})=>{
      const query=new URLSearchParams({dateDebut:start.toISOString().slice(0,10),dateFin:end.toISOString().slice(0,10)});
      return `https://epreuves.fff.fr/api/fal/cdg/${DISTRICT_NO}/club/${CLUB_NO}/sites?${query}`;
    })
  };
  const requestDofa=url=>fetch(url,{
    headers:{accept:'application/ld+json, application/json'},
    signal:AbortSignal.timeout(7000)
  });
  const dofaClub=fetchDofaSeason({clubNo:CLUB_NO,seasonYear},requestDofa);
  let payloads,transport;
  try{
    ({payloads,transport}=await fetchEpreuves(targetUrls));
  }catch(error){
    const dofa=await dofaClub;
    if(!dofa.rows.length)throw error;
    console.log(`::warning title=FFF Épreuves::${String(error.message).replace(/\r?\n/g,' ')}`);
    payloads=epreuvesPayloadFromZenRows('');
    transport='DOFA';
  }

  const dofa=await dofaClub;
  if(!dofa.complete&&payloads.matchMonths<12){
    const poolPaths=[...knownCompetitions(seasonYear),...(payloads.calendarPoolPaths||[]).map(pool=>pool.path)];
    const pools=await fetchDofaPools(CLUB_NO,poolPaths,requestDofa);
    dofa.rows.push(...pools.rows);
    dofa.errors.push(...pools.errors);
    console.log(`FFF DOFA : ${pools.answered}/${pools.targeted} poules ont livré des matchs.`);
  }
  if(dofa.errors.length)console.log(`FFF DOFA : ${[...new Set(dofa.errors)].slice(0,10).join(' ; ')}.`);
  const referenceRows=normalizeEpreuves(payloadItems(payloads.matches));
  const additions=dofaMatchCollections(dofa.rows,{clubNo:CLUB_NO,clubCode:CLUB_CODE,seasonYear},referenceRows);
  const merged=mergeMatchPayloads([additions,payloads.matches]);
  console.log(`FFF DOFA : ${additions['hydra:member'].length}/${dofa.rows.length} rencontres de la saison exploitables (${dofa.origin}), ${merged['hydra:member'].length-payloadItems(payloads.matches).length} inédites.`);
  payloads.matches=merged;

  if(!payloads.standings?.length&&zenRowsEnabled()){
    await collectStandingsSeparately(payloads,seasonYear);
  }

  latestStandings=
    Array.isArray(payloads.standings)
      ?payloads.standings
      :[];

  latestStandingsInfo={
    ...(payloads.standingsMeta||{}),
    attempted:Boolean(payloads.standingsMetaPresent)
  };

  if(latestStandingsInfo.attempted){
    const discovery=
      latestStandingsInfo.discovery
      ||{};

    if(latestStandingsInfo.error){
      console.log(
        `::warning title=Collecteur classements::${String(latestStandingsInfo.error).replace(/\r?\n/g,' ').slice(0,800)}`
      );
    }

    console.log(
      `FFF : découverte classements — DOM=${Number(discovery.dom||0)}, `+
      `HTML=${Number(discovery.fetched||0)}, `+
      `fallback=${Number(discovery.fallback||0)}, `+
      `équipes=${Number(discovery.teams||0)}, `+
      `détails=${Number(discovery.details||0)}, `+
      `saison=${Number(discovery.season||0)}.`
    );

    console.log(
      `FFF : ${latestStandings.length} ligne(s) de classement capturée(s) `
      +`sur ${Number(latestStandingsInfo.detected||0)} classement(s) détecté(s).`
    );
  }

  const items=payloadItems(payloads.matches);
  const matches=normalizeEpreuves(items),plateaux=normalizeEpreuvesFal(payloads.fal,payloads.falGamePayloads);
  if(!matches.length&&!plateaux.length)throw new Error('FFF a renvoyé zéro match et zéro plateau sur les douze mois');
  const monthlyItems=payloadItems(payloads.monthlyMatches);
  const matchIds=new Set(monthlyItems.map(item=>String(item?.donneesFormatees?.maNo||item.maNo||item.id||item['@id'])));
  const seasonStart=`${seasonYear}-07-01`,seasonEnd=`${seasonYear+1}-07-01`;
  const seasonMatches=matches.filter(row=>Number.isFinite(Date.parse(row.starts_at))
    &&row.starts_at>=seasonStart&&row.starts_at<seasonEnd);
  const byCategory=Map.groupBy(seasonMatches,row=>row.category||'Sans catégorie');
  for(const [category,rows] of byCategory){
    const dates=rows.map(row=>row.starts_at.slice(0,10)).sort();
    const months=[...new Set(dates.map(date=>date.slice(0,7)))];
    console.log(`FFF saison ${category} : ${rows.length} matchs du ${dates[0]} au ${dates.at(-1)} (mois avec matchs : ${months.join(', ')}).`);
  }
  const fullMatches=payloads.matchMonths===12&&matchIds.size>0&&seasonMatches.length===matchIds.size
    &&seasonMatches.every(row=>matchIds.has(row.source_id));
  const importedTeams=new Map(seasonMatches.map(row=>[row.source_id,row.team_fff_id]));
  const teamWindows=(payloads.calendarResults||[]).flatMap(result=>{
    if(!/^\d{4}_101544_U18F_\d+$/.test(result.id))return [];
    return (result.coverage||[]).flatMap(({window})=>window
      &&window.starts_on>=seasonStart&&window.ends_before<=seasonEnd
      &&window.ids.every(id=>importedTeams.get(id)===result.id)
      ?[{...window,team_fff_id:result.id}]:[]);
  });
  teamWindows.push(...(payloads.poolTeamWindows||[]).filter(window=>window.starts_on>=seasonStart
    &&window.ends_before<=seasonEnd&&window.ids.every(id=>importedTeams.get(id)===window.team_fff_id)));
  if(teamWindows.length)console.log(`FFF : ${teamWindows.length} période(s) U18F vérifiée(s) pour le rapprochement.`);
  const incomplete=[];
  if(!fullMatches)incomplete.push(`matchs : ${payloads.matchMonths}/12 mois valides, ${seasonMatches.length} matchs exploitables`);
  if(payloads.falMonths!==12)incomplete.push(`plateaux : ${payloads.falMonths}/12 mois valides`);
  console.log(`FFF : ${seasonMatches.length} matchs et ${plateaux.length} plateaux reçus via ${transport}.`);
  return {
    rows:[...seasonMatches,...plateaux],
    incomplete,
    hasMatches:seasonMatches.length>0,
    matchSnapshot:fullMatches||teamWindows.length
      ?{starts_on:seasonStart,ends_before:seasonEnd,ids:fullMatches?[...matchIds]:[],
        team_windows:teamWindows,seen_ids:[...importedTeams.keys()]}
      :undefined
  };
}
async function collectDistrict(){const base='https://haute-garonne.fff.fr/football-animation-et-loisirs/',html=await fetchOk(base,'text',{accept:'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',referer:'https://haute-garonne.fff.fr/','sec-fetch-dest':'document','sec-fetch-mode':'navigate','sec-fetch-site':'same-origin','upgrade-insecure-requests':'1'}),match=html.match(/<div id=["']animation-data["'][^>]*>\s*([\s\S]*?)\s*<\/div>/i);if(!match)throw new Error('District : animation-data introuvable');const data=JSON.parse(match[1]),rows=[];for(const competition of data){if(!competition.clubs?.some(club=>Number(club.cl_no)===Number(CLUB_NO)&&Number(club.cl_cod)===Number(CLUB_CODE)))continue;for(const phase of competition.phases||[])for(const journey of phase.journees||[]){const sites=(phase.secteurs||[]).flatMap(sector=>sector.poules||[]).flatMap(pool=>pool.journees||[]).find(item=>item.fa_jo_no===journey.fa_jo_no)?.sites||[],site=sites.find(item=>Number(item.club_organisateur?.cl_no)===Number(CLUB_NO)||(item.equipes||[]).some(club=>Number(first(club.cl_no,club.club?.cl_no))===Number(CLUB_NO))),kind=phase.fa_mr_cod==='P'?'plateau':'animation';rows.push({source:'district_fal',source_id:`${competition.fa_ep_no}:${phase.fa_ph_no}:${journey.fa_jo_no}`,category:String(competition.fa_ca_lib||competition.fa_ca_cod||''),competition:`${competition.fa_ep_nom} · ${phase.fa_ph_lib}`,starts_at:iso(first(site?.fa_si_date,journey.fa_jo_date),first(site?.fa_si_ho_cod,journey.fa_ho_cod)),venue:text(first(site?.installation,site?.club_organisateur)),home_team:'FC Escalquens',away_team:kind==='plateau'?'Plateau – participants à confirmer':'Rencontre – adversaire à confirmer',status:site?.fa_si_cancelled?'cancelled':'scheduled',event_type:kind,source_url:`${base}?fal_id=${competition.fa_ep_no}&type=fa&clNo=${CLUB_NO}&clCod=${CLUB_CODE}&checkDate=false`,external_updated_at:competition.date_maj,raw_json:{competition:{id:competition.fa_ep_no,name:competition.fa_ep_nom},phase:{id:phase.fa_ph_no,name:phase.fa_ph_lib},journey,site:site||null}})}}return rows.filter(row=>row.starts_at)}
let latestSources=[];
async function reportFailure(error){
  try{
    const sources=latestSources.length?latestSources:[{source:'collector',status:'error',error:String(error?.message||error)}];
    if(!sources.some(source=>source.status==='error'))sources.push({source:'collector',status:'error',error:String(error?.message||error)});
    const response=await fetch(statusEndpoint,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({status:'error',imported_count:0,sources})});
    if(!response.ok)console.log(`::warning title=État de synchronisation non enregistré::HTTP ${response.status}`);
  }catch(reportError){
    console.log(`::warning title=État de synchronisation non enregistré::${String(reportError?.message||reportError).replace(/\r?\n/g,' ')}`);
  }
}

async function importLatestStandings(sources){
  const detected=Number(latestStandingsInfo.detected||0);

  if(!latestStandings.length){
    const error=detected
      ?`${detected} classement(s) détecté(s), mais aucune ligne exploitable.`
      :'Aucun classement FFF détecté.';

    console.log(
      `::warning title=Classements FFF::${error}`
    );

    sources.push({
      source:'standings',
      status:'warning',
      error
    });

    return;
  }

  console.log(
    `Classements FFF : import de ${latestStandings.length} ligne(s) vers le Worker...`
  );

  try{
    const response=await fetch(
      standingsEndpoint,
      {
        method:'POST',
        headers:{
          authorization:`Bearer ${token}`,
          'content-type':'application/json'
        },
        body:JSON.stringify({
          rows:latestStandings
        })
      }
    );

    const raw=await response.text();

    if(!response.ok){
      throw new Error(
        `HTTP ${response.status}: ${raw}`
      );
    }

    let result={};

    try{
      result=JSON.parse(raw);
    }catch{}

    console.log(
      `Classements FFF importés : ${Number(result.accepted??0)} ligne(s), `
      +`${Number(result.linked||0)} rattachement(s).`
    );

    sources.push({
      source:'standings',
      status:'ok',
      count:Number(result.accepted??0),
      linked:Number(result.linked||0)
    });

  }catch(error){
    const message=String(
      error?.message||error
    ).replace(/\r?\n/g,' ');

    console.log(
      `::warning title=Classements FFF::${message}`
    );

    sources.push({
      source:'standings',
      status:'warning',
      error:message
    });
  }
}

async function importMatchRows(rows,sources,matchSnapshot){
  const chunkSize=40;
  const chunks=[];

  for(let index=0;index<rows.length;index+=chunkSize){
    chunks.push(rows.slice(index,index+chunkSize));
  }

  const summary={
    ok:true,
    received:0,
    accepted:0,
    changed:0,
    discovered:0,
    removed_stale_matches:0,
    status:sources.some(source=>source?.status==='error')?'partial':'success'
  };

  for(let index=0;index<chunks.length;index++){
    const final=index===chunks.length-1;
    const chunk=chunks[index];
    let lastError=null;

    for(let attempt=1;attempt<=2;attempt++){
      try{
        const response=await fetch(
          endpoint,
          {
            method:'POST',
            headers:{
              authorization:`Bearer ${token}`,
              'content-type':'application/json'
            },
            body:JSON.stringify({
              rows:chunk,
              sources,
              batch:{
                final,
                match_snapshot:final?matchSnapshot:undefined
              }
            })
          }
        );

        const raw=await response.text();

        if(!response.ok){
          throw new Error(
            `HTTP ${response.status}: ${raw}`
          );
        }

        const result=parseJson(
          raw,
          `import matchs lot ${index+1}`
        );

        summary.received+=Number(result.received||chunk.length);
        summary.accepted+=Number(result.accepted||0);
        summary.changed+=Number(result.changed||0);
        summary.discovered+=Number(result.discovered||0);
        summary.removed_stale_matches+=Number(result.removed_stale_matches||0);

        console.log(
          `Cloudflare matchs : lot ${index+1}/${chunks.length} — `
          +`${Number(result.accepted||0)} accepté(s), `
          +`${Number(result.changed||0)} changement(s).`
        );

        lastError=null;
        break;

      }catch(error){
        lastError=error;

        if(attempt<2){
          console.log(
            `Import matchs lot ${index+1}/${chunks.length} en échec, nouvel essai...`
          );

          await new Promise(
            resolve=>setTimeout(resolve,1200)
          );
        }
      }
    }

    if(lastError){
      throw new Error(
        `Import Cloudflare lot ${index+1}/${chunks.length} : `
        +String(lastError?.message||lastError)
      );
    }
  }

  return summary;
}

export function acceptsPartialImport({enabled,hasMatches,failures,accepted,expected}){
  return enabled&&hasMatches&&failures.length===1&&failures[0].source==='fff'
    &&expected>0&&accepted===expected;
}

async function main(){
  let rows=[],sources=[],matchSnapshot,hasMatches=false;
  try{
    const result=await collectEpreuvesFFF();
    ({rows,matchSnapshot,hasMatches}=result);
    sources.push(result.incomplete.length
      ?{source:'fff',status:'error',count:rows.length,error:result.incomplete.join(' ; ')}
      :{source:'fff',status:'ok',count:rows.length});
  }catch(error){
    sources.push({source:'fff',status:'error',error:String(error?.message||error)});
    try{
      rows=await collectDistrict();
      sources.push({source:'district',status:'ok',count:rows.length});
    }catch(districtError){
      sources.push({source:'district',status:'error',error:String(districtError?.message||districtError)});
    }
  }
  latestSources=sources;
  if(!rows.length){
    if(latestStandings.length)await importLatestStandings(sources);
    throw new Error(`Aucune rencontre collectée : ${sources.filter(item=>item.status==='error').map(item=>`${item.source} — ${item.error}`).join(' ; ')}`);
  }

  const importResult=
    await importMatchRows(
      rows,
      sources,
      matchSnapshot
    );

  await importLatestStandings(sources);

  console.log(
    JSON.stringify(importResult)
  );

  console.table(sources);
  const failures=sources.filter(item=>item.status==='error');
  const acceptedPartial=acceptsPartialImport({
    enabled:process.env.FCE_ALLOW_PARTIAL_MATCH_IMPORT==='true',
    hasMatches,failures,accepted:importResult.accepted,expected:rows.length
  });
  const annotation=acceptedPartial?'warning':'error';
  for(const source of failures)console.log(`::${annotation} title=Source ${source.source} incomplète::${String(source.error).replace(/\r?\n/g,' ')}`);
  if(acceptedPartial){
    console.log('Préproduction : import partiel accepté. Le statut partial reste enregistré dans D1.');
  }else if(failures.length){
    console.error('La synchronisation est partielle : GitHub la signale en échec pour déclencher les alertes. Les données disponibles ont tout de même été importées.');
    process.exitCode=1;
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  if(process.argv.includes('--diagnostic-calendrier')){
    await diagnosePublicCalendar();
  }else{
    console.log(`Collecteur FCE ${SYNC_VERSION}`);
    if(!siteUrl||!token)throw new Error('Secrets FCE_SITE_URL ou FCE_SYNC_TOKEN manquants');
    try{await main()}catch(error){await reportFailure(error);throw error}
  }
}

import {mergeMatchPayloads,mergeFalPayloads,enrichMatchPayloads} from './fff-normalize.mjs';
const CLUB_NO='101544',DISTRICT_NO='86';
const payloadItems=payload=>Array.isArray(payload)?payload:payload?.['hydra:member']||payload?.items||[];
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
  try{const envelope=parseJson(match[1],id);if(Number(envelope.status)!==200)return null;return parseJson(envelope.body,id);}catch{return null;}
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
export const epreuvesPayloadFromZenRows=body=>{
  let result;
  try{result=JSON.parse(body)}catch{result={html:body}}
  const html=result?.html||'';
  const matchPayloads=Array.from({length:12},(_,index)=>embeddedPayloadFromHtml(html,`fce-matches-${index}`)).filter(Boolean);
  const falPayloads=Array.from({length:12},(_,index)=>embeddedPayloadFromHtml(html,`fce-fal-${index}`)).filter(Boolean);
  const failedMonthly=[
    ...Array.from({length:12},(_,index)=>{
      const status=embeddedStatusFromHtml(html,`fce-matches-${index}`);
      return status===200?null:{id:`fce-matches-${index}`,status};
    }),
    ...Array.from({length:12},(_,index)=>{
      const status=embeddedStatusFromHtml(html,`fce-fal-${index}`);
      return status===200?null:{id:`fce-fal-${index}`,status};
    })
  ].filter(Boolean);
  const validMatchPayloads=matchPayloads.filter((payload,index)=>{
    const valid=Array.isArray(payload?.['hydra:member'])&&payload['hydra:totalItems']===new Set(payload['hydra:member'].map(wrapper=>String(wrapper?.donneesFormatees?.maNo||wrapper?.maNo||wrapper?.id||wrapper?.['@id']||''))).size;
    if(!valid)failedMonthly.push({id:`match-schema-${index}`,status:200,error:'Collection tronquée ou schéma invalide'});return valid;
  });
  const validFalPayloads=falPayloads.filter((payload,index)=>{
    const valid=Array.isArray(payload?.sites)&&Array.isArray(payload?.sitesWithoutDate);
    if(!valid)failedMonthly.push({id:`fal-schema-${index}`,status:200,error:'Schéma invalide'});return valid;
  });
  const dayMatches=embeddedEntriesByPrefix(html,'fce-day-matches-');
  const dayFal=embeddedEntriesByPrefix(html,'fce-day-fal-');
  const daily=dayMatches.map(entry=>({day:entry.id.replace('fce-day-matches-',''),matches:entry.payload,fal:dayFal.find(item=>item.id.endsWith(entry.id.replace('fce-day-matches-','')))?.payload}));
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
    matches:enrichMatchPayloads(mergeMatchPayloads([...validMatchPayloads,...dayMatches.map(e=>e.payload).filter(p=>Array.isArray(p?.['hydra:member']))]),detailPayloads),fal:mergeFalPayloads([...validFalPayloads,...dayFal.map(e=>e.payload).filter(p=>Array.isArray(p?.sites)&&Array.isArray(p?.sitesWithoutDate))]),
    daily,
    matchMonths:validMatchPayloads.length,falMonths:validFalPayloads.length,
    detailCount:detailPayloads.length,venueDetailCount:venueDetails,
    falGamePayloads,
    falGameMeta,
    standings,
    standingsMeta,
    standingsMetaPresent:Boolean(standingsMetaPayload),
    monthly:matchPayloads.map((p,index)=>({index,announced:p['hydra:totalItems'],received:p?.['hydra:member']?.length??0})),
    failedMonthly,
    reference:embeddedPayloadFromHtml(html,'fce-reference')
  };
};

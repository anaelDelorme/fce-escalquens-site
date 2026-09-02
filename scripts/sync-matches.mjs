const SYNC_VERSION='2026.09.02-9',CLUB_NO='101544',CLUB_CODE='550350';
console.log(`Collecteur FCE ${SYNC_VERSION}`);
const endpoint=process.env.FCE_SITE_URL?.replace(/\/$/,'')+'/internal/sync/matches';
const token=process.env.FCE_SYNC_TOKEN;
const force=process.env.FORCE_SYNC==='true';
const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',weekday:'short',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(part=>[part.type,part.value]));
const hour=Number(parts.hour),day=parts.weekday;
const scheduled=hour===22||(day==='Fri'&&hour>=16&&(hour-16)%4===0)||((day==='Sat'||day==='Sun')&&hour%4===0)||(day==='Mon'&&hour<=14&&hour%4===0);
if(!force&&!scheduled){console.log(`Pas de collecte prévue actuellement (${day} ${hour} h, heure de Paris).`);process.exit(0)}
if(!process.env.FCE_SITE_URL||!token)throw new Error('Secrets FCE_SITE_URL ou FCE_SYNC_TOKEN manquants');
const headers={accept:'application/ld+json, application/json, text/html;q=0.9','accept-language':'fr-FR,fr;q=0.9','user-agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/128 Safari/537.36',referer:'https://occitanie.fff.fr/'};
const first=(...values)=>values.find(value=>value!==undefined&&value!==null&&value!=='');
const text=value=>typeof value==='string'?value:value?.name||value?.label||value?.short_name||value?.libelle||'';
const entityName=entity=>text(first(entity?.short_name_federation,entity?.short_name_ligue,entity?.short_name,entity?.name,entity?.label,entity?.nom,entity?.code));
const iso=(date,time='')=>{if(!date)return '';const raw=String(date);if(raw.includes('T'))return raw;const normalized=String(time||'12:00').replace('h',':').padEnd(5,'0');return `${raw}T${/^\d{1,2}:\d{2}$/.test(normalized)?normalized:'12:00'}:00`};
const cleanUrl=value=>{const raw=String(value||''),markdown=raw.match(/^\[[^\]]+\]\((https?:\/\/[^)]+)\)$/);return markdown?markdown[1]:raw};
async function fetchOk(url,kind='json',extraHeaders={}){const response=await fetch(url,{headers:{...headers,...extraHeaders},redirect:'follow'});if(!response.ok){const detail=(await response.text()).replace(/\s+/g,' ').slice(0,180);throw new Error(`${new URL(url).hostname} HTTP ${response.status}${detail?` — ${detail}`:''}`)}return kind==='text'?response.text():response.json()}
const payloadItems=payload=>Array.isArray(payload)?payload:payload['hydra:member']||payload.items||payload.data||payload.matches||[];
const parseJson=(value,label='réponse')=>{try{return typeof value==='string'?JSON.parse(value):value}catch{throw new Error(`${label} JSON invalide`)}};
const epreuvesPayloadFromState=state=>{
  const entry=Object.entries(state||{}).find(([key,value])=>key.includes('analog_GET|/api/data/matches?')&&value?.status===200&&value?.body);
  return entry?.[1]?.body||null;
};
const epreuvesPayloadFromHtml=html=>{
  const match=String(html||'').match(/<script[^>]+id=["']ng-state["'][^>]*>([\s\S]*?)<\/script>/i);
  return match?epreuvesPayloadFromState(parseJson(match[1],'ng-state')):null;
};
const epreuvesPayloadPeriod=payload=>{
  const iri=payload?.['hydra:view']?.['@id']||payload?.['@id'];
  if(!iri)return '';
  try{
    const url=new URL(iri,'https://epreuves.fff.fr');
    const start=url.searchParams.get('dateDebut'),end=url.searchParams.get('dateFin');
    return start&&end?`${start}|${end}`:'';
  }catch{return ''}
};
const epreuvesPayloadFromZenRows=body=>{
  let result;
  try{result=JSON.parse(body)}catch{return epreuvesPayloadFromHtml(body)}
  if(result?.['hydra:member'])return result;
  const xhr=(result?.xhr||[]).filter(item=>{
    try{const url=new URL(item.url,'https://epreuves.fff.fr');return url.pathname==='/api/data/matches'&&url.searchParams.get('clNo')===CLUB_NO}catch{return false}
  });
  const payloadByPeriod=new Map();
  const initialPayload=epreuvesPayloadFromHtml(result?.html);
  if(initialPayload)payloadByPeriod.set(epreuvesPayloadPeriod(initialPayload)||'initial',initialPayload);
  for(const item of xhr.filter(item=>item.status_code===200))try{
    const url=new URL(item.url,'https://epreuves.fff.fr');
    const period=`${url.searchParams.get('dateDebut')}|${url.searchParams.get('dateFin')}`;
    payloadByPeriod.set(period,parseJson(item.body,'XHR FFF'));
  }catch{}
  const payloads=[...payloadByPeriod.values()];
  if(payloads.length)return {
    '@context':'/api/contexts/Match','@id':'/api/matches','@type':'hydra:Collection',
    'hydra:totalItems':payloads.reduce((total,payload)=>total+Number(payload?.['hydra:totalItems']??payloadItems(payload).length),0),
    'hydra:member':payloads.flatMap(payloadItems),
    '_fce_months_received':payloads.length
  };
  return initialPayload;
};
async function fetchZenRows(targetUrls,currentSeasonMonth){
  const apiKey=process.env.ZENROWS_API_KEY;
  if(!apiKey)throw new Error('ZENROWS_API_KEY absent');
  const clubPage=`https://epreuves.fff.fr/competition/club/${CLUB_CODE}-f-c-escalquens/club`;
  const calendar='app-match app-matches-wrapper';
  const instructions=[{wait_for:`${calendar} button.next-button`}];
  // La page possède déjà le jeton interne FFF. Ses boutons officiels déclenchent
  // donc les requêtes autorisées que ZenRows enregistre dans `xhr`.
  for(let month=currentSeasonMonth;month>0;month--){
    instructions.push({click:`${calendar} button.prev-button`},{wait:850});
  }
  for(let month=1;month<targetUrls.length;month++){
    instructions.push({click:`${calendar} button.next-button`},{wait:850});
  }
  instructions.push({wait:1200});
  const url=new URL('https://api.zenrows.com/v1/');
  url.searchParams.set('apikey',apiKey);
  url.searchParams.set('url',clubPage);
  url.searchParams.set('js_render','true');
  url.searchParams.set('premium_proxy','true');
  url.searchParams.set('proxy_country','fr');
  url.searchParams.set('json_response','true');
  url.searchParams.set('js_instructions',JSON.stringify(instructions));
  const response=await fetch(url,{headers:{accept:'application/json'},redirect:'follow'});
  const body=await response.text();
  if(!response.ok)throw new Error(`ZenRows HTTP ${response.status}${body?` — ${body.replace(/\s+/g,' ').slice(0,180)}`:''}`);
  const credits=response.headers.get('x-request-credits');
  const cost=response.headers.get('x-request-cost');
  if(credits)console.log(`ZenRows : ${credits} crédit(s) consommé(s).`);
  if(cost)console.log(`ZenRows : coût indiqué ${cost}.`);
  const payload=epreuvesPayloadFromZenRows(body);
  if(!payload)throw new Error(`ZenRows a chargé la page, mais aucun JSON de matchs exploitable n'a été trouvé`);
  const receivedMonths=Number(payload._fce_months_received||0);
  console.log(`FFF : ${receivedMonths}/${targetUrls.length} mois capturés dans la session ZenRows.`);
  if(receivedMonths!==targetUrls.length)throw new Error(`calendrier FFF incomplet : ${receivedMonths}/${targetUrls.length} mois capturés`);
  return payload;
}

async function fetchEpreuves(targetUrl,monthlyUrls,currentSeasonMonth){
  try{
    return {payload:await fetchOk(targetUrl,'json',{
      accept:'application/ld+json, application/json',
      referer:`https://epreuves.fff.fr/competition/club/${CLUB_CODE}-escalquens-fc/club`
    }),transport:'direct'};
  }catch(directError){
    console.log(`Accès FFF direct indisponible, essai via ZenRows : ${String(directError?.message||directError).replace(/\r?\n/g,' ')}`);
    try{return {payload:await fetchZenRows(monthlyUrls,currentSeasonMonth),transport:'zenrows-browser'}}
    catch(zenrowsError){throw new Error(`FFF direct : ${directError?.message||directError} ; ZenRows : ${zenrowsError?.message||zenrowsError}`)}
  }
}
const teamCategory=id=>{
  const code=String(id||'').split('_')[2]||'';
  if(code==='SEM')return 'Seniors';
  if(code==='SEF')return 'Seniors F';
  return code;
};
function normalizeEpreuves(items){
  const matches=new Map();
  for(const wrapper of items){
    const item=wrapper.donneesFormatees||wrapper;
    const competition=item.competition?.donneesFormatees||item.competition||{};
    const home=item.recevant||{},away=item.visiteur||{};
    const clubSide=String(home.club?.clNo)===CLUB_NO?home:String(away.club?.clNo)===CLUB_NO?away:null;
    const sourceId=String(item.maNo||wrapper.id||'');
    const played=Boolean(item.joue);
    const statusLabel=String(item.maStatutLib||'').toLowerCase();
    const row={
      source:'fff',source_id:sourceId,
      team_fff_id:clubSide?.equipe?.id||'',
      category:teamCategory(clubSide?.equipe?.id)||competition.lcLib||'',
      competition:[competition.nom,item.groupe?.nom].filter(Boolean).join(' · '),
      starts_at:item.date,venue:'',
      home_team:home.club?.nomAbr||home.club?.nom||'',
      away_team:away.club?.nomAbr||away.club?.nom||'',
      home_score:played?home.buts:null,away_score:played?away.buts:null,
      status:played?'finished':statusLabel.includes('report')?'postponed':statusLabel.includes('annul')?'cancelled':'scheduled',
      event_type:'match',
      source_url:`https://epreuves.fff.fr/competition/club/${CLUB_CODE}-escalquens-fc/club`,
      external_updated_at:wrapper.cachedAt||null,
      home_logo_url:cleanUrl(home.club?.logo),away_logo_url:cleanUrl(away.club?.logo),
      raw_json:wrapper
    };
    if(row.source_id&&row.starts_at&&row.home_team&&row.away_team&&clubSide)matches.set(row.source_id,row);
  }
  return [...matches.values()];
}
async function collectEpreuvesFFF(){
  const now=new Date();
  const seasonYear=now.getUTCMonth()>=6?now.getUTCFullYear():now.getUTCFullYear()-1;
  const currentSeasonMonth=Math.max(0,Math.min(11,(now.getUTCFullYear()-seasonYear)*12+now.getUTCMonth()-6));
  const start=new Date(Date.UTC(seasonYear,6,1));
  const end=new Date(Date.UTC(seasonYear+1,5,30,23,59,59));
  const query=new URLSearchParams({
    dateDebut:start.toISOString().replace('.000Z','+00:00'),
    dateFin:end.toISOString().replace('.000Z','+00:00'),
    clNo:CLUB_NO,itemsPerPage:'1000',pagination:'true'
  });
  const targetUrl=`https://epreuves.fff.fr/api/data/matches?${query}`;
  const monthlyUrls=Array.from({length:12},(_,offset)=>{
    const monthStart=new Date(Date.UTC(seasonYear,6+offset,1));
    const monthEnd=new Date(Date.UTC(seasonYear,7+offset,0,23,59,59));
    const monthQuery=new URLSearchParams({
      dateDebut:monthStart.toISOString().replace('.000Z','+00:00'),
      dateFin:monthEnd.toISOString().replace('.000Z','+00:00'),
      clNo:CLUB_NO,itemsPerPage:'100',pagination:'true'
    });
    return `https://epreuves.fff.fr/api/data/matches?${monthQuery}`;
  });
  const {payload,transport}=await fetchEpreuves(targetUrl,monthlyUrls,currentSeasonMonth);
  const items=payloadItems(payload);
  const total=Number(payload['hydra:totalItems']??items.length);
  if(total>items.length)throw new Error(`FFF annonce ${total} matchs mais n'en renvoie que ${items.length}; pagination à ajouter avant import`);
  console.log(`FFF : ${items.length} matchs reçus via ${transport}.`);
  return normalizeEpreuves(items);
}
async function collectFFF(){
  return collectEpreuvesFFF();
}
async function collectDistrict(){const base='https://haute-garonne.fff.fr/football-animation-et-loisirs/',html=await fetchOk(base,'text',{accept:'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',referer:'https://haute-garonne.fff.fr/','sec-fetch-dest':'document','sec-fetch-mode':'navigate','sec-fetch-site':'same-origin','upgrade-insecure-requests':'1'}),match=html.match(/<div id=["']animation-data["'][^>]*>\s*([\s\S]*?)\s*<\/div>/i);if(!match)throw new Error('District : animation-data introuvable');const data=JSON.parse(match[1]),rows=[];for(const competition of data){if(!competition.clubs?.some(club=>Number(club.cl_no)===Number(CLUB_NO)&&Number(club.cl_cod)===Number(CLUB_CODE)))continue;for(const phase of competition.phases||[])for(const journey of phase.journees||[]){const sites=(phase.secteurs||[]).flatMap(sector=>sector.poules||[]).flatMap(pool=>pool.journees||[]).find(item=>item.fa_jo_no===journey.fa_jo_no)?.sites||[],site=sites.find(item=>Number(item.club_organisateur?.cl_no)===Number(CLUB_NO)||(item.equipes||[]).some(club=>Number(first(club.cl_no,club.club?.cl_no))===Number(CLUB_NO))),kind=phase.fa_mr_cod==='P'?'plateau':'animation';rows.push({source:'district_fal',source_id:`${competition.fa_ep_no}:${phase.fa_ph_no}:${journey.fa_jo_no}`,category:String(competition.fa_ca_lib||competition.fa_ca_cod||''),competition:`${competition.fa_ep_nom} · ${phase.fa_ph_lib}`,starts_at:iso(first(site?.fa_si_date,journey.fa_jo_date),first(site?.fa_si_ho_cod,journey.fa_ho_cod)),venue:text(first(site?.installation,site?.club_organisateur)),home_team:'FC Escalquens',away_team:kind==='plateau'?'Plateau – participants à confirmer':'Rencontre – adversaire à confirmer',status:site?.fa_si_cancelled?'cancelled':'scheduled',event_type:kind,source_url:`${base}?fal_id=${competition.fa_ep_no}&type=fa&clNo=${CLUB_NO}&clCod=${CLUB_CODE}&checkDate=false`,external_updated_at:competition.date_maj,raw_json:{competition:{id:competition.fa_ep_no,name:competition.fa_ep_nom},phase:{id:phase.fa_ph_no,name:phase.fa_ph_lib},journey,site:site||null}})}}return rows.filter(row=>row.starts_at)}
const attempts=await Promise.allSettled([collectFFF(),collectDistrict()]),names=['fff','district'],sources=attempts.map((result,index)=>result.status==='fulfilled'?{source:names[index],status:'ok',count:result.value.length}:{source:names[index],status:'error',error:String(result.reason?.message||result.reason)}),rows=attempts.flatMap(result=>result.status==='fulfilled'?result.value:[]);
if(!rows.length)throw new Error(`Aucune donnée collectée : ${sources.map(item=>item.status==='ok'?`${item.source} OK (${item.count} rencontre)`: `${item.source} ERREUR — ${item.error}`).join(' ; ')}`);
const response=await fetch(endpoint,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({rows,sources})}),raw=await response.text();if(!response.ok)throw new Error(`Import Cloudflare HTTP ${response.status}: ${raw}`);console.log(raw);console.table(sources);for(const source of sources.filter(item=>item.status==='error'))console.log(`::warning title=Source ${source.source} indisponible::${String(source.error).replace(/\r?\n/g,' ')}`);

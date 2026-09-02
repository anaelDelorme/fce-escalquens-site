const SYNC_VERSION='2026.09.02-11',CLUB_NO='101544',CLUB_CODE='550350',DISTRICT_NO='86';
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
  return parseJson(envelope.body,id);
};
const mergeMatchPayloads=payloads=>{
  const unique=new Map();
  for(const wrapper of payloads.flatMap(payloadItems)){
    const item=wrapper?.donneesFormatees||wrapper;
    const id=String(item?.maNo||wrapper?.id||wrapper?.['@id']||'');
    if(id)unique.set(id,wrapper);
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
const epreuvesPayloadFromZenRows=body=>{
  let result;
  try{result=JSON.parse(body)}catch{result={html:body}}
  const html=result?.html||'';
  const matchPayloads=Array.from({length:12},(_,index)=>embeddedPayloadFromHtml(html,`fce-matches-${index}`)).filter(Boolean);
  const falPayloads=Array.from({length:12},(_,index)=>embeddedPayloadFromHtml(html,`fce-fal-${index}`)).filter(Boolean);
  return {
    matches:mergeMatchPayloads(matchPayloads),fal:mergeFalPayloads(falPayloads),
    matchMonths:matchPayloads.length,falMonths:falPayloads.length
  };
};
async function fetchZenRows(targetUrls){
  const apiKey=process.env.ZENROWS_API_KEY;
  if(!apiKey)throw new Error('ZENROWS_API_KEY absent');
  const clubPage=`https://epreuves.fff.fr/competition/club/${CLUB_CODE}-f-c-escalquens/club`;
  // Les plages annuelles de l'API renvoient une collection vide. Les 24 flux
  // mensuels (12 matchs + 12 FAL) sont donc chargés dans une seule session
  // navigateur ZenRows : une seule requête facturée, puis déduplication locale.
  const iframeTargets=[
    ...targetUrls.matches.map((src,index)=>[`fce-matches-${index}`,src]),
    ...targetUrls.fal.map((src,index)=>[`fce-fal-${index}`,src])
  ];
  const iframeScript=`(()=>{const targets=${JSON.stringify(iframeTargets)};let pending=targets.length;const finish=(id,frame)=>{const output=document.createElement('script');output.type='application/json';output.id=id;let content='';try{content=frame.contentDocument.body.innerText}catch(error){content=JSON.stringify({fce_error:String(error)})}output.textContent=JSON.stringify({body:content});document.body.appendChild(output);frame.remove();if(--pending===0)document.documentElement.setAttribute('data-fce-sync-done','1')};for(const [id,src] of targets){const frame=document.createElement('iframe');frame.hidden=true;frame.onload=()=>finish(id,frame);frame.src=src;document.body.appendChild(frame)}setTimeout(()=>{if(pending>0)document.documentElement.setAttribute('data-fce-sync-timeout','1')},25000)})();`;
  const instructions=[
    {wait_for:'app-match app-matches-wrapper'},
    {wait:500},
    {evaluate:iframeScript},
    {wait_for:'html[data-fce-sync-done="1"]'},
    {wait:500}
  ];
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
  const payloads=epreuvesPayloadFromZenRows(body);
  console.log(`FFF : ${payloads.matchMonths}/12 mois de matchs et ${payloads.falMonths}/12 mois de plateaux capturés.`);
  if(payloads.matchMonths!==12||payloads.falMonths!==12)throw new Error(`calendrier incomplet : matchs ${payloads.matchMonths}/12, plateaux ${payloads.falMonths}/12`);
  return payloads;
}

async function fetchEpreuves(targetUrls){
  try{
    const extraHeaders={accept:'application/ld+json, application/json',referer:`https://epreuves.fff.fr/competition/club/${CLUB_CODE}-escalquens-fc/club`};
    const probeIndex=targetUrls.probeIndex;
    const probe=await fetchOk(targetUrls.matches[probeIndex],'json',extraHeaders);
    const [matches,fal]=await Promise.all([
      Promise.all(targetUrls.matches.map((url,index)=>index===probeIndex?probe:fetchOk(url,'json',extraHeaders))),
      Promise.all(targetUrls.fal.map(url=>fetchOk(url,'json',extraHeaders)))
    ]);
    return {payloads:{matches:mergeMatchPayloads(matches),fal:mergeFalPayloads(fal)},transport:'direct'};
  }catch(directError){
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
function normalizeEpreuvesFal(payload){
  const rows=new Map();
  for(const site of [...(payload?.sites||[]),...(payload?.sitesWithoutDate||[])]){
    const epreuve=site.epreuve||{};
    const clubTeam=(site.equipes||[]).find(team=>String(team.club?.clNo)===CLUB_NO);
    if(!clubTeam||!site.date)continue;
    const sourceId=[epreuve.epNo,site.phNo,site.joNo].filter(value=>value!==undefined&&value!==null&&value!=='').join(':');
    const organizer=site.organisateur?.clNom||'';
    const opponents=(site.equipes||[]).filter(team=>String(team.club?.clNo)!==CLUB_NO).map(team=>team.club?.clNom||team.eqNom).filter(Boolean);
    const terrain=[site.terrain?.nom,...(site.terrain?.adresse||[])].filter(Boolean).join(' — ');
    const competition=[epreuve.epNom,site.phLib,site.seLib,site.poLib].filter(Boolean).join(' · ');
    const organizerIsClub=String(site.organisateur?.clNo)===CLUB_NO;
    const awayLabel=organizerIsClub
      ?`Plateau · ${opponents.length?opponents.join(', '):'participants à confirmer'}`
      :`Plateau à ${organizer||'confirmer'}`;
    const row={
      source:'district_fal',source_id:sourceId,
      category:epreuve.caCod||clubTeam.caCod||'',competition,
      starts_at:site.date,venue:terrain||organizer,
      home_team:'FC Escalquens',away_team:awayLabel,
      status:site.isCancelled?'cancelled':'scheduled',event_type:'plateau',
      source_url:`https://epreuves.fff.fr/competition/club/${CLUB_CODE}-escalquens-fc/club`,
      external_updated_at:null,
      home_logo_url:cleanUrl(payload?.logo),
      away_logo_url:organizerIsClub?'':cleanUrl(site.organisateur?.logo),
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
    matches:periods.map(({start,end})=>{
      const query=new URLSearchParams({dateDebut:start.toISOString().replace('.000Z','+00:00'),dateFin:end.toISOString().replace('.000Z','+00:00'),clNo:CLUB_NO,itemsPerPage:'100',pagination:'true'});
      return `https://epreuves.fff.fr/api/data/matches?${query}`;
    }),
    fal:periods.map(({start,end})=>{
      const query=new URLSearchParams({dateDebut:start.toISOString().slice(0,10),dateFin:end.toISOString().slice(0,10)});
      return `https://epreuves.fff.fr/api/fal/cdg/${DISTRICT_NO}/club/${CLUB_NO}/sites?${query}`;
    })
  };
  const {payloads,transport}=await fetchEpreuves(targetUrls);
  const items=payloadItems(payloads.matches);
  const total=Number(payloads.matches['hydra:totalItems']??items.length);
  if(total>items.length)throw new Error(`FFF annonce ${total} matchs mais n'en renvoie que ${items.length}; pagination à ajouter avant import`);
  const matches=normalizeEpreuves(items),plateaux=normalizeEpreuvesFal(payloads.fal);
  if(!matches.length&&!plateaux.length)throw new Error('FFF a renvoyé zéro match et zéro plateau sur les douze mois');
  console.log(`FFF : ${matches.length} matchs et ${plateaux.length} plateaux reçus via ${transport}.`);
  return [...matches,...plateaux];
}
async function collectFFF(){
  return collectEpreuvesFFF();
}
async function collectDistrict(){const base='https://haute-garonne.fff.fr/football-animation-et-loisirs/',html=await fetchOk(base,'text',{accept:'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',referer:'https://haute-garonne.fff.fr/','sec-fetch-dest':'document','sec-fetch-mode':'navigate','sec-fetch-site':'same-origin','upgrade-insecure-requests':'1'}),match=html.match(/<div id=["']animation-data["'][^>]*>\s*([\s\S]*?)\s*<\/div>/i);if(!match)throw new Error('District : animation-data introuvable');const data=JSON.parse(match[1]),rows=[];for(const competition of data){if(!competition.clubs?.some(club=>Number(club.cl_no)===Number(CLUB_NO)&&Number(club.cl_cod)===Number(CLUB_CODE)))continue;for(const phase of competition.phases||[])for(const journey of phase.journees||[]){const sites=(phase.secteurs||[]).flatMap(sector=>sector.poules||[]).flatMap(pool=>pool.journees||[]).find(item=>item.fa_jo_no===journey.fa_jo_no)?.sites||[],site=sites.find(item=>Number(item.club_organisateur?.cl_no)===Number(CLUB_NO)||(item.equipes||[]).some(club=>Number(first(club.cl_no,club.club?.cl_no))===Number(CLUB_NO))),kind=phase.fa_mr_cod==='P'?'plateau':'animation';rows.push({source:'district_fal',source_id:`${competition.fa_ep_no}:${phase.fa_ph_no}:${journey.fa_jo_no}`,category:String(competition.fa_ca_lib||competition.fa_ca_cod||''),competition:`${competition.fa_ep_nom} · ${phase.fa_ph_lib}`,starts_at:iso(first(site?.fa_si_date,journey.fa_jo_date),first(site?.fa_si_ho_cod,journey.fa_ho_cod)),venue:text(first(site?.installation,site?.club_organisateur)),home_team:'FC Escalquens',away_team:kind==='plateau'?'Plateau – participants à confirmer':'Rencontre – adversaire à confirmer',status:site?.fa_si_cancelled?'cancelled':'scheduled',event_type:kind,source_url:`${base}?fal_id=${competition.fa_ep_no}&type=fa&clNo=${CLUB_NO}&clCod=${CLUB_CODE}&checkDate=false`,external_updated_at:competition.date_maj,raw_json:{competition:{id:competition.fa_ep_no,name:competition.fa_ep_nom},phase:{id:phase.fa_ph_no,name:phase.fa_ph_lib},journey,site:site||null}})}}return rows.filter(row=>row.starts_at)}
let rows=[],sources=[];
try{
  rows=await collectFFF();
  sources.push({source:'fff',status:'ok',count:rows.length});
}catch(error){
  sources.push({source:'fff',status:'error',error:String(error?.message||error)});
  try{
    rows=await collectDistrict();
    sources.push({source:'district',status:'ok',count:rows.length});
  }catch(districtError){
    sources.push({source:'district',status:'error',error:String(districtError?.message||districtError)});
  }
}
if(!rows.length)throw new Error(`Aucune donnée collectée : ${sources.map(item=>item.status==='ok'?`${item.source} OK (${item.count} rencontre)`: `${item.source} ERREUR — ${item.error}`).join(' ; ')}`);
const response=await fetch(endpoint,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({rows,sources})}),raw=await response.text();if(!response.ok)throw new Error(`Import Cloudflare HTTP ${response.status}: ${raw}`);console.log(raw);console.table(sources);for(const source of sources.filter(item=>item.status==='error'))console.log(`::warning title=Source ${source.source} indisponible::${String(source.error).replace(/\r?\n/g,' ')}`);

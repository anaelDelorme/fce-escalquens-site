const SYNC_VERSION='2026.09.04-20',CLUB_NO='101544',CLUB_CODE='550350',DISTRICT_NO='86';
console.log(`Collecteur FCE ${SYNC_VERSION}`);
const siteUrl=process.env.FCE_SITE_URL?.replace(/\/$/,'');
const endpoint=siteUrl+'/internal/sync/matches';
const statusEndpoint=siteUrl+'/internal/sync/status';
const token=process.env.FCE_SYNC_TOKEN;
const force=process.env.FORCE_SYNC==='true';
const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',weekday:'short',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(part=>[part.type,part.value]));
const hour=Number(parts.hour),day=parts.weekday;
// Six collectes par semaine, en heure de Paris. Le workflow propose les deux
// heures UTC possibles (été/hiver) ; seule la bonne exécute FFF ou ZenRows.
const scheduled=(day==='Wed'&&hour===21)||(day==='Fri'&&hour===16)||
  (day==='Sat'&&(hour===9||hour===20))||(day==='Sun'&&hour===20)||
  (day==='Mon'&&hour===20);
if(!force&&!scheduled){console.log(`Pas de collecte prévue actuellement (${day} ${hour} h, heure de Paris).`);process.exit(0)}
if(!process.env.FCE_SITE_URL||!token)throw new Error('Secrets FCE_SITE_URL ou FCE_SYNC_TOKEN manquants');
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
  if(envelope.status!==200)throw new Error(`${id} HTTP ${envelope.status||'inconnu'}`);
  return parseJson(envelope.body,id);
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
const mergeMatchPayloads=payloads=>{
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
      if(!previous||venueScore(wrapper)>=venueScore(previous))unique.set(id,wrapper);
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
const epreuvesPayloadFromZenRows=body=>{
  let result;
  try{result=JSON.parse(body)}catch{result={html:body}}
  const html=result?.html||'';
  const matchPayloads=Array.from({length:12},(_,index)=>embeddedPayloadFromHtml(html,`fce-matches-${index}`)).filter(Boolean);
  const falPayloads=Array.from({length:12},(_,index)=>embeddedPayloadFromHtml(html,`fce-fal-${index}`)).filter(Boolean);
  const detailPayloads=embeddedPayloadsByPrefix(html,'fce-detail-');
  const falGamePayloads=embeddedEntriesByPrefix(html,'fce-fal-games-');
  const venueDetails=detailPayloads.filter(payload=>{
    const item=payload?.donneesFormatees||payload||{};
    return /"(?:terrain|installation|stade)"\s*:/.test(JSON.stringify(item));
  }).length;
  return {
    matches:mergeMatchPayloads([...matchPayloads,...detailPayloads]),fal:mergeFalPayloads(falPayloads),
    matchMonths:matchPayloads.length,falMonths:falPayloads.length,
    detailCount:detailPayloads.length,venueDetailCount:venueDetails,
    falGamePayloads
  };
};
async function fetchZenRows(targetUrls){
  const apiKey=process.env.ZENROWS_API_KEY;
  if(!apiKey)throw new Error('ZENROWS_API_KEY absent');
  const clubPage=`https://epreuves.fff.fr/competition/club/${CLUB_CODE}-f-c-escalquens/club`;
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
    if(!securityToken){document.documentElement.setAttribute('data-fce-sync-error','token-X-Competition-introuvable');return}
    const saved=[];
    const fetchOne=async(id,src)=>{
      let status=0,body='';
      try{
        const response=await fetch(src,{credentials:'include',headers:{Accept:'application/json, text/plain, */*','X-Competition':String(securityToken)}});
        status=response.status;body=await response.text();
      }catch(error){body=JSON.stringify({fce_error:String(error)})}
      const output=document.createElement('script');
      output.type='application/json';output.id=id;output.textContent=JSON.stringify({status,body});
      document.body.appendChild(output);saved.push({id,status,body});
    };
    await Promise.all(targets.map(([id,src])=>fetchOne(id,src)));
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
    await Promise.all([...details].flatMap(([id,paths])=>paths.map((path,index)=>fetchOne(\`fce-detail-\${id}-\${index}\`,new URL(path,'https://epreuves.fff.fr').href))));
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
          const key=[ep,jo,si].join(':');
          plateauSites.set(key,{key,url:\`https://epreuves.fff.fr/animation-loisir/cdg/${DISTRICT_NO}/club/${CLUB_NO}/epreuve/\${ep}/poule/\${po}/journee/\${jo}/site/\${si}/matchs\`});
        }
      }catch{}
    }
    const fetchPlateau=async({key,url})=>{
      let status=0,body='';
      try{
        const response=await fetch(url,{credentials:'include',headers:{Accept:'text/html,application/xhtml+xml'}});
        status=response.status;
        const html=await response.text();
        const stateText=html.match(/<script[^>]+id=["']ng-state["'][^>]*>([\\s\\S]*?)<\\/script>/i)?.[1]||'';
        const state=stateText?JSON.parse(stateText):[];
        const entries=(Array.isArray(state)?state:[state]).flatMap(item=>Object.entries(item||{}));
        const apiPayloads=entries
          .filter(([name,value])=>name.includes('/api/fal/')&&value?.status===200&&value?.body)
          .map(([name,value])=>({name,body:value.body}));
        body=JSON.stringify({site_key:key,api_payloads:apiPayloads});
      }catch(error){body=JSON.stringify({site_key:key,fce_error:String(error)})}
      const output=document.createElement('script');
      output.type='application/json';output.id=\`fce-fal-games-\${key.replaceAll(':','-')}\`;
      output.textContent=JSON.stringify({status,body});document.body.appendChild(output);
    };
    await Promise.all([...plateauSites.values()].map(fetchPlateau));
    document.documentElement.setAttribute('data-fce-sync-done','1');
  })()`;
  const instructions=[
    {wait_for:'app-match app-matches-wrapper'},
    {wait:500},
    {evaluate:fetchScript},
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
  console.log(`FFF : ${payloads.detailCount} détail(s) de match reçu(s), dont ${payloads.venueDetailCount} avec un terrain.`);
  const plateauGameCount=payloads.falGamePayloads.reduce((total,entry)=>total+normalizeFalGames(entry.payload).length,0);
  console.log(`FFF : ${payloads.falGamePayloads.length} page(s) de détail de plateau ciblée(s), ${plateauGameCount} mini-match(s) trouvé(s), sans crédit ZenRows supplémentaire.`);
  if(payloads.falGamePayloads.length)console.log(`FFF : rattachement des mini-matchs — ${payloads.falGamePayloads.map(entry=>`${entry.payload?.site_key||'clé inconnue'}=${normalizeFalGames(entry.payload).length}`).join(', ')}.`);
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
    const venueData=first(
      item.terrain,item.installation,item.stade,item.site?.terrain,item.site?.installation,
      item.rencontre?.terrain,item.rencontre?.installation,item.match?.terrain,item.match?.installation,
      item.donnees?.terrain,item.donnees?.installation
    )||{};
    const venue=text(first(venueData,item.lieu,item.site?.nom));
    const venueAddress=addressText(first(venueData.adresse,venueData.address,item.adresse,item.site?.adresse));
    const participants=[
      {name:home.club?.nomAbr||home.club?.nom||'',club_number:home.club?.clNo||'',team_number:home.equipe?.eqCod||home.equipe?.eqNo||home.equipe?.id||'',logo_url:cleanUrl(home.club?.logo),is_club:String(home.club?.clNo)===CLUB_NO},
      {name:away.club?.nomAbr||away.club?.nom||'',club_number:away.club?.clNo||'',team_number:away.equipe?.eqCod||away.equipe?.eqNo||away.equipe?.id||'',logo_url:cleanUrl(away.club?.logo),is_club:String(away.club?.clNo)===CLUB_NO}
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
function normalizeEpreuvesFal(payload,falGamePayloads=[]){
  const rows=new Map();
  const gameDetails=new Map(falGamePayloads.map(entry=>[String(entry?.payload?.site_key||''),entry?.payload||{}]));
  for(const site of [...(payload?.sites||[]),...(payload?.sitesWithoutDate||[])]){
    const epreuve=site.epreuve||{};
    const clubTeam=(site.equipes||[]).find(team=>String(team.club?.clNo)===CLUB_NO);
    if(!clubTeam||!site.date)continue;
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
        category_code:epreuve.caCod||clubTeam.caCod||'',
        competition_name:epreuve.epNom||'',
        division:site.phLib||'',
        pool:site.poLib||site.seLib||''
      },
      category:epreuve.caCod||clubTeam.caCod||'',competition,
      starts_at:site.date,venue:terrain||organizer,venue_address:venueAddress,
      latitude:numberOrNull(first(site.terrain?.latitude,site.terrain?.lat,site.latitude)),
      longitude:numberOrNull(first(site.terrain?.longitude,site.terrain?.lng,site.terrain?.lon,site.longitude)),
      home_team:'FC Escalquens',away_team:awayLabel,
      status:site.isCancelled?'cancelled':'scheduled',event_type:'plateau',
      source_url:sourceUrl,
      external_updated_at:null,
      home_logo_url:cleanUrl(payload?.logo),
      away_logo_url:organizerIsClub?'':cleanUrl(site.organisateur?.logo),
      time_confirmed:site.heureCommuniquee!==false,
      participants,
      ...(plateauGames.length?{plateau_games:plateauGames}:{}),
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
  const matches=normalizeEpreuves(items),plateaux=normalizeEpreuvesFal(payloads.fal,payloads.falGamePayloads);
  if(!matches.length&&!plateaux.length)throw new Error('FFF a renvoyé zéro match et zéro plateau sur les douze mois');
  console.log(`FFF : ${matches.length} matchs et ${plateaux.length} plateaux reçus via ${transport}.`);
  return [...matches,...plateaux];
}
async function collectFFF(){
  return collectEpreuvesFFF();
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
async function main(){
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
  latestSources=sources;
  if(!rows.length)throw new Error(`Aucune donnée collectée : ${sources.map(item=>item.status==='ok'?`${item.source} OK (${item.count} rencontre)`: `${item.source} ERREUR — ${item.error}`).join(' ; ')}`);
  const response=await fetch(endpoint,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({rows,sources})});
  const raw=await response.text();
  if(!response.ok)throw new Error(`Import Cloudflare HTTP ${response.status}: ${raw}`);
  console.log(raw);
  console.table(sources);
  const failures=sources.filter(item=>item.status==='error');
  for(const source of failures)console.log(`::error title=Source ${source.source} indisponible::${String(source.error).replace(/\r?\n/g,' ')}`);
  if(failures.length){
    console.error('La synchronisation est partielle : GitHub la signale en échec pour déclencher les alertes. Les données disponibles ont tout de même été importées.');
    process.exitCode=1;
  }
}

try{await main()}catch(error){await reportFailure(error);throw error}

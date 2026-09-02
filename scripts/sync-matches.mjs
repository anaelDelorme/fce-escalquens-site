const SYNC_VERSION='2026.09.02-4',CLUB_NO='101544',CLUB_CODE='550350';
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
const FFF_BASES=['https://api-dofa.fff.fr/api','https://api-dofa.prd-aws.fff.fr/api'];
const KNOWN_COMPETITIONS=[{competition:'454408',stage:'1',group:'3',label:'Senior Départemental 4 - 11teamsports POULE C'}];
const payloadItems=payload=>Array.isArray(payload)?payload:payload['hydra:member']||payload.items||payload.data||payload.matches||[];
async function fffPath(path){const errors=[];for(const base of FFF_BASES)try{return await fetchOk(`${base}${path}`)}catch(error){errors.push(`${new URL(base).hostname}: ${error?.cause?.code||error?.cause?.message||error?.message||error}`)}throw new Error(errors.join(' ; '))}
async function fffCollection(name){const rows=[];for(let page=1;page<=5;page++){const payload=await fffPath(`/clubs/${CLUB_NO}/${name}?page=${page}`),items=payloadItems(payload);rows.push(...items);if(!payload['hydra:view']?.['hydra:next']||!items.length)break}return rows}
async function fffKnownCompetitions(){const rows=[];for(const item of KNOWN_COMPETITIONS)for(const view of ['calendrier','resultat']){const payload=await fffPath(`/compets/${item.competition}/phases/${item.stage}/poules/${item.group}/${view}`),matches=payloadItems(payload);for(const match of matches)rows.push({...match,_competition_label:item.label})}return rows}
function normalizeFFF(items){const unique=new Map();for(const item of items){const id=String(first(item.id,item.ma_no,item.match_id,item['@id']?.split('/').pop())||'');if(id)unique.set(id,item)}return [...unique].map(item=>{const date=first(item.date,item.initial_date,item.ma_dat);return {source:'fff',source_id:String(first(item.id,item.ma_no,item.match_id,item['@id']?.split('/').pop())),category:text(first(item.category,item.competition?.category,item.categorie)),competition:text(item.competition)||item._competition_label||'',starts_at:iso(date,first(item.time,item.hour,item.heure)),venue:text(first(item.terrain,item.installation,item.venue)),home_team:entityName(item.home),away_team:entityName(item.away),home_score:item.home_score??null,away_score:item.away_score??null,status:item.status==='G'||item.home_score!=null?'finished':item.seems_postponed?'postponed':'scheduled',event_type:'match',source_url:`https://occitanie.fff.fr/recherche-clubs?tab=resultats&scl=${CLUB_NO}`,external_updated_at:first(item.updated_at,item.modified_at),home_logo_url:text(first(item.home?.club?.logo,item.home?.logo)),away_logo_url:text(first(item.away?.club?.logo,item.away?.logo)),raw_json:item}}).filter(row=>row.starts_at&&row.home_team&&row.away_team&&(/escalquens/i.test(row.home_team)||/escalquens/i.test(row.away_team)))}
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
  const rows=[];
  for(let offset=0;offset<12;offset++){
    const start=new Date(Date.UTC(seasonYear,6+offset,1));
    const end=new Date(Date.UTC(seasonYear,7+offset,0,23,59,59));
    const query=new URLSearchParams({
      dateDebut:start.toISOString().replace('.000Z','+00:00'),
      dateFin:end.toISOString().replace('.000Z','+00:00'),
      clNo:CLUB_NO,itemsPerPage:'100',pagination:'true'
    });
    const payload=await fetchOk(`https://epreuves.fff.fr/api/data/matches?${query}`,'json',{
      accept:'application/ld+json, application/json',
      referer:`https://epreuves.fff.fr/competition/club/${CLUB_CODE}-escalquens-fc/club`
    });
    rows.push(...payloadItems(payload));
  }
  return normalizeEpreuves(rows);
}
async function collectFFF(){
  try{
    const rows=await collectEpreuvesFFF();
    if(rows.length)return rows;
  }catch(error){
    console.log(`::notice title=Nouvelle API FFF indisponible::${String(error?.message||error).replace(/\r?\n/g,' ')}`);
  }
  const club=await Promise.allSettled([fffCollection('calendrier'),fffCollection('resultat')]);
  const items=club.flatMap(result=>result.status==='fulfilled'?result.value:[]);
  if(items.length)return normalizeFFF(items);
  return normalizeFFF(await fffKnownCompetitions());
}
async function collectDistrict(){const base='https://haute-garonne.fff.fr/football-animation-et-loisirs/',html=await fetchOk(base,'text',{accept:'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',referer:'https://haute-garonne.fff.fr/','sec-fetch-dest':'document','sec-fetch-mode':'navigate','sec-fetch-site':'same-origin','upgrade-insecure-requests':'1'}),match=html.match(/<div id=["']animation-data["'][^>]*>\s*([\s\S]*?)\s*<\/div>/i);if(!match)throw new Error('District : animation-data introuvable');const data=JSON.parse(match[1]),rows=[];for(const competition of data){if(!competition.clubs?.some(club=>Number(club.cl_no)===Number(CLUB_NO)&&Number(club.cl_cod)===Number(CLUB_CODE)))continue;for(const phase of competition.phases||[])for(const journey of phase.journees||[]){const sites=(phase.secteurs||[]).flatMap(sector=>sector.poules||[]).flatMap(pool=>pool.journees||[]).find(item=>item.fa_jo_no===journey.fa_jo_no)?.sites||[],site=sites.find(item=>Number(item.club_organisateur?.cl_no)===Number(CLUB_NO)||(item.equipes||[]).some(club=>Number(first(club.cl_no,club.club?.cl_no))===Number(CLUB_NO))),kind=phase.fa_mr_cod==='P'?'plateau':'animation';rows.push({source:'district_fal',source_id:`${competition.fa_ep_no}:${phase.fa_ph_no}:${journey.fa_jo_no}`,category:String(competition.fa_ca_lib||competition.fa_ca_cod||''),competition:`${competition.fa_ep_nom} · ${phase.fa_ph_lib}`,starts_at:iso(first(site?.fa_si_date,journey.fa_jo_date),first(site?.fa_si_ho_cod,journey.fa_ho_cod)),venue:text(first(site?.installation,site?.club_organisateur)),home_team:'FC Escalquens',away_team:kind==='plateau'?'Plateau – participants à confirmer':'Rencontre – adversaire à confirmer',status:site?.fa_si_cancelled?'cancelled':'scheduled',event_type:kind,source_url:`${base}?fal_id=${competition.fa_ep_no}&type=fa&clNo=${CLUB_NO}&clCod=${CLUB_CODE}&checkDate=false`,external_updated_at:competition.date_maj,raw_json:{competition:{id:competition.fa_ep_no,name:competition.fa_ep_nom},phase:{id:phase.fa_ph_no,name:phase.fa_ph_lib},journey,site:site||null}})}}return rows.filter(row=>row.starts_at)}
const attempts=await Promise.allSettled([collectFFF(),collectDistrict()]),names=['fff','district'],sources=attempts.map((result,index)=>result.status==='fulfilled'?{source:names[index],status:'ok',count:result.value.length}:{source:names[index],status:'error',error:String(result.reason?.message||result.reason)}),rows=attempts.flatMap(result=>result.status==='fulfilled'?result.value:[]);
if(!rows.length)throw new Error(`Aucune donnée collectée : ${sources.map(item=>item.status==='ok'?`${item.source} OK (${item.count} rencontre)`: `${item.source} ERREUR — ${item.error}`).join(' ; ')}`);
const response=await fetch(endpoint,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({rows,sources})}),raw=await response.text();if(!response.ok)throw new Error(`Import Cloudflare HTTP ${response.status}: ${raw}`);console.log(raw);console.table(sources);for(const source of sources.filter(item=>item.status==='error'))console.log(`::warning title=Source ${source.source} indisponible::${String(source.error).replace(/\r?\n/g,' ')}`);

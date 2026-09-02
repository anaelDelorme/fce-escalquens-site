interface Env { DB:D1Database; MEDIA:R2Bucket; ASSETS:Fetcher; DEV_ADMIN_TOKEN?:string; TEST_SITE_PASSWORD?:string; TEST_SITE_USER?:string; FCE_SYNC_TOKEN?:string; FFF_API_BASE:string; FFF_CLUB_NO:string; FFF_CLUB_CODE:string; DISTRICT_FAL_URL?:string; INSTAGRAM_ACCESS_TOKEN?:string; INSTAGRAM_USER_ID?:string }
const tables = new Set(["teams","training_sessions","contacts","tournaments","matches","standings","social_posts","documents","club_members","team_staff","admins","venues","competition_levels","seasons"]);
const editable:Record<string,string[]> = {
  teams:["slug","name","category","group_name","level","level_id","gender","fff_id","photo_key","description","display_order","active","coach_name","coach_email","coach_phone","manager_name","manager_email","manager_phone","player_count","gallery_keys","district_competition_id","district_phase_id"],
  training_sessions:["team_id","season_id","category","weekday","starts_at","ends_at","venue","venue_id","address","notes","active"],
  contacts:["name","role","category","email","phone","published","display_order","responsibilities","availability","photo_key"],
  tournaments:["slug","name","summary","starts_on","ends_on","venue","categories","registration_url","rules_key","status","season_id"],
  matches:["source","source_id","team_id","season_id","category","competition","starts_at","venue","home_team","away_team","home_score","away_score","status","event_type","source_url","external_updated_at","home_logo_url","away_logo_url","raw_json"],
  standings:["source","phase_id","season_id","team_id","team_name","position","played","won","drawn","lost","goals_for","goals_against","points","raw_json"],
  social_posts:["platform","source_id","permalink","caption","media_type","media_url","thumbnail_url","published_at"],
  documents:["slug","title","kind","object_key","published"]
  ,club_members:["full_name","email","phone","license_number","photo_key","notes","active"]
  ,team_staff:["team_id","member_id","role","display_order","active"]
  ,admins:["email","name","active"]
  ,venues:["name","address","latitude","longitude","maps_url","notes","active","display_order"]
  ,competition_levels:["name","short_name","description","active","display_order"]
  ,seasons:["label","starts_on","ends_on","active"]
};
function json(data:unknown,status=200){return Response.json(data,{status,headers:{"cache-control":"no-store"}})}
async function admin(request:Request,env:Env){
  const email=request.headers.get("cf-access-authenticated-user-email");
  if(email){const row=await env.DB.prepare("SELECT email FROM admins WHERE email=? COLLATE NOCASE AND active=1 LIMIT 1").bind(email).first<{email:string}>();if(row)return row.email;}
  const token=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"");
  return env.DEV_ADMIN_TOKEN&&token===env.DEV_ADMIN_TOKEN?"local-admin":null;
}
function testGate(request:Request,env:Env){
  if(!env.TEST_SITE_PASSWORD)return null;
  const authorization=request.headers.get("authorization")||"";let credentials="";
  if(authorization.startsWith("Basic "))try{credentials=atob(authorization.slice(6))}catch{}
  const expected=`${env.TEST_SITE_USER||"fce"}:${env.TEST_SITE_PASSWORD}`;
  return credentials===expected?null:new Response("Site de test FC Escalquens — authentification requise",{status:401,headers:{"www-authenticate":'Basic realm="FC Escalquens — site de test", charset="UTF-8"',"cache-control":"no-store"}});
}
async function api(request:Request,env:Env,url:URL){
  const parts=url.pathname.split("/").filter(Boolean); const table=parts[1]; const id=parts[2];
  if(!tables.has(table))return json({error:"Ressource inconnue"},404);
  if(url.pathname.startsWith("/admin-api/")&&!await admin(request,env))return json({error:"Accès administrateur requis"},401);
  if(table==="admins"&&request.method==="GET"&&!await admin(request,env))return json({error:"Accès administrateur requis"},401);
  if(request.method==="GET"){
    const order=table==="matches"?"starts_at ASC":table==="social_posts"?"published_at DESC":"id ASC";
    const rows=await env.DB.prepare(`SELECT * FROM ${table} ORDER BY ${order} LIMIT 200`).all(); return json(rows.results);
  }
  if(!await admin(request,env))return json({error:"Adresse non autorisée. Vérifiez Cloudflare Access et la liste des administrateurs."},401);
  if(request.method==="DELETE"&&id){await env.DB.prepare(`DELETE FROM ${table} WHERE id=?`).bind(id).run();return json({ok:true});}
  const body=await request.json<Record<string,unknown>>(); const allowed=editable[table]; const values=Object.entries(body).filter(([key])=>allowed.includes(key));
  if(!values.length)return json({error:"Aucun champ valide"},400);
  if(table==="seasons"&&Number(body.active)===1)await env.DB.prepare("UPDATE seasons SET active=0").run();
  if(request.method==="POST"){
    const cols=values.map(([key])=>key); const result=await env.DB.prepare(`INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map(()=>"?").join(",")})`).bind(...values.map(([,value])=>typeof value==="object"?JSON.stringify(value):value)).run();return json({id:result.meta.last_row_id},201);
  }
  if(request.method==="PUT"&&id){await env.DB.prepare(`UPDATE ${table} SET ${values.map(([key])=>`${key}=?`).join(",")}, updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(...values.map(([,value])=>typeof value==="object"?JSON.stringify(value):value),id).run();return json({ok:true});}
  return json({error:"Méthode non autorisée"},405);
}
async function upload(request:Request,env:Env){
  if(!await admin(request,env))return json({error:"Non autorisé"},401);
  const form=await request.formData(); const file=form.get("file");
  if(!(file instanceof File))return json({error:"Fichier manquant"},400);
  if(file.size>15_000_000)return json({error:"Fichier trop volumineux (15 Mo maximum)"},413);
  const safe=file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g,"-"); const key=`uploads/${Date.now()}-${safe}`;
  await env.MEDIA.put(key,file.stream(),{httpMetadata:{contentType:file.type}}); return json({key,url:`/media/${key}`},201);
}
async function syncFFFTeams(env:Env){
  const started=await env.DB.prepare("INSERT INTO sync_runs(source) VALUES('fff')").run(); const runId=started.meta.last_row_id;
  try{
    const response=await fetch(`${env.FFF_API_BASE}/clubs/${env.FFF_CLUB_NO}/equipes.json?filter=`,{headers:{accept:"application/json","user-agent":"FC-Escalquens/1.0"}});
    if(!response.ok)throw new Error(`FFF HTTP ${response.status}`); const payload:any=await response.json(); const items=Array.isArray(payload)?payload:(payload["hydra:member"]||payload.items||payload.data||payload.equipes||[]); let count=0;
    for(const item of items){const fff=String(item.eqNo||item.id||item.numero||"");if(!fff)continue;const name=item.nom||item.libelle||item.name||`Équipe ${fff}`;const slug=name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");await env.DB.prepare("INSERT INTO teams(slug,name,category,group_name,fff_id) VALUES(?,?,?,?,?) ON CONFLICT(slug) DO UPDATE SET name=excluded.name,category=excluded.category,fff_id=excluded.fff_id,updated_at=CURRENT_TIMESTAMP").bind(slug,name,item.categorie||"","FFF",fff).run();count++;}
    await env.DB.prepare("UPDATE sync_runs SET finished_at=CURRENT_TIMESTAMP,status='success',imported_count=? WHERE id=?").bind(count,runId).run();
  }catch(error){await env.DB.prepare("UPDATE sync_runs SET finished_at=CURRENT_TIMESTAMP,status='error',error_message=? WHERE id=?").bind(error instanceof Error?error.message:String(error),runId).run();throw error;}
}

type AnyRow=Record<string,any>;
const first=(...values:any[])=>values.find(value=>value!==undefined&&value!==null&&value!=="");
const text=(value:any)=>typeof value==="string"?value:value?.name||value?.label||value?.short_name||value?.libelle||"";
const entityName=(entity:any)=>text(first(entity?.short_name_federation,entity?.short_name_ligue,entity?.short_name,entity?.name,entity?.label,entity?.nom,entity?.code));
const isoDateTime=(dateValue:any,timeValue:any="")=>{
  if(!dateValue)return "";const raw=String(dateValue);if(raw.includes("T"))return raw;
  const time=String(timeValue||"12:00").replace("h",":").padEnd(5,"0");return `${raw}T${/^\d{1,2}:\d{2}$/.test(time)?time:"12:00"}:00`;
};
async function activeSeasonId(env:Env){return (await env.DB.prepare("SELECT id FROM seasons WHERE active=1 LIMIT 1").first<{id:number}>())?.id??null}
async function upsertMatch(env:Env,row:AnyRow){
  const values=[row.source,row.source_id,row.team_id??null,row.season_id??null,row.category||"",row.competition||"",row.starts_at,row.venue||"",row.home_team,row.away_team,row.home_score??null,row.away_score??null,row.status||"scheduled",row.event_type||"match",row.source_url||"",row.external_updated_at??null,row.home_logo_url||"",row.away_logo_url||"",JSON.stringify(row.raw_json||{})];
  const result=await env.DB.prepare(`INSERT INTO matches(source,source_id,team_id,season_id,category,competition,starts_at,venue,home_team,away_team,home_score,away_score,status,event_type,source_url,external_updated_at,home_logo_url,away_logo_url,raw_json)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(source,source_id) DO UPDATE SET team_id=excluded.team_id,season_id=excluded.season_id,category=excluded.category,competition=excluded.competition,starts_at=excluded.starts_at,venue=excluded.venue,home_team=excluded.home_team,away_team=excluded.away_team,home_score=excluded.home_score,away_score=excluded.away_score,status=excluded.status,event_type=excluded.event_type,source_url=excluded.source_url,external_updated_at=excluded.external_updated_at,home_logo_url=excluded.home_logo_url,away_logo_url=excluded.away_logo_url,raw_json=excluded.raw_json,synced_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
    WHERE matches.starts_at IS NOT excluded.starts_at OR matches.venue IS NOT excluded.venue OR matches.home_team IS NOT excluded.home_team OR matches.away_team IS NOT excluded.away_team OR matches.home_score IS NOT excluded.home_score OR matches.away_score IS NOT excluded.away_score OR matches.status IS NOT excluded.status OR matches.home_logo_url IS NOT excluded.home_logo_url OR matches.away_logo_url IS NOT excluded.away_logo_url OR matches.raw_json IS NOT excluded.raw_json`).bind(...values).run();
  return Number(result.meta.changes||0);
}
function secureToken(value:string,expected:string){if(value.length!==expected.length)return false;let difference=0;for(let index=0;index<value.length;index++)difference|=value.charCodeAt(index)^expected.charCodeAt(index);return difference===0}
async function ingestMatches(request:Request,env:Env){
  const supplied=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"")||"";
  if(!env.FCE_SYNC_TOKEN||!secureToken(supplied,env.FCE_SYNC_TOKEN))return json({error:"Jeton de synchronisation invalide"},401);
  const body=await request.json<{rows?:AnyRow[],sources?:AnyRow[]}>().catch(()=>null);const rows=body?.rows;
  if(!Array.isArray(rows)||rows.length>1000)return json({error:"Lot de rencontres invalide"},400);
  const [seasonId,teams]=await Promise.all([activeSeasonId(env),env.DB.prepare("SELECT id,name,category,fff_id FROM teams WHERE active=1").all<AnyRow>()]);let changed=0,accepted=0;
  for(const row of rows){if(!["fff","district_fal"].includes(row.source)||!row.source_id||!row.starts_at||!row.home_team||!row.away_team)continue;const category=String(row.category||"").toLowerCase(),team=(teams.results||[]).find(candidate=>row.team_fff_id&&String(candidate.fff_id||"")===String(row.team_fff_id))||(teams.results||[]).find(candidate=>category&&(String(candidate.category).toLowerCase()===category||String(candidate.name).toLowerCase().includes(category)));changed+=await upsertMatch(env,{...row,team_id:team?.id,season_id:seasonId,raw_json:row.raw_json||row});accepted++}
  await env.DB.prepare("INSERT INTO sync_runs(source,finished_at,status,imported_count,error_message) VALUES('github_actions',CURRENT_TIMESTAMP,'success',?,?)").bind(changed,JSON.stringify(body?.sources||[])).run();
  return json({ok:true,received:rows.length,accepted,changed});
}
async function fetchFFFPage(env:Env,path:string){
  const bases=[env.FFF_API_BASE,"https://api-dofa.prd-aws.fff.fr/api"].filter((value,index,array)=>value&&array.indexOf(value)===index);let lastError="";
  for(const base of bases)try{const response=await fetch(`${base}${path}`,{headers:{accept:"application/ld+json, application/json","user-agent":"FC-Escalquens/1.0 (+https://fce-escalquens.workers.dev)"}});if(!response.ok){lastError=`HTTP ${response.status}`;continue}return await response.json<AnyRow>()}catch(error){lastError=String(error)}
  throw new Error(`API FFF indisponible (${lastError})`);
}
async function fetchFFFCollection(env:Env,endpoint:string){
  const rows:AnyRow[]=[];for(let page=1;page<=5;page++){const payload=await fetchFFFPage(env,`/clubs/${env.FFF_CLUB_NO}/${endpoint}?page=${page}`);const items=payload["hydra:member"]||payload.items||payload.data||[];rows.push(...items);if(!payload["hydra:view"]?.["hydra:next"]||items.length===0)break}return rows;
}
async function syncFFFMatches(env:Env){
  const run=await env.DB.prepare("INSERT INTO sync_runs(source) VALUES('fff_matches')").run(),runId=run.meta.last_row_id;
  try{const [upcoming,results,seasonId,teams]=await Promise.all([fetchFFFCollection(env,"calendrier"),fetchFFFCollection(env,"resultat"),activeSeasonId(env),env.DB.prepare("SELECT id,name,category,fff_id FROM teams WHERE active=1").all<AnyRow>()]);let changed=0;
    const unique=new Map<string,AnyRow>();for(const item of [...upcoming,...results]){const id=String(first(item.id,item.ma_no,item.match_id,item["@id"]?.split("/").pop()));if(id)unique.set(id,item)}
    for(const [id,item] of unique){const home=entityName(item.home),away=entityName(item.away),date=first(item.date,item.initial_date,item.ma_dat),category=text(first(item.category,item.competition?.category,item.categorie));if(!date||!home||!away)continue;const team=(teams.results||[]).find(candidate=>String(candidate.fff_id||"")===String(first(item.home?.id,item.away?.id)))||(teams.results||[]).find(candidate=>category&&String(candidate.category).toLowerCase()===category.toLowerCase());changed+=await upsertMatch(env,{source:"fff",source_id:id,team_id:team?.id,season_id:seasonId,category,competition:text(item.competition),starts_at:isoDateTime(date,first(item.time,item.hour,item.heure)),venue:text(first(item.terrain,item.installation,item.venue)),home_team:home,away_team:away,home_score:item.home_score,away_score:item.away_score,status:item.status==="G"||item.home_score!=null?"finished":item.seems_postponed?"postponed":"scheduled",event_type:"match",source_url:`https://occitanie.fff.fr/recherche-clubs?tab=resultats&scl=${env.FFF_CLUB_NO}`,external_updated_at:first(item.updated_at,item.modified_at),home_logo_url:text(first(item.home?.club?.logo,item.home?.logo)),away_logo_url:text(first(item.away?.club?.logo,item.away?.logo)),raw_json:item})}
    await env.DB.prepare("UPDATE sync_runs SET finished_at=CURRENT_TIMESTAMP,status='success',imported_count=? WHERE id=?").bind(changed,runId).run();return changed;
  }catch(error){await env.DB.prepare("UPDATE sync_runs SET finished_at=CURRENT_TIMESTAMP,status='error',error_message=? WHERE id=?").bind(error instanceof Error?error.message:String(error),runId).run();throw error}
}
function extractAnimationData(html:string){const match=html.match(/<div id=["']animation-data["'][^>]*>\s*([\s\S]*?)\s*<\/div>/i);if(!match)throw new Error("animation-data introuvable");return JSON.parse(match[1]) as AnyRow[]}
async function syncDistrictEvents(env:Env){
  const run=await env.DB.prepare("INSERT INTO sync_runs(source) VALUES('district_fal')").run(),runId=run.meta.last_row_id;
  try{const url=env.DISTRICT_FAL_URL||"https://haute-garonne.fff.fr/football-animation-et-loisirs/",response=await fetch(url,{headers:{"user-agent":"FC-Escalquens/1.0 (+https://fce-escalquens.workers.dev)"}});if(!response.ok)throw new Error(`District HTTP ${response.status}`);const [competitions,seasonId,teams]=await Promise.all([response.text().then(extractAnimationData),activeSeasonId(env),env.DB.prepare("SELECT id,name,category FROM teams WHERE active=1").all<AnyRow>()]);let changed=0;
    for(const competition of competitions){if(!competition.clubs?.some((club:AnyRow)=>Number(club.cl_no)===Number(env.FFF_CLUB_NO)&&Number(club.cl_cod)===Number(env.FFF_CLUB_CODE)))continue;const category=String(competition.fa_ca_lib||competition.fa_ca_cod||""),team=(teams.results||[]).find(candidate=>String(candidate.category).toLowerCase()===category.toLowerCase()||String(candidate.name).toLowerCase().includes(category.toLowerCase()));
      for(const phase of competition.phases||[])for(const day of phase.journees||[]){const sites=(phase.secteurs||[]).flatMap((sector:AnyRow)=>sector.poules||[]).flatMap((pool:AnyRow)=>pool.journees||[]).find((item:AnyRow)=>item.fa_jo_no===day.fa_jo_no)?.sites||[],site=sites.find((item:AnyRow)=>Number(item.club_organisateur?.cl_no)===Number(env.FFF_CLUB_NO)||(item.equipes||[]).some((club:AnyRow)=>Number(first(club.cl_no,club.club?.cl_no))===Number(env.FFF_CLUB_NO)));const kind=phase.fa_mr_cod==="P"?"plateau":"animation";changed+=await upsertMatch(env,{source:"district_fal",source_id:`${competition.fa_ep_no}:${phase.fa_ph_no}:${day.fa_jo_no}`,team_id:team?.id,season_id:seasonId,category,competition:`${competition.fa_ep_nom} · ${phase.fa_ph_lib}`,starts_at:isoDateTime(first(site?.fa_si_date,day.fa_jo_date),first(site?.fa_si_ho_cod,day.fa_ho_cod)),venue:text(first(site?.installation,site?.club_organisateur)),home_team:"FC Escalquens",away_team:kind==="plateau"?"Plateau – participants à confirmer":"Rencontre – adversaire à confirmer",status:site?.fa_si_cancelled?"cancelled":"scheduled",event_type:kind,source_url:`${url}?fal_id=${competition.fa_ep_no}&type=fa&clNo=${env.FFF_CLUB_NO}&clCod=${env.FFF_CLUB_CODE}&checkDate=false`,external_updated_at:competition.date_maj,raw_json:{competition:{id:competition.fa_ep_no,name:competition.fa_ep_nom},phase:{id:phase.fa_ph_no,name:phase.fa_ph_lib,type:phase.fa_mr_lib},journee:day,site:site||null}})}}
    await env.DB.prepare("UPDATE sync_runs SET finished_at=CURRENT_TIMESTAMP,status='success',imported_count=? WHERE id=?").bind(changed,runId).run();return changed;
  }catch(error){await env.DB.prepare("UPDATE sync_runs SET finished_at=CURRENT_TIMESTAMP,status='error',error_message=? WHERE id=?").bind(error instanceof Error?error.message:String(error),runId).run();throw error}
}
function parisSchedule(date:Date){const parts=Object.fromEntries(new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Paris",weekday:"short",hour:"2-digit",hourCycle:"h23"}).formatToParts(date).map(part=>[part.type,part.value]));const day=parts.weekday,hour=Number(parts.hour);return hour===22||(day==="Fri"&&hour>=16&&(hour-16)%4===0)||((day==="Sat"||day==="Sun")&&hour%4===0)||(day==="Mon"&&hour<=14&&hour%4===0)}
async function syncMatches(env:Env){const sources=["fff","district"],results=await Promise.allSettled([syncFFFMatches(env),syncDistrictEvents(env)]),report=results.map((result,index)=>result.status==="fulfilled"?{source:sources[index],status:"ok",...result.value}:{source:sources[index],status:"error",error:result.reason instanceof Error?result.reason.message:String(result.reason)});if(results.every(result=>result.status==="rejected"))throw new Error(report.map(item=>item.error).filter(Boolean).join("; "));return report}
export default {
  async fetch(request:Request,env:Env){const url=new URL(request.url);if(url.pathname==="/internal/sync/matches"&&request.method==="POST")return ingestMatches(request,env);const gate=testGate(request,env);if(gate)return gate;if(url.pathname==="/admin-api/upload"&&request.method==="POST")return upload(request,env);if(url.pathname==="/admin-api/sync/matches"&&request.method==="POST")return json({error:"La collecte directe est refusée par la FFF. Lancez l’action « Synchroniser les matchs » dans GitHub."},409);if(url.pathname.startsWith("/admin-api/")||url.pathname.startsWith("/api/"))return api(request,env,url);if(url.pathname.startsWith("/media/")){const object=await env.MEDIA.get(url.pathname.slice(7));return object?new Response(object.body,{headers:{"content-type":object.httpMetadata?.contentType||"application/octet-stream","cache-control":"public,max-age=86400"}}):new Response("Not found",{status:404});}return env.ASSETS.fetch(request)},
  async scheduled(controller:ScheduledController,env:Env,ctx:ExecutionContext){if(parisSchedule(new Date(controller.scheduledTime)))ctx.waitUntil(syncMatches(env))}
} satisfies ExportedHandler<Env>;

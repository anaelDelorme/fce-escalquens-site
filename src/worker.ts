interface Env { DB:D1Database; MEDIA:R2Bucket; ASSETS:Fetcher; DEV_ADMIN_TOKEN?:string; TEST_SITE_PASSWORD?:string; TEST_SITE_USER?:string; FFF_API_BASE:string; FFF_CLUB_NO:string; FFF_CLUB_CODE:string; INSTAGRAM_ACCESS_TOKEN?:string; INSTAGRAM_USER_ID?:string }
const tables = new Set(["teams","training_sessions","contacts","tournaments","matches","standings","social_posts","documents","club_members","team_staff","admins"]);
const editable:Record<string,string[]> = {
  teams:["slug","name","category","group_name","level","gender","fff_id","photo_key","description","display_order","active","coach_name","coach_email","coach_phone","manager_name","manager_email","manager_phone","player_count","gallery_keys","district_competition_id","district_phase_id"],
  training_sessions:["team_id","category","weekday","starts_at","ends_at","venue","address","notes","active"],
  contacts:["name","role","category","email","phone","published","display_order","responsibilities","availability","photo_key"],
  tournaments:["slug","name","summary","starts_on","ends_on","venue","categories","registration_url","rules_key","status"],
  matches:["source","source_id","category","competition","starts_at","venue","home_team","away_team","home_score","away_score","status","raw_json"],
  standings:["source","phase_id","team_id","team_name","position","played","won","drawn","lost","goals_for","goals_against","points","raw_json"],
  social_posts:["platform","source_id","permalink","caption","media_type","media_url","thumbnail_url","published_at"],
  documents:["slug","title","kind","object_key","published"]
  ,club_members:["full_name","email","phone","license_number","photo_key","notes","active"]
  ,team_staff:["team_id","member_id","role","display_order","active"]
  ,admins:["email","name","active"]
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
async function syncFFF(env:Env){
  const started=await env.DB.prepare("INSERT INTO sync_runs(source) VALUES('fff')").run(); const runId=started.meta.last_row_id;
  try{
    const response=await fetch(`${env.FFF_API_BASE}/clubs/${env.FFF_CLUB_NO}/equipes.json?filter=`,{headers:{accept:"application/json","user-agent":"FC-Escalquens/1.0"}});
    if(!response.ok)throw new Error(`FFF HTTP ${response.status}`); const payload:any=await response.json(); const items=Array.isArray(payload)?payload:(payload["hydra:member"]||payload.items||payload.data||payload.equipes||[]); let count=0;
    for(const item of items){const fff=String(item.eqNo||item.id||item.numero||"");if(!fff)continue;const name=item.nom||item.libelle||item.name||`Équipe ${fff}`;const slug=name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");await env.DB.prepare("INSERT INTO teams(slug,name,category,group_name,fff_id) VALUES(?,?,?,?,?) ON CONFLICT(slug) DO UPDATE SET name=excluded.name,category=excluded.category,fff_id=excluded.fff_id,updated_at=CURRENT_TIMESTAMP").bind(slug,name,item.categorie||"","FFF",fff).run();count++;}
    await env.DB.prepare("UPDATE sync_runs SET finished_at=CURRENT_TIMESTAMP,status='success',imported_count=? WHERE id=?").bind(count,runId).run();
  }catch(error){await env.DB.prepare("UPDATE sync_runs SET finished_at=CURRENT_TIMESTAMP,status='error',error_message=? WHERE id=?").bind(error instanceof Error?error.message:String(error),runId).run();throw error;}
}
export default {
  async fetch(request:Request,env:Env){const gate=testGate(request,env);if(gate)return gate;const url=new URL(request.url);if(url.pathname==="/admin-api/upload"&&request.method==="POST")return upload(request,env);if(url.pathname.startsWith("/admin-api/")||url.pathname.startsWith("/api/"))return api(request,env,url);if(url.pathname.startsWith("/media/")){const object=await env.MEDIA.get(url.pathname.slice(7));return object?new Response(object.body,{headers:{"content-type":object.httpMetadata?.contentType||"application/octet-stream","cache-control":"public,max-age=86400"}}):new Response("Not found",{status:404});}return env.ASSETS.fetch(request)},
  async scheduled(_controller:ScheduledController,env:Env,ctx:ExecutionContext){ctx.waitUntil(syncFFF(env))}
} satisfies ExportedHandler<Env>;

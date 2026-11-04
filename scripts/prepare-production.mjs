import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {productionPlan,shopTables,tournamentTables} from './production-transfer.mjs';

const args=process.argv.slice(2),known=['--config','--out','--release'];
for(let i=0;i<args.length;i+=2)if(!known.includes(args[i])||!args[i+1]||args[i+1].startsWith('--'))throw Error('Usage: node scripts/prepare-production.mjs [--config fichier] [--out dossier] [--release identifiant]');
const get=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const config=JSON.parse(readFileSync(get('--config','wrangler.jsonc'),'utf8'));
const release=get('--release','fce-'+new Date().toISOString().replace(/[:.TZ]/g,'-').replace(/-+$/,''));
const folder=resolve(get('--out','.production-preparation/'+release));
const stage=config.env?.staging;
const binding=(section,name)=>section?.d1_databases?.find(b=>b.binding===name);
const valid=id=>typeof id==='string'&&/^[a-f0-9-]{36}$/i.test(id)&&!/^0+-0+-0+-0+-0+$/.test(id);
if(!valid(binding(stage,'DB')?.database_id)||!valid(binding(stage,'TOURNAMENTS')?.database_id)||!valid(binding(config,'DB')?.database_id))throw Error('Bindings source staging et DB production nécessaires.');
if(new Set([binding(stage,'DB').database_id,binding(stage,'TOURNAMENTS').database_id,binding(config,'DB').database_id]).size!==3)throw Error('Les bases source et destination doivent être distinctes.');
const stageBucket=stage.r2_buckets?.find(b=>b.binding==='MEDIA')?.bucket_name,prodBucket=config.r2_buckets?.find(b=>b.binding==='MEDIA')?.bucket_name;
if(!stageBucket||!prodBucket||stageBucket===prodBucket)throw Error('Les buckets MEDIA staging et production doivent être distincts.');
mkdirSync(dirname(folder),{recursive:true,mode:0o700});mkdirSync(folder,{mode:0o700});mkdirSync(join(folder,'media'),{mode:0o700});
function wrangler(argv){
 const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js',...argv,'--config',resolve(get('--config','wrangler.jsonc'))],{encoding:'utf8',maxBuffer:64*1024*1024});
 if(result.status!==0){
  const environment=argv.includes('--env')?(argv[argv.indexOf('--env')+1]||'production'):'staging';
  const operation=argv[0]==='d1'?'d1-read':'r2-read',resource=argv[0]==='d1'?argv[2]:'MEDIA';
  const diagnostic=result.stderr+'\n'+result.stdout,code=diagnostic.match(/\[code:\s*(\d+)\]/)?.[1]||'unknown';
  const hint=diagnostic.includes('Authentication error')?'authentication':/not found|Could not find|does not exist/i.test(diagnostic)?'not-found':/permission|not authorized/i.test(diagnostic)?'permission':/assets.directory|assets directory/i.test(diagnostic)?'assets-config':'unclassified';
  throw Error(`Lecture Cloudflare impossible (operation=${operation},env=${environment},resource=${resource},code=${code},hint=${hint}). Vérifiez les droits D1/R2 et l’authentification ; aucune écriture en production.`);
 }
 return result.stdout;
}
function query(env,db,sql){
 const json=JSON.parse(wrangler(['d1','execute',db,'--remote','--env',env==='production'?'':env,'--command',sql,'--json']));
 if(!Array.isArray(json)||json.some(r=>r.success===false))throw Error('Réponse D1 invalide.');
 return json.flatMap(r=>r.results||[]);
}
function tables(env,db,names,required=false){
 const existing=new Set(query(env,db,"SELECT name FROM sqlite_master WHERE type='table'").map(r=>r.name));
 return Object.fromEntries(names.map(name=>{
  if(required&&!existing.has(name))throw Error('Migration source absente : '+name);
  const filter=name==='site_media'?" WHERE slot='shop_hero'":'';
  return [name,existing.has(name)?query(env,db,`SELECT * FROM ${name}${filter}`):[]];
 }));
}
const targetTournaments=valid(binding(config,'TOURNAMENTS')?.database_id)?'TOURNAMENTS':'DB';
const source={shop:tables('staging','DB',shopTables,true),tournaments:tables('staging','TOURNAMENTS',tournamentTables,true),teams:query('staging','DB','SELECT id,slug FROM teams')};
if(!query('staging','DB','PRAGMA table_info(shop_personalizations)').some(c=>c.name==='required'))throw Error('La migration des personnalisations obligatoires manque en staging.');
const venues=new Map(query('staging','DB','SELECT id,name FROM venues').map(v=>[v.id,v.name]));
for(const t of source.tournaments.tournaments)if(!t.venue)t.venue=venues.get(t.venue_id)||'';
const target={shop:tables('production','DB',shopTables),tournaments:tables('production',targetTournaments,tournamentTables),teams:query('production','DB','SELECT id,slug FROM teams')};
for(const [name,value] of [['source.json',source],['target.json',target]])writeFileSync(join(folder,name),JSON.stringify(value,null,2)+'\n',{mode:0o600});
const plan=productionPlan(source,target,release);
writeFileSync(join(folder,'shop.sql'),plan.shop_sql,{mode:0o600});
writeFileSync(join(folder,'tournaments.sql'),plan.tournaments_sql,{mode:0o600});
for(const object of plan.media){
 wrangler(['r2','object','get',stageBucket+'/'+object.source_key,'--remote','--file',join(folder,object.file)]);
 const bytes=readFileSync(join(folder,object.file));object.sha256=createHash('sha256').update(bytes).digest('hex');object.bytes=bytes.length;
}
const checksum=file=>createHash('sha256').update(readFileSync(join(folder,file))).digest('hex');
const manifest={release,created_at:new Date().toISOString(),counts:plan.counts,source_bucket:stageBucket,target_bucket:prodBucket,target_site_db:binding(config,'DB').database_id,target_tournaments_db:binding(config,'TOURNAMENTS')?.database_id||null,production_tournament_snapshot_from:targetTournaments,media:plan.media,sql_sha256:{shop:checksum('shop.sql'),tournaments:checksum('tournaments.sql')},desired_shop_enabled:plan.desired_shop_enabled,desired_tournament_sales:plan.desired_tournament_sales,sales_closed:true};
writeFileSync(join(folder,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({folder,counts:plan.counts,production_writes:0,tournament_media_copied:0}));

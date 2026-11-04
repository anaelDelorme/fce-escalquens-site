import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,lstatSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {productionIssues} from './check-production.mjs';

const bindings=['DB','ORDERS','TOURNAMENTS'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function targets(config){
 const issues=productionIssues(config);if(issues.length)throw Error('Configuration production incomplète.');
 return bindings.map(binding=>({binding,database_id:config.d1_databases.find(b=>b.binding===binding).database_id}));
}
function context(){return {run_id:process.env.GITHUB_RUN_ID||null,run_attempt:process.env.GITHUB_RUN_ATTEMPT||null,code_sha:process.env.GITHUB_SHA||null};}
function regularFile(folder,name){
 const file=join(folder,name),stat=lstatSync(file);
 if(!stat.isFile()||stat.isSymbolicLink())throw Error('Fichier de points de restauration invalide.');
 return readFileSync(file);
}
export function captureRestorationPoints(config,folder,run){
 const databases=targets(config),created_at=new Date().toISOString();
 // One common time, just before capture, so all three modules have the same recovery time.
 const restore_timestamp=new Date(Date.now()-5000).toISOString();
 const points=databases.map(database=>{
  const result=JSON.parse(run(['d1','time-travel','info',database.binding,'--env','','--timestamp',restore_timestamp,'--json']));
  if(typeof result.bookmark!=='string'||!/^[a-zA-Z0-9_-]{1,256}$/.test(result.bookmark))throw Error('Point de restauration D1 absent ou invalide : '+database.binding);
  return {...database,bookmark:result.bookmark};
 });
 const manifest={version:1,kind:'cloudflare-d1-time-travel',created_at,restore_timestamp,...context(),databases:points};
 mkdirSync(folder,{recursive:false,mode:0o700});
 const bytes=JSON.stringify(manifest,null,2)+'\n';
 writeFileSync(join(folder,'restore-points.json'),bytes,{mode:0o600});
 writeFileSync(join(folder,'restore-points.sha256'),sha(bytes)+'\n',{mode:0o600});
 return {restore_points_complete:true};
}
export function verifyRestorationPoints(config,folder){
 const bytes=regularFile(folder,'restore-points.json');
 if(sha(bytes)!==regularFile(folder,'restore-points.sha256').toString().trim())throw Error('Points de restauration modifiés ou incomplets.');
 const manifest=JSON.parse(bytes),expected=targets(config),age=Date.now()-Date.parse(manifest.created_at),time=Date.parse(manifest.restore_timestamp),ctx=context();
 if(manifest.version!==1||manifest.kind!=='cloudflare-d1-time-travel'||!Number.isFinite(age)||age<0||age>3600000||!Number.isFinite(time)||Date.parse(manifest.created_at)-time<0||Date.parse(manifest.created_at)-time>60000||Object.keys(ctx).some(key=>manifest[key]!==ctx[key]))throw Error('Points de restauration récents de cette exécution requis.');
 if(!Array.isArray(manifest.databases)||manifest.databases.length!==expected.length||expected.some((database,i)=>{
  const point=manifest.databases[i];
  return !point||point.binding!==database.binding||point.database_id!==database.database_id||typeof point.bookmark!=='string'||!/^[a-zA-Z0-9_-]{1,256}$/.test(point.bookmark);
 }))throw Error('Points de restauration requis pour les trois bases production.');
 return {restore_points_verified:true};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const args=process.argv.slice(2);
  if(args.length!==4||args[0]!=='--action'||!['capture','verify'].includes(args[1])||args[2]!=='--folder'||!args[3])throw Error('Action et dossier de points de restauration requis.');
  const config=JSON.parse(readFileSync('wrangler.jsonc','utf8')),folder=resolve(args[3]);
  const run=argv=>{
   const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js',...argv,'--config',resolve('wrangler.jsonc')],{encoding:'utf8',maxBuffer:1024*1024});
   if(result.status!==0)throw Error('Lecture du point de restauration D1 en échec. Vérifier les droits Cloudflare ; aucun déploiement autorisé.');
   return result.stdout;
  };
  console.log(JSON.stringify(args[1]==='capture'?captureRestorationPoints(config,folder,run):verifyRestorationPoints(config,folder)));
 }catch{console.error('Points de restauration D1 non validés. Aucun déploiement autorisé.');process.exitCode=1;}
}

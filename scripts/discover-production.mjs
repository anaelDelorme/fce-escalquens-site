import {spawnSync} from 'node:child_process';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
const config=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','list','--json'],{encoding:'utf8',maxBuffer:8*1024*1024});
if(result.status!==0)throw Error('Lecture des métadonnées D1 indisponible.');
const databases=JSON.parse(result.stdout);
const production=Object.fromEntries(['DB','ORDERS','TOURNAMENTS'].map(name=>{
 const binding=config.d1_databases.find(b=>b.binding===name);
 const matches=databases.filter(d=>d.name===binding?.database_name);
 if(matches.length>1)throw Error('Nom de base production ambigu.');
 return [name,matches[0]?.uuid||null];
}));
mkdirSync('.production-preparation',{recursive:true,mode:0o700});
writeFileSync('.production-preparation/discovered-bindings.json',JSON.stringify(production,null,2)+'\n',{mode:0o600});
const secretResult=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','secret','list','--name',config.name,'--env=','--format','json'],{encoding:'utf8',maxBuffer:1024*1024});
if(secretResult.status===0){
 const names=new Set(JSON.parse(secretResult.stdout).map(s=>s.name));
 const present=Object.fromEntries(['TRACKING_SECRET','HELLOASSO_CLIENT_ID','HELLOASSO_CLIENT_SECRET','SMTP_PASSWORD'].map(name=>[name,names.has(name)]));
 writeFileSync('.production-preparation/production-secret-presence.json',JSON.stringify(present,null,2)+'\n',{mode:0o600});
}
console.log('Métadonnées des bases production relevées, aucune base créée ni modifiée.');

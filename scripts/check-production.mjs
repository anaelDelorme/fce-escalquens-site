import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
export function productionIssues(config){
 const issues=[],vars=config.vars||{},stage=config.env?.staging;
 const valid=id=>typeof id==='string'&&/^[a-f0-9-]{36}$/i.test(id)&&!/^0+-0+-0+-0+-0+$/.test(id);
 for(const name of ['DB','ORDERS','TOURNAMENTS'])if(!valid(config.d1_databases?.find(b=>b.binding===name)?.database_id))issues.push('UUID production du binding '+name);
 const ids=[...(config.d1_databases||[]),...(stage?.d1_databases||[])].filter(b=>valid(b.database_id)).map(b=>b.database_id);
 if(new Set(ids).size!==ids.length)issues.push('Bases D1 distinctes pour chaque module et environnement');
 const bucket=config.r2_buckets?.find(b=>b.binding==='MEDIA')?.bucket_name;
 if(!bucket||bucket===stage?.r2_buckets?.find(b=>b.binding==='MEDIA')?.bucket_name)issues.push('Bucket MEDIA production distinct du staging');
 if(vars.APP_ENV!=='production')issues.push('APP_ENV=production');
 if(vars.SHOP_ORIGIN!=='https://fcescalquens.fr')issues.push('SHOP_ORIGIN=https://fcescalquens.fr');
 for(const name of ['HELLOASSO_ORGANIZATION_SLUG','CF_ACCESS_ISSUER','CF_ACCESS_SHOP_AUD','CF_ACCESS_TOURNAMENT_AUD'])if(!vars[name])issues.push(name+' de production à vérifier');
 if(vars.MAIL_PROVIDER!=='ovh'||!vars.MAIL_FROM||!vars.SMTP_HOST||!vars.SMTP_USER)issues.push('Transport SMTP OVH de production');
 return issues;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const issues=productionIssues(JSON.parse(readFileSync('wrangler.jsonc','utf8')));
 if(issues.length){console.error('Configuration production à compléter :\n'+issues.map(s=>' - '+s).join('\n'));process.exitCode=1;}
 else console.log('Configuration statique production vérifiée. Les secrets Worker, OAuth et la réception des mails restent à tester sur le Worker cible.');
}

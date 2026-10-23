import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const args=process.argv.slice(2),get=(key,fallback)=>{const index=args.indexOf(key);if(index<0)return fallback;const value=args[index+1];if(!value||value.startsWith('--'))throw new Error('Valeur manquante pour '+key);return value;};
const target=get('--env','staging');if(!['staging','production'].includes(target))throw new Error('--env doit valoir staging ou production.');
const file=resolve(get('--config',new URL('../wrangler.jsonc',import.meta.url).pathname)),config=JSON.parse(readFileSync(file,'utf8'));
const section=target==='staging'?config.env?.staging:config;if(!section)throw new Error('Configuration staging absente.');
const previous=section.vars||{},issuer=String(get('--issuer',previous.CF_ACCESS_ISSUER||'')).trim().replace(/\/+$/,''),aud=String(get('--aud',previous.CF_ACCESS_SITE_AUD||'')).trim();
if(!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer))throw new Error('Renseignez --issuer https://VOTRE-EQUIPE.cloudflareaccess.com.');
if(!aud.split(',').every(value=>/^[a-f0-9]{64}$/i.test(value.trim())))throw new Error('Renseignez --aud avec l’Application Audience (AUD) de l’administration du site, pas celle de la boutique ou des tournois.');
if(args.includes('--check')){console.log('Configuration Access des annonces '+target+' vérifiée.');}else{section.vars={...previous,CF_ACCESS_ISSUER:issuer,CF_ACCESS_SITE_AUD:aud};writeFileSync(file,JSON.stringify(config,null,2)+'\n');console.log('Audience du site enregistrée pour '+target+'. Bases, boutique, tournois et autres environnements conservés.');}

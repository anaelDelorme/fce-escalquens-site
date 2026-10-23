import {body,rateLimit,response} from './security';
import {fail,now,sha256,text,type Row} from './domain';
import type {ShopEnv} from './service';
// Browser retention is renewed on use; authorization has no server-side expiry.
const cookieRetention=400*24*3600;
const cookieName=(env:ShopEnv)=>env.APP_ENV==='local'?'fce-coach-local':'__Host-fce-coach';
const equal=(a:string,b:string)=>{if(a.length!==b.length)return false;let result=0;for(let i=0;i<a.length;i++)result|=a.charCodeAt(i)^b.charCodeAt(i);return result===0;};
function secret(env:ShopEnv){if((env.TRACKING_SECRET||'').length<32)fail('COACH_CONFIG',503,'L’accès coach est en cours de configuration.');return env.TRACKING_SECRET!;}
async function signature(env:ShopEnv,value:string){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret(env)),{name:'HMAC',hash:'SHA-256'},false,['sign']);return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('fce-coach-session:'+value))),v=>v.toString(16).padStart(2,'0')).join('');}
export async function coachConfiguration(env:ShopEnv){return (await env.ORDERS.prepare('SELECT enabled,version,updated_at FROM coach_access WHERE id=1').first<Row>())!;}
export async function coachSession(request:Request,env:ShopEnv){
 if((env.TRACKING_SECRET||'').length<32)return false;
 const cookie=(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName(env)+'='))?.slice(cookieName(env).length+1)||'';
 if(!/^(?:v2|\d{10})\.[a-f0-9-]{36}\.[a-f0-9]{64}$/.test(cookie))return false;
 const [format,version,mac]=cookie.split('.');
 // Legacy signatures remain usable until revoked; the next catalogue request upgrades the cookie.
 const conf=await coachConfiguration(env);return !!conf.enabled&&conf.version===version&&equal(mac,await signature(env,`${format}.${version}`));
}
const setCookie=(env:ShopEnv,value:string,maxAge:number)=>`${cookieName(env)}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${env.APP_ENV==='local'?'':'; Secure'}`;
export async function coachLogin(request:Request,env:ShopEnv){
 await rateLimit(env,`coach-code:${request.headers.get('cf-connecting-ip')||'local'}`,5,900);
 const data=await body(request),code=normalizeCode(text(data.code,80,true)),conf=await env.ORDERS.prepare('SELECT * FROM coach_access WHERE id=1').first<Row>();
 const hash=await sha256(`${secret(env)}:coach-code:${code}`);
 if(!conf?.enabled||!equal(hash,conf.code_hash))fail('COACH_CODE',403,'Ce code coach est incorrect ou n’est plus actif. Demandez le code au club.');
 const res=response({ok:true});await refreshCoachCookie(res,env,conf.version);return res;
}
export function coachLogout(env:ShopEnv){const res=response({ok:true});res.headers.set('set-cookie',setCookie(env,'',0));return res;}
export async function changeCoachCode(request:Request,env:ShopEnv,actor:string){
 await rateLimit(env,`coach-code-admin:${actor}`,5,3600);
 const data=await body(request),version=crypto.randomUUID();
 if(data.action==='disable'){await env.ORDERS.prepare("UPDATE coach_access SET enabled=0,code_hash='',version=?,updated_at=? WHERE id=1").bind(version,now()).run();return response({enabled:false});}
 if(data.action!=='generate')fail('COACH_ACTION',400,'Choisissez la génération ou la désactivation du code.');
 const alphabet='23456789ABCDEFGHJKLMNPQRSTUVWXYZ',random=crypto.getRandomValues(new Uint8Array(8));
 const raw=Array.from(random,v=>alphabet[v%32]).join(''),code=`FCE-${raw.slice(0,4)}-${raw.slice(4)}`;
 await env.ORDERS.prepare('UPDATE coach_access SET enabled=1,code_hash=?,version=?,updated_at=? WHERE id=1').bind(await sha256(`${secret(env)}:coach-code:${normalizeCode(code)}`),version,now()).run();
 return response({enabled:true,code});
}

// New readable codes ignore spaces, dashes, case and the optional FCE prefix.
// Legacy 32-hex codes keep their original hash and remain valid.
export function normalizeCode(value:string){
 const compact=value.replace(/[\s-]+/g,'').toUpperCase();
 if(/^(?:FCE)?[2-9A-HJ-NP-Z]{8}$/.test(compact))return compact.length===11?compact.slice(3):compact;
 return value.trim();
}
export async function refreshCoachCookie(res:Response,env:ShopEnv,version?:string){
 const current=version||(await coachConfiguration(env)).version,value=`v2.${current}`;
 res.headers.set('set-cookie',setCookie(env,`${value}.${await signature(env,value)}`,cookieRetention));
}

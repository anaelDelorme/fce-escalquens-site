import {createRemoteJWKSet,jwtVerify} from 'jose';
import {body,response} from '../shop/security';
import {ShopError,fail,integer,now,text,uuid,sha256,type Row} from '../shop/domain';
import type {ShopEnv} from '../shop/service';
import {safeLink} from './content';
export interface NewsEnv extends ShopEnv {CF_ACCESS_SITE_AUD?:string}
const keys=new Map<string,ReturnType<typeof createRemoteJWKSet>>();
async function staff(req:Request,env:NewsEnv){
 const url=new URL(req.url);
 if(env.APP_ENV==='local'&&['localhost','127.0.0.1'].includes(url.hostname)&&env.DEV_ADMIN_TOKEN&&req.headers.get('x-admin-token')===env.DEV_ADMIN_TOKEN)return 'local-admin';
 const issuer=(env.CF_ACCESS_ISSUER||'').trim().replace(/\/+$/,''),audience=(env.CF_ACCESS_SITE_AUD||'').split(',').map(v=>v.trim()).filter(Boolean);
 if(!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer)||!audience.length)fail('NEWS_ACCESS_CONFIG',503,'Renseignez CF_ACCESS_ISSUER et CF_ACCESS_SITE_AUD (application Cloudflare de l’administration du site).');
 const token=req.headers.get('cf-access-jwt-assertion');if(!token)fail('ACCESS_REQUIRED',401,'Reconnectez-vous à l’administration du site.');
 let email='';try{if(!keys.has(issuer))keys.set(issuer,createRemoteJWKSet(new URL(issuer+'/cdn-cgi/access/certs')));const {payload}=await jwtVerify(token,keys.get(issuer)!,{issuer,audience,algorithms:['RS256']});email=typeof payload.email==='string'?payload.email:'';}catch{fail('ACCESS_INVALID',403,'La session Cloudflare du site est invalide. Reconnectez-vous et vérifiez CF_ACCESS_SITE_AUD.');}
 if(!email||!await env.DB.prepare('SELECT email FROM admins WHERE email=? COLLATE NOCASE AND active=1').bind(email).first())fail('FORBIDDEN',403,'Cette adresse ne dispose pas des droits de gestion du site.');
 return email;
}
const columns='id,title,body,image_key,image_alt,link_url,link_label';
export async function publicNews(env:NewsEnv){return (await env.DB.prepare(`SELECT ${columns} FROM news WHERE status='published' AND (starts_at IS NULL OR starts_at<=?) AND (ends_at IS NULL OR ends_at>?) ORDER BY display_order,created_at DESC,id DESC LIMIT 6`).bind(now(),now()).all<Row>()).results;}
export async function newsRoute(req:Request,env:NewsEnv,upload:(actor:string)=>Promise<Response>):Promise<Response|null>{
 const url=new URL(req.url),path=url.pathname.replace(/\/$/,''),isAdmin=path.startsWith('/admin/actualites/api/');
 if(!isAdmin&&path!=='/api/news')return null;
 try{
  if(isAdmin){
   const actor=await staff(req,env);
   if(!['GET','HEAD'].includes(req.method)&&req.headers.get('origin')!==url.origin)fail('ORIGIN',403,'Rechargez le formulaire depuis ce site.');
   if(path==='/admin/actualites/api/upload'){if(req.method!=='POST')fail('METHOD',405,'Méthode non autorisée.');return await upload(actor);}
   const match=path.match(/^\/admin\/actualites\/api\/news(?:\/(\d+))?$/);if(!match)fail('NOT_FOUND',404,'Ressource inconnue.');
   const id=match[1]?integer(Number(match[1]),1,Number.MAX_SAFE_INTEGER):null;
   if(req.method==='GET'){
    if(id){const row=await env.DB.prepare('SELECT * FROM news WHERE id=?').bind(id).first();if(!row)fail('NEWS_MISSING',404,'Cette actualité n’existe plus.');return response(row);}
    return response({news:(await env.DB.prepare('SELECT * FROM news ORDER BY updated_at DESC,id DESC LIMIT 200').all()).results});
   }
   if(req.method==='DELETE'&&id){const version=integer(Number(req.headers.get('if-match')),1,Number.MAX_SAFE_INTEGER);const deleted=await env.DB.prepare('DELETE FROM news WHERE id=? AND version=? RETURNING id').bind(id,version).first();if(!deleted)fail('NEWS_CONFLICT',409,'Cette annonce a changé. Rechargez la liste.');return response({ok:true});}
   if(!['POST','PUT'].includes(req.method)||req.method==='POST'&&id||req.method==='PUT'&&!id)fail('METHOD',405,'Méthode non autorisée.');
   const data=await body(req,60000),title=text(data.title,160,true),content=text(data.body||'',3000),image=text(data.image_key||'',500),alt=text(data.image_alt||'',250),status=data.status;
   if(!['draft','published'].includes(status))fail('NEWS_STATUS',400,'Choisissez Brouillon ou Publié.');
   if(status==='published'&&!content.trim())fail('NEWS_BODY',400,'Ajoutez le texte de l’actualité avant publication.');
   if(image&&(!/^[a-zA-Z0-9_./-]+\.(?:jpe?g|png|webp|avif|gif)$/i.test(image)||image.includes('..')))fail('NEWS_IMAGE',400,'Choisissez une image importée sur le site.');
   if(status==='published'&&image&&!alt.trim())fail('NEWS_ALT',400,'Décrivez l’image pour les personnes qui ne la voient pas.');
   let link='';try{link=safeLink(text(data.link_url||'',1000));}catch(error){fail('NEWS_LINK',400,(error as Error).message);}
   const label=text(data.link_label||'',100);if(link&&!label.trim())fail('NEWS_LINK_LABEL',400,'Donnez un libellé descriptif au lien.');
   const stamp=(value:unknown)=>value===null||value===undefined||value===''?null:integer(value,0,4102444800);
   const starts=stamp(data.starts_at),ends=stamp(data.ends_at),order=integer(data.display_order??0,0,100000);
   if(starts!==null&&ends!==null&&ends<=starts)fail('NEWS_DATES',400,'La fin d’affichage doit suivre son début.');
   if(id){
    const version=integer(data.version,1,Number.MAX_SAFE_INTEGER);
    const result=await env.DB.prepare('UPDATE news SET title=?,body=?,image_key=?,image_alt=?,link_url=?,link_label=?,status=?,starts_at=?,ends_at=?,display_order=?,updated_at=?,version=version+1 WHERE id=? AND version=? RETURNING *').bind(title,content,image,alt,link,link?label:'',status,starts,ends,order,now(),id,version).first<Row>();
    if(!result)fail('NEWS_CONFLICT',409,'Cette annonce a été modifiée ou supprimée. Rechargez la liste avant de réessayer.');return response(result);
   }
   const key=uuid(data.idempotency_key),hash=await sha256(JSON.stringify([title,content,image,alt,link,link?label:'',status,starts,ends,order]));
   const inserted=await env.DB.prepare('INSERT INTO news(create_key,request_hash,title,body,image_key,image_alt,link_url,link_label,status,starts_at,ends_at,display_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(create_key) DO NOTHING RETURNING *').bind(key,hash,title,content,image,alt,link,link?label:'',status,starts,ends,order,now(),now()).first<Row>();
   const result=inserted||await env.DB.prepare('SELECT * FROM news WHERE create_key=?').bind(key).first<Row>();
   if(!result||result.request_hash!==hash)fail('NEWS_RETRY',409,'Une première version de cette annonce est déjà enregistrée. Retrouvez-la dans la liste avant de créer une autre annonce.');
   return response(result,inserted?201:200);
  }
  if(req.method!=='GET'&&req.method!=='HEAD')return response({error:'Méthode non autorisée.'},405);
  if(path==='/api/news'){const res=response({news:await publicNews(env)});return req.method==='HEAD'?new Response(null,{status:res.status,headers:res.headers}):res;}
 }catch(error){if(error instanceof ShopError)return response({error:error.message,code:error.code},error.status);const incident=crypto.randomUUID().slice(0,8);console.error('news_error',{incident});return response({error:'Les actualités sont momentanément indisponibles. Réessayez.',code:'NEWS_ERROR',incident},500);}
 return null;
}

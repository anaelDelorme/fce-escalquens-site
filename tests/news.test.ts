import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import {TestDatabase} from './d1';
import worker from '../src/worker';
import {card,richText,safeLink} from '../src/news/content';
import {now} from '../src/shop/domain';
let DB:TestDatabase,env:any,privateKey:any,jwk:any;const originalFetch=globalThis.fetch;
before(async()=>{
 DB=new TestDatabase();await DB.exec(readFileSync(new URL('../migrations/0035_news.sql',import.meta.url),'utf8'));await DB.exec("CREATE TABLE admins(email TEXT,active INTEGER);INSERT INTO admins VALUES('site@example.org',1),('disabled@example.org',0);");
 const keys=await generateKeyPair('RS256');privateKey=keys.privateKey;jwk={...await exportJWK(keys.publicKey),kid:'news-test',alg:'RS256',use:'sig'};
 globalThis.fetch=(async(input:any)=>{assert.match(String(input),/news-test\.cloudflareaccess\.com\/cdn-cgi\/access\/certs/);return Response.json({keys:[jwk]});}) as typeof fetch;
 env={DB,APP_ENV:'local',DEV_ADMIN_TOKEN:'local-news',CF_ACCESS_ISSUER:'https://news-test.cloudflareaccess.com',CF_ACCESS_SITE_AUD:'site-audience',MEDIA:{put:async()=>{}},ASSETS:{fetch:async()=>new Response('asset')}};
});
after(()=>{DB.close();globalThis.fetch=originalFetch;});
const payload=(overrides:any={})=>({idempotency_key:crypto.randomUUID(),title:'Tournoi U11',body:'Les inscriptions sont ouvertes.\n\n**Venez jouer !**',status:'draft',display_order:0,starts_at:null,ends_at:null,...overrides});
async function call(path='/admin/actualites/api/news',data?:any,options:any={}){
 const target=options.env||env,origin=options.origin||'http://localhost:8787';
 const req=new Request('http://localhost:8787'+path,{method:options.method||(data?'POST':'GET'),headers:{...(options.admin===false?{}:{'x-admin-token':'local-news'}),...(data?{'content-type':'application/json'}:{}),origin,...options.headers},...(data?{body:JSON.stringify(data)}:{})});
 const res=await worker.fetch(req,target,{waitUntil(){}} as any);return {status:res.status,headers:res.headers,body:await res.json() as any};
}
test('annonces : brouillon privé, publication, dates d’affichage et retrait sans toucher aux autres bases',async()=>{
 const draft=await call(undefined,payload());assert.equal(draft.status,201);assert.equal((await call('/api/news')).body.news.length,0);
 const published=await call('/admin/actualites/api/news/'+draft.body.id,{...draft.body,status:'published'},{method:'PUT'});assert.equal(published.status,200);let feed=await call('/api/news');assert.equal(feed.body.news.length,1);assert.equal(feed.body.news[0].title,'Tournoi U11');assert.equal(feed.body.news[0].status,undefined);assert.equal(feed.body.news[0].request_hash,undefined);assert.match(feed.headers.get('cache-control')!,/no-store/);
 const future=await call(undefined,payload({title:'À venir',status:'published',starts_at:now()+100,ends_at:now()+200}));assert.equal(future.status,201);const expired=await call(undefined,payload({title:'Ancienne annonce',status:'published',ends_at:now()-1}));assert.equal(expired.status,201);assert.equal((await call('/api/news')).body.news.length,1);
 const update=await call('/admin/actualites/api/news/'+draft.body.id,{...published.body,status:'draft'},{method:'PUT'});assert.equal(update.status,200);assert.equal((await call('/api/news')).body.news.length,0);
 assert.equal((await call('/admin/actualites/api/news')).body.news.length,3);
});
test('annonces : validation, erreurs conservées et modifications concurrentes détectées',async()=>{
 for(const data of [payload({title:''}),payload({body:'',status:'published'}),payload({image_key:'uploads/photo.png',status:'published',image_alt:''}),payload({image_key:'https://evil.example/photo.jpg'}),payload({link_url:'javascript:alert(1)',link_label:'Test'}),payload({link_url:'//evil.example'}),payload({link_url:'/tournois/',link_label:''}),payload({starts_at:100,ends_at:99})])assert.equal((await call(undefined,data)).status,400);
 const created=await call(undefined,payload({title:'Boutique',link_url:'/boutique/',link_label:'Voir les nouveautés'})),id=created.body.id;
 const changed=await call('/admin/actualites/api/news/'+id,{...created.body,title:'Nouveau maillot'},{method:'PUT'});assert.equal(changed.status,200);
 assert.equal((await call('/admin/actualites/api/news/'+id,{...created.body,title:'Ancienne saisie'},{method:'PUT'})).status,409);
 assert.equal((await call('/admin/actualites/api/news/'+id,undefined,{method:'DELETE',headers:{'if-match':String(created.body.version)}})).status,409);
 assert.equal((await call('/admin/actualites/api/news/'+id,undefined,{method:'DELETE',headers:{'if-match':String(changed.body.version)}})).status,200);
 assert.equal((await call('/admin/actualites/api/news/'+id)).status,404);
});
test('annonces : réponse perdue et requêtes répétées ne créent pas de doublons',async()=>{
 const data=payload({title:'Résultat du week-end'}),a=await call(undefined,data),b=await call(undefined,data);assert.equal(a.status,201);assert.equal(b.status,200);assert.equal(a.body.id,b.body.id);assert.equal((await call(undefined,{...data,title:'Un autre titre'})).status,409);
});
test('annonces : liste publique bornée, ordre configurable et fin exclusive',async()=>{
 await DB.exec('DELETE FROM news');
 for(let i=0;i<8;i++)assert.equal((await call(undefined,payload({title:'Annonce '+i,status:'published',display_order:i}))).status,201);
 const feed=await call('/api/news');assert.equal(feed.body.news.length,6);assert.deepEqual(feed.body.news.map((r:any)=>r.title),Array.from({length:6},(_,i)=>'Annonce '+i));
 const row=(await call('/admin/actualites/api/news')).body.news.find((r:any)=>r.title==='Annonce 0');await call('/admin/actualites/api/news/'+row.id,{...row,ends_at:now()},{method:'PUT'});assert.equal((await call('/api/news')).body.news[0].title,'Annonce 1');
});
test('annonces : autorisation site par JWT, audience propre, adresse active et origine requises',async()=>{
 const target={...env,APP_ENV:'staging'};
 assert.equal((await call(undefined,undefined,{env:target,admin:false})).status,401);
 assert.equal((await call(undefined,undefined,{env:target,admin:false,headers:{'cf-access-authenticated-user-email':'site@example.org'}})).status,401);
 const token=async(email:string,aud='site-audience')=>new SignJWT({email}).setProtectedHeader({alg:'RS256',kid:'news-test'}).setIssuer(env.CF_ACCESS_ISSUER).setAudience(aud).setIssuedAt().setExpirationTime('5m').sign(privateKey);
 for(const [email,aud,expected] of [['site@example.org','site-audience',200],['disabled@example.org','site-audience',403],['unknown@example.org','site-audience',403],['site@example.org','shop-audience',403]])assert.equal((await call(undefined,undefined,{env:target,admin:false,headers:{'cf-access-jwt-assertion':await token(email,aud)}})).status,expected);
 assert.equal((await call(undefined,payload(),{origin:'https://other.example'})).status,403);
 assert.equal((await call(undefined,undefined,{env:{...target,CF_ACCESS_SITE_AUD:''},admin:false})).body.code,'NEWS_ACCESS_CONFIG');
});
test('annonces : rendu échappé, liens sûrs et aucun article/page dédiée',()=>{
 const html=card({id:1,title:'<img src=x onerror=alert(1)>',body:'**Fort**\n\n- Un\n- Deux\n\n<script>alert(1)</script>',image_key:'uploads/p.png',image_alt:'Une équipe',link_url:'javascript:alert(1)',link_label:'Voir'});
 assert.match(html,/&lt;img/);assert.match(html,/<strong>Fort<\/strong>/);assert.match(html,/<ul>/);assert.doesNotMatch(html,/<script|href=|\/actualites\//);assert.match(html,/alt="Une équipe"/);
 assert.throws(()=>safeLink('data:text/html,<script>'));assert.throws(()=>safeLink('/\\evil.example'));assert.throws(()=>safeLink('https://user:pass@example.org'));assert.equal(safeLink('/boutique/'),'/boutique/');assert.match(richText('*Texte*'),/<em>/);
});
test('annonces : import image sécurisé par le site, refus du PDF et d’une origine étrangère',async()=>{
 let uploads=0;const target={...env,MEDIA:{put:async()=>{uploads++;}}};
 const upload=async(file:File,origin='http://localhost:8787')=>{const form=new FormData();form.append('file',file);return worker.fetch(new Request('http://localhost:8787/admin/actualites/api/upload',{method:'POST',headers:{origin,'x-admin-token':'local-news'},body:form}),target,{waitUntil(){}} as any);};
 const png=new File([new Uint8Array([137,80,78,71,13,10,26,10])],'photo.png',{type:'image/png'});assert.equal((await upload(png)).status,201);assert.equal(uploads,1);
 assert.equal((await upload(new File(['%PDF-1.7'],'photo.png',{type:'image/png'}))).status,415);assert.equal((await upload(png,'https://other.example')).status,403);assert.equal(uploads,1);
});

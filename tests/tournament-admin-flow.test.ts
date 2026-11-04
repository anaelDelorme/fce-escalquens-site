import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {Window} from 'happy-dom';
import {TestDatabase} from './d1';
import {tournamentRoute} from '../src/tournaments/service';
import type {ShopEnv} from '../src/shop/service';

const common=readFileSync('public/shop-common.js','utf8').replace(/export /g,'');
const source=(name:string)=>readFileSync(`src/scripts/${name}.js`,'utf8').replace(/^import[\s\S]*?from [^;]+;\n?/gm,'').replace(/export /g,'');
const until=async(condition:()=>boolean)=>{const end=Date.now()+2000;while(!condition()&&Date.now()<end)await new Promise(r=>setTimeout(r,5));assert.ok(condition(),'Le parcours admin n’a pas abouti.');};

async function fixture(t:any) {
  const site=new TestDatabase(),orders=new TestDatabase(),tournaments=new TestDatabase(),tasks:Promise<unknown>[]=[];
  for(const [db,directory] of [[orders,'migrations-orders'],[tournaments,'migrations-tournaments']] as const)for(const file of readdirSync(directory).filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync(directory+'/'+file,'utf8'));
  await orders.exec(`UPDATE settings SET data='{"contact_email":"club@example.org"}'`);
  await tournaments.exec("INSERT INTO module_imports VALUES('v5.2',1);INSERT INTO tournaments(id,slug,name,starts_on,status) VALUES(1,'futsal','Futsal','2027-01-01','open')");
  const id='11111111-1111-4111-8111-111111111111';
  await tournaments.prepare("INSERT INTO orders(id,reference,request_hash,token_hash,token_expires,email,first_name,last_name,phone,delivery_method,total_cents,terms_version,terms_snapshot,terms_accepted_at,created_at,updated_at,kind) VALUES(?,'FCE-T-TEST','hash','token',9999999999,'contact@example.org','Camille','Exemple','0612345678','club',15000,'v1','Conditions',1,1,1,'tournament')").bind(id).run();
  const sections=[{section:'U11',quantity:2,participating:true},{section:'U13F',quantity:1,participating:true},{section:'U15',quantity:0,participating:false}];
  await tournaments.prepare("INSERT INTO tournament_registrations(order_id,tournament_id,tournament_name,club_name,team_name,category,payment_choice,payment_deadline,created_at,sections_json,team_count,payment_method,cheque_snapshot) VALUES(?,1,'Futsal','Club exemple','3 équipes','U11, U13F','later',9999999999,1,?,3,'cheque','Chèque à l’ordre du FCE')").bind(id,JSON.stringify(sections)).run();
  const env={DB:site,ORDERS:orders,TOURNAMENTS:tournaments,APP_ENV:'local',SHOP_ORIGIN:'http://localhost:8787',DEV_ADMIN_TOKEN:'local-test',TRACKING_SECRET:'a'.repeat(64),MAIL_PROVIDER:'cloudflare',MAIL_FROM:'club@example.org',MAIL_TEST_TO:'test@example.org',EMAIL:{send:async()=>({messageId:'simulated'})}} as unknown as ShopEnv;
  const w=new Window({url:'http://localhost:8787/admin-tournois/'}),calls:{path:string;method:string}[]=[];
  w.HTMLElement.prototype.scrollIntoView=function(){};
  w.document.write('<p id="tournament-environment"></p><p id="tournament-admin-message"></p><div id="tournament-admin" data-page="registrations"></div>');
  w.fetch=(async(path:any,options:any={})=>{
    const url=new URL(String(path),w.location.href),headers=new Headers(options.headers);
    headers.set('x-admin-token','local-test');headers.set('origin',w.location.origin);
    calls.push({path:url.pathname,method:options.method||'GET'});
    const response=await tournamentRoute(new Request(url,{...options,headers}),env,{waitUntil(p:Promise<unknown>){tasks.push(p);}} as any);
    assert.ok(response);return response;
  }) as any;
  t.after(async()=>{await Promise.allSettled(tasks);await w.happyDOM.abort();w.close();site.close();orders.close();tournaments.close();});
  w.eval(common+'\n'+source('tournament-form-fields')+'\n'+source('admin-tournaments'));
  await until(()=>Boolean(w.document.querySelector('[data-order]')));
  return {w,tournaments,id,calls};
}

test('fiche réelle : ouverture depuis la liste et les catégories, chèque reçu et annulation accessibles',async t=>{
  const f=await fixture(t),d=f.w.document;
  d.querySelector<HTMLElement>('[data-order]')!.click();
  await until(()=>Boolean(d.querySelector('#registration-detail form')));
  assert.match(d.querySelector('#registration-detail')!.textContent!,/En attente de confirmation/);
  d.querySelector<HTMLElement>('#close-registration-detail')!.click();
  d.querySelector<HTMLElement>('[data-category-order]')!.click();
  await until(()=>Boolean(d.querySelector('[data-cheque-received]')));
  d.querySelector<HTMLElement>('[data-cheque-received]')!.click();
  await until(()=>Boolean(d.querySelector('#registration-detail form'))&&!d.querySelector('[data-cheque-received]'));
  assert.equal((await f.tournaments.prepare('SELECT payment_status FROM orders WHERE id=?').bind(f.id).first<any>()).payment_status,'paid');
  assert.equal(f.calls.filter(c=>c.method==='POST'&&c.path.endsWith('/cheque-received')).length,1);
  const form=d.querySelector<HTMLFormElement>('#registration-detail form.commerce-form-grid')!;
  (form.elements.namedItem('registration_status') as HTMLSelectElement).value='cancelled';
  form.dispatchEvent(new f.w.Event('submit',{cancelable:true,bubbles:true}));
  await until(()=>{const updated=d.querySelector<HTMLFormElement>('#registration-detail form.commerce-form-grid');return Boolean(updated&&updated!==form&&d.querySelector('#registration-table')!.textContent!.includes('Annulée'));});
  assert.equal((await f.tournaments.prepare('SELECT registration_status FROM tournament_registrations WHERE order_id=?').bind(f.id).first<any>()).registration_status,'cancelled');
  assert.equal((await f.tournaments.prepare('SELECT payment_status FROM orders WHERE id=?').bind(f.id).first<any>()).payment_status,'paid');
});

test('CSV réel : une ligne par catégorie avec quantité, montants sans doublon et filtre respecté',async t=>{
  const f=await fixture(t),d=f.w.document;
  let blob:any,filename='';
  f.w.URL.createObjectURL=(value:any)=>{blob=value;return 'blob:csv-test';};f.w.URL.revokeObjectURL=()=>{};
  f.w.HTMLAnchorElement.prototype.click=function(){filename=this.download;};
  async function csvRows(){
    d.querySelector<HTMLElement>('#export-registrations')!.click();
    const lines=(await blob.text()).replace(/^\uFEFF/,'').split('\r\n').map((line:string)=>line.split(';').map(cell=>cell.slice(1,-1).replaceAll('""','"')));
    return lines.slice(1).map((row:string[])=>Object.fromEntries(lines[0].map((key:string,i:number)=>[key,row[i]])));
  }
  const rows=await csvRows();assert.equal(filename,'inscriptions-tournoi-1.csv');assert.equal(rows.length,2);
  assert.deepEqual(rows.map((r:any)=>[r.category,Number(r.nb_equipes)]),[['U11',2],['U13F',1]]);
  assert.equal(rows.reduce((n:number,r:any)=>n+Number(r.nb_equipes),0),3);
  assert.equal(rows.reduce((n:number,r:any)=>n+Number(r.total_cents),0),15000);
  assert.ok(rows.every((r:any)=>r.registration_total_cents==='15000'));
  assert.deepEqual(rows.map((r:any)=>r.team_name),['2 équipes','1 équipe']);
  const category=d.querySelector<HTMLSelectElement>('#category-filter')!;category.value='U11';category.dispatchEvent(new f.w.Event('change'));
  const filtered=await csvRows();assert.equal(filtered.length,1);assert.equal(filtered[0].category,'U11');assert.equal(filtered[0].nb_equipes,'2');assert.equal(filtered[0].total_cents,'10000');
});

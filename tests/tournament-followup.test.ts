import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {TestDatabase} from './d1';
import {tournamentRoute} from '../src/tournaments/service';
import type {ShopEnv} from '../src/shop/service';

test('suivi par tournoi : filtrage avant la limite, noms identiques distincts, tournoi vide et archives accessibles',async t=>{
  const site=new TestDatabase(),orders=new TestDatabase(),tournaments=new TestDatabase();
  t.after(()=>{site.close();orders.close();tournaments.close();});
  for(const file of readdirSync('migrations-tournaments').filter(f=>f.endsWith('.sql')).sort())await tournaments.exec(readFileSync('migrations-tournaments/'+file,'utf8'));
  await tournaments.exec("INSERT INTO tournaments(id,slug,name,starts_on,status) VALUES(1,'coupe-1','Coupe du club','2027-01-01','open'),(2,'coupe-2','Coupe du club','2028-01-01','finished'),(3,'vide','Tournoi sans inscription','2029-01-01','draft')");
  async function registration(id:number,tournamentId:number) {
    await tournaments.prepare("INSERT INTO orders(id,reference,request_hash,token_hash,token_expires,email,first_name,last_name,phone,delivery_method,total_cents,terms_version,terms_snapshot,terms_accepted_at,created_at,updated_at,kind) VALUES(?,?,?, ?,9999999999,'contact@example.org','A','B','0612345678','club',5000,'v1','Conditions',1,?,1,'tournament')").bind('order-'+id,'FCE-'+id,'hash-'+id,'token-'+id,id).run();
    await tournaments.prepare("INSERT INTO tournament_registrations(order_id,tournament_id,tournament_name,club_name,team_name,category,payment_choice,payment_deadline,created_at) VALUES(?,?,'Coupe du club',?,'Équipe A','U11','later',9999999999,?)").bind('order-'+id,tournamentId,'Club '+tournamentId,id).run();
  }
  await registration(1,1);
  for(let i=2;i<=502;i++)await registration(i,2);
  await registration(503,4); // Historical registration whose event no longer exists.
  const env={DB:site,ORDERS:orders,TOURNAMENTS:tournaments,APP_ENV:'local',DEV_ADMIN_TOKEN:'local-test'} as unknown as ShopEnv;
  const get=async(query='')=>{
    const res=await tournamentRoute(new Request('http://localhost:8787/admin-tournois/api/registrations'+query,{headers:{'x-admin-token':'local-test'}}),env,{waitUntil(){}} as any);
    assert.ok(res);return {status:res.status,body:await res.json() as any};
  };
  const initial=await get();assert.equal(initial.status,200);assert.equal(initial.body.tournament_id,1);assert.equal(initial.body.registrations.length,1);assert.equal(initial.body.registrations[0].tournament_id,1);
  assert.equal(initial.body.tournaments.filter((r:any)=>r.name==='Coupe du club').length,3);
  const second=await get('?tournament_id=2');assert.equal(second.body.registrations.length,500);assert.ok(second.body.registrations.every((r:any)=>r.tournament_id===2));
  const empty=await get('?tournament_id=3');assert.deepEqual(empty.body.registrations,[]);assert.equal(empty.body.tournament_id,3);
  const archive=await get('?tournament_id=4');assert.equal(archive.body.registrations.length,1);assert.equal(archive.body.registrations[0].tournament_id,4);
  for(const value of ['','0','-1','1.5','all','1%20OR%201=1','2147483648'])assert.equal((await get('?tournament_id='+value)).status,400);
  assert.equal((await get('?tournament_id=999')).status,404);
});

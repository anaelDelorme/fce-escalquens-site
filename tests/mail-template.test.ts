import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {TestDatabase} from './d1';
import {deliverMail,testMail} from '../src/shop/mail';
import {defaultSettings} from '../src/shop/terms';
import type {ShopEnv} from '../src/shop/service';

async function fixture(t:any, tournament=false) {
  const db=new TestDatabase(),messages:any[]=[];
  const directory=tournament?'migrations-tournaments':'migrations-orders';
  for(const f of readdirSync(directory).filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync(directory+'/'+f,'utf8'));
  t.after(()=>db.close());
  const env={APP_ENV:'production',SHOP_ORIGIN:'https://fcescalquens.fr',DB:db,ORDERS:db,MAIL_PROVIDER:'cloudflare',MAIL_FROM:'contact@fcescalquens.fr',MAIL_TEST_TO:'test@example.org',TRACKING_SECRET:'a'.repeat(64),EMAIL:{send:async(message:any)=>{messages.push(message);return {messageId:'simulated'};}}} as unknown as ShopEnv;
  const settings={...defaultSettings,contact_email:'boutique@example.org',collection_address:'1 rue du Stade',collection_instructions:'Contactez le club pour votre rendez-vous.'};
  const order={id:'11111111-1111-4111-8111-111111111111',reference:'FCE-TEST',first_name:'Anaël',last_name:'Exemple',email:'client@example.org',token_version:1,kind:'shop',payment_status:'pending',fulfillment:'new',total_cents:5300,public_note:'Message <script>privé</script>\nDeuxième ligne',delivery_method:'club',terms_snapshot:'Conditions acceptées <texte>\nInformations conservées.'};
  await db.prepare("INSERT INTO orders(id,reference,request_hash,token_hash,token_expires,email,first_name,last_name,phone,delivery_method,total_cents,terms_version,terms_snapshot,terms_accepted_at,created_at,updated_at) VALUES(?,?,'hash','token',9999999999,?,?,?,'0612345678','club',5300,'v1',?,1,1,1)").bind(order.id,order.reference,order.email,order.first_name,order.last_name,order.terms_snapshot).run();
  await db.prepare("INSERT INTO order_items(id,order_id,product_id,variant_id,name,sku,supplier,size,color,options_json,unit_cents,quantity) VALUES('item',?,1,'v','Maillot <FCE>','M','Club','M','Bordeaux',?,2650,2)").bind(order.id,JSON.stringify([{label:'Initiales',text:'AB <img src=x>'}])).run();
  return {db,env,settings,order,messages};
}

test('mail boutique : vrai récapitulatif HTML, texte lisible, contenu échappé et conditions conservées',async t=>{
  const f=await fixture(t);
  await deliverMail(f.env,f.settings,{id:'created',kind:'created',audience:'customer'},f.order);
  const message=f.messages[0];
  assert.equal(message.to,'client@example.org');assert.equal(message.replyTo,'boutique@example.org');
  assert.match(message.html,/<html lang="fr">/);assert.match(message.html,/Votre sélection/);assert.match(message.html,/Maillot &lt;FCE&gt;/);
  assert.match(message.html,/53,00/);assert.match(message.html,/Après confirmation du paiement/);
  assert.doesNotMatch(message.html,/<pre\b|<script>|<img src=x>|État du paiement : pending/);
  assert.match(message.html,/Message &lt;script&gt;privé&lt;\/script&gt;<br>Deuxième ligne/);
  assert.match(message.text,/2 × Maillot <FCE>/);assert.match(message.text,/Initiales : AB/);assert.match(message.text,/Conditions acceptées <texte>/);
  assert.match(message.text,/boutique\/suivi\/#/);
  await deliverMail(f.env,f.settings,{id:'tracking',kind:'tracking',audience:'customer'},f.order);
  assert.doesNotMatch(f.messages[1].text,/Informations conservées/);
});

test('mails tournois : catégories, quantités, paiement et validation séparés, aucun texte de préparation boutique',async t=>{
  const f=await fixture(t,true),order={...f.order,kind:'tournament',total_cents:20000,payment_status:'paid'};
  await f.db.exec("INSERT INTO tournament_registrations(order_id,tournament_id,tournament_name,club_name,team_name,category,payment_choice,payment_deadline,created_at,registration_status,sections_json,form_snapshot,answers_json) VALUES('11111111-1111-4111-8111-111111111111',1,'Coupe du club','Club <test>','4 équipes','U11, U13','later',1900000000,1,'pending','[{\"section\":\"U11\",\"quantity\":3,\"participating\":true},{\"section\":\"U13\",\"quantity\":1,\"participating\":true}]','[{\"id\":\"bus\",\"label\":\"Arrivée en bus\"}]','{\"bus\":false}')");
  await deliverMail(f.env,f.settings,{id:'paid',kind:'paid',audience:'customer'},order);
  const message=f.messages[0];assert.match(message.text,/U11 : 3 équipes/);assert.match(message.text,/U13 : 1 équipe/);assert.match(message.text,/Paiement : Payé/);assert.match(message.text,/Inscription : En attente de validation/);assert.match(message.text,/Arrivée en bus : Non/);
  assert.doesNotMatch(message.text,/Préparation|Total boutique|taille unique|Remise :/);assert.match(message.html,/Club &lt;test&gt;/);assert.match(message.text,/tournois\/suivi\/#/);
});

test('mail club et test transport : même mise en page, destinataires conservés et aucun lien personnel client',async t=>{
  const f=await fixture(t);
  await deliverMail(f.env,f.settings,{id:'club-created',kind:'created',audience:'club'},f.order);
  const message=f.messages[0];assert.equal(message.to,'boutique@example.org');assert.match(message.subject,/\[CLUB\]/);assert.match(message.html,/admin-boutique\/\?commande=/);assert.doesNotMatch(message.text,/suivi\/#/);
  await testMail(f.env,f.settings);assert.equal(f.messages[1].to,'test@example.org');assert.match(f.messages[1].html,/FC ESCALQUENS/);
  await deliverMail({...f.env,APP_ENV:'staging',SHOP_ORIGIN:'https://staging.example.org'},f.settings,{id:'stage',kind:'created',audience:'club'},f.order);
  assert.equal(f.messages[2].to,'test@example.org');assert.match(f.messages[2].subject,/^\[TEST\]/);
});

test('changement d’état tournoi : confirmation distincte du paiement, annulation claire sans demander de chèque',async t=>{
  const f=await fixture(t,true),order={...f.order,kind:'tournament'};
  await f.db.prepare("INSERT INTO tournament_registrations(order_id,tournament_id,tournament_name,club_name,team_name,category,payment_choice,payment_deadline,created_at,registration_status,payment_method,cheque_snapshot) VALUES(?,1,'Coupe du club','Club exemple','Équipe A','U11','later',1900000000,1,'accepted','cheque','Envoyer le chèque au club')").bind(order.id).run();
  await deliverMail(f.env,f.settings,{id:'accepted',kind:'fulfillment',audience:'customer'},order);
  const accepted=f.messages[0];assert.match(accepted.subject,/inscription est confirmée/);assert.match(accepted.text,/Le club a confirmé votre inscription/);assert.match(accepted.text,/Paiement : En attente de confirmation/);assert.doesNotMatch(accepted.text,/Nous avons bien reçu votre règlement/);assert.equal(accepted.to,'client@example.org');
  await f.db.exec("UPDATE tournament_registrations SET registration_status='cancelled'");
  await deliverMail(f.env,f.settings,{id:'cancelled',kind:'fulfillment',audience:'customer'},{...order,payment_status:'paid',fulfillment:'cancelled'});
  const cancelled=f.messages[1];assert.match(cancelled.subject,/inscription est annulée/);assert.match(cancelled.text,/Vos équipes ne figurent plus parmi les inscrits/);assert.match(cancelled.text,/Paiement : Payé/);assert.match(cancelled.text,/ne déclenche pas de remboursement automatique/);assert.doesNotMatch(cancelled.text,/Envoyer le chèque|Règlement par chèque|Date limite de paiement|Nous avons bien reçu votre règlement/);
});

test('changement d’état boutique : disponible ou annulée annoncé dans l’objet et le message',async t=>{
  const f=await fixture(t);
  await deliverMail(f.env,f.settings,{id:'ready',kind:'fulfillment',audience:'customer'},{...f.order,payment_status:'paid',fulfillment:'ready'});
  assert.match(f.messages[0].subject,/commande est disponible/);assert.match(f.messages[0].text,/Vos articles sont prêts à être remis/);
  await deliverMail(f.env,f.settings,{id:'cancelled',kind:'fulfillment',audience:'customer'},{...f.order,payment_status:'paid',fulfillment:'cancelled'});
  assert.match(f.messages[1].subject,/commande est annulée/);assert.match(f.messages[1].text,/Votre commande a été annulée par le club/);assert.doesNotMatch(f.messages[1].text,/Contactez le club pour votre rendez-vous|Le club vous informera de l’avancement/);
});

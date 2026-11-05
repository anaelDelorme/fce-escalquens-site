import {contactIssue,type ContactField} from '../../public/shop-contact.js';
import {fail,integer,now,type Row} from './domain';
import {body,response} from './security';
import type {ShopEnv} from './service';

export function contactField(field: ContactField, value: unknown): string {
  const issue=contactIssue(field,value);
  if(issue)fail('CONTACT_'+field.toUpperCase(),400,issue);
  const text=(value as string).trim();
  return field==='email'?text.toLowerCase():text;
}
export function payerContact(data: Row) {
  return {
    first_name:contactField('first_name',data.first_name),
    last_name:contactField('last_name',data.last_name),
    email:contactField('email',data.email),
    phone:contactField('phone',data.phone),
  };
}

/** Correct only identity before any provider intent/payment exists. Keep the request hash and recipients. */
export async function correctPayer(request:Request,env:ShopEnv,order:Row,actor:string){
  const data=await body(request),version=integer(data.version,0,Number.MAX_SAFE_INTEGER);
  if(Object.keys(data).some(key=>!['version','first_name','last_name'].includes(key)))fail('CONTACT_FIELDS',400,'Seuls le prénom et le nom du payeur peuvent être corrigés ici.');
  const first=contactField('first_name',data.first_name),last=contactField('last_name',data.last_name),mutation=crypto.randomUUID(),stamp=now();
  const moduleGuard=order.kind==='tournament'
    ?"AND EXISTS(SELECT 1 FROM tournament_registrations r WHERE r.order_id=orders.id AND r.registration_status<>'cancelled' AND r.archived_at IS NULL)"
    :"AND NOT EXISTS(SELECT 1 FROM order_archives a WHERE a.order_id=orders.id)";
  const result=await env.ORDERS.batch([
    env.ORDERS.prepare(`UPDATE orders SET first_name=?,last_name=?,version=version+1,mutation_id=?,updated_at=? WHERE id=? AND version=? AND kind=? AND fulfillment='new' AND payment_status IN ('pending','refused') ${moduleGuard}
      AND NOT EXISTS(SELECT 1 FROM checkout_attempts a WHERE a.order_id=orders.id AND (a.intent_id IS NOT NULL OR a.state IN ('creating','pending','uncertain','completed')))
      AND NOT EXISTS(SELECT 1 FROM payments p WHERE p.order_id=orders.id) RETURNING id`)
      .bind(first,last,mutation,stamp,order.id,version,order.kind),
    env.ORDERS.prepare("INSERT INTO order_events(id,order_id,kind,actor,message,created_at) SELECT ?,?,'contact',?,'Nom et prénom du payeur corrigés par le club.',? WHERE EXISTS(SELECT 1 FROM orders WHERE id=? AND mutation_id=?)")
      .bind(mutation,order.id,actor,stamp,order.id,mutation),
  ]);
  if(!result[0].results.length)fail('CONTACT_LOCKED',409,'Rechargez la fiche. La correction est réservée aux demandes non annulées, non payées et sans paiement HelloAsso engagé.');
  return response({ok:true});
}

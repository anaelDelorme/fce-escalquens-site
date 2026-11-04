import {body,response} from './security';
import {fail,integer,now,type Row} from './domain';
import type {ShopEnv} from './service';

export async function archiveOrder(request:Request,env:ShopEnv,order:Row,actor:string){
  const data=await body(request),version=integer(data.version,0,Number.MAX_SAFE_INTEGER);
  if(typeof data.archived!=='boolean')fail('ARCHIVE',400,'Choisissez le retrait ou la remise dans le suivi.');
  if(order.kind!=='shop'||order.fulfillment!=='cancelled')fail('ARCHIVE',409,'Seule une commande annulée peut être retirée du suivi.');
  const mutation=crypto.randomUUID(),stamp=now();
  const result=await env.ORDERS.batch([
    env.ORDERS.prepare("UPDATE orders SET version=version+1,mutation_id=?,updated_at=? WHERE id=? AND version=? AND kind='shop' AND fulfillment='cancelled' AND ((?=1 AND NOT EXISTS(SELECT 1 FROM order_archives a WHERE a.order_id=orders.id)) OR (?=0 AND EXISTS(SELECT 1 FROM order_archives a WHERE a.order_id=orders.id))) RETURNING id")
      .bind(mutation,stamp,order.id,version,data.archived?1:0,data.archived?1:0),
    data.archived
      ?env.ORDERS.prepare('INSERT INTO order_archives(order_id,archived_at,archived_by) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM orders WHERE id=? AND mutation_id=?)').bind(order.id,stamp,actor,order.id,mutation)
      :env.ORDERS.prepare('DELETE FROM order_archives WHERE order_id=? AND EXISTS(SELECT 1 FROM orders WHERE id=? AND mutation_id=?)').bind(order.id,order.id,mutation),
    env.ORDERS.prepare('INSERT INTO order_events(id,order_id,kind,actor,message,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM orders WHERE id=? AND mutation_id=?)')
      .bind(mutation,order.id,data.archived?'archived':'restored',actor,data.archived?'Commande retirée du suivi.':'Commande remise dans le suivi.',stamp,order.id,mutation),
  ]);
  if(!result[0].results.length)fail('VERSION_CONFLICT',409,'Cette commande a changé. Rechargez-la avant de modifier son suivi.');
  return response({ok:true,archived:data.archived});
}

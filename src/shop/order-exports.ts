import { fail, type Row } from './domain';
import type { ShopEnv } from './service';

/** Shared by the on-screen list and both exports. */
export function orderSearch(url: URL) {
  const q=(url.searchParams.get('q')||'').slice(0,100);
  const payment=(url.searchParams.get('payment')||'').slice(0,30);
  const fulfillment=(url.searchParams.get('fulfillment')||'').slice(0,30);
  const includeArchived=url.searchParams.get('include_archived')==='1';
  return {
    where:"o.kind='shop' AND (?=1 OR NOT EXISTS(SELECT 1 FROM order_archives a WHERE a.order_id=o.id)) AND (?='' OR instr(lower(o.reference||' '||o.email||' '||o.first_name||' '||o.last_name),lower(?))>0) AND (?='' OR o.payment_status=?) AND (?='' OR o.fulfillment=?)",
    bindings:[includeArchived?1:0,q,q,payment,payment,fulfillment,fulfillment],
  };
}

export function supplierOrder(order: Row, items: Row[]) {
  return {
    order:Object.fromEntries(['reference','first_name','last_name','licensed_name','team'].map(key=>[key,order[key]])),
    items:items.map(item=>Object.fromEntries(['name','supplier','size','quantity','options_json'].map(key=>[key,item[key]]))),
  };
}

/** Small pages keep D1 responses bounded; the cursor also handles equal creation dates. */
export async function orderExportPage(env: Pick<ShopEnv,'ORDERS'>, url: URL, supplier=false) {
  const search=orderSearch(url),cursor=url.searchParams.get('cursor');
  let before=0,beforeId='';
  if(cursor!==null) {
    const match=cursor.match(/^(\d{1,16}):([a-f0-9-]{36})$/);
    if(!match||!Number.isSafeInteger(Number(match[1])))fail('EXPORT_CURSOR',400,'La suite de l’export est invalide. Relancez le téléchargement.');
    before=Number(match[1]);beforeId=match[2];
  }
  const columns=supplier?'o.id,o.created_at,o.reference,o.first_name,o.last_name,o.licensed_name,o.team'
    :'o.id,o.created_at,o.reference,o.first_name,o.last_name,o.email,o.phone,o.licensed_name,o.team,o.delivery_method,o.total_cents,o.payment_status,o.fulfillment';
  const result=(await env.ORDERS.prepare(`SELECT ${columns} FROM orders o WHERE ${search.where}
    ${supplier?"AND o.payment_status='paid' AND o.fulfillment<>'cancelled'":''}
    AND (?='' OR o.created_at<? OR (o.created_at=? AND o.id<?))
    ORDER BY o.created_at DESC,o.id DESC LIMIT 51`)
    .bind(...search.bindings,beforeId,before,before,beforeId).all<Row>()).results;
  const rows=result.slice(0,50);
  const fields=supplier?'order_id,id,name,supplier,size,quantity,options_json'
    :'order_id,id,name,supplier,size,color,quantity,unit_cents,options_json';
  const items=rows.length?(await env.ORDERS.prepare(`SELECT ${fields} FROM order_items WHERE order_id IN (${rows.map(()=>'?').join(',')}) ORDER BY order_id,id`).bind(...rows.map(o=>o.id)).all<Row>()).results:[];
  const grouped=new Map<string,Row[]>();
  for(const item of items){const group=grouped.get(item.order_id)||[];group.push(item);grouped.set(item.order_id,group);}
  const last=rows.at(-1);
  return {
    orders:rows.map(order=>supplier?supplierOrder(order,grouped.get(order.id)||[]):{...order,items:(grouped.get(order.id)||[]).map(({order_id,id,...item})=>item)}),
    next_cursor:result.length>50?`${last!.created_at}:${last!.id}`:null,
  };
}

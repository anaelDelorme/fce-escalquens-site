import { paymentLabels, fulfillmentLabels } from '../../public/shop-common.js';

const euros=value=>new Intl.NumberFormat('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2,useGrouping:false}).format(value/100);
const cell=value=>{
  let text=String(value??'');
  if(/^[\s\uFEFF]*[=+\-@]/.test(text)||/^[\t\r\n]/.test(text))text="'"+text;
  return '"'+text.replace(/"/g,'""')+'"';
};
function itemDetail(item) {
  const options=JSON.parse(item.options_json||'[]').map(o=>`${o.label}${o.text?' : '+o.text:''}`);
  const variant=[item.size,item.color].filter(Boolean).join(' · ');
  return `${item.quantity} × ${item.name}${variant?' — '+variant:''}${options.length?' — '+options.join(' · '):''} — ${euros(item.unit_cents)} €/unité — ${euros(item.unit_cents*item.quantity)} €`;
}
export function ordersCsv(orders) {
  const columns=['Référence','Date de commande','Nom','Prénom','E-mail','Téléphone','Licencié','Équipe','État de préparation','État du paiement','Détail de la commande','Quantité totale','Montant (€)','Mode de remise','Fournisseurs'];
  const rows=orders.map(o=>[
    o.reference,new Date(o.created_at*1000).toLocaleString('fr-FR',{timeZone:'Europe/Paris'}),o.last_name,o.first_name,o.email,o.phone,o.licensed_name,o.team,
    fulfillmentLabels[o.fulfillment]||o.fulfillment,paymentLabels[o.payment_status]||o.payment_status,
    o.items.map(itemDetail).join('\n'),o.items.reduce((n,item)=>n+item.quantity,0),euros(o.total_cents),
    o.delivery_method==='coach'?'Par le coach':'Au club',[...new Set(o.items.map(i=>i.supplier).filter(Boolean))].join(' · '),
  ]);
  return '\uFEFF'+[columns,...rows].map(row=>row.map(cell).join(';')).join('\r\n')+'\r\n';
}

export async function collectOrderExport(call, path, filters) {
  const orders=[],seen=new Set();let cursor=null,club;
  do {
    const query=new URLSearchParams(filters);if(cursor)query.set('cursor',cursor);
    const result=await call(`${path}?${query}`);
    orders.push(...result.orders);club=result.club||club;
    cursor=result.next_cursor;
    if(cursor&&seen.has(cursor))throw new Error('L’export n’a pas pu être terminé. Relancez le téléchargement.');
    if(cursor)seen.add(cursor);
  }while(cursor);
  return {orders,club};
}

export function downloadExport(blob, filename) {
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=filename;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}

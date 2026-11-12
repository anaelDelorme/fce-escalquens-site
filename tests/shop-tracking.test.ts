import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Window} from 'happy-dom';
const id='11111111-1111-4111-8111-111111111111',token='a'.repeat(64);
async function setup(fulfillment='new',draftOrder=id){
 const w=new Window({url:'https://example.org/boutique/suivi/'}),d=w.document;
 d.write('<div id="tracking-status"></div><div id="tracking-content"></div><section id="recover-section"><form id="recover-form"></form><p id="recover-message"></p></section>');
 const calls:any[]=[];
 w.sessionStorage.setItem('fce-order-link',JSON.stringify({id,token}));
 w.sessionStorage.setItem('fce-checkout-draft',JSON.stringify({key:draftOrder}));
 w.sessionStorage.setItem('fce-cart-v1',JSON.stringify([{variant_id:'v',quantity:2,options:[]}]));
 const order={id,reference:'FCE-TEST',first_name:'Alex',total_cents:2000,payment_status:'pending',fulfillment,delivery_method:'club',created_at:1};
 w.confirm=()=>true;
 w.fetch=(async(url:any,options:any={})=>{
  calls.push({url,options});if(String(url).endsWith('/cancel'))order.fulfillment='cancelled';
  return Response.json({order,items:[],events:[]});
 }) as any;
 const common=readFileSync(new URL('../public/shop-common.js',import.meta.url),'utf8').replace(/export /g,'');
 const source=readFileSync(new URL('../public/shop-tracking.js',import.meta.url),'utf8').replace(/^import[\s\S]*?from [^;]+;\n?/gm,'');
 await w.eval(`(async()=>{${common}\n${source}})()`);
 return {w,d,calls};
}
test('suivi : annulation explicite conserve le panier et libère la prochaine commande',async()=>{
 const {w,d,calls}=await setup();
 d.querySelector<HTMLElement>('#cancel-order')!.click();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(calls.at(-1).url,`/api/shop/orders/${id}/cancel`);
 assert.equal(calls.at(-1).options.headers.authorization,`Bearer ${token}`);
 assert.equal(w.sessionStorage.getItem('fce-checkout-draft'),null);
 assert.equal(JSON.parse(w.sessionStorage.getItem('fce-cart-v1')!)[0].quantity,2);
 assert.equal(d.querySelector('#pay-order'),null);assert.equal(d.querySelector('#cancel-order'),null);
 assert.match(d.querySelector('#tracking-content')!.textContent!,/Retourner à la boutique/);
 await w.happyDOM.abort();w.close();
});
test('suivi : une ancienne commande annulée ne libère pas le brouillon d’une nouvelle',async()=>{
 const {w,d,calls}=await setup('cancelled','22222222-2222-4222-8222-222222222222');
 assert.equal(JSON.parse(w.sessionStorage.getItem('fce-checkout-draft')!).key,'22222222-2222-4222-8222-222222222222');
 assert.equal(calls.length,1);assert.equal(d.querySelector('#pay-order'),null);
 await w.happyDOM.abort();w.close();
});

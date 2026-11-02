import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {renderPersonalizations} from '../src/scripts/admin-shop-personalizations.js';
import {renderVariants} from '../src/scripts/admin-shop-variants.js';
const next=()=>new Promise(resolve=>setImmediate(resolve));
function setup(t:any){
 const w=new Window({url:'https://example.org/admin-boutique/personnalisations/'});
 t.after(async()=>{await w.happyDOM.abort();w.close();});
 w.document.body.innerHTML='<p id="admin-shop-message"></p><div id="root"></div>';
 Object.assign(globalThis,{document:w.document,FormData:w.FormData});w.HTMLElement.prototype.scrollIntoView=()=>{};
 return {w,root:w.document.querySelector('#root')!};
}

test('catalogue commun DOM : modification unique du tarif, version et règles de saisie',async t=>{
 const {w,root}=setup(t),definitions=[{id:'shared',label:'Initiales',price_cents:200,requires_text:1,max_length:4,active:1,version:3,article_count:5}];
 const writes:any[]=[];let notice='';
 const call=async(path:string,options:any={})=>{assert.equal(path,'personalizations');if(options.method==='PUT'){writes.push(options.data);Object.assign(definitions[0],options.data,{version:4});}return {personalizations:definitions};};
 await renderPersonalizations(root,call,(message:string)=>notice=message);
 assert.match(root.textContent!,/5/);root.querySelector<HTMLElement>('[data-personalization-edit]')!.click();
 assert.match(root.querySelector('form')!.textContent!,/5 article/);
 const form=root.querySelector<HTMLFormElement>('#personalization-form')!;
 // Happy DOM's number-step validator uses floating-point remainder; browsers
 // correctly accept whole euro amounts with a 0.01 step.
 (form.elements.namedItem('price') as HTMLInputElement).step='any';
 (form.elements.namedItem('price') as HTMLInputElement).value='5';
 (form.elements.namedItem('requires_text') as HTMLSelectElement).value='0';form.elements.namedItem('requires_text')!.dispatchEvent(new w.Event('change'));
 assert.equal(root.querySelector<HTMLElement>('#personalization-max-length')!.hidden,true);
 form.dispatchEvent(new w.Event('submit',{cancelable:true}));await next();await next();
 assert.equal(writes.length,1);assert.equal(writes[0].version,3);assert.equal(writes[0].price_cents,500);assert.equal(writes[0].requires_text,false);
 assert.match(notice,/tous les articles/);assert.match(root.querySelector('tbody')!.textContent!,/5,00/);
});

test('article DOM : choisir zéro à plusieurs personnalisations partagées, erreurs réessayables',async t=>{
 const {w,root}=setup(t);
 const cat={products:[{id:1,personalizations_version:3}],variants:[{id:'v1',product_id:1,label:'M',size:'M',active:1,price_cents:2000}],options:[{id:'link',product_id:1,personalization_id:'initials',active:1}],personalizations:[{id:'initials',label:'Initiales',price_cents:200,requires_text:1,max_length:4,active:1},{id:'logo',label:'Logo',price_cents:0,requires_text:0,max_length:4,active:1}]};
 const writes:any[]=[];let fail=false;
 const call=async(path:string,options:any={})=>{
  if(path==='catalogue')return structuredClone(cat);
  if(path==='suppliers')return {suppliers:[]};
  assert.equal(path,'products/1/personalizations');assert.equal(options.method,'PUT');
  if(fail)throw new Error('Connexion interrompue. Réessayez.');
  writes.push(options.data);assert.equal(options.data.version,cat.products[0].personalizations_version);
  cat.products[0].personalizations_version++;
  cat.options=options.data.personalization_ids.map((id:string)=>({id:'link-'+id,product_id:1,personalization_id:id,active:1}));
  return {ok:true};
 };
 await renderVariants(root,call,()=>{},1);
 const checkbox=(id:string)=>root.querySelector<HTMLInputElement>(`[name=personalization_ids][value=${id}]`)!;
 assert.equal(checkbox('initials').checked,true);assert.equal(checkbox('logo').checked,false);
 assert.equal(root.querySelector('#option-form'),null);assert.ok(root.querySelector('a[href="/admin-boutique/personnalisations/"]'));
 checkbox('logo').checked=true;
 const submit=()=>root.querySelector('form#product-personalizations-form')!.dispatchEvent(new w.Event('submit',{cancelable:true}));
 submit();await next();await next();assert.deepEqual(writes[0],{version:3,personalization_ids:['initials','logo']});
 checkbox('initials').checked=false;checkbox('logo').checked=false;submit();await next();await next();assert.deepEqual(writes[1],{version:4,personalization_ids:[]});
 fail=true;checkbox('logo').checked=true;submit();await next();
 assert.match(w.document.querySelector('#admin-shop-message')!.textContent!,/Connexion interrompue/);
 assert.equal(checkbox('logo').checked,true);assert.equal(root.querySelector<HTMLButtonElement>('#product-personalizations-form button')!.disabled,false);
 fail=false;submit();await next();await next();assert.deepEqual(writes[2],{version:5,personalization_ids:['logo']});
});

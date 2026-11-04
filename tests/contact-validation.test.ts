import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Window} from 'happy-dom';
import {contactIssue,contactLimits} from '../public/shop-contact.js';
import {contactField,payerContact} from '../src/shop/contact';
import {rejectedFields,HelloAssoRejection} from '../src/shop/helloasso-errors';
import {paymentAttemptMessage} from '../public/shop-common.js';

test('coordonnées : noms internationaux et ponctuation conservés, aucune interdiction inventée des parenthèses',()=>{
  for(const value of ['Kévin','Anne-Marie',"O’Neill",'D\u0301umont','王小明','Μαρία','محمد‌حسین','Camille (coach U11)']){
    assert.equal(contactIssue('first_name',value),'');assert.equal(contactField('first_name',' '+value+' '),value);
  }
  assert.equal(contactIssue('first_name','A'.repeat(80)),'');assert.match(contactIssue('first_name','A'.repeat(81)),/80 caractères/);
  for(const value of ['', '  ', '123', '----', 'Camille\nExemple', 'Camille\u200b', 'Camille\u202e', 'client@example.org'])assert.ok(contactIssue('first_name',value),JSON.stringify(value));
  assert.throws(()=>contactField('last_name','\tExemple'),(e:any)=>e.code==='CONTACT_LAST_NAME');
  assert.ok(contactLimits.first_name<=255&&contactLimits.last_name<=255&&contactLimits.email<=255);
});

test('coordonnées : e-mails et téléphones contrôlés sans enlever les signes utiles',()=>{
  for(const value of ['camille+fce@example.org',"o'neill@example.org",'Camille.Exemple@Sous-Domaine.example.org','a@xn--exemple-fya.fr'])assert.equal(contactIssue('email',value),'',value);
  for(const value of ['a..b@example.org','.a@example.org','a.@example.org','a@-example.org','a@example_.org','a@example','a b@example.org','a@example.org\n','a'.repeat(65)+'@example.org'])assert.ok(contactIssue('email',value),value);
  for(const value of ['06 12 34 56 78','+33 6 12 34 56 78','+33\u00a06\u202f12 34 56 78','01.23.45.67.89','(020) 7946-0123'])assert.equal(contactIssue('phone',value),'',value);
  for(const value of ['......','++33612345678','06+12345678','12345','1234567890123456','0612abc678'])assert.ok(contactIssue('phone',value),value);
  assert.deepEqual(payerContact({first_name:' Camille ',last_name:' Exemple ',email:' Camille+FCE@EXAMPLE.ORG ',phone:'+33 6 12 34 56 78'}),{first_name:'Camille',last_name:'Exemple',email:'camille+fce@example.org',phone:'+33 6 12 34 56 78'});
});

test('coordonnées DOM : erreurs par champ, premier champ focalisé et correction sans perdre les autres valeurs',async()=>{
  const w=new Window(),d=w.document;d.write('<form id="payer"><label>Prénom<input name="first_name"></label><label>Nom<input name="last_name"></label><label>E-mail<input name="email" type="email"></label><label>Téléphone<input name="phone" type="tel"></label></form>');
  w.eval(readFileSync('public/shop-contact.js','utf8').replace(/export /g,'')+'\nwindow.validate=bindContactValidation(document.querySelector("form"));');
  const form=d.querySelector<HTMLFormElement>('form')!;
  for(const [name,value] of Object.entries({first_name:'123',last_name:'O’Neill',email:'camille..exemple@example.org',phone:'......'}))(form.elements.namedItem(name) as HTMLInputElement).value=value;
  assert.equal((w as any).validate(),false);assert.equal(d.activeElement?.getAttribute('name'),'first_name');
  assert.equal(form.querySelectorAll('[aria-invalid=true]').length,3);assert.equal(form.noValidate,true);
  for(const [name,value] of Object.entries({first_name:'Camille',email:'camille+fce@example.org',phone:'+33 6 12 34 56 78'})){
    const input=form.elements.namedItem(name) as HTMLInputElement;input.value=value;input.dispatchEvent(new w.Event('input',{bubbles:true}));
  }
  assert.equal((w as any).validate(),true);assert.equal(form.querySelectorAll('[aria-invalid=true]').length,0);assert.equal((form.elements.namedItem('last_name') as HTMLInputElement).value,'O’Neill');
  await w.happyDOM.abort();w.close();
});

test('diagnostic HelloAsso : champs reconnus seuls, aucune valeur ni message du prestataire conservé',async()=>{
  const fields=await rejectedFields(Response.json({errors:{'$.Payer.FirstName':['PRIVATE_VALUE'],Email:['contact-secret@example.org']},message:'PRIVATE_TOKEN',payer:{lastName:'PRIVATE_NAME'}}));
  assert.deepEqual(fields,['email','first_name']);
  const error=new HelloAssoRejection(400,'Informations refusées (HTTP 400).',fields);
  assert.equal(error.code,'HELLOASSO_REJECTED');assert.equal(error.historyCode,'HELLOASSO_REJECTED:400:email,first_name');
  assert.match(error.message,/E-mail du payeur, Prénom du payeur/);assert.match(paymentAttemptMessage(error.historyCode),/HTTP 400/);
  assert.doesNotMatch(JSON.stringify(error)+error.message+paymentAttemptMessage(error.historyCode),/PRIVATE_|contact-secret/);
  assert.deepEqual(await rejectedFields(Response.json({errors:[{propertyName:'payer.lastName',message:'SECRET'}, {field:'totalAmount',value:9000}]})),['last_name','total_amount']);
  assert.deepEqual(await rejectedFields(Response.json({errors:{constructor:'SECRET',UnknownField:'SECRET'},message:'payer.firstName = SECRET'})),[]);
  assert.match(paymentAttemptMessage('HELLOASSO_REJECTED'),/ancien historique/);assert.doesNotMatch(paymentAttemptMessage('SECRET_TOKEN'),/SECRET_TOKEN/);
});

test('diagnostic HelloAsso : réponse vide, illisible, trop grande ou déjà lue conserve un refus définitif sans données brutes',async()=>{
  for(const response of [new Response(),new Response('<html>SECRET</html>'),new Response('x'.repeat(20000))])assert.deepEqual(await rejectedFields(response),[]);
  const used=Response.json({errors:{email:['SECRET']}});await used.text();assert.deepEqual(await rejectedFields(used),[]);
  const error=new HelloAssoRejection(400,'Refus HTTP 400.');assert.equal(error.historyCode,'HELLOASSO_REJECTED:400:');assert.match(paymentAttemptMessage(error.historyCode),/Aucun champ précis/);
});

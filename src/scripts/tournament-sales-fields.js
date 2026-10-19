import {esc} from '../../public/shop-common.js';
import {formEditor} from './tournament-form-editor';
const localTime=seconds=>seconds?new Date(seconds*1000-new Date(seconds*1000).getTimezoneOffset()*60000).toISOString().slice(0,16):'';
export function salesMarkup(s={}) {
 const input=(name,label,value,type='text')=>`<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${type==='number'?'min="0"':''}></label>`;
 return `<section class="wide tournament-editor-block"><h3>Inscriptions et tarif</h3><p>Le statut « Inscriptions ouvertes » ouvre le formulaire du tournoi. Les autres statuts le ferment. Les inscriptions déjà reçues conservent leurs conditions.</p><div class="commerce-form-grid">${input('fee','Tarif par équipe (€)',s.fee_cents?s.fee_cents/100:50,'number')}${input('capacity','Capacité en équipes (0 = sans limite)',s.capacity||0,'number')}${input('registration_deadline','Clôture des inscriptions',localTime(s.registration_deadline),'datetime-local')}${input('payment_deadline','Date limite de paiement',localTime(s.payment_deadline),'datetime-local')}<label class="tournament-choice wide"><input type="checkbox" name="allow_pay_later" ${s.allow_pay_later!==0?'checked':''}> Proposer le paiement plus tard avec HelloAsso</label><label class="tournament-choice wide"><input type="checkbox" name="allow_cheque" ${s.allow_cheque?'checked':''}> Proposer le paiement par chèque</label><div class="wide commerce-form-grid" data-cheque-settings>${input('cheque_payee','Chèque à l’ordre de',s.cheque_payee||'')}${input('cheque_deadline','Chèque à envoyer avant le',localTime(s.cheque_deadline),'datetime-local')}<label class="wide">Adresse d’envoi du chèque<textarea name="cheque_address" maxlength="1000">${esc(s.cheque_address||'')}</textarea></label></div><label class="wide">Conditions d’inscription et d’annulation<textarea name="terms" maxlength="12000" rows="5">${esc(s.terms||'')}</textarea></label></div></section><section class="wide tournament-editor-block"><h3>Questions complémentaires</h3><p>Les sections et leurs nombres d’équipes sont ajoutés automatiquement au formulaire. Ajoutez ici les autres questions utiles.</p><div id="tournament-form-builder"></div></section>`;
}
export function bindSales(form,s={}) {
 const fields=formEditor(form.querySelector('#tournament-form-builder'),JSON.parse(s.form_json||'[]'));
 form.elements.fee.step='0.01';form.elements.fee.min='0.01';form.elements.fee.max='10000';form.elements.capacity.max='10000';
 const refresh=()=>{const open=form.elements.status.value==='open';for(const name of ['registration_deadline','payment_deadline','terms'])form.elements[name].required=open;const cheque=form.elements.allow_cheque.checked;form.querySelector('[data-cheque-settings]').hidden=!cheque;for(const name of ['cheque_payee','cheque_deadline','cheque_address'])form.elements[name].required=cheque;};
 form.elements.status.addEventListener('change',refresh);form.elements.allow_cheque.addEventListener('change',refresh);refresh();
 return id=>{
   const stamp=name=>Math.floor(new Date(form.elements[name].value).getTime()/1000)||0;
   if(!stamp('registration_deadline')||!stamp('payment_deadline')||!form.elements.terms.value.trim()){
     if(form.elements.status.value==='open')throw new Error('Complétez les dates et les conditions pour ouvrir les inscriptions.');
     return s.version?{...s,tournament_id:id,enabled:false,form_fields:fields()}:null;
   }
   return {tournament_id:id,version:s.version||0,fee_cents:Math.round(Number(form.elements.fee.value)*100),capacity:Number(form.elements.capacity.value),registration_deadline:stamp('registration_deadline'),payment_deadline:stamp('payment_deadline'),terms:form.elements.terms.value,enabled:form.elements.status.value==='open',allow_pay_later:form.elements.allow_pay_later.checked,form_fields:fields(),allow_cheque:form.elements.allow_cheque.checked,cheque_payee:form.elements.cheque_payee.value,cheque_address:form.elements.cheque_address.value,cheque_deadline:stamp('cheque_deadline')};
 };
}

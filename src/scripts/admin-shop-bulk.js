import {showError} from '../../public/shop-common.js';
export function bindVariantTools(root,variants,call,productId,reload,notice){
 const table=root.querySelector('[data-variant-table]');if(!table)return;
 const fields=[['price_cents','Tarif FCE'],['catalogue_price_cents','Prix catalogue'],['coach_price_cents','Tarif coach']];
 table.insertAdjacentHTML('beforebegin',`<section class="commerce-bulk"><h4>Appliquer des prix à plusieurs tailles</h4><p>Sélectionnez les lignes, puis renseignez uniquement les tarifs à modifier.</p><div class="commerce-actions"><button type="button" data-size-preset="all">Toutes les tailles</button><button type="button" data-size-preset="child">Tailles enfant</button><button type="button" data-size-preset="adult">Tailles adulte</button><button type="button" data-size-preset="none" class="commerce-secondary">Tout désélectionner</button></div><form id="bulk-prices" class="commerce-form-grid">${fields.map(([key,label])=>`<label>${label}<select data-bulk-action="${key}" aria-label="Action pour ${label}"><option value="keep">Conserver</option><option value="set">Fixer un prix</option>${key!=='price_cents'?'<option value="clear">Effacer ce prix</option>':''}</select><input data-bulk-price="${key}" aria-label="${label} en euros" type="number" step="0.01" min="0.01" max="10000" placeholder="Montant en €" disabled hidden></label>`).join('')}<p id="bulk-selection" class="commerce-help wide" aria-live="polite"></p><p id="bulk-error" class="wide" role="alert" hidden></p><div class="wide"><button type="submit" disabled>Appliquer aux tailles sélectionnées</button></div></form></section><div class="commerce-result-head"><p class="commerce-help">Ordre naturel par défaut : enfant puis adulte. Utilisez les flèches pour personnaliser l’ordre.</p><button type="button" id="natural-size-order" class="commerce-secondary">Rétablir le tri automatique</button></div>`);
 table.insertAdjacentHTML('afterend','<div class="commerce-bulk-dock" hidden><span data-bulk-count></span><button type="button" data-open-bulk>Modifier les prix de ma sélection ↑</button></div>');
 root.querySelector('[data-open-bulk]').onclick=()=>{root.querySelector('.commerce-bulk').scrollIntoView({behavior:'smooth',block:'center'});root.querySelector('[data-bulk-action]').focus();};
 const form=root.querySelector('#bulk-prices'),boxes=()=>[...root.querySelectorAll('[data-select-variant]')],selected=()=>boxes().filter(b=>b.checked).map(b=>b.dataset.selectVariant);
 const update=()=>{
  const ids=selected(),rows=variants.filter(v=>ids.includes(v.id));
  root.querySelector('.commerce-bulk-dock').hidden=!ids.length;root.querySelector('[data-bulk-count]').textContent=`${ids.length} taille(s) sélectionnée(s)`;
  root.querySelector('#bulk-selection').textContent=ids.length?`${ids.length} taille(s) sélectionnée(s) : ${rows.map(v=>v.label).join(', ')}`:'Aucune taille sélectionnée.';
  const changed=fields.some(([key])=>form.querySelector(`[data-bulk-action="${key}"]`).value!=='keep');
  form.querySelector('[type=submit]').disabled=!ids.length||!changed;
  const all=root.querySelector('[data-select-all]');all.checked=ids.length===variants.length&&!!ids.length;all.indeterminate=!!ids.length&&ids.length<variants.length;
 };
 boxes().forEach(box=>box.onchange=update);
 root.querySelector('[data-select-all]').onchange=e=>{boxes().forEach(b=>b.checked=e.target.checked);update();};
 root.querySelectorAll('[data-size-preset]').forEach(button=>button.onclick=()=>{
  boxes().forEach(box=>{const v=variants.find(v=>v.id===box.dataset.selectVariant),child=/\d\s*(ans?|mois)\b/i.test(v.size||v.label),adult=/^(?:adultes?\s*)?(?:\d+|[2-6]?X{0,4}[SML]|S|M|L)$/i.test((v.size||v.label).trim());
   box.checked=button.dataset.sizePreset==='all'||button.dataset.sizePreset==='child'&&child||button.dataset.sizePreset==='adult'&&adult&&!child;});update();
 });
 fields.forEach(([key])=>form.querySelector(`[data-bulk-action="${key}"]`).onchange=e=>{const input=form.querySelector(`[data-bulk-price="${key}"]`);input.hidden=input.disabled=e.target.value!=='set';input.required=e.target.value==='set';update();});
 form.onsubmit=async event=>{
  event.preventDefault();if(!form.reportValidity())return;
  const ids=selected(),prices={};fields.forEach(([key])=>{const choice=form.querySelector(`[data-bulk-action="${key}"]`).value;if(choice==='set')prices[key]=Math.round(Number(form.querySelector(`[data-bulk-price="${key}"]`).value)*100);if(choice==='clear')prices[key]=null;});
  const button=form.querySelector('[type=submit]');button.disabled=true;
  try{await call('variants/prices',{method:'PUT',data:{product_id:Number(productId),variant_ids:ids,prices}});await reload(false);notice(`Tarifs mis à jour pour ${ids.length} taille(s).`);}catch(error){showError(form.querySelector('#bulk-error'),error);update();}
 };
 const order=async(button,ids)=>{button.disabled=true;try{await call('variants/order',{method:'PUT',data:{product_id:Number(productId),...(ids?{variant_ids:ids}:{action:'automatic'})}});await reload(false);notice('Ordre des tailles enregistré.');}catch(error){showError(form.querySelector('#bulk-error'),error);button.disabled=false;}};
 root.querySelectorAll('[data-move-variant]').forEach(button=>button.onclick=()=>{const ids=variants.map(v=>v.id),i=ids.indexOf(button.dataset.moveVariant),j=i+Number(button.dataset.direction);if(j<0||j>=ids.length)return;[ids[i],ids[j]]=[ids[j],ids[i]];order(button,ids);});
 root.querySelector('#natural-size-order').disabled=!variants.length;
 root.querySelector('#natural-size-order').onclick=e=>order(e.target,null);
 update();
}

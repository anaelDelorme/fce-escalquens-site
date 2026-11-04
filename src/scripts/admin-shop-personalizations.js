import {esc,money,showError} from '../../public/shop-common.js';

export async function renderPersonalizations(root,call,notice){
 const {personalizations}=await call('personalizations');
 root.innerHTML=`<section class="commerce-card"><h2>Catalogue des personnalisations</h2><p>Définissez chaque personnalisation et son supplément une seule fois. Les articles qui l’utilisent reprennent automatiquement ce tarif. Les commandes déjà passées gardent leur montant.</p><div class="commerce-table-wrap"><table><thead><tr><th>Personnalisation</th><th>Supplément</th><th>Saisie client</th><th>Choix client</th><th>Articles associés</th><th>Disponibilité</th><th></th></tr></thead><tbody>${personalizations.map(p=>`<tr><td><strong>${esc(p.label)}</strong></td><td>${p.price_cents?money(p.price_cents):'Inclus'}</td><td>${p.requires_text?`Texte · ${p.max_length} caractères maximum`:'Sans texte'}</td><td>${p.required?"Obligatoire":"Facultatif"}</td><td>${p.article_count}</td><td>${p.active?'Disponible':'Désactivée'}</td><td><button type="button" data-personalization-edit="${esc(p.id)}" class="commerce-secondary">Modifier</button></td></tr>`).join('')||'<tr><td colspan="7">Aucune personnalisation. Créez la première ci-dessous.</td></tr>'}</tbody></table></div><div id="personalization-editor"></div></section>`;
 function edit(p={label:'',price_cents:0,requires_text:0,max_length:4,active:1,required:0}){
  const editor=root.querySelector('#personalization-editor');
  editor.innerHTML=`<h3>${p.id?'Modifier la personnalisation':'Ajouter une personnalisation'}</h3><form id="personalization-form" class="commerce-form-grid"><label>Nom de la personnalisation<input name="label" maxlength="120" value="${esc(p.label)}" required></label><label>Supplément en euros<input name="price" type="number" min="0" max="1000" step="0.01" value="${p.price_cents/100}" required></label><label>Choix du client<select name="required"><option value="0" ${!p.required?'selected':''}>Facultatif</option><option value="1" ${p.required?'selected':''}>Obligatoire</option></select><small>Un choix obligatoire est précoché et ne peut pas être retiré par le client sur les articles associés.</small></label><label>Saisie demandée<select name="requires_text"><option value="0" ${!p.requires_text?'selected':''}>Aucun texte</option><option value="1" ${p.requires_text?'selected':''}>Texte de personnalisation</option></select></label><label id="personalization-max-length">Nombre de caractères maximum<input name="max_length" type="number" min="1" max="40" value="${p.max_length}" required></label><label class="commerce-check wide"><input name="active" type="checkbox" ${p.active?'checked':''}><span>Disponible sur les articles associés</span></label><p class="commerce-help wide">${p.id?`Cette modification s’applique aux ${p.article_count} article(s) associés. `:''}Désactiver la personnalisation la retire de la vente sur tous ses articles ; leurs associations sont conservées.</p><div class="commerce-actions wide"><button type="submit">Enregistrer la personnalisation</button><button type="button" id="new-personalization" class="commerce-secondary">+ Nouvelle personnalisation</button></div></form>`;
  const form=editor.querySelector('form');
  const updateText=()=>{form.querySelector('#personalization-max-length').hidden=form.elements.requires_text.value!=='1';};
  form.elements.requires_text.onchange=updateText;updateText();
  editor.querySelector('#new-personalization').onclick=()=>edit();
  form.onsubmit=async event=>{
   event.preventDefault();if(!form.reportValidity())return;
   const button=form.querySelector('[type=submit]');button.disabled=true;
   try{
    const values=Object.fromEntries(new FormData(form));
    await call('personalizations',{method:'PUT',data:{id:p.id,version:p.version,label:values.label,price_cents:Math.round(Number(values.price)*100),requires_text:values.requires_text==='1',required:values.required==='1',max_length:Number(values.max_length),active:form.elements.active.checked}});
    await renderPersonalizations(root,call,notice);notice('Personnalisation enregistrée. Le tarif est actualisé sur tous les articles associés.');
   }catch(error){showError(document.querySelector('#admin-shop-message'),error);}finally{button.disabled=false;}
  };
 }
 root.querySelectorAll('[data-personalization-edit]').forEach(button=>button.onclick=()=>{edit(personalizations.find(p=>p.id===button.dataset.personalizationEdit));root.querySelector('#personalization-editor').scrollIntoView({behavior:'smooth',block:'start'});});
 edit();
}

export function mountProductPersonalizations(root,cat,productId,call,onSaved,notice){
 const definitions=cat.personalizations||[],links=cat.options.filter(o=>o.product_id===Number(productId));
 const product=cat.products.find(p=>p.id===Number(productId));
 root.innerHTML=`<section class="commerce-personalizations"><h4>Personnalisations de cet article</h4><p>Cochez les personnalisations proposées pour cet article. Leurs tarifs se gèrent dans le <a href="/admin-boutique/personnalisations/">catalogue commun des personnalisations →</a>.</p>${definitions.length?`<form id="product-personalizations-form"><div class="commerce-table-wrap"><table><thead><tr><th>Proposer</th><th>Personnalisation</th><th>Supplément</th><th>Saisie client</th><th>Choix client</th></tr></thead><tbody>${definitions.map(p=>`<tr><td><input type="checkbox" name="personalization_ids" value="${esc(p.id)}" aria-label="Proposer ${esc(p.label)}" ${links.some(o=>o.personalization_id===p.id&&o.active)?'checked':''}></td><td><strong>${esc(p.label)}</strong>${!p.active?'<small>Désactivée dans le catalogue commun</small>':''}</td><td>${p.price_cents?money(p.price_cents):'Inclus'}</td><td>${p.requires_text?`Texte · ${p.max_length} caractères maximum`:'Sans texte'}</td><td>${p.required?'Obligatoire':'Facultatif'}</td></tr>`).join('')}</tbody></table></div><p class="commerce-help">Vous pouvez tout décocher. Une personnalisation désactivée dans le catalogue commun reste indisponible à la vente, même si elle est cochée ici.</p><button type="submit">Enregistrer les personnalisations de cet article</button></form>`:'<p>Aucune personnalisation disponible. Ajoutez-en dans le catalogue commun.</p>'}</section>`;
 const form=root.querySelector('form');if(!form)return;
 form.onsubmit=async event=>{
  event.preventDefault();const button=form.querySelector('[type=submit]');button.disabled=true;
  try{
   const ids=Array.from(form.querySelectorAll('input[name=personalization_ids]:checked'),input=>input.value);
   await call(`products/${productId}/personalizations`,{method:'PUT',data:{personalization_ids:ids,version:product.personalizations_version}});
   await onSaved(ids.length>0);notice('Personnalisations de l’article enregistrées.');
  }catch(error){showError(document.querySelector('#admin-shop-message'),error);}finally{button.disabled=false;}
 };
}

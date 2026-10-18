import {esc, showError, money} from '../../public/shop-common.js';
const field=(name,label,value,type='text',required=false)=>`<label>${label}<input name="${name}" type="${type}" value="${esc(value??'')}" ${required?'required':''} maxlength="500"></label>`;
async function action(button,run){button.disabled=true;try{await run();}catch(error){showError(document.querySelector('#admin-shop-message'),error);}finally{button.disabled=false;}}
export async function renderVariants(root,call,notice,productId,onPriceChange=()=>{},chosenMode=null){
  const [cat,result]=await Promise.all([call('catalogue'),call('suppliers')]);
  const variants=cat.variants.filter(v=>v.product_id===Number(productId)),options=cat.options.filter(o=>o.product_id===Number(productId));
  const active=variants.filter(v=>v.active),activeOptions=options.filter(o=>o.active);
  const defaultSimple=(!variants.length && !options.length)||(active.length===1&&!active[0].size&&!active[0].color&&!activeOptions.length);
  let simple=chosenMode??defaultSimple;
  const priceLabel=active.length?`${new Set(active.map(v=>v.price_cents)).size>1?'À partir de ':''}${money(Math.min(...active.map(v=>v.price_cents)))}`:'Tailles et tarif à configurer';
  onPriceChange(active.length?priceLabel:'');
  root.innerHTML=`<section class="commerce-card"><h3>Prix et choix de cet article</h3><p class="commerce-message">Prix affiché dans la boutique : <strong id="published-variant-price">${esc(priceLabel)}</strong><br>Calculé automatiquement à partir des choix actifs, hors options.</p><div class="commerce-mode" role="group" aria-label="Type d’article"><button type="button" data-product-mode="simple" aria-pressed="${simple}">Article simple</button><button type="button" data-product-mode="choices" aria-pressed="${!simple}">Avec tailles ou personnalisation</button></div><p id="mode-description"></p><div id="catalogue-editor"></div></section>`;
  const suppliers=result.suppliers;
  const reload=mode=>renderVariants(root,call,notice,productId,onPriceChange,mode);
  const supplierField=v=>`<label>Fournisseur<select name="supplier_id" required><option value="">Choisir un fournisseur</option>${suppliers.filter(s=>s.active||s.id===v.supplier_id).map(s=>`<option value="${esc(s.id)}" ${s.id===v.supplier_id?'selected':''}>${esc(s.name)}${s.active?'':' (désactivé)'}</option>`).join('')}</select><small><a href="/admin-boutique/fournisseurs/">Gérer les fournisseurs →</a></small></label>`;
  function render(){
    root.querySelectorAll('[data-product-mode]').forEach(b=>b.setAttribute('aria-pressed',String((b.dataset.productMode==='simple')===simple)));
    root.querySelector('#mode-description').textContent=simple?'Un prix, une référence et un fournisseur. Aucun choix de taille ni option à demander au client.':"Définissez les tailles et leurs prix. Ajoutez des options uniquement si cet article peut être personnalisé.";
    root.querySelector('#catalogue-editor').innerHTML=simple?'<form id="variant-form" class="commerce-form-grid"></form>':`<div class="commerce-split"><section><h4>Tailles et modèles</h4><label>Choix à modifier<select id="variant-select"><option value="">+ Ajouter une taille / un modèle</option>${variants.map(v=>`<option value="${esc(v.id)}">${esc(v.label)} · ${money(v.price_cents)}${v.active?'':' (inactif)'}</option>`).join('')}</select></label><form id="variant-form" class="commerce-form-grid" style="margin-top:18px"></form></section><section><h4>Personnalisation</h4><p>Les options sont facultatives. Sans option, le client choisit seulement sa taille.</p><label>Option à modifier<select id="option-select"><option value="">Aucune sélection</option>${options.map(o=>`<option value="${esc(o.id)}">${esc(o.label)} · ${money(o.price_cents)}${o.active?'':' (inactive)'}</option>`).join('')}</select></label><button type="button" id="add-product-option" class="commerce-secondary">+ Ajouter une option</button><form id="option-form" class="commerce-form-grid" style="margin-top:18px" hidden></form></section></div>`;
    function variantForm(){
      const v=(simple?(active[0]||variants[0]):variants.find(v=>v.id===root.querySelector('#variant-select').value))||{label:'',size:'',color:'',sku:'',supplier_id:'',price_cents:'',active:1};
      const form=root.querySelector('#variant-form');
      form.innerHTML=`${simple?'':field('label','Libellé du choix (ex. Adulte M)',v.label,'text',true)+field('size','Taille',v.size)+field('color','Couleur',v.color)}<label>Prix de vente en euros<input name="price" type="number" min="0.01" max="10000" step="0.01" value="${v.price_cents?v.price_cents/100:''}" placeholder="Ex. 25,00" required></label>${field('sku','Référence de l’article chez le fournisseur',v.sku,'text',true)}${supplierField(v)}<label class="commerce-check wide"><input name="active" type="checkbox" ${v.active?'checked':''}><span>Disponible à la vente</span></label>${simple&&(active.length>1||activeOptions.length)?'<p class="commerce-help wide">Enregistrer en mode simple désactivera les autres tailles et les options. Les commandes passées restent inchangées.</p>':''}<div class="wide"><button type="submit">${simple?'Enregistrer le prix et le fournisseur':'Enregistrer cette taille / ce modèle'}</button></div>`;
      form.onsubmit=event=>{event.preventDefault();if(!form.reportValidity())return;action(form.querySelector('[type=submit]'),async()=>{
        const values=Object.fromEntries(new FormData(form));
        await call('variants',{method:'PUT',data:{...values,id:v.id,product_id:Number(productId),simple,label:simple?'Taille unique':values.label,size:simple?'':values.size,color:simple?'':values.color,price_cents:Math.round(Number(values.price)*100),active:form.elements.active.checked}});
        await reload(simple);notice('Article enregistré. Son prix affiché est synchronisé avec son tarif de commande.');
      });};
    }
    function optionForm(option=null){
      const form=root.querySelector('#option-form');form.hidden=false;
      const o=option||{label:'',price_cents:0,max_length:4,requires_text:0,active:1};
      form.innerHTML=`${field('label','Nom de l’option',o.label,'text',true)}<label>Supplément en euros<input name="price" type="number" min="0" max="1000" step="0.01" value="${o.price_cents/100}" required></label><label class="commerce-check wide"><input name="requires_text" type="checkbox" ${o.requires_text?'checked':''}><span>Demander un texte de personnalisation</span></label><label id="option-max-length">Nombre de caractères maximum<input name="max_length" type="number" min="1" max="40" value="${o.max_length}" required></label><label class="commerce-check wide"><input name="active" type="checkbox" ${o.active?'checked':''}><span>Option disponible</span></label><div class="wide"><button type="submit">Enregistrer l’option</button></div>`;
      const textField=()=>{form.querySelector('#option-max-length').hidden=!form.elements.requires_text.checked;};form.elements.requires_text.onchange=textField;textField();
      form.onsubmit=event=>{event.preventDefault();if(!form.reportValidity())return;action(form.querySelector('[type=submit]'),async()=>{
        const values=Object.fromEntries(new FormData(form));await call('options',{method:'PUT',data:{...values,id:o.id,product_id:Number(productId),price_cents:Math.round(Number(values.price)*100),max_length:Number(values.max_length),active:form.elements.active.checked,requires_text:form.elements.requires_text.checked}});
        await reload(false);notice('Option enregistrée.');
      });};
    }
    if(!simple){root.querySelector('#variant-select').onchange=variantForm;root.querySelector('#option-select').onchange=event=>{const o=options.find(o=>o.id===event.target.value);if(o)optionForm(o);else root.querySelector('#option-form').hidden=true;};root.querySelector('#add-product-option').onclick=()=>optionForm();}
    variantForm();
  }
  root.querySelectorAll('[data-product-mode]').forEach(b=>b.onclick=()=>{simple=b.dataset.productMode==='simple';render();});render();
}

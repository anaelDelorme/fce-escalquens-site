import {esc, showError} from "../../public/shop-common.js";
const money=cents=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(cents/100);
const field=(name,label,value,type='text',required=false)=>`<label>${label}<input name="${name}" type="${type}" value="${esc(value??'')}" ${required?'required':''} maxlength="500"></label>`;
async function action(button,run){button.disabled=true;try{await run();}catch(error){showError(document.querySelector('#admin-shop-message'),error);}finally{button.disabled=false;}}
export async function renderVariants(root, call, notice, productId) {
  const cat = await call("catalogue");
  root.innerHTML = `<section class="commerce-card"><h3>Tailles, prix et personnalisations de cet article</h3><p>Une taille = un choix et un tarif exact. Pour un accessoire, créez une variante « Taille unique ». Aucun paiement n’est déduit des textes de présentation.</p><div id="catalogue-editor"></div></section>`;
  const render = () => {
    const id = Number(productId),
      variants = cat.variants.filter((v) => v.product_id === id),
      options = cat.options.filter((o) => o.product_id === id);
    root.querySelector("#catalogue-editor").innerHTML =
      `<div class="commerce-split"><section><h3>Tailles / modèles</h3><label>Modifier une variante<select id="variant-select"><option value="">+ Nouvelle variante</option>${variants.map((v) => `<option value="${esc(v.id)}">${esc(v.label)} · ${money(v.price_cents)} ${v.active ? "" : "(inactive)"}</option>`).join("")}</select></label><form id="variant-form" class="commerce-form-grid" style="margin-top:20px"></form></section><section><h3>Options et personnalisation</h3><label>Modifier une option<select id="option-select"><option value="">+ Nouvelle option</option>${options.map((o) => `<option value="${esc(o.id)}">${esc(o.label)} · ${money(o.price_cents)} ${o.active ? "" : "(inactive)"}</option>`).join("")}</select></label><form id="option-form" class="commerce-form-grid" style="margin-top:20px"></form></section></div>`;
    const variantForm = () => {
      const v = variants.find(
        (v) => v.id === root.querySelector("#variant-select").value,
      ) || {
        label: "",
        size: "",
        color: "",
        sku: "",
        supplier: "Intersport / Kappa",
        price_cents: 0,
        active: 1,
      };
      const form = root.querySelector("#variant-form");
      form.innerHTML = `${field("label", "Libellé du choix (ex. Adulte M)", v.label, "text", true)}${field("size", "Taille exacte (ou vide si unique)", v.size)}${field("color", "Couleur", v.color)}${field("sku", "Référence fournisseur", v.sku, "text", true)}${field("supplier", "Fournisseur", v.supplier, "text", true)}<label>Prix en euros<input name="price" type="number" min="0.01" max="10000" step="0.01" value="${v.price_cents / 100}" required></label><label class="commerce-check wide"><input name="active" type="checkbox" ${v.active ? "checked" : ""}>Variante disponible à la vente</label><div class="wide"><button type="submit">Enregistrer la variante</button></div>`;
      form.onsubmit = (event) => {
        event.preventDefault();
        if(!form.reportValidity())return;
        action(form.querySelector("button"), async () => {
          const values = Object.fromEntries(new FormData(form));
          await call("variants", {
            method: "PUT",
            data: {
              ...values,
              id: v.id,
              product_id: id,
              price_cents: Math.round(Number(values.price) * 100),
              active: form.elements.active.checked,
            },
          });
          notice(
            "Variante enregistrée. Les commandes passées conservent leur prix initial.",
          );
          await renderVariants(root, call, notice, productId);
        });
      };
    };
    const optionForm = () => {
      const o = options.find(
        (o) => o.id === root.querySelector("#option-select").value,
      ) || {
        label: "",
        price_cents: 0,
        max_length: 4,
        requires_text: 1,
        active: 1,
      };
      const form = root.querySelector("#option-form");
      form.innerHTML = `${field("label", "Nom de l’option (ex. Initiales)", o.label, "text", true)}<label>Supplément en euros<input name="price" type="number" min="0" max="1000" step="0.01" value="${o.price_cents / 100}" required></label>${field("max_length", "Longueur maximale du texte", o.max_length, "number", true)}<label class="commerce-check"><input name="requires_text" type="checkbox" ${o.requires_text ? "checked" : ""}>Texte de personnalisation obligatoire</label><label class="commerce-check wide"><input name="active" type="checkbox" ${o.active ? "checked" : ""}>Option disponible</label><div class="wide"><button type="submit">Enregistrer l’option</button></div>`;
      form.onsubmit = (event) => {
        event.preventDefault();
        if(!form.reportValidity())return;
        action(form.querySelector("button"), async () => {
          const values = Object.fromEntries(new FormData(form));
          await call("options", {
            method: "PUT",
            data: {
              ...values,
              id: o.id,
              product_id: id,
              price_cents: Math.round(Number(values.price) * 100),
              max_length: Number(values.max_length),
              active: form.elements.active.checked,
              requires_text: form.elements.requires_text.checked,
            },
          });
          notice("Option enregistrée.");
          await renderVariants(root, call, notice, productId);
        });
      };
    };
    root.querySelector("#variant-select").onchange = variantForm;
    root.querySelector("#option-select").onchange = optionForm;
    variantForm();
    optionForm();
  };
  render();
}

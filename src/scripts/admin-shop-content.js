import { renderVariants } from "./admin-shop-variants.js";
import { esc, showError, readStorage } from "../../public/shop-common.js";
const schemas = {
  shop_categories: [
    ["name", "Nom", "text", true],
    ["description", "Présentation", "textarea"],
    ["display_order", "Ordre", "number"],
    ["active", "Visible", "checkbox"],
  ],
  shop_products: [
    ["shop_category_id", "Catégorie", "category", true],
    ["name", "Nom", "text", true],
    ["short_description", "Texte court — uniquement sur la carte boutique", "textarea"],
    ["description", "Détails de l’article — composition, entretien, précisions (fenêtre Détails)", "textarea"],
    ["delivery_delay", "Délai indicatif", "text"],
    ["image_key", "Photo de l’article", "image"],
    ["featured", "Article à la une", "checkbox"],
    ["highlighted", "Article phare", "checkbox"],
    ["display_order", "Ordre", "number"],
    ["active", "Visible", "checkbox"],
  ],
  shop_settings: [
    ["shop_enabled", "Afficher la boutique publique", "checkbox"],
    ["maintenance_image_key", "Visuel de fermeture", "image"],
  ],
  site_media: [
    ["object_key", "Couverture de la boutique", "image"],
    ["alt_text", "Description de l’image pour l’accessibilité", "text"],
  ],
};
const labels = {
  shop_categories: "Catégories",
  shop_products: "Articles et photos",
  shop_settings: "Ouverture et visuel de fermeture",
  site_media: "Couverture de la boutique",
};
const slug = (value) =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
export async function renderContent(root, call, notice, collection = "shop_products") {
  let
    rows = [],
    categories = [];
  let categoryFilter="", visibilityFilter="", searchFilter="", commerce={variants:[],options:[]};
  root.innerHTML = `<section class="commerce-card"><h2>${labels[collection]}</h2><p>${collection==='shop_products'?'Une fiche rassemble la photo, les textes, les tailles, les tarifs et les personnalisations. Les textes courts et les détails ont chacun leur emplacement.':collection==='shop_categories'?'Classez votre collection. Masquer une catégorie masque aussi ses articles dans la boutique et le catalogue PDF.':'Gérez la présentation générale de la boutique.'}</p><div class="commerce-filters">${["shop_products","shop_categories"].includes(collection)?'<label>Rechercher<input id="content-search" type="search" placeholder="Nom de l’article ou de la catégorie…"></label>':""}${collection==='shop_products'?'<label>Catégorie<select id="content-category"><option value="">Toutes les catégories</option></select></label>':''}${['shop_categories','shop_products'].includes(collection)?'<label>Visibilité<select id="content-visibility"><option value="">Tous</option><option value="1">Visibles</option><option value="0">Masqués</option></select></label>':''}<button type="button" id="content-add">+ Ajouter ${collection==='shop_products'?'un article':'une catégorie'}</button></div><p id="content-result-count" class="commerce-help" role="status" aria-live="polite"></p><div id="content-list"></div><div id="content-editor"></div></section>`;
  root.querySelector('#content-search')?.addEventListener('input',event=>{searchFilter=event.target.value;renderList();});
  const list = root.querySelector("#content-list"),
    editor = root.querySelector("#content-editor");
  const errorNode = document.querySelector("#admin-shop-message");
  const run = async (button, fn) => {
    if (button) button.disabled = true;
    try {
      await fn();
    } catch (error) {
      showError(errorNode, error);
    } finally {
      if (button) button.disabled = false;
    }
  };
  async function load() {
    editor.innerHTML = "";
    list.innerHTML = "<p>Chargement…</p>";
    [rows, categories] = await Promise.all([
      call(`content/${collection}`),
      call("content/shop_categories"),
    ]);
    root.querySelector("#content-add").hidden = [
      "shop_settings",
      "site_media",
    ].includes(collection);
    if(collection==='shop_products') {
      commerce=await call('catalogue');
      root.querySelector('#content-category').innerHTML='<option value="">Toutes les catégories</option>'+categories.map(c=>`<option value="${c.id}">${esc(c.name)}${c.active?'':' (masquée)'}</option>`).join('');
      root.querySelector('#content-category').value=categoryFilter;
    }
    renderList();
  }
  function renderList() {
    const visible=row=>Boolean(row.active && (collection!=='shop_products' || (row.image_key && (!row.shop_category_id || categories.find(c=>c.id===row.shop_category_id)?.active))));
    const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const filtered=rows.filter(row=>normalize(row.name).includes(normalize(searchFilter)) && (!categoryFilter || String(row.shop_category_id)===categoryFilter) && (!visibilityFilter || Number(visible(row))===Number(visibilityFilter)));
    root.querySelector('#content-result-count').textContent=`${filtered.length} élément(s) affiché(s) sur ${rows.length}`;
    list.innerHTML=filtered.map(row=>{
      const category=categories.find(c=>c.id===row.shop_category_id), variants=commerce.variants.filter(v=>v.product_id===row.id && v.active);
      return `<article class="commerce-catalogue-row"><div>${row.image_key?`<img src="/media/${encodeURIComponent(row.image_key).replace(/%2F/g,'/')}" width="88" height="88" alt="">`:''}</div><div><strong>${esc(row.name||labels[collection])}</strong>${category?`<small>${esc(category.name)}</small>`:''}<p class="commerce-row-badges">${["shop_products","shop_categories"].includes(collection)?`<span class="commerce-badge">${visible(row)?'Visible':'Masqué'}</span>`:""}${collection==='shop_products'?`<span class="commerce-badge">${variants.length?variants.length+' taille(s) configurée(s)':'Tarifs à configurer'}</span>`:''}</p>${row.active && collection==='shop_products' && category?.active===0?'<small>La catégorie est masquée.</small>':''}</div><div class="commerce-actions"><button type="button" class="commerce-secondary" data-edit-content="${row.id}">Modifier la fiche</button>${['shop_categories','shop_products'].includes(collection)?`<button type="button" class="commerce-secondary" data-toggle-content="${row.id}">${row.active?'Masquer':'Rendre visible'}</button><button type="button" class="commerce-secondary" data-delete-content="${row.id}">Supprimer</button>`:''}</div></article>`;
    }).join('')||'<p>Aucun élément pour ces filtres.</p>';
    list.querySelectorAll('[data-toggle-content]').forEach(button=>button.onclick=()=>run(button,async()=>{
      const row=rows.find(r=>r.id===Number(button.dataset.toggleContent));
      if(collection==='shop_products' && !row.active && !row.image_key)throw new Error('Ajoutez une photo avant de rendre cet article visible.');
      await call(`content/${collection}/${row.id}`,{method:'PUT',data:{active:row.active?0:1,...(collection==='shop_products'?{image_key:row.image_key}:{})}});
      notice(row.active?'Élément masqué.':'Élément rendu visible.');await load();
    }));
    list
      .querySelectorAll("[data-edit-content]")
      .forEach(
        (button) =>
          (button.onclick = () =>
            edit(
              rows.find((r) => r.id === Number(button.dataset.editContent)),
            )),
      );
    list.querySelectorAll("[data-delete-content]").forEach(
      (button) =>
        (button.onclick = () =>
          run(button, async () => {
            if (
              !confirm(
                "Supprimer cet élément du catalogue ? Les commandes passées conservent leurs articles figés.",
              )
            )
              return;
            await call(
              `content/${collection}/${button.dataset.deleteContent}`,
              { method: "DELETE" },
            );
            notice("Élément supprimé.");
            await load();
          })),
    );
  }
  function edit(row = {}) {
    const renderField = ([name, label, type, required]) => {
        const value =
          row[name] ?? (type === "checkbox" ? 1 : type === "number" ? 0 : "");
        if (type === "checkbox")
          return `<label class="commerce-check"><input type="checkbox" name="${name}" ${Number(value) === 1 ? "checked" : ""}><span>${label}</span></label>`;
        if (type === "textarea")
          return `<label class="wide">${label}<textarea name="${name}" rows="3" maxlength="10000">${esc(value)}</textarea></label>`;
        if (type === "category")
          return `<label>${label}<select name="${name}" required><option value="">Choisir…</option>${categories.map((c) => `<option value="${c.id}" ${String(value) === String(c.id) ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>`;
        if (["image", "pdf"].includes(type))
          return `<label class="wide">${label}<input name="${name}" value="${esc(value)}" maxlength="500" placeholder="Clé du fichier, ou chargez un nouveau fichier"><input type="file" data-content-upload="${name}" accept="${type === "pdf" ? "application/pdf" : "image/jpeg,image/png,image/webp,image/avif,image/gif"}"><small class="commerce-help">${type === "pdf" ? "PDF" : "Image JPG, PNG, WebP, AVIF ou GIF"} · 15 Mo maximum</small><span data-upload-status="${name}" role="status"></span></label>`;
        return `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${required ? "required" : ""} ${type === "number" ? 'min="0" step="1"' : 'maxlength="1000"'}></label>`;
      };
    const groups=[
      ['Article et photo',['name','shop_category_id','image_key']],
      ['Sur la carte de la boutique',['short_description','sizes','options','delivery_delay']],
      ['Dans la fenêtre Détails uniquement',['description']],
      ['Publication et mise en avant',['featured','highlighted','display_order','active']],
    ];
    const fields=collection==='shop_products'?groups.map(([title,names])=>`<fieldset class="commerce-editor-group wide"><legend>${title}</legend>${schemas[collection].filter(([name])=>names.includes(name)).map(renderField).join('')}</fieldset>`).join(''):schemas[collection].map(renderField).join('');
    editor.innerHTML = `<form id="content-form" class="commerce-form-grid commerce-card"><h3 class="wide">${row.id ? "Modifier" : "Ajouter"} — ${labels[collection]}</h3>${fields}${collection === "shop_products" ? `<label class="wide">Prix affiché — calculé depuis les tarifs de commande<input id="indicative-price" readonly value="${esc(row.price_label||'Tarif à configurer ci-dessous')}"></label>` : ""}${collection === "shop_products" ? '<p class="commerce-help wide">Une photo est nécessaire pour publier l’article. Les tailles, prix et options se règlent juste en dessous de cette fiche. Le texte court apparaît sur la carte ; la description complète est réservée aux détails. Mise en forme des descriptions : **gras**, *italique*, [bordeaux]texte[/bordeaux], [or]texte[/or].</p>' : ""}<div class="commerce-actions wide"><button type="submit">Enregistrer</button><button type="button" class="commerce-secondary" id="content-cancel">Annuler</button></div></form>${collection === "shop_products" ? '<div id="product-pricing"></div>' : ""}`;
    const form = editor.querySelector("form");
    if(collection==='shop_products') {
      const target=editor.querySelector('#product-pricing');
      if(row.id)renderVariants(target,call,notice,row.id,price=>{const input=editor.querySelector("#indicative-price");if(input)input.value=price||"Tarif à configurer ci-dessous";}).catch(error=>showError(errorNode,error));
      else target.innerHTML='<p class="commerce-message">Enregistrez d’abord l’article pour ajouter ses tailles, tarifs et options.</p>';
    }
    let uploading = 0;
    editor.querySelector("#content-cancel").onclick = () => {
      if (!uploading) editor.innerHTML = "";
    };
    form.querySelectorAll("[data-content-upload]").forEach(
      (input) =>
        (input.onchange = async () => {
          const file = input.files?.[0];
          if (!file) return;
          const field = input.dataset.contentUpload,
            status = form.querySelector(`[data-upload-status="${field}"]`);
          status.textContent = "Chargement…";
          uploading++;
          form.querySelector("button[type=submit]").disabled = true;
          try {
            if (file.size > 15_000_000)
              throw new Error("Le fichier dépasse 15 Mo.");
            const data = new FormData();
            data.append("file", file);
            const local = ["localhost", "127.0.0.1"].includes(
              location.hostname,
            );
            const response = await fetch("/admin-boutique/api/upload", {
              method: "POST",
              credentials: "same-origin",
              redirect: "error",
              headers: local
                ? { "x-admin-token": readStorage("fce-shop-local-token", "") }
                : {},
              body: data,
            });
            let result;
            try {
              result = await response.json();
            } catch {
              throw new Error(
                "Session expirée ou réponse illisible. Rechargez la page.",
              );
            }
            if (!response.ok)
              throw new Error(result.error || "Chargement impossible.");
            form.elements[field].value = result.key;
            status.textContent =
              "Fichier chargé. Enregistrez la fiche pour le publier.";
          } catch (error) {
            status.textContent = error.message;
          } finally {
            uploading--;
            form.querySelector("button[type=submit]").disabled = uploading > 0;
            input.value = "";
          }
        }),
    );
    form.onsubmit = (event) => {
      event.preventDefault();
      if (uploading || !form.reportValidity()) return;
      run(form.querySelector("button[type=submit]"), async () => {
        const values = {};
        for (const [name, , type] of schemas[collection])
          values[name] =
            type === "checkbox"
              ? form.elements[name].checked
                ? 1
                : 0
              : ["number", "category"].includes(type)
                ? Number(form.elements[name].value)
                : form.elements[name].value;
        if (["shop_products", "shop_categories"].includes(collection))
          values.slug = row.slug || slug(values.name);
        if (collection === "shop_products" && !values.image_key) {
          values.active = 0;
          values.featured = 0;
          values.highlighted = 0;
        }
        const saved=await call(`content/${collection}${row.id ? `/${row.id}` : ""}`, {
          method: row.id ? "PUT" : "POST",
          data: values,
        });
        notice("Catalogue enregistré.");
        await load();
        if(collection==='shop_products') {const current=rows.find(r=>r.id===(row.id||Number(saved.id)));if(current)edit(current);}
      });
    };
    editor.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  root.querySelector('#content-category')?.addEventListener('change',event=>{categoryFilter=event.target.value;renderList();});
  root.querySelector('#content-visibility')?.addEventListener('change',event=>{visibilityFilter=event.target.value;renderList();});
  root.querySelector('#content-add').onclick=()=>edit();
  await load();
}

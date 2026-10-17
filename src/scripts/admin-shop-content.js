import { esc, api, showError, readStorage } from "../../public/shop-common.js";
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
    ["short_description", "Accroche", "textarea"],
    ["description", "Description", "textarea"],
    ["price_label", "Prix indicatif affiché", "text"],
    ["price_details", "Détail des prix affichés", "textarea"],
    ["sizes", "Présentation des tailles", "textarea"],
    ["options", "Présentation des options", "textarea"],
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
  shop_settings: "Affichage et PDF",
  site_media: "Couverture de la boutique",
};
const slug = (value) =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
export async function renderContent(root, call, notice) {
  let collection = "shop_products",
    rows = [],
    categories = [];
  root.innerHTML = `<section class="commerce-card"><h2>Catalogue et présentation de la boutique</h2><p>Les articles et visuels sont gérés ici. Les tarifs d’encaissement exacts sont définis dans « Tailles et options ». L’affichage du catalogue peut être ouvert pendant que les paiements restent fermés.</p><div class="commerce-filters"><label>Gérer<select id="content-collection">${Object.entries(
    labels,
  )
    .map(
      ([key, label]) =>
        `<option value="${key}" ${key === collection ? "selected" : ""}>${label}</option>`,
    )
    .join(
      "",
    )}</select></label><button type="button" id="content-add">+ Ajouter</button></div><div id="content-list"></div><div id="content-editor"></div></section>`;
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
    document.querySelector("#content-add").hidden = [
      "shop_settings",
      "site_media",
    ].includes(collection);
    list.innerHTML =
      rows
        .map(
          (row) =>
            `<article class="commerce-cart-line"><div><strong>${esc(row.name || row.label || labels[collection])}</strong><small>${esc(row.price_label || row.description || row.alt_text || "")}${row.active === 0 ? " · Masqué" : ""}</small>${row.image_key ? `<img src="/media/${encodeURIComponent(row.image_key).replace(/%2F/g, "/")}" width="80" height="80" style="object-fit:contain" alt="">` : ""}</div><div class="commerce-actions"><button type="button" class="commerce-secondary" data-edit-content="${row.id}">Modifier</button>${["shop_categories", "shop_products"].includes(collection) ? `<button type="button" class="commerce-secondary" data-delete-content="${row.id}">Supprimer</button>` : ""}</div></article>`,
        )
        .join("") || "<p>Aucun élément. Ajoutez le premier.</p>";
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
    const fields = schemas[collection]
      .map(([name, label, type, required]) => {
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
      })
      .join("");
    editor.innerHTML = `<form id="content-form" class="commerce-form-grid commerce-card"><h3 class="wide">${row.id ? "Modifier" : "Ajouter"} — ${labels[collection]}</h3>${fields}${collection === "shop_products" ? '<p class="commerce-help wide">Une photo est nécessaire pour publier l’article. Les tarifs et choix vendables doivent aussi être configurés dans Tailles et options. Mise en forme des descriptions : **gras**, *italique*, [bordeaux]texte[/bordeaux], [or]texte[/or].</p>' : ""}<div class="commerce-actions wide"><button type="submit">Enregistrer</button><button type="button" class="commerce-secondary" id="content-cancel">Annuler</button></div></form>`;
    const form = editor.querySelector("form");
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
        await call(`content/${collection}${row.id ? `/${row.id}` : ""}`, {
          method: row.id ? "PUT" : "POST",
          data: values,
        });
        notice("Catalogue enregistré.");
        await load();
      });
    };
    editor.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  document.querySelector("#content-collection").onchange = (event) => {
    collection = event.target.value;
    run(null, load);
  };
  document.querySelector("#content-add").onclick = () => edit();
  await load();
}

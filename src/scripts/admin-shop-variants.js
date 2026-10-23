import { esc, showError, money } from "../../public/shop-common.js";
const field = (name, label, value, type = "text", required = false) =>
  `<label>${label}<input name="${name}" type="${type}" value="${esc(value ?? "")}" ${required ? "required" : ""} maxlength="500"></label>`;
async function action(button, run) {
  button.disabled = true;
  try {
    await run();
  } catch (error) {
    showError(document.querySelector("#admin-shop-message"), error);
  } finally {
    button.disabled = false;
  }
}
export async function renderVariants(
  root,
  call,
  notice,
  productId,
  onPriceChange = () => {},
  chosenMode = null,
) {
  const [cat, result] = await Promise.all([
    call("catalogue"),
    call("suppliers"),
  ]);
  const variants = cat.variants.filter(
      (v) => v.product_id === Number(productId),
    ),
    options = cat.options.filter((o) => o.product_id === Number(productId));
  const active = variants.filter((v) => v.active),
    activeOptions = options.filter((o) => o.active);
  const defaultSimple =
    (!variants.length && !options.length) ||
    (active.length === 1 &&
      !active[0].size &&
      !active[0].color &&
      !activeOptions.length);
  let simple = chosenMode ?? defaultSimple;
  const priceLabel = active.length
    ? new Set(active.map((v) => v.price_cents)).size > 1
      ? `De ${money(Math.min(...active.map((v) => v.price_cents)))} à ${money(Math.max(...active.map((v) => v.price_cents)))}`
      : money(active[0].price_cents)
    : "Tailles et tarif à configurer";
  onPriceChange(active.length ? priceLabel : "");
  root.innerHTML = `<section class="commerce-card"><h3>Prix et choix de cet article</h3><p class="commerce-message">Prix affiché dans la boutique : <strong id="published-variant-price">${esc(priceLabel)}</strong><br>Calculé automatiquement à partir des choix actifs, hors options.</p><div class="commerce-mode" role="group" aria-label="Type d’article"><button type="button" data-product-mode="simple" aria-pressed="${simple}">Article simple</button><button type="button" data-product-mode="choices" aria-pressed="${!simple}">Avec tailles ou personnalisation</button></div><p id="mode-description"></p><div id="catalogue-editor"></div></section>`;
  const suppliers = result.suppliers;
  const reload = (mode) =>
    renderVariants(root, call, notice, productId, onPriceChange, mode);
  const supplierField = (v) =>
    `<label>Fournisseur<select name="supplier_id" required><option value="">Choisir un fournisseur</option>${suppliers
      .filter((s) => s.active || s.id === v.supplier_id)
      .map(
        (s) =>
          `<option value="${esc(s.id)}" ${s.id === v.supplier_id ? "selected" : ""}>${esc(s.name)}${s.active ? "" : " (désactivé)"}</option>`,
      )
      .join(
        "",
      )}</select><small><a href="/admin-boutique/fournisseurs/">Gérer les fournisseurs →</a></small></label>`;
  function render() {
    root
      .querySelectorAll("[data-product-mode]")
      .forEach((b) =>
        b.setAttribute(
          "aria-pressed",
          String((b.dataset.productMode === "simple") === simple),
        ),
      );
    root.querySelector("#mode-description").textContent = simple
      ? "Un prix et un fournisseur. Aucun choix de taille ni option à demander au client."
      : "Définissez les tailles et leurs prix. Ajoutez des options uniquement si cet article peut être personnalisé.";
    root.querySelector("#catalogue-editor").innerHTML = simple
      ? '<form id="variant-form" class="commerce-form-grid"></form>'
      : `<section><h4>Tailles et modèles</h4><div class="commerce-table-wrap"><table><thead><tr><th>Modèle</th><th>Taille</th><th>Tarif FCE</th><th>Prix catalogue</th><th>Tarif coach</th><th>Fournisseur</th><th>Visibilité</th><th></th></tr></thead><tbody>${variants.map((v) => `<tr><td>${esc(v.label)}</td><td>${esc(v.size)}</td><td><strong>${money(v.price_cents)}</strong></td><td>${v.catalogue_price_cents?money(v.catalogue_price_cents):"—"}</td><td>${v.coach_price_cents?money(v.coach_price_cents):"Tarif FCE"}</td><td>${esc(suppliers.find((s) => s.id === v.supplier_id)?.name || v.supplier || "")}</td><td>${v.active ? "Disponible" : "Masqué"}</td><td><button type="button" data-edit-variant="${esc(v.id)}">Modifier</button></td></tr>`).join("") || '<tr><td colspan="8">Aucune taille ni modèle.</td></tr>'}</tbody></table></div><p><button type="button" id="add-product-variant">+ Ajouter une taille / un modèle</button></p><form id="variant-form" class="commerce-form-grid" hidden></form></section><section class="commerce-personalizations"><h4>Personnalisations</h4><div class="commerce-table-wrap"><table><thead><tr><th>Personnalisation</th><th>Supplément</th><th>Saisie client</th><th>Visibilité</th><th></th></tr></thead><tbody>${options.map((o) => `<tr><td>${esc(o.label)}</td><td>${o.price_cents ? money(o.price_cents) : "Inclus"}</td><td>${o.requires_text ? `Texte · ${o.max_length} caractères maximum` : "Sans texte"}</td><td>${o.active ? "Disponible" : "Masquée"}</td><td><button type="button" data-edit-personalization="${esc(o.id)}">Modifier</button></td></tr>`).join("") || '<tr><td colspan="5">Aucune personnalisation pour cet article.</td></tr>'}</tbody></table></div><p><button type="button" id="add-product-option">+ Ajouter une personnalisation</button></p><form id="option-form" class="commerce-form-grid" hidden></form></section>`;
    function variantForm(selectedId = null) {
      const v = (simple
        ? active[0] || variants[0]
        : variants.find((v) => v.id === selectedId)) || {
        label: "",
        size: "",
        color: "",
        sku: "",
        supplier_id: "",
        price_cents: "",
        active: 1,
      };
      const form = root.querySelector("#variant-form");
      form.hidden = false;
      form.innerHTML = `${simple ? "" : field("label", "Libellé du choix (ex. Adulte M)", v.label, "text", true) + field("size", "Taille", v.size)}<label>Tarif FCE (€) — prix de vente appliqué<input name="price" type="number" min="0.01" max="10000" step="0.01" value="${v.price_cents ? v.price_cents / 100 : ""}" placeholder="Ex. 25,00" required></label><label>Prix catalogue (€) — facultatif<input name="catalogue_price" type="number" min="0.01" max="10000" step="0.01" value="${v.catalogue_price_cents?v.catalogue_price_cents/100:''}" placeholder="Non renseigné"><small>Prix public du catalogue fournisseur. Ne s’affiche pas s’il est vide.</small></label><label>Tarif coach (€) — facultatif<input name="coach_price" type="number" min="0.01" max="10000" step="0.01" value="${v.coach_price_cents?v.coach_price_cents/100:''}" placeholder="Tarif FCE par défaut"><small>Visible uniquement après saisie du code coach. Les options gardent leur supplément habituel.</small></label>${supplierField(v)}<label class="commerce-check wide"><input name="active" type="checkbox" ${v.active ? "checked" : ""}><span>Disponible à la vente</span></label>${simple && (active.length > 1 || activeOptions.length) ? '<p class="commerce-help wide">Enregistrer en mode simple désactivera les autres tailles et les options. Les commandes passées restent inchangées.</p>' : ""}<div class="wide"><button type="submit">${simple ? "Enregistrer le prix et le fournisseur" : "Enregistrer cette taille / ce modèle"}</button></div>`;
      form.onsubmit = (event) => {
        event.preventDefault();
        if (!form.reportValidity()) return;
        action(form.querySelector("[type=submit]"), async () => {
          const values = Object.fromEntries(new FormData(form));
          await call("variants", {
            method: "PUT",
            data: {
              ...values,
              id: v.id,
              product_id: Number(productId),
              simple,
              label: simple ? "Taille unique" : values.label,
              size: simple ? "" : values.size,
              price_cents: Math.round(Number(values.price) * 100),
              catalogue_price_cents:values.catalogue_price?Math.round(Number(values.catalogue_price)*100):null,
              coach_price_cents:values.coach_price?Math.round(Number(values.coach_price)*100):null,
              active: form.elements.active.checked,
            },
          });
          await reload(simple);
          notice(
            "Article enregistré. Son prix affiché est synchronisé avec son tarif de commande.",
          );
        });
      };
    }
    function optionForm(option = null) {
      const form = root.querySelector("#option-form");
      form.hidden = false;
      const o = option || {
        label: "",
        price_cents: 0,
        max_length: 4,
        requires_text: 0,
        active: 1,
      };
      form.innerHTML = `${field("label", "Nom de la personnalisation", o.label, "text", true)}<label>Supplément en euros<input name="price" type="number" min="0" max="1000" step="0.01" value="${o.price_cents / 100}" required></label><label>Saisie demandée<select name="requires_text"><option value="0" ${!o.requires_text ? "selected" : ""}>Aucun texte</option><option value="1" ${o.requires_text ? "selected" : ""}>Texte de personnalisation</option></select></label><label id="option-max-length">Nombre de caractères maximum<input name="max_length" type="number" min="1" max="40" value="${o.max_length}" required></label><label>Visibilité<select name="active"><option value="1" ${o.active ? "selected" : ""}>Disponible</option><option value="0" ${!o.active ? "selected" : ""}>Masquée</option></select></label><div class="wide"><button type="submit">Enregistrer la personnalisation</button></div>`;
      const textField = () => {
        form.querySelector("#option-max-length").hidden =
          form.elements.requires_text.value !== "1";
      };
      form.elements.requires_text.onchange = textField;
      textField();
      form.onsubmit = (event) => {
        event.preventDefault();
        if (!form.reportValidity()) return;
        action(form.querySelector("[type=submit]"), async () => {
          const values = Object.fromEntries(new FormData(form));
          await call("options", {
            method: "PUT",
            data: {
              ...values,
              id: o.id,
              product_id: Number(productId),
              price_cents: Math.round(Number(values.price) * 100),
              max_length: Number(values.max_length),
              active: form.elements.active.value === "1",
              requires_text: form.elements.requires_text.value === "1",
            },
          });
          await reload(false);
          notice("Option enregistrée.");
        });
      };
    }
    if (!simple) {
      root
        .querySelectorAll("[data-edit-variant]")
        .forEach((b) => (b.onclick = () => variantForm(b.dataset.editVariant)));
      root.querySelector("#add-product-variant").onclick = () => variantForm();
      root
        .querySelectorAll("[data-edit-personalization]")
        .forEach(
          (b) =>
            (b.onclick = () =>
              optionForm(
                options.find((o) => o.id === b.dataset.editPersonalization),
              )),
        );
      root.querySelector("#add-product-option").onclick = () => optionForm();
    } else variantForm();
  }
  root.querySelectorAll("[data-product-mode]").forEach(
    (b) =>
      (b.onclick = () => {
        simple = b.dataset.productMode === "simple";
        render();
      }),
  );
  render();
}

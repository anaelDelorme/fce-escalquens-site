import { renderContent } from "./admin-shop-content.js";
import {
  api,
  esc,
  money,
  date,
  showError,
  itemTable,
  paymentLabels,
  fulfillmentLabels,
  readStorage,
} from "../../public/shop-common.js";
const root = document.querySelector("#admin-shop-content"),
  message = document.querySelector("#admin-shop-message");
let catalogueProductId = null;
let tab = "orders",
  selected = null,
  config = null,
  page = 0,
  filters = { q: "", payment: "", fulfillment: "" };
const local = ["localhost", "127.0.0.1"].includes(location.hostname);
const localHeaders = () =>
  local ? { "x-admin-token": readStorage("fce-shop-local-token", "") } : {};
const call = (path, options = {}) =>
  api(`/admin-boutique/api/${path}`, { ...options, headers: localHeaders() });
const stateOptions = (labels, value) =>
  Object.entries(labels)
    .map(
      ([key, label]) =>
        `<option value="${key}" ${key === value ? "selected" : ""}>${esc(label)}</option>`,
    )
    .join("");
const field = (name, label, value, type = "text", required = false) =>
  `<label>${label}<input name="${name}" type="${type}" value="${esc(value ?? "")}" ${required ? "required" : ""} maxlength="${name === "collection_instructions" ? 1000 : 500}"></label>`;
const notice = (text) => {
  message.textContent = text;
  message.className = "commerce-message commerce-success";
};
async function action(button, run) {
  button.disabled = true;
  message.textContent = "";
  try {
    await run();
  } catch (error) {
    showError(message, error);
  } finally {
    button.disabled = false;
  }
}
async function loadConfig() {
  config = await call("settings");
  document.querySelector("#shop-environment").innerHTML =
    `<p class="commerce-environment">${config.environment === "sandbox" ? "PRÉPRODUCTION / SANDBOX — aucun paiement réel" : "PRODUCTION — paiements réels"} · Base commandes séparée de celle du site</p>`;
}
async function orders() {
  root.innerHTML = `<form id="order-filters" class="commerce-filters"><label>Rechercher<input name="q" value="${esc(filters.q)}" placeholder="Référence, nom ou e-mail"></label><label>Paiement<select name="payment"><option value="">Tous</option>${stateOptions(paymentLabels, filters.payment)}</select></label><label>Préparation<select name="fulfillment"><option value="">Toutes</option>${stateOptions(fulfillmentLabels, filters.fulfillment)}</select></label><button type="submit">Rechercher</button></form><div id="orders-list" class="commerce-card"><p>Chargement des commandes…</p></div><div id="order-detail"></div>`;
  document.querySelector("#order-filters").onsubmit = (event) => {
    event.preventDefault();
    filters = Object.fromEntries(new FormData(event.currentTarget));
    page = 0;
    loadList().catch((e) => showError(message, e));
  };
  await loadList();
  if (selected) await orderDetail(selected);
}
async function loadList() {
  const result = await call(
    `orders?${new URLSearchParams({ ...filters, page })}`,
  );
  document.querySelector("#orders-list").innerHTML =
    `${result.orders.length ? `<div class="commerce-table-wrap"><table><thead><tr><th>Commande</th><th>Client</th><th>Montant</th><th>Paiement</th><th>Préparation</th></tr></thead><tbody>${result.orders.map((o) => `<tr><td><a href="#commande" data-order="${esc(o.id)}">${esc(o.reference)}</a><small>${date(o.created_at)}</small></td><td>${esc(o.first_name)} ${esc(o.last_name)}<small>${esc(o.email)} · ${esc(o.team)}</small></td><td>${money(o.total_cents)}</td><td><span class="commerce-badge ${o.payment_status === "paid" ? "is-paid" : ""}">${esc(paymentLabels[o.payment_status] || o.payment_status)}</span></td><td>${esc(fulfillmentLabels[o.fulfillment] || o.fulfillment)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="commerce-empty">Aucune commande ne correspond à ces critères.</p>'}<div class="commerce-actions"><button id="previous-orders" type="button" ${page === 0 ? "disabled" : ""}>← Précédentes</button><span>Page ${page + 1}</span><button id="next-orders" type="button" ${!result.has_more ? "disabled" : ""}>Suivantes →</button></div>`;
  document.querySelectorAll("[data-order]").forEach(
    (a) =>
      (a.onclick = (event) => {
        event.preventDefault();
        selected = a.dataset.order;
        orderDetail(selected).catch((e) => showError(message, e));
      }),
  );
  for (const [id, step] of [
    ["previous-orders", -1],
    ["next-orders", 1],
  ])
    document.querySelector(`#${id}`).onclick = () => {
      page += step;
      loadList().catch((e) => showError(message, e));
    };
}
async function orderDetail(id) {
  const data = await call(`orders/${id}`),
    o = data.order;
  selected = id;
  document.querySelector("#order-detail").innerHTML =
    `<section class="commerce-card commerce-admin-detail" id="commande"><p class="eyebrow">${esc(o.reference)}</p><h2>${esc(o.first_name)} ${esc(o.last_name)}</h2><p>${esc(o.email)} · ${esc(o.phone)}<br>${esc(o.licensed_name)} · ${esc(o.team)}<br>Remise ${o.delivery_method === "coach" ? "par le coach" : "sur rendez-vous au club"}</p><div class="commerce-badges"><span class="commerce-badge">${esc(paymentLabels[o.payment_status] || o.payment_status)}</span><span class="commerce-badge">${esc(fulfillmentLabels[o.fulfillment])}</span><span class="commerce-badge">${money(o.total_cents)}</span></div><div class="commerce-actions">${o.payment_status === "paid" && o.fulfillment !== "cancelled" ? `<button type="button" id="purchase-order">Éditer le bon fournisseur individuel ↗</button>` : ""}<button type="button" class="commerce-secondary" data-order-action="reconcile">Vérifier le paiement HelloAsso</button><button type="button" class="commerce-secondary" data-order-action="resend">Renvoyer le suivi / relancer les mails en échec</button></div><p class="commerce-help">Un bon par commande client. Son édition ne marque pas la commande comme envoyée au fournisseur. Les remboursements s’effectuent dans HelloAsso ; ils sont ensuite synchronisés ici.</p><form id="fulfillment-form">${itemTable(data.items, { admin: true })}<div class="commerce-form-grid" style="margin-top:24px"><label>État de préparation<select name="fulfillment">${stateOptions(fulfillmentLabels, o.fulfillment)}</select></label><label>Message destiné au client<textarea name="public_note" maxlength="1000" rows="3">${esc(o.public_note)}</textarea></label><label class="wide">Notes internes — jamais affichées au client<textarea name="internal_note" maxlength="2000" rows="3">${esc(o.internal_note)}</textarea></label></div><p class="commerce-help">Les quantités reçues et remises doivent correspondre à l’état choisi. L’annulation ne déclenche pas de remboursement automatique. Une mise à jour envoie un mail au client.</p><button type="submit">Enregistrer et informer le client →</button></form><div class="commerce-split"><div><h3>Historique</h3><ul class="commerce-timeline">${data.events.map((e) => `<li>${esc(e.message)}<small>${date(e.created_at)} · ${esc(e.actor)}</small></li>`).join("")}</ul></div><div><h3>Envois de mails</h3>${data.mails.map((m) => `<div class="commerce-mail"><strong>${esc(m.kind)}</strong> · ${esc(m.status)} · ${m.attempts} tentative(s)<small>${m.sent_at ? date(m.sent_at) : esc(m.last_error)}</small></div>`).join("") || "<p>Aucun envoi.</p>"}</div></div><details><summary>Tentatives de paiement et récupération après incident</summary>${data.attempts.map((a) => `<div class="commerce-card"><p>Tentative ${esc(a.id)}<br>État : ${esc(a.state)} · Intention HelloAsso : ${a.intent_id || "non reçue"}<br>${esc(a.last_error)} · ${date(a.created_at)}</p>${!a.intent_id && ["uncertain", "creating"].includes(a.state) ? `<form data-resolve="${esc(a.id)}"><p>Recherchez la demande dans HelloAsso avec la référence de commande. Renseignez son identifiant : l’API vérifiera son rattachement avant toute synchronisation.</p><label>Identifiant de l’intention HelloAsso<input name="intent_id" type="number" min="1" required></label><button type="submit">Rattacher et vérifier</button></form>` : ""}</div>`).join("")}</details><details><summary>Sécurité du lien de suivi</summary><p>Révoquer le lien rend l’ancien inutilisable et envoie un nouveau lien à l’adresse du client.</p><button class="commerce-secondary" type="button" data-order-action="rotate-link">Révoquer et renvoyer le lien</button></details><details><summary>CGV acceptées — ${esc(o.terms_version)}</summary><pre class="commerce-terms">${esc(o.terms_snapshot)}</pre></details></section>`;
  document.querySelector("#fulfillment-form").onsubmit = (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    action(form.querySelector("button[type=submit]"), async () => {
      await call(`orders/${id}`, {
        method: "PATCH",
        data: {
          version: o.version,
          fulfillment: form.elements.fulfillment.value,
          public_note: form.elements.public_note.value,
          internal_note: form.elements.internal_note.value,
          items: data.items.map((i) => ({
            id: i.id,
            received: Number(form.elements[`received:${i.id}`].value),
            delivered: Number(form.elements[`delivered:${i.id}`].value),
          })),
        },
      });
      notice("Commande mise à jour. Le mail est placé dans la file d’envoi.");
      await loadList();
      await orderDetail(id);
    });
  };
  document.querySelectorAll("[data-order-action]").forEach(
    (button) =>
      (button.onclick = () =>
        action(button, async () => {
          if (
            button.dataset.orderAction === "rotate-link" &&
            !confirm(
              "Révoquer le lien actuel et envoyer un nouveau lien au client ?",
            )
          )
            return;
          await call(`orders/${id}/${button.dataset.orderAction}`, {
            method: "POST",
            data: {},
          });
          notice("Action effectuée.");
          await orderDetail(id);
          await loadList();
        })),
  );
  document
    .querySelector("#purchase-order")
    ?.addEventListener("click", (event) =>
      action(event.target, async () => {
        const result = await fetch(
          `/admin-boutique/api/orders/${id}/purchase-order`,
          { headers: localHeaders(), redirect: "error" },
        );
        if (!result.ok) {
          let data;
          try {
            data = await result.json();
          } catch {}
          throw new Error(data?.error || "Le bon ne peut pas être édité.");
        }
        const blob = new Blob([await result.text()], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `bon-${o.reference}.html`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        notice(
          "Bon individuel téléchargé. Ouvrez-le puis imprimez-le en PDF si nécessaire.",
        );
      }),
    );
  document.querySelectorAll("[data-resolve]").forEach(
    (form) =>
      (form.onsubmit = (event) => {
        event.preventDefault();
        action(form.querySelector("button"), async () => {
          await call(`orders/${id}/resolve-attempt`, {
            method: "POST",
            data: {
              attempt_id: form.dataset.resolve,
              intent_id: Number(form.elements.intent_id.value),
            },
          });
          notice("Intention vérifiée et rattachée.");
          await orderDetail(id);
        });
      }),
  );
}
async function settingsView() {
  await loadConfig();
  const s = config.settings,
    c = config.configuration;
  root.innerHTML = `<section class="commerce-card"><h2>Paiement et envoi des confirmations</h2><p>Environnement imposé par le déploiement : <strong>${config.environment === "sandbox" ? "HelloAsso Sandbox" : "HelloAsso Production"}</strong>. Le navigateur ne peut pas le modifier.</p><div class="commerce-stats"><div>API HelloAsso<strong>${c.credentials ? "Configurée" : "À configurer"}</strong></div><div>Clé de suivi<strong>${c.tracking ? "Configurée" : "À configurer"}</strong></div><div>Transport mail<strong>${esc(c.mail_provider || "Absent")}</strong></div><div>Envoi mail<strong>${c.mail_ready ? "Configuré" : "À configurer"}</strong></div></div><p>Origine : ${esc(config.origin || "non définie")}<br>Expéditeur : ${esc(c.mail_from || "non défini")}<br>Destinataire de test : ${esc(c.mail_test_to || "non défini")}<br>Signature webhook partenaire : ${c.webhook_signature ? "activée" : "non configurée — vérification systématique par l’API OAuth"}</p><p class="commerce-help">Les clés API et la clé de suivi sont des secrets Worker. Elles ne sont jamais stockées dans les paramètres D1 ni renvoyées au navigateur. Configuration dans la documentation du dépôt : docs/BOUTIQUE.md.</p><form id="settings-form" class="commerce-form-grid">${field("organization_slug", "Identifiant de l’association HelloAsso (slug)", s.organization_slug)}${field("contact_email", "E-mail du service boutique", s.contact_email, "email", true)}${field("seller_name", "Nom du vendeur", s.seller_name, "text", true)}${field("seller_id", "RNA / SIRET et mentions fiscales applicables", s.seller_id)}${field("seller_address", "Adresse du vendeur", s.seller_address)}${field("seller_phone", "Téléphone de contact", s.seller_phone)}${field("collection_address", "Adresse du retrait sur rendez-vous", s.collection_address)}${field("delivery_days", "Délai maximal de remise après paiement (jours)", s.delivery_days, "number", true)}${field("collection_instructions", "Instructions de rendez-vous", s.collection_instructions)}${field("mediator_name", "Médiateur de la consommation compétent", s.mediator_name)}${field("mediator_url", "Site du médiateur (https://)", s.mediator_url, "url")}<label class="commerce-check wide"><input type="checkbox" name="legal_ready" ${s.legal_ready ? "checked" : ""}><span>Les coordonnées, conditions de vente, délais, garanties et informations RGPD ont été vérifiés par le club.</span></label><label class="commerce-check wide"><input type="checkbox" name="checkout_enabled" ${s.checkout_enabled ? "checked" : ""}><span>Ouvrir la prise de commandes et le paiement ${config.environment === "production" ? "réel" : "de test"}. Les variantes doivent avoir été vérifiées et l’affichage boutique activé dans Catalogue et visuels.</span></label><div class="wide"><button type="submit">Enregistrer les paramètres</button></div></form></section>`;
  document.querySelector("#settings-form").onsubmit = (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    action(form.querySelector("button"), async () => {
      const values = Object.fromEntries(new FormData(form));
      await call("settings", {
        method: "PUT",
        data: {
          ...values,
          version: s.version,
          delivery_days: Number(values.delivery_days),
          legal_ready: form.elements.legal_ready.checked,
          checkout_enabled: form.elements.checkout_enabled.checked,
        },
      });
      notice("Paramètres enregistrés pour cet environnement.");
      await settingsView();
    });
  };
}
async function catalogueView() {
  const cat = await call("catalogue");
  root.innerHTML = `<section class="commerce-card"><h2>Les articles restent ceux du site.</h2><p>Configurez ici les variantes vendables et leurs prix exacts. Les descriptions, catégories et photos sont gérées dans l’onglet Catalogue et visuels. Un article sans variante active ne peut pas être commandé. Créez une variante par taille et indiquez son prix en euros (ex. 6 ans : 20 €, M : 25 €). La boutique affiche automatiquement « À partir de » si les prix diffèrent. Les textes historiques « dès… » ne sont jamais convertis en tarifs de paiement.</p><label>Choisir un article<select id="catalogue-product">${cat.products.map((p) => `<option value="${p.id}">${esc(p.name)}${p.active ? "" : " (masqué)"}</option>`).join("")}</select></label><div id="catalogue-editor"></div></section>`;
  if(catalogueProductId && cat.products.some(p=>p.id===catalogueProductId))document.querySelector("#catalogue-product").value=catalogueProductId;
  const render = () => {
    const id = Number(document.querySelector("#catalogue-product").value),
      variants = cat.variants.filter((v) => v.product_id === id),
      options = cat.options.filter((o) => o.product_id === id);
    catalogueProductId=id;
    document.querySelector("#catalogue-editor").innerHTML =
      `<div class="commerce-split"><section><h3>Tailles / modèles</h3><label>Modifier une variante<select id="variant-select"><option value="">+ Nouvelle variante</option>${variants.map((v) => `<option value="${esc(v.id)}">${esc(v.label)} · ${money(v.price_cents)} ${v.active ? "" : "(inactive)"}</option>`).join("")}</select></label><form id="variant-form" class="commerce-form-grid" style="margin-top:20px"></form></section><section><h3>Options et personnalisation</h3><label>Modifier une option<select id="option-select"><option value="">+ Nouvelle option</option>${options.map((o) => `<option value="${esc(o.id)}">${esc(o.label)} · ${money(o.price_cents)} ${o.active ? "" : "(inactive)"}</option>`).join("")}</select></label><form id="option-form" class="commerce-form-grid" style="margin-top:20px"></form></section></div>`;
    const variantForm = () => {
      const v = variants.find(
        (v) => v.id === document.querySelector("#variant-select").value,
      ) || {
        label: "",
        size: "",
        color: "",
        sku: "",
        supplier: "Intersport / Kappa",
        price_cents: 0,
        active: 1,
      };
      const form = document.querySelector("#variant-form");
      form.innerHTML = `${field("label", "Libellé du choix (ex. Adulte M)", v.label, "text", true)}${field("size", "Taille exacte (ou vide si unique)", v.size)}${field("color", "Couleur", v.color)}${field("sku", "Référence fournisseur", v.sku, "text", true)}${field("supplier", "Fournisseur", v.supplier, "text", true)}<label>Prix en euros<input name="price" type="number" min="0.01" max="10000" step="0.01" value="${v.price_cents / 100}" required></label><label class="commerce-check wide"><input name="active" type="checkbox" ${v.active ? "checked" : ""}>Variante disponible à la vente</label><div class="wide"><button type="submit">Enregistrer la variante</button></div>`;
      form.onsubmit = (event) => {
        event.preventDefault();
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
          await catalogueView();
        });
      };
    };
    const optionForm = () => {
      const o = options.find(
        (o) => o.id === document.querySelector("#option-select").value,
      ) || {
        label: "",
        price_cents: 0,
        max_length: 4,
        requires_text: 1,
        active: 1,
      };
      const form = document.querySelector("#option-form");
      form.innerHTML = `${field("label", "Nom de l’option (ex. Initiales)", o.label, "text", true)}<label>Supplément en euros<input name="price" type="number" min="0" max="1000" step="0.01" value="${o.price_cents / 100}" required></label>${field("max_length", "Longueur maximale du texte", o.max_length, "number", true)}<label class="commerce-check"><input name="requires_text" type="checkbox" ${o.requires_text ? "checked" : ""}>Texte de personnalisation obligatoire</label><label class="commerce-check wide"><input name="active" type="checkbox" ${o.active ? "checked" : ""}>Option disponible</label><div class="wide"><button type="submit">Enregistrer l’option</button></div>`;
      form.onsubmit = (event) => {
        event.preventDefault();
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
          await catalogueView();
        });
      };
    };
    document.querySelector("#variant-select").onchange = variantForm;
    document.querySelector("#option-select").onchange = optionForm;
    variantForm();
    optionForm();
  };
  document.querySelector("#catalogue-product").onchange = render;
  if (cat.products.length) render();
}
async function adminsView() {
  const data=await call("admins");
  root.innerHTML=`<section class="commerce-card"><h2>Les responsables de la boutique</h2><p>Ces droits sont indépendants de l’administration du site. Chaque adresse doit aussi être autorisée dans votre application Cloudflare Access boutique (règle e-mail + PIN).</p><div class="commerce-table-wrap"><table><thead><tr><th>Responsable</th><th>E-mail</th><th>Accès</th><th>Action</th></tr></thead><tbody>${data.admins.map(a=>`<tr><td>${esc(a.name)}</td><td>${esc(a.email)}${a.email.toLowerCase()===data.actor.toLowerCase()?' (vous)':''}</td><td>${a.active?'Actif':'Désactivé'}</td><td><button type="button" class="commerce-secondary" data-admin="${esc(a.email)}">Modifier</button></td></tr>`).join('')}</tbody></table></div><h3 id="admin-editor-title">Ajouter un responsable</h3><form id="shop-admin-form" class="commerce-form-grid"><label>Adresse e-mail<input name="email" type="email" autocomplete="off" maxlength="254" required></label><label>Nom du responsable<input name="name" maxlength="120" required></label><label class="commerce-check wide"><input name="active" type="checkbox" checked><span>Autoriser la gestion boutique</span></label><div class="wide"><button type="submit">Enregistrer l’accès</button> <button type="button" id="new-shop-admin" class="commerce-secondary">Nouvel administrateur</button></div></form><p class="commerce-help">Désactiver un responsable bloque ses prochaines actions même si sa session Cloudflare est encore ouverte. Votre propre accès ne peut pas être désactivé depuis cette session.</p></section>`;
  const form=document.querySelector('#shop-admin-form');
  document.querySelectorAll('[data-admin]').forEach(button=>button.onclick=()=>{const a=data.admins.find(a=>a.email===button.dataset.admin);form.elements.email.value=a.email;form.elements.email.readOnly=true;form.elements.name.value=a.name;form.elements.active.checked=!!a.active;document.querySelector('#admin-editor-title').textContent='Modifier un responsable';form.elements.name.focus();});
  document.querySelector('#new-shop-admin').onclick=()=>{form.reset();form.elements.email.readOnly=false;document.querySelector('#admin-editor-title').textContent='Ajouter un responsable';form.elements.email.focus();};
  form.onsubmit=event=>{event.preventDefault();if(!form.reportValidity())return;action(form.querySelector('[type=submit]'),async()=>{await call('admins',{method:'PUT',data:{email:form.elements.email.value,name:form.elements.name.value,active:form.elements.active.checked}});await adminsView();notice('Droits enregistrés. Vérifiez aussi la règle Cloudflare Access pour cette adresse.');});};
}
async function surveys() {
  const data = await call("surveys"),
    a = data.aggregate;
  root.innerHTML = `<section><div class="commerce-stats"><div class="commerce-card">Réponses<strong>${a.count}</strong></div>${[
    ["ease", "Facilité de commande"],
    ["catalogue", "Qualité du catalogue"],
    ["overall", "Expérience globale"],
  ]
    .map(
      ([key, label]) =>
        `<div class="commerce-card">${label}<strong>${a[key] ? Number(a[key]).toFixed(1) + " / 5" : "—"}</strong></div>`,
    )
    .join(
      "",
    )}</div><div class="commerce-card"><h2>Les derniers avis</h2><p class="commerce-help">Avis facultatifs, réservés aux responsables et supprimés après 12 mois. Aucun avis n’est publié sur le site.</p>${data.responses.map((s) => `<article class="commerce-mail"><b>${esc(s.reference)}</b> · ${date(s.created_at)}<p>Commande ${s.ease}/5 · Catalogue ${s.catalogue}/5 · Ensemble ${s.overall}/5</p>${s.comment ? `<p>${esc(s.comment)}</p>` : ""}</article>`).join("") || "<p>Aucun avis pour le moment.</p>"}</div></section>`;
}
async function render() {
  message.textContent = "Chargement…";
  try {
    await {
      orders,
      content: () => renderContent(root, call, notice),
      catalogue: catalogueView,
      settings: settingsView,
      surveys,
      admins: adminsView,
    }[tab]();
    message.textContent = "";
  } catch (error) {
    showError(message, error);
  }
}
document.querySelectorAll("[data-tab]").forEach(
  (button) =>
    (button.onclick = () => {
      tab = button.dataset.tab;
      document
        .querySelectorAll("[data-tab]")
        .forEach((b) => b.setAttribute("aria-selected", String(b === button)));
      render();
    }),
);
if (local && !readStorage("fce-shop-local-token")) {
  const value = prompt("Jeton de développement local (DEV_ADMIN_TOKEN) :");
  if (value)
    sessionStorage.setItem("fce-shop-local-token", JSON.stringify(value));
}
(async () => {
  try { await loadConfig(); await render(); }
  catch (error) { showError(message, error); }
})();

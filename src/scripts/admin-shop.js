import { renderContent } from "./admin-shop-content.js";
import { renderSuppliers } from "./admin-shop-suppliers.js";
import {
  api,
  esc,
  money,
  date,
  showError,
  itemTable,
  mailStatusList,
  mailQueueSummary,
  paymentLabels,
  fulfillmentLabels,
  readStorage,
} from "../../public/shop-common.js";
const root = document.querySelector("#admin-shop-content"),
  message = document.querySelector("#admin-shop-message");
let listVersion=0;
let tab = document.querySelector(".commerce-admin").dataset.page || "orders",
  selected = /^[a-f0-9-]{36}$/.test(new URLSearchParams(location.search).get("commande")||"")?new URLSearchParams(location.search).get("commande"):null,
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
  button.setAttribute("aria-busy","true");
  message.textContent = "";
  try {
    await run();
  } catch (error) {
    showError(message, error);
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }
}
async function loadConfig() {
  config = await call("settings");
  document.querySelector("#shop-environment").innerHTML =
    `<p class="commerce-environment">${config.environment === "sandbox" ? "PRÉPRODUCTION / SANDBOX — aucun paiement réel" : "PRODUCTION — paiements réels"}</p>`;
}
async function orders() {
  root.innerHTML = `<div class="commerce-quick-filters" role="group" aria-label="Raccourcis commandes"><button type="button" data-order-filter="all">Toutes les commandes</button><button type="button" data-order-filter="prepare">Payées, à préparer</button><button type="button" data-order-filter="ready">À remettre</button></div><form id="order-filters" class="commerce-filters"><label>Rechercher<input name="q" value="${esc(filters.q)}" placeholder="Référence, nom ou e-mail"></label><label>Paiement<select name="payment"><option value="">Tous</option>${stateOptions(paymentLabels, filters.payment)}</select></label><label>Préparation<select name="fulfillment"><option value="">Toutes</option>${stateOptions(fulfillmentLabels, filters.fulfillment)}</select></label><button type="submit">Appliquer</button><button type="button" id="reset-order-filters" class="commerce-secondary">Effacer</button></form><div id="orders-list" class="commerce-card"><p>Chargement des commandes…</p></div><div id="order-detail"></div>`;
  document.querySelector("#order-filters").onsubmit = (event) => {
    event.preventDefault();
    filters = Object.fromEntries(new FormData(event.currentTarget));
    page = 0;
    loadList().catch((e) => showError(message, e));
  };
  const applyFilters=async(next)=>{filters=next;page=0;const form=document.querySelector('#order-filters');for(const [name,value] of Object.entries(filters))form.elements[name].value=value;await loadList();};
  document.querySelector('#reset-order-filters').onclick=()=>applyFilters({q:'',payment:'',fulfillment:''}).catch(e=>showError(message,e));
  document.querySelectorAll('[data-order-filter]').forEach(button=>button.onclick=()=>applyFilters({q:'',payment:button.dataset.orderFilter==='prepare'?'paid':'',fulfillment:button.dataset.orderFilter==='prepare'?'new':button.dataset.orderFilter==='ready'?'ready':''}).catch(e=>showError(message,e)));
  await loadList();
  if (selected) await orderDetail(selected);
}
async function loadList() {
  const version=++listVersion;
  const list=document.querySelector('#orders-list');list.setAttribute('aria-busy','true');
  let result;
  try { result=await call(`orders?${new URLSearchParams({...filters,page})}`); }
  finally { if(version===listVersion)list.removeAttribute('aria-busy'); }
  if(version!==listVersion)return;
  const rows=result.orders;
  document.querySelectorAll('[data-order-filter]').forEach(button=>{
    const mode=button.dataset.orderFilter;
    button.setAttribute('aria-pressed',String(!filters.q&&(mode==='all'?!filters.payment&&!filters.fulfillment:mode==='prepare'?filters.payment==='paid'&&filters.fulfillment==='new':!filters.payment&&filters.fulfillment==='ready')));
  });
  list.innerHTML=`<div class="commerce-result-head"><h2>Vos commandes</h2><p>${rows.length} résultat(s) sur cette page${result.has_more?' · suite disponible':''}</p></div>${rows.length?`<div class="commerce-overview" aria-label="Résumé des commandes affichées"><div>Commandes affichées<strong>${rows.length}</strong></div><div>Payées<strong>${rows.filter(o=>o.payment_status==='paid').length}</strong></div><div>À remettre<strong>${rows.filter(o=>o.fulfillment==='ready').length}</strong></div></div><div class="commerce-table-wrap commerce-mobile-cards"><table><thead><tr><th scope="col">Commande</th><th scope="col">Client</th><th scope="col">Montant</th><th scope="col">Paiement</th><th scope="col">Préparation</th></tr></thead><tbody>${rows.map(o=>`<tr><td data-label="Commande"><div><a href="#commande" data-order="${esc(o.id)}">${esc(o.reference)}</a><small>${date(o.created_at)}</small></div></td><td data-label="Client"><div>${esc(o.first_name)} ${esc(o.last_name)}<small>${esc(o.email)}${o.team?' · '+esc(o.team):''}</small></div></td><td data-label="Montant"><div>${money(o.total_cents)}</div></td><td data-label="Paiement"><div><span class="commerce-badge ${o.payment_status==='paid'?'is-paid':o.payment_status==='pending'?'is-pending':'is-neutral'}">${esc(paymentLabels[o.payment_status]||o.payment_status)}</span></div></td><td data-label="Préparation"><div>${esc(fulfillmentLabels[o.fulfillment]||o.fulfillment)}</div></td></tr>`).join('')}</tbody></table></div>`:'<div class="commerce-empty"><h3>Aucune commande ici</h3><p>Aucune commande ne correspond à ces critères. Vous pouvez effacer les filtres ou modifier votre recherche.</p><button type="button" id="empty-reset-orders" class="commerce-secondary">Afficher toutes les commandes</button></div>'}<div class="commerce-actions commerce-pagination"><button id="previous-orders" class="commerce-secondary" type="button" ${page===0?'disabled':''}>← Précédente</button><span>Page ${page+1}</span><button id="next-orders" class="commerce-secondary" type="button" ${!result.has_more?'disabled':''}>Suivante →</button></div>`;
  document.querySelector('#empty-reset-orders')?.addEventListener('click',()=>document.querySelector('#reset-order-filters').click());
  list.querySelectorAll('[data-order]').forEach(a=>a.onclick=event=>{event.preventDefault();orderDetail(a.dataset.order,true).catch(e=>showError(message,e));});
  for(const [id,step] of [['previous-orders',-1],['next-orders',1]])document.querySelector(`#${id}`).onclick=()=>{page+=step;loadList().catch(e=>showError(message,e));};
}
async function orderDetail(id, focus = false) {
  const data = await call(`orders/${id}`),
    o = data.order;
  selected = id;
  document.querySelector("#order-detail").innerHTML =
    `<section class="commerce-card commerce-admin-detail" id="commande" tabindex="-1"><div class="commerce-detail-heading"><div><p class="eyebrow">${esc(o.reference)}</p><h2>${esc(o.first_name)} ${esc(o.last_name)}</h2></div><button id="close-order-detail" type="button" class="commerce-secondary">Fermer la fiche ×</button></div><p>${esc(o.email)} · ${esc(o.phone)}<br>${esc(o.licensed_name)} · ${esc(o.team)}<br>Remise ${o.delivery_method === "coach" ? "par le coach" : "sur rendez-vous au club"}</p><div class="commerce-badges"><span class="commerce-badge">${esc(paymentLabels[o.payment_status] || o.payment_status)}</span><span class="commerce-badge">${esc(fulfillmentLabels[o.fulfillment])}</span><span class="commerce-badge">${money(o.total_cents)}</span></div><div class="commerce-actions">${o.payment_status === "paid" && o.fulfillment !== "cancelled" ? `<button type="button" id="purchase-order">Télécharger le bon fournisseur PDF ↓</button>` : ""}<button type="button" class="commerce-secondary" data-order-action="reconcile">Vérifier le paiement HelloAsso</button><button type="button" class="commerce-secondary" data-order-action="resend">Renvoyer le suivi / relancer les mails en échec</button></div><p class="commerce-help">Un bon par commande client. Son édition ne marque pas la commande comme envoyée au fournisseur. Les remboursements s’effectuent dans HelloAsso ; ils sont ensuite synchronisés ici.</p><form id="fulfillment-form">${itemTable(data.items, { admin: true })}<div class="commerce-form-grid" style="margin-top:24px"><label>État de préparation<select name="fulfillment">${stateOptions(fulfillmentLabels, o.fulfillment)}</select></label><label>Message destiné au client<textarea name="public_note" maxlength="1000" rows="3">${esc(o.public_note)}</textarea></label><label class="wide">Notes internes — jamais affichées au client<textarea name="internal_note" maxlength="2000" rows="3">${esc(o.internal_note)}</textarea></label></div><p class="commerce-help">Les quantités reçues et remises doivent correspondre à l’état choisi. L’annulation ne déclenche pas de remboursement automatique. Une mise à jour envoie un mail au client.</p><button type="submit">Enregistrer et informer le client →</button></form><div class="commerce-split"><div><h3>Historique</h3><ul class="commerce-timeline">${data.events.map((e) => `<li>${esc(e.message)}<small>${date(e.created_at)} · ${esc(e.actor)}</small></li>`).join("")}</ul></div><div><h3>Envois de mails</h3>${config?.environment!=='production'?`<p class="commerce-mail-context"><strong>Environnement de test</strong><br>Tous les messages clients et club sont redirigés vers ${esc(config?.configuration?.mail_test_to||'MAIL_TEST_TO à configurer')}. Chaque envoi affiche son destinataire effectif.</p>`:''}${mailStatusList(data.mails)}</div></div><details><summary>Tentatives de paiement et récupération après incident</summary>${data.attempts.map((a) => `<div class="commerce-card"><p>Tentative ${esc(a.id)}<br>État : ${esc(a.state)} · Intention HelloAsso : ${a.intent_id || "non reçue"}<br>${esc(a.last_error)} · ${date(a.created_at)}</p>${!a.intent_id && ["uncertain", "creating"].includes(a.state) ? `<form data-resolve="${esc(a.id)}"><p>Recherchez la demande dans HelloAsso avec la référence de commande. Renseignez son identifiant : l’API vérifiera son rattachement avant toute synchronisation.</p><label>Identifiant de l’intention HelloAsso<input name="intent_id" type="number" min="1" required></label><button type="submit">Rattacher et vérifier</button></form>` : ""}</div>`).join("")}</details><details><summary>Sécurité du lien de suivi</summary><p>Révoquer le lien rend l’ancien inutilisable et envoie un nouveau lien à l’adresse du client.</p><button class="commerce-secondary" type="button" data-order-action="rotate-link">Révoquer et renvoyer le lien</button></details><details><summary>CGV acceptées — ${esc(o.terms_version)}</summary><pre class="commerce-terms">${esc(o.terms_snapshot)}</pre></details></section>`;
  document.querySelector('#close-order-detail').onclick=()=>{selected=null;document.querySelector('#order-detail').innerHTML='';document.querySelector(`[data-order="${id}"]`)?.focus();};
  if(focus){const detail=document.querySelector('#commande');detail.focus();detail.scrollIntoView({behavior:'smooth',block:'start'});}
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
          notice(button.dataset.orderAction==='resend'?'Le lien de suivi est placé dans la file d’envoi. Consultez les états d’e-mail ci-dessous pour vérifier sa prise en charge.':'Action effectuée.');
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
        const data=await result.json();
        const [{purchaseOrderPdf},logoResponse]=await Promise.all([import('../shop/purchase-order-pdf'),fetch('/logo-fce.png',{redirect:'error'})]);
        if(!logoResponse.ok)throw new Error('Le logo du club ne peut pas être chargé. Réessayez le téléchargement.');
        const bytes=await purchaseOrderPdf(data.order,data.items,data.club,new Uint8Array(await logoResponse.arrayBuffer()));
        const blob=new Blob([bytes],{type:'application/pdf'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `bon-${o.reference}.pdf`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        notice(
          "Bon fournisseur PDF téléchargé.",
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
  root.innerHTML = `<section class="commerce-card"><h2>Paiement et envoi des confirmations</h2><div class="commerce-message"><strong>${config.availability?.ready?"Paiement ouvert":"Paiement indisponible"}</strong>${config.availability?.ready?' — La boutique peut recevoir des commandes.':' — Vous pouvez enregistrer vos paramètres dès maintenant. Le paiement restera fermé jusqu’à la configuration complète.'}${config.availability?.missing?.length?`<p>À compléter pour ouvrir le paiement :</p><ul>${config.availability.missing.map(item=>`<li>${esc(item.label)}</li>`).join('')}</ul>`:''}</div><p>Environnement imposé par le déploiement : <strong>${config.environment === "sandbox" ? "HelloAsso Sandbox" : "HelloAsso Production"}</strong>. Le navigateur ne peut pas le modifier.</p><div class="commerce-stats"><div>API HelloAsso<strong>${c.credentials ? "Configurée" : "À configurer"}</strong></div><div>Clé de suivi<strong>${c.tracking ? "Configurée" : "À configurer"}</strong></div><div>Transport mail<strong>${esc(c.mail_provider || "Absent")}</strong></div><div>Envoi mail<strong>${c.mail_ready ? "Paramètres présents" : "À configurer"}</strong></div></div><p>Origine : ${esc(config.origin || "non définie")}<br>Expéditeur : ${esc(c.mail_from || "non défini")}<br>Destinataire de test : ${esc(c.mail_test_to || "non défini")}<br>Signature webhook partenaire : ${c.webhook_signature ? "activée" : "non configurée — vérification systématique par l’API OAuth"}</p><div class="commerce-mail-context"><strong>Vérifier les e-mails</strong><p>${config.environment!=="production"?`En staging, tous les messages clients et club vont à <strong>${esc(c.mail_test_to||"MAIL_TEST_TO à configurer")}</strong>. En production, les clients reçoivent leur suivi et le club reçoit ses propres notifications à ${esc(s.contact_email)}.`:"Les mails de commande vont à l’adresse du client. Le bouton de test utilise uniquement MAIL_TEST_TO."}</p><p>« Paramètres présents » ne prouve pas l’envoi. Utilisez le test ci-dessous, puis consultez les états d’e-mail dans la fiche de commande. Un refus 401 de Roundcube concerne la connexion au webmail et nécessite une vérification séparée.</p></div><p class="commerce-help">Les clés API et la clé de suivi sont des secrets Worker. Elles ne sont jamais stockées dans les paramètres D1 ni renvoyées au navigateur. Configuration dans la documentation du dépôt : docs/BOUTIQUE.md.</p>${mailQueueSummary(config.mail_queue)}<p><button id="test-helloasso-connection" type="button">Tester la connexion HelloAsso</button> <button id="test-mail" type="button">Tester l’envoi d’un e-mail</button></p><section class="commerce-coach-admin"><h3>Accès aux tarifs coach</h3><p>État : <strong>${config.coach_access?.enabled?"Actif":"Désactivé"}</strong>. Un code commun donne accès aux tarifs coach, sans expiration automatique. Le club peut le renouveler ou le désactiver. Les coachs le saisissent sur la boutique via « Tarifs coach », en haut de page. Toute personne qui connaît ce code peut l’utiliser : transmettez-le uniquement aux coachs.</p><div class="commerce-actions"><button id="generate-coach-code" type="button" class="commerce-secondary">${config.coach_access?.enabled?"Renouveler le code coach":"Générer le code coach"}</button>${config.coach_access?.enabled?'<button id="disable-coach-code" type="button" class="commerce-secondary">Désactiver l’accès coach</button>':""}</div><div id="coach-code-result" role="status"></div><p class="commerce-help">Le code court n’est affiché qu’à sa génération. La saisie accepte les minuscules, les espaces et les tirets, avec ou sans le préfixe FCE. Le code long déjà actif reste valable jusqu’à son renouvellement. Son renouvellement ou sa désactivation révoque les sessions existantes. Le code seul ne vérifie pas l’identité du coach et ne donne aucun droit d’administration.</p></section><form id="settings-form" class="commerce-form-grid">${field("organization_slug", "Identifiant de l’association HelloAsso (slug)", s.organization_slug)}${field("contact_email", "E-mail du service boutique", s.contact_email, "email", true)}${field("seller_name", "Nom du vendeur", s.seller_name, "text", true)}${field("seller_id", "RNA / SIRET et mentions fiscales applicables", s.seller_id)}${field("seller_address", "Adresse du vendeur", s.seller_address)}${field("seller_phone", "Téléphone de contact", s.seller_phone)}${field("collection_address", "Adresse du retrait sur rendez-vous", s.collection_address)}${field("delivery_days", "Délai maximal de remise après paiement (jours)", s.delivery_days, "number", true)}${field("collection_instructions", "Comment organiser le retrait au club ?", s.collection_instructions)}<p class="commerce-help wide">Précisez qui contacter et les horaires ou modalités pour convenir d’un rendez-vous. Ces consignes sont affichées aux acheteurs.</p><label class="commerce-check wide"><input type="checkbox" name="legal_ready" ${s.legal_ready ? "checked" : ""}><span>Les coordonnées, conditions de vente, délais, garanties et informations RGPD ont été vérifiés par le club.</span></label><label class="commerce-check wide"><input type="checkbox" name="checkout_enabled" ${s.checkout_enabled ? "checked" : ""}><span>Ouvrir la prise de commandes et le paiement ${config.environment === "production" ? "réel" : "de test"}. Les variantes doivent avoir été vérifiées et l’affichage boutique activé dans Catalogue et visuels.</span></label><div class="wide"><button type="submit">Enregistrer les paramètres</button></div></form></section>`;
  document.querySelector('#generate-coach-code').onclick=e=>action(e.target,async()=>{
    if(config.coach_access?.enabled&&!confirm('Renouveler le code et révoquer tous les accès coach existants ?'))return;
    const result=await call('coach-code',{method:'POST',data:{action:'generate'}});await settingsView();
    const target=document.querySelector('#coach-code-result');target.innerHTML='<p>Copiez ce code maintenant. Il ne sera plus affiché ensuite.</p><label>Code à transmettre aux coachs<input readonly autocomplete="off"></label>';target.querySelector('input').value=result.code;target.querySelector('input').select();notice('Code coach généré. Les anciens accès sont révoqués.');
  });
  document.querySelector('#disable-coach-code')?.addEventListener('click',e=>action(e.target,async()=>{if(!confirm('Désactiver le code et révoquer les accès coach ?'))return;await call('coach-code',{method:'POST',data:{action:'disable'}});await settingsView();notice('Accès coach désactivé.');}));
  document.querySelector('#test-mail').onclick=e=>action(e.target,async()=>{const result=await call('mail/test',{method:'POST'});notice(result.message);});
  document.querySelector('#test-helloasso-connection').onclick=e=>action(e.target,async()=>{const result=await call('helloasso/test',{method:'POST'});notice(`${result.environment} · ${result.organization_slug} · ${result.can_receive_payments?'Encaissement autorisé':'Association à vérifier'}`);});
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
      await settingsView();
      notice(config.availability?.ready?"Paramètres enregistrés. Le paiement est ouvert.":"Paramètres enregistrés. Le paiement reste indisponible : consultez la liste des éléments à compléter.");
    });
  };
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
      products: () => renderContent(root, call, notice, "shop_products"),
      suppliers: () => renderSuppliers(root, call, notice),
      categories: () => renderContent(root, call, notice, "shop_categories"),
      cover: async () => {root.innerHTML='<div id="cover-media"></div><div id="cover-display"></div>';await renderContent(root.querySelector('#cover-media'),call,notice,'site_media');await renderContent(root.querySelector('#cover-display'),call,notice,'shop_settings');},
      settings: settingsView,
      surveys,
      admins: adminsView,
    }[tab]();
    message.textContent = "";
  } catch (error) {
    showError(message, error);
  }
}
if (local && !readStorage("fce-shop-local-token")) {
  const value = prompt("Jeton de développement local (DEV_ADMIN_TOKEN) :");
  if (value)
    sessionStorage.setItem("fce-shop-local-token", JSON.stringify(value));
}
(async () => {
  try { await loadConfig(); await render(); }
  catch (error) { showError(message, error); }
})();

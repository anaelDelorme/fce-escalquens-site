import { sectionsSummary } from "./tournament-form-fields";
import { formEditor } from "./tournament-form-editor";
import { eventEditor } from "./tournament-events-editor";
import {
  api,
  esc,
  money,
  date,
  paymentLabels,
  mailStatusList,
} from "../../public/shop-common.js";
const root = document.querySelector("#tournament-admin"),
  message = document.querySelector("#tournament-admin-message");
const call = (path, options) => api(`/admin-tournois/api/${path}`, options),
  labels = {
    pending: "À valider",
    accepted: "Acceptée",
    cancelled: "Annulée",
    attended: "Équipes accueillies",
  };
let registrationFilters={q:'',payment:'',registration:'',tournament:'',category:''};
let tournamentEnvironment='sandbox';
const field = (name, label, value = "", type = "text") =>
  `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" required></label>`;
const localTime = (seconds) =>
  seconds
    ? new Date(
        seconds * 1000 - new Date(seconds * 1000).getTimezoneOffset() * 60000,
      )
        .toISOString()
        .slice(0, 16)
    : "";
async function action(button, fn) {
  button.disabled = true;
  button.setAttribute("aria-busy","true");
  message.textContent = "Enregistrement…";
  try {
    await fn();
    message.textContent = "Opération terminée.";
  } catch (error) {
    message.textContent = error.message;
    message.focus();
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }
}
function registrationSections(row) {
  let sections=[];
  try { sections=JSON.parse(row.sections_json||'[]'); } catch {}
  if(Array.isArray(sections)&&sections.length)return sections.filter(s=>s.participating&&Number.isSafeInteger(s.quantity)&&s.quantity>0&&s.section).map(s=>({category:String(s.section),quantity:s.quantity}));
  // Older registrations contain one category and a team count.
  return row.category ? [{category:row.category,quantity:Number.isSafeInteger(row.team_count)&&row.team_count>0?row.team_count:1}] : [];
}
function categoryOverview(rows) {
  const groups=new Map();
  for(const row of rows) {
    if(row.registration_status==='cancelled')continue;
    for(const section of registrationSections(row)) {
      const key=JSON.stringify([row.tournament_id||row.tournament_name,section.category]);
      if(!groups.has(key))groups.set(key,{category:section.category,tournament:row.tournament_name,total:0,accepted:0,pending:0,teams:[]});
      const group=groups.get(key);group.total+=section.quantity;
      if(['accepted','attended'].includes(row.registration_status))group.accepted+=section.quantity;else group.pending+=section.quantity;
      group.teams.push({...row,quantity:section.quantity});
    }
  }
  const sorted=[...groups.values()].sort((a,b)=>String(a.tournament).localeCompare(String(b.tournament),'fr')||a.category.localeCompare(b.category,'fr',{numeric:true}));
  return sorted.length ? `<div class="tournament-category-grid">${sorted.map(g=>`<article class="tournament-category-card"><div class="tournament-category-heading"><h3>${esc(g.category)}</h3><strong>${g.total}<small> équipe${g.total>1?'s':''}</small></strong></div><p>${esc(g.tournament)}</p><p class="commerce-help">${g.accepted} validée${g.accepted>1?'s':''} · ${g.pending} à valider</p><ul>${g.teams.sort((a,b)=>String(a.club_name).localeCompare(String(b.club_name),'fr')).map(r=>`<li><button type="button" class="tournament-category-team" data-category-order="${esc(r.order_id)}"><span><b>${esc(r.club_name)}</b>${r.team_name&&!/^\d+ équipes?$/i.test(r.team_name)?`<small>${esc(r.team_name)}</small>`:''}</span><strong>${r.quantity} équipe${r.quantity>1?'s':''}</strong></button></li>`).join('')}</ul></article>`).join('')}</div>` : '<p class="commerce-empty">Aucune équipe active pour cette sélection.</p>';
}
async function registrations() {
  const { registrations: rows } = await call("registrations");
  const tournaments=[...new Set(rows.map(r=>r.tournament_name))];
  const categories=[...new Set(rows.flatMap(r=>registrationSections(r).map(s=>s.category)))].sort((a,b)=>a.localeCompare(b,'fr',{numeric:true}));
  root.innerHTML=`<div class="commerce-overview" aria-label="Résumé des inscriptions chargées"><div>Inscriptions chargées<strong>${rows.length}</strong><small>500 inscriptions au maximum</small></div><div>À valider<strong>${rows.filter(r=>r.registration_status==='pending').length}</strong></div><div>Paiements en attente<strong>${rows.filter(r=>r.payment_status==='pending'&&r.registration_status!=='cancelled').length}</strong></div></div><section class="commerce-card"><div class="commerce-result-head"><h2>Les équipes inscrites</h2><button id="export-registrations" class="commerce-secondary" type="button">Exporter la sélection CSV ↓</button></div><div class="commerce-filters"><label>Rechercher<input id="registration-search" type="search" value="${esc(registrationFilters.q)}" placeholder="Club, équipe, référence…"></label><label>Tournoi<select id="tournament-filter"><option value="">Tous les tournois</option>${tournaments.map(name=>`<option value="${esc(name)}" ${registrationFilters.tournament===name?'selected':''}>${esc(name)}</option>`).join('')}</select></label><label>Catégorie<select id="category-filter"><option value="">Toutes les catégories</option>${categories.map(category=>`<option value="${esc(category)}" ${registrationFilters.category===category?'selected':''}>${esc(category)}</option>`).join('')}</select></label><label>Paiement<select id="payment-filter"><option value="">Tous</option>${Object.entries(paymentLabels).map(([k,v])=>`<option value="${k}" ${registrationFilters.payment===k?'selected':''}>${esc(v)}</option>`).join('')}</select></label><label>Inscription<select id="registration-filter"><option value="">Toutes</option>${Object.entries(labels).map(([k,v])=>`<option value="${k}" ${registrationFilters.registration===k?'selected':''}>${esc(v)}</option>`).join('')}</select></label><button id="reset-registration-filters" class="commerce-secondary" type="button">Effacer</button></div><p id="registration-count" class="commerce-help" role="status" aria-live="polite"></p><section aria-labelledby="category-overview-title"><h2 id="category-overview-title">Équipes par catégorie</h2><p class="commerce-help">Effectifs des inscriptions chargées correspondant aux filtres. Les inscriptions annulées sont exclues.</p><div id="registration-categories"></div></section><h2>Liste des inscriptions</h2><div class="tournament-admin-table commerce-mobile-cards" id="registration-table"></div><p class="commerce-help">L’acceptation par le club et le paiement sont deux états distincts. Les remboursements s’effectuent dans HelloAsso.</p></section><section id="registration-detail"></section>`;
  let visible=rows;
  function draw(){
    registrationFilters={q:root.querySelector('#registration-search').value,payment:root.querySelector('#payment-filter').value,registration:root.querySelector('#registration-filter').value,tournament:root.querySelector('#tournament-filter').value,category:root.querySelector('#category-filter').value};
    const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const f=registrationFilters;
    visible=rows.filter(r=>(!f.payment||r.payment_status===f.payment)&&(!f.registration||r.registration_status===f.registration)&&(!f.tournament||r.tournament_name===f.tournament)&&(!f.category||registrationSections(r).some(s=>s.category===f.category))&&normalize(`${r.reference} ${r.club_name} ${r.team_name} ${r.tournament_name} ${r.email}`).includes(normalize(f.q)));
    root.querySelector('#registration-count').textContent=`${visible.length} inscription(s) sur les ${rows.length} chargées`;
    root.querySelector('#export-registrations').disabled=!visible.length;
    root.querySelector('#registration-categories').innerHTML=categoryOverview(visible.map(row=>({...row,sections_json:JSON.stringify(registrationSections(row).filter(s=>!f.category||s.category===f.category).map(s=>({section:s.category,quantity:s.quantity,participating:true})))})));
    root.querySelectorAll('[data-category-order]').forEach(button=>button.onclick=()=>action(button,()=>show(button.dataset.categoryOrder,true)));
    root.querySelector('#registration-table').innerHTML=visible.length?`<table><thead><tr><th scope="col">Tournoi / équipe</th><th scope="col">Inscription</th><th scope="col">Paiement</th><th scope="col">Action</th></tr></thead><tbody>${visible.map(r=>`<tr><td data-label="Équipe"><div><b>${esc(r.tournament_name)}</b><p>${esc(r.club_name)} · ${esc(r.team_name)} · ${esc(r.category)}</p><small>${esc(r.reference)}</small></div></td><td data-label="Inscription"><div><span class="commerce-badge ${r.registration_status==='pending'?'is-pending':r.registration_status==='accepted'?'is-paid':'is-neutral'}">${esc(labels[r.registration_status]||r.registration_status)}</span></div></td><td data-label="Paiement"><div><strong>${money(r.total_cents)}</strong><br><span class="commerce-badge ${r.payment_status==='paid'?'is-paid':'is-pending'}">${esc(paymentLabels[r.payment_status]||r.payment_status)}</span></div></td><td data-label="Action"><div><button type="button" data-order="${esc(r.order_id)}">Ouvrir la fiche →</button></div></td></tr>`).join('')}</tbody></table>`:'<div class="commerce-empty"><h3>Aucune inscription à afficher</h3><p>Modifiez votre recherche ou effacez les filtres pour retrouver les équipes.</p></div>';
    root.querySelectorAll('[data-order]').forEach(button=>button.onclick=()=>action(button,()=>show(button.dataset.order,true)));
  }
  root.querySelector('#registration-search').oninput=draw;
  for(const id of ['payment-filter','registration-filter','tournament-filter','category-filter'])root.querySelector(`#${id}`).onchange=draw;
  root.querySelector('#reset-registration-filters').onclick=()=>{for(const id of ['registration-search','payment-filter','registration-filter','tournament-filter','category-filter'])root.querySelector(`#${id}`).value='';draw();};
  draw();
  root.querySelector("#export-registrations").onclick = () => {
    const cell = (value) =>
      '"' +
      String(value ?? "")
        .replace(/^[\s]*[=+@-]/, "'$&")
        .replaceAll('"', '""') +
      '"';
    const columns = [
      "reference",
      "tournament_name",
      "club_name",
      "team_name",
      "category",
      "email",
      "payment_status",
      "registration_status",
      "total_cents",
      "team_count",
      "sections_json",
      "payment_method",
    ];
    const questions = new Map();
    for (const r of visible)
      for (const f of JSON.parse(r.form_snapshot || "[]"))
        questions.set(f.id, `${r.tournament_name} — ${f.label}`);
    const custom = Array.from(questions.keys());
    const csv =
      "\uFEFF" +
      [
        [...columns, ...custom.map((id) => questions.get(id))],
        ...visible.map((r) => [
          ...columns.map((k) => r[k]),
          ...custom.map((id) => {
            const v = JSON.parse(r.answers_json || "{}")[id];
            return typeof v === "boolean" ? (v ? "Oui" : "Non") : v || "";
          }),
        ]),
      ]
        .map((row) => row.map(cell).join(";"))
        .join("\r\n");
    const url = URL.createObjectURL(
        new Blob([csv], { type: "text/csv;charset=utf-8" }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = "inscriptions-tournois.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
}
async function show(id, focus = false) {
  const data = await call(`registrations/${id}`),
    o = data.order,
    r = data.registration,
    target = root.querySelector("#registration-detail");
  target.innerHTML = `<section class="commerce-card commerce-admin-detail" tabindex="-1"><div class="commerce-detail-heading"><div><p class="eyebrow">Fiche d’inscription</p><h2>${esc(o.reference)}</h2></div><button type="button" id="close-registration-detail" class="commerce-secondary">Fermer la fiche ×</button></div><p>${esc(r.tournament_name)} · ${esc(r.club_name)} · ${esc(r.team_name)}</p><p>${esc(o.first_name)} ${esc(o.last_name)} · ${esc(o.email)} · ${esc(o.phone)}</p>${sectionsSummary(r)}${
    JSON.parse(r.form_snapshot || "[]").length
      ? `<dl>${JSON.parse(r.form_snapshot)
          .map(
            (f) =>
              `<dt>${esc(f.label)}</dt><dd>${esc(typeof JSON.parse(r.answers_json || "{}")[f.id] === "boolean" ? (JSON.parse(r.answers_json)[f.id] ? "Oui" : "Non") : JSON.parse(r.answers_json || "{}")[f.id] || "—")}</dd>`,
          )
          .join("")}</dl>`
      : ""
  }${r.payment_method==='cheque'?`<p class="tournament-cheque-instructions">${esc(r.cheque_snapshot)}</p>${o.payment_status==='pending'&&r.registration_status!=='cancelled'?'<p><button data-cheque-received>Confirmer la réception du chèque et le paiement</button></p>':''}`:''}<p>Paiement : <b>${esc(paymentLabels[o.payment_status] || o.payment_status)}</b> · ${money(o.total_cents)}</p><p><button data-reconcile>Vérifier chez HelloAsso</button> <button data-resend>Renvoyer le suivi</button> <button data-rotate>Révoquer et renvoyer le lien</button></p><form class="commerce-form-grid"><label>Inscription<select name="registration_status">${Object.entries(
    labels,
  )
    .map(
      ([k, v]) =>
        `<option value="${k}" ${r.registration_status === k ? "selected" : ""}>${esc(v)}</option>`,
    )
    .join(
      "",
    )}</select></label><label>Message visible par le contact<textarea name="public_note" maxlength="1500">${esc(o.public_note)}</textarea></label><label>Note interne au club<textarea name="internal_note" maxlength="3000">${esc(o.internal_note)}</textarea></label><div><button type="submit">Enregistrer et informer le contact</button></div></form><h3>Suivi des e-mails</h3>${tournamentEnvironment!=="production"?'<p class="commerce-mail-context">En staging, tous les mails clients et club sont redirigés vers MAIL_TEST_TO. Le destinataire effectif est indiqué pour chaque envoi.</p>':""}${mailStatusList(data.mails)}<details><summary>Historique et paiements</summary>${data.events.map((e) => `<p>${date(e.created_at)} · ${esc(e.message)}</p>`).join("")}<h3>Tentatives de paiement</h3>${data.attempts.map((a) => `<p>${esc(a.intent_id || "Sans réponse")} · ${esc(a.state)} · ${esc(a.last_error)}<br><small>Tentative : ${esc(a.id)}</small></p>`).join("")}</details>${
    data.attempts.some(
      (a) => !a.intent_id && ["creating", "uncertain"].includes(a.state),
    )
      ? `<details><summary>Récupérer une réponse HelloAsso perdue</summary><p>Retrouvez l’intention dans HelloAsso ou avec son assistance. Son identifiant sera vérifié par l’API ; une simple déclaration ne valide jamais le paiement.</p><form id="resolve-attempt" class="commerce-form-grid"><label>Tentative<select name="attempt_id">${data.attempts
          .filter(
            (a) => !a.intent_id && ["creating", "uncertain"].includes(a.state),
          )
          .map((a) => `<option value="${esc(a.id)}">${esc(a.id)}</option>`)
          .join(
            "",
          )}</select></label>${field("intent_id", "Identifiant de l’intention HelloAsso", "", "number")}<button type="submit">Vérifier et rattacher</button></form></details>`
      : ""
  }</section>`;
  target.querySelector('#close-registration-detail').onclick=()=>{target.innerHTML='';root.querySelector(`[data-order="${id}"]`)?.focus();};
  if(focus){target.querySelector('.commerce-admin-detail').focus();target.scrollIntoView({behavior:'smooth',block:'start'});}
  target.querySelector("#resolve-attempt")?.addEventListener("submit", (e) => {
    e.preventDefault();
    action(e.target.querySelector("button"), async () => {
      const d = Object.fromEntries(new FormData(e.target));
      await call(`registrations/${id}/resolve-attempt`, {
        method: "POST",
        data: { attempt_id: d.attempt_id, intent_id: Number(d.intent_id) },
      });
      await show(id);
    });
  });
  target.scrollIntoView({ behavior: "smooth", block: "start" });
  target.querySelector('[data-cheque-received]')?.addEventListener('click',e=>action(e.target,async()=>{await call(`registrations/${id}/cheque-received`,{method:'POST',data:{version:o.version}});await registrations();await show(id);}));
  target.querySelector("[data-reconcile]").onclick = (e) =>
    action(e.target, async () => {
      await call(`registrations/${id}/reconcile`, { method: "POST" });
      await show(id);
    });
  target.querySelector("[data-rotate]").onclick = (e) =>
    action(e.target, () =>
      call(`registrations/${id}/rotate-link`, { method: "POST" }),
    );
  target.querySelector("[data-resend]").onclick = (e) =>
    action(e.target, async () => { await call(`registrations/${id}/resend`, { method: "POST" }); await show(id); });
  target.querySelector("form.commerce-form-grid").onsubmit = (e) => {
    e.preventDefault();
    action(e.target.querySelector("button"), async () => {
      await call(`registrations/${id}`, {
        method: "PUT",
        data: {
          ...Object.fromEntries(new FormData(e.target)),
          version: o.version,
        },
      });
      await registrations();
      await show(id);
    });
  };
}
async function admins() {
  const data = await call("admins");
  root.innerHTML = `<section class="commerce-card"><h2>Responsables des tournois</h2><p>Ces accès sont indépendants du site et de la boutique. Autorisez également l’adresse dans l’application Cloudflare Access dédiée aux tournois.</p><ul>${data.admins.map((a) => `<li>${esc(a.name)} · ${esc(a.email)} · ${a.active ? "Actif" : "Désactivé"} <button data-email="${esc(a.email)}">Modifier</button></li>`).join("")}</ul><form class="commerce-form-grid">${field("email", "E-mail", "", "email")}${field("name", "Nom")}<label class="tournament-choice"><input type="checkbox" name="active" checked> Accès actif</label><div><button type="submit">Enregistrer l’accès</button> <button type="reset">Nouvel accès</button></div></form></section>`;
  const form = root.querySelector("form");
  root.querySelectorAll("[data-email]").forEach(
    (b) =>
      (b.onclick = () => {
        const a = data.admins.find((a) => a.email === b.dataset.email);
        form.elements.email.value = a.email;
        form.elements.name.value = a.name;
        form.elements.active.checked = !!a.active;
      }),
  );
  form.onsubmit = (e) => {
    e.preventDefault();
    action(form.querySelector("button"), async () => {
      await call("admins", {
        method: "PUT",
        data: {
          email: form.elements.email.value,
          name: form.elements.name.value,
          active: form.elements.active.checked,
        },
      });
      await admins();
    });
  };
}
call("status")
  .then((status) => {
    tournamentEnvironment=status.environment;
    document.querySelector("#tournament-environment").textContent =
      status.environment === "production"
        ? "PRODUCTION — inscriptions et paiements réels"
        : "SANDBOX — paiements de test, mails réservés au destinataire de test";
    return (
      {
        registrations,
        sales: () => eventEditor(root,call,action),
        admins,
        events: () => eventEditor(root, call, action),
      }[root.dataset.page] || registrations
    )();
  })
  .then(async()=>{message.textContent='';const id=new URLSearchParams(location.search).get('inscription');if(root.dataset.page==='registrations'&&/^[a-f0-9-]{36}$/.test(id||''))await show(id,true);})
  .catch((error) => {
    message.textContent = error.message;
    message.focus();
  });

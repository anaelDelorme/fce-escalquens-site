import { sectionsSummary } from "./tournament-form-fields";
import { formEditor } from "./tournament-form-editor";
import { eventEditor } from "./tournament-events-editor";
import {
  api,
  esc,
  money,
  date,
  paymentLabels,
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
  message.textContent = "Enregistrement…";
  try {
    await fn();
    message.textContent = "Opération terminée.";
  } catch (error) {
    message.textContent = error.message;
    message.focus();
  } finally {
    button.disabled = false;
  }
}
async function registrations() {
  const { registrations: rows } = await call("registrations");
  root.innerHTML = `<section class="commerce-card"><h2>Inscriptions et paiements</h2><p>La validation d’une inscription reste indépendante de son paiement. Une annulation ici ne déclenche aucun remboursement : effectuez-le dans HelloAsso puis vérifiez le paiement.</p><div class="commerce-form-grid"><label>Rechercher<input id="registration-search" type="search" placeholder="Club, équipe, tournoi, référence…"></label><label>État du paiement<select id="payment-filter"><option value="">Tous</option>${Object.entries(
    paymentLabels,
  )
    .map(([k, v]) => `<option value="${k}">${esc(v)}</option>`)
    .join(
      "",
    )}</select></label></div><p><button id="export-registrations">Exporter la sélection en CSV</button></p><div class="tournament-admin-table" id="registration-table"></div></section><section id="registration-detail"></section>`;
  let visible = rows;
  function draw() {
    const search = root
        .querySelector("#registration-search")
        .value.toLowerCase(),
      state = root.querySelector("#payment-filter").value;
    visible = rows.filter(
      (r) =>
        (!state || r.payment_status === state) &&
        `${r.reference} ${r.club_name} ${r.team_name} ${r.tournament_name} ${r.email}`
          .toLowerCase()
          .includes(search),
    );
    root.querySelector("#registration-table").innerHTML =
      `<table><thead><tr><th>Tournoi / équipe</th><th>Inscription</th><th>Paiement</th><th>Action</th></tr></thead><tbody>${visible.map((r) => `<tr><td><b>${esc(r.tournament_name)}</b><p>${esc(r.club_name)} · ${esc(r.team_name)} · ${esc(r.category)}</p><small>${esc(r.reference)}</small></td><td>${esc(labels[r.registration_status])}</td><td>${money(r.total_cents)}<br>${esc(paymentLabels[r.payment_status] || r.payment_status)}</td><td><button data-order="${r.order_id}">Gérer</button></td></tr>`).join("")}</tbody></table>`;
    root
      .querySelectorAll("[data-order]")
      .forEach(
        (button) =>
          (button.onclick = () =>
            action(button, () => show(button.dataset.order))),
      );
  }
  root.querySelector("#registration-search").oninput = draw;
  root.querySelector("#payment-filter").onchange = draw;
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
async function show(id) {
  const data = await call(`registrations/${id}`),
    o = data.order,
    r = data.registration,
    target = root.querySelector("#registration-detail");
  target.innerHTML = `<section class="commerce-card"><h2>${esc(o.reference)}</h2><p>${esc(r.tournament_name)} · ${esc(r.club_name)} · ${esc(r.team_name)}</p><p>${esc(o.first_name)} ${esc(o.last_name)} · ${esc(o.email)} · ${esc(o.phone)}</p>${sectionsSummary(r)}${
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
    )}</select></label><label>Message visible par le contact<textarea name="public_note" maxlength="1500">${esc(o.public_note)}</textarea></label><label>Note interne au club<textarea name="internal_note" maxlength="3000">${esc(o.internal_note)}</textarea></label><div><button type="submit">Enregistrer et informer le contact</button></div></form><details><summary>Historique et envois</summary>${data.events.map((e) => `<p>${date(e.created_at)} · ${esc(e.message)}</p>`).join("")}<h3>E-mails</h3>${data.mails.map((m) => `<p>${esc(m.kind)} : ${esc(m.status)} ${esc(m.last_error)}</p>`).join("")}<h3>Tentatives de paiement</h3>${data.attempts.map((a) => `<p>${esc(a.intent_id || "Sans réponse")} · ${esc(a.state)} · ${esc(a.last_error)}<br><small>Tentative : ${esc(a.id)}</small></p>`).join("")}</details>${
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
    action(e.target, () =>
      call(`registrations/${id}/resend`, { method: "POST" }),
    );
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
  .then(() => (message.textContent = ""))
  .catch((error) => {
    message.textContent = error.message;
    message.focus();
  });

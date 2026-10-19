import { sectionsSummary } from "./tournament-form-fields";
import {
  api,
  esc,
  money,
  date,
  paymentLabels,
  saveStorage,
} from "../../public/shop-common.js";
const message = document.querySelector("#tournament-message"),
  content = document.querySelector("#tournament-tracking");
const statuses = {
  pending: "En attente de validation du club",
  accepted: "Inscription acceptée",
  cancelled: "Inscription annulée",
  attended: "Équipe accueillie",
};
const match = location.hash.slice(1).match(/^([a-f0-9-]{36})\.([a-f0-9]{64})$/);
let order, registration;
if (match) {
  history.replaceState(null, "", location.pathname);
  saveStorage("fce-tournament-link", { id: match[1], token: match[2] });
}
async function load(action = "") {
  if (!match) return;
  message.textContent = "Vérification en cours…";
  try {
    const data = await api(
      `/api/tournaments/registrations/${match[1]}${action}`,
      { token: match[2], method: action ? "POST" : "GET" },
    );
    order = data.order;
    registration = data.registration;
    content.innerHTML = `<section class="commerce-card"><p class="eyebrow">${esc(order.reference)}</p><h2>${esc(registration.tournament_name)}</h2><p>${esc(registration.club_name)} · ${esc(registration.team_name)} · ${esc(registration.category)}</p><dl><dt>Inscription</dt><dd>${esc(statuses[registration.registration_status])}</dd><dt>Paiement</dt><dd>${esc(paymentLabels[order.payment_status] || order.payment_status)} · ${money(order.total_cents)}</dd><dt>Date limite de paiement</dt><dd>${date(registration.payment_deadline)}</dd></dl>${sectionsSummary(registration)}${
      JSON.parse(registration.form_snapshot || "[]").length
        ? `<h3>Vos réponses</h3><dl>${JSON.parse(registration.form_snapshot)
            .map((f) => {
              const value = JSON.parse(registration.answers_json || "{}")[f.id];
              return `<dt>${esc(f.label)}</dt><dd>${esc(typeof value === "boolean" ? (value ? "Oui" : "Non") : value || "—")}</dd>`;
            })
            .join("")}</dl>`
        : ""
    }<p>Le paiement et l’acceptation par le club sont deux étapes distinctes.</p><p>${esc(order.public_note)}</p><div class="tournament-actions"><button id="refresh-payment">Vérifier le paiement</button>${registration.registration_status !== "cancelled" && ["pending", "refused"].includes(order.payment_status) && registration.payment_deadline * 1000 > Date.now() ? '<button id="pay-tournament">Payer avec HelloAsso →</button>' : ""}</div><details><summary>Conditions acceptées lors de l’inscription</summary><p class="tournament-terms">${esc(order.terms_snapshot)}</p></details></section>`;
    message.textContent = "";
    content.querySelector("#refresh-payment").onclick = () => load("/refresh");
    content.querySelector("#pay-tournament")?.addEventListener("click", pay);
  } catch (error) {
    message.textContent = error.message;
    message.focus();
  }
}
async function pay(event) {
  event.target.disabled = true;
  try {
    const result = await api(`/api/tournaments/registrations/${match[1]}/pay`, {
      method: "POST",
      token: match[2],
    });
    if (result.redirect_url) location.assign(result.redirect_url);
    else await load();
  } catch (error) {
    message.textContent = error.message;
    message.focus();
    event.target.disabled = false;
  }
}
document.querySelector("#tournament-recover").onsubmit = async (event) => {
  event.preventDefault();
  const button = event.target.querySelector("button");
  button.disabled = true;
  try {
    const result = await api("/api/tournaments/recover", {
      method: "POST",
      data: { email: event.target.elements.email.value },
    });
    document.querySelector("#recover-result").textContent = result.message;
  } catch (error) {
    document.querySelector("#recover-result").textContent = error.message;
  } finally {
    button.disabled = false;
  }
};
if (match) load().then(() => load("/refresh"));

import { questionMarkup, readQuestionAnswers, sectionMarkup, readSections } from "./tournament-form-fields";
import {
  api,
  esc,
  money,
  date,
  readStorage,
  saveStorage,
} from "../../public/shop-common.js";
const dialog = document.createElement("dialog");
dialog.className = "tournament-dialog";
dialog.setAttribute("aria-label", "Inscription au tournoi");
document.body.append(dialog);
let sale,
  draft,
  questions = [],
  sections = [];
async function open(id) {
  const data = await api("/api/tournaments/catalogue");
  sale = data.tournaments.find((item) => item.id === Number(id));
  if (!sale?.available)
    throw new Error(
      "Les inscriptions ne sont plus ouvertes. Rechargez la page.",
    );
  sections = sale.sections || ["Équipes"];
  questions = JSON.parse(sale.form_json || "[]");
  const existing = readStorage(`fce-tournament-draft:${sale.id}`);
  draft = existing || { key: crypto.randomUUID() };
  dialog.innerHTML = `<button type="button" data-close class="tournament-close" aria-label="Fermer">×</button><p class="eyebrow">Inscription au tournoi</p><h2>${esc(sale.name)}</h2><p class="tournament-fee">${money(sale.fee_cents)} <small>par équipe</small></p><p>Le club validera votre inscription. ${sale.allow_pay_later ? "Vous pouvez régler maintenant ou retrouver le paiement dans votre e-mail de suivi." : "Le paiement se fait avec HelloAsso."}</p><form class="commerce-form-grid"><h3 class="wide tournament-form-title">Coordonnées du contact</h3>${[
    ["club_name", "Club", "text", 120],
    ["first_name", "Prénom du contact", "text", 80],
    ["last_name", "Nom du contact", "text", 80],
    ["email", "E-mail de suivi", "email", 254],
    ["phone", "Téléphone", "tel", 30],
  ]
    .map(
      ([name, label, type, max]) =>
        `<label><span>${label} <span aria-hidden="true">*</span></span><input name="${name}" type="${type}" maxlength="${max}" required></label>`,
    )
    .join(
      "",
    )}${sectionMarkup(sections)}${questionMarkup(questions)}<div class="wide tournament-total" aria-live="polite"><span data-total-count>Choisissez vos sections</span><strong data-total-price>${money(0)}</strong><small>Nombre d’équipes × ${money(sale.fee_cents)} par équipe</small></div><div class="wide"><h3>Quand souhaitez-vous payer ?</h3><label class="tournament-choice"><input type="radio" name="payment_choice" value="now" checked> De suite avec HelloAsso</label>${sale.allow_pay_later ? '<label class="tournament-choice"><input type="radio" name="payment_choice" value="later"> Plus tard avec HelloAsso</label>' : ""}${sale.allow_cheque ? `<label class="tournament-choice"><input type="radio" name="payment_choice" value="cheque"><span>Par chèque<small>À l’ordre de ${esc(sale.cheque_payee)} · À envoyer à ${esc(sale.cheque_address)} avant le ${date(sale.cheque_deadline)}.</small></span></label>` : ""}<p>Paiement au plus tard le ${date(sale.payment_deadline)}. La contribution volontaire proposée par HelloAsso peut être modifiée ou retirée sur sa page de paiement.</p><details><summary>Conditions d’inscription et d’annulation</summary><p class="tournament-terms">${esc(sale.terms)}</p></details><label class="tournament-choice"><input type="checkbox" name="accept_terms" required> J’ai lu et j’accepte les conditions de ce tournoi. *</label><p class="commerce-help">Les champs * sont nécessaires à la gestion de l’inscription et du paiement. Coordonnées du contact uniquement ; aucune liste de joueurs n’est demandée. <a href="/confidentialite/" target="_blank" rel="noopener">Vos données et vos droits</a>.</p><button type="submit">Confirmer mon inscription →</button><p data-error role="status" tabindex="-1"></p><div data-recovery></div></div></form>`;
  dialog.querySelector("[data-close]").onclick = () => dialog.close();
  const form=dialog.querySelector("form");
  const updateTotal=()=>{
    const count=readSections(form,sections).reduce((sum,row)=>sum+(Number.isInteger(row.quantity)&&row.quantity>0?row.quantity:0),0);
    form.querySelector("[data-total-count]").textContent=`${count} équipe${count>1?'s':''} à inscrire`;
    form.querySelector("[data-total-price]").textContent=money(count*sale.fee_cents);
  };
  form.addEventListener("change",updateTotal);form.addEventListener("input",updateTotal);
  form.onsubmit = submit;
  dialog.showModal();
}
async function submit(event) {
  event.preventDefault();
  const form = event.target,
    button = form.querySelector("button[type=submit]"),
    message = form.querySelector("[data-error]");
  if (!form.reportValidity()) return;
  const selection=readSections(form,sections);
  const count=selection.reduce((sum,row)=>sum+row.quantity,0);
  if(!count||count>100){message.textContent="Inscrivez entre 1 et 100 équipes au total.";message.focus();return;}
  button.disabled = true;
  const data = Object.fromEntries(new FormData(form));
  Object.assign(data, {
    tournament_id: sale.id,
    version: sale.version,
    expected_total: count * sale.fee_cents,
    sections: selection,
    accept_terms: true,
    answers: readQuestionAnswers(form, questions),
  });
  for (const key of Object.keys(data))
    if (/^(extra|section|quantity):/.test(key)) delete data[key];
  const fingerprint = Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(data)),
      ),
    ),
    (x) => x.toString(16).padStart(2, "0"),
  ).join("");
  const saved = readStorage(`fce-tournament-draft:${sale.id}`);
  if (saved?.fingerprint && saved.fingerprint !== fingerprint) {
    message.textContent =
      "Une inscription précédente reste à vérifier. Retrouvez-la par e-mail avant d’en créer une autre.";
    form.querySelector("[data-recovery]").innerHTML =
      '<a href="/tournois/suivi/">Retrouver mon inscription →</a>';
    button.disabled=false;
    return;
  }
  data.idempotency_key = draft.key;
  saveStorage(`fce-tournament-draft:${sale.id}`, { ...draft, fingerprint });
  const remember = (result) => {
    saveStorage("fce-tournament-link", {
      id: result.order_id,
      token: result.tracking_token,
    });
    try {
      sessionStorage.removeItem(`fce-tournament-draft:${sale.id}`);
    } catch {}
    return `/tournois/suivi/#${result.order_id}.${result.tracking_token}`;
  };
  try {
    const result = await api("/api/tournaments/registrations", {
      method: "POST",
      data,
    });
    const link = remember(result);
    location.assign(result.redirect_url || link);
  } catch (error) {
    message.textContent = error.message;
    message.focus();
    if (error.order_id) {
      const link = remember(error);
      form.querySelector("[data-recovery]").innerHTML =
        `<p>Votre inscription est enregistrée. <a href="${esc(link)}">Ouvrir son suivi →</a></p>`;
      button.textContent = "Inscription enregistrée";
    } else {
      // A definite rejection before creation can be corrected; uncertain requests retain their key.
      if (
        [400, 403, 409, 415, 422, 429].includes(error.status) &&
        error.code !== "IDEMPOTENCY_CONFLICT"
      ) {
        try {
          sessionStorage.removeItem(`fce-tournament-draft:${sale.id}`);
        } catch {}
        draft = { key: crypto.randomUUID() };
      }
      form.querySelector("[data-recovery]").innerHTML =
        '<p><a href="/tournois/suivi/">Retrouver mes inscriptions par e-mail →</a></p>';
      button.disabled = false;
    }
  }
}
document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-tournament-register]");
  if (button) {
    button.disabled = true;
    open(button.dataset.tournamentRegister)
      .catch((error) => {
        let message = document.querySelector("#tournament-start-error");
        if (!message) {
          message = document.createElement("p");
          message.id = "tournament-start-error";
          message.setAttribute("role", "alert");
          button.after(message);
        }
        message.textContent = error.message;
      })
      .finally(() => (button.disabled = false));
  }
});

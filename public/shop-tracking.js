import {
  api,
  esc,
  money,
  date,
  readStorage,
  saveStorage,
  showError,
  itemTable,
  paymentLabels,
  fulfillmentLabels,
} from "./shop-common.js";
const status = document.querySelector("#tracking-status"),
  content = document.querySelector("#tracking-content");
let link = null,
  current = null;
// Fragment never reaches the server. Remove it from the address bar as soon as captured.
const fragment = location.hash
  .slice(1)
  .match(/^([a-f0-9-]{36})\.([a-f0-9]{64})(?:[?&].*)?$/i);
if (fragment) {
  link = { id: fragment[1], token: fragment[2] };
  saveStorage("fce-order-link", link);
  history.replaceState(null, "", location.pathname);
} else if (!location.hash) link = readStorage("fce-order-link");
const endpoint = (action) =>
  `/api/shop/orders/${link.id}${action ? `/${action}` : ""}`;
function stars(name, title) {
  return `<fieldset><legend>${title} *</legend><div class="commerce-rating">${[1, 2, 3, 4, 5].map((n) => `<label><input type="radio" name="${name}" value="${n}" required><span aria-hidden="true">★</span><span>${n}<span class="sr-only"> sur 5</span></span></label>`).join("")}</div></fieldset>`;
}
function render(data) {
  current = data;
  const o = data.order;
  document.querySelector("#recover-section").hidden = true;
  content.innerHTML = `<section class="commerce-card"><p class="eyebrow">${esc(o.reference)}</p><h2>Bonjour ${esc(o.first_name)}.</h2><div class="commerce-badges"><span class="commerce-badge ${o.payment_status === "paid" ? "is-paid" : ""}">${esc(paymentLabels[o.payment_status] || o.payment_status)}</span><span class="commerce-badge">${esc(fulfillmentLabels[o.fulfillment] || o.fulfillment)}</span></div><p class="commerce-help">Commandée le ${date(o.created_at)} · Remise ${o.delivery_method === "coach" ? `par le coach de ${esc(o.team)}` : "sur rendez-vous au club"}</p>${o.public_note ? `<p class="commerce-message">${esc(o.public_note)}</p>` : ""}${o.payment_status === "pending" ? '<p class="commerce-message">Si vous venez de payer, la confirmation peut prendre quelques instants. N’effectuez pas un second paiement : actualisez d’abord le suivi.</p>' : ""}${itemTable(data.items)}<div class="commerce-total"><span>Total boutique</span><span>${money(o.total_cents)}</span></div><div class="commerce-actions"><button type="button" id="refresh-order">Actualiser le suivi</button>${["pending", "refused"].includes(o.payment_status) && o.fulfillment !== "cancelled" ? '<button type="button" class="commerce-secondary" id="pay-order">Reprendre le paiement HelloAsso →</button>' : ""}<button type="button" class="commerce-secondary" id="forget-order">Fermer le suivi sur cet appareil</button></div><p class="commerce-help">Votre lien permet d’accéder uniquement à cette commande. Besoin d’aide ? <a href="mailto:fcescalquens@gmail.com">Contactez le club</a>.</p><details><summary>Conditions de vente acceptées</summary><pre class="commerce-terms">${esc(o.terms_snapshot)}</pre></details></section><section class="commerce-card"><h2>Les dernières nouvelles</h2><ul class="commerce-timeline">${data.events.map((e) => `<li>${esc(e.message)}<small>${date(e.created_at)}</small></li>`).join("")}</ul></section>${o.paid_at ? `<section class="commerce-card"><p class="eyebrow">Deux minutes pour nous aider</p><h2>La boutique vous a plu ?</h2>${data.survey ? '<p class="commerce-message commerce-success">Merci ! Votre avis a été enregistré.</p>' : `<p>Votre avis aide les bénévoles à améliorer la boutique. Cette enquête est facultative et concerne le parcours d’achat, pas la qualité des articles à leur réception.</p><form id="survey-form">${stars("ease", "Facilité pour commander")}${stars("catalogue", "Clarté et qualité du catalogue")}${stars("overall", "Expérience globale de la boutique")}<label>Un commentaire ? <small>Facultatif — 1 500 caractères maximum</small><textarea name="comment" maxlength="1500" rows="3" placeholder="Ce qui vous a plu, ou ce que nous pourrions améliorer…"></textarea></label><p class="commerce-help">N’indiquez pas de données sensibles ou d’informations sur d’autres personnes. Votre réponse est réservée aux responsables et conservée 12 mois. <a href="/confidentialite/">Vos droits</a>.</p><p id="survey-message" role="status"></p><button type="submit">Partager mon avis →</button></form>`}</section>` : ""}`;
  document.querySelector("#refresh-order").onclick = () => refresh();
  document
    .querySelector("#pay-order")
    ?.addEventListener("click", async (event) => {
      event.target.disabled = true;
      try {
        const result = await api(endpoint("pay"), {
          method: "POST",
          data: {},
          token: link.token,
        });
        if (result.redirect_url) location.assign(result.redirect_url);
        else await refresh();
      } catch (error) {
        showError(status, error);
        event.target.disabled = false;
      }
    });
  document.querySelector("#forget-order").onclick = () => {
    try {
      sessionStorage.removeItem("fce-order-link");
    } catch {}
    link = null;
    content.innerHTML = "";
    document.querySelector("#recover-section").hidden = false;
    status.textContent =
      "Le suivi a été fermé sur cet appareil. Le lien reçu par e-mail reste valable.";
  };
  document
    .querySelector("#survey-form")
    ?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      if (!form.reportValidity()) return;
      const b = form.querySelector("button");
      b.disabled = true;
      const values = Object.fromEntries(new FormData(form));
      try {
        await api(endpoint("survey"), {
          method: "POST",
          token: link.token,
          data: {
            ease: Number(values.ease),
            catalogue: Number(values.catalogue),
            overall: Number(values.overall),
            comment: values.comment,
          },
        });
        await load();
      } catch (error) {
        showError(document.querySelector("#survey-message"), error);
        b.disabled = false;
      }
    });
  if (o.paid_at) {
    try {
      sessionStorage.removeItem("fce-cart-v1");
      sessionStorage.removeItem("fce-checkout-draft");
    } catch {}
  }
}
async function load() {
  if (!link) return;
  status.textContent = "Chargement de votre commande…";
  try {
    const data = await api(endpoint(), { token: link.token });
    status.textContent = "";
    render(data);
  } catch (error) {
    showError(status, error);
    document.querySelector("#recover-section").hidden = false;
  }
}
async function refresh() {
  if (!link) return;
  status.textContent = "Vérification auprès de HelloAsso…";
  document.querySelector("#refresh-order")?.setAttribute("disabled", "");
  try {
    const data = await api(endpoint("refresh"), {
      method: "POST",
      data: {},
      token: link.token,
    });
    status.textContent = "Suivi actualisé.";
    render(data);
  } catch (error) {
    showError(status, error);
    document.querySelector("#refresh-order")?.removeAttribute("disabled");
  }
}
document
  .querySelector("#recover-form")
  .addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget,
      button = form.querySelector("button");
    button.disabled = true;
    try {
      const result = await api("/api/shop/recover", {
        method: "POST",
        data: Object.fromEntries(new FormData(form)),
      });
      document.querySelector("#recover-message").textContent = result.message;
    } catch (error) {
      showError(document.querySelector("#recover-message"), error);
    } finally {
      button.disabled = false;
    }
  });
if (link) {
  await load();
  if (current?.order.payment_status === "pending") await refresh();
}

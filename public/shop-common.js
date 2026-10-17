export const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const money = (cents) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
    cents / 100,
  );
export const date = (seconds) =>
  seconds
    ? new Date(seconds * 1000).toLocaleString("fr-FR", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";
export const paymentLabels = {
  pending: "En attente de confirmation",
  paid: "Payé",
  refused: "Paiement refusé",
  review: "À vérifier par le club",
  refunding: "Remboursement en cours",
  refunded: "Remboursé",
  partially_refunded: "Partiellement remboursé",
  contested: "Paiement contesté",
};
export const fulfillmentLabels = {
  new: "En préparation",
  ordered: "Commandée au fournisseur",
  partial: "Partiellement reçue",
  ready: "Disponible pour remise",
  delivered: "Remise au client",
  cancelled: "Annulée",
};
export function readStorage(key, fallback = null) {
  try {
    return JSON.parse(sessionStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
export function saveStorage(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
export async function api(
  path,
  { method = "GET", data, token, headers = {} } = {},
) {
  let result;
  try {
    result = await fetch(path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      headers: {
        ...headers,
        ...(data ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
  } catch {
    const error = new Error(
      "Connexion interrompue ou session expirée. Vérifiez votre connexion puis rechargez la page. Si vous avez commencé un paiement, consultez le suivi avant de réessayer.",
    );
    error.code = "NETWORK";
    throw error;
  }
  let body;
  try {
    body = await result.json();
  } catch {
    throw new Error(
      "Réponse illisible. Votre session de gestion a peut-être expiré : rechargez la page.",
    );
  }
  if (!result.ok) {
    const error = new Error(
      `${body.error || "Opération impossible."}${body.incident ? ` (Référence ${body.incident})` : ""}`,
    );
    Object.assign(error, body);
    error.status = result.status;
    throw error;
  }
  return body;
}
export function showError(node, error) {
  node.textContent = error.message || "Une erreur est survenue.";
  node.className = "commerce-message commerce-error";
  node.hidden = false;
  node.focus?.();
}
export function itemTable(items, { admin = false } = {}) {
  return `<div class="commerce-table-wrap"><table><thead><tr><th>Article</th><th>Quantité</th><th>Montant</th>${admin ? "<th>Reçue</th><th>Remise</th>" : ""}</tr></thead><tbody>${items.map((i) => `<tr><td><strong>${esc(i.name)}</strong><small>${esc(i.size || "Taille unique")} · ${esc(i.color)}${admin ? ` · Réf. ${esc(i.sku)}` : ""}</small>${(i.options || []).map((o) => `<small>${esc(o.label)}${o.text ? ` : <b>${esc(o.text)}</b>` : ""}</small>`).join("")}</td><td>${i.quantity}</td><td>${money(i.unit_cents * i.quantity)}</td>${admin ? `<td><input aria-label="Quantité reçue — ${esc(i.name)} ${esc(i.size)}" type="number" min="0" max="${i.quantity}" name="received:${esc(i.id)}" value="${i.received}" required></td><td><input aria-label="Quantité remise — ${esc(i.name)} ${esc(i.size)}" type="number" min="0" max="${i.quantity}" name="delivered:${esc(i.id)}" value="${i.delivered}" required></td>` : ""}</tr>`).join("")}</tbody></table></div>`;
}

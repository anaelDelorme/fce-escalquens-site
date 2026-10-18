import { readStorage } from "../../public/shop-common.js";
const query = new URLSearchParams(location.search),
  context = query.get("context") === "tournois" ? "tournois" : "boutique",
  id = query.get("order");
const target = `/${context}/suivi/`,
  stored = readStorage(
    context === "tournois" ? "fce-tournament-link" : "fce-order-link",
  );
document.querySelector("#payment-return-link").href = target;
// Provider return parameters are display/navigation hints only, never payment evidence.
if (
  stored?.id === id &&
  /^[a-f0-9-]{36}$/.test(stored.id) &&
  /^[a-f0-9]{64}$/.test(stored.token)
)
  location.replace(`${target}#${stored.id}.${stored.token}`);
else
  document.querySelector("#payment-return-message").textContent =
    "Retrouvez votre lien personnel dans l’e-mail reçu, ou demandez son renvoi. Le suivi vérifiera le paiement auprès de HelloAsso.";

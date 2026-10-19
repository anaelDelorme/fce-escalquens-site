import { api, esc } from "../../public/shop-common.js";
export async function eventEditor(root, call, action) {
  const { events } = await call("events");
  const field = (name, label, value = "", type = "text", required = false) =>
    `<label>${label}<input type="${type}" name="${name}" value="${esc(value || "")}" ${required ? "required" : ""}></label>`;
  root.innerHTML = `<section class="commerce-card"><h2>Tournois et visuels</h2><p>Gérez ici les tournois, puis leur formulaire et leur tarif dans Formulaires et tarifs.</p><p><button id="new-tournament">+ Créer un tournoi</button></p><div class="commerce-table-wrap"><table><thead><tr><th>Tournoi</th><th>Date</th><th>Visibilité</th><th>Action</th></tr></thead><tbody>${events.map((t) => `<tr><td>${esc(t.name)}</td><td>${esc(t.starts_on)}</td><td>${esc({ draft: "Brouillon", published: "À venir", open: "Inscriptions ouvertes", finished: "Terminé" }[t.status])}</td><td><button data-event="${t.id}">Modifier</button></td></tr>`).join("") || '<tr><td colspan="4">Aucun tournoi pour le moment.</td></tr>'}</tbody></table></div></section><section id="event-editor"></section>`;
  function edit(t = {}) {
    const target = root.querySelector("#event-editor");
    target.innerHTML = `<form class="commerce-card commerce-form-grid"><h2 class="wide">${t.id ? "Modifier le tournoi" : "Créer un tournoi"}</h2>${field("name", "Nom", t.name, "text", true)}${field("slug", "Nom du lien (facultatif à la création)", t.slug)}${field("starts_on", "Début", t.starts_on, "date", true)}${field("ends_on", "Fin", t.ends_on, "date")}${field("venue", "Lieu et adresse", t.venue)}${field("organizer", "Organisateur", t.organizer)}${field("categories", "Catégories (séparées par une virgule)", JSON.parse(t.categories || "[]").join(", "))}<label>Statut<select name="status">${[
      ["draft", "Brouillon"],
      ["published", "À venir"],
      ["open", "Inscriptions ouvertes"],
      ["finished", "Terminé"],
    ]
      .map(
        ([k, v]) =>
          `<option value="${k}" ${(t.status || "draft") === k ? "selected" : ""}>${v}</option>`,
      )
      .join(
        "",
      )}</select></label><label class="wide">Présentation<textarea name="summary" maxlength="12000" rows="8">${esc(t.summary || "")}</textarea></label>${field("tournify_url", "Lien Tournify (facultatif)", t.tournify_url, "url")}${["image_key", "poster_key", "rules_key"].map((key, i) => `<label>${["Photo du tournoi", "Affiche", "Règlement PDF"][i]}<input name="${key}" value="${esc(t[key] || "")}" maxlength="500"><input type="file" data-upload="${key}" accept="${key === "rules_key" ? "application/pdf" : "image/jpeg,image/png,image/webp"}"><small>Importer un fichier ou conserver sa clé média existante.</small></label>`).join("")}<div class="wide"><button type="submit">Enregistrer le tournoi</button></div></form>`;
    const form = target.querySelector("form");
    form.querySelectorAll("[data-upload]").forEach(
      (input) =>
        (input.onchange = () => {
          const file = input.files?.[0];
          if (!file) return;
          action(input, async () => {
            const data = new FormData();
            data.append("file", file);
            const response = await fetch("/admin-tournois/api/upload", {
              method: "POST",
              body: data,
              headers: { "x-requested-with": "XMLHttpRequest" },
            });
            let result;
            try {
              result = await response.json();
            } catch {
              throw new Error(
                "La session a peut-être expiré. Rechargez la page.",
              );
            }
            if (!response.ok)
              throw new Error(result.error || "Envoi impossible.");
            form.elements[input.dataset.upload].value = result.key;
          });
        }),
    );
    form.onsubmit = (event) => {
      event.preventDefault();
      action(form.querySelector("[type=submit]"), async () => {
        const data = Object.fromEntries(new FormData(form));
        data.categories = data.categories
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean);
        if (t.id) data.version = t.version;
        await call(`events${t.id ? "/" + t.id : ""}`, {
          method: t.id ? "PUT" : "POST",
          data,
        });
        await eventEditor(root, call, action);
      });
    };
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  root.querySelector("#new-tournament").onclick = () => edit();
  root
    .querySelectorAll("[data-event]")
    .forEach(
      (button) =>
        (button.onclick = () =>
          edit(events.find((t) => t.id === Number(button.dataset.event)))),
    );
}

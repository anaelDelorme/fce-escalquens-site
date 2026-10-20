import {salesMarkup,bindSales} from "./tournament-sales-fields";
import { api, esc, money } from "../../public/shop-common.js";
export async function eventEditor(root, call, action) {
  const [{ events, venues = [] },{sales=[]}] = await Promise.all([call("events"),call("sales")]);
  const field = (name, label, value = "", type = "text", required = false) =>
    `<label>${label}<input type="${type}" name="${name}" value="${esc(value || "")}" ${required ? "required" : ""}></label>`;
  root.innerHTML=`<section class="commerce-card"><div class="commerce-result-head"><div><h2>Vos tournois</h2><p>Présentation, inscriptions et règlement dans une seule fiche.</p></div><button id="new-tournament" type="button">+ Créer un tournoi</button></div><div class="commerce-filters"><label>Rechercher un tournoi<input id="event-search" type="search" placeholder="Nom du tournoi…"></label><label>Publication<select id="event-status"><option value="">Tous les statuts</option><option value="draft">Brouillons</option><option value="published">À venir</option><option value="open">Inscriptions ouvertes</option><option value="finished">Terminés</option></select></label></div><div class="commerce-table-wrap commerce-mobile-cards"><table><thead><tr><th>Tournoi</th><th>Date</th><th>Publication</th><th>Inscriptions</th><th>Action</th></tr></thead><tbody id="events-rows"></tbody></table></div><details><summary>Vérifier la connexion HelloAsso</summary><p class="commerce-help">Ce test vérifie l’accès de l’association au paiement, sans créer d’inscription.</p><button id="test-helloasso" class="commerce-secondary" type="button">Tester HelloAsso</button><p id="helloasso-state" role="status"></p></details></section><section id="event-editor"></section>`;
  function drawEvents(){
    const term=root.querySelector('#event-search').value.toLowerCase(),state=root.querySelector('#event-status').value;
    const filtered=events.filter(t=>(!state||t.status===state)&&t.name.toLowerCase().includes(term));
    root.querySelector('#events-rows').innerHTML=filtered.map(t=>{const sale=sales.find(s=>s.id===t.id);return `<tr><td data-label="Tournoi"><div><strong>${esc(t.name)}</strong></div></td><td data-label="Date"><div>${esc(t.starts_on)}</div></td><td data-label="Publication"><div><span class="commerce-badge">${esc({draft:'Brouillon',published:'À venir',open:'Inscriptions ouvertes',finished:'Terminé'}[t.status]||t.status)}</span></div></td><td data-label="Inscriptions"><div>${sale?money(sale.fee_cents)+' / équipe':'Tarif à configurer'}<small>${sale?.enabled?'Prise d’inscriptions activée':'Prise d’inscriptions désactivée'}</small></div></td><td data-label="Action"><div><button type="button" class="commerce-secondary" data-event="${t.id}">Modifier la fiche →</button></div></td></tr>`;}).join('')||'<tr><td colspan="5"><p class="commerce-empty">Aucun tournoi pour ces critères. Modifiez les filtres ou créez votre premier tournoi.</p></td></tr>';
    root.querySelectorAll('[data-event]').forEach(button=>button.onclick=()=>edit(events.find(t=>t.id===Number(button.dataset.event))));
  }
  root.querySelector('#event-search').oninput=drawEvents;root.querySelector('#event-status').onchange=drawEvents;drawEvents();
  function edit(t = {}) {
    const sale=sales.find(s=>s.id===t.id)||{};
    const target = root.querySelector("#event-editor");
    target.innerHTML = `<form class="commerce-card commerce-form-grid"><div class="commerce-detail-heading wide"><h2>${t.id ? "Modifier le tournoi" : "Créer un tournoi"}</h2><button id="cancel-event-edit" type="button" class="commerce-secondary">Fermer la fiche ×</button></div><p class="commerce-help wide">Complétez la présentation, puis les inscriptions ci-dessous. Le bouton en bas enregistre l’ensemble de la fiche.</p>${field("name", "Nom", t.name, "text", true)}${field("slug", "Nom du lien (facultatif à la création)", t.slug)}${field("starts_on", "Début", t.starts_on, "date", true)}${field("ends_on", "Fin", t.ends_on, "date")}<label>Lieu du club<select name="venue_id"><option value="">Lieu à confirmer</option>${venues.filter(v=>v.active||v.id===t.venue_id).map(v=>`<option value="${v.id}" ${v.id===t.venue_id?'selected':''}>${esc(v.name)}${v.active?'':' (désactivé)'}</option>`).join('')}</select><small data-venue-address></small></label>${field("organizer", "Organisateur", t.organizer)}${field("categories", "Sections à inscrire (séparées par une virgule, ex. U11, U13)", JSON.parse(t.categories || "[]").join(", "))}<label>Statut<select name="status">${[
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
      )}</select></label><label class="wide">Présentation<textarea name="summary" maxlength="12000" rows="8">${esc(t.summary || "")}</textarea></label>${field("tournify_url", "Lien Tournify (facultatif)", t.tournify_url, "url")}${["image_key", "poster_key", "rules_key"].map((key, i) => `<label>${["Photo du tournoi", "Affiche", "Règlement PDF"][i]}<input name="${key}" value="${esc(t[key] || "")}" maxlength="500"><input type="file" data-upload="${key}" accept="${key === "rules_key" ? "application/pdf" : "image/jpeg,image/png,image/webp"}"><small>Importer un fichier ou conserver sa clé média existante.</small></label>`).join("")}${salesMarkup(sale)}<div class="wide"><button type="submit">Enregistrer le tournoi</button></div></form>`;
    const form = target.querySelector("form");
    target.querySelector('#cancel-event-edit').onclick=()=>{target.innerHTML='';root.querySelector(t.id?`[data-event="${t.id}"]`:'#new-tournament')?.focus();};
    form.elements.status.value=t.status||"draft";
    const readSales=bindSales(form,sale);
    const updateVenue=()=>{const venue=venues.find(v=>v.id===Number(form.elements.venue_id.value));form.querySelector('[data-venue-address]').textContent=venue?.address||(!form.elements.venue_id.value&&t.venue?`Ancien lieu : ${t.venue}. Sélectionnez un lieu du club pour le rattacher à son adresse.`:'Adresse non renseignée.');};
    form.elements.venue_id.onchange=updateVenue;updateVenue();
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
      if(!form.reportValidity())return;
      action(form.querySelector("[type=submit]"), async () => {
        const data = Object.fromEntries(new FormData(form));
        data.venue_id = data.venue_id ? Number(data.venue_id) : null;
        data.categories = data.categories
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean);
        const configuration=readSales(t.id);
        if (t.id) data.version = t.version;
        const saved=await call(`events${t.id ? "/" + t.id : ""}`, {
          method: t.id ? "PUT" : "POST",
          data,
        });
        t.id=saved.id;t.version=saved.version;
        if(configuration){
          try{await call('sales',{method:'PUT',data:{...configuration,tournament_id:saved.id}});}
          catch(error){throw new Error(`La présentation est enregistrée, mais les réglages d’inscription restent à corriger : ${error.message} Vous pouvez réessayer sans recréer le tournoi.`);}
        }
        await eventEditor(root, call, action);
      });
    };
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  root.querySelector('#test-helloasso').onclick=e=>action(e.target,async()=>{const s=await call('helloasso/test',{method:'POST'});root.querySelector('#helloasso-state').textContent=`${s.environment} · ${s.organization_slug} · ${s.can_receive_payments?'Encaissement autorisé':'Association à vérifier'}`;});
  root.querySelector("#new-tournament").onclick = () => edit();
}

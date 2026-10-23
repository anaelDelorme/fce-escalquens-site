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

/** Admin-only rendering: friendly states, never raw provider responses or message bodies. */
export function mailStatusList(mails = []) {
  const kinds = { created:'Confirmation', paid:'Paiement confirmé', tracking:'Lien de suivi', payment:'Mise à jour du paiement', fulfillment:'Préparation et remise',survey:'Avis de satisfaction' };
  const states = { pending:['En attente','is-pending'], sending:['En cours','is-pending'], sent:['Accepté par le serveur','is-paid'], failed:['Échec à traiter','is-failed'] };
  const advice = {
    MAIL_SMTP_AUTH:'OVH refuse les identifiants. Vérifiez SMTP_USER et le secret SMTP_PASSWORD.',
    MAIL_SMTP_CONFIG:'Vérifiez les paramètres SMTP OVH et l’adresse d’expédition du Worker.',
    MAIL_SMTP_NETWORK:'La connexion au serveur OVH a échoué. Réessayez puis vérifiez SMTP_HOST.',
    MAIL_SMTP_TIMEOUT:'Le serveur OVH n’a pas répondu à temps. Une nouvelle tentative est prévue si les reprises ne sont pas épuisées.',
    MAIL_SMTP_RECIPIENT:'Le serveur a refusé le destinataire. Vérifiez son adresse et la réception de la boîte.',
    MAIL_PROVIDER_MISSING:'Aucun transport mail n’est configuré sur ce Worker.',
    MAIL_BINDING_MISSING:'Le service d’envoi Cloudflare n’est pas raccordé au Worker.',
  };
  return mails.map(m => {
    const [state, tone] = states[m.status] || ['État inconnu','is-neutral'];
    const code = /^MAIL_[A-Z0-9_]+$/.test(m.last_error || '') ? m.last_error : '';
    return `<article class="commerce-mail-status"><div><strong>${m.audience==='club'?'Club · ':'Client · '}${esc(kinds[m.kind] || 'Notification de suivi')}</strong><span class="commerce-badge ${tone}">${state}</span></div><small>${m.recipient?`Destinataire : ${esc(m.recipient)} · `:""}${Number(m.attempts)||0} tentative(s)${m.sent_at?' · '+date(m.sent_at):''}</small>${m.status==='sent'?'<p>Le transport a accepté le message. Cela ne confirme pas sa réception en boîte principale.</p>':code?`<p>${esc(advice[code] || 'L’envoi a échoué. Vérifiez le transport mail et relancez les envois depuis cette fiche.')}</p><small class="commerce-mail-code">${esc(code)}</small>`:'<p>Le message sera traité par la file d’envoi automatique.</p>'}</article>`;
  }).join('') || '<p class="commerce-help">Aucun mail n’est encore placé dans la file d’envoi pour cette commande.</p>';
}

export function mailQueueSummary(queue={}) {
  const rows=queue.counts||[],count=(audience,status)=>rows.filter(r=>r.audience===audience&&r.status===status).reduce((n,r)=>n+Number(r.count),0);
  return `<div class="commerce-mail-context"><strong>File d’envoi automatique</strong>${['customer','club'].map(a=>`<p>${a==='club'?'Notifications du club':'Messages clients'} : ${count(a,'pending')} en attente · ${count(a,'sending')} en cours · ${count(a,'failed')} en échec · ${count(a,'sent')} acceptés.</p>`).join('')}<p>Le test de connexion mail est indépendant de cette file et n’envoie pas les commandes.</p></div>`;
}

// Comparisons always refer to the same size/model; no crossed minimum prices.
export function priceMarkup(variants) {
  if (!variants.length) return '';
  const range = values => {
    const min=Math.min(...values),max=Math.max(...values);
    const decimals=values.some(n=>n%100!==0)?2:0;
    const number=n=>new Intl.NumberFormat('fr-FR',{minimumFractionDigits:decimals,maximumFractionDigits:2}).format(n/100);
    return (min===max?number(min):`${number(min)}–${number(max)}`)+' €';
  };
  const kinds=new Set(variants.map(v=>v.price_kind||'fce'));
  const label=kinds.size>1?'Votre tarif':kinds.has('coach')?'Tarif coach':'Tarif FCE';
  const references=variants.filter(v=>Number(v.catalogue_price_cents)>0);
  const partial=references.length>0&&references.length<variants.length;
  const scope=partial?sizeSummary(references).replace(/ : /g,' ').replace(/\n/g,' · '):'';
  const comparison=references.length
    ? `<span class="shop-price-reference">Prix catalogue <strong>${esc(range(references.map(v=>v.catalogue_price_cents)))}</strong>${partial&&scope?`<span class="shop-price-scope"> · ${esc(scope)}</span>`:''}</span>`:'';
  return `<div class="shop-prices${comparison?' has-reference':''}"><span class="shop-price-applied"><span>${label}</span> <strong>${esc(range(variants.map(v=>v.price_cents)))}</strong></span>${comparison}</div>`;
}

export function mediaPreview(key, field) {
  return `<div class="commerce-media-preview"><img data-media-preview="${esc(field)}" ${key?`src="/media/${encodeURIComponent(key).replace(/%2F/g,'/')}"`:'hidden'} alt="Aperçu du visuel"><small data-media-empty="${esc(field)}" ${key?'hidden':''}>Aucun visuel pour le moment.</small></div>`;
}
export function bindMediaPreviews(form) {
  form.querySelectorAll('[data-media-preview]').forEach(image=>{
    const field=form.elements[image.dataset.mediaPreview],empty=form.querySelector(`[data-media-empty="${image.dataset.mediaPreview}"]`);
    const update=()=>{const key=field.value.trim();image.hidden=!key;empty.hidden=!!key;empty.textContent='Aucun visuel pour le moment.';if(key)image.src='/media/'+encodeURIComponent(key).replace(/%2F/g,'/');else image.removeAttribute('src');};
    image.onerror=()=>{image.hidden=true;empty.hidden=false;empty.textContent='Aperçu indisponible. Vérifiez le fichier ou sa clé média.';};
    field.addEventListener('input',update);field.addEventListener('change',update);
  });
}

// Card summaries show the bounds of each size family, not every size chip.
export function sizeSummary(variants) {
 const children=[],adults=[],other=[];
 const letters=['XXXS','XXS','XS','S','M','L','XL','2XL','3XL','4XL','5XL','6XL'];
 for(const v of variants){
  const value=String(v.size||v.label||'').trim(),upper=value.toUpperCase();
  const age=upper.match(/(\d+(?:[.,]\d+)?)\s*(ANS?|MOIS)\b/);
  if(age){children.push({rank:Number(age[1].replace(',','.'))*(age[2]==='MOIS'?1/12:1),label:age[1]+' '+age[2].toLowerCase()});continue;}
  const alpha=upper.replace(/^ADULTES?\s*/,'').replace(/\bXXL\b/,'2XL').replace(/\bXXXL\b/,'3XL').replace(/\bXXXXL\b/,'4XL'),rank=letters.indexOf(alpha);
  if(rank>=0){adults.push({rank,label:alpha});continue;}
  if(/^\d+$/.test(alpha)){adults.push({rank:Number(alpha),label:alpha});continue;}
  if(value&&!other.includes(value))other.push(value);
 }
 const bounds=(name,rows)=>{if(!rows.length)return '';rows.sort((a,b)=>a.rank-b.rank);return name+' : '+rows[0].label+(rows[0].rank!==rows.at(-1).rank?' à '+rows.at(-1).label:'');};
 return [bounds('Enfant',children),bounds('Adulte',adults),...other].filter(Boolean).join('\n');
}

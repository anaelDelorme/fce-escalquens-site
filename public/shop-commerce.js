import {
  api,
  esc,
  money,
  priceMarkup,
  readStorage,
  saveStorage,
  showError,
} from "./shop-common.js";
const productDialog = document.querySelector("#product-dialog"),
  cartDialog = document.querySelector("#cart-dialog");
let cart = readStorage("fce-cart-v1", []),
  catalogue = null;
if (!Array.isArray(cart)) cart = [];
cart = cart
  .filter(
    (i) =>
      i &&
      typeof i.variant_id === "string" &&
      Array.isArray(i.options) &&
      Number.isInteger(i.quantity) &&
      i.quantity > 0,
  )
  .slice(0, 40);
let checkoutStep=1;
let checkoutFields={};
let toastTimer;
const toast = (message) => {
  const node = document.querySelector("#commerce-notice");
  node.textContent = message;
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (node.hidden = true), 4500);
};
const persist = () => {
  saveStorage("fce-cart-v1", cart);
  const count = cart.reduce((n, i) => n + i.quantity, 0);
  const valueNode=document.querySelector("#cart-value");
  if(valueNode)valueNode.textContent=catalogue&&count?money(total()):"";
  document.querySelector("#cart-count").textContent = String(count);
  document.querySelector("#open-cart").setAttribute("aria-label", `Ouvrir mon panier, ${count} article(s)`);
  document.querySelector("#show-cart").textContent = count ? `Voir mes ${count} article(s) →` : "Ouvrir mon panier →";
};
persist();
for (const dialog of [productDialog, cartDialog, document.querySelector("#detail-dialog")])
  dialog
    .querySelector("[data-close]")
    .addEventListener("click", () => dialog.close());
async function loadCatalogue() {
  catalogue = await api("/api/shop/catalogue");
  persist();
  coachAccess();
  return catalogue;
}
function variantFor(line) {
  return catalogue.variants.find((v) => v.id === line.variant_id);
}
function validLine(line) {
  const v = variantFor(line);
  return (
    !!v &&
    !!catalogue.products.find((p) => p.id === v.product_id) &&
    line.options.every((o) =>
      catalogue.options.some(
        (x) => x.id === o.id && x.product_id === v.product_id,
      ),
    )
  );
}
function unit(line) {
  const v = variantFor(line);
  return (
    (v?.price_cents || 0) +
    line.options.reduce(
      (n, o) =>
        n + (catalogue.options.find((x) => x.id === o.id)?.price_cents || 0),
      0,
    )
  );
}
const total = () => cart.reduce((n, i) => n + unit(i) * i.quantity, 0);
function openProduct(id, editIndex = null) {
  const product = catalogue.products.find((p) => p.id === Number(id)),
    variants = catalogue.variants.filter((v) => v.product_id === Number(id)),
    options = catalogue.options.filter((o) => o.product_id === Number(id));
  if (!product || !variants.length) {
    toast(
      "Cet article n’est pas encore disponible à la commande. Contactez le club pour plus d’informations.",
    );
    return;
  }
  const existing = editIndex === null ? null : cart[editIndex];
  document.querySelector("#product-content").innerHTML =
    `<form id="product-form"><p class="eyebrow">Votre équipement, vos détails</p><div class="commerce-product-summary"><img src="/media/${encodeURIComponent(product.image_key).replace(/%2F/g, "/")}" alt=""><h2 id="product-title">${esc(product.name)}</h2></div><p class="commerce-help">Chaque taille affiche son prix exact, hors options. Le total se met à jour avant l’ajout au panier.</p><label>Taille et modèle<select name="variant" required><option value="" disabled ${existing || variants.length === 1 ? "" : "selected"}>Choisissez une taille et un modèle</option>${variants.map((v) => `<option value="${esc(v.id)}" ${existing?.variant_id === v.id || (!existing && variants.length === 1) ? "selected" : ""}>${esc(v.label)}${v.color ? ` — ${esc(v.color)}` : ""} · ${money(v.price_cents)}</option>`).join("")}</select></label><label style="margin-top:18px">Quantité<input name="quantity" type="number" min="1" max="30" value="${existing?.quantity || 1}" required></label>${options.length ? "<h3>Les petits détails qui comptent</h3>" : ""}${options
      .map((o) => {
        const selected = existing?.options.find((x) => x.id === o.id);
        return `<div class="commerce-option"><label class="commerce-check"><input type="checkbox" name="option:${esc(o.id)}" ${selected ? "checked" : ""}><span>${esc(o.label)} <strong>${o.price_cents ? `+ ${money(o.price_cents)}` : "Inclus"}</strong></span></label>${o.requires_text ? `<label data-text-for="${esc(o.id)}" ${selected ? "" : "hidden"}><span>Texte exact à appliquer</span><input name="text:${esc(o.id)}" type="text" maxlength="${o.max_length}" value="${esc(selected?.text || "")}" ${selected ? "required" : "disabled"} autocomplete="off"><small class="commerce-muted">${o.max_length} caractères maximum. Vérifiez les majuscules et l’orthographe.</small></label>` : ""}</div>`;
      })
      .join(
        "",
      )}<div id="product-price-comparison"></div><p class="commerce-product-price" id="product-price" aria-live="polite"></p>${options.some(o=>o.requires_text) ? '<p class="commerce-help">Les articles personnalisés ne bénéficient pas du droit de rétractation. Les garanties légales restent applicables.</p>' : ""}<p id="product-error" class="commerce-message" role="alert" hidden></p><button type="submit">${existing ? "Enregistrer les modifications" : "Ajouter au panier"} →</button></form>`;
  const form = document.querySelector("#product-form");
  const update = () => {
    for (const o of options.filter((o) => o.requires_text)) {
      const checked = form.elements[`option:${o.id}`].checked;
      const field = form.elements[`text:${o.id}`];
      field.disabled = !checked;
      field.required = checked;
      field.closest("label").hidden = !checked;
    }
    const price =
      (variants.find((v) => v.id === form.elements.variant.value)
        ?.price_cents || 0) +
      options
        .filter((o) => form.elements[`option:${o.id}`].checked)
        .reduce((n, o) => n + o.price_cents, 0);
    const selected = !!form.elements.variant.value;
    document.querySelector("#product-price-comparison").innerHTML=priceMarkup(variants.filter(v=>v.id===form.elements.variant.value));
    form.querySelector("button[type=submit]").disabled = !selected;
    document.querySelector("#product-price").textContent = selected
      ? money(price * Number(form.elements.quantity.value || 1))
      : "Choisissez votre modèle";
  };
  form.addEventListener("input", update);
  update();
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const line = {
      variant_id: form.elements.variant.value,
      quantity: Number(form.elements.quantity.value),
      options: options
        .filter((o) => form.elements[`option:${o.id}`].checked)
        .map((o) => ({
          id: o.id,
          text: o.requires_text
            ? form.elements[`text:${o.id}`].value.trim()
            : "",
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    };
    if (
      line.options.some(
        (o) => options.find((x) => x.id === o.id).requires_text && !o.text,
      )
    ) {
      showError(
        document.querySelector("#product-error"),
        new Error("Renseignez le texte de personnalisation."),
      );
      return;
    }
    if (editIndex !== null) cart[editIndex] = line;
    else {
      const key = JSON.stringify({ ...line, quantity: 0 }),
        same = cart.find((i) => JSON.stringify({ ...i, quantity: 0 }) === key);
      if (same) {
        if (same.quantity + line.quantity > 30) {
          showError(
            document.querySelector("#product-error"),
            new Error("Maximum 30 exemplaires pour cette combinaison."),
          );
          return;
        }
        same.quantity += line.quantity;
      } else cart.push(line);
    }
    persist();
    productDialog.close();
    if (cartDialog.open) renderCart();
    else {cartDialog.showModal(); renderCart();}
  });
  productDialog.showModal();
}
document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-order-product]");
  if (!button || button.disabled) return;
  event.preventDefault();
  button.disabled=true;
  try {
    await loadCatalogue();
    const id = Number(button.dataset.orderProduct);
    const variants = catalogue.variants.filter(v=>v.product_id===id);
    const options = catalogue.options.filter(o=>o.product_id===id);
    if (variants.length === 1 && !options.length) {
      const same=cart.find(i=>i.variant_id===variants[0].id && !i.options.length);
      if(same && same.quantity>=30) throw new Error("Maximum 30 exemplaires par article.");
      if(same) same.quantity++; else cart.push({variant_id:variants[0].id,quantity:1,options:[]});
      persist(); cartDialog.showModal(); renderCart();
    } else openProduct(id);
  } catch (error) {
    toast(error.message);
  } finally { button.disabled=false; }
});
function renderCart() {
  const content = document.querySelector("#cart-content");
  if (!cart.length) {
    checkoutStep=1;checkoutFields={};
    content.innerHTML =
      '<div class="commerce-empty"><h3>Le prochain équipement se choisit ici.</h3><p>Votre panier est vide. Découvrez la sélection puis choisissez vos tailles et options.</p></div><button type="button" id="continue-shopping">Continuer ma sélection →</button>';
    document.querySelector("#continue-shopping").onclick = () =>
      cartDialog.close();
    return;
  }
  const allValid = cart.every(validLine);
  content.innerHTML = `<ol class="commerce-checkout-steps" aria-label="Étapes de commande"><li id="cart-step-selection" aria-current="${checkoutStep===1?'step':'false'}">1. Votre panier</li><li id="cart-step-details" aria-current="${checkoutStep===2?'step':'false'}">2. Coordonnées et paiement</li></ol>${catalogue.environment === "sandbox" ? '<p class="commerce-message">Environnement de test : paiements HelloAsso Sandbox.</p>' : ""}${cart
    .map((line, index) => {
      const v = variantFor(line),
        p = catalogue.products.find((p) => p.id === v?.product_id);
      return `<div class="commerce-cart-line">${p?.image_key?`<img class="commerce-cart-image" src="/media/${encodeURIComponent(p.image_key).replace(/%2F/g,"/")}" alt="">`:'<span class="commerce-cart-placeholder" aria-hidden="true">—</span>'}<div><strong>${esc(p?.name || "Article indisponible")}</strong><small>${esc(v?.label || "Modèle indisponible")}${v?.color?` · ${esc(v.color)}`:""} · Quantité : ${line.quantity}${catalogue.pricing_mode==='coach'?` · ${v?.price_kind==='coach'?'Tarif coach':'Tarif FCE'}`:''}</small>${line.options.map((o) => `<small>${esc(catalogue.options.find((x) => x.id === o.id)?.label || "Option indisponible")}${o.text ? ` : <b>${esc(o.text)}</b>` : ""}</small>`).join("")}${!validLine(line) ? '<p class="commerce-error commerce-message">Cette sélection doit être retirée ou modifiée.</p>' : ""}</div><div class="commerce-cart-price"><strong>${money(unit(line) * line.quantity)}</strong><div class="commerce-actions">${v ? `<button type="button" class="commerce-secondary" data-edit="${index}">Modifier</button>` : ""}<button type="button" class="commerce-secondary" data-remove="${index}">Retirer</button></div></div></div>`;
    })
    .join(
      "",
    )}<div class="commerce-actions"><button type="button" id="continue-selection" class="commerce-secondary">← Continuer mes achats</button></div><div class="commerce-cart-summary"><div class="commerce-total"><span>Total articles</span><span>${money(total())}</span></div><p class="commerce-help">Remise gratuite · Prix recalculés à partir du catalogue actuel · Paiement exclusivement HelloAsso</p></div>${!catalogue.checkout_available ? `<p class="commerce-message">${esc(catalogue.checkout_unavailable?.message||"Le paiement n’est pas encore disponible. Votre panier est conservé.")}</p>` : ""}
<div class="commerce-cart-next" id="cart-next" ${checkoutStep===2?'hidden':''}><button id="cart-to-checkout" type="button" ${!allValid||!catalogue.checkout_available?'disabled':''}>Passer à la commande →</button></div>
 <form id="checkout-form" class="commerce-checkout" ${checkoutStep===1?'hidden':''}><div class="commerce-checkout-title"><h3>Vos coordonnées</h3><button id="cart-back" type="button" class="commerce-secondary">← Revoir mon panier</button></div><p>Sans compte ni mot de passe. Le récapitulatif et le lien de suivi seront envoyés à votre adresse e-mail.</p><div class="commerce-form-grid"><label>Prénom *<input name="first_name" autocomplete="given-name" maxlength="80" required></label><label>Nom *<input name="last_name" autocomplete="family-name" maxlength="80" required></label><label>E-mail *<input name="email" type="email" autocomplete="email" maxlength="254" required></label><label>Téléphone *<input name="phone" type="tel" autocomplete="tel" maxlength="30" required></label></div><fieldset><legend>Comment récupérer vos articles ?</legend><label class="commerce-check"><input name="delivery_method" type="radio" value="coach" checked><span>Par le coach de mon équipe</span></label><label class="commerce-check" style="margin-top:14px"><input name="delivery_method" type="radio" value="club"><span>Sur rendez-vous au club</span></label><p class="commerce-help">${esc(catalogue.collection_address)} · Au plus tard ${catalogue.delivery_days} jours après confirmation du paiement.</p></fieldset><div class="commerce-form-grid"><label><span>Nom du licencié <abbr class="commerce-required" data-coach-required title="obligatoire">*</abbr></span><input name="licensed_name" maxlength="120" required></label><label><span>Équipe / catégorie <abbr class="commerce-required" data-coach-required title="obligatoire">*</abbr></span><input name="team" placeholder="Ex. U11, Seniors féminines…" maxlength="80" required></label></div><p class="commerce-help">Le club utilise ces informations pour exécuter votre commande et organiser sa remise. Seules les données nécessaires sont partagées avec HelloAsso, les prestataires et les personnes habilitées. Aucun compte ni inscription publicitaire n’est créé. <a href="/confidentialite/" target="_blank" rel="noopener">Durées de conservation et vos droits</a>.</p><label class="commerce-check"><input type="checkbox" name="accept_terms" required><span>J’ai lu et j’accepte les <a href="/cgv/" target="_blank" rel="noopener">conditions générales de vente</a>, notamment les délais et les conditions applicables aux articles personnalisés. *</span></label><p class="commerce-help">Vérifiez les tailles, les personnalisations et votre adresse e-mail avant de payer. Sur HelloAsso, une contribution volontaire peut être proposée ; elle est distincte de votre panier et peut être retirée ou modifiée.</p><p id="checkout-error" role="alert" tabindex="-1" hidden></p><div id="checkout-recovery"></div><button type="submit" ${!allValid || !catalogue.checkout_available ? "disabled" : ""}>Commander et payer ${money(total())} avec HelloAsso →</button><p class="commerce-help">Les champs marqués * sont obligatoires. Le panier est conservé dans cet onglet jusqu’à sa fermeture.</p></form>`;
  content.querySelectorAll("[data-remove]").forEach(
    (b) =>
      (b.onclick = () => {
        cart.splice(Number(b.dataset.remove), 1);
        persist();
        renderCart();
      }),
  );
  content
    .querySelectorAll("[data-edit]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          openProduct(
            variantFor(cart[Number(b.dataset.edit)]).product_id,
            Number(b.dataset.edit),
          )),
    );
  document.querySelector("#continue-selection").onclick=()=>cartDialog.close();
  const form = document.querySelector("#checkout-form");
  const setStep=step=>{checkoutStep=step;form.hidden=step===1;document.querySelector('#cart-next').hidden=step===2;document.querySelector('#cart-step-selection').setAttribute('aria-current',step===1?'step':'false');document.querySelector('#cart-step-details').setAttribute('aria-current',step===2?'step':'false');if(step===2){form.querySelector('input')?.focus();}else document.querySelector('#cart-to-checkout').focus();};
  document.querySelector('#cart-to-checkout').onclick=()=>setStep(2);
  document.querySelector('#cart-back').onclick=()=>setStep(1);
  for(const input of form.querySelectorAll('input')) {
    const value=checkoutFields[input.name];if(value===undefined)continue;
    if(input.type==='radio')input.checked=input.value===value;
    else if(input.type==='checkbox')input.checked=!!value;
    else input.value=value;
  }
  form.addEventListener('input',()=>{checkoutFields=Object.fromEntries(new FormData(form));checkoutFields.accept_terms=form.elements.accept_terms.checked;});

  const updateDelivery = () => {
    const coach = form.elements.delivery_method.value === "coach";
    for (const name of ["licensed_name", "team"])
      form.elements[name].required = coach;
    form
      .querySelectorAll("[data-coach-required]")
      .forEach((n) => (n.hidden = !coach));
  };
  form.addEventListener("change", updateDelivery);updateDelivery();
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const button = form.querySelector("button[type=submit]"),
      errorNode = document.querySelector("#checkout-error");
    button.disabled = true;
    button.textContent = "Préparation du paiement…";
    errorNode.hidden = true;
    const fields = Object.fromEntries(new FormData(form));
    const data = {
      ...fields,
      accept_terms: true,
      terms_version: catalogue.terms_version,
      items: cart,
      expected_total: total(),
      pricing_mode: catalogue.pricing_mode || "fce",
    };
    const bytes = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(data)),
      ),
      fingerprint = Array.from(new Uint8Array(bytes), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("");
    let draft = readStorage("fce-checkout-draft");
    if (draft && draft.fingerprint !== fingerprint) {
      showError(
        errorNode,
        new Error(
          "Une validation précédente reste à vérifier. Retrouvez-la depuis le mail reçu ou la page de suivi avant de créer une autre commande.",
        ),
      );
      button.textContent = "Commande précédente à vérifier";
      document.querySelector("#checkout-recovery").innerHTML =
        '<p><a href="/boutique/suivi/">Retrouver ma commande →</a></p>';
      return;
    }
    if (!draft) {
      draft = { key: crypto.randomUUID(), fingerprint };
      saveStorage("fce-checkout-draft", draft);
    }
    data.idempotency_key = draft.key;
    const remember = (result) => {
      const link = { id: result.order_id, token: result.tracking_token };
      saveStorage("fce-order-link", link);
      return `/boutique/suivi/#${link.id}.${link.token}`;
    };
    try {
      const result = await api("/api/shop/checkout", { method: "POST", data });
      const follow = remember(result);
      if (result.redirect_url) location.assign(result.redirect_url);
      else location.assign(follow);
    } catch (error) {
      showError(errorNode, error);
      if (error.order_id) {
        const link = remember(error);
        document.querySelector("#checkout-recovery").innerHTML =
          `<p>Commande <strong>${esc(error.reference)}</strong> enregistrée. <a href="${esc(link)}">Ouvrir le suivi sécurisé →</a></p>`;
      } else if (
        error.status &&
        error.status < 500 &&
        error.code !== "IDEMPOTENCY_CONFLICT"
      ) {
        try {
          sessionStorage.removeItem("fce-checkout-draft");
        } catch {}
      }
      if(error.code==='COACH_SESSION'){
        const recovery=document.querySelector('#checkout-recovery');recovery.innerHTML='<button type="button" class="commerce-secondary" id="restore-coach">Renseigner mon code coach</button>';
        recovery.querySelector('button').onclick=async()=>{cartDialog.close();try{await loadCatalogue();const host=document.querySelector('#coach-access');if(host&&!host.hidden){host.querySelector('details')?.setAttribute('open','');host.scrollIntoView({behavior:'smooth',block:'center'});host.querySelector('input')?.focus();}else toast('Le club a désactivé l’accès coach. Votre panier reste disponible au tarif FCE.');}catch(error){toast(error.message);}};
      }
      button.disabled = false;
      button.textContent = "Réessayer avec le même panier";
    }
  });
}
async function showCart() {
  cartDialog.showModal();
  document.querySelector("#cart-content").innerHTML =
    '<p role="status">Actualisation de votre panier…</p>';
  try {
    await loadCatalogue();
    renderCart();
  } catch (error) {
    document.querySelector("#cart-content").innerHTML =
      `<p role="alert" class="commerce-message commerce-error">${esc(error.message)}</p><p>Votre panier est conservé. Fermez cette fenêtre et réessayez.</p>`;
  }
}
document.querySelector("#open-cart").onclick = showCart;
document.querySelector("#show-cart").onclick = showCart;

document.addEventListener("click", async event => {
  const button=event.target.closest("[data-product-detail]"); if(!button)return;
  const dialog=document.querySelector("#detail-dialog"), content=document.querySelector("#detail-content");
  content.textContent="Chargement de la fiche article…"; dialog.showModal();
  try {
    await loadCatalogue();const p=catalogue.products.find(p=>p.id===Number(button.dataset.productDetail));
    if(!p)throw new Error("Cet article n’est plus disponible.");
    const variants=catalogue.variants.filter(v=>v.product_id===p.id),options=catalogue.options.filter(o=>o.product_id===p.id);
    const plain=value=>String(value||'').replace(/\[\/?(?:bordeaux|or)\]/gi,'').replace(/\*\*/g,'');
    content.innerHTML=`<p class="eyebrow">La fiche de votre équipement</p><h2 id="detail-title">${esc(p.name)}</h2><img class="detail-image" src="/media/${encodeURIComponent(p.image_key).replace(/%2F/g,'/')}" alt="${esc(p.name)}"><p class="detail-description">${esc(plain(p.description||p.short_description||'Le club vous renseignera sur la composition et l’entretien de cet article.'))}</p><h3>Tailles et tarifs</h3><ul>${variants.map(v=>`<li>${esc(v.label)} ${esc(v.color)} ${priceMarkup([v])}</li>`).join('')||'<li>Tarifs de commande à venir.</li>'}</ul>${options.length?`<h3>Personnalisations disponibles</h3><ul>${options.map(o=>`<li>${esc(o.label)} : ${o.price_cents?'+ '+money(o.price_cents):'inclus'}</li>`).join('')}</ul>`:''}${p.delivery_delay?`<p>Délai indicatif : ${esc(p.delivery_delay)}</p>`:''}<button type="button" id="detail-order" ${variants.length?'':'disabled'}>${variants.length?(variants.length===1&&!options.length?"Ajouter au panier":"Choisir ma taille et mes options"):"Tailles et tarifs bientôt disponibles"} →</button>`;
    document.querySelector("#detail-order").onclick=()=>{dialog.close();if(variants.length===1 && !options.length){const same=cart.find(i=>i.variant_id===variants[0].id&&!i.options.length);if(same && same.quantity>=30){toast('Maximum 30 exemplaires par article.');return;}if(same)same.quantity++;else cart.push({variant_id:variants[0].id,quantity:1,options:[]});persist();cartDialog.showModal();renderCart();}else openProduct(p.id);};
  }catch(error){content.textContent=error.message;}
});

const shopHeader=document.querySelector('.site-header');
if(shopHeader&&typeof ResizeObserver!=='undefined')new ResizeObserver(()=>document.documentElement.style.setProperty('--shop-header-height',`${shopHeader.getBoundingClientRect().height}px`)).observe(shopHeader);

document.addEventListener('shop-loaded',event=>{const data=event.detail;if(data&&Array.isArray(data.products)&&Array.isArray(data.variants)&&Array.isArray(data.options)){catalogue=data;persist();}});

function coachAccess() {
  let host=document.querySelector('#coach-access');
  if(!host){host=document.createElement('section');host.id='coach-access';host.className='shop-coach-access';const target=document.querySelector('#shop-browse');if(!target)return;target.before(host);}
  if(!catalogue?.coach_access_enabled&&catalogue?.pricing_mode!=='coach'){host.hidden=true;return;}
  host.hidden=false;
  if(catalogue.pricing_mode==='coach'){
    host.innerHTML='<p>Tarifs coach activés <button type="button" class="commerce-secondary" id="coach-logout">Quitter les tarifs coach</button></p>';
    host.querySelector('button').onclick=async e=>{e.target.disabled=true;try{await api('/api/shop/coach/session',{method:'DELETE'});location.reload();}catch(error){e.target.disabled=false;toast(error.message);}};
  } else {
    host.innerHTML='<details><summary>Vous êtes coach ?</summary><form id="coach-code-form"><label>Code transmis par le club<input name="code" type="password" autocomplete="off" maxlength="80" required></label><button type="submit">Accéder aux tarifs coach</button><p class="commerce-help">Accès valable 8 heures sur cet appareil. Les articles sans tarif coach restent au tarif FCE.</p><p role="alert" hidden></p></form></details>';
    const form=host.querySelector('form');form.onsubmit=async e=>{e.preventDefault();if(!form.reportValidity())return;const button=form.querySelector('button');button.disabled=true;try{await api('/api/shop/coach/session',{method:'POST',data:{code:form.elements.code.value.trim()}});form.reset();location.reload();}catch(error){showError(form.querySelector('[role=alert]'),error);button.disabled=false;}};
  }
}
document.addEventListener('shop-loaded',coachAccess);

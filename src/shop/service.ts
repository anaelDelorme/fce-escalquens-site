import {sortVariants,changeVariants} from "./variant-order";
import {coachConfiguration,coachSession,coachLogin,coachLogout,changeCoachCode,refreshCoachCookie} from "./coach-access";
import {
  fail,
  ShopError,
  now,
  sha256,
  trackingToken,
  uuid,
  text,
  email,
  integer,
  priceCart,
  paymentSummary,
  TERMS_VERSION,
  escapeHtml,
  euros,
  type Row,
} from "./domain";
import { defaultSettings, termsSnapshot, termsSections, type Settings } from "./terms";
import {
  body,
  environment,
  origin,
  rateLimit,
  response,
  sameOrigin,
  staff,
  secureHeaders,
} from "./security";
import { api, safeRedirect, verifiedPayments, connectionStatus } from "./helloasso";
import { drainMail, queueMail, testMail, mailQueueStatus } from "./mail";
import { mailReady, mailTransportReady } from "./mail-config";
import { smtpConfigured } from "./smtp";
import { priceLabelStatement } from "./catalogue-pricing";
export interface ShopEnv {
  DB: D1Database;
  ORDERS: D1Database;
  TOURNAMENTS?: D1Database;
  PAYMENT_DB?: D1Database;
  SITE_DB?: D1Database;
  ORDER_KIND?: "shop" | "tournament";
  ASSETS: Fetcher;
  APP_ENV?: string;
  SHOP_ORIGIN?: string;
  TRACKING_SECRET?: string;
  CF_ACCESS_ISSUER?: string;
  CF_ACCESS_SHOP_AUD?: string;
  CF_ACCESS_TOURNAMENT_AUD?: string;
  HELLOASSO_ORGANIZATION_SLUG?: string;
  DEV_ADMIN_TOKEN?: string;
  HELLOASSO_CLIENT_ID?: string;
  HELLOASSO_CLIENT_SECRET?: string;
  HELLOASSO_WEBHOOK_SECRET?: string;
  MAIL_PROVIDER?: string;
  MAIL_FROM?: string;
  MAIL_TEST_TO?: string;
  RESEND_API_KEY?: string;
  SMTP_HOST?: string;
  SMTP_USER?: string;
  SMTP_PASSWORD?: string;
  EMAIL?: {
    send(message: {
      from: { email: string; name: string };
      to: string;
      replyTo: string;
      subject: string;
      text: string;
      html: string;
    }): Promise<{ messageId: string }>;
  };
}
export async function settings(
  env: ShopEnv,
): Promise<Settings & { version: number }> {
  const row = await (env.PAYMENT_DB||env.ORDERS).prepare(
    "SELECT data,version FROM settings WHERE id=1",
  ).first<Row>();
  return {
    ...defaultSettings,
    ...JSON.parse(row?.data || "{}"),
    organization_slug: JSON.parse(row?.data || "{}").organization_slug || env.HELLOASSO_ORGANIZATION_SLUG || "",
    version: row?.version || 0,
  };
}
async function catalogue(env: ShopEnv, coach=false) {
  const result = await env.DB.batch<Row>([
    env.DB.prepare(
      "SELECT p.id,p.shop_category_id,p.display_order,p.name,p.short_description,p.description,p.price_label,p.price_details,p.sizes,p.options,p.delivery_delay,p.image_key,p.active FROM shop_products p WHERE p.active=1 AND p.image_key<>'' AND (p.shop_category_id IS NULL OR EXISTS(SELECT 1 FROM shop_categories c WHERE c.id=p.shop_category_id AND c.active=1)) ORDER BY p.display_order,p.name",
    ),
    env.DB.prepare(
      `SELECT id,product_id,label,size,color,sku,supplier,display_order,price_cents AS fce_price_cents,catalogue_price_cents,${coach?'COALESCE(coach_price_cents,price_cents)':'price_cents'} AS price_cents,${coach?"CASE WHEN coach_price_cents IS NOT NULL THEN 'coach' ELSE 'fce' END":"'fce'"} AS price_kind,active FROM shop_variants WHERE active=1 ORDER BY product_id,label`,
    ),
    env.DB.prepare(
      "SELECT * FROM shop_options WHERE active=1 ORDER BY product_id,label",
    ),
    env.DB.prepare("SELECT id,name,display_order FROM shop_categories WHERE active=1 ORDER BY display_order,name"),
  ]);
  const ids = new Set(result[0].results.map((p) => p.id));
  return {
    pricing_mode: coach?"coach":"fce",
    products: result[0].results,
    categories: result[3].results,
    variants: sortVariants(result[1].results.filter((v) => ids.has(v.product_id))),
    options: result[2].results.filter((o) => ids.has(o.product_id)),
  };
}
async function openForSales(env: ShopEnv, s: Settings) {
  const shop = await env.DB.prepare(
    "SELECT shop_enabled FROM shop_settings WHERE id=1",
  ).first<Row>();
  if (!shop || !shop.shop_enabled)
    fail(
      "SHOP_CLOSED",
      503,
      "La boutique est masquée par le club. Votre panier est conservé.",
    );
  if(!s.checkout_enabled)fail("CHECKOUT_DISABLED",503,"Le paiement n’est pas encore activé par le club. Votre panier est conservé.");
  if (
    !s.legal_ready ||
    !s.seller_address ||
    !s.seller_id ||
    !s.seller_phone ||
    !s.collection_address
  )
    fail(
      "LEGAL_CONFIG",
      503,
      "La boutique prépare son ouverture. Votre panier est conservé.",
    );
  if (
    !s.organization_slug ||
    !env.HELLOASSO_CLIENT_ID ||
    !env.HELLOASSO_CLIENT_SECRET ||
    (env.TRACKING_SECRET || "").length < 32
  )
    fail("PAYMENT_CONFIG", 503, "Le paiement est en cours de configuration.");
  if (!mailReady(env))
    fail(
      "MAIL_CONFIG",
      503,
      "L’envoi des confirmations est en cours de configuration.",
    );
  origin(env);
}
async function shopAvailability(env:ShopEnv,s:Settings){try{await openForSales(env,s);return {ready:true,code:'READY',message:'Le paiement est ouvert.'};}catch(error){return {ready:false,code:error instanceof ShopError?error.code:'CONFIGURATION',message:error instanceof ShopError?error.message:'La configuration doit être vérifiée.'};}}
async function adminShopAvailability(env: ShopEnv,s:Settings) {
  const availability=await shopAvailability(env,s);
  const missing: {key:string;label:string}[]=[];
  const add=(condition:boolean,key:string,label:string)=>{if(condition)missing.push({key,label});};
  const shop=await env.DB.prepare('SELECT shop_enabled FROM shop_settings WHERE id=1').first<Row>();
  add(!shop?.shop_enabled,'shop_enabled','Activer l’affichage de la boutique dans Couverture et affichage.');
  add(!s.checkout_enabled,'checkout_enabled','Cocher l’ouverture de la prise de commandes.');
  add(!s.legal_ready,'legal_ready','Confirmer la vérification des coordonnées, CGV et informations sur les données.');
  add(!s.seller_address,'seller_address','Renseigner l’adresse du vendeur.');
  add(!s.seller_id,'seller_id','Renseigner le RNA / SIRET ou les mentions applicables au club.');
  add(!s.seller_phone,'seller_phone','Renseigner le téléphone de contact.');
  add(!s.collection_address,'collection_address','Renseigner l’adresse de retrait au club.');
  add(!s.organization_slug,'organization_slug','Renseigner le slug de l’association HelloAsso.');
  add(!env.HELLOASSO_CLIENT_ID||!env.HELLOASSO_CLIENT_SECRET,'helloasso_credentials','Configurer les identifiants HelloAsso du Worker.');
  add((env.TRACKING_SECRET||'').length<32,'tracking_secret','Configurer la clé de suivi du Worker.');
  add(!env.MAIL_FROM,'mail_from','Configurer l’adresse d’expédition des e-mails (MAIL_FROM).');
  add(!['cloudflare','resend','ovh'].includes(env.MAIL_PROVIDER||''),'mail_provider','Choisir le transport d’e-mails (MAIL_PROVIDER).');
  add(env.MAIL_PROVIDER==='cloudflare'&&!env.EMAIL,'mail_binding','Ajouter le binding EMAIL pour l’envoi Cloudflare.');
  add(env.MAIL_PROVIDER==='resend'&&!env.RESEND_API_KEY,'mail_api_key','Configurer la clé du service d’envoi Resend.');
  add(env.MAIL_PROVIDER==='ovh'&&!smtpConfigured(env),'mail_smtp','Configurer SMTP_HOST, SMTP_USER et le secret SMTP_PASSWORD ; MAIL_FROM doit correspondre à la boîte OVH.');
  add(env.APP_ENV!=='production'&&!env.MAIL_TEST_TO,'mail_test_to','Renseigner le destinataire des mails de test (MAIL_TEST_TO).');
  try{origin(env);}catch{missing.push({key:'origin',label:'Configurer l’origine exacte du site (SHOP_ORIGIN).'});}
  return {...availability,missing};
}
export const event = (
  env: ShopEnv,
  id: string,
  kind: string,
  actor: string,
  message: string,
) =>
  env.ORDERS.prepare(
    "INSERT INTO order_events(id,order_id,kind,actor,message,created_at) VALUES(?,?,?,?,?,?)",
  ).bind(crypto.randomUUID(), id, kind, actor, message, now());
export async function findOrder(env: ShopEnv, id: string) {
  const order = await env.ORDERS.prepare("SELECT * FROM orders WHERE id=?")
    .bind(uuid(id))
    .first<Row>();
  if (!order)
    fail(
      "ORDER_NOT_FOUND",
      404,
      "Cette commande est introuvable. Vérifiez le lien reçu par e-mail.",
    );
  return order;
}
export async function customerOrder(request: Request, env: ShopEnv, id: string) {
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!token)
    fail(
      "LINK_INVALID",
      404,
      "Ce lien de suivi est invalide ou a expiré. Demandez un nouveau lien.",
    );
  const hash = await sha256(token);
  const order = await env.ORDERS.prepare(
    "SELECT * FROM orders WHERE id=? AND token_hash=? AND token_expires>?",
  )
    .bind(uuid(id), hash, now())
    .first<Row>();
  if (!order)
    fail(
      "LINK_INVALID",
      404,
      "Ce lien de suivi est invalide ou a expiré. Demandez un nouveau lien.",
    );
  return order;
}
export async function detail(env: ShopEnv, order: Row, admin = false) {
  const [items, events, survey, mails, attempts] = await env.ORDERS.batch<Row>([
    env.ORDERS.prepare(
      "SELECT * FROM order_items WHERE order_id=? ORDER BY id",
    ).bind(order.id),
    env.ORDERS.prepare(
      "SELECT kind,message,created_at,actor FROM order_events WHERE order_id=? ORDER BY created_at DESC,id DESC LIMIT 100",
    ).bind(order.id),
    env.ORDERS.prepare(
      "SELECT ease,catalogue,overall,comment,created_at FROM surveys WHERE order_id=?",
    ).bind(order.id),
    env.ORDERS.prepare(
      "SELECT id,kind,audience,recipient,status,attempts,last_error,sent_at FROM outbox WHERE order_id=? ORDER BY available_at DESC",
    ).bind(order.id),
    env.ORDERS.prepare(
      "SELECT id,intent_id,provider_order_id,state,created_at,last_error FROM checkout_attempts WHERE order_id=? ORDER BY created_at DESC",
    ).bind(order.id),
  ]);
  const safeOrder = admin
    ? { ...order }
    : Object.fromEntries(
        [
          "id",
          "kind",
          "reference",
          "first_name",
          "licensed_name",
          "team",
          "delivery_method",
          "total_cents",
          "payment_status",
          "fulfillment",
          "public_note",
          "created_at",
          "paid_at",
          "terms_version",
          "terms_snapshot",
        ].map((k) => [k, order[k]]),
      );
  delete safeOrder.token_hash;
  delete safeOrder.request_hash;
  return {
    order: safeOrder,
    items: items.results.map((i) => ({
      ...i,
      options: JSON.parse(i.options_json),
      options_json: undefined,
    })),
    events: events.results
      .filter(
        (e) => admin || ["created", "payment", "fulfillment"].includes(e.kind),
      )
      .map((e) =>
        admin
          ? e
          : { kind: e.kind, message: e.message, created_at: e.created_at },
      ),
    survey: survey.results[0] || null,
    ...(order.kind === "tournament" ? {registration: await env.ORDERS.prepare("SELECT tournament_name,club_name,team_name,category,registration_status,payment_deadline,answers_json,form_snapshot,team_count,sections_json,payment_method,cheque_snapshot FROM tournament_registrations WHERE order_id=?").bind(order.id).first()} : {}),
    ...(admin ? { mails: mails.results, attempts: attempts.results } : {}),
  };
}
async function createOrder(request: Request, env: ShopEnv, s: Settings) {
  await openForSales(env, s);
  await rateLimit(
    env,
    `checkout:${request.headers.get("cf-connecting-ip") || "local"}`,
    12,
  );
  const data = await body(request);
  const id = uuid(data.idempotency_key);
  if (data.terms_version !== TERMS_VERSION || data.accept_terms !== true)
    fail(
      "TERMS",
      400,
      "Veuillez lire et accepter les conditions générales de vente à jour.",
    );
  const customer = {
    email: email(data.email),
    first_name: text(data.first_name, 80, true),
    last_name: text(data.last_name, 80, true),
    phone: text(data.phone, 30, true),
    licensed_name: text(data.licensed_name || "", 120),
    team: text(data.team || "", 80),
    delivery_method: data.delivery_method,
  };
  if (!/^[+0-9 ().-]{6,30}$/.test(customer.phone))
    fail("PHONE", 400, "Vérifiez le numéro de téléphone.");
  if (
    !["coach", "club"].includes(customer.delivery_method) ||
    (customer.delivery_method === "coach" &&
      (!customer.team || !customer.licensed_name))
  )
    fail(
      "DELIVERY",
      400,
      "Pour une remise par le coach, indiquez le licencié et son équipe.",
    );
  // Hash submitted choices independently of live catalogue: a retry must return its original snapshot.
  const requestHash = await sha256(
    JSON.stringify({ customer, items: data.items, terms: TERMS_VERSION,...(data.pricing_mode==='coach'?{coach:true}:{}) }),
  );
  let order = await env.ORDERS.prepare("SELECT * FROM orders WHERE id=?")
    .bind(id)
    .first<Row>();
  if (order && order.request_hash !== requestHash)
    fail(
      "IDEMPOTENCY_CONFLICT",
      409,
      "Ce panier a été modifié après sa validation. Retrouvez d’abord la commande déjà enregistrée.",
    );
  if (!order) {
    const coach=data.pricing_mode==='coach';
    if(coach&&!await coachSession(request,env))fail('COACH_SESSION',403,'Votre accès coach n’est plus actif sur ce navigateur. Renseignez le code à nouveau avant de commander.');
    const cat = await catalogue(env,coach);
    const priced = priceCart(
      data.items,
      cat.variants,
      cat.options,
      cat.products,
    );
    if (data.expected_total !== priced.total)
      fail(
        "PRICE_CHANGED",
        409,
        "Le prix ou une option a changé. Actualisez votre panier avant de payer.",
      );
    const token = await trackingToken(env.TRACKING_SECRET || "", id, 1);
    const reference = `FCE-${new Date().getFullYear()}-${id.replaceAll("-", "").slice(0, 12).toUpperCase()}`;
    const stamp = now();
    // All child writes are guarded by the unique id; racing duplicate requests cannot duplicate lines or mails.
    const statements = [
      env.ORDERS.prepare(
        `INSERT OR IGNORE INTO orders(id,reference,request_hash,token_hash,token_expires,email,first_name,last_name,phone,licensed_name,team,delivery_method,total_cents,terms_version,terms_snapshot,terms_accepted_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        id,
        reference,
        requestHash,
        await sha256(token),
        stamp + 180 * 86400,
        customer.email,
        customer.first_name,
        customer.last_name,
        customer.phone,
        customer.licensed_name,
        customer.team,
        customer.delivery_method,
        priced.total,
        TERMS_VERSION,
        termsSnapshot(s),
        stamp,
        stamp,
        stamp,
      ),
    ];
    // Deterministic item ids make INSERT OR IGNORE safe for a duplicate transaction.
    priced.items.forEach((i, index) =>
      statements.push(
        env.ORDERS.prepare(
          "INSERT OR IGNORE INTO order_items(id,order_id,product_id,variant_id,name,sku,supplier,size,color,options_json,unit_cents,quantity) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT request_hash FROM orders WHERE id=?)=?",
        ).bind(
          `${id}:${index}`,
          id,
          i.product_id,
          i.variant_id,
          i.name,
          i.sku,
          i.supplier,
          i.size,
          i.color,
          JSON.stringify(i.options),
          i.unit_cents,
          i.quantity,
          id,
          requestHash,
        ),
      ),
    );
    statements.push(
      env.ORDERS.prepare(
        "INSERT OR IGNORE INTO order_events(id,order_id,kind,actor,message,created_at) SELECT ?,?,'created','client',?,? WHERE (SELECT request_hash FROM orders WHERE id=?)=?",
      ).bind(`created:${id}`, id, coach?'Commande enregistrée avec accès coach. Tarif FCE conservé pour les articles sans tarif coach.':'Commande enregistrée, en attente de paiement.', stamp, id, requestHash),
    );
    statements.push(
      env.ORDERS.prepare(
        "INSERT OR IGNORE INTO outbox(id,order_id,kind,available_at) SELECT ?,?,'created',? WHERE (SELECT request_hash FROM orders WHERE id=?)=?",
      ).bind(`created:${id}`, id, stamp, id, requestHash),
    );
    await env.ORDERS.batch(statements);
    order = await findOrder(env, id);
    if (order.request_hash !== requestHash)
      fail(
        "IDEMPOTENCY_CONFLICT",
        409,
        "Une autre commande est déjà associée à cette référence.",
      );
  }
  const token = await trackingToken(
    env.TRACKING_SECRET || "",
    id,
    order.token_version,
  );
  let result: Row;
  try {
    result = await checkout(env, s, order, token);
  } catch (error) {
    if (error instanceof ShopError)
      return response(
        {
          error: error.message,
          code: error.code,
          order_id: id,
          reference: order.reference,
          tracking_token: token,
        },
        error.status,
      );
    return response(
      {
        error:
          "Le service de paiement n’a pas répondu. Votre commande est conservée : consultez son suivi avant de réessayer.",
        code: "PAYMENT_UNCERTAIN",
        order_id: id,
        reference: order.reference,
        tracking_token: token,
      },
      503,
    );
  }
  return response({
    order_id: id,
    reference: order.reference,
    tracking_token: token,
    ...result,
  });
}
export async function checkout(
  env: ShopEnv,
  s: Settings,
  order: Row,
  token: string,
): Promise<Row> {
  if (order.fulfillment === "cancelled")
    fail("ORDER_CANCELLED", 409, "Cette commande a été annulée.");
  if (order.payment_status === "paid") return { paid: true };
  if (order.kind === "tournament") {
    const registration=await env.ORDERS.prepare("SELECT payment_deadline,payment_method FROM tournament_registrations WHERE order_id=?").bind(order.id).first<Row>();
    if(registration?.payment_method==='cheque')fail("CHEQUE_PAYMENT",409,"Le règlement de cette inscription est prévu par chèque. Consultez les instructions dans votre suivi.");
    if(registration?.payment_deadline && registration.payment_deadline<now())fail("PAYMENT_DEADLINE",409,"La date limite de paiement est passée. Contactez le club.");
  }

  if (
    [
      "review",
      "contested",
      "refunding",
      "partially_refunded",
      "refunded",
    ].includes(order.payment_status)
  )
    fail(
      "PAYMENT_REVIEW",
      409,
      "Le club doit vérifier cette commande avant tout nouveau paiement.",
    );
  const active = await env.ORDERS.prepare(
    "SELECT * FROM checkout_attempts WHERE order_id=? AND state IN ('creating','pending','uncertain') ORDER BY created_at DESC LIMIT 1",
  )
    .bind(order.id)
    .first<Row>();
  if (active) {
    if (active.intent_id) {
      await reconcile(env, s, order.id);
      const updated = await findOrder(env, order.id);
      if (updated.payment_status === "paid") return { paid: true };
      if (
        updated.payment_status !== "pending" &&
        updated.payment_status !== "refused"
      )
        fail(
          "PAYMENT_REVIEW",
          409,
          "Le paiement est en cours de vérification. Contactez le club.",
        );
      const intent = await api(
        env,
        `/organizations/${encodeURIComponent(s.organization_slug)}/checkout-intents/${active.intent_id}`,
      );
      if (!intent.order && active.created_at < now() - 45 * 60) {
        await env.ORDERS.prepare(
          "UPDATE checkout_attempts SET state='expired' WHERE id=? AND state='pending'",
        )
          .bind(active.id)
          .run();
      } else if (intent.redirectUrl && !intent.order)
        return { redirect_url: safeRedirect(env, intent.redirectUrl) };
      else
        fail(
          "PAYMENT_PENDING",
          409,
          "La confirmation du paiement est en cours. Actualisez le suivi dans quelques instants.",
        );
    } else
      fail(
        "PAYMENT_UNCERTAIN",
        409,
        "La demande de paiement est en cours ou nécessite une vérification. Consultez le suivi ou contactez le club avant de payer à nouveau.",
      );
  }
  const attemptId = crypto.randomUUID();
  try {
    await env.ORDERS.prepare(
      "INSERT INTO checkout_attempts(id,order_id,created_at) VALUES(?,?,?)",
    )
      .bind(attemptId, order.id, now())
      .run();
  } catch {
    return fail(
      "PAYMENT_PENDING",
      409,
      "Une demande de paiement est déjà en cours. Actualisez le suivi.",
    );
  }
  try {
    const link = `${origin(env)}/paiements/retour/?order=${order.id}&context=${order.kind === "tournament" ? "tournois" : "boutique"}`;
    const result = await api(
      env,
      `/organizations/${encodeURIComponent(s.organization_slug)}/checkout-intents`,
      "POST",
      {
        totalAmount: order.total_cents,
        initialAmount: order.total_cents,
        itemName: `${order.kind === "tournament" ? "Tournoi" : "Boutique"} FCE — ${order.reference}`,
        containsDonation: false,
        backUrl: link,
        returnUrl: link,
        errorUrl: link,
        payer: {
          firstName: order.first_name,
          lastName: order.last_name,
          email: order.email,
        },
        metadata: {
          order_id: order.id,
          attempt_id: attemptId,
          reference: order.reference,
        },
      },
    );
    if (!Number.isSafeInteger(result.id) || result.id <= 0)
      fail(
        "HELLOASSO_RESPONSE",
        502,
        "Réponse HelloAsso incomplète. Contactez le club avant de recommencer.",
      );
    const redirect = safeRedirect(env, result.redirectUrl);
    await env.ORDERS.prepare(
      "UPDATE checkout_attempts SET intent_id=?,redirect_url=?,state='pending' WHERE id=?",
    )
      .bind(result.id, redirect, attemptId)
      .run();
    return { redirect_url: redirect };
  } catch (error) {
    const rejected =
      error instanceof ShopError &&
      ["HELLOASSO_REJECTED", "HELLOASSO_AUTH", "HELLOASSO_CONFIG"].includes(
        error.code,
      );
    await env.ORDERS.prepare(
      "UPDATE checkout_attempts SET state=?,last_error=? WHERE id=?",
    )
      .bind(
        rejected ? "failed" : "uncertain",
        rejected ? "HELLOASSO_REJECTED" : "PAYMENT_UNCERTAIN",
        attemptId,
      )
      .run();
    throw error;
  }
}
export async function reconcile(env: ShopEnv, s: Settings, id: string) {
  // Lease avoids concurrent stale recomputations of payment totals.
  const lock = await env.ORDERS.prepare(
    "UPDATE orders SET last_checked=? WHERE id=? AND last_checked<? RETURNING id",
  )
    .bind(now() + 60, id, now())
    .first();
  if (!lock) return;
  try {
    const order = await findOrder(env, id);
    const attempts = (
      await env.ORDERS.prepare(
        "SELECT * FROM checkout_attempts WHERE order_id=? AND intent_id IS NOT NULL",
      )
        .bind(id)
        .all<Row>()
    ).results;
    for (const attempt of attempts) {
      const verified = await verifiedPayments(
        env,
        s,
        attempt,
        order.total_cents,
      );
      if (!verified) {
        if (attempt.created_at < now() - 45 * 60)
          await env.ORDERS.prepare(
            "UPDATE checkout_attempts SET state='expired' WHERE id=? AND state='pending'",
          )
            .bind(attempt.id)
            .run();
        continue;
      }
      const statements = verified.payments.map((p) =>
        env.ORDERS.prepare(
          `INSERT INTO payments(id,order_id,attempt_id,state,amount_cents,refunded_cents,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,amount_cents=excluded.amount_cents,refunded_cents=excluded.refunded_cents,updated_at=excluded.updated_at WHERE payments.order_id=excluded.order_id AND payments.attempt_id=excluded.attempt_id`,
        ).bind(
          p.id,
          id,
          attempt.id,
          p.state,
          p.amount,
          String(p.state).toLowerCase() === "refunded"
            ? p.amount
            : (p.refundOperations || [])
                .filter(
                  (r: Row) => String(r.status).toLowerCase() === "processed",
                )
                .reduce((n: number, r: Row) => n + r.amount, 0),
          now(),
        ),
      );
      statements.push(
        env.ORDERS.prepare(
          "UPDATE checkout_attempts SET provider_order_id=?,state='completed',last_error='' WHERE id=?",
        ).bind(verified.orderId, attempt.id),
      );
      await env.ORDERS.batch(statements);
    }
    const payments = (
      await env.ORDERS.prepare("SELECT * FROM payments WHERE order_id=?")
        .bind(id)
        .all<Row>()
    ).results;
    const summary = paymentSummary(
      payments.map((p) => ({
        id: p.id,
        state: p.state,
        amount: p.amount_cents,
        refundOperations: p.refunded_cents
          ? [{ status: "Processed", amount: p.refunded_cents }]
          : [],
      })),
      order.total_cents,
    );
    if (summary.status !== order.payment_status) {
      const stamp = now();
      const message =
        summary.status === "paid"
          ? "Paiement HelloAsso confirmé."
          : summary.status === "refunded"
            ? "Paiement remboursé."
            : "Le statut du paiement a changé. Le club vérifie si nécessaire les détails auprès de HelloAsso.";
      await env.ORDERS.batch([
        env.ORDERS.prepare(
          "UPDATE orders SET payment_status=?,paid_at=CASE WHEN ?='paid' THEN COALESCE(paid_at,?) ELSE paid_at END,updated_at=?,version=version+1 WHERE id=?",
        ).bind(summary.status, summary.status, stamp, stamp, id),
        event(env, id, "payment", "helloasso", message),
        env.ORDERS.prepare(
          "INSERT OR IGNORE INTO outbox(id,order_id,kind,available_at) VALUES(?,?,?,?)",
        ).bind(
          `${summary.status}:${id}:${summary.authorized}:${summary.refunded}`,
          id,
          summary.status === "paid" ? "paid" : "payment",
          stamp,
        ),
      ]);
    }
    await env.ORDERS.prepare("UPDATE orders SET reconcile_after=? WHERE id=?")
      .bind(now() + (order.created_at > now() - 7200 ? 120 : 21600), id)
      .run();
  } finally {
    await env.ORDERS.prepare("UPDATE orders SET last_checked=? WHERE id=?")
      .bind(now() + 5, id)
      .run();
  }
}
async function webhook(request: Request, env: ShopEnv, s: Settings) {
  // Accept only a bounded event; treat it as a hint and fetch all truth through OAuth API.
  const rawRequest = request.clone();
  const data = await body(request, 65536);
  if (env.HELLOASSO_WEBHOOK_SECRET) {
    const signature = request.headers.get("x-ha-signature") || "";
    if (!/^[a-f0-9]{64}$/i.test(signature))
      fail("WEBHOOK_AUTH", 401, "Notification non authentifiée.");
    // Raw body was preserved by a cloned request in the router.
    const raw = await rawRequest.text();
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(env.HELLOASSO_WEBHOOK_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      Uint8Array.from(signature.match(/../g)!, (b) => parseInt(b, 16)),
      new TextEncoder().encode(raw),
    );
    if (!valid) fail("WEBHOOK_AUTH", 401, "Notification non authentifiée.");
  }
  let hookMetadata=data.metadata;
  if(typeof hookMetadata==="string")try{hookMetadata=JSON.parse(hookMetadata);}catch{hookMetadata={};}
  let id = hookMetadata?.order_id;
  if (typeof id !== "string" || !/^[a-f0-9-]{36}$/i.test(id)) {
    const providerOrder =
      data.eventType === "Order" ? data.data?.id : data.data?.order?.id;
    const attempt = Number.isSafeInteger(providerOrder)
      ? await env.ORDERS.prepare(
          "SELECT order_id FROM checkout_attempts WHERE provider_order_id=?",
        )
          .bind(providerOrder)
          .first<Row>()
      : null;
    id = attempt?.order_id;
  }
  if (!id) return response({ ok: true });
  const order = await env.ORDERS.prepare("SELECT id FROM orders WHERE id=? AND kind=?")
    .bind(id,env.ORDER_KIND||"shop")
    .first();
  if (!order) return response({ ok: true });
  await rateLimit(env, `webhook:${id}`, 30, 60);
  // Recover a creation whose API response was lost, using authoritative provider metadata.
  const providerOrderId =
    data.eventType === "Order" ? data.data?.id : data.data?.order?.id;
  const attemptId = hookMetadata?.attempt_id;
  if (Number.isSafeInteger(providerOrderId) && typeof attemptId === "string") {
    const missing = await env.ORDERS.prepare(
      "SELECT id FROM checkout_attempts WHERE id=? AND order_id=? AND intent_id IS NULL AND state IN ('creating','uncertain')",
    )
      .bind(attemptId, id)
      .first<Row>();
    if (missing) {
      const providerOrder = await api(env, `/orders/${providerOrderId}`);
      const intentId = providerOrder.checkoutIntentId;
      if (
        Number.isSafeInteger(intentId) &&
        providerOrder.organizationSlug === s.organization_slug
      ) {
        const intent = await api(
          env,
          `/organizations/${encodeURIComponent(s.organization_slug)}/checkout-intents/${intentId}`,
        );
        const metadata =
          typeof intent.metadata === "string"
            ? JSON.parse(intent.metadata)
            : intent.metadata;
        if (metadata?.order_id === id && metadata?.attempt_id === attemptId) {
          await env.ORDERS.prepare(
            "UPDATE checkout_attempts SET intent_id=?,state='pending',last_error='' WHERE id=? AND order_id=? AND intent_id IS NULL",
          )
            .bind(intentId, attemptId, id)
            .run();
        }
      }
    }
  }
  await reconcile(env, s, id);
  return response({ ok: true });
}
async function updateFulfillment(
  request: Request,
  env: ShopEnv,
  order: Row,
  actor: string,
) {
  const data = await body(request);
  const version = integer(data.version, 0, Number.MAX_SAFE_INTEGER);
  if (
    !["new", "ordered", "partial", "ready", "delivered", "cancelled"].includes(
      data.fulfillment,
    )
  )
    fail("STATUS", 400, "État de préparation invalide.");
  if (order.payment_status !== "paid" && data.fulfillment !== "cancelled")
    fail(
      "PAYMENT_REQUIRED",
      409,
      "Seule une commande payée peut être préparée ou remise.",
    );
  if (order.fulfillment === "cancelled" && data.fulfillment !== "cancelled")
    fail("STATUS", 409, "Une commande annulée ne peut pas être relancée.");
  const items = (
    await env.ORDERS.prepare("SELECT * FROM order_items WHERE order_id=?")
      .bind(order.id)
      .all<Row>()
  ).results;
  if (
    !Array.isArray(data.items) ||
    data.items.length !== items.length ||
    new Set(data.items.map((i: Row) => i.id)).size !== items.length
  )
    fail(
      "ITEMS",
      400,
      "Toutes les lignes doivent être renseignées une seule fois.",
    );
  const updated: Row[] = items.map((i) => {
    const row = data.items.find((r: Row) => r.id === i.id);
    if (!row) fail("ITEMS", 400, "Ligne de commande manquante.");
    const received = integer(row.received, 0, i.quantity),
      delivered = integer(row.delivered, 0, received);
    return { ...i, received, delivered };
  });
  const receivedAll = updated.every((i) => i.received === i.quantity),
    deliveredAll = updated.every((i) => i.delivered === i.quantity);
  if (
    (data.fulfillment === "ready" && !receivedAll) ||
    (data.fulfillment === "delivered" && !deliveredAll) ||
    (data.fulfillment === "partial" && !updated.some((i) => i.received > 0)) ||
    (["new", "ordered"].includes(data.fulfillment) &&
      updated.some((i) => i.received > 0))
  )
    fail(
      "QUANTITIES",
      409,
      "L’état choisi ne correspond pas aux quantités reçues et remises.",
    );
  const publicNote = text(data.public_note || "", 1000),
    internalNote = text(data.internal_note || "", 2000);
  const labels: Row = {
    new: "en préparation",
    ordered: "commandée au fournisseur",
    partial: "partiellement reçue",
    ready: "disponible",
    delivered: "remise",
    cancelled: "annulée",
  };
  const statements = updated.map((i) =>
    env.ORDERS.prepare(
      "UPDATE order_items SET received=?,delivered=? WHERE id=? AND order_id=? AND (SELECT version FROM orders WHERE id=?)=?",
    ).bind(i.received, i.delivered, i.id, order.id, order.id, version),
  );
  statements.push(
    env.ORDERS.prepare(
      "INSERT INTO order_events(id,order_id,kind,actor,message,created_at) SELECT ?,?,?,?,?,? WHERE (SELECT version FROM orders WHERE id=?)=?",
    ).bind(
      crypto.randomUUID(),
      order.id,
      "fulfillment",
      actor,
      `Commande ${labels[data.fulfillment]}.`,
      now(),
      order.id,
      version,
    ),
  );
  statements.push(
    env.ORDERS.prepare(
      "INSERT OR IGNORE INTO outbox(id,order_id,kind,available_at) SELECT ?,?,'fulfillment',? WHERE (SELECT version FROM orders WHERE id=?)=?",
    ).bind(
      `fulfillment:${order.id}:${version + 1}`,
      order.id,
      now(),
      order.id,
      version,
    ),
  );
  statements.push(
    env.ORDERS.prepare(
      "UPDATE orders SET fulfillment=?,public_note=?,internal_note=?,updated_at=?,closed_at=?,token_expires=?,version=version+1 WHERE id=? AND version=?",
    ).bind(
      data.fulfillment,
      publicNote,
      internalNote,
      now(),
      ["delivered", "cancelled"].includes(data.fulfillment) ? now() : null,
      now() + 90 * 86400,
      order.id,
      version,
    ),
  );
  const result = await env.ORDERS.batch(statements);
  if (!result.at(-1)?.meta.changes)
    fail(
      "VERSION_CONFLICT",
      409,
      "Cette commande a été modifiée ailleurs. Rechargez-la avant de recommencer.",
    );
  return response({ ok: true });
}
function purchaseOrder(order: Row, items: Row[], s: Settings) {
  return response({
    order:Object.fromEntries(['reference','first_name','last_name','licensed_name','team'].map(key=>[key,order[key]])),
    items:items.map(item=>Object.fromEntries(['name','supplier','size','quantity','options_json'].map(key=>[key,item[key]]))),
    club:Object.fromEntries(['seller_name','seller_address','contact_email','seller_phone'].map(key=>[key,s[key as keyof Settings]])),
  });
}
async function saveSettings(
  request: Request,
  env: ShopEnv,
  actor: string,
  current: Settings & { version: number },
) {
  const data = await body(request);
  const s: Settings = {
    checkout_enabled: data.checkout_enabled === true,
    legal_ready: data.legal_ready === true,
    organization_slug: text(data.organization_slug, 120),
    seller_name: text(data.seller_name, 150, true),
    seller_address: text(data.seller_address, 500),
    seller_id: text(data.seller_id, 120),
    seller_phone: text(data.seller_phone, 30),
    contact_email: email(data.contact_email),
    mediator_name: data.mediator_name===undefined?current.mediator_name:text(data.mediator_name, 200),
    mediator_url: data.mediator_url===undefined?current.mediator_url:text(data.mediator_url, 500),
    collection_address: text(data.collection_address, 500),
    collection_instructions: text(data.collection_instructions, 1000),
    delivery_days: integer(data.delivery_days, 1, 180),
  };
  if (s.organization_slug && !/^[a-z0-9-]+$/.test(s.organization_slug))
    fail("SLUG", 400, "Identifiant HelloAsso invalide.");
  if (s.mediator_url && !/^https:\/\//.test(s.mediator_url))
    fail("MEDIATOR", 400, "Le lien du médiateur doit commencer par https://.");
  if (
    current.organization_slug !== s.organization_slug &&
    (await env.ORDERS.prepare(
      "SELECT id FROM checkout_attempts LIMIT 1",
    ).first())
  )
    fail(
      "ORGANIZATION_LOCKED",
      409,
      "L’association HelloAsso ne peut plus être changée après une tentative de paiement. Contactez le responsable technique.",
    );
  const version = integer(data.version, 0, Number.MAX_SAFE_INTEGER);
  const results = await env.ORDERS.batch([
    env.ORDERS.prepare(
      "INSERT INTO settings_events(id,actor,created_at) SELECT ?,?,? WHERE (SELECT version FROM settings WHERE id=1)=?",
    ).bind(crypto.randomUUID(), actor, now(), version),
    env.ORDERS.prepare(
      "UPDATE settings SET data=?,version=version+1 WHERE id=1 AND version=?",
    ).bind(JSON.stringify(s), version),
  ]);
  if (!results[1].meta.changes)
    fail(
      "VERSION_CONFLICT",
      409,
      "Les paramètres ont changé. Rechargez la page.",
    );
  return response({ ok: true, availability: await adminShopAvailability(env,s) });
}
async function saveVariant(request: Request, env: ShopEnv, option = false) {
  const data = await body(request);
  const productId = integer(data.product_id, 1, Number.MAX_SAFE_INTEGER);
  if (
    !(await env.DB.prepare("SELECT id FROM shop_products WHERE id=?")
      .bind(productId)
      .first())
  )
    fail("PRODUCT", 404, "Article introuvable.");
  const id = data.id ? uuid(data.id) : crypto.randomUUID();
  const label = text(data.label, 120, true),
    price = integer(
      data.price_cents,
      option ? 0 : 1,
      option ? 100000 : 1000000,
    ),
    active = data.active === true ? 1 : 0;
  const table=option?'shop_options':'shop_variants';
  const existing=await env.DB.prepare(`SELECT ${option ? 'product_id' : 'product_id,color,sku,catalogue_price_cents,coach_price_cents'} FROM ${table} WHERE id=?`).bind(id).first<Row>();
  if(existing && existing.product_id!==productId)fail('VARIANT_PRODUCT',409,'Ce choix appartient à un autre article.');
  if(option) {
    await env.DB.prepare(`INSERT INTO shop_options(id,product_id,label,price_cents,requires_text,max_length,active) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET label=excluded.label,price_cents=excluded.price_cents,requires_text=excluded.requires_text,max_length=excluded.max_length,active=excluded.active WHERE shop_options.product_id=excluded.product_id`)
      .bind(id,productId,label,price,data.requires_text===true?1:0,integer(data.max_length,1,40),active).run();
  } else {
    const optionalPrice=(key:string)=>data[key]===undefined?existing?.[key]??null:data[key]===null||data[key]===''?null:integer(data[key],1,1000000);
    const cataloguePrice=optionalPrice('catalogue_price_cents'),coachPrice=optionalPrice('coach_price_cents');
    const supplierId=text(data.supplier_id,64,true);
    const supplier=await env.DB.prepare('SELECT id,name,active FROM shop_suppliers WHERE id=?').bind(supplierId).first<Row>();
    if(!supplier)fail('SUPPLIER',400,'Choisissez un fournisseur enregistré dans la boutique.');
    if(!supplier.active){
      const previous=await env.DB.prepare('SELECT supplier_id FROM shop_variants WHERE id=?').bind(id).first<Row>();
      if(previous?.supplier_id!==supplierId)fail('SUPPLIER_INACTIVE',409,'Ce fournisseur est désactivé. Choisissez un fournisseur actif.');
    }
    const simple=data.simple===true;
    const statements=[];
    if(simple){
      statements.push(env.DB.prepare('UPDATE shop_variants SET active=0 WHERE product_id=? AND id<>?').bind(productId,id));
      statements.push(env.DB.prepare('UPDATE shop_options SET active=0 WHERE product_id=?').bind(productId));
    }
    statements.push(env.DB.prepare(`INSERT INTO shop_variants(id,product_id,label,size,color,sku,supplier,supplier_id,price_cents,active,catalogue_price_cents,coach_price_cents) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET label=excluded.label,size=excluded.size,color=excluded.color,sku=excluded.sku,supplier=excluded.supplier,supplier_id=excluded.supplier_id,price_cents=excluded.price_cents,active=excluded.active,catalogue_price_cents=excluded.catalogue_price_cents,coach_price_cents=excluded.coach_price_cents WHERE shop_variants.product_id=excluded.product_id`)
      .bind(id,productId,simple?'Taille unique':label,simple?'':text(data.size||'',40),text(data.color===undefined?(existing?.color??''):data.color,60),text(data.sku===undefined?(existing?.sku??''):data.sku,100),supplier.name,supplierId,price,active,cataloguePrice,coachPrice));
    statements.push(priceLabelStatement(env.DB,productId));
    await env.DB.batch(statements);
  }
  return response({ ok: true, id });
}
export async function maintenance(env: ShopEnv) {
  if (!env.ORDERS) return;
  if(env.ORDER_KIND==="tournament"&&!await env.ORDERS.prepare("SELECT id FROM module_imports WHERE id='v5.2'").first())return;
  const s = await settings(env);
  const due = (
    await env.ORDERS.prepare(
      "SELECT id FROM orders WHERE kind=? AND reconcile_after<=? AND EXISTS(SELECT 1 FROM checkout_attempts a WHERE a.order_id=orders.id AND a.intent_id IS NOT NULL) AND (closed_at IS NULL OR closed_at>?) ORDER BY reconcile_after LIMIT 20",
    )
      .bind(env.ORDER_KIND||"shop",now(), now() - 180 * 86400)
      .all<Row>()
  ).results;
  for (const o of due) {
    try {
      await reconcile(env, s, o.id);
    } catch {
      await env.ORDERS.prepare("UPDATE orders SET reconcile_after=? WHERE id=?")
        .bind(now() + 600, o.id)
        .run();
    }
  }
  await env.ORDERS.prepare(
    "UPDATE checkout_attempts SET state='uncertain',last_error='PAYMENT_UNCERTAIN' WHERE state='creating' AND created_at<? AND order_id IN (SELECT id FROM orders WHERE kind=?)",
  )
    .bind(now() - 120,env.ORDER_KIND||"shop")
    .run();
  await drainMail(env, s, 10);
  await env.ORDERS.batch([
    env.ORDERS.prepare("DELETE FROM rate_limits WHERE expires<?").bind(now()),
    env.ORDERS.prepare("DELETE FROM surveys WHERE created_at<?").bind(
      now() - 365 * 86400,
    ),
    env.ORDERS.prepare(
      "DELETE FROM orders WHERE kind='shop' AND kind=? AND created_at<? AND paid_at IS NULL AND NOT EXISTS(SELECT 1 FROM checkout_attempts a WHERE a.order_id=orders.id AND a.state IN ('creating','uncertain','pending','completed'))",
    ).bind(env.ORDER_KIND||"shop",now() - 30 * 86400),
    env.ORDERS.prepare("DELETE FROM orders WHERE kind='tournament' AND kind=? AND paid_at IS NULL AND EXISTS(SELECT 1 FROM tournament_registrations r WHERE r.order_id=orders.id AND r.payment_deadline<?) AND NOT EXISTS(SELECT 1 FROM checkout_attempts a WHERE a.order_id=orders.id AND a.state IN ('creating','uncertain','pending','completed'))").bind(env.ORDER_KIND||"shop",now()-90*86400),
    env.ORDERS.prepare(
      "UPDATE orders SET token_expires=MAX(token_expires,?) WHERE kind=? AND closed_at IS NULL AND paid_at IS NOT NULL",
    ).bind(now() + 90 * 86400,env.ORDER_KIND||"shop"),
    env.ORDERS.prepare(
      "DELETE FROM orders WHERE closed_at IS NOT NULL AND closed_at<?",
    ).bind(now() - 10 * 366 * 86400),
    env.ORDERS.prepare("DELETE FROM outbox WHERE sent_at<?").bind(
      now() - 90 * 86400,
    ),
    env.ORDERS.prepare("DELETE FROM settings_events WHERE created_at<?").bind(
      now() - 365 * 86400,
    ),
  ]);
}
export async function shopRoute(
  request: Request,
  env: ShopEnv,
  ctx: ExecutionContext,
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, "");
  const isStaffPage =
    path === "/admin-boutique" ||
    (path.startsWith("/admin-boutique/") &&
      !path.startsWith("/admin-boutique/api/"));
  const isTrackingPage =
    path === "/boutique/suivi" || path.startsWith("/boutique/suivi/");
  const isAdmin = path.startsWith("/admin-boutique/api/");
  const isShop = path.startsWith("/api/shop/");
  if (!isStaffPage && !isAdmin && !isShop && !isTrackingPage) return null;
  try {
    if (!env.ORDERS)
      fail("ORDERS_CONFIG", 503, "La boutique est en cours de configuration.");
    if(env.ORDER_KIND==="tournament"&&!await env.ORDERS.prepare("SELECT id FROM module_imports WHERE id='v5.2'").first())fail("MIGRATION_PENDING",503,"La copie initiale des tournois n’est pas terminée.");
    const s = await settings(env);
    if (isStaffPage) {
      if (
        !(
          env.APP_ENV === "local" &&
          ["localhost", "127.0.0.1"].includes(url.hostname) &&
          env.DEV_ADMIN_TOKEN
        )
      )
        await staff(request, env);
      const asset = await env.ASSETS.fetch(request);
      const headers = new Headers(asset.headers);
      for (const [key, value] of Object.entries(secureHeaders()))
        headers.set(key, value);
      return new Response(asset.body, { status: asset.status, headers });
    }
    if (isTrackingPage) {
      const asset = await env.ASSETS.fetch(request);
      const headers = new Headers(asset.headers);
      for (const [key, value] of Object.entries(secureHeaders()))
        headers.set(key, value);
      return new Response(asset.body, { status: asset.status, headers });
    }
    if (path === "/api/shop/helloasso/webhook" && request.method === "POST") {
      // Clone before consumption so the signature covers exactly the bytes received.
      const raw = request.clone();
      const result = await webhook(raw, env, s);
      ctx.waitUntil(drainMail(env, s));
      return result;
    }
    if (!["GET", "HEAD"].includes(request.method)) sameOrigin(request, env);
    if (isAdmin) {
      const actor = await staff(request, env);
      if(path==='/admin-boutique/api/coach-code'&&request.method==='POST')return await changeCoachCode(request,env,actor);
      if(path==='/admin-boutique/api/suppliers') {
        if(request.method==='GET')return response({suppliers:(await env.DB.prepare('SELECT * FROM shop_suppliers ORDER BY active DESC,name COLLATE NOCASE').all<Row>()).results});
        if(request.method==='PUT'){
          const data=await body(request),id=data.id?text(data.id,64,true):crypto.randomUUID(),name=text(data.name,100,true);
          const previous=await env.DB.prepare('SELECT version FROM shop_suppliers WHERE id=?').bind(id).first<Row>();
          if(previous && integer(data.version,1,Number.MAX_SAFE_INTEGER)!==previous.version)fail('VERSION_CONFLICT',409,'Ce fournisseur a changé. Rechargez la page.');
          const address=text(data.email||'',254);if(address)email(address);
          if(typeof data.active!=='boolean')fail('INVALID_FIELD',400,'Indiquez si le fournisseur est actif.');
          const duplicate=await env.DB.prepare('SELECT id FROM shop_suppliers WHERE name=? COLLATE NOCASE AND id<>?').bind(name,id).first();
          if(duplicate)fail('SUPPLIER_DUPLICATE',409,'Un fournisseur porte déjà ce nom.');
          const result=await env.DB.batch([
            env.DB.prepare(`INSERT INTO shop_suppliers(id,name,contact_name,email,phone,address,notes,active) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,contact_name=excluded.contact_name,email=excluded.email,phone=excluded.phone,address=excluded.address,notes=excluded.notes,active=excluded.active,version=shop_suppliers.version+1 WHERE shop_suppliers.version=?`)
              .bind(id,name,text(data.contact_name||'',120),address,text(data.phone||'',40),text(data.address||'',500),text(data.notes||'',2000),data.active?1:0,previous?.version||0),
            env.DB.prepare('UPDATE shop_variants SET supplier=(SELECT name FROM shop_suppliers WHERE id=?) WHERE supplier_id=?').bind(id,id),
          ]);
          if(!result[0].meta.changes)fail('VERSION_CONFLICT',409,'Ce fournisseur a changé. Rechargez la page.');
          return response({ok:true,id});
        }
      }
      if (path === "/admin-boutique/api/admins") {
        if (request.method === "GET") {
          const rows = await env.ORDERS.prepare("SELECT email,name,active FROM shop_admins ORDER BY active DESC,email").all<Row>();
          return response({admins: rows.results, actor});
        }
        if (request.method === "PUT") {
          const data = await body(request), address = email(data.email);
          const name = text(data.name, 120, true);
          if (typeof data.active !== "boolean") fail("INVALID_FIELD",400,"Indiquez si cet accès est actif.");
          if (address.toLowerCase() === actor.toLowerCase() && !data.active)
            fail("OWN_ACCESS",409,"Vous ne pouvez pas désactiver votre propre accès. Demandez à un autre responsable.");
          await env.ORDERS.prepare("INSERT INTO shop_admins(email,name,active) VALUES(?,?,?) ON CONFLICT(email) DO UPDATE SET name=excluded.name,active=excluded.active")
            .bind(address, name, data.active ? 1 : 0).run();
          return response({ok:true});
        }
      }
      if (path === "/admin-boutique/api/mail/test" && request.method === "POST") {
        await rateLimit(env, `admin-mail-test:${actor}`, 3);
        try { await testMail(env, s); }
        catch (error) {
          const code = error instanceof Error ? error.message : '';
          const message = code === 'MAIL_SMTP_AUTH' ? 'OVH refuse l’authentification. Vérifiez SMTP_USER et le secret SMTP_PASSWORD de la boîte mail.' :
            code === 'MAIL_SMTP_CONFIG' || code === 'MAIL_TEST_CONFIG' ? 'Vérifiez MAIL_FROM, MAIL_TEST_TO, MAIL_PROVIDER et la configuration du transport mail.' :
            code === 'MAIL_SMTP_TIMEOUT' || code === 'MAIL_SMTP_NETWORK' ? 'Le serveur SMTP OVH est injoignable ou ne répond pas à temps. Réessayez puis vérifiez SMTP_HOST.' :
            'Le serveur mail n’a pas confirmé l’envoi. Vérifiez la configuration puis réessayez.';
          fail('MAIL_TEST_FAILED', 502, message);
        }
        return response({ ok: true, message: 'Le serveur mail a accepté le message de test. Vérifiez la réception et les courriers indésirables de MAIL_TEST_TO.' });
      }
      if (path === "/admin-boutique/api/helloasso/test" && request.method === "POST") return response(await connectionStatus(env,s.organization_slug));
      if (path === "/admin-boutique/api/settings") {
        if (request.method === "GET")
          return response({
            settings: s,
            environment: environment(env),
            origin: env.SHOP_ORIGIN || "",
            availability: await adminShopAvailability(env,s),
            mail_queue: await mailQueueStatus(env),
            coach_access: await coachConfiguration(env),
            configuration: {
              credentials:
                !!env.HELLOASSO_CLIENT_ID && !!env.HELLOASSO_CLIENT_SECRET,
              tracking: (env.TRACKING_SECRET || "").length >= 32,
              mail_provider: env.MAIL_PROVIDER || "",
              mail_from: env.MAIL_FROM || "",
              mail_test_to: env.MAIL_TEST_TO || "",
              mail_ready: mailTransportReady(env),
              webhook_signature: !!env.HELLOASSO_WEBHOOK_SECRET,
            },
          });
        if (request.method === "PUT")
          return await saveSettings(request, env, actor, s);
      }
      if (
        path === "/admin-boutique/api/catalogue" &&
        request.method === "GET"
      ) {
        const [products, variants, options] = await env.DB.batch<Row>([
          env.DB.prepare(
            "SELECT id,name,active,price_label FROM shop_products ORDER BY name",
          ),
          env.DB.prepare(
            "SELECT * FROM shop_variants ORDER BY product_id,label",
          ),
          env.DB.prepare(
            "SELECT * FROM shop_options ORDER BY product_id,label",
          ),
        ]);
        return response({
          products: products.results,
          variants: sortVariants(variants.results),
          options: options.results,
        });
      }
      if (path === "/admin-boutique/api/variants/prices" && request.method === "PUT") return await changeVariants(request,env);
      if (path === "/admin-boutique/api/variants/order" && request.method === "PUT") return await changeVariants(request,env,true);
      if (path === "/admin-boutique/api/variants" && request.method === "PUT")
        return await saveVariant(request, env);
      if (path === "/admin-boutique/api/options" && request.method === "PUT")
        return await saveVariant(request, env, true);
      if (path === "/admin-boutique/api/orders" && request.method === "GET") {
        const page = Math.max(
          0,
          Math.min(100000, Number(url.searchParams.get("page")) || 0),
        );
        const q = (url.searchParams.get("q") || "").slice(0, 100);
        const payment = (url.searchParams.get("payment") || "").slice(0, 30),
          fulfillment = (url.searchParams.get("fulfillment") || "").slice(
            0,
            30,
          );
        const rows = await env.ORDERS.prepare(
          `SELECT id,reference,email,first_name,last_name,team,total_cents,payment_status,fulfillment,created_at,version FROM orders WHERE kind='shop' AND (?='' OR instr(lower(reference||' '||email||' '||first_name||' '||last_name),lower(?))>0) AND (?='' OR payment_status=?) AND (?='' OR fulfillment=?) ORDER BY created_at DESC LIMIT 51 OFFSET ?`,
        )
          .bind(q, q, payment, payment, fulfillment, fulfillment, page * 50)
          .all<Row>();
        return response({
          orders: rows.results.slice(0, 50),
          has_more: rows.results.length > 50,
          page,
        });
      }
      if (path === "/admin-boutique/api/surveys" && request.method === "GET") {
        const aggregate = await env.ORDERS.prepare(
          "SELECT COUNT(*) AS count,AVG(ease) AS ease,AVG(catalogue) AS catalogue,AVG(overall) AS overall FROM surveys",
        ).first();
        const rows = await env.ORDERS.prepare(
          "SELECT s.*,o.reference FROM surveys s JOIN orders o ON o.id=s.order_id ORDER BY s.created_at DESC LIMIT 100",
        ).all();
        return response({ aggregate, responses: rows.results });
      }
      const match = path.match(
        /^\/admin-boutique\/api\/orders\/([a-f0-9-]{36})(?:\/(purchase-order|reconcile|resend|rotate-link|resolve-attempt))?$/,
      );
      if (match) {
        const order = await findOrder(env, match[1]);
        if(order.kind !== "shop")fail("ORDER_NOT_FOUND",404,"Commande boutique introuvable.");
        if (!match[2] && request.method === "GET")
          return response(await detail(env, order, true));
        if (!match[2] && request.method === "PATCH") {
          const result = await updateFulfillment(request, env, order, actor);
          ctx.waitUntil(drainMail(env, s));
          return result;
        }
        if (match[2] === "purchase-order" && request.method === "GET") {
          if (
            order.payment_status !== "paid" ||
            order.fulfillment === "cancelled"
          )
            fail(
              "PAYMENT_REQUIRED",
              409,
              "Un bon fournisseur ne peut être édité que pour une commande payée et non annulée.",
            );
          const items = (
            await env.ORDERS.prepare(
              "SELECT * FROM order_items WHERE order_id=? ORDER BY id",
            )
              .bind(order.id)
              .all<Row>()
          ).results;
          const document=purchaseOrder(order,items,s);
          await event(
            env,
            order.id,
            "export",
            actor,
            "Données du bon fournisseur individuel préparées.",
          ).run();
          return document;
        }
        if (match[2] === "reconcile" && request.method === "POST") {
          await reconcile(env, s, order.id);
          ctx.waitUntil(drainMail(env, s));
          return response(
            await detail(env, await findOrder(env, order.id), true),
          );
        }
        if (match[2] === "rotate-link" && request.method === "POST") {
          const version = order.token_version + 1,
            token = await trackingToken(
              env.TRACKING_SECRET || "",
              order.id,
              version,
            );
          const result = await env.ORDERS.prepare(
            "UPDATE orders SET token_hash=?,token_version=?,token_expires=?,version=version+1 WHERE id=? AND token_version=?",
          )
            .bind(
              await sha256(token),
              version,
              now() + 90 * 86400,
              order.id,
              order.token_version,
            )
            .run();
          if (!result.meta.changes)
            fail("VERSION_CONFLICT", 409, "Le lien a déjà été renouvelé.");
          await event(
            env,
            order.id,
            "security",
            actor,
            "Ancien lien révoqué et nouveau lien envoyé.",
          ).run();
          await queueMail(
            env,
            `rotation:${order.id}:${version}`,
            order.id,
            "tracking",
          );
          ctx.waitUntil(drainMail(env, s));
          return response({ ok: true });
        }
        if (match[2] === "resend" && request.method === "POST") {
          await rateLimit(env, `admin-resend:${order.id}`, 3);
          await env.ORDERS.prepare(
            "UPDATE outbox SET status='pending',attempts=0,available_at=?,locked_until=0 WHERE order_id=? AND status='failed'",
          )
            .bind(now(), order.id)
            .run();
          await queueMail(
            env,
            `tracking:${crypto.randomUUID()}`,
            order.id,
            "tracking",
          );
          ctx.waitUntil(drainMail(env, s));
          return response({ ok: true });
        }
        if (match[2] === "resolve-attempt" && request.method === "POST") {
          const data = await body(request),
            attemptId = uuid(data.attempt_id),
            intentId = integer(data.intent_id, 1, Number.MAX_SAFE_INTEGER);
          const intent = await api(
            env,
            `/organizations/${encodeURIComponent(s.organization_slug)}/checkout-intents/${intentId}`,
          );
          const metadata =
            typeof intent.metadata === "string"
              ? JSON.parse(intent.metadata)
              : intent.metadata;
          if (
            metadata?.order_id !== order.id ||
            metadata?.attempt_id !== attemptId
          )
            fail(
              "ATTEMPT_MISMATCH",
              409,
              "Cette intention HelloAsso ne correspond pas à cette commande et cette tentative.",
            );
          await env.ORDERS.prepare(
            "UPDATE checkout_attempts SET intent_id=?,state='pending',last_error='' WHERE id=? AND order_id=? AND intent_id IS NULL AND state IN ('creating','uncertain')",
          )
            .bind(intentId, attemptId, order.id)
            .run();
          await event(
            env,
            order.id,
            "security",
            actor,
            "Intention HelloAsso récupérée après une réponse réseau incertaine.",
          ).run();
          await reconcile(env, s, order.id);
          return response({ ok: true });
        }
      }
    }
    if (path === "/api/shop/config" && request.method === "GET") {
      return response({
        environment: environment(env),
        terms_version: TERMS_VERSION,
        settings: {
          seller_name: s.seller_name,
          seller_address: s.seller_address,
          seller_id: s.seller_id,
          seller_phone: s.seller_phone,
          contact_email: s.contact_email,
          collection_address: s.collection_address,
          collection_instructions: s.collection_instructions,
          delivery_days: s.delivery_days,
          mediator_name: s.mediator_name,
          mediator_url: s.mediator_url,
        },
        terms_snapshot: termsSnapshot(s),
        terms_sections: termsSections(s),
      });
    }
    // Legacy download URL now opens the illustrated generator, including WebP/AVIF photos.
    if (path === "/api/shop/catalogue.pdf" && request.method === "GET") {
      return new Response(null,{status:302,headers:{...secureHeaders(),location:'/boutique/catalogue/'}});
    }
    if(path==='/api/shop/coach/session'&&request.method==='POST')return await coachLogin(request,env);
    if(path==='/api/shop/coach/session'&&request.method==='DELETE')return coachLogout(env);
    if (path === "/api/shop/catalogue" && request.method === "GET") {
      const coach=await coachSession(request,env);
      const cat = await catalogue(env,coach);
      let available = true, unavailable: Row | null = null;
      try {
        await openForSales(env, s);
      } catch(error) {
        available = false;
        unavailable=error instanceof ShopError?{code:error.code,message:error.message}:{code:"CONFIGURATION",message:"Le paiement est temporairement indisponible. Votre panier est conservé."};
      }
      const result=response({
        ...cat,
        coach_access_enabled:!!(await coachConfiguration(env)).enabled,
        checkout_available: available,
        checkout_unavailable: unavailable,
        environment: environment(env),
        terms_version: TERMS_VERSION,
        delivery_days: s.delivery_days,
        collection_address: s.collection_address,
        contact_email: s.contact_email,
      });
      if(coach)await refreshCoachCookie(result,env);
      return result;
    }
    if (path === "/api/shop/checkout" && request.method === "POST") {
      const result = await createOrder(request, env, s);
      ctx.waitUntil(drainMail(env, s));
      return result;
    }
    if (path === "/api/shop/recover" && request.method === "POST") {
      await rateLimit(
        env,
        `recover-ip:${request.headers.get("cf-connecting-ip") || "local"}`,
        5,
      );
      const data = await body(request),
        address = email(data.email),
        reference = text(data.reference ?? "", 60);
      await rateLimit(env, `recover-email:${address}`, 3, 3600);
      // Generic response for unknown addresses too; no order data leaves this endpoint.
      const orders = await env.ORDERS.prepare(
        "SELECT id FROM orders WHERE kind='shop' AND email=? COLLATE NOCASE AND (?='' OR reference=? COLLATE NOCASE) ORDER BY created_at DESC LIMIT 10",
      ).bind(address, reference, reference).all<Row>();
      for (const order of orders.results) {
        await env.ORDERS.prepare(
          "UPDATE orders SET token_expires=MAX(token_expires,?) WHERE id=?",
        ).bind(now() + 90 * 86400, order.id).run();
        await queueMail(env, `recover:${crypto.randomUUID()}`, order.id, "tracking");
      }
      if (orders.results.length) ctx.waitUntil(drainMail(env, s));
      return response({
        message:
          "Si des commandes correspondent à ces informations, leurs liens de suivi seront envoyés à cette adresse e-mail. Vérifiez aussi les courriers indésirables.",
      });
    }
    const match = path.match(
      /^\/api\/shop\/orders\/([a-f0-9-]{36})(?:\/(pay|refresh|survey))?$/,
    );
    if (match) {
      await rateLimit(
        env,
        `tracking:${request.headers.get("cf-connecting-ip") || "local"}`,
        120,
        60,
      );
      const order = await customerOrder(request, env, match[1]);
      if(order.kind!=="shop")fail("NOT_FOUND",404,"Commande introuvable.");
      if (!match[2] && request.method === "GET")
        return response(await detail(env, order));
      if (match[2] === "pay" && request.method === "POST") {
        await openForSales(env, s);
        await rateLimit(env, `pay:${order.id}`, 5);
        return response(
          await checkout(
            env,
            s,
            order,
            request.headers.get("authorization")!.slice(7),
          ),
        );
      }
      if (match[2] === "refresh" && request.method === "POST") {
        await rateLimit(env, `refresh:${order.id}`, 10, 60);
        await reconcile(env, s, order.id);
        ctx.waitUntil(drainMail(env, s));
        return response(await detail(env, await findOrder(env, order.id)));
      }
      if (match[2] === "survey" && request.method === "POST") {
        if(order.kind!=="shop")fail("SURVEY",404,"Enquête non disponible pour cette inscription.");
        if (!order.paid_at)
          fail(
            "SURVEY_PAYMENT",
            409,
            "L’enquête sera disponible après confirmation du paiement.",
          );
        const data = await body(request),
          ease = integer(data.ease, 1, 5),
          catalogue = integer(data.catalogue, 1, 5),
          overall = integer(data.overall, 1, 5),
          comment = text(data.comment || "", 1500);
        const result = await env.ORDERS.prepare(
          "INSERT OR IGNORE INTO surveys(order_id,ease,catalogue,overall,comment,created_at) VALUES(?,?,?,?,?,?)",
        )
          .bind(order.id, ease, catalogue, overall, comment, now())
          .run();
        if (!result.meta.changes)
          fail(
            "SURVEY_EXISTS",
            409,
            "Merci, votre avis a déjà été enregistré.",
          );
        ctx.waitUntil(drainMail(env,s));
        return response({ ok: true });
      }
    }
    return response(
      { error: "Cette action boutique est inconnue.", code: "NOT_FOUND" },
      404,
    );
  } catch (error) {
    const incident = crypto.randomUUID().slice(0, 8);
    if (error instanceof ShopError)
      return response(
        { error: error.message, code: error.code, incident },
        error.status,
      );
    // Never log request URLs, bodies, e-mail addresses or provider payloads.
    console.error("shop_error", { incident });
    return response(
      {
        error:
          "Une erreur technique empêche cette opération. Réessayez dans quelques instants ou contactez le club avec la référence indiquée.",
        code: "INTERNAL",
        incident,
      },
      500,
    );
  }
}

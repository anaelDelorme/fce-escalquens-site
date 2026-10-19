import { events } from "./events";
import { formFields, formAnswers, registrationSections, tournamentSections } from "./forms";
import {
  body,
  origin,
  rateLimit,
  response,
  sameOrigin,
  secureHeaders,
  staff,
} from "../shop/security";
import {
  ShopError,
  fail,
  now,
  email,
  text,
  integer,
  uuid,
  sha256,
  trackingToken,
  type Row,
} from "../shop/domain";
import {
  settings,
  findOrder,
  customerOrder,
  detail,
  checkout,
  reconcile,
  type ShopEnv,
} from "../shop/service";
import { queueMail, drainMail } from "../shop/mail";
import { api, connectionStatus } from "../shop/helloasso";

async function sales(env: ShopEnv, all = false) {
  return (
    await env.DB.prepare(
      "SELECT t.id,t.name,t.starts_on,t.categories,t.status,s.* FROM tournaments t LEFT JOIN tournament_sales s ON s.tournament_id=t.id WHERE (?=1 OR t.status IN ('published','open','finished')) ORDER BY t.starts_on",
    )
      .bind(all ? 1 : 0)
      .all<Row>()
  ).results;
}
function configured(env: ShopEnv, s: Row, helloasso=true) {
  if (
    (helloasso&&(!s.organization_slug || !env.HELLOASSO_CLIENT_ID || !env.HELLOASSO_CLIENT_SECRET)) ||
    (env.TRACKING_SECRET || "").length < 32
  )
    fail(
      "PAYMENT_CONFIG",
      503,
      "Le club doit terminer la configuration du paiement.",
    );
  origin(env);
  if (
    !env.MAIL_FROM ||
    !["resend", "cloudflare"].includes(env.MAIL_PROVIDER || "") ||
    (!env.RESEND_API_KEY && env.MAIL_PROVIDER === "resend") ||
    (!env.EMAIL && env.MAIL_PROVIDER === "cloudflare") ||
    (env.APP_ENV !== "production" && !env.MAIL_TEST_TO)
  )
    fail(
      "MAIL_CONFIG",
      503,
      "Le club doit terminer la configuration des e-mails de suivi.",
    );
}
async function create(request: Request, env: ShopEnv, s: Row) {
  await rateLimit(
    env,
    `tournament-create:${request.headers.get("cf-connecting-ip") || "local"}`,
    12,
  );
  const data = await body(request),
    id = uuid(data.idempotency_key),
    tournamentId = integer(data.tournament_id, 1, 2147483647);
  configured(env,s,data.payment_choice!=="cheque");
  const customer = {
    email: email(data.email),
    first_name: text(data.first_name, 80, true),
    last_name: text(data.last_name, 80, true),
    phone: text(data.phone, 30, true),
    club_name: text(data.club_name, 120, true),
  };
  if (!/^[+0-9 ().-]{6,30}$/.test(customer.phone))
    fail("PHONE", 400, "Vérifiez le numéro de téléphone.");
  if (
    data.accept_terms !== true ||
    !["now", "later", "cheque"].includes(data.payment_choice)
  )
    fail("TERMS", 400, "Acceptez les conditions et choisissez quand payer.");
  const hash = await sha256(
    JSON.stringify({
      customer,
      tournamentId,
      version: data.version,
      total: data.expected_total,
      choice: data.payment_choice,
      answers: data.answers || {},
      sections: data.sections,
    }),
  );
  let order = await env.ORDERS.prepare("SELECT * FROM orders WHERE id=?")
    .bind(id)
    .first<Row>();
  if (order && (order.kind !== "tournament" || order.request_hash !== hash))
    fail(
      "IDEMPOTENCY_CONFLICT",
      409,
      "Cette inscription a déjà été enregistrée avec des informations différentes. Consultez son suivi.",
    );
  if (!order) {
    const sale = (await sales(env)).find((row) => row.id === tournamentId);
    if (
      !sale?.enabled ||
      sale.status !== "open" ||
      sale.registration_deadline < now() ||
      sale.payment_deadline < now()
    )
      fail(
        "REGISTRATION_CLOSED",
        409,
        "Les inscriptions sont fermées pour ce tournoi.",
      );
    const selection = registrationSections(sale.categories, data.sections);
    const total = selection.count * sale.fee_cents;
    if (!Number.isSafeInteger(total) || total > 1000000) fail("TOTAL",400,"Le montant dépasse la limite d’inscription. Contactez le club.");
    if (data.version !== sale.version || data.expected_total !== total)
      fail(
        "PRICE_CHANGED",
        409,
        "Le tarif ou les conditions ont changé. Rechargez la page avant de confirmer.",
      );
    if (data.payment_choice === "later" && !sale.allow_pay_later)
      fail(
        "PAYMENT_CHOICE",
        409,
        "Le paiement immédiat est requis pour ce tournoi.",
      );
    if(data.payment_choice==='cheque'&&(!sale.allow_cheque||sale.cheque_deadline<now()||!sale.cheque_address||!sale.cheque_payee))fail('CHEQUE_CLOSED',409,'Le paiement par chèque n’est pas disponible pour ce tournoi.');
    const cheque = data.payment_choice==='cheque' ? `Chèque à l’ordre de ${sale.cheque_payee}. À envoyer à ${sale.cheque_address} avant le ${new Date(sale.cheque_deadline*1000).toLocaleDateString('fr-FR',{timeZone:'Europe/Paris'})}.` : '';
    const fields = formFields(JSON.parse(sale.form_json || "[]"));
    const answers = formAnswers(fields, data.answers || {});
    const token = await trackingToken(env.TRACKING_SECRET!, id, 1),
      stamp = now(),
      reference = `FCE-T-${new Date().getFullYear()}-${id.replaceAll("-", "").slice(0, 12).toUpperCase()}`;
    // Capacity and all registration writes share one ORDERS transaction; no cross-database transaction is assumed.
    const guard = "EXISTS(SELECT 1 FROM orders WHERE id=? AND request_hash=?)";
    await env.ORDERS.batch([
      env.ORDERS.prepare(
        `INSERT OR IGNORE INTO orders(id,reference,kind,request_hash,token_hash,token_expires,email,first_name,last_name,phone,team,delivery_method,total_cents,terms_version,terms_snapshot,terms_accepted_at,created_at,updated_at) SELECT ?,?,'tournament',?,?,?,?,?,?,?,?,'club',?,?,?,?,?,? WHERE ?=0 OR (SELECT COALESCE(SUM(team_count),0) FROM tournament_registrations WHERE tournament_id=? AND registration_status<>'cancelled')+?<=?`,
      ).bind(
        id,
        reference,
        hash,
        await sha256(token),
        Math.max(stamp + 180 * 86400, sale.payment_deadline + 90 * 86400),
        customer.email,
        customer.first_name,
        customer.last_name,
        customer.phone,
        `${selection.count} équipe${selection.count > 1 ? "s" : ""}`,
        total,
        `tournament-${sale.id}-v${sale.version}`,
        `${sale.name}\nTarif par équipe : ${(sale.fee_cents / 100).toFixed(2)} EUR\n${selection.sections.filter(row=>row.participating).map(row=>`${row.section} : ${row.quantity} équipe(s)`).join("\n")}\nTotal : ${(total / 100).toFixed(2)} EUR\nPaiement avant le ${new Date(sale.payment_deadline * 1000).toISOString()}\n${sale.terms}\n${cheque}`,
        stamp,
        stamp,
        stamp,
        sale.capacity,
        tournamentId,
        selection.count,
        sale.capacity,
      ),
      env.ORDERS.prepare(
        `INSERT OR IGNORE INTO tournament_registrations(order_id,tournament_id,tournament_name,club_name,team_name,category,payment_choice,payment_deadline,created_at,answers_json,form_snapshot,team_count,sections_json,payment_method,cheque_snapshot) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${guard}`,
      ).bind(
        id,
        tournamentId,
        sale.name,
        customer.club_name,
        `${selection.count} équipe${selection.count > 1 ? "s" : ""}`,
        selection.sections.filter(row=>row.participating).map(row=>row.section).join(", "),
        data.payment_choice==='cheque'?'later':data.payment_choice,
        data.payment_choice==='cheque'?sale.cheque_deadline:sale.payment_deadline,
        stamp,
        JSON.stringify(answers),
        JSON.stringify(fields),
        selection.count,
        JSON.stringify(selection.sections),
        data.payment_choice==='cheque'?'cheque':'helloasso',
        cheque,
        id,
        hash,
      ),
      ...selection.sections.filter(section=>section.participating).flatMap((section,index)=>
        Array.from({length:Math.ceil(section.quantity/30)},(_,chunk)=>env.ORDERS.prepare(
          `INSERT OR IGNORE INTO order_items(id,order_id,product_id,variant_id,name,sku,supplier,size,color,options_json,unit_cents,quantity) SELECT ?,?,?,?,?,'','',?,'','[]',?,? WHERE ${guard}`,
        ).bind(`${id}:${index}:${chunk}`,id,tournamentId,`tournament:${tournamentId}`,sale.name,section.section,sale.fee_cents,Math.min(30,section.quantity-chunk*30),id,hash))
      ),
      env.ORDERS.prepare(
        `INSERT OR IGNORE INTO order_events(id,order_id,kind,actor,message,created_at) SELECT ?,?,'created','client','Inscription enregistrée, en attente de validation par le club et de paiement.',? WHERE ${guard}`,
      ).bind(`created:${id}`, id, stamp, id, hash),
      env.ORDERS.prepare(
        `INSERT OR IGNORE INTO outbox(id,order_id,kind,available_at) SELECT ?,?,'created',? WHERE ${guard}`,
      ).bind(`created:${id}`, id, stamp, id, hash),
    ]);
    order = await env.ORDERS.prepare("SELECT * FROM orders WHERE id=?")
      .bind(id)
      .first<Row>();
    if (!order)
      fail(
        "TOURNAMENT_FULL",
        409,
        "Le tournoi est complet. Contactez le club pour la liste d’attente.",
      );
    if (order.request_hash !== hash)
      fail(
        "IDEMPOTENCY_CONFLICT",
        409,
        "Consultez l’inscription déjà enregistrée avant de réessayer.",
      );
  }
  const token = await trackingToken(
    env.TRACKING_SECRET!,
    id,
    order.token_version,
  );
  const result: Row = {
    order_id: id,
    reference: order.reference,
    tracking_token: token,
  };
  if (data.payment_choice === "now")
    try {
      Object.assign(result, await checkout(env, s as any, order, token));
    } catch (error) {
      return response(
        {
          ...result,
          error:
            error instanceof ShopError
              ? error.message
              : "Le paiement n’a pas répondu. Votre inscription est conservée. Consultez son suivi.",
          code: error instanceof ShopError ? error.code : "PAYMENT_UNCERTAIN",
        },
        error instanceof ShopError ? error.status : 503,
      );
    }
  return response(result);
}
export function tournamentEnv(env: ShopEnv): ShopEnv {
  if (!env.TOURNAMENTS)
    fail(
      "TOURNAMENTS_CONFIG",
      503,
      "La base des tournois doit être configurée. Voir docs/TOURNOIS-V5.2.md.",
    );
  return {
    ...env,
    SITE_DB: env.SITE_DB || env.DB,
    DB: env.TOURNAMENTS,
    ORDERS: env.TOURNAMENTS,
    PAYMENT_DB: env.PAYMENT_DB || env.ORDERS,
    ORDER_KIND: "tournament",
  };
}
export async function tournamentRoute(
  request: Request,
  env: ShopEnv,
  ctx: ExecutionContext,
): Promise<Response | null> {
  const path = new URL(request.url).pathname.replace(/\/$/, ""),
    admin = path === "/admin-tournois" || path.startsWith("/admin-tournois/"),
    tracking =
      path === "/tournois/suivi" ||
      path.startsWith("/tournois/suivi/") ||
      path === "/paiements/retour" ||
      path.startsWith("/paiements/retour/");
  if (!admin && !tracking && !path.startsWith("/api/tournaments/")) return null;
  try {
    if (tracking) {
      const asset = await env.ASSETS.fetch(request);
      return new Response(asset.body, {
        status: asset.status,
        headers: new Headers({
          ...Object.fromEntries(asset.headers),
          ...secureHeaders(),
        }),
      });
    }
    env = tournamentEnv(env);
    if (
      !["GET", "HEAD"].includes(request.method) &&
      !(await env.ORDERS.prepare(
        "SELECT id FROM module_imports WHERE id='v5.2'",
      ).first())
    )
      fail(
        "MIGRATION_PENDING",
        503,
        "La copie initiale des tournois doit être terminée avant de modifier ou enregistrer une inscription.",
      );
    if (admin) {
      const actor = await staff(request, env, "tournament");
      if (!path.startsWith("/admin-tournois/api/")) {
        const asset = await env.ASSETS.fetch(request);
        return new Response(asset.body, {
          status: asset.status,
          headers: new Headers({
            ...Object.fromEntries(asset.headers),
            ...secureHeaders(),
          }),
        });
      }
      if (!["GET", "HEAD"].includes(request.method)) sameOrigin(request, env);
      const eventResponse = await events(request, env, path);
      if (eventResponse) return eventResponse;
      if (path === "/admin-tournois/api/status" && request.method === "GET")
        return response({
          environment: env.APP_ENV === "production" ? "production" : "sandbox",
        });
      if (path === "/admin-tournois/api/sales") {
        if (request.method === "GET")
          return response({ sales: await sales(env, true) });
        if (request.method === "PUT") {
          const d = await body(request),
            id = integer(d.tournament_id, 1, 2147483647),
            fee = integer(d.fee_cents, 1, 1000000),
            capacity = integer(d.capacity, 0, 10000),
            version = integer(d.version, 0, 2147483647),
            registration = integer(d.registration_deadline, 0, 4102444800),
            payment = integer(d.payment_deadline, 0, 4102444800),
            terms = text(d.terms, 12000, true);
          if (
            d.enabled &&
            (registration <= now() ||
              payment < registration ||
              terms.length < 60)
          )
            fail(
              "CONFIG",
              400,
              "Précisez les dates et les conditions d’inscription, d’annulation et de remboursement (60 caractères minimum). Le paiement doit rester possible jusqu’à la clôture des inscriptions.",
            );
          const exists = await env.DB.prepare(
            "SELECT id FROM tournaments WHERE id=?",
          )
            .bind(id)
            .first();
          if (!exists) fail("NOT_FOUND", 404, "Tournoi introuvable.");
          const allowCheque=d.allow_cheque===true;
          const chequePayee=text(d.cheque_payee||'',160,allowCheque),chequeAddress=text(d.cheque_address||'',1000,allowCheque),chequeDeadline=integer(d.cheque_deadline||0,0,4102444800);
          if(allowCheque&&(chequeDeadline<registration||chequeDeadline>payment||(d.enabled&&chequeDeadline<=now())))fail('CHEQUE_CONFIG',400,'Précisez l’ordre du chèque, l’adresse et une échéance comprise entre la clôture des inscriptions et la date limite de paiement.');
          const fields = formFields(d.form_fields || []);
          const row =
            version === 0
              ? await env.DB.prepare(
                  "INSERT OR IGNORE INTO tournament_sales(tournament_id,fee_cents,capacity,enabled,allow_pay_later,registration_deadline,payment_deadline,terms,form_json,allow_cheque,cheque_payee,cheque_address,cheque_deadline) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING version",
                )
                  .bind(
                    id,
                    fee,
                    capacity,
                    d.enabled ? 1 : 0,
                    d.allow_pay_later ? 1 : 0,
                    registration,
                    payment,
                    terms,
                    JSON.stringify(fields),
                    allowCheque?1:0,chequePayee,chequeAddress,chequeDeadline,
                  )
                  .first()
              : await env.DB.prepare(
                  "UPDATE tournament_sales SET fee_cents=?,capacity=?,enabled=?,allow_pay_later=?,registration_deadline=?,payment_deadline=?,terms=?,form_json=?,allow_cheque=?,cheque_payee=?,cheque_address=?,cheque_deadline=?,version=version+1 WHERE tournament_id=? AND version=? RETURNING version",
                )
                  .bind(
                    fee,
                    capacity,
                    d.enabled ? 1 : 0,
                    d.allow_pay_later ? 1 : 0,
                    registration,
                    payment,
                    terms,
                    JSON.stringify(fields),
                    allowCheque?1:0,chequePayee,chequeAddress,chequeDeadline,
                    id,
                    version,
                  )
                  .first();
          if (!row)
            fail("VERSION", 409, "Les réglages ont changé. Rechargez la page.");
          return response({ ok: true });
        }
      }
      if (
        path === "/admin-tournois/api/helloasso/test" &&
        request.method === "POST"
      )
        return response(
          await connectionStatus(env, (await settings(env)).organization_slug),
        );
      if (path === "/admin-tournois/api/admins") {
        if (request.method === "GET")
          return response({
            admins: (
              await env.ORDERS.prepare(
                "SELECT email,name,active FROM tournament_admins ORDER BY email",
              ).all()
            ).results,
          });
        if (request.method === "PUT") {
          const d = await body(request),
            address = email(d.email),
            name = text(d.name || "", 100,true);
          if(typeof d.active!=="boolean")fail("INVALID_FIELD",400,"Indiquez si l’accès est actif.");
          if (address === actor && !d.active)
            fail(
              "SELF_DISABLE",
              409,
              "Vous ne pouvez pas retirer votre propre accès.",
            );
          await env.ORDERS.prepare(
            "INSERT INTO tournament_admins(email,name,active) VALUES(?,?,?) ON CONFLICT(email) DO UPDATE SET name=excluded.name,active=excluded.active",
          )
            .bind(address, name, d.active ? 1 : 0)
            .run();
          return response({ ok: true });
        }
      }
      if (
        path === "/admin-tournois/api/registrations" &&
        request.method === "GET"
      )
        return response({
          registrations: (
            await env.ORDERS.prepare(
              "SELECT o.id,o.reference,o.email,o.first_name,o.last_name,o.total_cents,o.payment_status,o.version,r.* FROM orders o JOIN tournament_registrations r ON r.order_id=o.id WHERE o.kind='tournament' ORDER BY o.created_at DESC LIMIT 500",
            ).all()
          ).results,
        });
      const match = path.match(
        /^\/admin-tournois\/api\/registrations\/([a-f0-9-]{36})(?:\/(reconcile|resend|rotate-link|resolve-attempt|cheque-received))?$/,
      );
      if (match) {
        const order = await findOrder(env, match[1]);
        if (order.kind !== "tournament")
          fail("NOT_FOUND", 404, "Inscription introuvable.");
        if (request.method === "GET" && !match[2])
          return response(await detail(env, order, true));
        const s = await settings(env);
        if(request.method==='POST'&&match[2]==='cheque-received'){
          const d=await body(request),version=integer(d.version,0,2147483647);
          const registration=await env.ORDERS.prepare('SELECT payment_method,registration_status FROM tournament_registrations WHERE order_id=?').bind(order.id).first<Row>();
          if(registration?.payment_method!=='cheque'||registration.registration_status==='cancelled'||order.payment_status!=='pending')fail('CHEQUE_STATE',409,'Cette inscription ne peut pas être réglée par chèque dans son état actuel.');
          const mutation=crypto.randomUUID(),stamp=now();
          const result=await env.ORDERS.batch([
            env.ORDERS.prepare("UPDATE orders SET payment_status='paid',paid_at=?,updated_at=?,version=version+1,mutation_id=? WHERE id=? AND version=? AND payment_status='pending' RETURNING id").bind(stamp,stamp,mutation,order.id,version),
            env.ORDERS.prepare("INSERT INTO order_events(id,order_id,kind,actor,message,created_at) SELECT ?,?,'payment',?,'Chèque reçu et paiement confirmé par le club.',? WHERE (SELECT mutation_id FROM orders WHERE id=?)=?").bind(mutation,order.id,actor,stamp,order.id,mutation),
            env.ORDERS.prepare("INSERT INTO outbox(id,order_id,kind,available_at) SELECT ?,?,'paid',? WHERE (SELECT mutation_id FROM orders WHERE id=?)=?").bind(mutation,order.id,stamp,order.id,mutation)
          ]);
          if(!result[0].results.length)fail('VERSION',409,'Cette inscription a changé. Rechargez-la.');
          ctx.waitUntil(drainMail(env,s));return response({ok:true});
        }
        if (request.method === "POST" && match[2] === "reconcile") {
          await reconcile(env, s, order.id);
          ctx.waitUntil(drainMail(env, s));
          return response(
            await detail(env, await findOrder(env, order.id), true),
          );
        }
        if (request.method === "POST" && match[2] === "rotate-link") {
          const version = order.token_version + 1,
            token = await trackingToken(
              env.TRACKING_SECRET!,
              order.id,
              version,
            );
          const updated = await env.ORDERS.prepare(
            "UPDATE orders SET token_version=?,token_hash=?,token_expires=? WHERE id=? AND token_version=? RETURNING id",
          )
            .bind(
              version,
              await sha256(token),
              now() + 90 * 86400,
              order.id,
              order.token_version,
            )
            .first();
          if (!updated)
            fail("VERSION", 409, "Le lien a déjà changé. Rechargez la page.");
          await queueMail(env, crypto.randomUUID(), order.id, "tracking");
          ctx.waitUntil(drainMail(env, s));
          return response({ ok: true });
        }
        if (request.method === "POST" && match[2] === "resolve-attempt") {
          const d = await body(request),
            attemptId = uuid(d.attempt_id),
            intentId = integer(d.intent_id, 1, Number.MAX_SAFE_INTEGER);
          const intent = await api(
            env,
            `/organizations/${encodeURIComponent(s.organization_slug)}/checkout-intents/${intentId}`,
          );
          let metadata = intent.metadata;
          if (typeof metadata === "string")
            try {
              metadata = JSON.parse(metadata);
            } catch {
              metadata = {};
            }
          if (
            metadata?.order_id !== order.id ||
            metadata?.attempt_id !== attemptId
          )
            fail(
              "ATTEMPT_MISMATCH",
              409,
              "Cette intention HelloAsso ne correspond pas à cette inscription et cette tentative.",
            );
          const updated = await env.ORDERS.prepare(
            "UPDATE checkout_attempts SET intent_id=?,state='pending',last_error='' WHERE id=? AND order_id=? AND intent_id IS NULL AND state IN ('creating','uncertain') RETURNING id",
          )
            .bind(intentId, attemptId, order.id)
            .first();
          if (!updated)
            fail(
              "ATTEMPT_MISMATCH",
              409,
              "Cette tentative n’est plus à récupérer.",
            );
          await reconcile(env, s, order.id);
          ctx.waitUntil(drainMail(env, s));
          return response({ ok: true });
        }
        if (request.method === "POST" && match[2] === "resend") {
          await queueMail(env, crypto.randomUUID(), order.id, "tracking");
          ctx.waitUntil(drainMail(env, s));
          return response({ ok: true });
        }
        if (request.method === "PUT" && !match[2]) {
          const d = await body(request),
            status = text(d.registration_status, 20, true),
            note = text(d.public_note || "", 1500),
            internal = text(d.internal_note || "", 3000),
            version = integer(d.version, 0, 2147483647);
          if (
            !["pending", "accepted", "cancelled", "attended"].includes(status)
          )
            fail("STATUS", 400, "Statut invalide.");
          // Cancellation stays final; existing live payments remain reconciled and refunds are managed in HelloAsso.
          const current = await env.ORDERS.prepare(
            "SELECT registration_status FROM tournament_registrations WHERE order_id=?",
          )
            .bind(order.id)
            .first<Row>();
          if (
            current?.registration_status === "cancelled" &&
            status !== "cancelled"
          )
            fail(
              "CANCELLED",
              409,
              "Créez une nouvelle inscription pour réinscrire cette équipe.",
            );
          const mutation = crypto.randomUUID();
          const result = await env.ORDERS.batch([
            env.ORDERS.prepare(
              "UPDATE orders SET mutation_id=?,version=version+1,updated_at=?,public_note=?,internal_note=?,fulfillment=?,closed_at=CASE WHEN ? IS NULL THEN NULL ELSE COALESCE(closed_at,?) END,token_expires=CASE WHEN ? IS NULL THEN token_expires ELSE COALESCE(closed_at,?)+7776000 END WHERE id=? AND version=? RETURNING id",
            ).bind(
              mutation,
              now(),
              note,
              internal,
              status === "cancelled" ? "cancelled" : "new",
              ...(() => {
                const closed = ["cancelled", "attended"].includes(status)
                  ? now()
                  : null;
                return [closed, closed, closed, now()];
              })(),
              order.id,
              version,
            ),
            env.ORDERS.prepare(
              "UPDATE tournament_registrations SET registration_status=? WHERE order_id=? AND (SELECT mutation_id FROM orders WHERE id=?)=?",
            ).bind(status, order.id, order.id, mutation),
            env.ORDERS.prepare(
              "INSERT OR IGNORE INTO order_events(id,order_id,kind,actor,message,created_at) SELECT ?,?,'fulfillment',?,?,? WHERE (SELECT mutation_id FROM orders WHERE id=?)=?",
            ).bind(
              `tournament:${order.id}:${version + 1}`,
              order.id,
              actor,
              `Inscription : ${status}. ${note}`,
              now(),
              order.id,
              mutation,
            ),
            env.ORDERS.prepare(
              "INSERT OR IGNORE INTO outbox(id,order_id,kind,available_at) SELECT ?,?,'fulfillment',? WHERE (SELECT mutation_id FROM orders WHERE id=?)=?",
            ).bind(
              `tournament:${order.id}:${version + 1}`,
              order.id,
              now(),
              order.id,
              mutation,
            ),
          ]);
          if (!result[0].results.length)
            fail(
              "VERSION",
              409,
              "Cette inscription a été modifiée. Rechargez-la.",
            );
          ctx.waitUntil(drainMail(env, s));
          return response({ ok: true });
        }
      }
      return response({ error: "Ressource inconnue." }, 404);
    }
    if (path === "/api/tournaments/catalogue" && request.method === "GET") {
      const rows = await sales(env);
      return response({
        tournaments: rows.map((r) => ({
            ...r,
            unavailable_reason: !r.enabled ? "Les inscriptions ne sont pas encore ouvertes." : r.status !== "open" ? "Les inscriptions ne sont pas ouvertes pour ce tournoi." : r.registration_deadline < now() || r.payment_deadline < now() ? "Les inscriptions sont closes." : "",
            sections: tournamentSections(r.categories),
            available:
              Boolean(r.enabled) && r.status === "open" &&
              r.registration_deadline >= now() &&
              r.payment_deadline >= now(),
          })),
      });
    }
    if (!["GET", "HEAD"].includes(request.method)) sameOrigin(request, env);
    const s = await settings(env);
    if (
      path === "/api/tournaments/registrations" &&
      request.method === "POST"
    ) {
      const result = await create(request, env, s);
      ctx.waitUntil(drainMail(env, s));
      return result;
    }
    if (path === "/api/tournaments/recover" && request.method === "POST") {
      await rateLimit(
        env,
        `tournament-recover:${request.headers.get("cf-connecting-ip") || "local"}`,
        5,
      );
      const d = await body(request),
        address = email(d.email);
      await rateLimit(env, `tournament-recover-email:${address}`, 3, 3600);
      const rows = await env.ORDERS.prepare(
        "SELECT id FROM orders WHERE kind='tournament' AND email=? COLLATE NOCASE ORDER BY created_at DESC LIMIT 10",
      )
        .bind(address)
        .all<Row>();
      for (const r of rows.results) {
        await env.ORDERS.prepare(
          "UPDATE orders SET token_expires=MAX(token_expires,?) WHERE id=?",
        )
          .bind(now() + 90 * 86400, r.id)
          .run();
        await queueMail(env, crypto.randomUUID(), r.id, "tracking");
      }
      ctx.waitUntil(drainMail(env, s));
      return response({
        message:
          "Si des inscriptions correspondent à cette adresse, leurs liens de suivi vous seront envoyés. Vérifiez aussi les courriers indésirables.",
      });
    }
    const match = path.match(
      /^\/api\/tournaments\/registrations\/([a-f0-9-]{36})(?:\/(pay|refresh))?$/,
    );
    if (match) {
      await rateLimit(
        env,
        `tournament-track:${request.headers.get("cf-connecting-ip") || "local"}`,
        120,
        60,
      );
      const order = await customerOrder(request, env, match[1]);
      if (order.kind !== "tournament")
        fail("NOT_FOUND", 404, "Inscription introuvable.");
      if (request.method === "GET" && !match[2])
        return response(await detail(env, order));
      if (request.method === "POST" && match[2] === "pay") {
        configured(env, s);
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
      if (request.method === "POST" && match[2] === "refresh") {
        await rateLimit(env, `refresh:${order.id}`, 10, 60);
        await reconcile(env, s, order.id);
        ctx.waitUntil(drainMail(env, s));
        return response(await detail(env, await findOrder(env, order.id)));
      }
    }
    return response({ error: "Ressource inconnue." }, 404);
  } catch (error) {
    const incident = crypto.randomUUID().slice(0, 8);
    return response(
      {
        error:
          error instanceof ShopError
            ? error.message
            : "L’opération n’a pas abouti. Rechargez la page ou contactez le club avec le numéro d’incident.",
        code: error instanceof ShopError ? error.code : "TOURNAMENT_ERROR",
        incident,
      },
      error instanceof ShopError ? error.status : 500,
    );
  }
}

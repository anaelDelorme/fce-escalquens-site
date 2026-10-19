import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { TestDatabase } from "./d1";
import worker from "../src/worker";
import {
  priceCart,
  paymentSummary,
  sha256,
  trackingToken,
  now,
  TERMS_VERSION,
} from "../src/shop/domain";
import {
  shopRoute,
  findOrder,
  settings,
  maintenance,
  reconcile,
  type ShopEnv,
} from "../src/shop/service";
import {tournamentEnv,tournamentRoute} from "../src/tournaments/service";
import {accessToken,tokenKey} from "../src/shop/helloasso-auth";
import { staff } from "../src/shop/security";
import { defaultSettings } from "../src/shop/terms";
import { drainMail } from "../src/shop/mail";
const product = { id: 1, name: "Castolo", active: 1, image_key: "test.webp" };
const variant = {
  id: "v",
  product_id: 1,
  active: 1,
  price_cents: 2300,
  sku: "KAPPA-1",
  supplier: "Intersport",
  size: "M",
  color: "Bordeaux",
};
const option = {
  id: "o",
  product_id: 1,
  active: 1,
  price_cents: 150,
  requires_text: 1,
  max_length: 4,
  label: "Initiales",
};
test("tarifs serveur, quantités, options et personnalisations", () => {
  const cart = priceCart(
    [{ variant_id: "v", quantity: 2, options: [{ id: "o", text: "AD" }] }],
    [variant],
    [option],
    [product],
  );
  assert.equal(cart.total, 4900);
  assert.equal(cart.items[0].options[0].text, "AD");
  for (const line of [
    { variant_id: "v", quantity: -1, options: [] },
    { variant_id: "missing", quantity: 1, options: [] },
    { variant_id: "v", quantity: 1, options: [{ id: "o", text: "" }] },
    { variant_id: "v", quantity: 1, options: [{ id: "o", text: "ABCDE" }] },
    {
      variant_id: "v",
      quantity: 1,
      options: [
        { id: "o", text: "AD" },
        { id: "o", text: "CD" },
      ],
    },
  ])
    assert.throws(() => priceCart([line], [variant], [option], [product]));
  assert.throws(() =>
    priceCart(
      [{ variant_id: "v", quantity: 1, options: [] }],
      [variant],
      [],
      [{ ...product, active: 0 }],
    ),
  );
});
test("seuls les paiements autorisés couvrant le total valident la commande", () => {
  assert.equal(
    paymentSummary([{ id: 1, state: "Authorized", amount: 2300 }], 2300).status,
    "paid",
  );
  assert.equal(
    paymentSummary([{ id: 1, state: "Registered", amount: 2300 }], 2300).status,
    "pending",
  );
  assert.equal(
    paymentSummary(
      [{ id: 1, state: "WaitingBankValidation", amount: 2300 }],
      2300,
    ).status,
    "pending",
  );
  assert.equal(
    paymentSummary([{ id: 1, state: "Authorized", amount: 2000 }], 2300).status,
    "review",
  );
  assert.equal(
    paymentSummary(
      [
        { id: 1, state: "Authorized", amount: 2300 },
        { id: 2, state: "Authorized", amount: 2300 },
      ],
      2300,
    ).status,
    "review",
  );
  assert.equal(
    paymentSummary(
      [
        {
          id: 1,
          state: "Authorized",
          amount: 2300,
          refundOperations: [{ status: "PROCESSED", amount: 500 }],
        },
      ],
      2300,
    ).status,
    "partially_refunded",
  );
  assert.equal(
    paymentSummary([{ id: 1, state: "Refunded", amount: 2300 }], 2300).status,
    "refunded",
  );
  assert.equal(
    paymentSummary([{ id: 1, state: "Contested", amount: 2300 }], 2300).status,
    "contested",
  );
  assert.throws(() =>
    paymentSummary(
      [
        { id: 1, state: "Authorized", amount: 2300 },
        { id: 1, state: "Authorized", amount: 2300 },
      ],
      2300,
    ),
  );
});
test("liens opaques, déterministes pour les mails, stockés uniquement en hash", async () => {
  const a = await trackingToken("a".repeat(64), "test", 1);
  assert.match(a, /^[a-f0-9]{64}$/);
  assert.notEqual(a, await sha256(a));
  assert.equal(a, await trackingToken("a".repeat(64), "test", 1));
  assert.notEqual(a, await trackingToken("a".repeat(64), "test", 2));
});
let DB: TestDatabase, ORDERS: TestDatabase, TOURNEYS:TestDatabase, env: ShopEnv;
const tasks: Promise<unknown>[] = [];
const ctx = {
  waitUntil(p: Promise<unknown>) {
    tasks.push(p);
  },
} as ExecutionContext;
const accessPair = await generateKeyPair("RS256");
const accessJwk = {
  ...(await exportJWK(accessPair.publicKey)),
  kid: "test-key",
  alg: "RS256",
  use: "sig",
};
const checkoutMetadata = new Map<number, any>();
const realFetch = globalThis.fetch;
let oauthGrants:string[]=[];
let checkoutBodies:any[]=[];
let intents = 0,
  paymentAuthorized = false,
  providerDown = false,
  sent = 0,
  mailFails = false,
  refund = 0,
  apiTotal = 4900;
const ids = {
  variant: "11111111-1111-4111-8111-111111111111",
  option: "22222222-2222-4222-8222-222222222222",
};
const settingsValue = {
  ...defaultSettings,
  legal_ready: true,
  checkout_enabled: true,
  organization_slug: "test-fce",
  seller_address: "Adresse test",
  seller_id: "RNA test",
  seller_phone: "0102030405",
  collection_address: "Club test",
  mediator_name: "Médiateur test",
  mediator_url: "https://example.org",
};
before(async () => {
  DB = new TestDatabase();
  ORDERS = new TestDatabase();
  TOURNEYS=new TestDatabase();
  await TOURNEYS.exec(readFileSync(new URL("../migrations-tournaments/0001_tournaments.sql",import.meta.url),"utf8"));
  await TOURNEYS.exec(readFileSync(new URL("../migrations-tournaments/0002_registration_sections.sql",import.meta.url),"utf8"));
  await TOURNEYS.exec(readFileSync(new URL("../migrations-tournaments/0003_cheque_payments.sql",import.meta.url),"utf8"));
  await TOURNEYS.exec("INSERT INTO module_imports(id,imported_at) VALUES('v5.2',0)");
  await TOURNEYS.exec(`INSERT INTO tournaments(id,slug,name,starts_on,categories,status) VALUES(1,'tournoi-u11','Tournoi U11','2027-06-10','["U11"]','open');`);
  await DB.exec(
    "CREATE TABLE admins(email TEXT,active INTEGER);CREATE TABLE shop_products(id INTEGER PRIMARY KEY,name TEXT,image_key TEXT,active INTEGER,price_label TEXT,sizes TEXT,options TEXT);CREATE TABLE shop_settings(id INTEGER PRIMARY KEY,shop_enabled INTEGER);INSERT INTO shop_settings VALUES(1,1);INSERT INTO shop_products VALUES(1,'Castolo','test.webp',1,'Dès 20 €','','');",
  );
  await DB.exec("ALTER TABLE shop_products ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0;ALTER TABLE shop_products ADD COLUMN short_description TEXT DEFAULT '';ALTER TABLE shop_products ADD COLUMN description TEXT DEFAULT '';ALTER TABLE shop_products ADD COLUMN delivery_delay TEXT DEFAULT '';ALTER TABLE shop_products ADD COLUMN updated_at TEXT;");
  await DB.exec("CREATE TABLE shop_categories(id INTEGER PRIMARY KEY,slug TEXT UNIQUE,name TEXT,description TEXT,display_order INTEGER DEFAULT 0,active INTEGER DEFAULT 1,updated_at TEXT);INSERT INTO shop_categories(id,slug,name,display_order,active) VALUES(1,'textile','Textile',0,1);ALTER TABLE shop_products ADD COLUMN shop_category_id INTEGER REFERENCES shop_categories(id);ALTER TABLE shop_products ADD COLUMN price_details TEXT DEFAULT '';UPDATE shop_products SET shop_category_id=1;");
  // D1 exec accepts individual statements; migrations contain no triggers or embedded semicolons.
  for (const stmt of readFileSync(
    new URL("../migrations/0029_shop_checkout.sql", import.meta.url),
    "utf8",
  )
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean))
    await DB.prepare(stmt).run();
  for (const file of readdirSync(
    new URL("../migrations-orders/", import.meta.url),
  )
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    for (const stmt of readFileSync(
      new URL(`../migrations-orders/${file}`, import.meta.url),
      "utf8",
    )
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean))
      await ORDERS.prepare(stmt).run();
  }
  await DB.prepare(
    "INSERT INTO shop_variants(id,product_id,label,size,color,sku,supplier,price_cents) VALUES(?,1,'Adulte M','M','Bordeaux','KAPPA-1','Intersport',2300)",
  )
    .bind(ids.variant)
    .run();
  await DB.prepare(
    "INSERT INTO shop_options(id,product_id,label,price_cents,requires_text,max_length) VALUES(?,1,'Initiales',150,1,4)",
  )
    .bind(ids.option)
    .run();
  await DB.exec(readFileSync(new URL('../migrations/0030_shop_suppliers.sql',import.meta.url),'utf8'));
  await DB.exec("CREATE TABLE venues(id INTEGER PRIMARY KEY,name TEXT,address TEXT,maps_url TEXT,active INTEGER,display_order INTEGER); INSERT INTO venues VALUES(1,'Stade du club','1 rue du Stade','https://maps.example/stade',1,0);");
  await DB.exec("CREATE TABLE tournaments(id INTEGER PRIMARY KEY,name TEXT,starts_on TEXT,categories TEXT,status TEXT);INSERT INTO tournaments VALUES(1,'Tournoi U11','2027-06-10','[\"U11\"]','open');");
  await DB.exec(readFileSync(new URL('../migrations/0031_tournament_checkout.sql',import.meta.url),'utf8'));

  await ORDERS.prepare("UPDATE settings SET data=? WHERE id=1")
    .bind(JSON.stringify(settingsValue))
    .run();
  env = {
    DB: DB as any,
    ORDERS: ORDERS as any,
    TOURNAMENTS:TOURNEYS as any,
    ASSETS: { fetch: async () => new Response("<html>page</html>") } as any,
    APP_ENV: "local",
    SHOP_ORIGIN: "http://localhost:8787",
    TRACKING_SECRET: "a".repeat(64),
    HELLOASSO_CLIENT_ID: "test",
    HELLOASSO_CLIENT_SECRET: "test",
    DEV_ADMIN_TOKEN: "local-secret",
    MAIL_PROVIDER: "cloudflare",
    MAIL_FROM: "boutique@example.org",
    MAIL_TEST_TO: "tester@example.org",
    EMAIL: {
      async send(message) {
        assert.equal(message.to, "tester@example.org");
        assert.match(message.text,/\/(boutique|tournois)\/suivi\/#/);
        if (mailFails) throw new Error("error leaking token http://secret");
        sent++;
        return { messageId: `m-${sent}` };
      },
    },
  };
  globalThis.fetch = (async (input: any, init: any) => {
    const url = String(input);
    if (url.includes("test.cloudflareaccess.com/cdn-cgi/access/certs"))
      return Response.json({ keys: [accessJwk] });
    if (url.includes("/oauth2/token")) {
      oauthGrants.push(new URLSearchParams(init.body).get('grant_type')||'');
      return Response.json({ access_token: "test-token", refresh_token:"test-refresh",expires_in: 1800 });
    }
    if(url.endsWith('/users/me/organizations'))return Response.json([{organizationSlug:'test-fce'}]);
    if(url.endsWith('/organizations/test-fce'))return Response.json({isCashInCompliant:true});
    if (url.endsWith("/checkout-intents") && init?.method === "POST") {
      intents++;
      checkoutBodies.push(JSON.parse(init.body));
      checkoutMetadata.set(100 + intents, JSON.parse(init.body).metadata);
      if (providerDown) throw new Error("socket closed");
      return Response.json({
        id: 100 + intents,
        redirectUrl: "https://www.helloasso-sandbox.com/test",
      });
    }
    if (url.match(/\/orders\/[0-9]+$/))
      return Response.json({
        organizationSlug: "test-fce",
        checkoutIntentId: Number(url.split("/").at(-1)) - 200,
      });
    if (url.includes("/checkout-intents/")) {
      const id = Number(url.split("/").at(-1));
      return Response.json({
        id,
        redirectUrl: "https://www.helloasso-sandbox.com/test",
        metadata: checkoutMetadata.get(id),
        ...(paymentAuthorized
          ? {
              order: {
                id: 200 + id,
                organizationSlug: "test-fce",
                formType: "Checkout",
                checkoutIntentId: id,
                amount: { total: apiTotal },
                payments: [
                  {
                    id: 300 + id,
                    state: "Authorized",
                    amount: 4900,
                    refundOperations: refund
                      ? [{ status: "Processed", amount: refund }]
                      : [],
                  },
                ],
              },
            }
          : {}),
      });
    }
    throw new Error(`Unexpected external request ${url}`);
  }) as typeof fetch;
});
after(async () => {
  globalThis.fetch = realFetch;
  await Promise.allSettled(tasks);
  DB?.close();
  ORDERS?.close();
  TOURNEYS?.close();
});
const request = (
  path: string,
  data?: unknown,
  { token, admin = false, origin = "http://localhost:8787", method }: any = {},
) =>
  new Request(`http://localhost:8787${path}`, {
    method: method || (data ? "POST" : "GET"),
    headers: {
      ...(data ? { "content-type": "application/json", origin } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(admin ? { "x-admin-token": "local-secret" } : {}),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
const route = async (req: Request) => {
  const res = await shopRoute(req, env, ctx);
  assert.ok(res);
  return { status: res.status, body: (await res.json()) as any };
};
const payload = (id = crypto.randomUUID()) => ({
  idempotency_key: id,
  first_name: "Anaël",
  last_name: "Test",
  email: "client@example.org",
  phone: "0612345678",
  licensed_name: "Joueur",
  team: "U11",
  delivery_method: "coach",
  accept_terms: true,
  terms_version: TERMS_VERSION,
  expected_total: 4900,
  items: [
    {
      variant_id: ids.variant,
      quantity: 2,
      options: [{ id: ids.option, text: "AD" }],
    },
  ],
});
let created: any;
test("API et SQL SQLite : création idempotente, prix figés, séparation et aucun jeton en clair", async () => {
  const data = payload();
  const a = await route(request("/api/shop/checkout", data));
  assert.equal(a.status, 200);
  created = { ...a.body, payload: data };
  assert.equal(intents, 1);
  const b = await route(request("/api/shop/checkout", data));
  assert.equal(b.status, 200);
  assert.equal(intents, 1);
  assert.equal(b.body.order_id, a.body.order_id);
  const row = await env.ORDERS.prepare("SELECT * FROM orders WHERE id=?")
    .bind(a.body.order_id)
    .first<any>();
  assert.equal(row.token_hash, await sha256(a.body.tracking_token));
  assert.ok(!JSON.stringify(row).includes(a.body.tracking_token));
  assert.equal(row.total_cents, 4900);
  assert.equal(
    (
      await env.ORDERS.prepare(
        "SELECT COUNT(*) AS n FROM order_items",
      ).first<any>()
    ).n,
    1,
  );
  await assert.rejects(env.DB.prepare("SELECT * FROM orders").all());
  assert.equal(
    (await route(request("/api/shop/checkout", { ...data, team: "U13" })))
      .status,
    409,
  );
});
test("origine étrangère, montant modifié, accès sans lien et faux e-mail Cloudflare refusés", async () => {
  assert.equal(
    (
      await route(
        request("/api/shop/checkout", payload(), {
          origin: "https://attacker.example",
        }),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await route(
        request("/api/shop/checkout", { ...payload(), expected_total: 1 }),
      )
    ).status,
    409,
  );
  assert.equal(
    (await route(request(`/api/shop/orders/${created.order_id}`))).status,
    404,
  );
  const badToken = "b".repeat(64);
  assert.equal(
    (
      await route(
        request(`/api/shop/orders/${created.order_id}`, undefined, {
          token: badToken,
        }),
      )
    ).status,
    404,
  );
  const production = {
    ...env,
    APP_ENV: "production",
    CF_ACCESS_ISSUER: "https://test.cloudflareaccess.com",
    CF_ACCESS_SHOP_AUD: "aud",
  };
  await assert.rejects(
    staff(
      new Request("https://example.org/admin-boutique/", {
        headers: {
          "cf-access-authenticated-user-email": "admin@example.org",
          "x-admin-token": "local-secret",
        },
      }),
      production,
    ),
    /Cloudflare Access/,
  );
});
test("suivi minimise les données et refuse tout paramètre succeeded comme preuve de paiement", async () => {
  const a = await route(
    request(`/api/shop/orders/${created.order_id}?code=succeeded`, undefined, {
      token: created.tracking_token,
    }),
  );
  assert.equal(a.status, 200);
  assert.equal(a.body.order.payment_status, "pending");
  for (const key of [
    "email",
    "phone",
    "last_name",
    "internal_note",
    "token_hash",
    "request_hash",
  ])
    assert.equal(a.body.order[key], undefined);
  assert.equal(
    (
      await route(
        request(
          `/admin-boutique/api/orders/${created.order_id}/purchase-order`,
          undefined,
          { admin: true },
        ),
      )
    ).status,
    409,
  );
});
test("webhook répétable, vérification API et paiement/confirmation uniques", async () => {
  paymentAuthorized = true;
  await env.ORDERS.prepare("UPDATE orders SET last_checked=0").run();
  const notify = {
    eventType: "Payment",
    metadata: { order_id: created.order_id },
    data: { amount: 1, state: "Authorized" },
  };
  const a = await route(
    request("/api/shop/helloasso/webhook", notify, {
      origin: "https://helloasso.com",
    }),
  );
  assert.equal(a.status, 200);
  await env.ORDERS.prepare("UPDATE orders SET last_checked=0").run();
  await route(request("/api/shop/helloasso/webhook", notify));
  const order = await env.ORDERS.prepare("SELECT * FROM orders WHERE id=?")
    .bind(created.order_id)
    .first<any>();
  assert.equal(order.payment_status, "paid");
  assert.ok(order.paid_at);
  assert.equal(
    (
      await env.ORDERS.prepare(
        "SELECT COUNT(*) AS n FROM outbox WHERE kind='paid'",
      ).first<any>()
    ).n,
    1,
  );
});
test("bon individuel sans coordonnées client et protégé", async () => {
  const result = await shopRoute(
    request(
      `/admin-boutique/api/orders/${created.order_id}/purchase-order`,
      undefined,
      { admin: true },
    ),
    env,
    ctx,
  );
  assert.equal(result?.status, 200);
  const html = await result!.text();
  assert.match(html, /KAPPA-1/);
  assert.match(html, /AD/);
  assert.ok(!html.includes("client@example.org"));
  assert.ok(!html.includes("0612345678"));
});
test("mise à jour atomique, contrôle des quantités et conflit de version", async () => {
  const initial = await route(
    request(`/admin-boutique/api/orders/${created.order_id}`, undefined, {
      admin: true,
    }),
  );
  const item = initial.body.items[0],
    data = {
      version: initial.body.order.version,
      fulfillment: "ready",
      public_note: "Disponible jeudi",
      internal_note: "Note privée",
      items: [{ id: item.id, received: 0, delivered: 0 }],
    };
  assert.equal(
    (
      await route(
        request(`/admin-boutique/api/orders/${created.order_id}`, data, {
          admin: true,
          method: "PATCH",
        }),
      )
    ).status,
    409,
  );
  data.items[0].received = 2;
  assert.equal(
    (
      await route(
        request(`/admin-boutique/api/orders/${created.order_id}`, data, {
          admin: true,
          method: "PATCH",
        }),
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await route(
        request(`/admin-boutique/api/orders/${created.order_id}`, data, {
          admin: true,
          method: "PATCH",
        }),
      )
    ).status,
    409,
  );
  const updated = await route(
    request(`/api/shop/orders/${created.order_id}`, undefined, {
      token: created.tracking_token,
    }),
  );
  assert.equal(updated.body.items[0].received, 2);
  assert.ok(!JSON.stringify(updated.body).includes("Note privée"));
});
test("enquête facultative, bornes de notes et réponse unique", async () => {
  const path = `/api/shop/orders/${created.order_id}/survey`;
  assert.equal(
    (
      await route(
        request(
          path,
          { ease: 0, catalogue: 5, overall: 5 },
          { token: created.tracking_token },
        ),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await route(
        request(
          path,
          {
            ease: 5,
            catalogue: 4,
            overall: 5,
            comment: "<script>test</script>",
          },
          { token: created.tracking_token },
        ),
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await route(
        request(
          path,
          { ease: 5, catalogue: 4, overall: 5 },
          { token: created.tracking_token },
        ),
      )
    ).status,
    409,
  );
});
test("rotation et expiration du lien, récupération sans énumération", async () => {
  await route(
    request(
      `/admin-boutique/api/orders/${created.order_id}/rotate-link`,
      {},
      { admin: true },
    ),
  );
  assert.equal(
    (
      await route(
        request(`/api/shop/orders/${created.order_id}`, undefined, {
          token: created.tracking_token,
        }),
      )
    ).status,
    404,
  );
  const token = await trackingToken(env.TRACKING_SECRET!, created.order_id, 2);
  created.tracking_token = token;
  assert.equal(
    (
      await route(
        request(`/api/shop/orders/${created.order_id}`, undefined, { token }),
      )
    ).status,
    200,
  );
  await env.ORDERS.prepare("UPDATE orders SET token_expires=? WHERE id=?")
    .bind(now() - 1, created.order_id)
    .run();
  assert.equal(
    (
      await route(
        request(`/api/shop/orders/${created.order_id}`, undefined, { token }),
      )
    ).status,
    404,
  );
  const correct = await route(
    request("/api/shop/recover", {
      reference: created.reference,
      email: "client@example.org",
    }),
  );
  const wrong = await route(
    request("/api/shop/recover", {
      reference: "FCE-inconnue",
      email: "unknown@example.org",
    }),
  );
  assert.equal(correct.body.message, wrong.body.message);
});
test("mail en échec : reprise, test vers destinataire imposé et absence de jeton dans les erreurs", async () => {
  await Promise.allSettled(tasks);
  mailFails = true;
  await env.ORDERS.prepare(
    "INSERT INTO outbox(id,order_id,kind,available_at) VALUES('failure',?,'tracking',?)",
  )
    .bind(created.order_id, now())
    .run();
  await drainMail(env, await settings(env));
  const job = await env.ORDERS.prepare(
    "SELECT * FROM outbox WHERE id='failure'",
  ).first<any>();
  assert.equal(job.status, "pending");
  assert.equal(job.last_error, "MAIL_SEND_FAILED");
  mailFails = false;
  await env.ORDERS.prepare(
    "UPDATE outbox SET available_at=0 WHERE id='failure'",
  ).run();
  await drainMail(env, await settings(env));
  assert.equal(
    (
      await env.ORDERS.prepare(
        "SELECT status FROM outbox WHERE id='failure'",
      ).first<any>()
    ).status,
    "sent",
  );
});
test("remboursement partiel et montant HelloAsso incohérent", async () => {
  refund = 500;
  await env.ORDERS.prepare("UPDATE orders SET last_checked=0").run();
  await reconcile(env, await settings(env), created.order_id);
  assert.equal(
    (
      await env.ORDERS.prepare("SELECT payment_status FROM orders WHERE id=?")
        .bind(created.order_id)
        .first<any>()
    ).payment_status,
    "partially_refunded",
  );
  apiTotal = 1;
  await env.ORDERS.prepare("UPDATE orders SET last_checked=0").run();
  await assert.rejects(
    reconcile(env, await settings(env), created.order_id),
    /montant/,
  );
  apiTotal = 4900;
  refund = 0;
});
test("timeout à la création : aucune seconde intention même après double clic", async () => {
  paymentAuthorized = false;
  providerDown = true;
  const data = payload();
  const a = await route(request("/api/shop/checkout", data));
  assert.equal(a.status, 503);
  const count = intents;
  const b = await route(request("/api/shop/checkout", data));
  assert.equal(b.status, 409);
  assert.equal(intents, count);
  providerDown = false;
});
test("purge enquête et compteurs, conservation des paiements incertains", async () => {
  await env.ORDERS.prepare("UPDATE surveys SET created_at=1").run();
  await env.ORDERS.prepare("INSERT INTO rate_limits VALUES('old',1,1)").run();
  await maintenance(env);
  assert.equal(
    (await env.ORDERS.prepare("SELECT count(*) AS n FROM surveys").first<any>())
      .n,
    0,
  );
  assert.equal(
    await env.ORDERS.prepare(
      "SELECT * FROM rate_limits WHERE key='old'",
    ).first(),
    null,
  );
  assert.ok(
    await env.ORDERS.prepare(
      "SELECT id FROM checkout_attempts WHERE state='uncertain'",
    ).first(),
  );
});

test("Cloudflare JWT : signature, audience, expiration, habilitation et accès direct index.html", async () => {
  await env.ORDERS.prepare("INSERT INTO shop_admins(email,active) VALUES(?,1)")
    .bind("admin@example.org")
    .run();
  const production = {
    ...env,
    APP_ENV: "production",
    CF_ACCESS_ISSUER: "https://test.cloudflareaccess.com",
    CF_ACCESS_SHOP_AUD: "aud",
  };
  const signed = async (
    address = "admin@example.org",
    aud = "aud",
    exp = now() + 600,
  ) =>
    new SignJWT({ email: address })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer(production.CF_ACCESS_ISSUER)
      .setAudience(aud)
      .setIssuedAt()
      .setExpirationTime(exp)
      .sign(accessPair.privateKey);
  const valid = await signed();
  const req = (token: string, path = "/admin-boutique/index.html") =>
    new Request(`https://example.org${path}`, {
      headers: { "cf-access-jwt-assertion": token },
    });
  assert.equal(await staff(req(valid), production), "admin@example.org");
  assert.equal((await shopRoute(req(valid), production, ctx))?.status, 200);
  assert.equal(
    (
      await shopRoute(
        req(await signed("admin@example.org", "wrong")),
        production,
        ctx,
      )
    )?.status,
    401,
  );
  assert.equal(
    (
      await shopRoute(
        req(await signed("admin@example.org", "aud", now() - 60)),
        production,
        ctx,
      )
    )?.status,
    401,
  );
  assert.equal(
    (await shopRoute(req(await signed("unknown@example.org")), production, ctx))
      ?.status,
    403,
  );
  const tracking = await shopRoute(
    new Request("https://example.org/boutique/suivi/index.html"),
    production,
    ctx,
  );
  assert.equal(tracking?.headers.get("cache-control"), "no-store, private");
  assert.equal(tracking?.headers.get("referrer-policy"), "no-referrer");
  assert.match(
    tracking?.headers.get("content-security-policy") || "",
    /script-src 'self'/,
  );
});

test("signature HelloAsso sur le corps brut et refus des requêtes trop volumineuses", async () => {
  const raw = JSON.stringify(
    { eventType: "Payment", metadata: { order_id: created.order_id } },
    null,
    2,
  );
  const secret = "signature-secret",
    key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
  const bytes = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(raw),
  );
  const signature = Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  const notify = (value: string) =>
    new Request("http://localhost:8787/api/shop/helloasso/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-ha-signature": value },
      body: raw,
    });
  assert.equal(
    (
      await shopRoute(
        notify("0".repeat(64)),
        { ...env, HELLOASSO_WEBHOOK_SECRET: secret },
        ctx,
      )
    )?.status,
    401,
  );
  assert.equal(
    (
      await shopRoute(
        notify(signature),
        { ...env, HELLOASSO_WEBHOOK_SECRET: secret },
        ctx,
      )
    )?.status,
    200,
  );
  assert.equal(
    (
      await route(
        request("/api/shop/recover", {
          reference: "X".repeat(40000),
          email: "a@example.org",
        }),
      )
    ).status,
    413,
  );
});

test("soumissions simultanées : une seule commande et une seule intention", async () => {
  const data = payload();
  const initial = intents;
  const [a, b] = await Promise.all([
    route(request("/api/shop/checkout", data)),
    route(request("/api/shop/checkout", data)),
  ]);
  assert.ok([200, 409].includes(a.status));
  assert.ok([200, 409].includes(b.status));
  assert.equal(intents, initial + 1);
  assert.equal(
    (
      await env.ORDERS.prepare("SELECT COUNT(*) AS n FROM orders WHERE id=?")
        .bind(data.idempotency_key)
        .first<any>()
    ).n,
    1,
  );
  assert.equal(
    (
      await env.ORDERS.prepare(
        "SELECT COUNT(*) AS n FROM order_items WHERE order_id=?",
      )
        .bind(data.idempotency_key)
        .first<any>()
    ).n,
    1,
  );
});

test("réponse de création perdue : récupération automatique depuis un webhook vérifié par API", async () => {
  const attempt = await env.ORDERS.prepare(
    "SELECT * FROM checkout_attempts WHERE state='uncertain' LIMIT 1",
  ).first<any>();
  assert.ok(attempt);
  const intentId = [...checkoutMetadata.entries()].find(
    ([, m]) => m.attempt_id === attempt.id,
  )![0];
  paymentAuthorized = true;
  const before = intents;
  const result = await route(
    request("/api/shop/helloasso/webhook", {
      eventType: "Payment",
      metadata: { order_id: attempt.order_id, attempt_id: attempt.id },
      data: { order: { id: 200 + intentId } },
    }),
  );
  assert.equal(result.status, 200);
  assert.equal(intents, before);
  assert.equal(
    (
      await env.ORDERS.prepare("SELECT payment_status FROM orders WHERE id=?")
        .bind(attempt.order_id)
        .first<any>()
    ).payment_status,
    "paid",
  );
});

test("administrations distinctes : un administrateur site ne reçoit aucun droit boutique", async () => {
  const issuer = "https://test.cloudflareaccess.com";
  await env.DB.prepare("INSERT INTO admins VALUES(?,1)")
    .bind("site-only@example.org")
    .run();
  const token = await new SignJWT({ email: "site-only@example.org" })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(issuer)
    .setAudience("shop-aud")
    .setIssuedAt()
    .setExpirationTime(now() + 600)
    .sign(accessPair.privateKey);
  const request = new Request(
    "https://example.org/admin-boutique/api/settings",
    { headers: { "cf-access-jwt-assertion": token } },
  );
  const result = await shopRoute(
    request,
    {
      ...env,
      APP_ENV: "staging",
      CF_ACCESS_ISSUER: issuer,
      CF_ACCESS_SHOP_AUD: "shop-aud",
    },
    ctx,
  );
  assert.equal(result?.status, 403);
  const wrongAudience = await new SignJWT({ email: "admin@example.org" })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(issuer)
    .setAudience("site-aud")
    .setIssuedAt()
    .setExpirationTime(now() + 600)
    .sign(accessPair.privateKey);
  assert.equal(
    (
      await shopRoute(
        new Request("https://example.org/admin-boutique/", {
          headers: { "cf-access-jwt-assertion": wrongAudience },
        }),
        {
          ...env,
          APP_ENV: "staging",
          CF_ACCESS_ISSUER: issuer,
          CF_ACCESS_SHOP_AUD: "shop-aud",
        },
        ctx,
      )
    )?.status,
    401,
  );
});

test("catalogue déplacé : anciennes API fermées et nouvelle API limitée aux contenus boutique", async () => {
  const fetch = async (req: Request) => worker.fetch(req, env as any, ctx);
  assert.equal(
    (
      await fetch(
        request("/admin-api/shop_products", undefined, { admin: true }),
      )
    ).status,
    404,
  );
  assert.equal(
    (await fetch(request("/admin-api/shop/orders", undefined, { admin: true })))
      .status,
    410,
  );
  assert.equal(
    (
      await fetch(
        request("/admin-boutique/api/content/shop_products", undefined, {
          admin: true,
        }),
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await fetch(
        request("/admin-boutique/api/content/admins", undefined, {
          admin: true,
        }),
      )
    ).status,
    404,
  );
  assert.equal(
    (await fetch(request("/admin-boutique/api/content/shop_products"))).status,
    503,
  ); // Access absent in local configuration without dev token.
  assert.equal(
    (
      await fetch(
        request(
          "/admin-boutique/api/content/shop_products",
          { name: "test" },
          { admin: true, origin: "https://attacker.example" },
        ),
      )
    ).status,
    403,
  );
});

test("la couverture boutique est invisible et non modifiable depuis l’administration du site", async () => {
  await env.DB.exec(
    "CREATE TABLE site_media(id INTEGER PRIMARY KEY,slot TEXT,label TEXT,object_key TEXT DEFAULT '',alt_text TEXT DEFAULT '',display_order INTEGER DEFAULT 0,updated_at TEXT);INSERT INTO site_media(id,slot,label) VALUES(1,'shop_hero','Boutique'),(2,'home_story','Accueil')",
  );
  const fetch = async (req: Request) => worker.fetch(req, env as any, ctx);
  const shop = await fetch(
    request("/admin-boutique/api/content/site_media", undefined, {
      admin: true,
    }),
  );
  assert.deepEqual(
    ((await shop.json()) as any[]).map((row) => row.slot),
    ["shop_hero"],
  );
  const site = await fetch(
    request("/admin-api/site_media", undefined, { admin: true }),
  );
  assert.deepEqual(
    ((await site.json()) as any[]).map((row) => row.slot),
    ["home_story"],
  );
  assert.equal(
    (
      await fetch(
        request(
          "/admin-api/site_media/1",
          { alt_text: "forge" },
          { admin: true, method: "PUT" },
        ),
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await fetch(
        request(
          "/admin-boutique/api/content/site_media/2",
          { alt_text: "forge" },
          { admin: true, method: "PUT" },
        ),
      )
    ).status,
    404,
  );
});

test("avant HelloAsso : catalogue et administration utilisables, paiement fermé", async () => {
  const waiting = {
    ...env,
    HELLOASSO_CLIENT_ID: undefined,
    HELLOASSO_CLIENT_SECRET: undefined,
  };
  const catalogue = await shopRoute(
    request("/api/shop/catalogue"),
    waiting,
    ctx,
  );
  const data = (await catalogue!.json()) as any;
  assert.equal(catalogue?.status, 200);
  assert.equal(data.checkout_available, false);
  assert.ok(data.variants.length > 0);
  const admin = await shopRoute(
    request("/admin-boutique/api/settings", undefined, { admin: true }),
    waiting,
    ctx,
  );
  assert.equal(admin?.status, 200);
  const result = await shopRoute(
    request("/api/shop/checkout", payload()),
    waiting,
    ctx,
  );
  assert.equal(result?.status, 503);
});

test("les catégories et les visuels restent modifiables via les API boutique seules", async () => {
  (globalThis as any).caches = { default: { delete: async () => true } };
  const fetch = async (req: Request) => worker.fetch(req, env as any, ctx);
  const create = await fetch(
    request(
      "/admin-boutique/api/content/shop_categories",
      {
        slug: "test",
        name: "Test",
        description: "Présentation",
        display_order: 10,
        active: 1,
      },
      { admin: true },
    ),
  );
  assert.equal(create.status, 201);
  const rows = (await (
    await fetch(
      request("/admin-boutique/api/content/shop_categories", undefined, {
        admin: true,
      }),
    )
  ).json()) as any[];
  assert.ok(rows.some((r:any)=>r.name==="Test"));
  const update = await fetch(
    request(
      "/admin-boutique/api/content/site_media/1",
      { alt_text: "Nouvelle couverture" },
      { admin: true, method: "PUT" },
    ),
  );
  assert.equal(update.status, 200);
  assert.equal(
    (
      await env.DB.prepare(
        "SELECT alt_text FROM site_media WHERE id=1",
      ).first<any>()
    ).alt_text,
    "Nouvelle couverture",
  );
});

test("récupération sans référence : réponse générique et mail uniquement à l’adresse de commande", async () => {
  await ORDERS.prepare("DELETE FROM rate_limits").run();
  const before = await ORDERS.prepare("SELECT COUNT(*) AS n FROM outbox WHERE kind='tracking'").first<any>();
  const good=await route(request('/api/shop/recover',{email:'client@example.org'}));
  const bad=await route(request('/api/shop/recover',{email:'nobody@example.org'}));
  assert.equal(good.status,200);assert.equal(bad.status,200);assert.equal(good.body.message,bad.body.message);
  const after=await ORDERS.prepare("SELECT COUNT(*) AS n FROM outbox WHERE kind='tracking'").first<any>();
  assert.ok(after.n>before.n);
  const missing=await route(request('/api/shop/recover',{}));assert.equal(missing.status,400);
});
test("gestion des responsables : JWT obligatoire, ajout, désactivation et protection de son propre accès", async () => {
  const target={...env, APP_ENV:'staging',SHOP_ORIGIN:'https://example.org',CF_ACCESS_ISSUER:'https://test.cloudflareaccess.com',CF_ACCESS_SHOP_AUD:'aud'};
  const token=await new SignJWT({email:'admin@example.org'}).setProtectedHeader({alg:'RS256',kid:'test-key'}).setIssuer(target.CF_ACCESS_ISSUER).setAudience('aud').setExpirationTime(now()+600).sign(accessPair.privateKey);
  const req=(data?:any,jwt=token)=>new Request('https://example.org/admin-boutique/api/admins',{method:data?'PUT':'GET',headers:{'cf-access-jwt-assertion':jwt,'content-type':'application/json',origin:'https://example.org'},...(data?{body:JSON.stringify(data)}:{})});
  assert.equal((await shopRoute(req(undefined,'forged'),target,ctx))?.status,401);
  assert.equal((await shopRoute(req({email:'new@example.org',name:'Bénévole',active:true}),target,ctx))?.status,200);
  assert.equal((await ORDERS.prepare("SELECT active FROM shop_admins WHERE email='new@example.org'").first<any>()).active,1);
  assert.equal((await shopRoute(req({email:'admin@example.org',name:'Admin',active:false}),target,ctx))?.status,409);
  assert.equal((await shopRoute(req({email:'new@example.org',name:'Bénévole',active:false}),target,ctx))?.status,200);
  const other=await new SignJWT({email:'new@example.org'}).setProtectedHeader({alg:'RS256',kid:'test-key'}).setIssuer(target.CF_ACCESS_ISSUER).setAudience('aud').setExpirationTime(now()+600).sign(accessPair.privateKey);
  assert.equal((await shopRoute(req(undefined,other),target,ctx))?.status,403);
  const cross=new Request(req({email:'x@example.org',name:'X',active:true}),{headers:{'cf-access-jwt-assertion':token,'content-type':'application/json',origin:'https://evil.org'}});
  assert.equal((await shopRoute(cross,target,ctx))?.status,403);
});
test('CGV structurées et redirection vers le catalogue illustré', async()=>{
  const config=await route(request('/api/shop/config'));
  assert.equal(config.status,200);assert.ok(config.body.terms_sections.length>=8);assert.equal(config.body.terms_sections[0][0],'Vendeur et contact');
  const pdf=await shopRoute(request('/api/shop/catalogue.pdf'),env,ctx);
  assert.equal(pdf?.status,302);assert.equal(pdf?.headers.get('location'),'/boutique/catalogue/');
});

test('catégorie masquée : articles exclus du catalogue et des variantes vendables',async()=>{
 await DB.prepare('UPDATE shop_categories SET active=0 WHERE id=1').run();
 const cat=await route(request('/api/shop/catalogue'));assert.equal(cat.status,200);assert.equal(cat.body.products.length,0);assert.equal(cat.body.variants.length,0);
 await DB.prepare('UPDATE shop_categories SET active=1 WHERE id=1').run();
 const visible=await route(request('/api/shop/catalogue'));assert.ok(visible.body.products.length>0);assert.ok(visible.body.categories.length>0);
});

test('fournisseurs : migration des libellés, habilitation et contacts réservés à la gestion',async()=>{
 const migrated=await DB.prepare('SELECT supplier_id,supplier FROM shop_variants WHERE id=?').bind(ids.variant).first<any>();assert.ok(migrated.supplier_id);assert.equal(migrated.supplier,'Intersport');
 const unauthorized=await shopRoute(request('/admin-boutique/api/suppliers'),{...env,CF_ACCESS_ISSUER:'https://test.cloudflareaccess.com',CF_ACCESS_SHOP_AUD:'aud'},ctx);assert.equal(unauthorized?.status,401);
 const create=await route(request('/admin-boutique/api/suppliers',{name:'Atelier du club',email:'atelier@example.org',contact_name:'Contact',active:true},{admin:true,method:'PUT'}));assert.equal(create.status,200);
 const list=await route(request('/admin-boutique/api/suppliers',undefined,{admin:true}));assert.ok(list.body.suppliers.some((s:any)=>s.id===create.body.id&&s.email==='atelier@example.org'));
 const publicCat=await route(request('/api/shop/catalogue'));assert.equal(publicCat.body.suppliers,undefined);assert.ok(!JSON.stringify(publicCat.body).includes('atelier@example.org'));
 const duplicate=await route(request('/admin-boutique/api/suppliers',{name:'Atelier du club',active:true},{admin:true,method:'PUT'}));assert.equal(duplicate.status,409);
});
test('tarifs : prix affiché synchronisé, mode simple atomique et commandes passées conservées',async()=>{
 const supplier=(await DB.prepare("SELECT id FROM shop_suppliers WHERE name='Intersport'").first<any>()).id;
 await DB.prepare("INSERT INTO shop_products(id,name,image_key,active,shop_category_id,price_label) VALUES(991,'Accessoire','a.webp',1,1,'999 €')").run();
 const save=async(data:any)=>route(request('/admin-boutique/api/variants',{label:'M',size:'M',color:'',sku:'A-1',supplier_id:supplier,price_cents:1250,active:true,product_id:991,...data},{admin:true,method:'PUT'}));
 const first=await save({});assert.equal(first.status,200);
 let product=await DB.prepare('SELECT price_label FROM shop_products WHERE id=991').first<any>();assert.equal(product.price_label,'12,50 €');
 const second=await save({label:'L',size:'L',price_cents:1500});assert.equal(second.status,200);
 product=await DB.prepare('SELECT price_label FROM shop_products WHERE id=991').first<any>();assert.equal(product.price_label,'De 12,50 € à 15,00 €');
 // A catalogue text edit cannot overwrite the computed price of configured products.
 const edit=await worker.fetch(request('/admin-boutique/api/content/shop_products/991',{price_label:'1 €',image_key:'a.webp'},{admin:true,method:'PUT'}),env as any,ctx);assert.equal(edit.status,200);
 assert.equal((await DB.prepare('SELECT price_label FROM shop_products WHERE id=991').first<any>()).price_label,'De 12,50 € à 15,00 €');
 await DB.prepare("INSERT INTO shop_options(id,product_id,label,price_cents,requires_text,max_length,active) VALUES('old-option',991,'Initiales',200,1,4,1)").run();
 const snapshot=await ORDERS.prepare('SELECT name,supplier,unit_cents FROM order_items ORDER BY id LIMIT 1').first<any>();
 const simple=await save({id:first.body.id,simple:true,label:'Taille unique',size:'',price_cents:1800});assert.equal(simple.status,200);
 const active=(await DB.prepare('SELECT * FROM shop_variants WHERE product_id=991 AND active=1').all<any>()).results;assert.equal(active.length,1);assert.equal(active[0].label,'Taille unique');assert.equal(active[0].size,'');
 assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM shop_options WHERE product_id=991 AND active=1').first<any>()).n,0);
 assert.equal((await DB.prepare('SELECT price_label FROM shop_products WHERE id=991').first<any>()).price_label,'18,00 €');
 assert.deepEqual(await ORDERS.prepare('SELECT name,supplier,unit_cents FROM order_items ORDER BY id LIMIT 1').first<any>(),snapshot);
 const moved=await save({product_id:1,id:first.body.id});assert.equal(moved.status,409);
 const badSupplier=await save({supplier_id:'invented'});assert.equal(badSupplier.status,400);
});
test('variantes sans champs couleur et référence : création possible et anciennes données conservées',async()=>{
 const supplier=(await DB.prepare("SELECT id FROM shop_suppliers WHERE name='Intersport'").first<any>()).id;
 await DB.prepare("INSERT INTO shop_products(id,name,image_key,active,shop_category_id) VALUES(992,'Article sans référence','a.webp',1,1)").run();
 const save=async(data:any={})=>route(request('/admin-boutique/api/variants',{product_id:992,label:'Unique',size:'',supplier_id:supplier,price_cents:1000,active:true,...data},{admin:true,method:'PUT'}));
 const created=await save();assert.equal(created.status,200);
 const row=()=>DB.prepare('SELECT color,sku,price_cents FROM shop_variants WHERE id=?').bind(created.body.id).first<any>();
 assert.deepEqual({...await row()},{color:'',sku:'',price_cents:1000});
 await DB.prepare('UPDATE shop_variants SET color=?,sku=? WHERE id=?').bind('Bordeaux','ANCIENNE-REF',created.body.id).run();
 assert.equal((await save({id:created.body.id,simple:true,price_cents:1250})).status,200);
 assert.deepEqual({...await row()},{color:'Bordeaux',sku:'ANCIENNE-REF',price_cents:1250});
 assert.equal((await save({id:created.body.id,sku:'x'.repeat(101)})).status,400);
});
test('fournisseur désactivé : aucune nouvelle affectation, libellé courant actualisé, historique intact',async()=>{
 const supplier=await DB.prepare("SELECT * FROM shop_suppliers WHERE name='Intersport'").first<any>();
 const snapshot=await ORDERS.prepare('SELECT supplier FROM order_items ORDER BY id LIMIT 1').first<any>();
 const update=await route(request('/admin-boutique/api/suppliers',{id:supplier.id,version:supplier.version,name:'Intersport club',active:false},{admin:true,method:'PUT'}));assert.equal(update.status,200);
 assert.equal((await DB.prepare('SELECT supplier FROM shop_variants WHERE id=?').bind(ids.variant).first<any>()).supplier,'Intersport club');
 assert.deepEqual(await ORDERS.prepare('SELECT supplier FROM order_items ORDER BY id LIMIT 1').first<any>(),snapshot);
 const denied=await route(request('/admin-boutique/api/variants',{product_id:991,label:'Autre',size:'',sku:'A',supplier_id:supplier.id,price_cents:1000,active:true},{admin:true,method:'PUT'}));assert.equal(denied.status,409);
 const stale=await route(request('/admin-boutique/api/suppliers',{id:supplier.id,version:supplier.version,name:'Ancienne édition',active:true},{admin:true,method:'PUT'}));assert.equal(stale.status,409);
});

const tournamentApi=async(path:string,data?:any,options:any={})=>{const res=await tournamentRoute(request(path,data,options),env,ctx);assert.ok(res);return {status:res.status,body:await res.json() as any};};
const tournamentPayload=()=>({idempotency_key:crypto.randomUUID(),tournament_id:1,first_name:'Responsable',last_name:'Test',email:'responsable@example.org',phone:'0612345678',club_name:'Club test',sections:[{section:'U11',participating:true,quantity:1}],team_name:'Équipe A',category:'U11',payment_choice:'later',version:1,expected_total:4900,accept_terms:true});
let registration:any;
test('tournois : réglages versionnés, inscription différée atomique, capacité et prix figés',async()=>{
 const config={tournament_id:1,version:0,fee_cents:4900,capacity:1,enabled:true,allow_pay_later:true,registration_deadline:now()+86400,payment_deadline:now()+172800,terms:'Le club confirme les inscriptions. En cas d’annulation, contactez le club pour étudier les modalités de remboursement prévues au règlement.'};
 assert.equal((await tournamentApi('/admin-tournois/api/sales',config,{admin:true,method:'PUT'})).status,200);
 const before=intents,payload=tournamentPayload(),first=await tournamentApi('/api/tournaments/registrations',payload);
 assert.equal(first.status,200,JSON.stringify(first.body));registration={...first.body,payload};assert.equal(intents,before);
 assert.equal((await tournamentApi('/api/tournaments/registrations',payload)).body.order_id,registration.order_id);
 assert.equal((await tournamentApi('/api/tournaments/registrations',tournamentPayload())).body.code,'TOURNAMENT_FULL');
 const row=await TOURNEYS.prepare('SELECT * FROM orders WHERE id=?').bind(registration.order_id).first<any>();assert.equal(row.kind,'tournament');assert.equal(row.total_cents,4900);assert.notEqual(row.token_hash,registration.tracking_token);assert.equal(row.token_hash,await sha256(registration.tracking_token));
 assert.equal((await TOURNEYS.prepare('SELECT count(*) n FROM order_items WHERE order_id=?').bind(registration.order_id).first<any>()).n,1);
 assert.equal((await tournamentApi('/admin-tournois/api/sales',{...config,version:1,fee_cents:5500},{admin:true,method:'PUT'})).status,200);
 assert.equal((await tournamentApi('/admin-tournois/api/sales',{...config,version:1,fee_cents:6000},{admin:true,method:'PUT'})).status,409);
 assert.equal((await TOURNEYS.prepare('SELECT total_cents FROM orders WHERE id=?').bind(registration.order_id).first<any>()).total_cents,4900);
 assert.equal((await route(request(`/api/shop/orders/${registration.order_id}`,undefined,{token:registration.tracking_token}))).status,404);
 assert.equal((await route(request(`/admin-boutique/api/orders/${registration.order_id}`,undefined,{admin:true}))).status,404);
 assert.equal((await tournamentApi(`/api/tournaments/registrations/${created.order_id}`,undefined,{token:created.tracking_token})).status,404);
});
test('tournois : paiement ultérieur HelloAsso, retour sans secret et validation par API uniquement',async()=>{
 paymentAuthorized=false;providerDown=false;refund=0;apiTotal=4900;
 const path=`/api/tournaments/registrations/${registration.order_id}`;
 const paid=await tournamentApi(`${path}/pay`,{}, {token:registration.tracking_token});assert.equal(paid.status,200,JSON.stringify(paid.body));assert.match(paid.body.redirect_url,/helloasso-sandbox/);
 const payload=checkoutBodies.at(-1);assert.equal(payload.totalAmount,4900);assert.match(payload.returnUrl,/\/paiements\/retour\//);assert.ok(!JSON.stringify(payload).includes(registration.tracking_token));
 const view=await tournamentApi(path,undefined,{token:registration.tracking_token});assert.equal(view.body.order.payment_status,'pending');assert.equal(view.body.registration.registration_status,'pending');
 paymentAuthorized=true;const confirmed=await tournamentApi(`${path}/refresh`,{}, {token:registration.tracking_token});assert.equal(confirmed.body.order.payment_status,'paid');assert.equal(confirmed.body.registration.registration_status,'pending');
 await Promise.allSettled(tasks);await drainMail(env,await settings(env));const jobs=await TOURNEYS.prepare('SELECT status FROM outbox WHERE order_id=?').bind(registration.order_id).all<any>();assert.ok(jobs.results.every((j:any)=>j.status==='sent'));
});
test('tournois : habilitations Cloudflare indépendantes et contrôle des modifications concurrentes',async()=>{
 const production={...env,APP_ENV:'production',SHOP_ORIGIN:'https://example.org',CF_ACCESS_ISSUER:'https://test.cloudflareaccess.com',CF_ACCESS_SHOP_AUD:'aud',CF_ACCESS_TOURNAMENT_AUD:'tournament-aud'};
 await TOURNEYS.prepare("INSERT INTO tournament_admins(email,name) VALUES('tournois@example.org','Tournois')").run();
 const signed=async(address:string,aud:string)=>new SignJWT({email:address}).setProtectedHeader({alg:'RS256',kid:'test-key'}).setIssuer(production.CF_ACCESS_ISSUER).setAudience(aud).setExpirationTime(now()+600).sign(accessPair.privateKey);
 const req=async(address:string,aud:string)=>new Request('https://example.org/admin-tournois/',{headers:{'cf-access-jwt-assertion':await signed(address,aud)}});
 assert.equal((await tournamentRoute(await req('tournois@example.org','tournament-aud'),production,ctx))?.status,200);
 assert.equal((await tournamentRoute(await req('admin@example.org','aud'),production,ctx))?.status,401);
 assert.equal((await tournamentRoute(await req('admin@example.org','tournament-aud'),production,ctx))?.status,403);
 const order=await findOrder(tournamentEnv(env),registration.order_id),path=`/admin-tournois/api/registrations/${registration.order_id}`;
 assert.equal((await tournamentApi(path,{version:order.version,registration_status:'accepted',public_note:'Bienvenue',internal_note:'ok'},{admin:true,method:'PUT'})).status,200);
 assert.equal((await tournamentApi(path,{version:order.version,registration_status:'cancelled',public_note:'stale',internal_note:'stale'},{admin:true,method:'PUT'})).status,409);
 const updated=await tournamentApi(path,undefined,{admin:true});assert.equal(updated.body.registration.registration_status,'accepted');assert.equal(updated.body.order.public_note,'Bienvenue');
});
test('OAuth : cache chiffré et renouvellement avec refresh_token',async()=>{
 const base='https://api.helloasso-sandbox.com',key=await tokenKey(env,base),row=await ORDERS.prepare('SELECT * FROM helloasso_tokens WHERE cache_key=?').bind(key).first<any>();assert.ok(row);assert.ok(!row.encrypted.includes('test-token'));assert.ok(!row.encrypted.includes('test-refresh'));
 const before=oauthGrants.length;await accessToken(env,base);assert.equal(oauthGrants.length,before);
 await ORDERS.prepare('UPDATE helloasso_tokens SET expires_at=0 WHERE cache_key=?').bind(key).run();await accessToken(env,base);assert.equal(oauthGrants.at(-1),'refresh_token');
 const res=await route(request('/admin-boutique/api/helloasso/test',{}, {admin:true}));assert.equal(res.status,200);assert.equal(res.body.can_receive_payments,true);assert.ok(!JSON.stringify(res.body).includes('test-token'));
});
test('tournois : choix imposé, échéance, renvoi générique et révocation du lien personnel',async()=>{
 paymentAuthorized=false;providerDown=false;refund=0;
 const sale=(await tournamentApi('/admin-tournois/api/sales',undefined,{admin:true})).body.sales[0];
 assert.equal((await tournamentApi('/admin-tournois/api/sales',{...sale,tournament_id:sale.id,capacity:2,allow_pay_later:false},{admin:true,method:'PUT'})).status,200);
 const stale=await tournamentApi('/api/tournaments/registrations',tournamentPayload());assert.equal(stale.body.code,'PRICE_CHANGED');
 const payload={...tournamentPayload(),version:sale.version+1,expected_total:sale.fee_cents};assert.equal((await tournamentApi('/api/tournaments/registrations',payload)).body.code,'PAYMENT_CHOICE');
 const created=await tournamentApi('/api/tournaments/registrations',{...payload,payment_choice:'now'});assert.equal(created.status,200,JSON.stringify(created.body));const id=created.body.order_id,token=created.body.tracking_token;
 await TOURNEYS.prepare('UPDATE tournament_registrations SET payment_deadline=? WHERE order_id=?').bind(now()-1,id).run();
 assert.equal((await tournamentApi(`/api/tournaments/registrations/${id}/pay`,{},{token})).body.code,'PAYMENT_DEADLINE');
 assert.equal((await tournamentApi(`/admin-tournois/api/registrations/${id}/rotate-link`,{},{admin:true})).status,200);
 assert.equal((await tournamentApi(`/api/tournaments/registrations/${id}`,undefined,{token})).status,404);
 const good=await tournamentApi('/api/tournaments/recover',{email:'responsable@example.org'}),unknown=await tournamentApi('/api/tournaments/recover',{email:'inconnue@example.org'});assert.equal(good.status,200);assert.deepEqual(good.body,unknown.body);
 assert.equal((await tournamentApi('/api/tournaments/registrations',{...tournamentPayload()},{origin:'https://evil.example'})).status,403);
});
test('tournois : clôture, date d’expiration du lien et en-têtes de protection des pages',async()=>{
 const order=await findOrder(tournamentEnv(env),registration.order_id),path=`/admin-tournois/api/registrations/${order.id}`;
 const closed=await tournamentApi(path,{version:order.version,registration_status:'attended',public_note:'Merci',internal_note:''},{admin:true,method:'PUT'});assert.equal(closed.status,200,JSON.stringify(closed.body));
 const updated=await findOrder(tournamentEnv(env),order.id);assert.ok(updated.closed_at);assert.equal(updated.token_expires,updated.closed_at+90*86400);
 for(const path of ['/paiements/retour/index.html','/tournois/suivi/index.html']){const res=await tournamentRoute(request(path),env,ctx);assert.equal(res?.headers.get('cache-control'),'no-store, private');assert.equal(res?.headers.get('referrer-policy'),'no-referrer');assert.match(res?.headers.get('content-security-policy')||'',/script-src 'self'/);}
});
test('tournois V5.2 : création dans la D1 dédiée, ancien CRUD fermé et formulaire versionné',async()=>{
 const created=await tournamentApi('/admin-tournois/api/events',{name:'Tournoi personnalisé',starts_on:'2027-07-01',status:'open',venue:'Stade du club',categories:['U13'],summary:'Présentation',organizer:'FCE'},{admin:true});assert.equal(created.status,200,JSON.stringify(created.body));const id=created.body.id;
 assert.equal(await DB.prepare('SELECT id FROM tournaments WHERE id=? AND name=?').bind(id,'Tournoi personnalisé').first(),null);
 const old=await worker.fetch(request('/admin-api/tournaments',undefined,{admin:true}),env as any,ctx);assert.equal(old.status,410);
 const fields=[{id:'transport',label:'Besoin de stationnement ?',type:'select',required:true,choices:['Oui','Non']},{id:'comment',label:'Précision logistique',type:'textarea',required:false,choices:[]}];
 const config={tournament_id:id,version:0,fee_cents:4900,capacity:5,enabled:true,allow_pay_later:true,registration_deadline:now()+86400,payment_deadline:now()+172800,terms:'Inscription confirmée par le club. Les conditions d’annulation et de remboursement sont communiquées dans le règlement du tournoi.',form_fields:fields};
 assert.equal((await tournamentApi('/admin-tournois/api/sales',config,{admin:true,method:'PUT'})).status,200);
 const payload={...tournamentPayload(),tournament_id:id,sections:[{section:'U13',participating:true,quantity:1}]};
 assert.equal((await tournamentApi('/api/tournaments/registrations',payload)).status,400);
 const result=await tournamentApi('/api/tournaments/registrations',{...payload,answers:{transport:'Oui',comment:'Un minibus'}});assert.equal(result.status,200,JSON.stringify(result.body));
 const detail=await tournamentApi(`/api/tournaments/registrations/${result.body.order_id}`,undefined,{token:result.body.tracking_token});assert.equal(JSON.parse(detail.body.registration.answers_json).comment,'Un minibus');assert.equal(await ORDERS.prepare('SELECT id FROM orders WHERE id=?').bind(result.body.order_id).first(),null);
 assert.equal((await tournamentApi('/admin-tournois/api/sales',{...config,version:1,form_fields:[{...fields[0],label:'Nouveau libellé'}]},{admin:true,method:'PUT'})).status,200);
 const frozen=await tournamentApi(`/api/tournaments/registrations/${result.body.order_id}`,undefined,{token:result.body.tracking_token});assert.equal(JSON.parse(frozen.body.registration.form_snapshot)[0].label,'Besoin de stationnement ?');
 const invalid=await tournamentApi('/api/tournaments/registrations',{...payload,idempotency_key:crypto.randomUUID(),version:2,answers:{transport:'Choix inventé'}});assert.equal(invalid.status,400);
});
test('tournois V5.2 : webhook et mails traités dans la bonne base sans réveiller les copies historiques',async()=>{
 const original=await TOURNEYS.prepare('SELECT * FROM orders WHERE id=?').bind(registration.order_id).first<any>();
 // Simulate a historical row retained in ORDERS after migration.
 const columns=Object.keys(original);await ORDERS.prepare(`INSERT INTO orders(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`).bind(...columns.map(k=>original[k])).run();
 await ORDERS.prepare("INSERT INTO outbox(id,order_id,kind,available_at) VALUES('old-tournament-mail',?,'tracking',?)").bind(original.id,now()).run();
 const before=sent;await drainMail(env,await settings(env));assert.equal((await ORDERS.prepare("SELECT status FROM outbox WHERE id='old-tournament-mail'").first<any>()).status,'pending');
 paymentAuthorized=true;refund=0;apiTotal=4900;await TOURNEYS.prepare('UPDATE orders SET last_checked=0,payment_status=\'pending\' WHERE id=?').bind(original.id).run();
 const response=await worker.fetch(request('/api/shop/helloasso/webhook',{eventType:'Payment',metadata:{order_id:original.id}}),env as any,ctx);assert.equal(response.status,200);assert.equal((await TOURNEYS.prepare('SELECT payment_status FROM orders WHERE id=?').bind(original.id).first<any>()).payment_status,'paid');
 // No write/reconciliation of the stale historical copy in ORDERS.
 assert.equal((await ORDERS.prepare('SELECT payment_status FROM orders WHERE id=?').bind(original.id).first<any>()).payment_status,original.payment_status);
 await Promise.allSettled(tasks);
});
test('boutique : le catalogue et les paramètres distinguent paiement désactivé et configuration incomplète',async()=>{
 const s=await settings(env);await ORDERS.prepare('UPDATE settings SET data=? WHERE id=1').bind(JSON.stringify({...s,checkout_enabled:false})).run();
 const cat=await route(request('/api/shop/catalogue'));assert.equal(cat.body.checkout_available,false);assert.equal(cat.body.checkout_unavailable.code,'CHECKOUT_DISABLED');assert.match(cat.body.checkout_unavailable.message,/pas encore activé/);
 const admin=await route(request('/admin-boutique/api/settings',undefined,{admin:true}));assert.equal(admin.body.availability.code,'CHECKOUT_DISABLED');await ORDERS.prepare('UPDATE settings SET data=? WHERE id=1').bind(JSON.stringify(s)).run();
});
test('Access : audience erronée identifiée et gestion des responsables tournois avec JWT dédié',async()=>{
 const production={...env,APP_ENV:'production',SHOP_ORIGIN:'https://example.org',CF_ACCESS_ISSUER:'https://test.cloudflareaccess.com',CF_ACCESS_TOURNAMENT_AUD:'tournament-aud'};
 const jwt=async(aud:string)=>new SignJWT({email:'tournois@example.org'}).setProtectedHeader({alg:'RS256',kid:'test-key'}).setIssuer(production.CF_ACCESS_ISSUER).setAudience(aud).setExpirationTime(now()+600).sign(accessPair.privateKey);
 const req=async(aud:string,data?:any)=>new Request('https://example.org/admin-tournois/api/admins',{method:data?'PUT':'GET',headers:{'cf-access-jwt-assertion':await jwt(aud),...(data?{'content-type':'application/json',origin:'https://example.org'}:{})},...(data?{body:JSON.stringify(data)}:{})});
 const wrong=await tournamentRoute(await req('aud'),production,ctx);assert.equal(wrong?.status,401);assert.equal((await wrong!.json() as any).code,'ACCESS_AUDIENCE');
 assert.equal((await tournamentRoute(await req('tournament-aud',{email:'nouveau@example.org',name:'Nouveau',active:true}),production,ctx))?.status,200);
 assert.ok(await TOURNEYS.prepare("SELECT email FROM tournament_admins WHERE email='nouveau@example.org'").first());assert.equal(await ORDERS.prepare("SELECT email FROM tournament_admins WHERE email='nouveau@example.org'").first(),null);
 assert.equal((await tournamentRoute(await req('tournament-aud',{email:'tournois@example.org',name:'Tournois',active:false}),production,ctx))?.status,409);
});
test('copie initiale incomplète : inscriptions bloquées et webhook à réessayer, sans envoi de mail tournois',async()=>{
 await Promise.allSettled(tasks);await TOURNEYS.prepare("DELETE FROM module_imports WHERE id='v5.2'").run();
 try{
  const blocked=await tournamentApi('/api/tournaments/registrations',tournamentPayload());assert.equal(blocked.status,503);assert.equal(blocked.body.code,'MIGRATION_PENDING');
  const callback=await worker.fetch(request('/api/shop/helloasso/webhook',{eventType:'Payment',metadata:{order_id:registration.order_id}}),env as any,ctx);assert.equal(callback.status,503);
  const before=sent;await maintenance(tournamentEnv(env));assert.equal(sent,before);
 }finally{await TOURNEYS.prepare("INSERT INTO module_imports(id,imported_at) VALUES('v5.2',?)").bind(now()).run();}
});

test('tournoi multi-sections : réponses obligatoires, total serveur, capacité en équipes et prix figé',async()=>{
 await TOURNEYS.prepare("DELETE FROM rate_limits").run();
 const event=await tournamentApi('/admin-tournois/api/events',{name:'Tournoi sections',starts_on:'2027-07-02',status:'open',venue_id:1,categories:['U11','U13']},{admin:true});assert.equal(event.status,200);
 const id=event.body.id;
 const config={tournament_id:id,version:0,fee_cents:2500,capacity:4,enabled:true,allow_pay_later:true,registration_deadline:now()+86400,payment_deadline:now()+172800,terms:'Le club confirme l’inscription. En cas d’annulation, contactez le club pour connaître les modalités de remboursement.'};
 assert.equal((await tournamentApi('/admin-tournois/api/sales',config,{admin:true,method:'PUT'})).status,200);
 const sections=[{section:'U11',participating:true,quantity:2},{section:'U13',participating:true,quantity:1}];
 const payload={...tournamentPayload(),tournament_id:id,sections,expected_total:7500};
 for(const invalid of [undefined,[],[{section:'U11',participating:true,quantity:2}],sections.map(s=>({...s,participating:false})),[{...sections[0],quantity:1.5},sections[1]],[sections[0],{...sections[1],section:'U99'}]]){
   const denied=await tournamentApi('/api/tournaments/registrations',{...payload,sections:invalid});assert.equal(denied.status,400,JSON.stringify(denied.body));
 }
 const wrong=await tournamentApi('/api/tournaments/registrations',{...payload,expected_total:2500});assert.equal(wrong.body.code,'PRICE_CHANGED');
 const registered=await tournamentApi('/api/tournaments/registrations',payload);assert.equal(registered.status,200,JSON.stringify(registered.body));
 assert.equal((await tournamentApi('/api/tournaments/registrations',payload)).body.order_id,registered.body.order_id);
 const detail=await tournamentApi(`/api/tournaments/registrations/${registered.body.order_id}`,undefined,{token:registered.body.tracking_token});assert.equal(detail.body.order.total_cents,7500);assert.equal(detail.body.registration.team_count,3);assert.deepEqual(JSON.parse(detail.body.registration.sections_json),sections);
 assert.equal(detail.body.items.reduce((sum:number,row:any)=>sum+row.quantity*row.unit_cents,0),7500);
 const full=await tournamentApi('/api/tournaments/registrations',{...payload,idempotency_key:crypto.randomUUID(),sections:[{section:'U11',participating:true,quantity:2},{section:'U13',participating:false,quantity:0}],expected_total:5000});assert.equal(full.body.code,'TOURNAMENT_FULL');
 assert.equal((await tournamentApi('/admin-tournois/api/sales',{...config,version:1,fee_cents:3000,enabled:false},{admin:true,method:'PUT'})).status,200);
 const catalogue=await tournamentApi('/api/tournaments/catalogue');const sale=catalogue.body.tournaments.find((row:any)=>row.id===id);assert.equal(sale.fee_cents,3000);assert.equal(sale.available,false);assert.match(sale.unavailable_reason,/pas encore ouvertes/);
 assert.equal((await TOURNEYS.prepare('SELECT total_cents FROM orders WHERE id=?').bind(registered.body.order_id).first<any>()).total_cents,7500);
 assert.equal((await tournamentApi('/admin-tournois/api/sales',{...config,version:2,fee_cents:3000,capacity:40},{admin:true,method:'PUT'})).status,200);
 const many=await tournamentApi('/api/tournaments/registrations',{...payload,idempotency_key:crypto.randomUUID(),version:3,sections:[{section:'U11',participating:true,quantity:31},{section:'U13',participating:false,quantity:0}],expected_total:93000});assert.equal(many.status,200,JSON.stringify(many.body));
 const lines=(await TOURNEYS.prepare('SELECT quantity,unit_cents FROM order_items WHERE order_id=?').bind(many.body.order_id).all<any>()).results;assert.equal(lines.length,2);assert.equal(lines.reduce((sum:number,row:any)=>sum+row.quantity*row.unit_cents,0),93000);
});
test('lieux tournois : sélection dans la D1 du site et refus des lieux inconnus ou désactivés',async()=>{
 const listed=await tournamentApi('/admin-tournois/api/events',undefined,{admin:true});assert.equal(listed.status,200);assert.equal(listed.body.venues[0].address,'1 rue du Stade');
 const payload={name:'Tournoi lieu',starts_on:'2027-07-04',status:'published',categories:['U11'],venue_id:1};
 const created=await tournamentApi('/admin-tournois/api/events',payload,{admin:true});assert.equal(created.status,200);
 const row=await TOURNEYS.prepare('SELECT venue_id,venue FROM tournaments WHERE id=?').bind(created.body.id).first<any>();assert.equal(row.venue_id,1);assert.equal(row.venue,'Stade du club');
 assert.equal((await tournamentApi('/admin-tournois/api/events',{...payload,name:'Lieu invalide',venue_id:999},{admin:true})).body.code,'VENUE');
 await DB.prepare('UPDATE venues SET active=0 WHERE id=1').run();
 try{assert.equal((await tournamentApi('/admin-tournois/api/events',{...payload,name:'Lieu désactivé'},{admin:true})).status,409);}finally{await DB.prepare('UPDATE venues SET active=1 WHERE id=1').run();}
});

test('tournoi chèque : instructions figées, pas de checkout, réception réservée au club et confirmation unique',async()=>{
 await TOURNEYS.prepare('DELETE FROM rate_limits').run();
 const event=await tournamentApi('/admin-tournois/api/events',{name:'Tournoi chèques',starts_on:'2027-07-05',status:'open',categories:['U11']},{admin:true});assert.equal(event.status,200);const id=event.body.id;
 const config={tournament_id:id,version:0,fee_cents:5000,capacity:10,enabled:true,allow_pay_later:false,allow_cheque:true,cheque_payee:'FC Escalquens',cheque_address:'Club FCE, 1 rue du Stade',cheque_deadline:now()+150000,registration_deadline:now()+86400,payment_deadline:now()+172800,terms:'Le club confirme l’inscription. En cas d’annulation, contactez le club pour connaître les modalités de remboursement.'};
 assert.equal((await tournamentApi('/admin-tournois/api/sales',{...config,cheque_address:''},{admin:true,method:'PUT'})).status,400);
 assert.equal((await tournamentApi('/admin-tournois/api/sales',config,{admin:true,method:'PUT'})).status,200);
 const payload={...tournamentPayload(),tournament_id:id,expected_total:5000,payment_choice:'cheque'};
 const countBefore=intents,registered=await tournamentApi('/api/tournaments/registrations',payload);assert.equal(registered.status,200,JSON.stringify(registered.body));assert.equal(intents,countBefore);assert.equal(registered.body.redirect_url,undefined);
 const orderId=registered.body.order_id,token=registered.body.tracking_token;
 let detail=await tournamentApi(`/api/tournaments/registrations/${orderId}`,undefined,{token});assert.equal(detail.body.order.payment_status,'pending');assert.equal(detail.body.registration.payment_method,'cheque');assert.match(detail.body.registration.cheque_snapshot,/1 rue du Stade/);
 assert.equal((await tournamentApi(`/api/tournaments/registrations/${orderId}/pay`,{},{token})).body.code,'CHEQUE_PAYMENT');assert.equal(intents,countBefore);
 assert.equal((await tournamentApi('/admin-tournois/api/sales',{...config,version:1,cheque_address:'Nouvelle adresse'},{admin:true,method:'PUT'})).status,200);
 detail=await tournamentApi(`/api/tournaments/registrations/${orderId}`,undefined,{token});assert.match(detail.body.registration.cheque_snapshot,/1 rue du Stade/);
 assert.notEqual((await tournamentApi(`/admin-tournois/api/registrations/${orderId}/cheque-received`,{version:0})).status,200);
 assert.equal((await tournamentApi(`/admin-tournois/api/registrations/${orderId}/cheque-received`,{version:99},{admin:true})).status,409);
 assert.equal((await tournamentApi(`/admin-tournois/api/registrations/${orderId}/cheque-received`,{version:0},{admin:true})).status,200);
 assert.equal((await tournamentApi(`/admin-tournois/api/registrations/${orderId}/cheque-received`,{version:0},{admin:true})).status,409);
 detail=await tournamentApi(`/api/tournaments/registrations/${orderId}`,undefined,{token});assert.equal(detail.body.order.payment_status,'paid');assert.equal(detail.body.registration.registration_status,'pending');assert.equal(detail.body.events.filter((e:any)=>e.message==='Chèque reçu et paiement confirmé par le club.').length,1);
 assert.equal((await tournamentApi('/admin-tournois/api/sales',{...config,version:2,allow_cheque:false},{admin:true,method:'PUT'})).status,200);
 const denied=await tournamentApi('/api/tournaments/registrations',{...payload,idempotency_key:crypto.randomUUID(),version:3});assert.equal(denied.body.code,'CHEQUE_CLOSED');
});

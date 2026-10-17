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
  settings,
  maintenance,
  reconcile,
  type ShopEnv,
} from "../src/shop/service";
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
let DB: TestDatabase, ORDERS: TestDatabase, env: ShopEnv;
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
  await DB.exec(
    "CREATE TABLE admins(email TEXT,active INTEGER);CREATE TABLE shop_products(id INTEGER PRIMARY KEY,name TEXT,image_key TEXT,active INTEGER,price_label TEXT,sizes TEXT,options TEXT);CREATE TABLE shop_settings(id INTEGER PRIMARY KEY,shop_enabled INTEGER);INSERT INTO shop_settings VALUES(1,1);INSERT INTO shop_products VALUES(1,'Castolo','test.webp',1,'Dès 20 €','','');",
  );
  await DB.exec(
    "ALTER TABLE shop_products ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0",
  );
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
  await ORDERS.prepare("UPDATE settings SET data=? WHERE id=1")
    .bind(JSON.stringify(settingsValue))
    .run();
  env = {
    DB: DB as any,
    ORDERS: ORDERS as any,
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
        assert.ok(message.text.includes("/boutique/suivi/#"));
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
    if (url.includes("/oauth2/token"))
      return Response.json({ access_token: "test-token", expires_in: 1800 });
    if (url.endsWith("/checkout-intents") && init?.method === "POST") {
      intents++;
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
  await env.DB.exec(
    "CREATE TABLE shop_categories(id INTEGER PRIMARY KEY AUTOINCREMENT,slug TEXT UNIQUE,name TEXT,description TEXT,display_order INTEGER,active INTEGER,updated_at TEXT)",
  );
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
  assert.equal(rows[0].name, "Test");
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

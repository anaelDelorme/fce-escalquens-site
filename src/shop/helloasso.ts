import { fail, now, paymentSummary, type Row } from "./domain";
import { environment } from "./security";
import type { ShopEnv } from "./service";
import type { Settings } from "./terms";
let cachedToken: { key: string; token: string; expires: number } | undefined;
export function apiBase(env: ShopEnv) {
  return environment(env) === "production"
    ? "https://api.helloasso.com"
    : "https://api.helloasso-sandbox.com";
}
export async function api(
  env: ShopEnv,
  path: string,
  method = "GET",
  data?: unknown,
): Promise<Row> {
  const base = apiBase(env);
  const key = `${base}:${env.HELLOASSO_CLIENT_ID}:${env.HELLOASSO_CLIENT_SECRET}`;
  if (!env.HELLOASSO_CLIENT_ID || !env.HELLOASSO_CLIENT_SECRET)
    fail(
      "HELLOASSO_CONFIG",
      503,
      "Le paiement est temporairement indisponible. Le club doit terminer sa configuration.",
    );
  if (!cachedToken || cachedToken.key !== key || cachedToken.expires <= now()) {
    const auth = await fetch(`${base}/oauth2/token`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(12000),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: env.HELLOASSO_CLIENT_ID,
        client_secret: env.HELLOASSO_CLIENT_SECRET,
      }),
    });
    if (!auth.ok)
      fail(
        "HELLOASSO_AUTH",
        503,
        "La connexion au service de paiement est indisponible. Contactez le club si le problème persiste.",
      );
    const token = (await auth.json()) as Row;
    if (typeof token.access_token !== "string")
      fail("HELLOASSO_AUTH", 502, "Réponse du service de paiement invalide.");
    cachedToken = {
      key,
      token: token.access_token,
      expires:
        now() +
        Math.max(0, Math.min(Number(token.expires_in) || 1800, 1800) - 60),
    };
  }
  const result = await fetch(`${base}/v5${path}`, {
    method,
    redirect: "error",
    signal: AbortSignal.timeout(15000),
    headers: {
      authorization: `Bearer ${cachedToken.token}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  if (result.status === 401) cachedToken = undefined;
  if (!result.ok) {
    // Do not echo provider payloads: they can contain payer details or tokens.
    if (
      method === "POST" &&
      [400, 401, 403, 404, 409, 422].includes(result.status)
    )
      fail(
        "HELLOASSO_REJECTED",
        502,
        "HelloAsso n’a pas accepté la demande. Le club doit vérifier sa configuration et la validation de son association.",
      );
    fail(
      "HELLOASSO_UNAVAILABLE",
      503,
      "HelloAsso est momentanément indisponible. Votre commande est conservée.",
    );
  }
  try {
    return (await result.json()) as Row;
  } catch {
    return fail(
      "HELLOASSO_RESPONSE",
      502,
      "Réponse du service de paiement incomplète. Votre commande est conservée.",
    );
  }
}
export function safeRedirect(env: ShopEnv, value: unknown) {
  let url: URL;
  try {
    url = new URL(String(value));
  } catch {
    return fail(
      "HELLOASSO_RESPONSE",
      502,
      "Le lien de paiement est invalide. Contactez le club.",
    );
  }
  const host =
    environment(env) === "production"
      ? "helloasso.com"
      : "helloasso-sandbox.com";
  if (
    url.protocol !== "https:" ||
    !(url.hostname === host || url.hostname.endsWith(`.${host}`)) ||
    url.username ||
    url.password ||
    url.port
  )
    fail(
      "HELLOASSO_RESPONSE",
      502,
      "Le lien de paiement est invalide. Contactez le club.",
    );
  return url.href;
}
export async function verifiedPayments(
  env: ShopEnv,
  settings: Settings,
  attempt: Row,
  total: number,
) {
  const checkout = await api(
    env,
    `/organizations/${encodeURIComponent(settings.organization_slug)}/checkout-intents/${attempt.intent_id}`,
  );
  if (!checkout.order) return null;
  const order = checkout.order;
  if (
    Number(checkout.id) !== attempt.intent_id ||
    order.organizationSlug !== settings.organization_slug ||
    order.formType !== "Checkout" ||
    Number(order.amount?.total) !== total
  )
    fail(
      "PAYMENT_MISMATCH",
      502,
      "Le montant ou l’origine du paiement nécessite une vérification par le club.",
    );
  if (
    order.checkoutIntentId != null &&
    Number(order.checkoutIntentId) !== attempt.intent_id
  )
    fail("PAYMENT_MISMATCH", 502, "Référence de paiement incohérente.");
  // GET checkout includes authoritative payments; amounts exclude the optional HelloAsso tip.
  if (!Array.isArray(order.payments) || !order.payments.length) return null;
  paymentSummary(order.payments, total); // Validate structure before any write.
  return { orderId: integerId(order.id), payments: order.payments as Row[] };
}
function integerId(value: unknown) {
  if (!Number.isSafeInteger(value) || Number(value) <= 0)
    fail("HELLOASSO_RESPONSE", 502, "Référence HelloAsso invalide.");
  return Number(value);
}

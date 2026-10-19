import { fail, now, paymentSummary, type Row } from "./domain";
import { environment } from "./security";
import type { ShopEnv } from "./service";
import type { Settings } from "./terms";
import { accessToken } from "./helloasso-auth";
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
  const send = async (force = false) =>
    fetch(`${base}/v5${path}`, {
      method,
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
      headers: {
        authorization: `Bearer ${await accessToken(env, base, force)}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
  let result = await send();
  // A rejected bearer token has not executed the operation; refresh once, no retries on timeouts.
  if (result.status === 401) result = await send(true);
  if(result.status>=300&&result.status<400)
    fail('HELLOASSO_REDIRECT',502,'L’API HelloAsso a renvoyé une redirection inattendue. La requête n’a pas été réémise.');
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

export async function connectionStatus(env: ShopEnv, slug: string) {
  const organizations = await api(env, "/users/me/organizations");
  const rows = Array.isArray(organizations)
    ? organizations
    : Array.isArray(organizations.data)
      ? organizations.data
      : [];
  const allowed = rows.some((r: Row) => r.organizationSlug === slug);
  if (!allowed)
    fail(
      "HELLOASSO_ORGANIZATION",
      409,
      "Cette association n’est pas accessible avec les identifiants de cet environnement.",
    );
  const organization = await api(
    env,
    `/organizations/${encodeURIComponent(slug)}`,
  );
  return {
    environment: environment(env),
    organization_slug: slug,
    can_receive_payments: organization.isCashInCompliant === true,
  };
}

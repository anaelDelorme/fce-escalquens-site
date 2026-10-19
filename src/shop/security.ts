import { createRemoteJWKSet, jwtVerify } from "jose";
import { fail, now, sha256, text } from "./domain";
import type { ShopEnv } from "./service";
const jwks = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
export function environment(env: ShopEnv) {
  return env.APP_ENV === "production" ? "production" : "sandbox";
}
export function origin(env: ShopEnv) {
  const value = env.SHOP_ORIGIN || "";
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return fail(
      "CONFIG_ORIGIN",
      503,
      "La boutique est en cours de configuration.",
    );
  }
  if (
    (url.protocol !== "https:" &&
      !(env.APP_ENV === "local" && url.hostname === "localhost")) ||
    url.origin !== value
  )
    fail("CONFIG_ORIGIN", 503, "La boutique est en cours de configuration.");
  return value;
}
export function sameOrigin(request: Request, env: ShopEnv) {
  if (request.headers.get("origin") !== origin(env))
    fail("ORIGIN", 403, "Rechargez la page depuis le site du club.");
  if (request.headers.get("sec-fetch-site") === "cross-site")
    fail("ORIGIN", 403, "Requête non autorisée.");
}
export async function body(request: Request, max = 32768) {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    fail("CONTENT_TYPE", 415, "Format de requête invalide.");
  if (Number(request.headers.get("content-length") || 0) > max)
    fail("BODY_SIZE", 413, "La demande est trop volumineuse.");
  const reader = request.body?.getReader();
  if (!reader) fail("JSON", 400, "Demande vide.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      void reader.cancel();
      fail("BODY_SIZE", 413, "La demande est trop volumineuse.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (!data || Array.isArray(data) || typeof data !== "object")
      throw new Error();
    return data;
  } catch {
    return fail("JSON", 400, "Demande illisible. Rechargez la page.");
  }
}
export async function rateLimit(
  env: ShopEnv,
  key: string,
  limit: number,
  seconds = 600,
) {
  const bucket = Math.floor(now() / seconds);
  const hash = await sha256(`${env.TRACKING_SECRET || ""}:${bucket}:${key}`);
  const result = await env.ORDERS.prepare(
    "INSERT INTO rate_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count",
  )
    .bind(hash, (bucket + 1) * seconds)
    .first<{ count: number }>();
  if (!result || result.count > limit)
    fail(
      "RATE_LIMIT",
      429,
      "Trop de tentatives. Patientez quelques minutes avant de réessayer.",
    );
}
export function accessConfiguration(
  env: ShopEnv,
  scope: "shop" | "tournament" = "shop",
) {
  const issuer = (env.CF_ACCESS_ISSUER || "").trim().replace(/\/+$/, "");
  const audienceName =
    scope === "shop" ? "CF_ACCESS_SHOP_AUD" : "CF_ACCESS_TOURNAMENT_AUD";
  const audiences = (env[audienceName] || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const missing: string[] = [];
  if (!issuer) missing.push("CF_ACCESS_ISSUER");
  else if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer))
    missing.push("CF_ACCESS_ISSUER (domaine d’équipe invalide)");
  if (!audiences.length) missing.push(audienceName);
  if (missing.length)
    fail(
      "ACCESS_CONFIG",
      503,
      `Configuration Cloudflare Access manquante ou invalide : ${missing.join(", ")}. Renseignez ces variables sur le Worker de cet environnement, puis redéployez. L’AUD est celui de l’application ${scope === "shop" ? "boutique" : "tournois"}, pas l’identifiant de sa règle e-mail/PIN.`,
    );
  return { issuer, audiences };
}

export async function staff(
  request: Request,
  env: ShopEnv,
  scope: "shop" | "tournament" = "shop",
) {
  const url = new URL(request.url);
  if (
    env.APP_ENV === "local" &&
    ["localhost", "127.0.0.1"].includes(url.hostname) &&
    env.DEV_ADMIN_TOKEN &&
    request.headers.get("x-admin-token") === env.DEV_ADMIN_TOKEN
  )
    return "local-admin";
  const { issuer, audiences } = accessConfiguration(env, scope);
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token)
    fail("ACCESS_REQUIRED", 401, "Authentification Cloudflare Access requise.");
  try {
    if (!jwks.has(issuer))
      jwks.set(
        issuer,
        createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`)),
      );
    const { payload } = await jwtVerify(token, jwks.get(issuer)!, {
      issuer,
      audience: audiences,
      algorithms: ["RS256"],
    });
    if (typeof payload.email !== "string") throw new Error();
    const address = payload.email.toLowerCase();
    return await authorizedAddress(env, scope, address);
  } catch (e: any) {
    if (e instanceof Error && "status" in e) throw e;
    if (e.code === "ERR_JWT_EXPIRED")
      fail(
        "ACCESS_EXPIRED",
        401,
        "Votre session Cloudflare a expiré. Déconnectez-vous puis reconnectez-vous.",
      );
    if (e.code === "ERR_JWT_CLAIM_VALIDATION_FAILED" && e.claim === "aud")
      fail(
        "ACCESS_AUDIENCE",
        401,
        `Cloudflare utilise une autre application pour cette URL. Vérifiez ${scope === "shop" ? "CF_ACCESS_SHOP_AUD" : "CF_ACCESS_TOURNAMENT_AUD"} et les chemins /admin-${scope === "shop" ? "boutique" : "tournois"} et /admin-${scope === "shop" ? "boutique" : "tournois"}/*. L’application du site ne doit pas les recouvrir.`,
      );
    if (e.code === "ERR_JWT_CLAIM_VALIDATION_FAILED" && e.claim === "iss")
      fail(
        "ACCESS_ISSUER",
        401,
        "Le domaine d’équipe Cloudflare ne correspond pas à CF_ACCESS_ISSUER. Vérifiez la configuration du Worker.",
      );
    if (
      [
        "ERR_JWKS_TIMEOUT",
        "ERR_JWKS_INVALID",
        "ERR_JWKS_NO_MATCHING_KEY",
      ].includes(e.code)
    )
      fail(
        "ACCESS_KEYS",
        503,
        "Impossible de vérifier les clés Cloudflare. Vérifiez le domaine d’équipe et réessayez.",
      );
    return fail(
      "ACCESS_INVALID",
      401,
      "Le jeton Cloudflare ne peut pas être vérifié. Déconnectez-vous puis reconnectez-vous ; si le problème persiste, vérifiez l’AUD de cette application et le domaine d’équipe.",
    );
  }
}
async function authorizedAddress(
  env: ShopEnv,
  scope: "shop" | "tournament",
  address: string,
) {
  let row;
  try {
    row = await env.ORDERS.prepare(
      `SELECT email FROM ${scope === "shop" ? "shop_admins" : "tournament_admins"} WHERE email=? COLLATE NOCASE AND active=1 LIMIT 1`,
    )
      .bind(address)
      .first();
  } catch {
    fail(
      "ACCESS_DATABASE",
      503,
      "La table des responsables est indisponible. Vérifiez le binding D1 et appliquez ses migrations.",
    );
  }
  if (!row)
    fail(
      "FORBIDDEN",
      403,
      `Cette adresse n’est pas responsable ${scope === "shop" ? "de la boutique" : "des tournois"}. Le premier accès doit être ajouté dans la base dédiée, puis les suivants dans la page Responsables.`,
    );
  return text(address, 254, true);
}
export function response(data: unknown, status = 200) {
  return Response.json(data, { status, headers: secureHeaders() });
}
export function secureHeaders() {
  return {
    "cache-control": "no-store, private",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-robots-tag": "noindex, nofollow",
    "content-security-policy":
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  };
}

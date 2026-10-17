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
export function accessConfiguration(env: ShopEnv) {
  const issuer = (env.CF_ACCESS_ISSUER || "").trim().replace(/\/+$/, "");
  const audiences = (env.CF_ACCESS_SHOP_AUD || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const missing: string[] = [];
  if (!issuer) missing.push("CF_ACCESS_ISSUER");
  else if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer))
    missing.push("CF_ACCESS_ISSUER (domaine d’équipe invalide)");
  if (!audiences.length) missing.push("CF_ACCESS_SHOP_AUD");
  if (missing.length)
    fail(
      "ACCESS_CONFIG",
      503,
      `Configuration Cloudflare Access manquante ou invalide : ${missing.join(", ")}. Renseignez ces variables sur le Worker de cet environnement, puis redéployez. L’AUD est celui de l’application boutique, pas l’identifiant de sa règle e-mail/PIN.`,
    );
  return { issuer, audiences };
}

export async function staff(request: Request, env: ShopEnv) {
  const url = new URL(request.url);
  if (
    env.APP_ENV === "local" &&
    ["localhost", "127.0.0.1"].includes(url.hostname) &&
    env.DEV_ADMIN_TOKEN &&
    request.headers.get("x-admin-token") === env.DEV_ADMIN_TOKEN
  )
    return "local-admin";
  const { issuer, audiences } = accessConfiguration(env);
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
    const row = await env.ORDERS.prepare(
      "SELECT email FROM shop_admins WHERE email=? COLLATE NOCASE AND active=1 LIMIT 1",
    )
      .bind(address)
      .first();
    if (!row)
      fail(
        "FORBIDDEN",
        403,
        "Cette adresse ne dispose pas des droits de gestion du club.",
      );
    return text(address, 254, true);
  } catch (e: any) {
    if (e.code === "FORBIDDEN") throw e;
    return fail(
      "ACCESS_INVALID",
      401,
      "La session Cloudflare a expiré ou est invalide. Reconnectez-vous.",
    );
  }
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

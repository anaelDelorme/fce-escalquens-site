import { fail, now, sha256, type Row } from "./domain";
import type { ShopEnv } from "./service";
const inflight = new Map<string, Promise<string>>();
async function key(env: ShopEnv) {
  if ((env.TRACKING_SECRET || "").length < 32)
    fail(
      "HELLOASSO_CONFIG",
      503,
      "La clé de sécurité du paiement doit être configurée.",
    );
  const source = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.TRACKING_SECRET),
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode("fce-helloasso-v1"),
      info: new TextEncoder().encode(env.APP_ENV || "sandbox"),
    },
    source,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
export async function encryptTokens(env: ShopEnv, value: Row) {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    await key(env),
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return (
    btoa(String.fromCharCode(...nonce)) +
    "." +
    btoa(String.fromCharCode(...new Uint8Array(encrypted)))
  );
}
async function decrypt(env: ShopEnv, value: string) {
  try {
    const [iv, data] = value.split(".");
    const bytes = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: Uint8Array.from(atob(iv), (x) => x.charCodeAt(0)),
      },
      await key(env),
      Uint8Array.from(atob(data), (x) => x.charCodeAt(0)),
    );
    return JSON.parse(new TextDecoder().decode(bytes)) as Row;
  } catch {
    return null;
  }
}
export async function tokenKey(env: ShopEnv, base: string) {
  return sha256(
    `${base}:${env.HELLOASSO_CLIENT_ID}:${env.HELLOASSO_CLIENT_SECRET}`,
  );
}
export async function accessToken(env: ShopEnv, base: string, force = false) {
  if (!env.HELLOASSO_CLIENT_ID || !env.HELLOASSO_CLIENT_SECRET)
    fail(
      "HELLOASSO_CONFIG",
      503,
      "Le club doit terminer la configuration HelloAsso.",
    );
  const cache = await tokenKey(env, base);
  if (inflight.has(cache)) return inflight.get(cache)!;
  const task = (async () => {
    await env.ORDERS.prepare(
      "INSERT OR IGNORE INTO helloasso_tokens(cache_key) VALUES(?)",
    )
      .bind(cache)
      .run();
    const existing = await env.ORDERS.prepare(
      "SELECT * FROM helloasso_tokens WHERE cache_key=?",
    )
      .bind(cache)
      .first<Row>();
    let tokens = existing?.encrypted
      ? await decrypt(env, existing.encrypted)
      : null;
    if (!force && tokens?.access_token && existing!.expires_at > now() + 60)
      return tokens.access_token as string;
    const lock = crypto.randomUUID();
    const claimed = await env.ORDERS.prepare(
      "UPDATE helloasso_tokens SET lock_id=?,locked_until=? WHERE cache_key=? AND locked_until<=? RETURNING cache_key",
    )
      .bind(lock, now() + 45, cache, now())
      .first();
    if (!claimed)
      fail(
        "HELLOASSO_AUTH",
        503,
        "La connexion au paiement est en cours de renouvellement. Réessayez dans quelques instants.",
      );
    try {
      const latest = await env.ORDERS.prepare(
        "SELECT encrypted,expires_at FROM helloasso_tokens WHERE cache_key=?",
      )
        .bind(cache)
        .first<Row>();
      tokens = latest?.encrypted ? await decrypt(env, latest.encrypted) : null;
      if (!force && tokens?.access_token && latest!.expires_at > now() + 60)
        return tokens.access_token as string;
      const grant = async (refresh?: string) =>
        fetch(`${base}/oauth2/token`, {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(12000),
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: refresh
            ? new URLSearchParams({
                grant_type: "refresh_token",
                refresh_token: refresh,
              })
            : new URLSearchParams({
                grant_type: "client_credentials",
                client_id: env.HELLOASSO_CLIENT_ID!,
                client_secret: env.HELLOASSO_CLIENT_SECRET!,
              }),
        });
      const hasRefresh =
        tokens?.refresh_token && tokens.refresh_expires > now();
      let response = await grant(
        hasRefresh ? tokens!.refresh_token : undefined,
      );
      // Explicit invalid/expired refresh token requires a new connection; never replay a checkout POST.
      if (hasRefresh && response.status === 400) response = await grant();
      if (!response.ok)
        fail(
          "HELLOASSO_AUTH",
          503,
          "La connexion HelloAsso est indisponible. Le club doit vérifier ses identifiants et son environnement.",
        );
      tokens = (await response.json()) as Row;
      if (typeof tokens.access_token !== "string")
        fail(
          "HELLOASSO_AUTH",
          502,
          "Réponse d’authentification HelloAsso incomplète.",
        );
      tokens.refresh_expires = now() + 29 * 86400;
      const expires = now() + Math.min(1800, Number(tokens.expires_in) || 1800);
      await env.ORDERS.prepare(
        "UPDATE helloasso_tokens SET encrypted=?,expires_at=? WHERE cache_key=? AND lock_id=?",
      )
        .bind(await encryptTokens(env, tokens), expires, cache, lock)
        .run();
      return tokens.access_token as string;
    } catch (error) {
      if ((error as any)?.code) throw error;
      return fail(
        "HELLOASSO_AUTH",
        503,
        "La connexion HelloAsso n’a pas répondu. Réessayez dans quelques instants.",
      );
    } finally {
      await env.ORDERS.prepare(
        "UPDATE helloasso_tokens SET locked_until=0,lock_id='' WHERE cache_key=? AND lock_id=?",
      )
        .bind(cache, lock)
        .run();
    }
  })();
  inflight.set(cache, task);
  try {
    return await task;
  } finally {
    inflight.delete(cache);
  }
}

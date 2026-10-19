import { body, response } from "../shop/security";
import { fail, integer, text, type Row } from "../shop/domain";
import type { ShopEnv } from "../shop/service";
export async function events(
  request: Request,
  env: ShopEnv,
  path: string,
): Promise<Response | null> {
  if (path === "/admin-tournois/api/events" && request.method === "GET")
    return response({
      events: (
        await env.DB.prepare(
          "SELECT * FROM tournaments ORDER BY starts_on DESC,id DESC",
        ).all()
      ).results,
    });
  const match = path.match(/^\/admin-tournois\/api\/events(?:\/([0-9]+))?$/);
  if (!match || !["POST", "PUT"].includes(request.method)) return null;
  const d = await body(request),
    id = match[1] ? integer(Number(match[1]), 1, 2147483647) : null;
  if ((request.method === "PUT") !== Boolean(id))
    fail("METHOD", 405, "Méthode invalide.");
  const name = text(d.name, 160, true),
    slug = text(
      d.slug ||
        name
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, ""),
      200,
      true,
    ),
    status = text(d.status, 20, true);
  if (
    !/^[a-z0-9-]+$/.test(slug) ||
    !["draft", "published", "open", "finished"].includes(status)
  )
    fail("EVENT", 400, "Identifiant ou statut du tournoi invalide.");
  const start = text(d.starts_on, 10, true),
    end = text(d.ends_on || "", 10);
  for (const date of [start, end].filter(Boolean))
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date + "T12:00:00Z")) ||
      new Date(date + "T12:00:00Z").toISOString().slice(0, 10) !== date
    )
      fail("DATE", 400, "Vérifiez les dates.");
  if (end && end < start) fail("DATE", 400, "La fin doit être après le début.");
  if (!Array.isArray(d.categories) || d.categories.length > 20)
    fail("EVENT", 400, "Vérifiez les catégories.");
  const categories = JSON.stringify(
    d.categories.map((c: unknown) => text(c, 80, true)),
  );
  const media = (name: string) => {
    const v = text(d[name] || "", 500);
    if (v && (!/^[a-zA-Z0-9_./-]+$/.test(v) || v.includes("..")))
      fail("MEDIA", 400, "Clé média invalide.");
    return v;
  };
  const url = text(d.tournify_url || "", 500);
  if (url) {
    let u;
    try {
      u = new URL(url);
    } catch {}
    if (!u || u.protocol !== "https:" || u.username || u.password)
      fail("URL", 400, "Le lien Tournify doit être en HTTPS.");
  }
  const values = [
    name,
    slug,
    text(d.summary || "", 12000),
    start,
    end || null,
    text(d.venue || "", 300),
    text(d.organizer || "", 160),
    categories,
    media("image_key"),
    media("poster_key"),
    media("rules_key"),
    url,
    status,
  ];
  const duplicate = await env.DB.prepare(
    "SELECT id FROM tournaments WHERE slug=? AND id<>?",
  )
    .bind(slug, id || 0)
    .first();
  if (duplicate) fail("SLUG", 409, "Ce nom de lien est déjà utilisé.");
  const row = id
    ? await env.DB.prepare(
        "UPDATE tournaments SET name=?,slug=?,summary=?,starts_on=?,ends_on=?,venue=?,organizer=?,categories=?,image_key=?,poster_key=?,rules_key=?,tournify_url=?,status=?,registration_url=NULL,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND version=? RETURNING id,version",
      )
        .bind(...values, id, integer(d.version, 1, 2147483647))
        .first<Row>()
    : await env.DB.prepare(
        "INSERT INTO tournaments(name,slug,summary,starts_on,ends_on,venue,organizer,categories,image_key,poster_key,rules_key,tournify_url,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id,version",
      )
        .bind(...values)
        .first<Row>();
  if (!row) fail("VERSION", 409, "Ce tournoi a changé. Rechargez la page.");
  return response({ ok: true, ...row });
}

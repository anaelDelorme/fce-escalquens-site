interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  ASSETS: Fetcher;
  DEV_ADMIN_TOKEN?: string;
  TEST_SITE_PASSWORD?: string;
  TEST_SITE_USER?: string;
  FCE_SYNC_TOKEN?: string;
  INSTAGRAM_ACCESS_TOKEN?: string;
  INSTAGRAM_USER_ID?: string;
  INSTAGRAM_GRAPH_BASE?: string;
}

type AnyRow = Record<string, any>;

const tables = new Set([
  "teams", "team_competitions", "training_sessions", "contacts", "tournaments",
  "tournament_teams", "matches", "match_participants", "standings", "social_posts",
  "documents", "club_members", "team_staff", "admins", "venues",
  "competition_levels", "seasons", "sponsors"
]);

const editable: Record<string, string[]> = {
  teams: ["slug", "name", "category", "group_name", "level", "level_id", "gender", "fff_id", "photo_key", "description", "display_order", "active", "player_count"],
  team_competitions: ["team_id", "season_id", "name", "team_number", "fff_team_id", "category_code", "competition_name", "division", "pool", "level_id", "active", "display_order", "discovered_automatically", "last_seen_at"],
  training_sessions: ["team_id", "season_id", "category", "weekday", "starts_at", "ends_at", "venue", "venue_id", "address", "notes", "active"],
  contacts: ["name", "role", "category", "email", "phone", "published", "display_order", "responsibilities", "availability", "photo_key"],
  tournaments: ["slug", "name", "summary", "starts_on", "ends_on", "venue", "venue_id", "organizer", "categories", "registration_url", "tournify_url", "rules_key", "status", "season_id"],
  tournament_teams: ["tournament_id", "team_id", "notes"],
  matches: ["source", "source_id", "team_id", "competition_team_id", "season_id", "category", "competition", "starts_at", "venue", "venue_address", "latitude", "longitude", "home_team", "away_team", "home_score", "away_score", "status", "event_type", "source_url", "external_updated_at", "home_logo_url", "away_logo_url", "time_confirmed", "manually_created", "raw_json"],
  standings: ["source", "phase_id", "season_id", "team_id", "team_name", "position", "played", "won", "drawn", "lost", "goals_for", "goals_against", "points", "raw_json"],
  social_posts: ["platform", "source_id", "permalink", "caption", "media_type", "media_url", "thumbnail_url", "published_at"],
  documents: ["slug", "title", "kind", "object_key", "published"],
  club_members: ["full_name", "email", "phone", "license_number", "photo_key", "notes", "active"],
  team_staff: ["team_id", "member_id", "role", "display_order", "active"],
  admins: ["email", "name", "active"],
  venues: ["name", "address", "latitude", "longitude", "maps_url", "notes", "active", "display_order"],
  competition_levels: ["name", "short_name", "description", "active", "display_order"],
  seasons: ["label", "starts_on", "ends_on", "active"],
  sponsors: ["name", "logo_key", "website_url", "tier", "description", "active", "display_order"]
};

const defaultOrder: Record<string, string> = {
  matches: "starts_at ASC",
  match_participants: "match_id ASC, display_order ASC",
  social_posts: "published_at DESC",
  sponsors: "display_order ASC, name ASC",
  team_competitions: "display_order ASC, name ASC",
  tournaments: "starts_on ASC",
  training_sessions: "weekday ASC, starts_at ASC"
};

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}

function databaseError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("FOREIGN KEY")) return "Une valeur liée est invalide. Rechargez la page puis recommencez l’affectation.";
  if (message.includes("UNIQUE")) return "Cet enregistrement existe déjà.";
  return "Enregistrement impossible dans la base de données.";
}

function secureToken(value: string, expected: string) {
  if (value.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < value.length; index++) {
    difference |= value.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

async function admin(request: Request, env: Env) {
  const email = request.headers.get("cf-access-authenticated-user-email");
  if (email) {
    const row = await env.DB.prepare("SELECT email FROM admins WHERE email=? COLLATE NOCASE AND active=1 LIMIT 1")
      .bind(email).first<{ email: string }>();
    if (row) return row.email;
  }
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  return env.DEV_ADMIN_TOKEN && secureToken(token, env.DEV_ADMIN_TOKEN) ? "local-admin" : null;
}

function testGate(request: Request, env: Env) {
  if (!env.TEST_SITE_PASSWORD) return null;
  const authorization = request.headers.get("authorization") || "";
  let credentials = "";
  if (authorization.startsWith("Basic ")) {
    try { credentials = atob(authorization.slice(6)); } catch {}
  }
  const expected = `${env.TEST_SITE_USER || "fce"}:${env.TEST_SITE_PASSWORD}`;
  return credentials === expected ? null : new Response(
    "Site de test FC Escalquens — authentification requise",
    { status: 401, headers: { "www-authenticate": 'Basic realm="FC Escalquens — site de test", charset="UTF-8"', "cache-control": "no-store" } }
  );
}

async function api(request: Request, env: Env, url: URL) {
  const parts = url.pathname.split("/").filter(Boolean);
  const table = parts[1];
  const id = parts[2];
  if (!tables.has(table)) return json({ error: "Ressource inconnue" }, 404);
  if (url.pathname.startsWith("/admin-api/") && !await admin(request, env)) {
    return json({ error: "Accès administrateur requis" }, 401);
  }
  if (table === "admins" && request.method === "GET" && !await admin(request, env)) {
    return json({ error: "Accès administrateur requis" }, 401);
  }
  if (request.method === "GET") {
    const order = defaultOrder[table] || "id ASC";
    const rows = await env.DB.prepare(`SELECT * FROM ${table} ORDER BY ${order} LIMIT 1000`).all();
    return json(rows.results);
  }
  if (!await admin(request, env)) {
    return json({ error: "Adresse non autorisée. Vérifiez Cloudflare Access et la liste des administrateurs." }, 401);
  }
  if (request.method === "DELETE" && id) {
    await env.DB.prepare(`DELETE FROM ${table} WHERE id=?`).bind(id).run();
    return json({ ok: true });
  }
  const body = await request.json<Record<string, unknown>>().catch(() => ({}));
  const allowed = editable[table] || [];
  const values = Object.entries(body).filter(([key]) => allowed.includes(key));
  if (!values.length) return json({ error: "Aucun champ valide" }, 400);
  if (table === "seasons" && Number(body.active) === 1) {
    await env.DB.prepare("UPDATE seasons SET active=0").run();
  }
  const bound = values.map(([, value]) => value !== null && typeof value === "object" ? JSON.stringify(value) : value);
  if (request.method === "POST") {
    const columns = values.map(([key]) => key);
    try {
      const result = await env.DB.prepare(
        `INSERT INTO ${table} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`
      ).bind(...bound).run();
      return json({ id: result.meta.last_row_id }, 201);
    } catch (error) { return json({ error: databaseError(error) }, 409); }
  }
  if (request.method === "PUT" && id) {
    const timestamp = table === "match_participants" ? "" : ", updated_at=CURRENT_TIMESTAMP";
    try {
      await env.DB.prepare(
        `UPDATE ${table} SET ${values.map(([key]) => `${key}=?`).join(",")}${timestamp} WHERE id=?`
      ).bind(...bound, id).run();
      if (table === "team_competitions" && body.team_id !== undefined) {
        await env.DB.prepare("UPDATE matches SET team_id=?,updated_at=CURRENT_TIMESTAMP WHERE competition_team_id=?")
          .bind(body.team_id || null, id).run();
      }
      return json({ ok: true });
    } catch (error) { return json({ error: databaseError(error) }, 409); }
  }
  return json({ error: "Méthode non autorisée" }, 405);
}

async function upload(request: Request, env: Env) {
  if (!await admin(request, env)) return json({ error: "Non autorisé" }, 401);
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return json({ error: "Fichier manquant" }, 400);
  if (file.size > 15_000_000) return json({ error: "Fichier trop volumineux (15 Mo maximum)" }, 413);
  const safe = file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g, "-");
  const key = `uploads/${Date.now()}-${safe}`;
  await env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
  return json({ key, url: `/media/${key}` }, 201);
}

async function activeSeasonId(env: Env) {
  return (await env.DB.prepare("SELECT id FROM seasons WHERE active=1 LIMIT 1").first<{ id: number }>())?.id ?? null;
}

async function upsertMatch(env: Env, row: AnyRow) {
  const values = [
    row.source, row.source_id, row.team_id ?? null, row.competition_team_id ?? null,
    row.season_id ?? null, row.category || "", row.competition || "", row.starts_at,
    row.venue || "", row.venue_address || "", row.latitude ?? null, row.longitude ?? null,
    row.home_team, row.away_team, row.home_score ?? null, row.away_score ?? null,
    row.status || "scheduled", row.event_type || "match", row.source_url || "",
    row.external_updated_at ?? null, row.home_logo_url || "", row.away_logo_url || "",
    row.time_confirmed === false ? 0 : 1, row.manually_created ? 1 : 0,
    JSON.stringify(row.raw_json || {})
  ];
  const result = await env.DB.prepare(`INSERT INTO matches(
      source,source_id,team_id,competition_team_id,season_id,category,competition,starts_at,
      venue,venue_address,latitude,longitude,home_team,away_team,home_score,away_score,status,
      event_type,source_url,external_updated_at,home_logo_url,away_logo_url,time_confirmed,
      manually_created,raw_json
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(source,source_id) DO UPDATE SET
      team_id=excluded.team_id,competition_team_id=excluded.competition_team_id,
      season_id=excluded.season_id,category=excluded.category,competition=excluded.competition,
      starts_at=excluded.starts_at,venue=excluded.venue,venue_address=excluded.venue_address,
      latitude=excluded.latitude,longitude=excluded.longitude,home_team=excluded.home_team,
      away_team=excluded.away_team,home_score=excluded.home_score,away_score=excluded.away_score,
      status=excluded.status,event_type=excluded.event_type,source_url=excluded.source_url,
      external_updated_at=excluded.external_updated_at,home_logo_url=excluded.home_logo_url,
      away_logo_url=excluded.away_logo_url,time_confirmed=excluded.time_confirmed,
      raw_json=excluded.raw_json,synced_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
    WHERE matches.starts_at IS NOT excluded.starts_at
      OR matches.team_id IS NOT excluded.team_id
      OR matches.competition_team_id IS NOT excluded.competition_team_id
      OR matches.venue IS NOT excluded.venue OR matches.venue_address IS NOT excluded.venue_address
      OR matches.latitude IS NOT excluded.latitude OR matches.longitude IS NOT excluded.longitude
      OR matches.home_team IS NOT excluded.home_team OR matches.away_team IS NOT excluded.away_team
      OR matches.home_score IS NOT excluded.home_score OR matches.away_score IS NOT excluded.away_score
      OR matches.status IS NOT excluded.status OR matches.raw_json IS NOT excluded.raw_json`
  ).bind(...values).run();
  const stored = await env.DB.prepare("SELECT id FROM matches WHERE source=? AND source_id=?")
    .bind(row.source, row.source_id).first<{ id: number }>();
  if (stored && Array.isArray(row.participants)) {
    await env.DB.prepare("DELETE FROM match_participants WHERE match_id=?").bind(stored.id).run();
    for (const [index, participant] of row.participants.entries()) {
      if (!participant?.name) continue;
      await env.DB.prepare(`INSERT INTO match_participants(
        match_id,name,club_number,team_number,logo_url,is_club,display_order
      ) VALUES(?,?,?,?,?,?,?)`).bind(
        stored.id, participant.name, participant.club_number || "",
        participant.team_number || "", participant.logo_url || "",
        participant.is_club ? 1 : 0, index
      ).run();
    }
  }
  return Number(result.meta.changes || 0);
}

async function ingestMatches(request: Request, env: Env) {
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!env.FCE_SYNC_TOKEN || !secureToken(supplied, env.FCE_SYNC_TOKEN)) {
    return json({ error: "Jeton de synchronisation invalide" }, 401);
  }
  const body = await request.json<{ rows?: AnyRow[]; sources?: AnyRow[] }>().catch(() => null);
  const rows = body?.rows;
  if (!Array.isArray(rows) || rows.length > 1000) return json({ error: "Lot de rencontres invalide" }, 400);
  const [seasonId, teams, unassigned] = await Promise.all([
    activeSeasonId(env),
    env.DB.prepare("SELECT id,name,category FROM teams WHERE active=1").all<AnyRow>(),
    env.DB.prepare("SELECT id FROM teams WHERE slug='fff-equipes-a-affecter' LIMIT 1").first<{ id: number }>()
  ]);
  if (!seasonId || !unassigned?.id) return json({ error: "Saison active ou groupe technique FFF manquant : appliquez les migrations D1." }, 409);
  const loadedEntries = await env.DB.prepare("SELECT id,team_id,fff_team_id,category_code FROM team_competitions WHERE active=1 AND season_id=?")
    .bind(seasonId).all<AnyRow>();
  const entries = new Map((loadedEntries.results || []).map(entry => [String(entry.fff_team_id || ""), entry]));
  let changed = 0;
  let accepted = 0;
  let discovered = 0;
  for (const row of rows) {
    if (!["fff", "district_fal"].includes(row.source) || !row.source_id || !row.starts_at || !row.home_team || !row.away_team) continue;
    const fffTeamId = String(row.team_fff_id || "");
    const official = row.official_team || {};
    let entry = fffTeamId ? entries.get(fffTeamId) : null;
    if (fffTeamId && !entry) {
      const inserted = await env.DB.prepare(`INSERT INTO team_competitions(
        team_id,season_id,name,team_number,fff_team_id,category_code,
        competition_name,division,pool,active,display_order,
        discovered_automatically,last_seen_at
      ) VALUES(?,?,?,?,?,?,?,?,?,1,0,1,CURRENT_TIMESTAMP)`).bind(
        unassigned.id, seasonId,
        official.name || [row.category, official.team_number].filter(Boolean).join(" ") || fffTeamId,
        official.team_number || "", fffTeamId,
        official.category_code || row.category || "",
        official.competition_name || row.competition || "",
        official.division || "", official.pool || ""
      ).run();
      entry = { id: Number(inserted.meta.last_row_id), team_id: unassigned.id, fff_team_id: fffTeamId };
      entries.set(fffTeamId, entry);
      discovered++;
    } else if (entry) {
      await env.DB.prepare(`UPDATE team_competitions SET
        name=?,team_number=?,category_code=?,competition_name=?,division=?,pool=?,
        last_seen_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
        WHERE id=?`).bind(
        official.name || [row.category, official.team_number].filter(Boolean).join(" ") || fffTeamId,
        official.team_number || "", official.category_code || row.category || "",
        official.competition_name || row.competition || "",
        official.division || "", official.pool || "", entry.id
      ).run();
    }
    // Aucune déduction par le libellé U15/U15F : seul l'identifiant FFF exact
    // et l'affectation validée dans l'admin déterminent le groupe sportif.
    const team = entry ? (teams.results || []).find(candidate => candidate.id === entry.team_id) : null;
    changed += await upsertMatch(env, {
      ...row,
      team_id: team?.id ?? null,
      competition_team_id: entry?.id ?? null,
      season_id: seasonId,
      raw_json: row.raw_json || row
    });
    accepted++;
  }
  await env.DB.prepare(`INSERT INTO sync_runs(
    source,finished_at,status,imported_count,error_message
  ) VALUES('github_actions',CURRENT_TIMESTAMP,'success',?,?)`).bind(
    changed, JSON.stringify(body?.sources || [])
  ).run();
  return json({ ok: true, received: rows.length, accepted, changed, discovered });
}

async function syncInstagram(env: Env) {
  if (!env.INSTAGRAM_ACCESS_TOKEN || !env.INSTAGRAM_USER_ID) {
    throw new Error("Instagram n’est pas encore configuré");
  }
  const base = env.INSTAGRAM_GRAPH_BASE || "https://graph.instagram.com";
  const url = new URL(`${base}/${env.INSTAGRAM_USER_ID}/media`);
  url.searchParams.set("fields", "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp");
  url.searchParams.set("limit", "12");
  url.searchParams.set("access_token", env.INSTAGRAM_ACCESS_TOKEN);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Instagram HTTP ${response.status}`);
  const payload = await response.json<{ data?: AnyRow[] }>();
  let count = 0;
  for (const post of payload.data || []) {
    await env.DB.prepare(`INSERT INTO social_posts(
      platform,source_id,permalink,caption,media_type,media_url,thumbnail_url,published_at
    ) VALUES('instagram',?,?,?,?,?,?,?)
    ON CONFLICT(platform,source_id) DO UPDATE SET
      permalink=excluded.permalink,caption=excluded.caption,media_type=excluded.media_type,
      media_url=excluded.media_url,thumbnail_url=excluded.thumbnail_url,
      published_at=excluded.published_at,synced_at=CURRENT_TIMESTAMP`).bind(
      post.id, post.permalink || "", post.caption || "", post.media_type || "IMAGE",
      post.media_url || "", post.thumbnail_url || "", post.timestamp || new Date().toISOString()
    ).run();
    count++;
  }
  return count;
}

async function syncMeta(env: Env) {
  const row = await env.DB.prepare(`SELECT finished_at,imported_count
    FROM sync_runs WHERE source='github_actions' AND status='success'
    ORDER BY id DESC LIMIT 1`).first();
  return json(row || { finished_at: null, imported_count: 0 });
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (url.pathname === "/internal/sync/matches" && request.method === "POST") {
      return ingestMatches(request, env);
    }
    if (url.pathname === "/internal/sync/instagram" && request.method === "POST") {
      const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
      if (!env.FCE_SYNC_TOKEN || !secureToken(supplied, env.FCE_SYNC_TOKEN)) {
        return json({ error: "Jeton de synchronisation invalide" }, 401);
      }
      try { return json({ ok: true, imported: await syncInstagram(env) }); }
      catch (error) { return json({ error: error instanceof Error ? error.message : String(error) }, 503); }
    }
    const gate = testGate(request, env);
    if (gate) return gate;
    if (url.pathname === "/api/match-sync" && request.method === "GET") return syncMeta(env);
    if (url.pathname === "/admin-api/upload" && request.method === "POST") return upload(request, env);
    if (url.pathname === "/admin-api/sync/matches" && request.method === "POST") {
      return json({ error: "Lancez l’action « Synchroniser les matchs » dans GitHub. Elle utilise ZenRows uniquement aux six horaires prévus." }, 409);
    }
    if (url.pathname === "/admin-api/sync/instagram" && request.method === "POST") {
      if (!await admin(request, env)) return json({ error: "Accès administrateur requis" }, 401);
      try { return json({ ok: true, imported: await syncInstagram(env) }); }
      catch (error) { return json({ error: error instanceof Error ? error.message : String(error) }, 503); }
    }
    if (url.pathname.startsWith("/admin-api/") || url.pathname.startsWith("/api/")) {
      return api(request, env, url);
    }
    if (url.pathname.startsWith("/media/")) {
      const object = await env.MEDIA.get(url.pathname.slice(7));
      return object
        ? new Response(object.body, { headers: { "content-type": object.httpMetadata?.contentType || "application/octet-stream", "cache-control": "public,max-age=86400" } })
        : new Response("Not found", { status: 404 });
    }
    return env.ASSETS.fetch(request);
  }
} satisfies ExportedHandler<Env>;

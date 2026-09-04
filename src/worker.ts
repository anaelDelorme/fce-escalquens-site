interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  ASSETS: Fetcher;
  DEV_ADMIN_TOKEN?: string;
  TEST_SITE_PASSWORD?: string;
  TEST_SITE_USER?: string;
  FCE_SYNC_TOKEN?: string;
}

type AnyRow = Record<string, any>;

const tables = new Set([
  "teams", "team_competitions", "training_sessions", "contacts", "tournaments",
  "tournament_teams", "matches", "match_participants", "standings", "social_posts",
  "documents", "club_members", "team_staff", "admins", "venues",
  "competition_levels", "seasons", "sponsors", "site_media"
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
  sponsors: ["name", "logo_key", "website_url", "tier", "description", "active", "display_order"],
  site_media: ["object_key", "alt_text"]
};

const defaultOrder: Record<string, string> = {
  teams: "name COLLATE NOCASE ASC",
  matches: "starts_at ASC",
  match_participants: "match_id ASC, display_order ASC",
  social_posts: "published_at DESC",
  sponsors: "display_order ASC, name ASC",
  team_competitions: "display_order ASC, name ASC",
  tournaments: "starts_on ASC",
  training_sessions: "weekday ASC, starts_at ASC",
  site_media: "display_order ASC, id ASC"
};

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}

function publicJson(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "cache-control": "public,max-age=0,s-maxage=120,stale-while-revalidate=300",
      "content-type": "application/json;charset=UTF-8"
    }
  });
}

function databaseError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("FOREIGN KEY")) return "Une valeur liée est invalide. Rechargez la page puis recommencez l’affectation.";
  if (message.includes("UNIQUE")) return "Cet enregistrement existe déjà.";
  if (message.includes("NOT NULL")) return "Un champ obligatoire n’est pas renseigné.";
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

const resultRows = (result: D1Result<AnyRow>) => result.results || [];

async function pageData(env: Env, url: URL) {
  const page = url.pathname.slice("/api/page/".length);
  const activeSeason = "(SELECT id FROM seasons WHERE active=1 LIMIT 1)";
  const now = new Date().toISOString();

  if (page === "teams") {
    const rows = await env.DB.prepare(`SELECT
      t.id,t.slug,t.name,t.category,t.group_name,t.level,t.gender,t.player_count,t.photo_key,
      CASE
        WHEN TRIM(COALESCE(t.photo_key,''))<>'' THEN '/media/' || t.photo_key
        WHEN TRIM(COALESCE(sm.object_key,''))<>'' THEN '/media/' || sm.object_key
        ELSE COALESCE(NULLIF(sm.fallback_path,''),'/team-default.webp')
      END AS photo_url,
      CASE WHEN TRIM(COALESCE(t.photo_key,''))<>'' THEN 'Photo du groupe ' || t.name
        ELSE COALESCE(NULLIF(sm.alt_text,''),'Visuel par défaut du FC Escalquens') END AS photo_alt
      FROM teams t LEFT JOIN site_media sm ON sm.slot='team_default'
      WHERE t.active=1 ORDER BY t.name COLLATE NOCASE ASC`).all<AnyRow>();
    return publicJson({ teams: resultRows(rows) });
  }

  if (page === "team-profile") {
    const slug = String(url.searchParams.get("slug") || "").trim();
    if (!slug) return publicJson({ error: "Équipe manquante" }, 400);
    const team = await env.DB.prepare(`SELECT t.*,
      CASE
        WHEN TRIM(COALESCE(t.photo_key,''))<>'' THEN '/media/' || t.photo_key
        WHEN TRIM(COALESCE(sm.object_key,''))<>'' THEN '/media/' || sm.object_key
        ELSE COALESCE(NULLIF(sm.fallback_path,''),'/team-default.webp')
      END AS photo_url,
      CASE WHEN TRIM(COALESCE(t.photo_key,''))<>'' THEN 'Photo du groupe ' || t.name
        ELSE COALESCE(NULLIF(sm.alt_text,''),'Photo du groupe') END AS photo_alt
      FROM teams t LEFT JOIN site_media sm ON sm.slot='team_default'
      WHERE t.slug=? AND t.active=1 LIMIT 1`).bind(slug).first<AnyRow>();
    if (!team) return publicJson({ error: "Équipe introuvable" }, 404);
    const [entries, staff, sessions, upcoming, results] = await env.DB.batch<AnyRow>([
      env.DB.prepare(`SELECT id,name,division,competition_name,pool FROM team_competitions
        WHERE team_id=? AND active=1 AND (season_id IS NULL OR season_id=${activeSeason})
        ORDER BY display_order,name`).bind(team.id),
      env.DB.prepare(`SELECT ts.role,ts.display_order,
        cm.id AS member_id,cm.full_name,cm.email,cm.phone,cm.photo_key
        FROM team_staff ts JOIN club_members cm ON cm.id=ts.member_id
        WHERE ts.team_id=? AND ts.active=1 AND cm.active=1
        ORDER BY ts.display_order,cm.full_name COLLATE NOCASE`).bind(team.id),
      env.DB.prepare(`SELECT s.id,s.weekday,s.starts_at,s.ends_at,s.venue,s.address,s.notes,
        v.name AS venue_name,v.address AS venue_full_address,v.latitude AS venue_latitude,
        v.longitude AS venue_longitude,v.maps_url AS venue_maps_url
        FROM training_sessions s LEFT JOIN venues v ON v.id=s.venue_id
        WHERE s.team_id=? AND s.active=1 AND (s.season_id IS NULL OR s.season_id=${activeSeason})
        ORDER BY s.weekday,s.starts_at`).bind(team.id),
      env.DB.prepare(`SELECT id,starts_at,competition,event_type,time_confirmed,status,venue,venue_address,
        home_team,away_team,home_logo_url,away_logo_url,home_score,away_score
        FROM matches WHERE team_id=? AND (season_id IS NULL OR season_id=${activeSeason})
        AND status<>'finished' AND (home_score IS NULL OR away_score IS NULL) AND starts_at>=?
        ORDER BY starts_at ASC LIMIT 5`).bind(team.id, now),
      env.DB.prepare(`SELECT id,starts_at,competition,event_type,time_confirmed,status,venue,venue_address,
        home_team,away_team,home_logo_url,away_logo_url,home_score,away_score
        FROM matches WHERE team_id=? AND (season_id IS NULL OR season_id=${activeSeason})
        AND (status='finished' OR (home_score IS NOT NULL AND away_score IS NOT NULL))
        ORDER BY starts_at DESC LIMIT 5`).bind(team.id)
    ]);
    return publicJson({
      team,
      entries: resultRows(entries),
      staff: resultRows(staff).map(row => ({
        role: row.role,
        display_order: row.display_order,
        member: { id: row.member_id, full_name: row.full_name, email: row.email, phone: row.phone, photo_key: row.photo_key }
      })),
      sessions: resultRows(sessions),
      upcoming: resultRows(upcoming),
      results: resultRows(results)
    });
  }

  if (page === "home") {
    const [teams, matches, results, sponsors, media] = await env.DB.batch<AnyRow>([
      env.DB.prepare(`SELECT id,slug,name,group_name,level,category FROM teams
        WHERE active=1 ORDER BY name COLLATE NOCASE ASC`),
      env.DB.prepare(`SELECT id,starts_at,category,competition,home_team,away_team,home_score,away_score,status FROM matches
        WHERE (season_id IS NULL OR season_id=${activeSeason}) AND starts_at>=?
        AND status NOT IN ('finished','cancelled') ORDER BY starts_at ASC LIMIT 3`).bind(now),
      env.DB.prepare(`SELECT id,starts_at,category,competition,home_team,away_team,home_score,away_score,status FROM matches
        WHERE (season_id IS NULL OR season_id=${activeSeason})
        AND (status='finished' OR (home_score IS NOT NULL AND away_score IS NOT NULL))
        ORDER BY starts_at DESC LIMIT 3`),
      env.DB.prepare("SELECT name,logo_key,website_url,tier FROM sponsors WHERE active=1 ORDER BY display_order,name COLLATE NOCASE"),
      env.DB.prepare("SELECT slot,object_key,alt_text FROM site_media WHERE slot IN ('home_collective','home_story')")
    ]);
    return publicJson({ teams: resultRows(teams), matches: resultRows(matches), results: resultRows(results), sponsors: resultRows(sponsors), site_media: resultRows(media) });
  }

  if (page === "matches") {
    const [matches, participants, standings, sync, teams, entries] = await env.DB.batch<AnyRow>([
      env.DB.prepare(`SELECT m.*,
        (SELECT COUNT(*) FROM plateau_games pg WHERE pg.plateau_match_id=m.id) AS plateau_game_count
        FROM matches m WHERE m.season_id IS NULL OR m.season_id=${activeSeason} ORDER BY m.starts_at ASC`),
      env.DB.prepare(`SELECT p.* FROM match_participants p JOIN matches m ON m.id=p.match_id
        WHERE m.season_id IS NULL OR m.season_id=${activeSeason} ORDER BY p.match_id,p.display_order`),
      env.DB.prepare(`SELECT * FROM standings WHERE season_id IS NULL OR season_id=${activeSeason} ORDER BY phase_id,position`),
      env.DB.prepare(`SELECT id,finished_at,status,imported_count,error_message,
        (SELECT finished_at FROM sync_runs WHERE source='github_actions' AND status='success'
          ORDER BY id DESC LIMIT 1) AS last_success_at
        FROM sync_runs WHERE source='github_actions' ORDER BY id DESC LIMIT 1`),
      env.DB.prepare("SELECT id,name,group_name,active FROM teams WHERE active=1 ORDER BY name COLLATE NOCASE"),
      env.DB.prepare(`SELECT * FROM team_competitions WHERE active=1 AND (season_id IS NULL OR season_id=${activeSeason}) ORDER BY name COLLATE NOCASE`)
    ]);
    return publicJson({ matches: resultRows(matches), participants: resultRows(participants), standings: resultRows(standings), sync: syncRunData(resultRows(sync)[0] || null), teams: resultRows(teams), entries: resultRows(entries) });
  }

  if (page === "planning") {
    const [teams, sessions, venues] = await env.DB.batch<AnyRow>([
      env.DB.prepare("SELECT id,name,group_name,category FROM teams WHERE active=1 ORDER BY name COLLATE NOCASE"),
      env.DB.prepare(`SELECT * FROM training_sessions WHERE active=1 AND (season_id IS NULL OR season_id=${activeSeason}) ORDER BY weekday,starts_at`),
      env.DB.prepare("SELECT * FROM venues WHERE active=1 ORDER BY display_order,name COLLATE NOCASE")
    ]);
    return publicJson({ teams: resultRows(teams), sessions: resultRows(sessions), venues: resultRows(venues) });
  }

  if (page === "tournaments") {
    const [tournaments, links, teams, venues] = await env.DB.batch<AnyRow>([
      env.DB.prepare(`SELECT * FROM tournaments WHERE status IN ('published','open','finished')
        AND (season_id IS NULL OR season_id=${activeSeason}) ORDER BY starts_on`),
      env.DB.prepare(`SELECT tt.* FROM tournament_teams tt JOIN tournaments t ON t.id=tt.tournament_id
        WHERE t.season_id IS NULL OR t.season_id=${activeSeason} ORDER BY tt.tournament_id`),
      env.DB.prepare("SELECT id,name,group_name FROM teams WHERE active=1 ORDER BY name COLLATE NOCASE"),
      env.DB.prepare("SELECT * FROM venues WHERE active=1 ORDER BY display_order,name COLLATE NOCASE")
    ]);
    return publicJson({ tournaments: resultRows(tournaments), links: resultRows(links), teams: resultRows(teams), venues: resultRows(venues) });
  }

  if (page === "mecenat") {
    const [contacts, sponsors, media] = await env.DB.batch<AnyRow>([
      env.DB.prepare("SELECT name,role,email,phone,display_order FROM contacts WHERE published=1 ORDER BY display_order,name COLLATE NOCASE"),
      env.DB.prepare("SELECT name,logo_key,website_url,tier FROM sponsors WHERE active=1 ORDER BY display_order,name COLLATE NOCASE"),
      env.DB.prepare("SELECT slot,object_key,alt_text FROM site_media WHERE slot IN ('sponsor_hero','sponsor_project')")
    ]);
    return publicJson({ contacts: resultRows(contacts), sponsors: resultRows(sponsors), site_media: resultRows(media) });
  }

  if (page === "contacts") {
    const rows = await env.DB.prepare("SELECT name,role,category,email,phone,responsibilities,availability,display_order FROM contacts WHERE published=1 ORDER BY display_order,name COLLATE NOCASE").all<AnyRow>();
    return publicJson({ contacts: resultRows(rows) });
  }

  return publicJson({ error: "Page de données inconnue" }, 404);
}

async function cachedPageData(request: Request, env: Env, url: URL, ctx: ExecutionContext) {
  const cache = caches.default;
  const key = new Request(url.toString(), { method: "GET" });
  const cached = await cache.match(key);
  if (cached) return cached;
  const response = await pageData(env, url);
  if (response.ok) ctx.waitUntil(cache.put(key, response.clone()));
  return response;
}

async function cachedPlateauGames(request: Request, env: Env, url: URL, ctx: ExecutionContext) {
  const plateauId = Number(url.searchParams.get("plateau_id"));
  if (!Number.isInteger(plateauId) || plateauId <= 0) return publicJson({ error: "Plateau invalide" }, 400);
  const cache = caches.default;
  const key = new Request(url.toString(), { method: "GET" });
  const cached = await cache.match(key);
  if (cached) return cached;
  const rows = await env.DB.prepare(`SELECT source_game_id,display_order,home_team,away_team,
    home_score,away_score,status,home_logo_url,away_logo_url
    FROM plateau_games WHERE plateau_match_id=? ORDER BY display_order,id LIMIT 100`)
    .bind(plateauId).all<AnyRow>();
  const response = publicJson({ games: resultRows(rows) });
  ctx.waitUntil(cache.put(key, response.clone()));
  return response;
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

const normalizedRole = (value: unknown) => {
  const role = String(value || "coach").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z]+/g, "_").replace(/^_|_$/g, "");
  if (["coach_referent", "referent", "coach_reference"].includes(role)) return "coach_referent";
  if (["dirigeant", "manager"].includes(role)) return "dirigeant";
  if (["arbitre", "referee"].includes(role)) return "arbitre";
  return "coach";
};

async function importCoaches(request: Request, env: Env) {
  if (!await admin(request, env)) return json({ error: "Accès administrateur requis" }, 401);
  const body = await request.json<{ rows?: AnyRow[] }>().catch(() => null);
  if (!Array.isArray(body?.rows) || body.rows.length === 0 || body.rows.length > 500) {
    return json({ error: "Le fichier doit contenir entre 1 et 500 lignes." }, 400);
  }
  const teams = (await env.DB.prepare("SELECT id,name,slug FROM teams WHERE active=1").all<AnyRow>()).results || [];
  const teamKey = (value: unknown) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const teamMap = new Map<string, AnyRow>();
  for (const team of teams) {
    teamMap.set(teamKey(team.name), team);
    teamMap.set(teamKey(team.slug), team);
    teamMap.set(String(team.id), team);
  }
  let created = 0, updated = 0, assigned = 0;
  const errors: string[] = [];
  for (const [index, raw] of body.rows.entries()) {
    const fullName = String(raw.full_name || "").trim();
    const email = String(raw.email || "").trim().toLowerCase();
    const phone = String(raw.phone || "").trim();
    const license = String(raw.license_number || "").trim();
    const notes = String(raw.notes || "").trim();
    if (!fullName) { errors.push(`Ligne ${index + 2} : nom manquant.`); continue; }
    let member = license
      ? await env.DB.prepare("SELECT id FROM club_members WHERE license_number=? COLLATE NOCASE LIMIT 1").bind(license).first<{ id: number }>()
      : null;
    if (!member && email) member = await env.DB.prepare("SELECT id FROM club_members WHERE email=? COLLATE NOCASE LIMIT 1").bind(email).first<{ id: number }>();
    if (!member) member = await env.DB.prepare("SELECT id FROM club_members WHERE full_name=? COLLATE NOCASE LIMIT 1").bind(fullName).first<{ id: number }>();
    let memberId: number;
    if (member?.id) {
      memberId = member.id;
      await env.DB.prepare(`UPDATE club_members SET
        full_name=?,email=CASE WHEN ?<>'' THEN ? ELSE email END,
        phone=CASE WHEN ?<>'' THEN ? ELSE phone END,
        license_number=CASE WHEN ?<>'' THEN ? ELSE license_number END,
        notes=CASE WHEN ?<>'' THEN ? ELSE notes END,active=1,updated_at=CURRENT_TIMESTAMP
        WHERE id=?`).bind(fullName,email,email,phone,phone,license,license,notes,notes,memberId).run();
      updated++;
    } else {
      const result = await env.DB.prepare(`INSERT INTO club_members(
        full_name,email,phone,license_number,notes,active
      ) VALUES(?,?,?,?,?,1)`).bind(fullName,email,phone,license,notes).run();
      memberId = Number(result.meta.last_row_id);
      created++;
    }
    const teamValue = raw.team_id || raw.team || raw.group_name;
    if (teamValue) {
      const team = teamMap.get(teamKey(teamValue)) || teamMap.get(String(teamValue));
      if (!team) errors.push(`Ligne ${index + 2} : groupe sportif « ${teamValue} » introuvable.`);
      else {
        await env.DB.prepare(`INSERT INTO team_staff(team_id,member_id,role,active)
          VALUES(?,?,?,1) ON CONFLICT(team_id,member_id,role)
          DO UPDATE SET active=1,updated_at=CURRENT_TIMESTAMP`).bind(team.id,memberId,normalizedRole(raw.role)).run();
        assigned++;
      }
    }
  }
  return json({ ok: true, created, updated, assigned, errors });
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
      OR matches.season_id IS NOT excluded.season_id
      OR matches.category IS NOT excluded.category OR matches.competition IS NOT excluded.competition
      OR matches.venue IS NOT excluded.venue OR matches.venue_address IS NOT excluded.venue_address
      OR matches.latitude IS NOT excluded.latitude OR matches.longitude IS NOT excluded.longitude
      OR matches.home_team IS NOT excluded.home_team OR matches.away_team IS NOT excluded.away_team
      OR matches.home_score IS NOT excluded.home_score OR matches.away_score IS NOT excluded.away_score
      OR matches.status IS NOT excluded.status OR matches.event_type IS NOT excluded.event_type
      OR matches.source_url IS NOT excluded.source_url
      OR matches.home_logo_url IS NOT excluded.home_logo_url OR matches.away_logo_url IS NOT excluded.away_logo_url
      OR matches.time_confirmed IS NOT excluded.time_confirmed`
  ).bind(...values).run();
  const stored = await env.DB.prepare("SELECT id FROM matches WHERE source=? AND source_id=?")
    .bind(row.source, row.source_id).first<{ id: number }>();
  let participantsChanged = 0;
  if (stored && Array.isArray(row.participants)) {
    const incoming = row.participants.filter((participant: AnyRow) => participant?.name).map((participant: AnyRow, index: number) => ({
      name: String(participant.name),
      club_number: String(participant.club_number || ""),
      team_number: String(participant.team_number || ""),
      logo_url: String(participant.logo_url || ""),
      is_club: participant.is_club ? 1 : 0,
      display_order: index
    }));
    const existingResult = await env.DB.prepare(`SELECT name,club_number,team_number,logo_url,is_club,display_order
      FROM match_participants WHERE match_id=? ORDER BY display_order,id`).bind(stored.id).all<AnyRow>();
    const existing = (existingResult.results || []).map(participant => ({
      name: String(participant.name || ""),
      club_number: String(participant.club_number || ""),
      team_number: String(participant.team_number || ""),
      logo_url: String(participant.logo_url || ""),
      is_club: Number(participant.is_club) === 1 ? 1 : 0,
      display_order: Number(participant.display_order || 0)
    }));
    if (JSON.stringify(existing) !== JSON.stringify(incoming)) {
      const statements = [env.DB.prepare("DELETE FROM match_participants WHERE match_id=?").bind(stored.id)];
      for (const participant of incoming) {
        statements.push(env.DB.prepare(`INSERT INTO match_participants(
          match_id,name,club_number,team_number,logo_url,is_club,display_order
        ) VALUES(?,?,?,?,?,?,?)`).bind(
          stored.id, participant.name, participant.club_number,
          participant.team_number, participant.logo_url,
          participant.is_club, participant.display_order
        ));
      }
      await env.DB.batch(statements);
      participantsChanged = 1;
    }
  }
  let gamesChanged = 0;
  if (stored && Array.isArray(row.plateau_games)) {
    const incoming = row.plateau_games.filter((game: AnyRow) => game?.home_team && game?.away_team)
      .map((game: AnyRow, index: number) => ({
        source_game_id: String(game.source_game_id || `${index + 1}`),
        display_order: index,
        home_team: String(game.home_team),
        away_team: String(game.away_team),
        home_score: game.home_score === null || game.home_score === undefined || game.home_score === "" ? null : Number(game.home_score),
        away_score: game.away_score === null || game.away_score === undefined || game.away_score === "" ? null : Number(game.away_score),
        status: String(game.status || "scheduled"),
        home_logo_url: String(game.home_logo_url || ""),
        away_logo_url: String(game.away_logo_url || ""),
        raw_json: JSON.stringify(game.raw_json || game)
      }));
    const existingResult = await env.DB.prepare(`SELECT source_game_id,display_order,home_team,away_team,
      home_score,away_score,status,home_logo_url,away_logo_url
      FROM plateau_games WHERE plateau_match_id=? ORDER BY display_order,id`).bind(stored.id).all<AnyRow>();
    const existing = (existingResult.results || []).map(game => ({
      source_game_id: String(game.source_game_id || ""),
      display_order: Number(game.display_order || 0),
      home_team: String(game.home_team || ""),
      away_team: String(game.away_team || ""),
      home_score: game.home_score === null || game.home_score === undefined ? null : Number(game.home_score),
      away_score: game.away_score === null || game.away_score === undefined ? null : Number(game.away_score),
      status: String(game.status || "scheduled"),
      home_logo_url: String(game.home_logo_url || ""),
      away_logo_url: String(game.away_logo_url || "")
    }));
    const incomingComparable = incoming.map(({ raw_json: _rawJson, ...game }) => game);
    if (JSON.stringify(existing) !== JSON.stringify(incomingComparable)) {
      const statements = [env.DB.prepare("DELETE FROM plateau_games WHERE plateau_match_id=?").bind(stored.id)];
      for (const game of incoming) {
        statements.push(env.DB.prepare(`INSERT INTO plateau_games(
          plateau_match_id,source_game_id,display_order,home_team,away_team,home_score,away_score,
          status,home_logo_url,away_logo_url,raw_json
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(
          stored.id, game.source_game_id, game.display_order, game.home_team, game.away_team,
          game.home_score, game.away_score, game.status, game.home_logo_url, game.away_logo_url,
          game.raw_json
        ));
      }
      await env.DB.batch(statements);
      gamesChanged = 1;
    }
  }
  return Number(result.meta.changes || 0) + participantsChanged + gamesChanged;
}

function syncRunData(row: AnyRow | null, detailed = false) {
  if (!row) return { finished_at: null, last_success_at: null, imported_count: 0, status: "missing", stale: true };
  const finishedAt = String(row.finished_at || "");
  const normalizedFinishedAt = finishedAt.replace(" ", "T");
  const parsed = normalizedFinishedAt ? Date.parse(normalizedFinishedAt.endsWith("Z") ? normalizedFinishedAt : `${normalizedFinishedAt}Z`) : NaN;
  const stale = !Number.isFinite(parsed) || Date.now() - parsed > 60 * 60 * 60 * 1000;
  const result: AnyRow = {
    finished_at: row.finished_at || null,
    last_success_at: row.last_success_at || null,
    imported_count: Number(row.imported_count || 0),
    status: row.status || "missing",
    stale
  };
  if (detailed) {
    try { result.sources = JSON.parse(row.error_message || "[]"); }
    catch { result.sources = []; }
  }
  return result;
}

async function latestSyncRun(env: Env) {
  return env.DB.prepare(`SELECT id,finished_at,status,imported_count,error_message,
    (SELECT finished_at FROM sync_runs WHERE source='github_actions' AND status='success'
      ORDER BY id DESC LIMIT 1) AS last_success_at
    FROM sync_runs WHERE source='github_actions' ORDER BY id DESC LIMIT 1`).first<AnyRow>();
}

async function recordSyncStatus(request: Request, env: Env) {
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!env.FCE_SYNC_TOKEN || !secureToken(supplied, env.FCE_SYNC_TOKEN)) {
    return json({ error: "Jeton de synchronisation invalide" }, 401);
  }
  const body = await request.json<AnyRow>().catch(() => null);
  if (!body || !["success", "partial", "error"].includes(body.status)) {
    return json({ error: "État de synchronisation invalide" }, 400);
  }
  await env.DB.prepare(`INSERT INTO sync_runs(source,finished_at,status,imported_count,error_message)
    VALUES('github_actions',CURRENT_TIMESTAMP,?,?,?)`).bind(
    body.status, Number(body.imported_count || 0), JSON.stringify(body.sources || [])
  ).run();
  return json({ ok: true });
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
        WHERE id=? AND (name IS NOT ? OR team_number IS NOT ? OR category_code IS NOT ?
          OR competition_name IS NOT ? OR division IS NOT ? OR pool IS NOT ?)`).bind(
        official.name || [row.category, official.team_number].filter(Boolean).join(" ") || fffTeamId,
        official.team_number || "", official.category_code || row.category || "",
        official.competition_name || row.competition || "",
        official.division || "", official.pool || "", entry.id,
        official.name || [row.category, official.team_number].filter(Boolean).join(" ") || fffTeamId,
        official.team_number || "", official.category_code || row.category || "",
        official.competition_name || row.competition || "",
        official.division || "", official.pool || ""
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
  const sourceResults = Array.isArray(body?.sources) ? body.sources : [];
  const syncStatus = sourceResults.some(source => source?.status === "error") ? "partial" : "success";
  // Un ancien collecteur FAL utilisait un identifiant à trois segments. Après
  // une collecte FFF complète, les plateaux absents du lot courant sont donc
  // des doublons obsolètes. Les ajouts manuels utilisent une autre source.
  let removedPlateauDuplicates = 0;
  if (syncStatus === "success") {
    const currentPlateaux = rows
      .filter(row => row.source === "district_fal" && ["plateau", "animation"].includes(row.event_type))
      .map(row => String(row.source_id));
    if (currentPlateaux.length) {
      const deleted = await env.DB.prepare(`DELETE FROM matches
        WHERE source='district_fal' AND manually_created=0 AND (season_id=? OR season_id IS NULL)
        AND event_type IN ('plateau','animation')
        AND source_id NOT IN (${currentPlateaux.map(() => "?").join(",")})`)
        .bind(seasonId, ...currentPlateaux).run();
      removedPlateauDuplicates = Number(deleted.meta.changes || 0);
    }
  }
  await env.DB.prepare(`INSERT INTO sync_runs(
    source,finished_at,status,imported_count,error_message
  ) VALUES('github_actions',CURRENT_TIMESTAMP,?,?,?)`).bind(
    syncStatus, changed, JSON.stringify(sourceResults)
  ).run();
  // Les pages publiques sont mises en cache pour économiser D1. Une collecte
  // réussie doit toutefois rendre immédiatement visibles les nouveaux scores.
  const origin = new URL(request.url).origin;
  const cache = caches.default;
  const cacheKeys = [
    new Request(`${origin}/api/page/matches`),
    new Request(`${origin}/api/page/matches?v=19`),
    new Request(`${origin}/api/page/home`)
  ];
  const currentPlateauIds = await env.DB.prepare(`SELECT id FROM matches
    WHERE source='district_fal' AND (season_id=? OR season_id IS NULL)
    AND event_type IN ('plateau','animation')`).bind(seasonId).all<{ id: number }>();
  for (const plateau of currentPlateauIds.results || []) {
    cacheKeys.push(new Request(`${origin}/api/plateau-games?plateau_id=${plateau.id}`));
  }
  await Promise.all(cacheKeys.map(key => cache.delete(key)));
  return json({
    ok: true, received: rows.length, accepted, changed, discovered,
    removed_plateau_duplicates: removedPlateauDuplicates, status: syncStatus
  });
}

async function syncMeta(env: Env, detailed = false) {
  return json(syncRunData(await latestSyncRun(env), detailed));
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname === "/internal/sync/matches" && request.method === "POST") {
      return ingestMatches(request, env);
    }
    if (url.pathname === "/internal/sync/status" && request.method === "POST") {
      return recordSyncStatus(request, env);
    }
    const gate = testGate(request, env);
    if (gate) return gate;
    if ((url.pathname === "/admin" || url.pathname.startsWith("/admin/")) &&
      request.headers.get("cf-access-authenticated-user-email") && !await admin(request, env)) {
      return new Response("Cette adresse est authentifiée par Cloudflare, mais elle n’est pas administratrice du site.", {
        status: 403, headers: { "content-type": "text/plain;charset=UTF-8", "cache-control": "no-store" }
      });
    }
    if (request.method === "GET" && url.pathname.startsWith("/api/page/")) {
      return cachedPageData(request, env, url, ctx);
    }
    if (url.pathname === "/api/plateau-games" && request.method === "GET") {
      return cachedPlateauGames(request, env, url, ctx);
    }
    if (url.pathname === "/api/match-sync" && request.method === "GET") return syncMeta(env);
    if (url.pathname === "/admin-api/sync-health" && request.method === "GET") {
      if (!await admin(request, env)) return json({ error: "Accès administrateur requis" }, 401);
      return syncMeta(env, true);
    }
    if (url.pathname === "/admin-api/upload" && request.method === "POST") return upload(request, env);
    if (url.pathname === "/admin-api/import/coaches" && request.method === "POST") return importCoaches(request, env);
    if (url.pathname === "/admin-api/sync/matches" && request.method === "POST") {
      return json({ error: "Lancez l’action « Synchroniser les matchs » dans GitHub. Elle utilise ZenRows uniquement aux six horaires prévus." }, 409);
    }
    if (url.pathname.startsWith("/admin-api/") || url.pathname.startsWith("/api/")) {
      return api(request, env, url);
    }
    if (url.pathname.startsWith("/media/")) {
      const object = await env.MEDIA.get(url.pathname.slice(7));
      return object
        ? new Response(object.body, { headers: { "content-type": object.httpMetadata?.contentType || "application/octet-stream", "cache-control": "public,max-age=31536000,immutable" } })
        : new Response("Not found", { status: 404 });
    }
    return env.ASSETS.fetch(request);
  }
} satisfies ExportedHandler<Env>;

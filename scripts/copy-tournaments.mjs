import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { copyStatements, quote } from "./tournaments-transfer.mjs";
const args = process.argv.slice(2),
  get = (name, fallback) => {
    const i = args.indexOf(name);
    return i < 0 ? fallback : args[i + 1];
  },
  target = get("--env", "staging");
if (!["staging", "production", "local"].includes(target))
  throw new Error("Environnement invalide.");
const configured = spawnSync(
  process.execPath,
  ["scripts/configure-tournaments.mjs", "--env", target, "--check"],
  { encoding: "utf8" },
);
if (configured.status !== 0)
  throw new Error(
    "Le binding TOURNAMENTS doit être configuré et distinct de toutes les autres bases avant toute copie. Voir docs/TOURNOIS-V5.2.md.",
  );
const common = [
  target === "local" ? "--local" : "--remote",
  ...(target === "production" ? [] : ["--env", target]),
];
function run(database, extra) {
  const result = spawnSync(
    process.execPath,
    [
      "node_modules/wrangler/bin/wrangler.js",
      "d1",
      "execute",
      database,
      ...common,
      ...extra,
      "--json",
    ],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  if (result.status !== 0)
    throw new Error(
      `Échec D1 ${database}. Aucun secret ni contenu de ligne n’est affiché. Vérifiez l’authentification, le binding et les migrations.`,
    );
  try {
    const parsed = JSON.parse(result.stdout);
    if (!Array.isArray(parsed) || parsed.some((r) => r.success === false))
      throw new Error();
    return parsed.flatMap((r) => r.results || []);
  } catch {
    throw new Error("Réponse Wrangler illisible.");
  }
}
const query = (db, sql) => run(db, ["--command", sql]);
const marker = query(
  "TOURNAMENTS",
  "SELECT id FROM module_imports WHERE id='v5.2'",
);
if (args.includes("--check")) {
  if (!marker.length)
    throw new Error(
      "Copie initiale des tournois absente. Lancez node scripts/copy-tournaments.mjs --env " +
        target +
        " --apply avant le déploiement.",
    );
  console.log("Copie initiale des tournois vérifiée.");
  process.exit(0);
}
if (!args.includes("--apply"))
  throw new Error(
    "Fermez les inscriptions et sauvegardez DB/ORDERS avant de lancer avec --apply. Voir docs/TOURNOIS-V5.2.md.",
  );
if (marker.length)
  throw new Error(
    "La copie initiale a déjà été effectuée. Les données du module dédié ne seront pas écrasées.",
  );
const data = {};
data.tournaments = query(
  "DB",
  "SELECT t.*,COALESCE(NULLIF(t.venue,''),v.name,'') AS venue FROM tournaments t LEFT JOIN venues v ON v.id=t.venue_id",
);
data.tournament_teams = query("DB", "SELECT * FROM tournament_teams");
data.tournament_sales = query("DB", "SELECT * FROM tournament_sales");
if (data.tournament_sales.some((s) => s.enabled))
  throw new Error(
    "Désactivez toutes les inscriptions dans les anciens paramètres tournois avant la copie, puis relancez.",
  );
data.tournament_admins = query("ORDERS", "SELECT * FROM tournament_admins");
data.orders = query("ORDERS", "SELECT * FROM orders WHERE kind='tournament'");
for (const table of [
  "tournament_registrations",
  "order_items",
  "checkout_attempts",
  "payments",
  "order_events",
  "outbox",
])
  data[table] = query(
    "ORDERS",
    `SELECT c.* FROM ${table} c JOIN orders o ON o.id=c.order_id WHERE o.kind='tournament'`,
  );
const started = query(
  "TOURNAMENTS",
  "SELECT id FROM module_imports WHERE id='v5.2-started'",
);
if (!started.length) {
  for (const table of Object.keys(data)) {
    const [{ n }] = query("TOURNAMENTS", `SELECT count(*) n FROM ${table}`);
    if (Number(n))
      throw new Error(
        "La destination contient déjà des données. Utilisez une D1 tournois neuve pour la copie initiale ; aucune ligne ne sera écrasée.",
      );
  }
  query(
    "TOURNAMENTS",
    "INSERT INTO module_imports(id,imported_at) VALUES('v5.2-started',unixepoch())",
  );
}
const folder = mkdtempSync(join(process.cwd(), ".tournaments-copy-"));
try {
  // Temporary SQL contains personal data: never print it, and remove it in finally.
  const file = join(folder, "copy.sql");
  const sql = copyStatements(data);
  for (let i = 0; i < sql.length; i += 100) {
    writeFileSync(file, sql.slice(i, i + 100).join("\n"));
    run("TOURNAMENTS", ["--file", file]);
  }
  for (const [table, rows] of Object.entries(data)) {
    const key =
      table === "tournament_admins"
        ? "email"
        : table === "tournament_sales"
          ? "tournament_id"
          : table === "tournament_registrations"
            ? "order_id"
            : "id";
    for (let i = 0; i < rows.length; i += 100) {
      const ids = rows.slice(i, i + 100).map((r) => quote(r[key]));
      const [{ n }] = query(
        "TOURNAMENTS",
        `SELECT count(*) AS n FROM ${table} WHERE ${key} IN (${ids.join(",")})`,
      );
      if (Number(n) !== ids.length)
        throw new Error(
          `Copie incomplète pour ${table}. Les sources sont conservées ; corrigez puis relancez.`,
        );
    }
  }
  for (const [table, rows] of Object.entries(data)) {
    const [{ n }] = query("TOURNAMENTS", `SELECT count(*) n FROM ${table}`);
    if (Number(n) !== rows.length)
      throw new Error(
        `Nombre de lignes inattendu dans ${table}. La copie n’est pas validée.`,
      );
  }
  query(
    "TOURNAMENTS",
    "INSERT INTO module_imports(id,imported_at) VALUES('v5.2',unixepoch())",
  );
  console.log(
    `Copie vérifiée : ${data.tournaments.length} tournoi(s), ${data.orders.length} inscription(s). Les sources sont conservées. Réactivez les inscriptions uniquement dans le nouveau module après recette.`,
  );
} finally {
  rmSync(folder, { recursive: true, force: true });
}

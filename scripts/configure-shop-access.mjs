import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const args = process.argv.slice(2);
const get = (name, fallback) => {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith("--"))
    throw new Error(`Valeur manquante pour ${name}`);
  return args[index + 1];
};
const target = get("--env", "staging");
if (!["staging", "production"].includes(target))
  throw new Error("--env doit valoir staging ou production.");
const scope=get("--scope","shop");
if(!["shop","tournament"].includes(scope))throw new Error("--scope doit valoir shop ou tournament.");
const audName=scope==='shop'?'CF_ACCESS_SHOP_AUD':'CF_ACCESS_TOURNAMENT_AUD';
const file = resolve(
  get("--config", new URL("../wrangler.jsonc", import.meta.url).pathname),
);
const config = JSON.parse(readFileSync(file, "utf8"));
const section = target === "staging" ? config.env?.staging : config;
if (!section) throw new Error("Configuration staging absente.");
const previous = section.vars || {};
const values = {
  CF_ACCESS_ISSUER: String(get("--issuer", previous.CF_ACCESS_ISSUER || ""))
    .trim()
    .replace(/\/+$/, ""),
  [audName]: String(
    get("--aud", previous[audName] || ""),
  ).trim(),
  SHOP_ORIGIN: String(get("--origin", previous.SHOP_ORIGIN || ""))
    .trim()
    .replace(/\/+$/, ""),
};
if (
  !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(values.CF_ACCESS_ISSUER)
)
  throw new Error(
    "CF_ACCESS_ISSUER : renseignez https://VOTRE-EQUIPE.cloudflareaccess.com (domaine Zero Trust, pas celui du site).",
  );
if (
  !values[audName].split(",").every((a) =>
    /^[a-f0-9]{64}$/i.test(a.trim()),
  )
)
  throw new Error(
    `${audName} : copiez le champ Application Audience (AUD) de l’application ${scope === "shop" ? "boutique" : "tournois"}. Le Policy ID ne convient pas.`,
  );
let origin;
try {
  origin = new URL(values.SHOP_ORIGIN);
} catch {}
if (
  !origin ||
  origin.protocol !== "https:" ||
  origin.origin !== values.SHOP_ORIGIN
)
  throw new Error(
    "SHOP_ORIGIN : renseignez l’origine HTTPS exacte du site, sans chemin.",
  );
if (args.includes("--check"))
  console.log(
    `Configuration Access ${scope} ${target} vérifiée : domaine, audience et origine présents.`,
  );
else {
  section.vars = { ...previous, ...values };
  writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
  console.log(
    `Variables Access ${scope} ${target} enregistrées. Les bindings D1/R2 sont inchangés. Faites un commit/push pour les déployer.`,
  );
}

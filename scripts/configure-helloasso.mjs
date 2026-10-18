import { readFileSync, writeFileSync } from "node:fs";
const args = process.argv.slice(2),
  get = (name, fallback) => {
    const at = args.indexOf(name);
    return at < 0 ? fallback : args[at + 1];
  };
const target = get("--env", "staging");
if (!["staging", "production"].includes(target))
  throw new Error("Environnement invalide.");
const path = get("--config", new URL("../wrangler.jsonc", import.meta.url)),
  config = JSON.parse(readFileSync(path, "utf8")),
  section = target === "staging" ? config.env.staging : config;
const slug = get("--slug", target === "staging" ? "fce" : null);
if (!slug || !/^[-a-z0-9]{1,150}$/.test(slug))
  throw new Error(
    "Renseignez --slug avec l’identifiant vérifié dans cet environnement.",
  );
section.vars = {
  ...section.vars,
  APP_ENV: target,
  HELLOASSO_ORGANIZATION_SLUG: slug,
  SHOP_ORIGIN: get(
    "--origin",
    section.vars?.SHOP_ORIGIN ||
      (target === "staging"
        ? "https://fce-escalquens-staging.fcescalquens.workers.dev"
        : "https://fcescalquens.fr"),
  ),
};
const origin = new URL(section.vars.SHOP_ORIGIN);
if (origin.protocol !== "https:" || origin.origin !== section.vars.SHOP_ORIGIN)
  throw new Error("Origine HTTPS exacte requise, sans chemin ni barre finale.");
writeFileSync(path, JSON.stringify(config, null, 2) + "\n");
console.log(
  `HelloAsso ${target === "staging" ? "sandbox" : "production"} : association ${slug}. Aucun secret enregistré. Les bindings D1/R2 sont inchangés.`,
);

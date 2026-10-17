import { readFileSync, writeFileSync } from "node:fs";
const path = new URL("../wrangler.jsonc", import.meta.url),
  config = JSON.parse(readFileSync(path, "utf8"));
const args = process.argv.slice(2),
  get = (key) => {
    const i = args.indexOf(key);
    return i >= 0 ? args[i + 1] : undefined;
  };
const valid = (id) =>
  typeof id === "string" &&
  /^[a-f0-9-]{36}$/i.test(id) &&
  !/^0+-0+-0+-0+-0+$/.test(id);
if (get("--production-id") || get("--staging-id")) {
  for (const [flag, bindings] of [
    ["--production-id", config.d1_databases],
    ["--staging-id", config.env.staging.d1_databases],
  ]) {
    const id = get(flag);
    if (id) {
      if (!valid(id)) throw new Error(`Identifiant invalide pour ${flag}`);
      bindings.find((b) => b.binding === "ORDERS").database_id = id;
    }
  }
  writeFileSync(path, JSON.stringify(config, null, 2) + "\n");
}
const check = get("--check");
if (check) {
  const target = check === "staging" ? config.env.staging : config;
  const binding = target.d1_databases.find((b) => b.binding === "ORDERS");
  if (!binding || !valid(binding.database_id))
    throw new Error(
      "Créez la base ORDERS puis renseignez son UUID avec scripts/configure-orders.mjs ; voir docs/BOUTIQUE.md.",
    );
  const all = [...config.d1_databases, ...config.env.staging.d1_databases];
  const configured = all.filter((b) => valid(b.database_id));
  if (new Set(configured.map((b) => b.database_id)).size !== configured.length)
    throw new Error(
      "Les quatre bases site/commandes et production/staging doivent être distinctes.",
    );
  console.log(`Configuration ORDERS ${check} vérifiée.`);
}

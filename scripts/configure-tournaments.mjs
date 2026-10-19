import { readFileSync, writeFileSync } from "node:fs";
const args = process.argv.slice(2),
  get = (name, fallback) => {
    const at = args.indexOf(name);
    return at < 0 ? fallback : args[at + 1];
  };
const target = get("--env", "staging");
if (!["local", "staging", "production"].includes(target))
  throw new Error("--env doit être local, staging ou production.");
const path = get("--config", new URL("../wrangler.jsonc", import.meta.url)),
  config = JSON.parse(readFileSync(path, "utf8")),
  section = target === "production" ? config : config.env[target];
if (!section) throw new Error("Environnement absent.");
const valid = (id) =>
  typeof id === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id) &&
  !/^0+-0+-0+-0+-0+$/.test(id);
const id = get(
  "--id",
  section.d1_databases?.find((b) => b.binding === "TOURNAMENTS")?.database_id,
);
if (!valid(id))
  throw new Error(
    "Créez la D1 des tournois, puis lancez node scripts/configure-tournaments.mjs --env " +
      target +
      " --id UUID. Voir docs/TOURNOIS-V5.2.md.",
  );
const all = [
  ...(config.d1_databases || []),
  ...Object.values(config.env || {}).flatMap((e) => e.d1_databases || []),
];
if (
  all.some(
    (b) =>
      b.database_id === id &&
      b !== section.d1_databases.find((x) => x.binding === "TOURNAMENTS"),
  )
)
  throw new Error(
    "La D1 tournois doit être distincte de toutes les autres bases et environnements.",
  );
if (!args.includes("--check")) {
  section.d1_databases ??= [];
  const previous = section.d1_databases.find(
    (b) => b.binding === "TOURNAMENTS",
  );
  const value = {
    binding: "TOURNAMENTS",
    database_name: get(
      "--name",
      previous?.database_name ||
        `fce-escalquens-tournaments${target === "production" ? "" : "-" + target}`,
    ),
    database_id: id,
    migrations_dir: "migrations-tournaments",
  };
  if (previous) Object.assign(previous, value);
  else section.d1_databases.push(value);
  writeFileSync(path, JSON.stringify(config, null, 2) + "\n");
}
console.log(
  `Binding TOURNAMENTS ${target} vérifié. DB et ORDERS sont conservés.`,
);

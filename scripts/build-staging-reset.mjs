import fs from 'node:fs';

const [
  input = './prod-d1.sql',
  output = './staging-reset.sql'
] = process.argv.slice(2);

const sql = fs.readFileSync(input, 'utf8');

const tables = new Set();
const views = new Set();
const triggers = new Set();

function collect(regex, destination) {
  for (const match of sql.matchAll(regex)) {
    const name =
      match[1] ||
      match[2] ||
      match[3] ||
      match[4];

    if (!name) continue;

    // Table interne Cloudflare : ne surtout pas essayer
    // de la supprimer.
    if (
      name === '_cf_KV' ||
      name.startsWith('sqlite_')
    ) {
      continue;
    }

    destination.add(name);
  }
}

const identifier =
  /(?:"([^"]+)"|`([^`]+)`|\[([^\]]+)\]|([A-Za-z_][A-Za-z0-9_]*))/;

collect(
  new RegExp(
    `CREATE\\s+TABLE(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+${identifier.source}`,
    'gi'
  ),
  tables
);

collect(
  new RegExp(
    `CREATE\\s+VIEW(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+${identifier.source}`,
    'gi'
  ),
  views
);

collect(
  new RegExp(
    `CREATE\\s+TRIGGER(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+${identifier.source}`,
    'gi'
  ),
  triggers
);

if (!tables.size) {
  throw new Error(
    'Aucune table détectée dans prod-d1.sql.'
  );
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

const lines = [
  '-- Généré automatiquement.',
  '-- Ce fichier sert UNIQUEMENT à vider D1 staging.',
  'PRAGMA defer_foreign_keys = ON;'
];

for (const name of triggers) {
  lines.push(
    `DROP TRIGGER IF EXISTS ${quoteIdentifier(name)};`
  );
}

for (const name of views) {
  lines.push(
    `DROP VIEW IF EXISTS ${quoteIdentifier(name)};`
  );
}

for (const name of [...tables].reverse()) {
  lines.push(
    `DROP TABLE IF EXISTS ${quoteIdentifier(name)};`
  );
}

lines.push(
  'PRAGMA defer_foreign_keys = OFF;',
  ''
);

fs.writeFileSync(
  output,
  lines.join('\n')
);

console.log(
  `${tables.size} table(s), ` +
  `${views.size} vue(s), ` +
  `${triggers.size} trigger(s) détecté(s).`
);

console.log(`Fichier créé : ${output}`);

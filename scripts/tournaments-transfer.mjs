export const quote = (value) =>
  value === null || value === undefined
    ? "NULL"
    : typeof value === "number"
      ? Number.isFinite(value)
        ? String(value)
        : (() => {
            throw new Error("Nombre invalide.");
          })()
      : "'" + String(value).replaceAll("'", "''") + "'";
export function copyStatements(data) {
  const allowed = new Set([
    "tournaments",
    "tournament_teams",
    "tournament_sales",
    "tournament_admins",
    "orders",
    "tournament_registrations",
    "order_items",
    "checkout_attempts",
    "payments",
    "order_events",
    "outbox",
  ]);
  const statements = [];
  for (const [table, rows] of Object.entries(data)) {
    if (!allowed.has(table) || !Array.isArray(rows))
      throw new Error("Table de copie invalide.");
    for (const source of rows) {
      const row = { ...source };
      if (table === "orders" && row.kind !== "tournament")
        throw new Error(
          "Une commande boutique ne doit jamais être copiée dans TOURNAMENTS.",
        );
      if (table === "tournaments") row.registration_url = null;
      const columns = Object.keys(row);
      if (columns.some((c) => !/^[_a-z][_a-z0-9]*$/i.test(c)))
        throw new Error("Colonne invalide.");
      statements.push(
        `INSERT OR IGNORE INTO ${table}(${columns.map((c) => '"' + c + '"').join(",")}) VALUES(${columns.map((c) => quote(row[c])).join(",")});`,
      );
    }
  }
  return statements;
}

from pathlib import Path
import sqlite3
from collections import deque

schema_path = Path("staging-schema.sql")
output_path = Path("staging-clear-data.sql")

schema = schema_path.read_text(encoding="utf-8")

db = sqlite3.connect(":memory:")

try:
    db.executescript(schema)
except Exception as exc:
    raise SystemExit(f"Impossible de charger le schéma SQLite localement : {exc}")

tables = [
    row[0]
    for row in db.execute("""
        SELECT name
        FROM sqlite_schema
        WHERE type = 'table'
        ORDER BY name
    """)
    if (
        row[0] != "d1_migrations"
        and row[0] != "_cf_KV"
        and not row[0].startswith("sqlite_")
    )
]

table_set = set(tables)

# Graphe :
# enfant -> parent
#
# Pour DELETE, il faut supprimer l'enfant AVANT son parent.
edges = {table: set() for table in tables}
indegree = {table: 0 for table in tables}

def quote(value):
    return '"' + value.replace('"', '""') + '"'

for child in tables:
    escaped = child.replace('"', '""')

    rows = db.execute(
        f'PRAGMA foreign_key_list("{escaped}")'
    ).fetchall()

    for row in rows:
        parent = row[2]

        # Une FK vers elle-même n'influence pas l'ordre entre tables.
        if (
            parent in table_set
            and parent != child
            and parent not in edges[child]
        ):
            edges[child].add(parent)
            indegree[parent] += 1

# Tri topologique enfant -> parent.
queue = deque(
    sorted(
        table
        for table, degree in indegree.items()
        if degree == 0
    )
)

order = []

while queue:
    child = queue.popleft()
    order.append(child)

    for parent in sorted(edges[child]):
        indegree[parent] -= 1

        if indegree[parent] == 0:
            queue.append(parent)

remaining = [
    table
    for table in tables
    if table not in order
]

if remaining:
    print("Cycle de clés étrangères détecté :")
    for table in remaining:
        print(" -", table)

    raise SystemExit(
        "Arrêt : je ne génère pas un script de suppression potentiellement dangereux."
    )

lines = [
    "-- Généré automatiquement depuis le schéma réel de staging.",
    "-- Ordre : tables enfants avant tables parentes.",
    ""
]

for table in order:
    lines.append(f"DELETE FROM {quote(table)};")

lines.append("")

output_path.write_text(
    "\n".join(lines),
    encoding="utf-8"
)

print()
print(f"{len(order)} tables détectées.")
print()
print("Ordre de suppression :")

for index, table in enumerate(order, 1):
    parents = ", ".join(sorted(edges[table])) or "-"
    print(f"{index:02d}. {table:32} -> {parents}")

print()
print(f"Fichier créé : {output_path}")

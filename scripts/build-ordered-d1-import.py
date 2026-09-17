from pathlib import Path
import sqlite3
import re
import sys
from collections import defaultdict, deque

SCHEMA_FILE = Path("staging-schema.sql")
DATA_FILE = Path("prod-data.sql")
OUTPUT_FILE = Path("prod-data-ordered.sql")

if not SCHEMA_FILE.exists():
    sys.exit("staging-schema.sql introuvable")

if not DATA_FILE.exists():
    sys.exit("prod-data.sql introuvable")


# ------------------------------------------------------------
# Charger le vrai schéma staging
# ------------------------------------------------------------

schema_sql = SCHEMA_FILE.read_text(
    encoding="utf-8"
)

schema_db = sqlite3.connect(":memory:")

try:
    schema_db.executescript(schema_sql)
except Exception as exc:
    sys.exit(
        f"Impossible de charger staging-schema.sql : {exc}"
    )


tables = [
    row[0]
    for row in schema_db.execute("""
        SELECT name
        FROM sqlite_schema
        WHERE type='table'
        ORDER BY name
    """)
    if (
        row[0] != "d1_migrations"
        and row[0] != "_cf_KV"
        and not row[0].startswith("sqlite_")
    )
]

table_set = set(tables)

print(
    f"{len(tables)} tables métier détectées."
)


# ------------------------------------------------------------
# Dépendances FK
#
# parent -> enfant
#
# Exemple :
#
# teams
#   ↓
# team_competitions
#   ↓
# matches
#
# Pour INSERT : parent AVANT enfant.
# ------------------------------------------------------------

children = {
    table: set()
    for table in tables
}

indegree = {
    table: 0
    for table in tables
}

self_references = []

for child in tables:

    escaped = child.replace(
        '"',
        '""'
    )

    foreign_keys = schema_db.execute(
        f'PRAGMA foreign_key_list("{escaped}")'
    ).fetchall()

    for fk in foreign_keys:

        parent = fk[2]

        if parent not in table_set:
            continue

        if parent == child:
            self_references.append(child)
            continue

        if child not in children[parent]:

            children[parent].add(child)

            indegree[child] += 1


if self_references:

    print()
    print(
        "⚠️ Tables avec FK vers elles-mêmes :"
    )

    for table in sorted(
        set(self_references)
    ):
        print(
            " -",
            table
        )

    print()
    print(
        "Le script conserve l'ordre d'origine "
        "des lignes à l'intérieur de ces tables."
    )


# ------------------------------------------------------------
# Tri topologique
# ------------------------------------------------------------

queue = deque(
    sorted(
        table
        for table in tables
        if indegree[table] == 0
    )
)

order = []

while queue:

    table = queue.popleft()

    order.append(table)

    for child in sorted(
        children[table]
    ):

        indegree[child] -= 1

        if indegree[child] == 0:
            queue.append(child)


if len(order) != len(tables):

    remaining = [
        table
        for table in tables
        if table not in order
    ]

    print()
    print(
        "❌ Cycle de dépendances FK détecté :"
    )

    for table in remaining:
        print(
            " -",
            table
        )

    sys.exit(
        "Arrêt : impossible de générer "
        "un ordre parent → enfant sûr."
    )


print()
print(
    "Ordre d'import des tables :"
)

for index, table in enumerate(
    order,
    1
):
    print(
        f"{index:02d}. {table}"
    )


# ------------------------------------------------------------
# Découper correctement le dump en instructions SQL
# ------------------------------------------------------------

raw = DATA_FILE.read_text(
    encoding="utf-8"
)

statements = []

buffer = ""

for line in raw.splitlines(
    keepends=True
):

    buffer += line

    if sqlite3.complete_statement(
        buffer
    ):

        statement = buffer.strip()

        if statement:
            statements.append(
                statement
            )

        buffer = ""


if buffer.strip():

    print()
    print(
        "❌ Instruction SQL incomplète "
        "à la fin de prod-data.sql :"
    )

    print(
        buffer[-500:]
    )

    sys.exit(1)


# ------------------------------------------------------------
# Nettoyer / classer les instructions
# ------------------------------------------------------------

by_table = defaultdict(list)

ignored = []

unknown = []


def without_comments(statement):

    return re.sub(
        r"(?m)^\s*--.*$",
        "",
        statement
    ).strip()


table_pattern = re.compile(
    r"""
    ^\s*
    (?:
        INSERT
        (?:\s+OR\s+[A-Z]+)?
        \s+INTO

        |

        REPLACE
        \s+INTO
    )
    \s+
    (?:
        "([^"]+)"
        |
        `([^`]+)`
        |
        \[([^\]]+)\]
        |
        ([A-Za-z_][A-Za-z0-9_]*)
    )
    """,
    re.I | re.X
)


for statement in statements:

    probe = without_comments(
        statement
    )

    if not probe:
        continue

    # Transactions du dump Cloudflare
    if re.match(
        r"^(BEGIN|COMMIT|END|ROLLBACK)\b",
        probe,
        re.I
    ):

        ignored.append(
            probe[:100]
        )

        continue

    # PRAGMA du dump Cloudflare
    if re.match(
        r"^PRAGMA\b",
        probe,
        re.I
    ):

        ignored.append(
            probe[:100]
        )

        continue

    # ANALYZE / statistiques SQLite
    if re.match(
        r"^ANALYZE\b",
        probe,
        re.I
    ):

        ignored.append(
            probe[:100]
        )

        continue

    match = table_pattern.match(
        probe
    )

    if not match:

        unknown.append(
            probe[:300]
        )

        continue

    table = next(
        value
        for value in match.groups()
        if value is not None
    )

    # Tables internes à ne jamais recopier.
    if (
        table == "d1_migrations"
        or table == "_cf_KV"
        or table.startswith("sqlite_")
    ):

        ignored.append(
            f"{table}: {probe[:100]}"
        )

        continue

    if table not in table_set:

        unknown.append(
            f"Table inconnue {table}: "
            f"{probe[:200]}"
        )

        continue

    by_table[table].append(
        statement
    )


if unknown:

    print()
    print(
        "❌ Instructions non reconnues :"
    )

    for statement in unknown[:20]:
        print()
        print(statement)

    sys.exit(
        "\nArrêt pour éviter de générer "
        "un dump incomplet."
    )


# ------------------------------------------------------------
# Générer le nouveau fichier
# ------------------------------------------------------------

output = [
    "-- PROD -> STAGING",
    "-- Import ordonné selon les clés étrangères.",
    "-- Aucune dépendance à defer_foreign_keys.",
    ""
]


total = 0

for table in order:

    rows = by_table.get(
        table,
        []
    )

    if not rows:
        continue

    output.append(
        f"-- TABLE: {table}"
    )

    for statement in rows:

        output.append(
            statement
        )

        if not statement.rstrip().endswith(
            ";"
        ):
            output.append(
                ";"
            )

        total += 1

    output.append(
        ""
    )


OUTPUT_FILE.write_text(
    "\n".join(output),
    encoding="utf-8"
)


print()
print(
    f"{total} INSERT/REPLACE conservés."
)

print(
    f"{len(ignored)} instructions internes ignorées."
)

print(
    f"Fichier créé : {OUTPUT_FILE}"
)


# ------------------------------------------------------------
# VALIDATION LOCALE STRICTE
#
# Cette fois :
#
# PRAGMA foreign_keys = ON
#
# Donc même comportement que D1 :
# chaque INSERT doit être valide immédiatement.
# ------------------------------------------------------------

print()
print(
    "Validation locale avec foreign_keys=ON…"
)


test_db = sqlite3.connect(
    ":memory:"
)

test_db.executescript(
    schema_sql
)

test_db.execute(
    "PRAGMA foreign_keys = ON"
)


for table in order:

    rows = by_table.get(
        table,
        []
    )

    for number, statement in enumerate(
        rows,
        1
    ):

        try:

            test_db.execute(
                statement
            )

        except Exception as exc:

            print()
            print(
                f"❌ Échec dans {table}, "
                f"requête {number}"
            )

            print(
                exc
            )

            print()
            print(
                statement[:1000]
            )

            sys.exit(1)


violations = list(
    test_db.execute(
        "PRAGMA foreign_key_check"
    )
)


if violations:

    print()
    print(
        "❌ Violations FK finales :"
    )

    for violation in violations[:30]:
        print(
            violation
        )

    sys.exit(1)


print()
print(
    "✅ Chaque INSERT respecte les clés étrangères"
)

print(
    "✅ Import strict réussi"
)

print(
    "✅ PRAGMA foreign_key_check : OK"
)


for table in (
    "teams",
    "matches",
):

    if table in table_set:

        count = test_db.execute(
            f'SELECT COUNT(*) FROM "{table}"'
        ).fetchone()[0]

        print(
            f"{table}: {count}"
        )

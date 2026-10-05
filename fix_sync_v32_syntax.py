#!/usr/bin/env python3
from pathlib import Path
import subprocess
import sys

path = Path("scripts/sync-matches.mjs")

if not path.exists():
    raise SystemExit(
        "scripts/sync-matches.mjs introuvable. "
        "Lance ce script depuis la racine du dépôt."
    )

original = path.read_text(encoding="utf-8")
content = original

bad = "fce_error:`HTTP ${status}`"
fixed = "fce_error:'HTTP '+status"

if bad in content:
    content = content.replace(bad, fixed, 1)
elif fixed not in content:
    raise SystemExit(
        "La ligne fautive attendue est introuvable. "
        "Aucune modification effectuée."
    )

content = content.replace(
    "const SYNC_VERSION='2026.10.01-standings-32'",
    "const SYNC_VERSION='2026.10.01-standings-32-fix1'",
    1
)

path.write_text(content, encoding="utf-8")

check = subprocess.run(
    ["node", "--check", str(path)],
    text=True,
    capture_output=True
)

if check.returncode != 0:
    path.write_text(original, encoding="utf-8")
    print(check.stdout, end="")
    print(check.stderr, end="", file=sys.stderr)
    raise SystemExit(
        "Le contrôle Node a échoué : le fichier d'origine a été restauré."
    )

print("Correctif appliqué.")
print("node --check : OK")
print("Version : 2026.10.01-standings-32-fix1")

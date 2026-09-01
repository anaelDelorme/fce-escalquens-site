#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"
[[ -f .dev.vars ]] || cp .dev.vars.example .dev.vars
[[ -d node_modules ]] || npm ci
npm run build
npm run db:migrate:local
if ! grep -q 'seed_applied=true' .dev.vars; then
  npm run db:seed:local
  printf '\nseed_applied=true\n' >> .dev.vars
fi
echo "Site : http://127.0.0.1:8787"
echo "Admin : http://127.0.0.1:8787/admin/"
echo "Jeton local : valeur DEV_ADMIN_TOKEN du fichier .dev.vars"
npx wrangler dev

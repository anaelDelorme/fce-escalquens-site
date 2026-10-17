#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"
[[ -f .dev.vars ]] || cp .dev.vars.example .dev.vars
[[ -d node_modules ]] || npm ci
npm run build
npm run db:migrate:local
npm run db:migrate:orders:local
if ! grep -q 'seed_applied=true' .dev.vars; then
  echo "Importez votre catalogue local si nécessaire."
  printf '\nseed_applied=true\n' >> .dev.vars
fi
npm run db:seed:shop:local
echo "Site : http://localhost:8787"
echo "Admin : http://localhost:8787/admin/"
echo "Jeton local : valeur DEV_ADMIN_TOKEN du fichier .dev.vars"
npx wrangler dev --env local

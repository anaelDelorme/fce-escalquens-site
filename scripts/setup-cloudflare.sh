#!/usr/bin/env bash
set -euo pipefail
echo "1. Connexion Cloudflare"
npx wrangler login
echo "2. Création de D1"
npx wrangler d1 create fce-escalquens
echo "Copiez le database_id affiché dans wrangler.jsonc, puis relancez :"
echo "npm run db:migrate:remote"
echo "3. Création de R2 (si la commande indique qu'il existe déjà, continuez)"
npx wrangler r2 bucket create fce-escalquens-media || true

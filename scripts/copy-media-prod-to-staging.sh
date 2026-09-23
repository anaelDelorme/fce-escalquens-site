#!/usr/bin/env bash
set -euo pipefail

PROD_BUCKET="fce-escalquens-media"
STAGING_BUCKET="fce-escalquens-media-staging"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

SQL="
SELECT photo_key AS object_key
FROM teams
WHERE TRIM(COALESCE(photo_key,''))<>''

UNION

SELECT photo_key
FROM club_members
WHERE TRIM(COALESCE(photo_key,''))<>''

UNION

SELECT photo_key
FROM contacts
WHERE TRIM(COALESCE(photo_key,''))<>''

UNION

SELECT logo_key
FROM sponsors
WHERE TRIM(COALESCE(logo_key,''))<>''

UNION

SELECT object_key
FROM site_media
WHERE TRIM(COALESCE(object_key,''))<>''

UNION

SELECT object_key
FROM home_slides
WHERE TRIM(COALESCE(object_key,''))<>''

UNION

SELECT image_key
FROM shop_products
WHERE TRIM(COALESCE(image_key,''))<>''

UNION

SELECT catalogue_key
FROM shop_settings
WHERE TRIM(COALESCE(catalogue_key,''))<>''

UNION

SELECT rules_key
FROM tournaments
WHERE TRIM(COALESCE(rules_key,''))<>''

UNION

SELECT object_key
FROM documents
WHERE TRIM(COALESCE(object_key,''))<>'';
"

echo "Lecture des références média de production…"

npx wrangler d1 execute DB \
  --remote \
  --command "$SQL" \
  --json \
  > "$TMP/media.json"

node - "$TMP/media.json" <<'NODE' > "$TMP/keys.txt"
const fs=require('fs');

const file=process.argv[2];
const data=JSON.parse(
  fs.readFileSync(file,'utf8')
);

const keys=[
  ...new Set(
    (data?.[0]?.results||[])
      .map(row=>String(row.object_key||'').trim())
      .filter(Boolean)
  )
];

keys.sort();

for(const key of keys){
  console.log(key);
}
NODE

COUNT="$(wc -l < "$TMP/keys.txt" | tr -d ' ')"

echo "$COUNT objet(s) à copier."

INDEX=0

while IFS= read -r KEY
do
  [ -z "$KEY" ] && continue

  INDEX=$((INDEX+1))

  FILE="$TMP/object"

  echo "[$INDEX/$COUNT] $KEY"

  if ! npx wrangler r2 object get \
    "$PROD_BUCKET/$KEY" \
    --remote \
    --file "$FILE"
  then
    echo "  ⚠ absent en production"
    continue
  fi

  MIME="$(
    file -b --mime-type "$FILE" \
    || echo application/octet-stream
  )"

  npx wrangler r2 object put \
    "$STAGING_BUCKET/$KEY" \
    --remote \
    --file "$FILE" \
    --content-type "$MIME" \
    --force

done < "$TMP/keys.txt"

echo "Copie terminée."

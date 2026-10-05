-- Bibliothèque des logos et fonds du générateur Instagram.
-- Idempotent car la table peut déjà exister sur staging après un ancien essai.

CREATE TABLE IF NOT EXISTS social_visual_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK(kind IN ('team_logo','background')),
  name TEXT NOT NULL,
  aliases TEXT NOT NULL DEFAULT '',
  object_key TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_social_visual_assets_public
ON social_visual_assets(active,kind,display_order,name);

PRAGMA optimize;

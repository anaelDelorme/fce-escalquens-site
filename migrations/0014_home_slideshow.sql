-- Diaporama de la page d'accueil.
-- Migration additive : aucune donnée existante n'est supprimée.

CREATE TABLE IF NOT EXISTS home_slides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  object_key TEXT NOT NULL DEFAULT '',
  alt_text TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_home_slides_active_order
  ON home_slides(active, display_order, id);

-- Reprend l'éventuelle photo d'accueil déjà configurée comme première diapositive.
INSERT INTO home_slides (object_key, alt_text, display_order, active)
SELECT sm.object_key,
       COALESCE(NULLIF(TRIM(sm.alt_text), ''), 'Photo du FC Escalquens'),
       10,
       1
FROM site_media sm
WHERE sm.slot = 'home_collective'
  AND TRIM(COALESCE(sm.object_key, '')) <> ''
  AND NOT EXISTS (SELECT 1 FROM home_slides)
LIMIT 1;

PRAGMA optimize;

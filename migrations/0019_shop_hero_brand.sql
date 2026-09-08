-- Image de couverture de la boutique, remplaçable depuis Administration > Photos du site.
INSERT OR IGNORE INTO site_media(slot,label,fallback_path,alt_text,display_order)
VALUES (
  'shop_hero',
  'Boutique — Image de couverture',
  '/hero-foot.webp',
  'Joueuses du FC Escalquens sur le terrain',
  60
);

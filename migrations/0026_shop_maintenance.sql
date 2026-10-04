-- Mode temporaire d'attente pour la boutique.
ALTER TABLE shop_settings
ADD COLUMN shop_enabled INTEGER NOT NULL DEFAULT 1 CHECK(shop_enabled IN (0,1));

ALTER TABLE shop_settings
ADD COLUMN maintenance_image_key TEXT NOT NULL DEFAULT '';

PRAGMA optimize;

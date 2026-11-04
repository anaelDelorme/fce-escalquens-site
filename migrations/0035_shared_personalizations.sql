-- Shared definitions; order_items.options_json remains an immutable order snapshot.
CREATE TABLE shop_personalizations (
 id TEXT PRIMARY KEY,
 label TEXT NOT NULL,
 price_cents INTEGER NOT NULL DEFAULT 0 CHECK(price_cents BETWEEN 0 AND 100000),
 requires_text INTEGER NOT NULL DEFAULT 0 CHECK(requires_text IN (0,1)),
 max_length INTEGER NOT NULL DEFAULT 4 CHECK(max_length BETWEEN 1 AND 40),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 version INTEGER NOT NULL DEFAULT 1
);
INSERT INTO shop_personalizations(id,label,price_cents,requires_text,max_length)
 SELECT MIN(id),label,price_cents,requires_text,max_length FROM shop_options
 GROUP BY label,price_cents,requires_text,max_length;

CREATE TABLE shop_options_shared (
 id TEXT PRIMARY KEY,
 product_id INTEGER NOT NULL REFERENCES shop_products(id) ON DELETE CASCADE,
 personalization_id TEXT NOT NULL REFERENCES shop_personalizations(id),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 UNIQUE(product_id,personalization_id)
);
-- Keep existing selection IDs. Collapse duplicate options on the same article,
-- preferring an active ID so existing carts remain valid whenever possible.
INSERT INTO shop_options_shared(id,product_id,personalization_id,active)
 SELECT COALESCE(MIN(CASE WHEN o.active=1 THEN o.id END),MIN(o.id)),o.product_id,p.id,MAX(o.active)
 FROM shop_options o JOIN shop_personalizations p
 ON p.label=o.label AND p.price_cents=o.price_cents
 AND p.requires_text=o.requires_text AND p.max_length=o.max_length
 GROUP BY o.product_id,p.id;
DROP TABLE shop_options;
ALTER TABLE shop_options_shared RENAME TO shop_options;
CREATE INDEX shop_options_product ON shop_options(product_id,active);
CREATE INDEX shop_options_personalization ON shop_options(personalization_id,active);
ALTER TABLE shop_products ADD COLUMN personalizations_version INTEGER NOT NULL DEFAULT 1;

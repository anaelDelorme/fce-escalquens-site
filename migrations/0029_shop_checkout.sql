-- Les prix historiques libres ne sont jamais convertis automatiquement.
CREATE TABLE shop_variants (
 id TEXT PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES shop_products(id) ON DELETE CASCADE,
 label TEXT NOT NULL, size TEXT NOT NULL DEFAULT '', color TEXT NOT NULL DEFAULT '',
 sku TEXT NOT NULL, supplier TEXT NOT NULL DEFAULT 'Intersport / Kappa',
 price_cents INTEGER NOT NULL CHECK(price_cents BETWEEN 1 AND 1000000),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
);
CREATE INDEX shop_variants_product ON shop_variants(product_id,active);
CREATE TABLE shop_options (
 id TEXT PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES shop_products(id) ON DELETE CASCADE,
 label TEXT NOT NULL, price_cents INTEGER NOT NULL DEFAULT 0 CHECK(price_cents BETWEEN 0 AND 100000),
 requires_text INTEGER NOT NULL DEFAULT 0 CHECK(requires_text IN (0,1)),
 max_length INTEGER NOT NULL DEFAULT 4 CHECK(max_length BETWEEN 1 AND 40),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
);
CREATE INDEX shop_options_product ON shop_options(product_id,active);

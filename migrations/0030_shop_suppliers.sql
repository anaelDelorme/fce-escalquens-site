-- Suppliers belong to the site catalogue. Order lines keep their existing snapshots.
CREATE TABLE shop_suppliers (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL COLLATE NOCASE UNIQUE,
 contact_name TEXT NOT NULL DEFAULT '',
 email TEXT NOT NULL DEFAULT '',
 phone TEXT NOT NULL DEFAULT '',
 address TEXT NOT NULL DEFAULT '',
 notes TEXT NOT NULL DEFAULT '',
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 version INTEGER NOT NULL DEFAULT 1
);
INSERT INTO shop_suppliers(id,name)
SELECT lower(hex(randomblob(16))), TRIM(supplier)
FROM shop_variants WHERE TRIM(supplier)<>'' GROUP BY TRIM(supplier) COLLATE NOCASE;
INSERT OR IGNORE INTO shop_suppliers(id,name) VALUES('default-intersport-kappa','Intersport / Kappa');
ALTER TABLE shop_variants ADD COLUMN supplier_id TEXT REFERENCES shop_suppliers(id);
UPDATE shop_variants SET supplier_id=(SELECT id FROM shop_suppliers WHERE name=TRIM(shop_variants.supplier) COLLATE NOCASE);
CREATE INDEX shop_variants_supplier ON shop_variants(supplier_id);
-- Synchronize prices already configured before this release.
UPDATE shop_products SET price_label=COALESCE((
 SELECT (CASE WHEN MIN(price_cents)<>MAX(price_cents) THEN 'À partir de ' ELSE '' END)
 || REPLACE(printf('%.2f €',MIN(price_cents)/100.0),'.',',')
 FROM shop_variants WHERE product_id=shop_products.id AND active=1 HAVING COUNT(*)>0
),'') WHERE EXISTS(SELECT 1 FROM shop_variants WHERE product_id=shop_products.id);

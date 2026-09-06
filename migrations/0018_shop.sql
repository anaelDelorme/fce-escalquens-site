-- Boutique administrable : catégories, articles et catalogue PDF.
CREATE TABLE shop_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE shop_products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_category_id INTEGER REFERENCES shop_categories(id) ON DELETE SET NULL,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  short_description TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  price_label TEXT NOT NULL DEFAULT '',
  price_details TEXT NOT NULL DEFAULT '',
  sizes TEXT NOT NULL DEFAULT '',
  options TEXT NOT NULL DEFAULT '',
  image_key TEXT NOT NULL DEFAULT '',
  featured INTEGER NOT NULL DEFAULT 0 CHECK(featured IN (0,1)),
  highlighted INTEGER NOT NULL DEFAULT 0 CHECK(highlighted IN (0,1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE shop_settings (
  id INTEGER PRIMARY KEY CHECK(id=1),
  contact_email TEXT NOT NULL DEFAULT 'fcescalquens@gmail.com',
  catalogue_title TEXT NOT NULL DEFAULT 'Catalogue complet',
  catalogue_key TEXT NOT NULL DEFAULT '',
  order_subject TEXT NOT NULL DEFAULT 'Commande boutique FC Escalquens',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO shop_settings(id) VALUES(1);

CREATE INDEX idx_shop_categories_active_order
  ON shop_categories(active,display_order,name COLLATE NOCASE);
CREATE INDEX idx_shop_products_active_category_order
  ON shop_products(active,shop_category_id,display_order,name COLLATE NOCASE);
CREATE INDEX idx_shop_products_featured
  ON shop_products(featured,active,display_order) WHERE featured=1;

PRAGMA optimize;

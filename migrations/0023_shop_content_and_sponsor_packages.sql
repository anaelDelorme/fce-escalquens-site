-- Boutique : délai indicatif par article.
ALTER TABLE shop_products
ADD COLUMN delivery_delay TEXT NOT NULL DEFAULT '';

CREATE TABLE sponsor_packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  price_label TEXT NOT NULL DEFAULT '',
  benefits TEXT NOT NULL DEFAULT '',
  featured INTEGER NOT NULL DEFAULT 0 CHECK(featured IN (0,1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO sponsor_packages(name,price_label,benefits,featured,active,display_order) VALUES
('Partenaire associé','500 €','Mention sur nos supports
Rencontre avec l’équipe
Photo dédicacée',0,1,10),
('Partenaire premium','1 500 €','Visibilité proportionnée au don
Invitation aux événements du club
Présentation du projet soutenu sur nos supports',1,1,20),
('Partenaire majeur','3 000 €','Association à un projet structurant
Actualité consacrée au projet rendu possible par votre don
Rencontre dédiée avec le club',0,1,30),
('Coup de pouce','Libre','Don financier, matériel ou en nature
Projet construit ensemble',0,1,40);

CREATE INDEX idx_sponsor_packages_public
ON sponsor_packages(active,display_order,id);

PRAGMA optimize;

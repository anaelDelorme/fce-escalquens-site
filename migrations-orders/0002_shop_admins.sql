-- Habilitations boutique indépendantes des administrateurs du site.
-- Aucune copie automatique depuis DB.admins : aucun droit implicite.
CREATE TABLE shop_admins (
 email TEXT PRIMARY KEY COLLATE NOCASE,
 name TEXT NOT NULL DEFAULT '',
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
);

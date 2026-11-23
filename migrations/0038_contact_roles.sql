CREATE TABLE contact_roles (
  id INTEGER PRIMARY KEY,
  code TEXT UNIQUE,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(name)) > 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Les affectations ne modifient pas last_insert_rowid() pendant la création du contact.
CREATE TABLE contact_role_assignments (
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL REFERENCES contact_roles(id),
  PRIMARY KEY (contact_id, role_id)
) WITHOUT ROWID;

INSERT INTO contact_roles (code, name) VALUES
  ('responsable_mecenat', 'Responsable mécénat'),
  ('presidence', 'Présidence'),
  ('community_manager', 'Community Manager'),
  ('secretariat', 'Secrétariat'),
  ('tresorerie', 'Trésorerie'),
  ('responsable_technique', 'Responsable technique'),
  ('communication', 'Communication'),
  ('responsable_sportif', 'Responsable sportif'),
  ('responsable_boutique', 'Responsable boutique'),
  ('referent', 'Référent'),
  ('autre', 'Autre');

INSERT OR IGNORE INTO contact_roles (name)
SELECT DISTINCT trim(replace(role, '_', ' '))
FROM contacts
WHERE trim(replace(role, '_', ' ')) <> ''
  AND NOT EXISTS (SELECT 1 FROM contact_roles WHERE code = trim(contacts.role));

INSERT INTO contact_role_assignments (contact_id, role_id)
SELECT c.id, COALESCE(
  (SELECT id FROM contact_roles WHERE code = trim(c.role)),
  (SELECT id FROM contact_roles WHERE name = trim(replace(c.role, '_', ' ')))
)
FROM contacts c
WHERE trim(replace(c.role, '_', ' ')) <> '';

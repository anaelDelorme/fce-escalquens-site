CREATE TABLE recruitment_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  title TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'players',
  target TEXT NOT NULL DEFAULT '',

  summary TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  profile TEXT NOT NULL DEFAULT '',
  commitment TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',

  status TEXT NOT NULL DEFAULT 'open'
    CHECK(status IN ('new','open','soon','filled','paused')),

  contact_name TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL DEFAULT '',
  contact_phone TEXT NOT NULL DEFAULT '',
  apply_url TEXT NOT NULL DEFAULT '',

  image_key TEXT NOT NULL DEFAULT '',

  display_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
    CHECK(active IN (0,1)),

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_recruitment_public
ON recruitment_posts(active,status,display_order,id);

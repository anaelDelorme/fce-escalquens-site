-- Short home announcements, stored only in the site database.
CREATE TABLE news (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 create_key TEXT NOT NULL UNIQUE,
 request_hash TEXT NOT NULL,
 title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
 body TEXT NOT NULL DEFAULT '',
 image_key TEXT NOT NULL DEFAULT '',
 image_alt TEXT NOT NULL DEFAULT '',
 link_url TEXT NOT NULL DEFAULT '',
 link_label TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
 starts_at INTEGER,
 ends_at INTEGER,
 display_order INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 version INTEGER NOT NULL DEFAULT 1,
 CHECK(ends_at IS NULL OR starts_at IS NULL OR ends_at>starts_at)
);
CREATE INDEX news_public ON news(status,display_order,created_at DESC);

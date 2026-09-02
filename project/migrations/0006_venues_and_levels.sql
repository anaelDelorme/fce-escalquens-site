CREATE TABLE venues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  address TEXT NOT NULL DEFAULT '',
  latitude REAL,
  longitude REAL,
  maps_url TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE competition_levels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  short_name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE training_sessions ADD COLUMN venue_id INTEGER REFERENCES venues(id) ON DELETE SET NULL;
ALTER TABLE teams ADD COLUMN level_id INTEGER REFERENCES competition_levels(id) ON DELETE SET NULL;

INSERT OR IGNORE INTO venues(name,address)
SELECT venue,MAX(address) FROM training_sessions WHERE TRIM(venue)<>'' GROUP BY venue;
UPDATE training_sessions SET venue_id=(SELECT id FROM venues WHERE venues.name=training_sessions.venue COLLATE NOCASE LIMIT 1);
UPDATE training_sessions SET team_id=(SELECT id FROM teams WHERE teams.category=training_sessions.category LIMIT 1)
WHERE team_id IS NULL;

INSERT OR IGNORE INTO competition_levels(name,short_name)
SELECT level,level FROM teams WHERE TRIM(level)<>'' GROUP BY level;
UPDATE teams SET level_id=(SELECT id FROM competition_levels WHERE competition_levels.name=teams.level COLLATE NOCASE LIMIT 1);

CREATE INDEX idx_venues_active_order ON venues(active,display_order,name);
CREATE INDEX idx_levels_active_order ON competition_levels(active,display_order,name);

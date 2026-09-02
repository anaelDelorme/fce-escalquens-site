CREATE TABLE seasons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL UNIQUE,
  starts_on TEXT NOT NULL,
  ends_on TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO seasons(label,starts_on,ends_on,active)
VALUES('2026-2027','2026-07-01','2027-06-30',1);

ALTER TABLE matches ADD COLUMN season_id INTEGER REFERENCES seasons(id) ON DELETE SET NULL;
ALTER TABLE matches ADD COLUMN team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL;
ALTER TABLE standings ADD COLUMN season_id INTEGER REFERENCES seasons(id) ON DELETE SET NULL;
ALTER TABLE training_sessions ADD COLUMN season_id INTEGER REFERENCES seasons(id) ON DELETE SET NULL;
ALTER TABLE tournaments ADD COLUMN season_id INTEGER REFERENCES seasons(id) ON DELETE SET NULL;
ALTER TABLE matches ADD COLUMN updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE standings ADD COLUMN updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE matches SET season_id=(SELECT id FROM seasons WHERE active=1 LIMIT 1);
UPDATE standings SET season_id=(SELECT id FROM seasons WHERE active=1 LIMIT 1);
UPDATE training_sessions SET season_id=(SELECT id FROM seasons WHERE active=1 LIMIT 1);
UPDATE tournaments SET season_id=(SELECT id FROM seasons WHERE active=1 LIMIT 1);

CREATE INDEX idx_matches_team_season_date ON matches(team_id,season_id,starts_at);
CREATE INDEX idx_standings_season_phase ON standings(season_id,phase_id,position);
CREATE INDEX idx_training_season_team ON training_sessions(season_id,team_id);
CREATE INDEX idx_tournaments_season_date ON tournaments(season_id,starts_on);

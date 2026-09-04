-- Matchs joués à l'intérieur d'un plateau FAL.
-- La FFF ne communique généralement pas d'horaire pour chaque mini-match.

CREATE TABLE plateau_games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plateau_match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  source_game_id TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  home_score INTEGER,
  away_score INTEGER,
  status TEXT NOT NULL DEFAULT 'scheduled',
  home_logo_url TEXT NOT NULL DEFAULT '',
  away_logo_url TEXT NOT NULL DEFAULT '',
  raw_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(plateau_match_id,source_game_id)
);

CREATE INDEX idx_plateau_games_plateau_order
  ON plateau_games(plateau_match_id,display_order,id);

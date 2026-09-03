-- Cette migration est volontairement additive : aucune donnée existante n'est supprimée.

CREATE TABLE team_competitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  season_id INTEGER REFERENCES seasons(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  fff_team_id TEXT NOT NULL DEFAULT '',
  category_code TEXT NOT NULL DEFAULT '',
  competition_name TEXT NOT NULL DEFAULT '',
  division TEXT NOT NULL DEFAULT '',
  pool TEXT NOT NULL DEFAULT '',
  level_id INTEGER REFERENCES competition_levels(id) ON DELETE SET NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_team_competitions_fff_season
  ON team_competitions(season_id,fff_team_id) WHERE fff_team_id<>'';
CREATE INDEX idx_team_competitions_team_season
  ON team_competitions(team_id,season_id,active,display_order);

INSERT INTO team_competitions(team_id,season_id,name,fff_team_id,category_code,competition_name,level_id)
SELECT teams.id,seasons.id,teams.name,teams.fff_id,teams.category,teams.level,teams.level_id
FROM teams
LEFT JOIN seasons ON seasons.active=1
WHERE COALESCE(teams.fff_id,'')<>'';

ALTER TABLE matches ADD COLUMN competition_team_id INTEGER REFERENCES team_competitions(id) ON DELETE SET NULL;
ALTER TABLE matches ADD COLUMN venue_address TEXT NOT NULL DEFAULT '';
ALTER TABLE matches ADD COLUMN latitude REAL;
ALTER TABLE matches ADD COLUMN longitude REAL;
ALTER TABLE matches ADD COLUMN time_confirmed INTEGER NOT NULL DEFAULT 1 CHECK(time_confirmed IN (0,1));
ALTER TABLE matches ADD COLUMN manually_created INTEGER NOT NULL DEFAULT 0 CHECK(manually_created IN (0,1));

CREATE INDEX idx_matches_competition_team_date ON matches(competition_team_id,starts_at);

CREATE TABLE match_participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  club_number TEXT NOT NULL DEFAULT '',
  team_number TEXT NOT NULL DEFAULT '',
  logo_url TEXT NOT NULL DEFAULT '',
  is_club INTEGER NOT NULL DEFAULT 0 CHECK(is_club IN (0,1)),
  display_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(match_id,name,team_number)
);

CREATE INDEX idx_match_participants_match_order ON match_participants(match_id,display_order);

ALTER TABLE tournaments ADD COLUMN venue_id INTEGER REFERENCES venues(id) ON DELETE SET NULL;
ALTER TABLE tournaments ADD COLUMN tournify_url TEXT NOT NULL DEFAULT '';
ALTER TABLE tournaments ADD COLUMN organizer TEXT NOT NULL DEFAULT '';

CREATE TABLE tournament_teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  notes TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tournament_id,team_id)
);

CREATE INDEX idx_tournament_teams_tournament ON tournament_teams(tournament_id,team_id);

CREATE TABLE sponsors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  logo_key TEXT NOT NULL DEFAULT '',
  website_url TEXT NOT NULL DEFAULT '',
  tier TEXT NOT NULL DEFAULT 'partenaire',
  description TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sponsors_active_order ON sponsors(active,display_order,name);

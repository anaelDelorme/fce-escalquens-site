ALTER TABLE standings
ADD COLUMN competition_team_id INTEGER
REFERENCES team_competitions(id)
ON DELETE SET NULL;

ALTER TABLE standings
ADD COLUMN competition_name TEXT NOT NULL DEFAULT '';

ALTER TABLE standings
ADD COLUMN pool_label TEXT NOT NULL DEFAULT '';

ALTER TABLE standings
ADD COLUMN source_url TEXT NOT NULL DEFAULT '';

CREATE INDEX idx_standings_competition_team
ON standings(competition_team_id, position);

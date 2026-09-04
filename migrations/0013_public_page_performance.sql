-- Index adaptés aux lectures les plus fréquentes du site public.
-- Migration additive : aucune donnée existante n'est modifiée ou supprimée.
CREATE INDEX IF NOT EXISTS idx_teams_active_name
  ON teams(active, name COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS idx_training_team_season_active
  ON training_sessions(team_id, season_id, active, weekday, starts_at);

PRAGMA optimize;

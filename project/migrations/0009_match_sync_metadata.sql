ALTER TABLE matches ADD COLUMN event_type TEXT NOT NULL DEFAULT 'match';
ALTER TABLE matches ADD COLUMN source_url TEXT NOT NULL DEFAULT '';
ALTER TABLE matches ADD COLUMN external_updated_at TEXT;
ALTER TABLE matches ADD COLUMN home_logo_url TEXT NOT NULL DEFAULT '';
ALTER TABLE matches ADD COLUMN away_logo_url TEXT NOT NULL DEFAULT '';

CREATE INDEX idx_matches_source_date ON matches(source,starts_at);
CREATE INDEX idx_matches_season_status_date ON matches(season_id,status,starts_at);

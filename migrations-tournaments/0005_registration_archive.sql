ALTER TABLE tournament_registrations ADD COLUMN archived_at INTEGER;
ALTER TABLE tournament_registrations ADD COLUMN archived_by TEXT NOT NULL DEFAULT '';
CREATE INDEX registrations_visible ON tournament_registrations(tournament_id,archived_at);

-- One registration per club and tournament; existing registrations represent one team.
ALTER TABLE tournament_registrations ADD COLUMN team_count INTEGER NOT NULL DEFAULT 1 CHECK(team_count BETWEEN 1 AND 100);
ALTER TABLE tournament_registrations ADD COLUMN sections_json TEXT NOT NULL DEFAULT '[]';

-- Remember acquired scores even if an administrator later clears a score field.
-- Manual corrections remain possible; automated imports respect this lock.
ALTER TABLE matches ADD COLUMN score_locked_at TEXT;
ALTER TABLE plateau_games ADD COLUMN score_locked_at TEXT;

UPDATE matches SET score_locked_at=CURRENT_TIMESTAMP
WHERE home_score IS NOT NULL OR away_score IS NOT NULL;
UPDATE plateau_games SET score_locked_at=CURRENT_TIMESTAMP
WHERE home_score IS NOT NULL OR away_score IS NOT NULL;

CREATE TRIGGER matches_lock_score_insert AFTER INSERT ON matches
WHEN NEW.home_score IS NOT NULL OR NEW.away_score IS NOT NULL
BEGIN
  UPDATE matches SET score_locked_at=COALESCE(NEW.score_locked_at,CURRENT_TIMESTAMP) WHERE id=NEW.id;
END;
CREATE TRIGGER matches_lock_score_update AFTER UPDATE OF home_score,away_score ON matches
WHEN OLD.score_locked_at IS NOT NULL OR OLD.home_score IS NOT NULL OR OLD.away_score IS NOT NULL
  OR NEW.home_score IS NOT NULL OR NEW.away_score IS NOT NULL
BEGIN
  UPDATE matches SET score_locked_at=COALESCE(OLD.score_locked_at,NEW.score_locked_at,CURRENT_TIMESTAMP) WHERE id=NEW.id;
END;
CREATE TRIGGER plateau_games_lock_score_insert AFTER INSERT ON plateau_games
WHEN NEW.home_score IS NOT NULL OR NEW.away_score IS NOT NULL
BEGIN
  UPDATE plateau_games SET score_locked_at=COALESCE(NEW.score_locked_at,CURRENT_TIMESTAMP) WHERE id=NEW.id;
END;
CREATE TRIGGER plateau_games_lock_score_update AFTER UPDATE OF home_score,away_score ON plateau_games
WHEN OLD.score_locked_at IS NOT NULL OR OLD.home_score IS NOT NULL OR OLD.away_score IS NOT NULL
  OR NEW.home_score IS NOT NULL OR NEW.away_score IS NOT NULL
BEGIN
  UPDATE plateau_games SET score_locked_at=COALESCE(OLD.score_locked_at,NEW.score_locked_at,CURRENT_TIMESTAMP) WHERE id=NEW.id;
END;

-- Fusionne les doublons historiques d'un même plateau. On tient compte du
-- terrain afin de ne pas fusionner deux groupes de la même catégorie jouant
-- simultanément sur deux sites différents.

DROP TABLE IF EXISTS plateau_duplicate_map_cleanup;

CREATE TABLE plateau_duplicate_map_cleanup AS
SELECT id AS duplicate_id,
  MAX(id) OVER (
    PARTITION BY source,starts_at,LOWER(TRIM(category)),LOWER(TRIM(competition)),LOWER(TRIM(venue))
  ) AS keep_id
FROM matches
WHERE source='district_fal' AND event_type IN ('plateau','animation');

INSERT OR IGNORE INTO match_participants(
  match_id,name,club_number,team_number,logo_url,is_club,display_order
)
SELECT map.keep_id,p.name,p.club_number,p.team_number,p.logo_url,p.is_club,p.display_order
FROM match_participants p
JOIN plateau_duplicate_map_cleanup map ON map.duplicate_id=p.match_id
WHERE map.duplicate_id<>map.keep_id;

INSERT OR IGNORE INTO plateau_games(
  plateau_match_id,source_game_id,display_order,home_team,away_team,
  home_score,away_score,status,home_logo_url,away_logo_url,raw_json,updated_at
)
SELECT map.keep_id,g.source_game_id,g.display_order,g.home_team,g.away_team,
  g.home_score,g.away_score,g.status,g.home_logo_url,g.away_logo_url,g.raw_json,g.updated_at
FROM plateau_games g
JOIN plateau_duplicate_map_cleanup map ON map.duplicate_id=g.plateau_match_id
WHERE map.duplicate_id<>map.keep_id;

DELETE FROM matches
WHERE id IN (
  SELECT duplicate_id FROM plateau_duplicate_map_cleanup WHERE duplicate_id<>keep_id
);

DROP TABLE plateau_duplicate_map_cleanup;

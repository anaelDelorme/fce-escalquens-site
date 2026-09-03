-- Les équipes engagées sont découvertes par la synchronisation FFF puis
-- affectées manuellement à un groupe sportif. Aucune donnée n'est supprimée.

ALTER TABLE team_competitions ADD COLUMN team_number TEXT NOT NULL DEFAULT '';
ALTER TABLE team_competitions ADD COLUMN discovered_automatically INTEGER NOT NULL DEFAULT 0 CHECK(discovered_automatically IN (0,1));
ALTER TABLE team_competitions ADD COLUMN last_seen_at TEXT NOT NULL DEFAULT '';

-- Groupe technique invisible sur le site public. Il permet de conserver une
-- équipe FFF encore non affectée malgré la contrainte historique team_id.
INSERT OR IGNORE INTO teams(
  slug,name,category,group_name,level,gender,fff_id,photo_key,description,
  display_order,active
) VALUES(
  'fff-equipes-a-affecter','Équipes FFF à affecter','Import FFF','Administration',
  '','mixed',NULL,NULL,'Groupe technique invisible sur le site public.',9999,0
);

CREATE INDEX idx_team_competitions_assignment
  ON team_competitions(team_id,season_id,active,last_seen_at);

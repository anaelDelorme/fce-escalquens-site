CREATE TABLE club_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  license_number TEXT NOT NULL DEFAULT '',
  photo_key TEXT,
  notes TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE team_staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES club_members(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('coach_referent','coach','dirigeant','arbitre')),
  display_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(team_id,member_id,role)
);

CREATE INDEX idx_team_staff_team ON team_staff(team_id,active,display_order);
CREATE INDEX idx_team_staff_member ON team_staff(member_id,active);

-- Reprise des anciennes données si elles ont déjà été renseignées.
INSERT INTO club_members(full_name,email,phone)
SELECT coach_name,MAX(coach_email),MAX(coach_phone) FROM teams
WHERE TRIM(coach_name)<>'' GROUP BY coach_name;
INSERT OR IGNORE INTO team_staff(team_id,member_id,role)
SELECT teams.id,club_members.id,'coach_referent' FROM teams
JOIN club_members ON club_members.full_name=teams.coach_name
WHERE TRIM(teams.coach_name)<>'';
INSERT INTO club_members(full_name,email,phone)
SELECT manager_name,MAX(manager_email),MAX(manager_phone) FROM teams
WHERE TRIM(manager_name)<>'' AND manager_name NOT IN (SELECT full_name FROM club_members)
GROUP BY manager_name;
INSERT OR IGNORE INTO team_staff(team_id,member_id,role)
SELECT teams.id,club_members.id,'dirigeant' FROM teams
JOIN club_members ON club_members.full_name=teams.manager_name
WHERE TRIM(teams.manager_name)<>'';

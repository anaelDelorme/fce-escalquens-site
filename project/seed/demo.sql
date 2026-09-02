INSERT INTO competition_levels(name,short_name,display_order) VALUES
('Football d’animation','Animation',10),('Plateaux','Plateaux',20),('District','District',30),('Départemental','Départemental',40),('D1','D1',50),('D2','D2',60),('D3','D3',70),('Loisirs','Loisirs',80);
INSERT INTO venues(name,address,display_order) VALUES
('Stade municipal','Escalquens',10),('Complexe sportif','Escalquens',20);
INSERT INTO teams(slug,name,category,group_name,level,gender,display_order) VALUES
('u6-u7','U6 - U7','U7','Académie','Plateaux','mixed',10),('u8-u9','U8 - U9','U9','Académie','Plateaux','mixed',20),('u10','U10','U10','Académie','District','mixed',30),('u11','U11','U11','Académie','D1','mixed',40),('u12','U12','U12','Formation','D1','mixed',50),('u13','U13','U13','Formation','D1','mixed',60),('u13f','U13 Féminines','U13F','Féminines','District','female',70),('u15','U15','U15','Formation','District','male',80),('u15f','U15 Féminines','U15F','Féminines','District','female',90),('u17','U17','U17','Formation','District','male',100),('u18f','U18 Féminines','U18F','Féminines','District','female',110),('seniors-f','Seniors Féminines','Seniors F','Féminines','District','female',120),('seniors-1','Seniors 1','Seniors','Seniors','Départemental','male',130),('seniors-2','Seniors 2','Seniors','Seniors','Départemental','male',140),('loisirs','Loisirs','Loisirs','Seniors','Football loisir','mixed',150);
UPDATE teams SET level_id=(SELECT id FROM competition_levels WHERE competition_levels.name=teams.level LIMIT 1);
UPDATE teams SET coach_name='Gaétan Caulet',manager_name='Philippe Bezes',player_count=18,description='Une équipe ambitieuse, solidaire et heureuse de progresser ensemble.',photo_key='demo/team-u13f.jpg' WHERE slug='u13f';
UPDATE teams SET coach_name='Éducateur référent',manager_name='Dirigeant référent',player_count=20,description='Apprendre, jouer et grandir dans le respect du jeu et des autres.' WHERE player_count=0;
INSERT INTO club_members(full_name,email,phone,license_number) VALUES
('Gaétan Caulet','mamour2007@gmail.com','06 85 65 38 39',''),
('Philippe Bezes','philippebezes@hotmail.fr','06 31 46 37 17','');
INSERT INTO team_staff(team_id,member_id,role,display_order)
SELECT teams.id,club_members.id,'coach_referent',10 FROM teams,club_members WHERE teams.slug='u13f' AND club_members.full_name='Gaétan Caulet';
INSERT INTO team_staff(team_id,member_id,role,display_order)
SELECT teams.id,club_members.id,'dirigeant',20 FROM teams,club_members WHERE teams.slug='u13f' AND club_members.full_name='Philippe Bezes';
INSERT INTO training_sessions(category,weekday,starts_at,ends_at,venue,address) VALUES ('U9',3,'14:00','16:00','Stade municipal','Escalquens'),('U15F',1,'18:30','20:00','Stade municipal','Escalquens'),('Seniors',4,'19:30','21:30','Complexe sportif','Escalquens');
UPDATE training_sessions SET venue_id=(SELECT id FROM venues WHERE venues.name=training_sessions.venue LIMIT 1);
UPDATE training_sessions SET team_id=(SELECT id FROM teams WHERE teams.category=training_sessions.category LIMIT 1);
INSERT INTO contacts(name,role,category,email,phone,display_order) VALUES ('Accueil du club','Renseignements généraux','club','fcescalquens@gmail.com','',10),('Responsable école de foot','U7 à U13','école de foot','fcescalquens@gmail.com','',20),('Gaétan Caulet','Responsable section féminine','féminines','mamour2007@gmail.com','06 85 65 38 39',30),('Philippe Bezes','Responsable U13F','féminines','philippebezes@hotmail.fr','06 31 46 37 17',50);
INSERT INTO tournaments(slug,name,summary,starts_on,venue,categories,status) VALUES ('pitchouns','Tournoi des Pitchouns','Le rendez-vous des jeunes au stade municipal.','2027-06-14','Stade municipal','["U7","U9","U11","U13"]','published');
INSERT INTO matches(source,source_id,category,competition,starts_at,venue,home_team,away_team,status) VALUES ('manual','demo-1','U15F','District','2027-09-06T10:30:00+02:00','Stade municipal','FC Escalquens','US Labège','scheduled');

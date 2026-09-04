-- Photos éditoriales remplaçables depuis l'administration.
CREATE TABLE site_media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slot TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  fallback_path TEXT NOT NULL DEFAULT '',
  object_key TEXT NOT NULL DEFAULT '',
  alt_text TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO site_media(slot,label,fallback_path,alt_text,display_order) VALUES
  ('home_collective','Accueil — Le foot pour tous','/equipe-collectif.webp','Une équipe du FC Escalquens réunie en cercle avant le match',10),
  ('home_story','Accueil — Un terrain, des histoires','/action-foot.webp','Une joueuse du FC Escalquens dispute le ballon en match',20),
  ('sponsor_hero','Mécénat — Image principale','/mecenat-equipe.webp','Les joueuses du FC Escalquens réunies lors d’un tournoi',30),
  ('sponsor_project','Mécénat — Projet à soutenir','/equipe-collectif.webp','Une équipe du club réunie',40),
  ('team_default','Équipes — Photo par défaut','/team-default.webp','Photo du groupe',50);


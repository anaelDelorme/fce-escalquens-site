-- Page « Qui nous sommes ? » éditable depuis l'administration.
CREATE TABLE about_sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section_key TEXT NOT NULL UNIQUE,
  eyebrow TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  image_key TEXT NOT NULL DEFAULT '',
  image_alt TEXT NOT NULL DEFAULT '',
  layout TEXT NOT NULL DEFAULT 'feature'
    CHECK(layout IN ('hero','heading','timeline','feature','people')),
  display_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_about_sections_public
ON about_sections(active,display_order,id);

INSERT INTO about_sections(
  section_key,eyebrow,title,body,image_key,image_alt,layout,display_order,active
) VALUES
(
  'hero',
  'Le club',
  'L’histoire et l’esprit du FC Escalquens',
  'Bienvenue sur la page officielle du Football Club Escalquens (FCE). Ancré au cœur du Lauragais, notre club est avant tout une aventure humaine guidée par des valeurs immuables : la passion du jeu, l’esprit de famille, l’excellence de la formation et le partage territorial.',
  '',
  'Le FC Escalquens, son histoire et ses valeurs',
  'hero',
  10,
  1
),
(
  'history-heading',
  'Notre histoire',
  'Une chaîne de passionnés',
  'Le FCE d''aujourd''hui est le fruit de l''engagement de dirigeants exceptionnels qui se sont passés le relais au fil des décennies.',
  '',
  '',
  'heading',
  20,
  1
),
(
  'union',
  'Avant 2002',
  'L’époque de l’union',
  'L’ADN du football à Escalquens s''est d''abord forgé à travers une alliance majeure. Pendant de longues années, notre commune a partagé son destin footballistique avec la ville voisine au sein du Club Labège-Escalquens Football. Menée par des figures comme Jacky Conchou, cette union a porté le football local jusqu’au niveau national (CFA2 en 2004), ancrant définitivement la culture du ballon rond sur notre territoire.',
  '',
  'Archives du football à Escalquens',
  'timeline',
  30,
  1
),
(
  'renouveau',
  'Juillet 2002',
  'Les pionniers et le renouveau',
  'En juillet 2002, une page se tourne avec la cession entre les deux entités et le retour à une identité purement escalquenoise. Pierre Couderc et Philippe Sazy signent les statuts en préfecture le 15 juillet 2002 pour rebâtir une structure indépendante et saine centrée sur la jeunesse.\n\n• L’ère Couailles : porté par Mme Couailles et son mari Jean-Claude Couailles, le club pose ses premières fondations modernes.\n• Philippe Vervier : il reprend ensuite le flambeau de la présidence, structure l’association et accompagne la forte croissance du nombre de licenciés.\n• Hervé Poulain : il prend la tête du FCE pour un mandat de près de dix ans, devenant le visage et l’âme bienveillante du club.',
  '',
  'Les dirigeants qui ont construit le FC Escalquens',
  'timeline',
  40,
  1
),
(
  'relay-2020',
  'Mai 2020',
  'Le relais historique du printemps 2020',
  'En mai 2020, en plein cœur du premier confinement lié au Covid-19, le FCE est frappé par le décès brutal de son président Hervé Poulain. Les restrictions sanitaires interdisant l''accès aux salles municipales, c’est lors d''une réunion mémorable et improvisée dans le garage de Philippe Sazy que ce dernier, aux côtés de Pierre Couderc, accepte de reprendre la direction au pied levé. Ce geste de fidélité absolue a permis de protéger le club et d''assurer la continuité de l''aventure.',
  '',
  'Transmission et continuité au FC Escalquens',
  'timeline',
  50,
  1
),
(
  'today-heading',
  'Aujourd’hui',
  'Un rayonnement territorial et moderne',
  'Aujourd''hui, sous la co-présidence de ces figures historiques, le FC Escalquens s''impose comme une structure moderne et dynamique, forte de ses écoles de foot labellisées (Espoir & Argent) par la FFF.',
  '',
  '',
  'heading',
  60,
  1
),
(
  'territory',
  'Notre territoire',
  'Un grand terrain de jeu intercommunal',
  'Si le cœur du club bat sur nos deux terrains d''Escalquens, le FCE rayonne bien au-delà de ses frontières grâce à un soutien unique et des partenariats solides avec les communes voisines de Belberaud, Montlaur, Auzielle et Labège. Grâce à cette synergie, nos jeunes joueurs ont la chance de pouvoir s''entraîner et s''épanouir sur l''ensemble de ces complexes sportifs locaux.',
  '',
  'Les terrains et communes partenaires du FC Escalquens',
  'feature',
  70,
  1
),
(
  'youth-partnerships',
  'Nos jeunes',
  'La force des ententes',
  'Pour offrir le meilleur niveau de compétition et garantir à chaque enfant un temps de jeu optimal, le FCE s''associe intelligemment avec les clubs voisins.\n\n• Pôle Masculin (U15) : une entente forte avec le club d''Auzielle permet à nos jeunes de s''accomplir pleinement à une période charnière de leur pré-formation.\n• Pôle Féminin (U13F & U18F) : clin d’œil de l''histoire, le FCE a mis en place une entente avec Labège pour propulser ses équipes de foot à 8 et foot à 11 féminin vers les sommets départementaux.',
  '',
  'Les ententes du FC Escalquens pour les jeunes',
  'feature',
  80,
  1
),
(
  'technical-direction',
  'Direction technique',
  'Tournée vers l’avenir',
  'Cette double dynamique est orchestrée au quotidien sur le terrain par nos responsables techniques actuels.\n\n• Benoît Banières — Responsable de l’École de Foot Garçons : il perpétue l’exigence de la formation masculine, veillant à ce que chaque catégorie, des U6 aux équipes séniors, progresse dans le plaisir du jeu et du collectif.\n• Gaëtan Caulet — Responsable de l’École de Foot Filles : il pilote le pôle féminin en pleine expansion, des U11F aux U18F, faisant du FCE une terre d’accueil incontournable pour le football féminin de notre secteur.',
  '',
  'La direction technique du FC Escalquens',
  'people',
  90,
  1
);

PRAGMA optimize;

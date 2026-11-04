Le séparateur de la section « À la une » touchait le bloc d’accueil de la boutique. Un espace de 28 à 48 px est ajouté avant la ligne, avec actualisation de la version du CSS pour les navigateurs déjà ouverts.

Le suivi administratif affiche désormais un seul tournoi à la fois. Le sélecteur reste visible en haut ; il n’existe plus de vue « Tous les tournois ». Le tournoi sélectionné est conservé dans l’URL. Les inscriptions, effectifs par catégorie, compteurs, fiches et exports CSV restent dans ce contexte ; effacer les filtres ne change pas de tournoi. Les liens directs vers une inscription ouvrent le tournoi correspondant.

Le filtrage est effectué dans SQL avant la limite de 500 inscriptions, par identifiant du tournoi. Deux tournois de même nom restent distincts. Les tournois sans inscription et les inscriptions historiques dont la configuration a été retirée restent accessibles.

Validation : 194 tests, TypeScript, build et contrôle visuel mobile/ordinateur. Tests dédiés au filtrage avant la limite, aux noms identiques, aux archives, aux liens directs et à l’export d’un seul tournoi. Aucun changement des données de production.

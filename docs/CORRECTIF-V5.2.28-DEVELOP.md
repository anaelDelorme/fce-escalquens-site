# V5.2.28 — Le vestiaire interactif et l’article à la une

À appliquer sur **develop après la V5.2.27**. Aucun changement de base, de prix, de paiement ou de configuration. Aucune migration.

## Ce qui change

### Boutique 5 : une nouvelle expérience de navigation

La précédente composition de cartes décalées est remplacée par **Le vestiaire FCE** :

- Une entrée compacte avec signature du club, suivie directement du catalogue.
- Un seul article au premier plan, avec une grande scène visuelle, son nom, ses vrais tarifs et ses commandes habituelles.
- Un sélecteur de miniatures à droite sur ordinateur, au-dessus de la scène sur téléphone.
- Un compteur, la catégorie de l’article et des boutons précédent/suivant. Pas de défilement automatique ni de capture de la molette de la page.
- Un bouton **Vue d’ensemble** pour afficher tous les résultats, puis **Vue immersive** pour revenir à l’article sélectionné.
- Recherche et filtres conservés : l’article sélectionné reste affiché s’il correspond ; sinon, le premier résultat prend sa place. Aucun résultat conserve le message et la remise à zéro des filtres existants.
- Miniatures utilisables au clavier : flèches, Début/Fin ; annonce du nom de l’article et de sa position pour les lecteurs d’écran. Le focus ne saute pas lors des changements de sélection.

La scène utilise les cartes et boutons réels de la boutique, sans copie du formulaire ou des règles de prix. Le zoom photo et les fenêtres de choix de taille/personnalisation restent disponibles. Les couleurs des photos sont préservées. Les miniatures dont l’image échoue utilisent le logo du club.

La nouvelle feuille de style `shop-studio.css` est chargée uniquement sur boutique-5. Le script s’active uniquement sur cette version. Si le script spécifique ne s’initialise pas, les cartes habituelles restent accessibles.

### Boutique principale : À la une

La section adopte une composition plus attractive : titre de section compact, grand visuel sur fond crème et or avec cercles graphiques discrets, ombre du produit, panneau de texte ivoire et repère jaune. Le nom de l’article utilise une typographie plus lisible, le prix gagne en présence et le bouton de commande est arrondi. Le visuel reste cliquable pour zoomer.

Cette retouche est limitée à `/boutique/`. Les boutiques 2, 3 et 4 conservent leur présentation.

## Installer sur develop

Enregistrer le travail en cours. Vérifier que develop contient déjà la V5.2.27, puis placer le patch à la racine du dépôt :

```bash
git switch develop
git status
git apply --check fce-correctif-v5.2.28.patch
git apply fce-correctif-v5.2.28.patch
npm test
npm run typecheck:shop
npm run build
```

Après vérification :

```bash
git add public/shop-presentations.css public/shop-studio.css public/shop-studio.js src/components/ShopStorefront.astro src/scripts/shop-entry.js tests/shop-studio.test.ts docs/CORRECTIF-V5.2.28-DEVELOP.md
git commit -m "Refond boutique-5 en vestiaire interactif et améliore l’article à la une"
git push origin develop
```

Le workflow existant ne publie pas develop. Promouvoir ensuite les changements vers staging par votre procédure habituelle pour les tester sur le Worker sandbox. Ce correctif ne modifie pas les workflows.

## Recette après déploiement

1. Sur `/boutique/`, vérifier le nouvel article à la une : nom long, prix fixe ou fourchette, prix catalogue facultatif, choix et zoom. Tester ordinateur et téléphone.
2. Sur `/boutique-5/`, parcourir par miniatures et précédent/suivant. Vérifier les extrémités, les prix et les articles sans photo ou indisponibles à la commande.
3. Filtrer, rechercher, provoquer zéro résultat, puis réinitialiser. Vérifier le compteur et l’article affiché.
4. Tester Vue d’ensemble et Vue immersive, ainsi que le clavier sur les miniatures.
5. Ajouter un article après sélection de sa taille/personnalisation ; vérifier le même panier depuis les autres présentations.
6. Sur téléphone, vérifier la rangée de miniatures, le passage image/fiche en colonne et l’absence de débordement horizontal de la page.
7. Vérifier la fermeture de la boutique via son image d’attente et les erreurs de chargement existantes.

Boutique-5 reste hors du menu public et du sitemap, avec `noindex,nofollow` et la canonique de la boutique principale. Accessible par son URL, elle utilise le catalogue et l’environnement de paiement réels du Worker : faire les essais de commande en staging sandbox.

Les interactions du vestiaire sont couvertes par des tests DOM : navigation, clavier, filtres, aucun résultat, vue d’ensemble, réinitialisation et isolation des autres boutiques. Validation : 153 tests passent, TypeScript et build Astro validés. La recette visuelle sur vos appareils reste à réaliser ; aucun push ou déploiement n’a été effectué pour cette livraison.
